import { Transaction } from "@mysten/sui/transactions";
import { suiClient } from "./suiClient";

/**
 * Contract interaction utilities
 * 合約互動工具函數
 */

// Contract package ID (will be set after deployment)
// 合約包 ID（部署後設定）
let CONTRACT_PACKAGE_ID =
  "0x1f6b00e0640bdab5a500778b73d7e91d59e413b792acf76a105c1e09fe2823cb";

export function setContractPackageId(packageId: string) {
  CONTRACT_PACKAGE_ID = packageId;
}

export function getContractPackageId(): string {
  return CONTRACT_PACKAGE_ID;
}

/**
 * Create content on-chain
 * 在鏈上創建內容
 */
export function createContentTransaction(
  blobId: string,
  price: bigint,
  referralSplitRatio: number
): Transaction {
  const tx = new Transaction();

  // Convert blobId string to vector<u8>
  const blobIdBytes = new TextEncoder().encode(blobId);

  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::content_registry::create_content_entry`,
    arguments: [
      tx.pure.vector("u8", Array.from(blobIdBytes)),
      tx.pure.u64(price),
      tx.pure.u64(referralSplitRatio),
    ],
  });

  return tx;
}

/**
 * Purchase content with optional referral
 * 購買內容（可選推廣地址）
 */
export function purchaseContentTransaction(
  contentId: string,
  referralAddress: string | null
): Transaction {
  const tx = new Transaction();

  const referral = referralAddress || "0x0";

  // Get ProcessedTx shared object (assuming it exists)
  // In production, this should be fetched from chain
  const processedTxId =
    "0xb827d44e097733eaca8842a4d5448c1afff04007f3c4ec85ae43d430f8cc55de"; // TODO: Get from chain after deployment

  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::referral_split::purchase_content`,
    arguments: [
      tx.object(contentId),
      tx.gas,
      tx.pure.address(referral),
      tx.object(processedTxId), // ProcessedTx shared object
    ],
  });

  return tx;
}

/**
 * Query content information
 * 查詢內容信息
 */
export async function getContentInfo(contentId: string) {
  try {
    const object = await suiClient.getObject({
      id: contentId,
      options: {
        showContent: true,
        showType: true,
      },
    });

    return object;
  } catch (error) {
    console.error("Error fetching content:", error);
    throw error;
  }
}

/**
 * Query ContentCreated events to get all content
 * 查詢 ContentCreated 事件以獲取所有內容
 */
export async function getAllContents(): Promise<any[]> {
  try {
    if (!CONTRACT_PACKAGE_ID) {
      return [];
    }

    const events = await suiClient.queryEvents({
      query: {
        MoveModule: {
          package: CONTRACT_PACKAGE_ID,
          module: "content_registry",
        },
      },
      limit: 100,
      order: "descending",
    });

    // Get unique content IDs from events
    // 從事件中獲取唯一的內容 ID
    const contentIds = new Set<string>();
    const contentMap = new Map<string, any>();

    for (const event of events.data) {
      const parsedJson = event.parsedJson as any;
      if (parsedJson?.content_id) {
        const contentId = parsedJson.content_id;
        if (!contentIds.has(contentId)) {
          contentIds.add(contentId);
          contentMap.set(contentId, {
            contentId,
            blobId: parsedJson.blob_id,
            price: parsedJson.price,
            referralSplitRatio: parsedJson.referral_split_ratio,
            creator: parsedJson.creator,
            createdAt: event.timestampMs
              ? new Date(Number(event.timestampMs))
              : new Date(),
          });
        }
      }
    }

    // Return content data from events (objects are owned, so we use event data)
    // 返回事件中的內容數據（對象是擁有的，所以我們使用事件數據）
    return Array.from(contentMap.values());
  } catch (error) {
    console.error("Error fetching all contents:", error);
    return [];
  }
}

/**
 * Query ContentPurchased events
 * 查詢 ContentPurchased 事件
 */
export async function getPurchaseEvents(
  _contentId?: string,
  _buyer?: string
): Promise<any[]> {
  try {
    if (!CONTRACT_PACKAGE_ID) {
      return [];
    }

    const events = await suiClient.queryEvents({
      query: {
        MoveModule: {
          package: CONTRACT_PACKAGE_ID,
          module: "referral_split",
        },
      },
      limit: 100,
    });

    return events.data;
  } catch (error) {
    console.error("Error fetching purchase events:", error);
    return [];
  }
}

/**
 * Check if user has purchased a content
 * 檢查用戶是否已購買內容
 */
export async function hasUserPurchased(
  contentId: string,
  userAddress: string
): Promise<boolean> {
  try {
    const events = await getPurchaseEvents();
    return events.some((event: any) => {
      const parsedJson = event.parsedJson;
      return (
        parsedJson?.content_id === contentId &&
        parsedJson?.buyer === userAddress
      );
    });
  } catch (error) {
    console.error("Error checking purchase status:", error);
    return false;
  }
}

/**
 * Query creator's content objects
 * 查詢創作者的內容對象
 */
export async function getCreatorContents(
  creatorAddress: string
): Promise<any[]> {
  try {
    if (!CONTRACT_PACKAGE_ID) {
      return [];
    }

    // Query Content objects owned by the creator
    // 查詢創作者擁有的 Content 對象
    const objects = await suiClient.getOwnedObjects({
      owner: creatorAddress,
      filter: {
        StructType: `${CONTRACT_PACKAGE_ID}::content_registry::Content`,
      },
      options: {
        showContent: true,
        showType: true,
      },
    });

    return objects.data;
  } catch (error) {
    console.error("Error fetching creator contents:", error);
    return [];
  }
}

/**
 * Get created objects from transaction result
 * 從交易結果獲取創建的對象 ID
 */
export async function getCreatedObjectsFromTransaction(
  txDigest: string
): Promise<string[]> {
  try {
    const tx = await suiClient.getTransactionBlock({
      digest: txDigest,
      options: {
        showObjectChanges: true,
        showEffects: true,
      },
    });

    const createdObjects: string[] = [];

    if (tx.objectChanges) {
      for (const change of tx.objectChanges) {
        if (
          change.type === "created" &&
          change.objectType?.includes("Content")
        ) {
          createdObjects.push(change.objectId);
        }
      }
    }

    return createdObjects;
  } catch (error) {
    console.error("Error fetching transaction objects:", error);
    return [];
  }
}
