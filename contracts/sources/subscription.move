module ownlyfans::subscription;

use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::clock::Clock;
use sui::event;
use ownlyfans::creator_registry::{Self, Creator};

/// Subscription to a creator's all content
/// 訂閱創作者的所有內容
public struct Subscription has key {
    id: UID,
    creator_id: ID,                    // Reference to Creator
    subscriber: address,               // Subscriber address
    created_at_ms: u64,                // Timestamp when subscription was created
    expires_at_ms: u64,                // Expiration timestamp (set to max u64 for lifetime PoC)
}

/// Event emitted when a subscription is created
/// 創建訂閱時發出的事件
public struct SubscriptionCreated has copy, drop {
    subscription_id: ID,
    creator_id: ID,
    subscriber: address,
    price: u64,
}

/// Error codes
/// 錯誤代碼
const E_INSUFFICIENT_PAYMENT: u64 = 1;

/// Subscribe to a creator
/// 訂閱創作者
public entry fun subscribe_creator(
    creator: &Creator,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext
) {
    let subscriber = sui::tx_context::sender(ctx);
    let creator_id = creator_registry::get_creator_id(creator);
    let subscription_price = creator_registry::get_subscription_price(creator);
    let creator_owner = creator_registry::get_owner(creator);
    
    // Verify payment amount
    // 驗證付款金額
    let payment_amount = coin::value(&payment);
    assert!(payment_amount >= subscription_price, E_INSUFFICIENT_PAYMENT);
    
    // Transfer payment to creator
    // 將付款轉給創作者
    transfer::public_transfer(payment, creator_owner);
    
    // Create subscription (5 minutes for testing)
    // 創建訂閱（測試用 5 分鐘）
    let current_time = clock.timestamp_ms();
    let five_minutes_ms = 5 * 60 * 1000; // 5 minutes in milliseconds
    let subscription = Subscription {
        id: sui::object::new(ctx),
        creator_id,
        subscriber,
        created_at_ms: current_time,
        expires_at_ms: current_time + five_minutes_ms, // 5 minutes for testing
    };
    
    let subscription_id = sui::object::id(&subscription);
    
    // Emit event
    // 發出事件
    event::emit(SubscriptionCreated {
        subscription_id,
        creator_id,
        subscriber,
        price: subscription_price,
    });
    
    // Make subscription a shared object so it can be used in seal_approve
    // 將訂閱設為共享對象，以便在 seal_approve 中使用
    sui::transfer::share_object(subscription);
}

/// Check if a subscription is valid
/// 檢查訂閱是否有效
public fun is_valid_subscription(
    subscription: &Subscription,
    creator_id: ID,
    subscriber: address,
    clock: &Clock
): bool {
    // Check if subscription matches creator and subscriber
    // 檢查訂閱是否與創作者和訂閱者匹配
    if (subscription.creator_id != creator_id) {
        return false
    };
    
    if (subscription.subscriber != subscriber) {
        return false
    };
    
    // Check if subscription is not expired
    // 檢查訂閱是否未過期
    let current_time = clock.timestamp_ms();
    if (current_time >= subscription.expires_at_ms) {
        return false
    };
    
    true
}

/// Get subscription ID
/// 獲取訂閱 ID
public fun get_subscription_id(subscription: &Subscription): ID {
    sui::object::id(subscription)
}

/// Get creator ID
/// 獲取創作者 ID
public fun get_creator_id(subscription: &Subscription): ID {
    subscription.creator_id
}

/// Get subscriber address
/// 獲取訂閱者地址
public fun get_subscriber(subscription: &Subscription): address {
    subscription.subscriber
}

