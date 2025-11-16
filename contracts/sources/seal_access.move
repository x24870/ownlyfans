module ownlyfans::seal_access;

use sui::event;
use ownlyfans::content_registry::{Self, Content};

/// Event emitted when Seal SDK requests access approval
/// Seal SDK 請求訪問批准時發出的事件
public struct SealAccessApproved has copy, drop {
    content_id: ID,
    requester: address,
    approved: bool,
}

/// Check if address has purchased access to content
/// 檢查地址是否已購買內容訪問權限
/// This function is called by Seal SDK to verify access
/// 此函數由 Seal SDK 調用以驗證訪問權限
public fun seal_approve(
    content: &Content,
    requester: address,
    _ctx: &TxContext
): bool {
    // In a full implementation, we would check if the requester has purchased
    // the content by querying ContentPurchased events.
    // For PoC, we'll use a simplified check: verify the requester is not the creator
    // (since creators should have access, but we need to verify purchase for others)
    //
    // 在完整實作中，我們會通過查詢 ContentPurchased 事件來檢查請求者是否已購買內容。
    // 對於 PoC，我們使用簡化檢查：驗證請求者不是創作者
    // （因為創作者應該有訪問權限，但我們需要為其他人驗證購買）
    
    let creator = content_registry::get_creator(content);
    let approved = requester == creator;
    
    // Emit access approval event
    // 發出訪問批准事件
    event::emit(SealAccessApproved {
        content_id: content_registry::get_content_id(content),
        requester,
        approved,
    });
    
    approved
}

/// Public entry point for Seal SDK to call
/// Seal SDK 調用的公共入口點
public entry fun seal_approve_entry(
    content: &Content,
    requester: address,
    ctx: &TxContext
) {
    seal_approve(content, requester, ctx);
}
