module ownlyfans::allowlist;

/// Allowlist for per-file content access
/// 每個文件內容訪問的允許列表
public struct Allowlist has key {
    id: UID,
    content_id: ID,                    // Reference to Content
    buyers: vector<address>,           // List of addresses who purchased this content
}

/// Create a new allowlist for content
/// 為內容創建新的允許列表
public fun create_allowlist(
    content_id: ID,
    ctx: &mut TxContext
): Allowlist {
    Allowlist {
        id: sui::object::new(ctx),
        content_id,
        buyers: vector::empty(),
    }
}

/// Add a buyer to the allowlist
/// 將購買者添加到允許列表
public fun add_buyer(allowlist: &mut Allowlist, buyer: address) {
    // Check if buyer already exists to avoid duplicates
    // 檢查購買者是否已存在以避免重複
    if (!is_buyer(allowlist, buyer)) {
        vector::push_back(&mut allowlist.buyers, buyer);
    }
}

/// Check if an address is in the allowlist
/// 檢查地址是否在允許列表中
public fun is_buyer(allowlist: &Allowlist, address: address): bool {
    let len = vector::length(&allowlist.buyers);
    let mut i = 0;
    
    while (i < len) {
        let buyer = vector::borrow(&allowlist.buyers, i);
        if (*buyer == address) {
            return true
        };
        i = i + 1;
    };
    
    false
}

/// Get allowlist ID
/// 獲取允許列表 ID
public fun get_allowlist_id(allowlist: &Allowlist): ID {
    sui::object::id(allowlist)
}

/// Get content ID
/// 獲取內容 ID
public fun get_content_id(allowlist: &Allowlist): ID {
    allowlist.content_id
}

/// Get buyers count
/// 獲取購買者數量
public fun get_buyers_count(allowlist: &Allowlist): u64 {
    vector::length(&allowlist.buyers)
}

/// Share the allowlist object (must be called from this module)
/// 共享允許列表對象（必須從此模組調用）
public fun share_allowlist(allowlist: Allowlist) {
    sui::transfer::share_object(allowlist);
}

