module ownlyfans::seal_access;

use sui::event;
use sui::clock::Clock;
use sui::object::ID;
use ownlyfans::content_registry::{Self, Content};
use ownlyfans::creator_registry::{Self, Creator};
use ownlyfans::allowlist::{Self, Allowlist};
use ownlyfans::subscription::{Self, Subscription};

/// Event emitted when Seal SDK requests access approval
/// Seal SDK 請求訪問批准時發出的事件
public struct SealAccessApproved has copy, drop {
    content_id: ID,
    requester: address,
    approved: bool,
    access_type: vector<u8>, // "allowlist" or "subscription" or "creator"
}

/// Error codes
/// 錯誤代碼
const E_INVALID_SEAL_ID: u64 = 1;
const E_NO_ACCESS: u64 = 2;

/// Reconstruct the expected Seal ID from creator namespace and content suffix
/// 從創作者命名空間和內容後綴重建預期的 Seal ID
fun reconstruct_seal_id(
    creator_namespace: vector<u8>,
    seal_suffix: vector<u8>
): vector<u8> {
    // Concatenate namespace + suffix to create full Seal ID
    // 連接命名空間 + 後綴以創建完整的 Seal ID
    let mut full_id = creator_namespace;
    vector::append(&mut full_id, seal_suffix);
    full_id
}

/// Verify that the provided Seal ID matches the content's expected ID
/// 驗證提供的 Seal ID 與內容的預期 ID 匹配
fun verify_id_matches(
    id: &vector<u8>,
    creator: &Creator,
    content: &Content
): bool {
    let creator_namespace = creator_registry::get_seal_namespace(creator);
    let seal_suffix = content_registry::get_seal_suffix(content);
    let expected_id = reconstruct_seal_id(creator_namespace, seal_suffix);
    
    *id == expected_id
}

/// Check if caller has access via allowlist (per-file purchase)
/// 檢查調用者是否通過允許列表（每個文件購買）擁有訪問權限
fun check_allowlist_access(
    caller: address,
    allowlist: &Allowlist
): bool {
    allowlist::is_buyer(allowlist, caller)
}

/// Check if caller has access via subscription
/// 檢查調用者是否通過訂閱擁有訪問權限
fun check_subscription_access(
    caller: address,
    subscription: &Subscription,
    content: &Content,
    clock: &Clock
): bool {
    let creator_id = content_registry::get_creator_id(content);
    subscription::is_valid_subscription(subscription, creator_id, caller, clock)
}

/// Seal access policy without subscription - called by Seal key servers during decrypt
/// Seal 訪問策略（無訂閱）- 在解密期間由 Seal 密鑰服務器調用
public entry fun seal_approve(
    id: vector<u8>,
    creator: &Creator,
    content: &Content,
    allowlist: &Allowlist,
    clock: &Clock,
    ctx: &TxContext
) {
    let caller = sui::tx_context::sender(ctx);
    let creator_owner = creator_registry::get_owner(creator);
    
    // Step 1: Verify Seal ID matches this content
    // 步驟 1：驗證 Seal ID 與此內容匹配
    assert!(verify_id_matches(&id, creator, content), E_INVALID_SEAL_ID);
    
    // Step 2: Check access - creator always has access, OR allowlist (no subscription)
    // 步驟 2：檢查訪問權限 - 創作者始終擁有訪問權限，或允許列表（無訂閱）
    let is_creator = caller == creator_owner;
    let has_allowlist_access = check_allowlist_access(caller, allowlist);
    
    let approved = is_creator || has_allowlist_access;
    
    // Determine access type for event
    // 確定事件的訪問類型
    let access_type = if (is_creator) {
        b"creator"
    } else if (has_allowlist_access) {
        b"allowlist"
    } else {
        b"none"
    };
    
    // Emit access approval event (even if denied, for auditing)
    // 發出訪問批准事件（即使被拒絕，用於審計）
    event::emit(SealAccessApproved {
        content_id: content_registry::get_content_id(content),
        requester: caller,
        approved,
        access_type,
    });
    
    // Assert access is granted - this causes the transaction to abort if access is denied
    // 斷言訪問已授予 - 如果訪問被拒絕，這將導致交易中止
    assert!(approved, E_NO_ACCESS);
}

/// Seal access policy with subscription - called by Seal key servers during decrypt
/// Seal 訪問策略（有訂閱）- 在解密期間由 Seal 密鑰服務器調用
public entry fun seal_approve_with_subscription(
    id: vector<u8>,
    creator: &Creator,
    content: &Content,
    allowlist: &Allowlist,
    subscription: &Subscription,
    clock: &Clock,
    ctx: &TxContext
) {
    let caller = sui::tx_context::sender(ctx);
    let creator_owner = creator_registry::get_owner(creator);
    
    // Step 1: Verify Seal ID matches this content
    // 步驟 1：驗證 Seal ID 與此內容匹配
    assert!(verify_id_matches(&id, creator, content), E_INVALID_SEAL_ID);
    
    // Step 2: Check access - creator always has access, OR allowlist, OR subscription
    // 步驟 2：檢查訪問權限 - 創作者始終擁有訪問權限，或允許列表，或訂閱
    let is_creator = caller == creator_owner;
    let has_allowlist_access = check_allowlist_access(caller, allowlist);
    let has_subscription_access = check_subscription_access(caller, subscription, content, clock);
    
    let approved = is_creator || has_allowlist_access || has_subscription_access;
    
    // Determine access type for event
    // 確定事件的訪問類型
    let access_type = if (is_creator) {
        b"creator"
    } else if (has_allowlist_access) {
        b"allowlist"
    } else if (has_subscription_access) {
        b"subscription"
    } else {
        b"none"
    };
    
    // Emit access approval event (even if denied, for auditing)
    // 發出訪問批准事件（即使被拒絕，用於審計）
    event::emit(SealAccessApproved {
        content_id: content_registry::get_content_id(content),
        requester: caller,
        approved,
        access_type,
    });
    
    // Assert access is granted - this causes the transaction to abort if access is denied
    // 斷言訪問已授予 - 如果訪問被拒絕，這將導致交易中止
    assert!(approved, E_NO_ACCESS);
}
