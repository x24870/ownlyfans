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
  "0xcdb139c9d28f061ff9e090264788d80bdcdc60e0a26496be63991f371e9ab38d";

export function setContractPackageId(packageId: string) {
  CONTRACT_PACKAGE_ID = packageId;
}

export function getContractPackageId(): string {
  return CONTRACT_PACKAGE_ID;
}

/**
 * Get Fan Token Account for a specific creator and user
 * 獲取特定創作者和用戶的 Fan Token 帳戶
 */
export async function getFanTokenAccount(
  creatorAddress: string,
  userAddress: string
) {
  try {
    if (!CONTRACT_PACKAGE_ID) {
      return null;
    }

    const objects = await suiClient.getOwnedObjects({
      owner: userAddress,
      filter: {
        StructType: `${CONTRACT_PACKAGE_ID}::fan_token::FanTokenAccount`,
      },
      options: {
        showContent: true,
      },
    });

    // Find account for this creator
    const account = objects.data.find((obj) => {
      const content = obj.data?.content as any;
      return content?.fields?.creator === creatorAddress;
    });

    return account?.data;
  } catch (error) {
    console.error("Error fetching fan token account:", error);
    return null;
  }
}

/**
 * Get all Fan Token Accounts for a user
 * 獲取用戶的所有 Fan Token 帳戶
 */
export async function getAllFanTokenAccounts(userAddress: string) {
  try {
    if (!CONTRACT_PACKAGE_ID) {
      return [];
    }

    const objects = await suiClient.getOwnedObjects({
      owner: userAddress,
      filter: {
        StructType: `${CONTRACT_PACKAGE_ID}::fan_token::FanTokenAccount`,
      },
      options: {
        showContent: true,
      },
    });

    return objects.data.map((obj) => obj.data).filter(Boolean);
  } catch (error) {
    console.error("Error fetching all fan token accounts:", error);
    return [];
  }
}

/**
 * Get total burned tokens across all creators for a user
 * 獲取用戶在所有創作者中總共燒毀的代幣數量
 */
export async function getTotalBurnedTokens(
  userAddress: string
): Promise<bigint> {
  try {
    const accounts = await getAllFanTokenAccounts(userAddress);
    let totalBurned = BigInt(0);

    for (const account of accounts) {
      const fields = (account?.content as any)?.fields;
      if (fields?.total_burned) {
        totalBurned += BigInt(fields.total_burned);
      }
    }

    return totalBurned;
  } catch (error) {
    console.error("Error calculating total burned tokens:", error);
    return BigInt(0);
  }
}

/**
 * Burn Fan Tokens
 * 銷毀 Fan Token
 */
export async function burnFanTokenTransaction(
  accountId: string,
  creatorAddress: string,
  amount: bigint
): Promise<Transaction> {
  const tx = new Transaction();

  // Get CreatorTokenStats
  const creatorStatsId = await getCreatorTokenStatsId(creatorAddress);
  if (!creatorStatsId) {
    throw new Error("CreatorTokenStats not found for this creator.");
  }

  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::fan_token::burn_token`,
    arguments: [
      tx.object(accountId),
      tx.object(creatorStatsId),
      tx.pure.u64(amount),
    ],
  });
  return tx;
}

/**
 * Create a new Creator Campaign
 * 創建新的創作者活動
 */
export function createCampaignTransaction(
  title: string,
  description: string,
  cost: bigint
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::campaign::create_campaign`,
    arguments: [
      tx.pure.string(title),
      tx.pure.string(description),
      tx.pure.u64(cost),
    ],
  });
  return tx;
}

/**
 * Join a Creator Campaign
 * 參加創作者活動
 */
export async function joinCampaignTransaction(
  campaignId: string,
  fanTokenAccountId: string,
  creatorAddress: string
): Promise<Transaction> {
  const tx = new Transaction();

  // Get CreatorTokenStats
  const creatorStatsId = await getCreatorTokenStatsId(creatorAddress);
  if (!creatorStatsId) {
    throw new Error("CreatorTokenStats not found for this creator.");
  }

  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::campaign::join_campaign`,
    arguments: [
      tx.object(campaignId),
      tx.object(fanTokenAccountId),
      tx.object(creatorStatsId),
    ],
  });
  return tx;
}

/**
 * Get campaigns for a creator
 * 獲取創作者的活動
 */
export async function getCreatorCampaigns(creatorAddress: string) {
  try {
    if (!CONTRACT_PACKAGE_ID) {
      return [];
    }

    // Query CampaignCreated events
    const events = await suiClient.queryEvents({
      query: {
        MoveModule: {
          package: CONTRACT_PACKAGE_ID,
          module: "campaign",
        },
      },
      limit: 50,
      order: "descending",
    });

    const campaigns = [];
    for (const event of events.data) {
      const parsedJson = event.parsedJson as any;
      if (parsedJson?.creator === creatorAddress && parsedJson?.campaign_id) {
        try {
          const obj = await suiClient.getObject({
            id: parsedJson.campaign_id,
            options: {
              showContent: true,
            },
          });
          if (obj.data) {
            campaigns.push(obj.data);
          }
        } catch (e) {
          console.warn(`Campaign ${parsedJson.campaign_id} not found`, e);
        }
      }
    }
    return campaigns;
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return [];
  }
}

/**
 * Check if user has joined a campaign
 * 檢查用戶是否已參加活動
 */
export async function hasJoinedCampaign(
  campaignId: string,
  userAddress: string
): Promise<boolean> {
  try {
    if (!CONTRACT_PACKAGE_ID) return false;

    // Query CampaignJoined events
    const events = await suiClient.queryEvents({
      query: {
        MoveModule: {
          package: CONTRACT_PACKAGE_ID,
          module: "campaign",
        },
      },
      limit: 100,
      order: "descending",
    });

    // Filter for specific campaign and user
    // Ideally we would query by sender but event query is limited
    return events.data.some((event) => {
      const parsedJson = event.parsedJson as any;
      return (
        parsedJson?.campaign_id === campaignId &&
        parsedJson?.user === userAddress
      );
    });
  } catch (error) {
    console.error("Error checking campaign participation:", error);
    return false;
  }
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
  subscriptionId: string | null,
  sender: string
): Promise<Uint8Array> {
  // Fetch content object to get creatorId and allowlistId if not provided
  // 如果未提供，獲取內容對象以獲取 creatorId 和 allowlistId
  let resolvedCreatorId = creatorId;
  let resolvedAllowlistId = allowlistId;

  if (!resolvedCreatorId || !resolvedAllowlistId) {
    const contentInfo = await getContentInfo(contentId);
    const fields = (contentInfo.data?.content as any)?.fields;

    if (!resolvedCreatorId && fields?.creator_id) {
      resolvedCreatorId = fields.creator_id;
    }

    if (!resolvedAllowlistId && fields?.allowlist_id) {
      resolvedAllowlistId = fields.allowlist_id;
    }
  }

  // Validate that we have all required IDs
  // 驗證我們擁有所有必需的 ID
  if (!resolvedCreatorId) {
    throw new Error(
      "Creator ID is required but not found / 需要創作者 ID 但未找到"
    );
  }
  if (!resolvedAllowlistId) {
    throw new Error(
      "Allowlist ID is required but not found / 需要允許列表 ID 但未找到"
    );
  }

  const tx = new Transaction();

  // Set the sender address (required for building the transaction)
  // 設置發送者地址（構建交易時必需）
  tx.setSender(sender);

  // Import SUI_CLOCK_OBJECT_ID
  const SUI_CLOCK_OBJECT_ID = "0x6";

  // Use different function based on whether subscription exists
  // 根據是否存在訂閱使用不同的函數
  if (
    subscriptionId &&
    subscriptionId !==
      "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    // User has subscription - use seal_approve_with_subscription
    // 用戶有訂閱 - 使用 seal_approve_with_subscription
    tx.moveCall({
      target: `${CONTRACT_PACKAGE_ID}::seal_access::seal_approve_with_subscription`,
      arguments: [
        tx.pure.vector("u8", Array.from(sealIdBytes)),
        tx.object(resolvedCreatorId),
        tx.object(contentId),
        tx.object(resolvedAllowlistId),
        tx.object(subscriptionId),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
  } else {
    // User has no subscription - use seal_approve (without subscription)
    // 用戶沒有訂閱 - 使用 seal_approve（無訂閱）
    tx.moveCall({
      target: `${CONTRACT_PACKAGE_ID}::seal_access::seal_approve`,
      arguments: [
        tx.pure.vector("u8", Array.from(sealIdBytes)),
        tx.object(resolvedCreatorId),
        tx.object(contentId),
        tx.object(resolvedAllowlistId),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
  }

  return await tx.build({ client: suiClient, onlyTransactionKind: true });
}

/**
 * Create content on-chain
 * 在鏈上創建內容
 */
export async function registerCreatorTransaction(
  subscriptionPrice: bigint
): Promise<Transaction> {
  const tx = new Transaction();

  // Get CreatorStatsMap
  const statsMapId = await getCreatorStatsMapId();
  if (!statsMapId) {
    throw new Error(
      "CreatorStatsMap not found. Please ensure the contract is properly initialized."
    );
  }

  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::creator_registry::register_creator`,
    arguments: [tx.object(statsMapId), tx.pure.u64(subscriptionPrice)],
  });
  return tx;
}

export async function subscribeCreatorTransaction(
  creatorId: string,
  subscriptionPrice: bigint,
  sender?: string,
  referralAddress?: string | null
): Promise<Transaction> {
  if (!sender) {
    throw new Error("Sender address required for subscription");
  }

  const tx = new Transaction();

  // Get creator owner address
  const creatorInfo = await getCreatorInfo(creatorId);
  const creatorOwner = (creatorInfo.data?.content as any)?.fields?.owner;

  if (!creatorOwner) {
    throw new Error("Creator owner not found");
  }

  // Check for existing FanTokenAccount
  const existingAccount = await getFanTokenAccount(creatorOwner, sender);
  let fanTokenAccountArg;
  let isNewAccount = false;

  if (existingAccount) {
    fanTokenAccountArg = tx.object(existingAccount.objectId);
  } else {
    const [newAccount] = tx.moveCall({
      target: `${CONTRACT_PACKAGE_ID}::fan_token::create_account`,
      arguments: [tx.pure.address(creatorOwner)],
    });
    fanTokenAccountArg = newAccount;
    isNewAccount = true;
  }

  // Get CreatorTokenStats
  const creatorStatsId = await getCreatorTokenStatsId(creatorOwner);
  if (!creatorStatsId) {
    throw new Error("CreatorTokenStats not found for this creator.");
  }

  const [paymentCoin] = tx.splitCoins(tx.gas, [subscriptionPrice]);

  // Use referral address from parameter or default to 0x0
  const referral = referralAddress || "0x0";

  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::subscription::subscribe_creator`,
    arguments: [
      tx.object(creatorId),
      fanTokenAccountArg,
      tx.object(creatorStatsId),
      paymentCoin,
      tx.pure.address(referral),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  if (isNewAccount) {
    tx.transferObjects([fanTokenAccountArg], tx.pure.address(sender));
  }

  // Note: Don't call tx.setSender here - let signAndExecute handle it
  // 注意：不要在這裡調用 tx.setSender - 讓 signAndExecute 處理它

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
  userAddress: string; // Added userAddress
}

export async function purchaseContentTransaction({
  contentId,
  allowlistId,
  price,
  referralAddress,
  userAddress,
}: PurchaseContentParams): Promise<Transaction> {
  const tx = new Transaction();
  const referral = referralAddress || "0x0";

  // Fetch content info to get allowlistId and creatorAddress
  const contentInfo = await getContentInfo(contentId);
  const contentFields = (contentInfo.data?.content as any)?.fields;

  if (!contentFields) {
    throw new Error("Content info not found.");
  }

  const resolvedAllowlistId = allowlistId || contentFields.allowlist_id;
  const creatorAddress = contentFields.creator;

  if (!resolvedAllowlistId) {
    throw new Error("Allowlist ID not found for this content.");
  }
  if (!creatorAddress) {
    throw new Error("Creator address not found for this content.");
  }

  // Get CreatorStatsMap and CreatorTokenStats
  const statsMapId = await getCreatorStatsMapId();
  if (!statsMapId) {
    throw new Error(
      "CreatorStatsMap not found. Please ensure the contract is properly initialized."
    );
  }

  const creatorStatsId = await getCreatorTokenStatsId(creatorAddress);
  if (!creatorStatsId) {
    throw new Error("CreatorTokenStats not found for this creator.");
  }

  // Check for existing FanTokenAccount
  const existingAccount = await getFanTokenAccount(creatorAddress, userAddress);
  let fanTokenAccountArg;
  let isNewAccount = false;

  if (existingAccount) {
    fanTokenAccountArg = tx.object(existingAccount.objectId);
  } else {
    // Create new account
    const [newAccount] = tx.moveCall({
      target: `${CONTRACT_PACKAGE_ID}::fan_token::create_account`,
      arguments: [tx.pure.address(creatorAddress)],
    });
    fanTokenAccountArg = newAccount;
    isNewAccount = true;
  }

  const [paymentCoin] = tx.splitCoins(tx.gas, [price]);

  tx.moveCall({
    target: `${CONTRACT_PACKAGE_ID}::referral_split::purchase_content`,
    arguments: [
      tx.object(contentId),
      tx.object(resolvedAllowlistId),
      fanTokenAccountArg,
      tx.object(creatorStatsId),
      paymentCoin,
      tx.pure.address(referral),
    ],
  });

  // If we created a new account, transfer it to user
  if (isNewAccount) {
    tx.transferObjects([fanTokenAccountArg], tx.pure.address(userAddress));
  }

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
 * Get all registered creators
 * 獲取所有已註冊的創作者
 */
export async function getAllCreators() {
  try {
    if (!CONTRACT_PACKAGE_ID) {
      return [];
    }

    const events = await suiClient.queryEvents({
      query: {
        MoveModule: {
          package: CONTRACT_PACKAGE_ID,
          module: "creator_registry",
        },
      },
      limit: 100,
      order: "descending",
    });

    const creators = [];
    const seenCreators = new Set<string>();

    for (const event of events.data) {
      const parsedJson = event.parsedJson as any;
      if (parsedJson?.creator_id && parsedJson?.owner) {
        const creatorId = parsedJson.creator_id;
        if (!seenCreators.has(creatorId)) {
          seenCreators.add(creatorId);
          try {
            const creatorObj = await getCreatorInfo(creatorId);
            if (creatorObj.data) {
              creators.push(creatorObj.data);
            }
          } catch (e) {
            console.warn(`Creator ${creatorId} not found`, e);
          }
        }
      }
    }

    return creators;
  } catch (error) {
    console.error("Error fetching all creators:", error);
    return [];
  }
}

/**
 * Get CreatorStatsMap ID from initialization event
 * 從初始化事件獲取 CreatorStatsMap ID
 */
export async function getCreatorStatsMapId(): Promise<string | null> {
  try {
    if (!CONTRACT_PACKAGE_ID) {
      return null;
    }

    const events = await suiClient.queryEvents({
      query: {
        MoveModule: {
          package: CONTRACT_PACKAGE_ID,
          module: "fan_token",
        },
      },
      limit: 100,
      order: "descending",
    });

    for (const event of events.data) {
      const parsedJson = event.parsedJson as any;
      if (parsedJson?.stats_map_id) {
        return parsedJson.stats_map_id;
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching CreatorStatsMap ID:", error);
    return null;
  }
}

/**
 * Get Creator Token Stats ID from CreatorStatsCreated events
 * 從 CreatorStatsCreated 事件獲取創作者代幣統計 ID
 */
export async function getCreatorTokenStatsId(
  creatorAddress: string
): Promise<string | null> {
  try {
    if (!CONTRACT_PACKAGE_ID) {
      return null;
    }

    // Query CreatorStatsCreated events
    // 查詢 CreatorStatsCreated 事件
    const events = await suiClient.queryEvents({
      query: {
        MoveEventType: `${CONTRACT_PACKAGE_ID}::fan_token::CreatorStatsCreated`,
      },
      limit: 100,
      order: "descending",
    });

    // Find the event for this creator
    // 找到此創作者的事件
    for (const event of events.data) {
      const parsedJson = event.parsedJson as any;
      if (parsedJson?.creator === creatorAddress && parsedJson?.stats_id) {
        return parsedJson.stats_id;
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching CreatorTokenStats ID:", error);
    return null;
  }
}

/**
 * Get Creator Token Statistics
 * 獲取創作者代幣統計
 */
export async function getCreatorTokenStats(creatorAddress: string) {
  try {
    if (!CONTRACT_PACKAGE_ID) {
      return null;
    }

    const statsId = await getCreatorTokenStatsId(creatorAddress);
    if (!statsId) {
      return null;
    }

    const obj = await suiClient.getObject({
      id: statsId,
      options: {
        showContent: true,
      },
    });

    return obj.data;
  } catch (error) {
    console.error("Error fetching creator token stats:", error);
    return null;
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
