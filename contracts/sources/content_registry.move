module ownlyfans::content_registry;

use sui::object::{UID};
use sui::tx_context::{TxContext};
use sui::event;
use sui::object::ID;

/// Content information stored on-chain
/// 鏈上存儲的內容信息
public struct Content has key {
    id: UID,
    blob_id: vector<u8>,              // Walrus blob ID
    price: u64,                       // Price in MIST (1 SUI = 10^9 MIST)
    referral_split_ratio: u64,        // Referral split ratio in basis points (e.g., 1500 = 15%)
    creator: address,                  // Creator address
    created_at: u64,                  // Timestamp
}

/// Event emitted when content is created
/// 創建內容時發出的事件
public struct ContentCreated has copy, drop {
    content_id: ID,
    blob_id: vector<u8>,
    price: u64,
    referral_split_ratio: u64,
    creator: address,
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

/// Create new content
/// 創建新內容
public fun create_content(
    blob_id: vector<u8>,
    price: u64,
    referral_split_ratio: u64,
    ctx: &mut TxContext
): Content {
    let content = Content {
        id: sui::object::new(ctx),
        blob_id,
        price,
        referral_split_ratio,
        creator: sui::tx_context::sender(ctx),
        created_at: sui::tx_context::epoch_timestamp_ms(ctx),
    };

    let content_id = sui::object::id(&content);
    
    // Emit event
    // 發出事件
    event::emit(ContentCreated {
        content_id,
        blob_id,
        price,
        referral_split_ratio,
        creator: sui::tx_context::sender(ctx),
    });

    content
}

/// Entry function to create content as shared object
/// 創建內容為共享對象的入口函數
public entry fun create_content_entry(
    blob_id: vector<u8>,
    price: u64,
    referral_split_ratio: u64,
    ctx: &mut TxContext
) {
    let content = create_content(blob_id, price, referral_split_ratio, ctx);
    // Make content a shared object so anyone can access it
    // 將內容設為共享對象，以便任何人都可以訪問
    sui::transfer::share_object(content);
}

/// Transfer content ownership (for future use)
/// 轉移內容所有權（供未來使用）
public fun transfer(content: Content, recipient: address, _ctx: &mut TxContext) {
    // This function can be extended for content ownership transfer
    // 此函數可擴展用於內容所有權轉移
    sui::transfer::transfer(content, recipient);
}
