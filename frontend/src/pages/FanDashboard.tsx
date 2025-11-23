import { useState, useEffect } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useWallets,
} from "@mysten/dapp-kit";
import { readFileFromWalrus, createWalrusClient } from "../utils/walrusHelpers";
import { network } from "../utils/suiClient";
import {
  purchaseContentTransaction,
  hasUserPurchased,
  hasContentAccess,
  subscribeCreatorTransaction,
  getSubscription,
  getCreatorByOwner,
  buildSealApproveTransaction,
  getFanTokenAccount,
  getCreatorCampaigns,
  joinCampaignTransaction,
  hasJoinedCampaign,
  getAllCreators,
  getCreatorContents,
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
  const wallets = useWallets();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [viewingContent, setViewingContent] = useState<string | null>(null);
  const [contentUrl, setContentUrl] = useState<string | null>(null);
  const [fanTokens, setFanTokens] = useState<Map<string, any>>(new Map());
  const [campaigns, setCampaigns] = useState<Map<string, any[]>>(new Map());
  const [joiningCampaign, setJoiningCampaign] = useState<string | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  const [allCreators, setAllCreators] = useState<any[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(false);
  const [creatorContents, setCreatorContents] = useState<ContentItem[]>([]);
  const [loadingCreatorContents, setLoadingCreatorContents] = useState(false);

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
    loadAllCreators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const loadAllCreators = async () => {
    setLoadingCreators(true);
    try {
      const creators = await getAllCreators();
      setAllCreators(creators);
    } catch (error) {
      console.error("Error loading creators:", error);
      setError("Failed to load creators / 載入創作者失敗");
    } finally {
      setLoadingCreators(false);
    }
  };

  const loadCreatorContents = async (creatorAddress: string) => {
    if (!account) return;

    setLoadingCreatorContents(true);
    setError(null);

    try {
      const objects = await getCreatorContents(creatorAddress);

      // Load creator info and subscriptions
      const creator = await getCreatorByOwner(creatorAddress);
      const creatorId = creator?.data?.objectId;

      // Load campaigns
      const creatorCampaigns: any[] = await getCreatorCampaigns(creatorAddress);
      if (account) {
        for (const campaign of creatorCampaigns) {
          const joined = await hasJoinedCampaign(
            campaign.objectId,
            account.address
          );
          campaign.joined = joined;
        }
      }

      // Load subscription
      let subscription = null;
      if (account && creatorId) {
        subscription = await getSubscription(creatorId, account.address);
      }

      // Load Fan Token Account
      const fanToken = account
        ? await getFanTokenAccount(creatorAddress, account.address)
        : null;

      // Process content objects
      const contentsWithStatus: ContentItem[] = await Promise.all(
        objects.map(async (obj: any) => {
          const contentData =
            obj.content?.fields || obj.data?.content?.fields || {};
          const objectId = obj.objectId || obj.data?.objectId || "";

          let purchased = false;
          let hasAccess = false;

          if (account) {
            purchased = await hasUserPurchased(objectId, account.address);
            hasAccess = await hasContentAccess(objectId, account.address);
          }

          // Get creatorId, allowlistId, sealSuffix
          let creatorIdFromContent = contentData.creator_id || "";
          let allowlistId = contentData.allowlist_id || "";
          let sealSuffix: number[] = [];

          if (contentData.seal_suffix) {
            if (Array.isArray(contentData.seal_suffix)) {
              sealSuffix = contentData.seal_suffix;
            } else if (contentData.seal_suffix?.bytes) {
              sealSuffix = Array.from(contentData.seal_suffix.bytes);
            }
          }

          // Decode blob_id
          let blobId = "";
          if (contentData.blob_id) {
            try {
              const blobIdBytes = Array.isArray(contentData.blob_id)
                ? new Uint8Array(contentData.blob_id)
                : new Uint8Array(Object.values(contentData.blob_id));
              blobId = new TextDecoder().decode(blobIdBytes);
            } catch (e) {
              console.error("Error decoding blob_id:", e);
              blobId = contentData.blob_id?.toString() || "";
            }
          }

          return {
            contentId: objectId,
            blobId: blobId,
            price: BigInt(contentData.price || 0),
            creator: creatorAddress,
            creatorId: creatorIdFromContent,
            allowlistId,
            sealSuffix,
            purchased,
            hasAccess,
          };
        })
      );

      setCreatorContents(contentsWithStatus);
      if (creator) {
        setCreators(new Map([[creatorAddress, creator]]));
      }
      setCampaigns(new Map([[creatorAddress, creatorCampaigns]]));
      if (subscription && creatorId) {
        setSubscriptions(new Map([[creatorId, subscription]]));
      }
      if (fanToken) {
        setFanTokens(new Map([[creatorAddress, fanToken]]));
      }
    } catch (error) {
      console.error("Error loading creator contents:", error);
      setError("Failed to load creator contents / 載入創作者內容失敗");
    } finally {
      setLoadingCreatorContents(false);
    }
  };

  const handleSelectCreator = async (creatorAddress: string) => {
    setSelectedCreator(creatorAddress);
    await loadCreatorContents(creatorAddress);
  };

  const handleBackToCreators = () => {
    setSelectedCreator(null);
    setCreatorContents([]);
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
        userAddress: account.address,
      });

      signAndExecute(
        {
          transaction: tx as any,
        },
        {
          onSuccess: async () => {
            // Reload contents to update purchase status
            // 重新載入內容以更新購買狀態
            if (selectedCreator) {
              await loadCreatorContents(selectedCreator);
            }
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
        subscriptionPrice,
        account.address,
        referralAddress
      );

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: async () => {
            if (selectedCreator) {
              await loadCreatorContents(selectedCreator);
            }
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

  const handleJoinCampaign = async (
    campaignId: string,
    fanTokenAccountId: string,
    _cost: number
  ) => {
    if (!account) return;

    // Check balance locally first (though contract will check too)
    // ...

    setJoiningCampaign(campaignId);
    try {
      const tx = joinCampaignTransaction(campaignId, fanTokenAccountId);
      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: async () => {
            if (selectedCreator) {
              await loadCreatorContents(selectedCreator);
            }
            setJoiningCampaign(null);
            alert("Joined campaign successfully! / 參加活動成功！");
          },
          onError: (error) => {
            setError(error.message || "Failed to join campaign / 參加活動失敗");
            setJoiningCampaign(null);
          },
        }
      );
    } catch (err) {
      console.error("Join campaign error:", err);
      setJoiningCampaign(null);
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
        try {
          // Get the connected wallet
          // 獲取已連接的錢包
          const connectedWallet = wallets.find((w) =>
            w.accounts.some((a) => a.address === account?.address)
          );

          if (!connectedWallet || !account) {
            throw new Error("Wallet not connected / 錢包未連接");
          }

          // Sign personal message using wallet's signPersonalMessage method
          // 使用錢包的 signPersonalMessage 方法簽署個人訊息
          const walletAccount = connectedWallet.accounts.find(
            (a) => a.address === account.address
          );

          if (!walletAccount) {
            throw new Error("Account not found in wallet / 錢包中找不到帳戶");
          }

          const result = await connectedWallet.features[
            "sui:signPersonalMessage"
          ]?.signPersonalMessage({
            message: new Uint8Array(message),
            account: walletAccount,
          });

          if (!result || !result.signature) {
            throw new Error(
              "Failed to sign personal message / 簽署個人訊息失敗"
            );
          }

          // Return signature in base64 format (Seal SDK expects this)
          // 返回 base64 格式的簽名（Seal SDK 需要此格式）
          return result.signature;
        } catch (error) {
          console.error("Error signing personal message:", error);
          throw error;
        }
      };

      const sessionKey = await getOrCreateSessionKey(account.address, signer);

      // Find subscription ID if user has one
      // 如果用戶有訂閱，查找訂閱 ID
      let subscriptionId: string | null = null;
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
        subscriptionId,
        account.address
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
      <h2
        style={{
          color: "#FFFFFF",
          fontSize: "2em",
          fontWeight: "700",
          letterSpacing: "-0.02em",
          marginBottom: "30px",
        }}
      >
        Fan Dashboard / 粉絲儀表板
      </h2>

      {referralAddress && (
        <div
          className="glass-card"
          style={{
            marginBottom: "20px",
            borderColor: "rgba(52, 208, 248, 0.4)",
          }}
        >
          <p
            style={{ margin: "0 0 8px 0", color: "#FFFFFF", fontWeight: "600" }}
          >
            Referral Link Detected / 檢測到推廣連結
          </p>
          <p style={{ margin: "0", color: "#D0D0D0" }}>
            Referrer:{" "}
            <code className="monospace" style={{ color: "#00E0FF" }}>
              {referralAddress}
            </code>
          </p>
        </div>
      )}

      {/* Referral Link Generator */}
      {account && (
        <div className="glass-card" style={{ marginBottom: "20px" }}>
          <h3
            style={{ color: "#FFFFFF", marginTop: "0", marginBottom: "15px" }}
          >
            Your Referral Link / 您的推廣連結
          </h3>
          <div style={{ marginBottom: "15px" }}>
            <input
              type="text"
              value={generateReferralLink()}
              readOnly
              className="monospace"
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "0.9em",
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(52, 208, 248, 0.3)",
                borderRadius: "8px",
                color: "#00E0FF",
                outline: "none",
              }}
            />
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(generateReferralLink());
              alert("Referral link copied! / 推廣連結已複製！");
            }}
            className="gradient-button"
            style={{ padding: "10px 20px" }}
          >
            Copy Link / 複製連結
          </button>
        </div>
      )}

      {/* Creators List or Creator Content */}
      {!selectedCreator ? (
        /* Creators List View */
        <div className="glass-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <h3
              style={{
                color: "#FFFFFF",
                margin: "0",
                fontSize: "1.5em",
                fontWeight: "700",
              }}
            >
              Registered Creators / 已註冊創作者
            </h3>
            <button
              onClick={loadAllCreators}
              disabled={loadingCreators}
              className="gradient-button"
              style={{ padding: "8px 16px", fontSize: "0.9em" }}
            >
              {loadingCreators ? "Loading... / 載入中..." : "Refresh / 刷新"}
            </button>
          </div>

          {loadingCreators && allCreators.length === 0 ? (
            <p style={{ color: "#D0D0D0" }}>
              Loading creators... / 載入創作者中...
            </p>
          ) : allCreators.length === 0 ? (
            <p style={{ color: "#D0D0D0" }}>
              No creators registered yet. / 尚無已註冊的創作者。
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "20px",
              }}
            >
              {allCreators.map((creator: any) => {
                const creatorData = creator.content?.fields || {};
                const creatorId = creator.objectId;
                const owner = creatorData.owner || "";
                const subscriptionPrice =
                  Number(creatorData.subscription_price || 0) / 1e9;

                return (
                  <div
                    key={creatorId}
                    onClick={() => handleSelectCreator(owner)}
                    style={{
                      padding: "24px",
                      background: "rgba(37, 41, 52, 0.8)",
                      borderRadius: "12px",
                      border: "1px solid rgba(52, 208, 248, 0.3)",
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor =
                        "rgba(52, 208, 248, 0.6)";
                      e.currentTarget.style.background =
                        "rgba(52, 208, 248, 0.1)";
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.boxShadow =
                        "0 8px 24px rgba(163, 0, 255, 0.3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor =
                        "rgba(52, 208, 248, 0.3)";
                      e.currentTarget.style.background =
                        "rgba(37, 41, 52, 0.8)";
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 12px 0",
                        color: "#FFFFFF",
                        fontWeight: "600",
                      }}
                    >
                      Creator / 創作者
                    </h4>
                    <p
                      style={{
                        margin: "0 0 10px 0",
                        fontSize: "0.9em",
                        color: "#D0D0D0",
                        wordBreak: "break-all",
                      }}
                    >
                      <strong style={{ color: "#FFFFFF" }}>Owner:</strong>{" "}
                      <code className="monospace" style={{ color: "#00E0FF" }}>
                        {owner}
                      </code>
                    </p>
                    <p
                      style={{
                        margin: "0 0 10px 0",
                        fontSize: "0.9em",
                        color: "#D0D0D0",
                      }}
                    >
                      <strong style={{ color: "#FFFFFF" }}>
                        Subscription Price:
                      </strong>{" "}
                      <span className="data-highlight">
                        {subscriptionPrice} SUI
                      </span>
                    </p>
                    <p
                      style={{
                        margin: "0",
                        fontSize: "0.85em",
                        color: "#34D0F8",
                        fontStyle: "italic",
                      }}
                    >
                      Click to view content / 點擊查看內容 →
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Creator Content View */
        <div className="glass-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
              flexWrap: "wrap",
              gap: "15px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "15px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={handleBackToCreators}
                style={{
                  padding: "10px 20px",
                  fontSize: "0.9em",
                  background: "rgba(37, 41, 52, 0.8)",
                  color: "#FFFFFF",
                  border: "1px solid rgba(52, 208, 248, 0.3)",
                  borderRadius: "12px",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(52, 208, 248, 0.6)";
                  e.currentTarget.style.background = "rgba(52, 208, 248, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(52, 208, 248, 0.3)";
                  e.currentTarget.style.background = "rgba(37, 41, 52, 0.8)";
                }}
              >
                ← Back to Creators / 返回創作者列表
              </button>
              <h3
                style={{
                  margin: 0,
                  color: "#FFFFFF",
                  fontSize: "1.5em",
                  fontWeight: "700",
                }}
              >
                Creator Content / 創作者內容:{" "}
                <code
                  className="monospace"
                  style={{ fontSize: "0.7em", color: "#00E0FF" }}
                >
                  {selectedCreator}
                </code>
              </h3>
            </div>
            <button
              onClick={() => loadCreatorContents(selectedCreator)}
              disabled={loadingCreatorContents}
              className="gradient-button"
              style={{ padding: "8px 16px", fontSize: "0.9em" }}
            >
              {loadingCreatorContents
                ? "Loading... / 載入中..."
                : "Refresh / 刷新"}
            </button>
          </div>

          {loadingCreatorContents && creatorContents.length === 0 ? (
            <p style={{ color: "#D0D0D0" }}>
              Loading contents... / 載入內容中...
            </p>
          ) : creatorContents.length === 0 ? (
            <p style={{ color: "#D0D0D0" }}>
              No content available from this creator yet. /
              此創作者尚無可用內容。
            </p>
          ) : (
            creatorContents.map((content) => (
              <div
                key={content.contentId}
                style={{
                  padding: "20px",
                  marginBottom: "15px",
                  background: "rgba(37, 41, 52, 0.6)",
                  borderRadius: "12px",
                  border: "1px solid rgba(52, 208, 248, 0.2)",
                }}
              >
                <p
                  style={{
                    margin: "0 0 12px 0",
                    fontWeight: "600",
                    color: "#FFFFFF",
                  }}
                >
                  Content ID:{" "}
                  <code className="monospace" style={{ color: "#00E0FF" }}>
                    {content.contentId}
                  </code>
                </p>
                <p
                  style={{
                    margin: "0 0 12px 0",
                    fontSize: "0.95em",
                    color: "#D0D0D0",
                  }}
                >
                  Price:{" "}
                  <span className="data-highlight">
                    {Number(content.price) / 1e9} SUI
                  </span>
                  <br />
                  Creator:{" "}
                  <code className="monospace" style={{ color: "#00E0FF" }}>
                    {content.creator}
                  </code>
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

                    // Fan Token Info
                    const fanTokenInfo = fanTokens.get(content.creator);
                    const fanTokenFields = fanTokenInfo?.content?.fields;

                    // Campaign Info
                    const creatorCampaigns =
                      campaigns.get(content.creator) || [];

                    return (
                      <>
                        Creator Subscription:{" "}
                        <span className="data-highlight">
                          {subscriptionPrice} SUI
                        </span>{" "}
                        {isSubscribed && (
                          <span style={{ color: "#34D0F8" }}>
                            {" "}
                            (✓ Subscribed / 已訂閱)
                          </span>
                        )}
                        <br />
                        {fanTokenInfo ? (
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "16px",
                              background: "rgba(52, 208, 248, 0.1)",
                              borderRadius: "12px",
                              border: "1px solid rgba(52, 208, 248, 0.3)",
                              fontSize: "0.9em",
                            }}
                          >
                            <strong style={{ color: "#FFFFFF" }}>
                              Fan Tokens:
                            </strong>{" "}
                            <span className="data-highlight">
                              {fanTokenFields?.balance}
                            </span>
                            <span
                              style={{ marginLeft: "10px", color: "#D0D0D0" }}
                            >
                              (Burned:{" "}
                              <span
                                style={{ color: "#FFFFFF", fontWeight: "700" }}
                              >
                                {fanTokenFields?.total_burned}
                              </span>
                              )
                            </span>
                            {/* Campaign List */}
                            {creatorCampaigns.length > 0 && (
                              <div
                                style={{
                                  marginTop: "15px",
                                  borderTop:
                                    "1px solid rgba(52, 208, 248, 0.3)",
                                  paddingTop: "12px",
                                }}
                              >
                                <strong style={{ color: "#FFFFFF" }}>
                                  Active Campaigns / 進行中的活動:
                                </strong>
                                {creatorCampaigns.map(
                                  (camp: any, idx: number) => {
                                    const fields = camp.content?.fields;
                                    if (!fields?.active) return null;

                                    const joined = camp.joined; // We attached this in loadAllContents
                                    const cost = Number(fields.cost);
                                    const canJoin =
                                      Number(fanTokenFields?.balance) >= cost;

                                    return (
                                      <div
                                        key={idx}
                                        style={{
                                          background: "rgba(37, 41, 52, 0.6)",
                                          padding: "12px",
                                          marginTop: "10px",
                                          borderRadius: "10px",
                                          border:
                                            "1px solid rgba(163, 0, 255, 0.3)",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontWeight: "600",
                                            color: "#FFFFFF",
                                            marginBottom: "6px",
                                          }}
                                        >
                                          {fields.title}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "0.9em",
                                            color: "#D0D0D0",
                                            marginBottom: "10px",
                                          }}
                                        >
                                          {fields.description}
                                        </div>
                                        <div
                                          style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                          }}
                                        >
                                          <span
                                            className="data-highlight"
                                            style={{
                                              fontWeight: "bold",
                                              fontSize: "0.9em",
                                            }}
                                          >
                                            Cost: {cost} Fan Tokens
                                          </span>
                                          {joined ? (
                                            <span
                                              style={{
                                                color: "#34D0F8",
                                                fontWeight: "bold",
                                                fontSize: "0.9em",
                                              }}
                                            >
                                              ✓ Joined / 已參加
                                            </span>
                                          ) : (
                                            <button
                                              onClick={() =>
                                                handleJoinCampaign(
                                                  camp.objectId,
                                                  fanTokenInfo.objectId,
                                                  cost
                                                )
                                              }
                                              disabled={
                                                joiningCampaign ===
                                                  camp.objectId || !canJoin
                                              }
                                              className={
                                                canJoin ? "gradient-button" : ""
                                              }
                                              style={{
                                                padding: "6px 14px",
                                                fontSize: "0.85em",
                                                backgroundColor: canJoin
                                                  ? undefined
                                                  : "rgba(37, 41, 52, 0.8)",
                                                color: canJoin
                                                  ? undefined
                                                  : "#999",
                                                border: canJoin
                                                  ? undefined
                                                  : "1px solid rgba(52, 208, 248, 0.2)",
                                                borderRadius: "8px",
                                                cursor: canJoin
                                                  ? "pointer"
                                                  : "not-allowed",
                                              }}
                                            >
                                              {joiningCampaign ===
                                              camp.data?.objectId
                                                ? "Joining..."
                                                : "Join Campaign"}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  }
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.8em", color: "#D0D0D0" }}>
                            (Fan Token account will be created on first
                            purchase)
                          </span>
                        )}
                      </>
                    );
                  })()}
                </p>

                {/* Subscription Button */}
                {(() => {
                  const creator = creators.get(content.creator);
                  const creatorId = creator?.data?.objectId;
                  const isSubscribed =
                    creatorId && subscriptions.has(creatorId);

                  if (!isSubscribed && creatorId && !content.hasAccess) {
                    return (
                      <button
                        onClick={() =>
                          handleSubscribe(content.creator, creatorId)
                        }
                        disabled={!account || subscribing === creatorId}
                        className="gradient-button"
                        style={{
                          padding: "10px 20px",
                          fontSize: "0.9em",
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
                      className="gradient-button"
                      style={{
                        padding: "10px 20px",
                        marginRight: "10px",
                      }}
                    >
                      {loading
                        ? "Loading... / 載入中..."
                        : "View Content / 查看內容"}
                    </button>
                    {content.purchased && (
                      <span style={{ fontSize: "0.9em", color: "#34D0F8" }}>
                        ✓ Purchased / 已購買
                      </span>
                    )}
                    {!content.purchased &&
                      subscriptions.has(content.creatorId) && (
                        <span style={{ fontSize: "0.9em", color: "#A300FF" }}>
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
                    className="gradient-button"
                    style={{
                      padding: "10px 20px",
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
      )}

      {/* Content Viewer */}
      {viewingContent && contentUrl && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(37, 41, 52, 0.95)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            padding: "24px",
            borderRadius: "16px",
            border: "1px solid rgba(52, 208, 248, 0.3)",
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 40px rgba(163, 0, 255, 0.3)",
            zIndex: 1000,
            maxWidth: "90%",
            maxHeight: "90%",
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
            <h3 style={{ color: "#FFFFFF", margin: 0 }}>
              Content Viewer / 內容查看器
            </h3>
            <button
              onClick={() => {
                setViewingContent(null);
                if (contentUrl) URL.revokeObjectURL(contentUrl);
                setContentUrl(null);
              }}
              style={{
                padding: "8px 16px",
                background: "rgba(255, 0, 128, 0.2)",
                color: "#FF0080",
                border: "1px solid rgba(255, 0, 128, 0.4)",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 0, 128, 0.3)";
                e.currentTarget.style.borderColor = "rgba(255, 0, 128, 0.6)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255, 0, 128, 0.2)";
                e.currentTarget.style.borderColor = "rgba(255, 0, 128, 0.4)";
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
          className="glass-card"
          style={{
            marginTop: "20px",
            borderColor: "rgba(255, 0, 128, 0.4)",
            background: "rgba(255, 0, 128, 0.1)",
          }}
        >
          <strong style={{ color: "#FF0080" }}>Error / 錯誤:</strong>{" "}
          <span style={{ color: "#FFFFFF" }}>{error}</span>
        </div>
      )}
    </div>
  );
}
