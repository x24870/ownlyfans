import { useState, useEffect } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { readFileFromWalrus, createWalrusClient } from "../utils/walrusHelpers";
import { network } from "../utils/suiClient";
import {
  purchaseContentTransaction,
  getAllContents,
  hasUserPurchased,
  hasContentAccess,
  subscribeCreatorTransaction,
  getSubscription,
  getCreatorByOwner,
  buildSealApproveTransaction,
} from "../utils/contract";
import {
  decryptWithSeal,
  getOrCreateSessionKey,
  encodeSealIdentityFromAddress,
} from "../utils/sealHelpers";
import type { PersonalMessageSigner } from "../utils/sealHelpers";

interface ContentItem {
  contentId: string;
  blobId: string;
  price: bigint;
  creator: string;
  creatorId: string;
  allowlistId: string;
  sealSuffix: number[];
  purchased: boolean;
  hasAccess: boolean;
}

export default function FanDashboard() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingContents, setLoadingContents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [viewingContent, setViewingContent] = useState<string | null>(null);
  const [contentUrl, setContentUrl] = useState<string | null>(null);

  // Track subscriptions by creator ID
  // 按創作者 ID 跟踪訂閱
  const [subscriptions, setSubscriptions] = useState<Map<string, any>>(
    new Map()
  );
  const [creators, setCreators] = useState<Map<string, any>>(new Map());

  // Get referral address from URL
  // 從 URL 獲取推廣地址
  const getReferralAddress = (): string | null => {
    const params = new URLSearchParams(window.location.search);
    return params.get("ref");
  };
  const referralAddress = getReferralAddress();

  // Load all contents when component mounts or account changes
  // 當組件載入或賬戶變更時載入所有內容
  useEffect(() => {
    loadAllContents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const loadAllContents = async () => {
    setLoadingContents(true);
    setError(null);

    try {
      const allContents = await getAllContents();

      // Load unique creators and subscriptions
      // 載入唯一的創作者和訂閱
      const uniqueCreators = new Set<string>();
      allContents.forEach((content: any) => {
        if (content.creator) {
          uniqueCreators.add(content.creator);
        }
      });

      // Fetch creator info and subscriptions
      // 獲取創作者信息和訂閱
      const newCreators = new Map();
      const newSubscriptions = new Map();

      for (const creatorAddr of uniqueCreators) {
        try {
          const creator = await getCreatorByOwner(creatorAddr);
          if (creator) {
            const creatorId = creator.data?.objectId;
            newCreators.set(creatorAddr, creator);

            if (account && creatorId) {
              const sub = await getSubscription(creatorId, account.address);
              if (sub) {
                newSubscriptions.set(creatorId, sub);
              }
            }
          }
        } catch (e) {
          console.warn(`Failed to fetch creator ${creatorAddr}:`, e);
        }
      }

      setCreators(newCreators);
      setSubscriptions(newSubscriptions);

      // Check access status for each content if user is connected
      // 如果用戶已連接，檢查每個內容的訪問狀態
      const contentsWithStatus: ContentItem[] = await Promise.all(
        allContents.map(async (content: any) => {
          let purchased = false;
          let hasAccess = false;

          if (account) {
            purchased = await hasUserPurchased(
              content.contentId,
              account.address
            );
            hasAccess = await hasContentAccess(
              content.contentId,
              account.address
            );
          }

          // Decode blob_id
          let blobId = "";
          if (content.blobId) {
            try {
              if (Array.isArray(content.blobId)) {
                blobId = new TextDecoder().decode(
                  new Uint8Array(content.blobId)
                );
              } else if (typeof content.blobId === "string") {
                blobId = content.blobId;
              } else {
                blobId = new TextDecoder().decode(
                  new Uint8Array(Object.values(content.blobId))
                );
              }
            } catch (e) {
              console.error("Error decoding blob_id:", e);
              blobId = content.blobId?.toString() || "";
            }
          }

          return {
            contentId: content.contentId,
            blobId: blobId,
            price: BigInt(content.price || 0),
            creator: content.creator || "",
            creatorId: content.creatorId || "",
            allowlistId: content.allowlistId || "",
            sealSuffix: content.sealSuffix || [],
            purchased,
            hasAccess,
          };
        })
      );

      // Contents are already sorted by event timestamp (newest first)
      // 內容已按事件時間戳排序（最新的在前）

      setContents(contentsWithStatus);
    } catch (err) {
      console.error("Error loading contents:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load contents / 載入內容失敗"
      );
    } finally {
      setLoadingContents(false);
    }
  };

  const handlePurchase = async (contentId: string, price: bigint) => {
    if (!account) {
      setError("Please connect your wallet first / 請先連接您的錢包");
      return;
    }

    setPurchasing(contentId);
    setError(null);

    try {
      const tx = await purchaseContentTransaction({
        contentId,
        price,
        referralAddress,
      });

      signAndExecute(
        {
          transaction: tx as any,
        },
        {
          onSuccess: async () => {
            // Reload contents to update purchase status
            // 重新載入內容以更新購買狀態
            await loadAllContents();
            setPurchasing(null);

            // Generate referral link
            // 生成推廣連結
            const referralLink = `${window.location.origin}${window.location.pathname}?ref=${account.address}`;
            alert(`Purchase successful! Your referral link: ${referralLink}`);
          },
          onError: (error) => {
            setError(error.message || "Purchase failed / 購買失敗");
            setPurchasing(null);
          },
        }
      );
    } catch (err) {
      console.error("Purchase error:", err);
      setError(
        err instanceof Error ? err.message : "Purchase failed / 購買失敗"
      );
      setPurchasing(null);
    }
  };

  const handleSubscribe = async (creatorAddr: string, creatorId: string) => {
    if (!account) {
      setError("Please connect your wallet first / 請先連接您的錢包");
      return;
    }

    setSubscribing(creatorId);
    setError(null);

    try {
      const creator = creators.get(creatorAddr);
      const subscriptionPrice = BigInt(
        (creator?.data?.content?.fields as any)?.subscription_price || 0
      );

      const tx = await subscribeCreatorTransaction(
        creatorId,
        subscriptionPrice
      );

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: async () => {
            await loadAllContents();
            setSubscribing(null);
            alert("Subscription successful! / 訂閱成功！");
          },
          onError: (error) => {
            setError(error.message || "Subscription failed / 訂閱失敗");
            setSubscribing(null);
          },
        }
      );
    } catch (err) {
      console.error("Subscribe error:", err);
      setError(
        err instanceof Error ? err.message : "Subscription failed / 訂閱失敗"
      );
      setSubscribing(null);
    }
  };

  const handleViewContent = async (
    contentId: string,
    blobId: string,
    creatorAddr: string,
    sealSuffix: number[],
    creatorId: string,
    allowlistId: string
  ) => {
    if (!account) {
      setError("Please connect your wallet first / 請先連接您的錢包");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch encrypted blob from Walrus
      // 從 Walrus 獲取加密的 blob
      const walrusClient = createWalrusClient();
      const encryptedBytes = await readFileFromWalrus(
        walrusClient,
        blobId,
        network
      );

      // Get or create session key for Seal
      // 獲取或創建 Seal 的 session key
      const signer: PersonalMessageSigner = async (message) => {
        return new Promise<string>((resolve, reject) => {
          signAndExecute(
            {
              transaction: { kind: "PersonalMessage", message } as any,
            },
            {
              onSuccess: (result: any) => {
                resolve(result.signature || "");
              },
              onError: (error) => {
                reject(error);
              },
            }
          );
        });
      };

      const sessionKey = await getOrCreateSessionKey(account.address, signer);

      // Find or create a dummy subscription ID if user doesn't have one
      // 如果用戶沒有訂閱，則查找或創建虛擬訂閱 ID
      let subscriptionId =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
      if (creatorId) {
        const sub = await getSubscription(creatorId, account.address);
        if (sub?.data?.objectId) {
          subscriptionId = sub.data.objectId;
        }
      }

      // Build seal_approve transaction
      // 構建 seal_approve 交易
      const sealIdHex = encodeSealIdentityFromAddress(creatorAddr, sealSuffix);
      const sealIdBytes = new Uint8Array(
        sealIdHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      );

      const txBytes = await buildSealApproveTransaction(
        sealIdBytes,
        creatorId,
        contentId,
        allowlistId,
        subscriptionId
      );

      // Decrypt with Seal SDK
      // 使用 Seal SDK 解密
      const decryptedBytes = await decryptWithSeal({
        encryptedData: encryptedBytes,
        sessionKey,
        txBytes,
      });

      // Create object URL for display
      // 創建用於顯示的對象 URL
      const blob = new Blob([new Uint8Array(decryptedBytes)]);
      const url = URL.createObjectURL(blob);
      setContentUrl(url);
      setViewingContent(blobId);
    } catch (err) {
      console.error("View content error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load content / 載入內容失敗"
      );
    } finally {
      setLoading(false);
    }
  };

  const generateReferralLink = () => {
    if (!account) return "";
    return `${window.location.origin}${window.location.pathname}?ref=${account.address}`;
  };

  return (
    <div>
      <h2>Fan Dashboard / 粉絲儀表板</h2>

      {referralAddress && (
        <div
          style={{
            padding: "15px",
            background: "#e3f2fd",
            borderRadius: "4px",
            marginBottom: "20px",
          }}
        >
          <p>
            <strong>Referral Link Detected / 檢測到推廣連結</strong>
            <br />
            Referrer: <code>{referralAddress}</code>
          </p>
        </div>
      )}

      {/* Referral Link Generator */}
      {account && (
        <div
          style={{
            padding: "20px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            marginBottom: "20px",
          }}
        >
          <h3>Your Referral Link / 您的推廣連結</h3>
          <div style={{ marginBottom: "10px" }}>
            <input
              type="text"
              value={generateReferralLink()}
              readOnly
              style={{
                width: "100%",
                padding: "8px",
                fontSize: "0.9em",
                fontFamily: "monospace",
              }}
            />
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(generateReferralLink());
              alert("Referral link copied! / 推廣連結已複製！");
            }}
            style={{
              padding: "8px 16px",
              backgroundColor: "#2196F3",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Copy Link / 複製連結
          </button>
        </div>
      )}

      {/* Content List */}
      <div
        style={{
          padding: "20px",
          border: "1px solid #ccc",
          borderRadius: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "15px",
          }}
        >
          <h3>Available Content / 可用內容</h3>
          <button
            onClick={loadAllContents}
            disabled={loadingContents}
            style={{
              padding: "5px 15px",
              fontSize: "0.9em",
              backgroundColor: "#2196F3",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loadingContents ? "not-allowed" : "pointer",
            }}
          >
            {loadingContents ? "Loading... / 載入中..." : "Refresh / 刷新"}
          </button>
        </div>

        {loadingContents && contents.length === 0 ? (
          <p style={{ color: "#666" }}>Loading contents... / 載入內容中...</p>
        ) : contents.length === 0 ? (
          <p style={{ color: "#666" }}>
            No content available yet. Content will appear here after creators
            upload.
            <br />
            尚無可用內容。創作者上傳後，內容將顯示在此處。
          </p>
        ) : (
          contents.map((content) => (
            <div
              key={content.contentId}
              style={{
                padding: "15px",
                marginBottom: "10px",
                background: "#f5f5f5",
                borderRadius: "4px",
                border: "1px solid #ddd",
              }}
            >
              <p style={{ margin: "0 0 10px 0", fontWeight: "bold" }}>
                Content ID: <code>{content.contentId}</code>
              </p>
              <p
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "0.9em",
                  color: "#666",
                }}
              >
                Price: {Number(content.price) / 1e9} SUI
                <br />
                Creator: <code>{content.creator}</code>
                <br />
                {(() => {
                  const creator = creators.get(content.creator);
                  const creatorId = creator?.data?.objectId;
                  const subscriptionPrice =
                    Number(
                      (creator?.data?.content?.fields as any)
                        ?.subscription_price || 0
                    ) / 1e9;
                  const isSubscribed =
                    creatorId && subscriptions.has(creatorId);

                  return (
                    <>
                      Creator Subscription: {subscriptionPrice} SUI{" "}
                      {isSubscribed && " (✓ Subscribed / 已訂閱)"}
                    </>
                  );
                })()}
              </p>

              {/* Subscription Button */}
              {(() => {
                const creator = creators.get(content.creator);
                const creatorId = creator?.data?.objectId;
                const isSubscribed = creatorId && subscriptions.has(creatorId);

                if (!isSubscribed && creatorId && !content.hasAccess) {
                  return (
                    <button
                      onClick={() =>
                        handleSubscribe(content.creator, creatorId)
                      }
                      disabled={!account || subscribing === creatorId}
                      style={{
                        padding: "6px 12px",
                        fontSize: "0.9em",
                        backgroundColor:
                          subscribing === creatorId ? "#ccc" : "#9C27B0",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor:
                          !account || subscribing === creatorId
                            ? "not-allowed"
                            : "pointer",
                        marginBottom: "10px",
                        marginRight: "10px",
                      }}
                    >
                      {subscribing === creatorId
                        ? "Subscribing... / 訂閱中..."
                        : "Subscribe to Creator / 訂閱創作者"}
                    </button>
                  );
                }
                return null;
              })()}

              {content.hasAccess ? (
                <div>
                  <button
                    onClick={() =>
                      handleViewContent(
                        content.contentId,
                        content.blobId,
                        content.creator,
                        content.sealSuffix,
                        content.creatorId,
                        content.allowlistId
                      )
                    }
                    disabled={loading}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "#4CAF50",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: loading ? "not-allowed" : "pointer",
                      marginRight: "10px",
                    }}
                  >
                    {loading
                      ? "Loading... / 載入中..."
                      : "View Content / 查看內容"}
                  </button>
                  {content.purchased && (
                    <span style={{ fontSize: "0.9em", color: "#4CAF50" }}>
                      ✓ Purchased / 已購買
                    </span>
                  )}
                  {!content.purchased &&
                    subscriptions.has(content.creatorId) && (
                      <span style={{ fontSize: "0.9em", color: "#9C27B0" }}>
                        ✓ Access via Subscription / 通過訂閱訪問
                      </span>
                    )}
                </div>
              ) : (
                <button
                  onClick={() =>
                    handlePurchase(content.contentId, content.price)
                  }
                  disabled={!account || purchasing === content.contentId}
                  style={{
                    padding: "8px 16px",
                    backgroundColor:
                      purchasing === content.contentId ? "#ccc" : "#FF9800",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor:
                      purchasing === content.contentId
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {purchasing === content.contentId
                    ? "Purchasing... / 購買中..."
                    : `Purchase (${Number(content.price) / 1e9} SUI) / 購買`}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Content Viewer */}
      {viewingContent && contentUrl && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "white",
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            zIndex: 1000,
            maxWidth: "90%",
            maxHeight: "90%",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "10px",
            }}
          >
            <h3>Content Viewer / 內容查看器</h3>
            <button
              onClick={() => {
                setViewingContent(null);
                if (contentUrl) URL.revokeObjectURL(contentUrl);
                setContentUrl(null);
              }}
              style={{
                padding: "5px 10px",
                backgroundColor: "#f44336",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Close / 關閉
            </button>
          </div>
          <img
            src={contentUrl}
            alt="Content"
            style={{
              maxWidth: "100%",
              maxHeight: "70vh",
              objectFit: "contain",
            }}
          />
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: "15px",
            padding: "10px",
            background: "#ffebee",
            borderRadius: "4px",
            color: "#c62828",
          }}
        >
          <strong>Error / 錯誤:</strong> {error}
        </div>
      )}
    </div>
  );
}
