import { useState, useEffect } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { createWalrusClient, uploadFileToWalrus } from "../utils/walrusHelpers";
import {
  createContentTransaction,
  getCreatorContents,
  getCreatedObjectsFromTransaction,
  registerCreatorTransaction,
  getCreatorByOwner,
  getCreatorInfo,
  createCampaignTransaction,
  getCreatorCampaigns,
} from "../utils/contract";
import { suiClient } from "../utils/suiClient";
import {
  encryptWithSeal,
  encodeSealIdentityFromAddress,
} from "../utils/sealHelpers";
import type { Transaction } from "@mysten/sui/transactions";

interface Content {
  contentId: string;
  blobId: string;
  price: bigint;
  referralSplitRatio: number;
  createdAt: Date;
}

export default function CreatorDashboard() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [price, setPrice] = useState<string>("");
  const [referralSplitRatio, setReferralSplitRatio] = useState<string>("15");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contents, setContents] = useState<Content[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);

  // Campaign state
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDesc, setCampaignDesc] = useState("");
  const [campaignCost, setCampaignCost] = useState("");
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Creator registration state
  // 創作者註冊狀態
  const [creatorInfo, setCreatorInfo] = useState<any>(null);
  const [loadingCreator, setLoadingCreator] = useState(false);
  const [subscriptionPrice, setSubscriptionPrice] = useState<string>("1.0");
  const [registering, setRegistering] = useState(false);

  // Load creator info when component mounts or account changes
  // 當組件載入或賬戶變更時載入創作者信息
  useEffect(() => {
    if (account) {
      loadCreatorInfo();
      loadCreatorContents();
      loadCampaigns();
    } else {
      setContents([]);
      setCampaigns([]);
      setCreatorInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const loadCreatorInfo = async () => {
    if (!account) return;

    setLoadingCreator(true);
    try {
      const creator = await getCreatorByOwner(account.address);
      setCreatorInfo(creator);
    } catch (error) {
      console.error("Error loading creator info:", error);
    } finally {
      setLoadingCreator(false);
    }
  };

  const loadCreatorContents = async () => {
    if (!account) return;

    setLoadingContents(true);
    try {
      const objects = await getCreatorContents(account.address);

      const contents: Content[] = objects.map((obj: any) => {
        // Handle both owned and shared object structures
        // 處理 owned 和 shared 對象結構
        const contentData =
          obj.content?.fields || obj.data?.content?.fields || {};
        const objectId = obj.objectId || obj.data?.objectId || "";

        // Decode blob_id from vector<u8>
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
          referralSplitRatio: contentData.referral_split_ratio
            ? Number(contentData.referral_split_ratio) / 100
            : 0,
          createdAt: contentData.created_at
            ? new Date(Number(contentData.created_at))
            : new Date(),
        };
      });

      // Sort by creation date (newest first)
      contents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      setContents(contents);
    } catch (error) {
      console.error("Error loading creator contents:", error);
      setError("Failed to load contents / 載入內容失敗");
    } finally {
      setLoadingContents(false);
    }
  };

  const loadCampaigns = async () => {
    if (!account) return;
    setLoadingCampaigns(true);
    try {
      const creatorCampaigns = await getCreatorCampaigns(account.address);
      setCampaigns(creatorCampaigns);
    } catch (error) {
      console.error("Error loading campaigns:", error);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const handleRegisterCreator = async () => {
    if (!account) {
      setError("Please connect your wallet first / 請先連接您的錢包");
      return;
    }

    const priceInMist = BigInt(Math.floor(parseFloat(subscriptionPrice) * 1e9));
    if (priceInMist <= 0) {
      setError(
        "Please enter a valid subscription price / 請輸入有效的訂閱價格"
      );
      return;
    }

    setRegistering(true);
    setError(null);

    try {
      const tx = registerCreatorTransaction(priceInMist);

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: async (result: any) => {
            // Try to get Creator ID from transaction result first
            // 首先嘗試從交易結果中獲取 Creator ID
            let creatorId: string | null = null;

            if (result?.digest) {
              try {
                const txResult = await suiClient.getTransactionBlock({
                  digest: result.digest,
                  options: {
                    showObjectChanges: true,
                    showEffects: true,
                  },
                });

                // Look for created Creator object
                // 查找創建的 Creator 對象
                if (txResult.objectChanges) {
                  for (const change of txResult.objectChanges) {
                    if (
                      change.type === "created" &&
                      "objectType" in change &&
                      change.objectType?.includes("Creator")
                    ) {
                      creatorId = (change as any).objectId;
                      break;
                    }
                  }
                }
              } catch (e) {
                console.warn(
                  "Could not get Creator from transaction result:",
                  e
                );
              }
            }

            // If we got the Creator ID, fetch it directly
            // 如果獲得了 Creator ID，直接獲取
            if (creatorId) {
              try {
                const creator = await getCreatorInfo(creatorId);
                setCreatorInfo(creator);
                setRegistering(false);
                setSubscriptionPrice("1.0");
                return;
              } catch (e) {
                console.warn("Could not fetch Creator by ID, will retry:", e);
              }
            }

            // Otherwise, retry loading with delay (wait for event indexing)
            // 否則，延遲後重試載入（等待事件索引）
            const maxRetries = 5;
            let retries = 0;

            const retryLoad = async () => {
              await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
              const creator = await getCreatorByOwner(account.address);

              if (creator) {
                setCreatorInfo(creator);
                setRegistering(false);
                setSubscriptionPrice("1.0");
              } else if (retries < maxRetries) {
                retries++;
                await retryLoad();
              } else {
                // Final attempt after all retries
                // 所有重試後的最後嘗試
                await new Promise((resolve) => setTimeout(resolve, 2000));
                await loadCreatorInfo();
                setRegistering(false);
                setSubscriptionPrice("1.0");
              }
            };

            await retryLoad();
          },
          onError: (error) => {
            setError(
              error.message || "Failed to register as creator / 註冊創作者失敗"
            );
            setRegistering(false);
          },
        }
      );
    } catch (err) {
      console.error("Error registering creator:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to register as creator / 註冊創作者失敗"
      );
      setRegistering(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleCreateContent = async () => {
    if (!selectedFile) {
      setError("Please select a file first / 請先選擇文件");
      return;
    }

    if (!account) {
      setError("Please connect your wallet first / 請先連接您的錢包");
      return;
    }

    if (!creatorInfo) {
      setError("Please register as creator first / 請先註冊為創作者");
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      setError("Please enter a valid price / 請輸入有效價格");
      return;
    }

    const ratio = parseInt(referralSplitRatio);
    if (isNaN(ratio) || ratio < 0 || ratio > 100) {
      setError(
        "Referral split ratio must be between 0 and 100 / 推廣分成比例必須在 0 到 100 之間"
      );
      return;
    }

    setUploading(true);
    setCreating(true);
    setError(null);

    try {
      // Step 1: Read and encrypt file with Seal
      // 步驟 1：讀取並使用 Seal 加密文件
      const fileBytes = new Uint8Array(await selectedFile.arrayBuffer());

      const creatorFields = creatorInfo.data?.content?.fields as any;
      const contentCount = creatorFields?.content_count || 0;
      const sealSuffix = new Uint8Array([
        ...new Uint8Array(
          new BigUint64Array([BigInt(contentCount) + BigInt(1)]).buffer
        ),
      ]);

      const sealIdHex = encodeSealIdentityFromAddress(
        account.address,
        sealSuffix
      );

      const { encryptedObject } = await encryptWithSeal({
        data: fileBytes,
        sealIdHex,
      });

      // Step 2: Upload encrypted file to Walrus
      // 步驟 2：上傳加密文件到 Walrus
      const walrusClient = createWalrusClient();

      const executeTransaction = (transaction: Transaction) => {
        return new Promise<{ digest: string }>((resolve, reject) => {
          signAndExecute(
            {
              transaction: transaction as any,
            },
            {
              onSuccess: (result) => {
                resolve({ digest: result.digest });
              },
              onError: (error) => {
                reject(error);
              },
            }
          );
        });
      };

      const walrusResult = await uploadFileToWalrus(
        walrusClient,
        encryptedObject, // Upload encrypted bytes
        account.address,
        executeTransaction,
        10, // epochs
        true // deletable
      );

      setUploading(false);

      // Step 3: Create content on-chain
      // 步驟 3：在鏈上創建內容
      const priceInMist = BigInt(Math.floor(parseFloat(price) * 1e9)); // Convert SUI to MIST
      const ratioInBasisPoints = ratio * 100; // Convert percentage to basis points

      const tx = await createContentTransaction({
        creatorAddress: account.address,
        blobId: walrusResult.blobId,
        price: priceInMist,
        referralSplitRatio: ratioInBasisPoints,
      });

      signAndExecute(
        {
          transaction: tx as any,
        },
        {
          onSuccess: async (result) => {
            // Get actual Content object ID from transaction result
            // 從交易結果獲取實際的 Content 對象 ID
            const createdObjects = await getCreatedObjectsFromTransaction(
              result.digest
            );

            const contentId = createdObjects[0] || result.digest;

            const newContent: Content = {
              contentId,
              blobId: walrusResult.blobId,
              price: priceInMist,
              referralSplitRatio: ratio,
              createdAt: new Date(),
            };

            setContents((prev) => [newContent, ...prev]);
            setCreating(false);
            setSelectedFile(null);
            setPrice("");
            setReferralSplitRatio("15");

            // Reset file input
            const fileInput = document.querySelector(
              'input[type="file"]'
            ) as HTMLInputElement;
            if (fileInput) fileInput.value = "";

            // Reload contents to ensure sync with chain
            // 重新載入內容以確保與鏈同步
            await loadCreatorContents();
          },
          onError: (error) => {
            setError(
              error.message || "Failed to create content / 創建內容失敗"
            );
            setCreating(false);
          },
        }
      );
    } catch (err) {
      console.error("Error:", err);
      setError(
        err instanceof Error ? err.message : "Operation failed / 操作失敗"
      );
      setUploading(false);
      setCreating(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!campaignTitle || !campaignDesc || !campaignCost) {
      setError("Please fill in all campaign fields / 請填寫所有活動欄位");
      return;
    }

    const cost = parseInt(campaignCost);
    if (isNaN(cost) || cost <= 0) {
      setError("Please enter a valid cost / 請輸入有效的消耗代幣數量");
      return;
    }

    setCreatingCampaign(true);
    setError(null);

    try {
      const tx = createCampaignTransaction(
        campaignTitle,
        campaignDesc,
        BigInt(cost)
      );

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: async () => {
            setCampaignTitle("");
            setCampaignDesc("");
            setCampaignCost("");
            setCreatingCampaign(false);
            await loadCampaigns();
            alert("Campaign created successfully! / 活動創建成功！");
          },
          onError: (error) => {
            setError(
              error.message || "Failed to create campaign / 創建活動失敗"
            );
            setCreatingCampaign(false);
          },
        }
      );
    } catch (err) {
      console.error("Error creating campaign:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create campaign / 創建活動失敗"
      );
      setCreatingCampaign(false);
    }
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
        Creator Dashboard / 創作者儀表板
      </h2>

      {/* Creator Registration Section */}
      {loadingCreator ? (
        <div className="glass-card" style={{ textAlign: "center" }}>
          <p style={{ color: "#D0D0D0" }}>
            Loading creator status... / 載入創作者狀態...
          </p>
        </div>
      ) : !creatorInfo ? (
        <div
          className="glass-card"
          style={{
            borderColor: "rgba(255, 152, 0, 0.4)",
            background: "rgba(255, 152, 0, 0.1)",
            marginBottom: "20px",
          }}
        >
          <h3
            style={{ color: "#FFFFFF", marginTop: "0", marginBottom: "15px" }}
          >
            Register as Creator / 註冊為創作者
          </h3>
          <p style={{ color: "#D0D0D0", marginBottom: "15px" }}>
            You need to register as a creator before uploading content.
            <br />
            您需要先註冊為創作者才能上傳內容。
          </p>

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                color: "#FFFFFF",
                display: "block",
                marginBottom: "8px",
              }}
            >
              Subscription Price (SUI) / 訂閱價格（SUI）:
            </label>
            <input
              type="number"
              step="0.1"
              value={subscriptionPrice}
              onChange={(e) => setSubscriptionPrice(e.target.value)}
              disabled={registering}
              style={{
                width: "200px",
                padding: "10px",
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(52, 208, 248, 0.3)",
                borderRadius: "8px",
                color: "#FFFFFF",
                outline: "none",
              }}
              placeholder="1.0"
            />
            <div
              style={{ fontSize: "0.8em", color: "#D0D0D0", marginTop: "8px" }}
            >
              Users can subscribe to access all your content
              <br />
              用戶可以訂閱以訪問您的所有內容
            </div>
          </div>

          <button
            onClick={handleRegisterCreator}
            disabled={registering}
            className="gradient-button"
            style={{ padding: "12px 24px", fontSize: "1em" }}
          >
            {registering
              ? "Registering... / 註冊中..."
              : "Register as Creator / 註冊為創作者"}
          </button>
        </div>
      ) : (
        <div
          className="glass-card"
          style={{
            borderColor: "rgba(52, 208, 248, 0.4)",
            background: "rgba(52, 208, 248, 0.1)",
            marginBottom: "20px",
          }}
        >
          <p style={{ margin: 0, color: "#FFFFFF" }}>
            <strong>✓ Registered as Creator / 已註冊為創作者</strong>
            <br />
            <span style={{ fontSize: "0.9em", color: "#D0D0D0" }}>
              Subscription Price:{" "}
              <span className="data-highlight">
                {Number(
                  (creatorInfo.data?.content?.fields as any)
                    ?.subscription_price || 0
                ) / 1e9}{" "}
                SUI
              </span>
            </span>
          </p>
        </div>
      )}

      <div
        className="glass-card"
        style={{
          marginBottom: "20px",
          opacity: !creatorInfo ? 0.5 : 1,
          pointerEvents: !creatorInfo ? "none" : "auto",
        }}
      >
        <h3 style={{ color: "#FFFFFF", marginTop: "0", marginBottom: "20px" }}>
          Upload Content / 上傳內容
        </h3>

        <div style={{ marginBottom: "20px" }}>
          <label
            style={{ color: "#FFFFFF", display: "block", marginBottom: "8px" }}
          >
            Select File (Image or Video) / 選擇文件（圖片或影片）:
          </label>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            disabled={uploading || creating || !account}
            style={{
              padding: "8px",
              background: "rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(52, 208, 248, 0.3)",
              borderRadius: "8px",
              color: "#FFFFFF",
            }}
          />
          {selectedFile && (
            <div
              style={{ marginTop: "10px", fontSize: "0.9em", color: "#D0D0D0" }}
            >
              Selected: {selectedFile.name} (
              {(selectedFile.size / 1024).toFixed(2)} KB)
            </div>
          )}
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label
            style={{ color: "#FFFFFF", display: "block", marginBottom: "8px" }}
          >
            Price (SUI) / 價格（SUI）:
          </label>
          <input
            type="number"
            step="0.001"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={uploading || creating || !account}
            style={{
              width: "200px",
              padding: "10px",
              background: "rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(52, 208, 248, 0.3)",
              borderRadius: "8px",
              color: "#FFFFFF",
              outline: "none",
            }}
            placeholder="0.1"
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label
            style={{ color: "#FFFFFF", display: "block", marginBottom: "8px" }}
          >
            Referral Split Ratio (%) / 推廣分成比例（%）:
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={referralSplitRatio}
            onChange={(e) => setReferralSplitRatio(e.target.value)}
            disabled={uploading || creating || !account}
            style={{
              width: "120px",
              padding: "10px",
              background: "rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(52, 208, 248, 0.3)",
              borderRadius: "8px",
              color: "#FFFFFF",
              outline: "none",
            }}
          />
          <div
            style={{ fontSize: "0.8em", color: "#D0D0D0", marginTop: "8px" }}
          >
            Percentage of revenue that goes to referrers (e.g., 15 = 15%)
            <br />
            給推廣者的收入百分比（例如，15 = 15%）
          </div>
        </div>

        <button
          onClick={handleCreateContent}
          disabled={
            !selectedFile || !price || uploading || creating || !account
          }
          className="gradient-button"
          style={{ padding: "12px 24px", fontSize: "1em" }}
        >
          {uploading
            ? "Uploading to Walrus... / 上傳到 Walrus..."
            : creating
            ? "Creating Content... / 創建內容中..."
            : "Create Content / 創建內容"}
        </button>

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

      {/* Create Campaign Section */}
      <div
        style={{
          padding: "20px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          marginBottom: "20px",
          opacity: !creatorInfo ? 0.5 : 1,
          pointerEvents: !creatorInfo ? "none" : "auto",
        }}
      >
        <h3>Create Campaign / 創建活動</h3>

        <div style={{ marginBottom: "15px" }}>
          <label>
            Title / 標題:
            <input
              type="text"
              value={campaignTitle}
              onChange={(e) => setCampaignTitle(e.target.value)}
              disabled={creatingCampaign}
              style={{ marginLeft: "10px", width: "300px" }}
              placeholder="Campaign Title"
            />
          </label>
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label>
            Description / 描述:
            <input
              type="text"
              value={campaignDesc}
              onChange={(e) => setCampaignDesc(e.target.value)}
              disabled={creatingCampaign}
              style={{ marginLeft: "10px", width: "300px" }}
              placeholder="Campaign Description"
            />
          </label>
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label>
            Cost (Fan Tokens) / 消耗 (Fan Tokens):
            <input
              type="number"
              value={campaignCost}
              onChange={(e) => setCampaignCost(e.target.value)}
              disabled={creatingCampaign}
              style={{ marginLeft: "10px", width: "150px" }}
              placeholder="100"
            />
          </label>
        </div>

        <button
          onClick={handleCreateCampaign}
          disabled={creatingCampaign}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            backgroundColor: creatingCampaign ? "#ccc" : "#9C27B0",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: creatingCampaign ? "not-allowed" : "pointer",
          }}
        >
          {creatingCampaign
            ? "Creating... / 創建中..."
            : "Create Campaign / 創建活動"}
        </button>

        {/* Campaign List */}
        {campaigns.length > 0 && (
          <div style={{ marginTop: "20px" }}>
            <h4>Your Campaigns / 您的活動</h4>
            {loadingCampaigns ? (
              <p style={{ color: "#666" }}>
                Loading campaigns... / 載入活動中...
              </p>
            ) : (
              campaigns.map((campaign, index) => {
                const fields =
                  campaign.content?.fields || campaign.data?.content?.fields;
                return (
                  <div
                    key={index}
                    style={{
                      padding: "10px",
                      background: "#f9f9f9",
                      border: "1px solid #eee",
                      marginBottom: "10px",
                      borderRadius: "4px",
                    }}
                  >
                    <strong>{fields?.title}</strong>
                    <br />
                    <span style={{ fontSize: "0.9em", color: "#666" }}>
                      {fields?.description}
                    </span>
                    <br />
                    <span style={{ fontSize: "0.9em", color: "#666" }}>
                      Cost: {fields?.cost} tokens | Participants:{" "}
                      {fields?.participants?.length || 0} | Status:{" "}
                      {fields?.active ? "Active" : "Closed"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Content List */}
      <div className="glass-card" style={{ marginBottom: "20px" }}>
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
            Your Contents / 您的內容
          </h3>
          <button
            onClick={loadCreatorContents}
            disabled={loadingContents}
            className="gradient-button"
            style={{ padding: "8px 16px", fontSize: "0.9em" }}
          >
            {loadingContents ? "Loading... / 載入中..." : "Refresh / 刷新"}
          </button>
        </div>

        {loadingContents && contents.length === 0 ? (
          <p style={{ color: "#D0D0D0" }}>
            Loading contents... / 載入內容中...
          </p>
        ) : contents.length === 0 ? (
          <p style={{ color: "#D0D0D0" }}>
            No content created yet. Upload your first content above!
            <br />
            尚未創建內容。請在上方上傳您的第一個內容！
          </p>
        ) : (
          contents.map((content, index) => (
            <div
              key={index}
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
                  fontSize: "1.1em",
                }}
              >
                Content #{index + 1}
              </p>
              <p style={{ margin: "0", fontSize: "0.95em", color: "#D0D0D0" }}>
                Content ID:{" "}
                <code
                  className="monospace"
                  style={{ color: "#00E0FF", wordBreak: "break-all" }}
                >
                  {content.contentId || "Pending..."}
                </code>
                <br />
                Blob ID:{" "}
                <code
                  className="monospace"
                  style={{
                    wordBreak: "break-all",
                    color: "#00E0FF",
                  }}
                >
                  {content.blobId}
                </code>
                <br />
                Price:{" "}
                <span className="data-highlight">
                  {Number(content.price) / 1e9} SUI
                </span>
                <br />
                Referral Split:{" "}
                <span className="data-highlight">
                  {content.referralSplitRatio}%
                </span>
                <br />
                Created:{" "}
                <span style={{ color: "#D0D0D0" }}>
                  {content.createdAt.toLocaleString()}
                </span>
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
