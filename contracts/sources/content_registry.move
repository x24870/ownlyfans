module ownlyfans::content_registry;

use sui::event;
use ownlyfans::creator_registry::{Self, Creator};
use ownlyfans::allowlist::{Self, Allowlist};

/// Content information stored on-chain
/// 鏈上存儲的內容信息
public struct Content has key {
    id: UID,
    blob_id: vector<u8>,              // Walrus blob ID (encrypted)
    price: u64,                       // Price in MIST (1 SUI = 10^9 MIST)
    referral_split_ratio: u64,        // Referral split ratio in basis points (e.g., 1500 = 15%)
    creator: address,                  // Creator address (for backwards compatibility)
    creator_id: ID,                    // Reference to Creator object
    allowlist_id: ID,                  // Reference to Allowlist object
    seal_suffix: vector<u8>,          // Seal identity suffix (deterministic)
    created_at: u64,                  // Timestamp
    sold_count: u64,                  // Number of times this content has been sold
}

/// Event emitted when content is created
/// 創建內容時發出的事件
public struct ContentCreated has copy, drop {
    content_id: ID,
    blob_id: vector<u8>,
    price: u64,
    referral_split_ratio: u64,
    creator: address,
    creator_id: ID,
    allowlist_id: ID,
    seal_suffix: vector<u8>,
    sold_count: u64,
}

/// Get content information
/// 獲取內容信息
public fun get_content_id(content: &Content): ID {
    sui::object::id(content)
}

public fun get_blob_id(content: &Content): vector<u8> {
    content.blob_id
}

public fun get_price(content: &Content): u64 {
    content.price
}

public fun get_referral_split_ratio(content: &Content): u64 {
    content.referral_split_ratio
}

public fun get_creator(content: &Content): address {
    content.creator
}

public fun get_creator_id(content: &Content): ID {
    content.creator_id
}

public fun get_allowlist_id(content: &Content): ID {
    content.allowlist_id
}

public fun get_seal_suffix(content: &Content): vector<u8> {
    content.seal_suffix
}

public fun get_sold_count(content: &Content): u64 {
    content.sold_count
}

/// Increment sold count (callable by other modules in the same package)
/// 增加銷售計數（可由同一包中的其他模組調用）
public(package) fun increment_sold_count(content: &mut Content) {
    content.sold_count = content.sold_count + 1;
}

/// Create new content with Seal integration
/// 使用 Seal 整合創建新內容
public fun create_content_with_seal(
    creator: &mut Creator,
    blob_id: vector<u8>,
    price: u64,
    referral_split_ratio: u64,
    ctx: &mut TxContext
): (Content, Allowlist) {
    let creator_address = creator_registry::get_owner(creator);
    let creator_id = creator_registry::get_creator_id(creator);
    
    // Increment content count and get seal suffix
    // 增加內容計數並獲取 seal 後綴
    let seal_suffix = creator_registry::increment_content_count(creator);
    
    // Create content ID placeholder (will be set after object creation)
    // 創建內容 ID 佔位符（將在對象創建後設置）
    let content_uid = sui::object::new(ctx);
    let content_id = sui::object::uid_to_inner(&content_uid);
    
    // Create allowlist for this content
    // 為此內容創建允許列表
    let allowlist = allowlist::create_allowlist(content_id, ctx);
    let allowlist_id = allowlist::get_allowlist_id(&allowlist);
    
    let content = Content {
        id: content_uid,
        blob_id,
        price,
        referral_split_ratio,
        creator: creator_address,
        creator_id,
        allowlist_id,
        seal_suffix,
        created_at: sui::tx_context::epoch_timestamp_ms(ctx),
        sold_count: 0,
    };
    
    // Emit event
    // 發出事件
    event::emit(ContentCreated {
        content_id,
        blob_id,
        price,
        referral_split_ratio,
        creator: creator_address,
        creator_id,
        allowlist_id,
        seal_suffix,
        sold_count: 0,
    });

    (content, allowlist)
}

/// Entry function to create content as shared object
/// 創建內容為共享對象的入口函數
public entry fun create_content_entry(
    creator: &mut Creator,
    blob_id: vector<u8>,
    price: u64,
    referral_split_ratio: u64,
    ctx: &mut TxContext
) {
    // Verify caller is the creator owner
    // 驗證調用者是創作者擁有者
    assert!(sui::tx_context::sender(ctx) == creator_registry::get_owner(creator), 1);
    
    let (content, allowlist) = create_content_with_seal(
        creator,
        blob_id,
        price,
        referral_split_ratio,
        ctx
    );
    
    // Make both content and allowlist shared objects
    // 將內容和允許列表都設為共享對象
    sui::transfer::share_object(content);
    allowlist::share_allowlist(allowlist);
}

/// Transfer content ownership (for future use)
/// 轉移內容所有權（供未來使用）
public fun transfer(content: Content, recipient: address, _ctx: &mut TxContext) {
    // This function can be extended for content ownership transfer
    // 此函數可擴展用於內容所有權轉移
    sui::transfer::transfer(content, recipient);
}
