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
    "0x2367d77eae91421453315724acb4323e98b1fd836c402e58dca2b42b087b999c"; // TODO: Get from chain after deployment

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
