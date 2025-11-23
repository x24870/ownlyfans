module ownlyfans::subscription;

use sui::coin::{Self, Coin};
use sui::balance;
use sui::sui::SUI;
use sui::clock::Clock;
use sui::event;
use ownlyfans::creator_registry::{Self, Creator};
use ownlyfans::fan_token::{Self, FanTokenAccount, CreatorTokenStats};

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
    referral_address: address,
    referral_share: u64,
    creator_share: u64,
}

/// Error codes
/// 錯誤代碼
const E_INSUFFICIENT_PAYMENT: u64 = 1;

/// Default referral split ratio for subscriptions (15% = 1500 basis points)
/// 訂閱的默認推廣分成比例（15% = 1500 基點）
const DEFAULT_SUBSCRIPTION_REFERRAL_RATIO: u64 = 1500;

/// Subscribe to a creator
/// 訂閱創作者
public entry fun subscribe_creator(
    creator: &Creator,
    fan_token_account: &mut FanTokenAccount,
    creator_stats: &mut CreatorTokenStats,
    payment: Coin<SUI>,
    referral_address: address,
    clock: &Clock,
    ctx: &mut TxContext
) {
    let subscriber = sui::tx_context::sender(ctx);
    let creator_id = creator_registry::get_creator_id(creator);
    let subscription_price = creator_registry::get_subscription_price(creator);
    let creator_owner = creator_registry::get_owner(creator);
    
    // Verify fan_token_account belongs to subscriber and matches creator
    assert!(fan_token::get_user(fan_token_account) == subscriber, 2);
    assert!(fan_token::get_creator(fan_token_account) == creator_owner, 3);
    
    // Verify payment amount
    // 驗證付款金額
    let payment_amount = coin::value(&payment);
    assert!(payment_amount >= subscription_price, E_INSUFFICIENT_PAYMENT);
    
    // Convert Coin to Balance for splitting
    // 將 Coin 轉換為 Balance 以便分割
    let mut payment_balance = coin::into_balance(payment);
    
    // Calculate split amounts
    // 計算分配金額
    // Anti-self-referral: If subscriber is the referral or creator is the referral, no referral reward
    // 防自推廣：如果訂閱者是推廣者或創作者是推廣者，則無推廣獎勵
    let referral_share = if (referral_address == @0x0) {
        // No referral, all goes to creator
        // 無推廣，全部歸創作者
        0
    } else if (subscriber == referral_address || creator_owner == referral_address) {
        // Anti-self-referral: No referral reward for self-referral
        // 防自推廣：自推廣無推廣獎勵
        0
    } else {
        (payment_amount * DEFAULT_SUBSCRIPTION_REFERRAL_RATIO) / 10000
    };
    let creator_share = payment_amount - referral_share;
    
    // Split payment
    // 分配付款
    if (referral_share > 0) {
        let referral_balance = balance::split(&mut payment_balance, referral_share);
        let referral_coin = coin::from_balance(referral_balance, ctx);
        transfer::public_transfer(referral_coin, referral_address);
    };
    
    // Send remaining to creator
    // 將剩餘部分發送給創作者
    if (creator_share > 0) {
        let creator_coin = coin::from_balance(payment_balance, ctx);
        transfer::public_transfer(creator_coin, creator_owner);
    } else {
        // If no creator share, return to subscriber
        // 如果沒有創作者份額，返回給訂閱者
        let return_coin = coin::from_balance(payment_balance, ctx);
        transfer::public_transfer(return_coin, subscriber);
    };
    
    // Create subscription (5 minutes for testing)
    // 創建訂閱（測試用 5 分鐘）
    let current_time = clock.timestamp_ms();
    let five_minutes_ms = 5 * 60 * 1000; // 5 minutes in milliseconds
    let expires_at_ms = current_time + five_minutes_ms;
    
    // Update streak and calculate reward
    // 更新連續訂閱次數並計算獎勵
    let streak = fan_token::update_streak_for_subscription(
        fan_token_account,
        current_time,
        expires_at_ms
    );
    
    let reward = fan_token::calculate_subscription_reward(payment_amount, streak);
    fan_token::add_reward(fan_token_account, creator_stats, reward);
    
    let subscription = Subscription {
        id: sui::object::new(ctx),
        creator_id,
        subscriber,
        created_at_ms: current_time,
        expires_at_ms, // 5 minutes for testing
    };
    
    let subscription_id = sui::object::id(&subscription);
    
    // Emit event
    // 發出事件
    event::emit(SubscriptionCreated {
        subscription_id,
        creator_id,
        subscriber,
        price: subscription_price,
        referral_address,
        referral_share,
        creator_share,
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

