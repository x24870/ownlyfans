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
} from "../utils/contract";
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

  // Load creator's contents when component mounts or account changes
  // 當組件載入或賬戶變更時載入創作者的內容
  useEffect(() => {
    if (account) {
      loadCreatorContents();
    } else {
      setContents([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

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
      // Step 1: Upload file to Walrus
      // 步驟 1：上傳文件到 Walrus
      const fileBytes = new Uint8Array(await selectedFile.arrayBuffer());
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
        fileBytes,
        account.address,
        executeTransaction,
        10, // epochs
        true // deletable
      );

      setUploading(false);

      // Step 2: Create content on-chain
      // 步驟 2：在鏈上創建內容
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

  return (
    <div>
      <h2>Creator Dashboard / 創作者儀表板</h2>

      <div
        style={{
          padding: "20px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          marginBottom: "20px",
        }}
      >
        <h3>Upload Content / 上傳內容</h3>

        <div style={{ marginBottom: "15px" }}>
          <label>
            Select File (Image or Video) / 選擇文件（圖片或影片）:
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              disabled={uploading || creating || !account}
              style={{ marginLeft: "10px" }}
            />
          </label>
          {selectedFile && (
            <div
              style={{ marginTop: "10px", fontSize: "0.9em", color: "#666" }}
            >
              Selected: {selectedFile.name} (
              {(selectedFile.size / 1024).toFixed(2)} KB)
            </div>
          )}
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label>
            Price (SUI) / 價格（SUI）:
            <input
              type="number"
              step="0.001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={uploading || creating || !account}
              style={{ marginLeft: "10px", width: "150px" }}
              placeholder="0.1"
            />
          </label>
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label>
            Referral Split Ratio (%) / 推廣分成比例（%）:
            <input
              type="number"
              min="0"
              max="100"
              value={referralSplitRatio}
              onChange={(e) => setReferralSplitRatio(e.target.value)}
              disabled={uploading || creating || !account}
              style={{ marginLeft: "10px", width: "80px" }}
            />
          </label>
          <div style={{ fontSize: "0.8em", color: "#666", marginTop: "5px" }}>
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
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            backgroundColor: uploading || creating ? "#ccc" : "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: uploading || creating ? "not-allowed" : "pointer",
          }}
        >
          {uploading
            ? "Uploading to Walrus... / 上傳到 Walrus..."
            : creating
            ? "Creating Content... / 創建內容中..."
            : "Create Content / 創建內容"}
        </button>

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
          <h3>Your Contents / 您的內容</h3>
          <button
            onClick={loadCreatorContents}
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
            No content created yet. Upload your first content above!
            <br />
            尚未創建內容。請在上方上傳您的第一個內容！
          </p>
        ) : (
          contents.map((content, index) => (
            <div
              key={index}
              style={{
                padding: "15px",
                marginBottom: "10px",
                background: "#f5f5f5",
                borderRadius: "4px",
                border: "1px solid #ddd",
              }}
            >
              <p style={{ margin: "0 0 5px 0", fontWeight: "bold" }}>
                Content #{index + 1}
              </p>
              <p style={{ margin: "0", fontSize: "0.9em", color: "#666" }}>
                Content ID: <code>{content.contentId || "Pending..."}</code>
                <br />
                Blob ID:{" "}
                <code style={{ wordBreak: "break-all" }}>{content.blobId}</code>
                <br />
                Price: {Number(content.price) / 1e9} SUI
                <br />
                Referral Split: {content.referralSplitRatio}%
                <br />
                Created: {content.createdAt.toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
