module ownlyfans::creator_registry;

use sui::event;
use sui::bcs;

/// Creator information stored on-chain
/// 創作者信息存儲在鏈上
public struct Creator has key {
    id: UID,
    owner: address,                    // Creator's Sui address
    subscription_price: u64,           // Price for subscribing to all content (MIST)
    seal_namespace: vector<u8>,        // BCS encoded owner address for Seal identity
    content_count: u64,                // Counter for generating deterministic seal suffixes
}

/// Event emitted when a creator is registered
/// 創作者註冊時發出的事件
public struct CreatorRegistered has copy, drop {
    creator_id: ID,
    owner: address,
    subscription_price: u64,
}

/// Register as a creator
/// 註冊為創作者
public entry fun register_creator(
    subscription_price: u64,
    ctx: &mut TxContext
) {
    let owner = sui::tx_context::sender(ctx);
    
    // Create seal namespace from owner address
    // 從擁有者地址創建 seal 命名空間
    let seal_namespace = bcs::to_bytes(&owner);
    
    let creator = Creator {
        id: sui::object::new(ctx),
        owner,
        subscription_price,
        seal_namespace,
        content_count: 0,
    };
    
    let creator_id = sui::object::id(&creator);
    
    // Emit event
    // 發出事件
    event::emit(CreatorRegistered {
        creator_id,
        owner,
        subscription_price,
    });
    
    // Make creator a shared object so it can be referenced by others
    // 將創作者設為共享對象，以便其他人可以引用
    sui::transfer::share_object(creator);
}

/// Get creator owner address
/// 獲取創作者擁有者地址
public fun get_owner(creator: &Creator): address {
    creator.owner
}

/// Get subscription price
/// 獲取訂閱價格
public fun get_subscription_price(creator: &Creator): u64 {
    creator.subscription_price
}

/// Get seal namespace
/// 獲取 seal 命名空間
public fun get_seal_namespace(creator: &Creator): vector<u8> {
    creator.seal_namespace
}

/// Get current content count
/// 獲取當前內容計數
public fun get_content_count(creator: &Creator): u64 {
    creator.content_count
}

/// Increment content count and return new seal suffix
/// 增加內容計數並返回新的 seal 後綴
public fun increment_content_count(creator: &mut Creator): vector<u8> {
    creator.content_count = creator.content_count + 1;
    // Return BCS encoded content count as seal suffix
    // 返回 BCS 編碼的內容計數作為 seal 後綴
    bcs::to_bytes(&creator.content_count)
}

/// Get creator ID
/// 獲取創作者 ID
public fun get_creator_id(creator: &Creator): ID {
    sui::object::id(creator)
}

