import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { suiClient } from "./suiClient";

/**
 * Contract interaction utilities
 * 合約互動工具函數
 */

// Contract package ID (will be set after deployment)
// 合約包 ID（部署後設定）
let CONTRACT_PACKAGE_ID =
  "0xb75271ece8112bf58ea15c87d785b38c4d2530fe374fd150991e384cd1f2746e";

export function setContractPackageId(packageId: string) {
  CONTRACT_PACKAGE_ID = packageId;
}

export function getContractPackageId(): string {
  return CONTRACT_PACKAGE_ID;
}

/**
 * Build seal_approve transaction for content decryption
 * 構建用於內容解密的 seal_approve 交易
 */
export async function buildSealApproveTransaction(
  sealIdBytes: Uint8Array,
  creatorId: string,
  contentId: string,
  allowlistId: string,
  subscriptionId: string
): Promise<Uint8Array> {
  const tx = new Transaction();

  // Import SUI_CLOCK_OBJECT_ID
  const SUI_CLOCK_OBJECT_ID = "0x6";

  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::seal_access::seal_approve`,
    arguments: [
      tx.pure.vector("u8", Array.from(sealIdBytes)),
      tx.object(creatorId),
      tx.object(contentId),
      tx.object(allowlistId),
      tx.object(subscriptionId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return await tx.build({ client: suiClient });
}

/**
 * Create content on-chain
 * 在鏈上創建內容
 */
export function registerCreatorTransaction(
  subscriptionPrice: bigint
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::creator_registry::register_creator`,
    arguments: [tx.pure.u64(subscriptionPrice)],
  });
  return tx;
}

export function subscribeCreatorTransaction(
  creatorId: string,
  subscriptionPrice: bigint
): Transaction {
  const tx = new Transaction();
  const [paymentCoin] = tx.splitCoins(tx.gas, [subscriptionPrice]);
  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::subscription::subscribe_creator`,
    arguments: [
      tx.object(creatorId),
      paymentCoin,
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

/**
 * Create content on-chain
 * 在鏈上創建內容
 */
interface CreateContentParams {
  creatorId?: string;
  creatorAddress?: string;
  blobId: string;
  price: bigint;
  referralSplitRatio: number;
}

export async function createContentTransaction({
  creatorId,
  creatorAddress,
  blobId,
  price,
  referralSplitRatio,
}: CreateContentParams): Promise<Transaction> {
  const resolvedCreatorId =
    creatorId ||
    (creatorAddress
      ? await (async () => {
          const creator = await getCreatorByOwner(creatorAddress);
          if (!creator?.data?.objectId) {
            throw new Error("Creator object not found. Please register first.");
          }
          return creator.data.objectId;
        })()
      : null);

  if (!resolvedCreatorId) {
    throw new Error("creatorId or creatorAddress is required.");
  }

  const tx = new Transaction();
  const blobIdBytes = new TextEncoder().encode(blobId);

  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::content_registry::create_content_entry`,
    arguments: [
      tx.object(resolvedCreatorId),
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
interface PurchaseContentParams {
  contentId: string;
  allowlistId?: string;
  price: bigint;
  referralAddress: string | null;
}

export async function purchaseContentTransaction({
  contentId,
  allowlistId,
  price,
  referralAddress,
}: PurchaseContentParams): Promise<Transaction> {
  const tx = new Transaction();
  const referral = referralAddress || "0x0";

  const resolvedAllowlistId =
    allowlistId ||
    (await (async () => {
      const contentInfo = await getContentInfo(contentId);
      const fields = (contentInfo.data?.content as any)?.fields;
      if (!fields?.allowlist_id) {
        throw new Error("Allowlist ID not found for this content.");
      }
      return fields.allowlist_id;
    })());

  const [paymentCoin] = tx.splitCoins(tx.gas, [price]);

  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::referral_split::purchase_content`,
    arguments: [
      tx.object(contentId),
      tx.object(resolvedAllowlistId),
      paymentCoin,
      tx.pure.address(referral),
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
        showOwner: true,
        showType: true,
      },
    });

    return object;
  } catch (error) {
    console.error("Error fetching content:", error);
    throw error;
  }
}

export async function getCreatorInfo(creatorId: string) {
  try {
    return await suiClient.getObject({
      id: creatorId,
      options: {
        showContent: true,
        showOwner: true,
        showType: true,
      },
    });
  } catch (error) {
    console.error("Error fetching creator:", error);
    throw error;
  }
}

export async function getCreatorByOwner(ownerAddress: string) {
  try {
    const events = await suiClient.queryEvents({
      query: {
        MoveModule: {
          package: CONTRACT_PACKAGE_ID,
          module: "creator_registry",
        },
      },
      limit: 200,
      order: "descending",
    });

    for (const event of events.data) {
      const parsedJson = event.parsedJson as any;
      if (parsedJson?.owner === ownerAddress && parsedJson?.creator_id) {
        return await getCreatorInfo(parsedJson.creator_id);
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching creator by owner:", error);
    return null;
  }
}

export async function getAllowlistInfo(allowlistId: string) {
  try {
    return await suiClient.getObject({
      id: allowlistId,
      options: {
        showContent: true,
        showType: true,
      },
    });
  } catch (error) {
    console.error("Error fetching allowlist:", error);
    throw error;
  }
}

export async function getSubscription(
  creatorId: string,
  subscriberAddress: string
) {
  try {
    const events = await suiClient.queryEvents({
      query: {
        MoveModule: {
          package: CONTRACT_PACKAGE_ID,
          module: "subscription",
        },
      },
      limit: 200,
      order: "descending",
    });

    for (const event of events.data) {
      const parsedJson = event.parsedJson as any;
      if (
        parsedJson?.creator_id === creatorId &&
        parsedJson?.subscriber === subscriberAddress
      ) {
        return await suiClient.getObject({
          id: parsedJson.subscription_id,
          options: {
            showContent: true,
            showType: true,
          },
        });
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return null;
  }
}

export async function hasContentAccess(contentId: string, userAddress: string) {
  try {
    const content = await getContentInfo(contentId);
    const fields = (content.data?.content as any)?.fields;
    if (!fields) {
      return false;
    }

    const allowlistId = fields.allowlist_id;
    const creatorId = fields.creator_id;

    if (allowlistId) {
      const allowlist = await getAllowlistInfo(allowlistId);
      const allowlistFields = (allowlist.data?.content as any)?.fields;
      if (
        Array.isArray(allowlistFields?.buyers) &&
        allowlistFields.buyers.some(
          (buyer: string) => buyer.toLowerCase() === userAddress.toLowerCase()
        )
      ) {
        return true;
      }
    }

    if (creatorId) {
      const subscription = await getSubscription(creatorId, userAddress);
      const subscriptionFields = (subscription?.data?.content as any)?.fields;
      if (subscriptionFields) {
        const expiresAt = Number(subscriptionFields.expires_at_ms ?? 0);
        const now = Date.now();
        if (expiresAt === 0 || expiresAt > now) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking content access:", error);
    return false;
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
 * Note: Content is now a shared object, so we query by ContentCreated events
 * 注意：Content 現在是共享對象，所以我們通過 ContentCreated 事件查詢
 */
export async function getCreatorContents(
  creatorAddress: string
): Promise<any[]> {
  try {
    if (!CONTRACT_PACKAGE_ID) {
      return [];
    }

    // Query ContentCreated events for this creator
    // 查詢此創作者的 ContentCreated 事件
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

    // Filter events by creator and get content objects
    // 按創作者過濾事件並獲取內容對象
    const contents = [];
    for (const event of events.data) {
      const parsedJson = event.parsedJson as any;
      if (parsedJson?.creator === creatorAddress && parsedJson?.content_id) {
        try {
          const obj = await getContentInfo(parsedJson.content_id);
          if (obj.data) {
            contents.push(obj.data);
          }
        } catch (e) {
          // Object might not exist, skip it
          console.warn(`Content ${parsedJson.content_id} not found, skipping`);
        }
      }
    }

    return contents;
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
        // Check for "created" objects (both owned and shared objects show as "created")
        // 檢查 "created" 對象（owned 和 shared 對象都顯示為 "created"）
        if (change.type === "created" && "objectType" in change) {
          const createdChange = change as {
            objectType: string;
            objectId: string;
          };
          if (createdChange.objectType?.includes("Content")) {
            createdObjects.push(createdChange.objectId);
          }
        }
      }
    }

    return createdObjects;
  } catch (error) {
    console.error("Error fetching transaction objects:", error);
    return [];
  }
}
