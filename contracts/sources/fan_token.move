module ownlyfans::fan_token;

use sui::event;
use sui::object::{Self, UID, ID};
use sui::tx_context::{Self, TxContext};

/// Fan Token Account for a user-creator pair
/// 用戶-創作者對的 Fan Token 帳戶
public struct FanTokenAccount has key, store {
    id: UID,
    user: address,
    creator: address,
    balance: u64,
    total_burned: u64,
    streak: u64,
    last_expiry: u64,
}

/// Event emitted when tokens are burned
/// 代幣被銷毀時發出的事件
public struct TokenBurned has copy, drop {
    account_id: ID,
    user: address,
    creator: address,
    amount: u64,
    new_balance: u64,
    new_total_burned: u64,
}

/// Constants for reward calculation
/// 獎勵計算的常數
const MULTIPLIER_SCALE: u64 = 1000;              // Represents 1.0x
const BASE_RATE_POINTS_PER_SUI: u64 = 10;        // 1 SUI = 10 base tokens
const ACTION_MULTIPLIER_CONTENT: u64 = 1000;     // 1.0x for content purchase
const ACTION_MULTIPLIER_SUB: u64 = 700;           // 0.7x for subscription

/// Early buyer bonus tiers
/// 早期購買者獎勵等級
const EARLY_BONUS_TIER1: u64 = 2000;              // 2.0x for sold_count < 10
const EARLY_BONUS_TIER2: u64 = 1500;              // 1.5x for 10 <= sold_count < 100
const EARLY_BONUS_TIER3: u64 = 1000;              // 1.0x for sold_count >= 100

/// Time constants for streak calculation
/// 用於計算連續訂閱的時間常數
const PERIOD_SECONDS: u64 = 30 * 24 * 60 * 60;    // 30 days in seconds
const GRACE_SECONDS: u64 = 3 * 24 * 60 * 60;      // 3 days grace period

/// Error codes
/// 錯誤代碼
const E_INSUFFICIENT_BALANCE: u64 = 1;

/// Create a new Fan Token Account
/// 創建新的 Fan Token 帳戶
public fun create_account(
    creator: address,
    ctx: &mut TxContext
): FanTokenAccount {
    let user = sui::tx_context::sender(ctx);
    FanTokenAccount {
        id: sui::object::new(ctx),
        user,
        creator,
        balance: 0,
        total_burned: 0,
        streak: 0,
        last_expiry: 0,
    }
}

/// Get user address
/// 獲取用戶地址
public fun get_user(account: &FanTokenAccount): address {
    account.user
}

/// Get creator address
/// 獲取創作者地址
public fun get_creator(account: &FanTokenAccount): address {
    account.creator
}

/// Get balance
/// 獲取餘額
public fun get_balance(account: &FanTokenAccount): u64 {
    account.balance
}

/// Get total burned
/// 獲取總銷毀量
public fun get_total_burned(account: &FanTokenAccount): u64 {
    account.total_burned
}

/// Get streak
/// 獲取連續訂閱次數
public fun get_streak(account: &FanTokenAccount): u64 {
    account.streak
}

/// Get last expiry
/// 獲取上次過期時間
public fun get_last_expiry(account: &FanTokenAccount): u64 {
    account.last_expiry
}

/// Add reward tokens to account
/// 向帳戶添加獎勵代幣
public fun add_reward(account: &mut FanTokenAccount, amount: u64) {
    account.balance = account.balance + amount;
}

/// Calculate reward for content purchase
/// 計算內容購買的獎勵
public fun calculate_content_reward(
    spend_amount_sui: u64,
    sold_count: u64
): u64 {
    // raw_tokens = spend_amount_sui * BASE_RATE_POINTS_PER_SUI
    let raw_tokens = spend_amount_sui * BASE_RATE_POINTS_PER_SUI;
    
    // Determine bonus multiplier based on sold_count
    // 根據 sold_count 確定獎勵倍數
    let bonus_multiplier = if (sold_count < 10) {
        EARLY_BONUS_TIER1
    } else if (sold_count < 100) {
        EARLY_BONUS_TIER2
    } else {
        EARLY_BONUS_TIER3
    };
    
    // reward = raw_tokens * action_multiplier * bonus_multiplier / (MULTIPLIER_SCALE * MULTIPLIER_SCALE)
    // 獎勵 = 原始代幣 * 操作倍數 * 獎勵倍數 / (倍數比例 * 倍數比例)
    let reward = (raw_tokens * ACTION_MULTIPLIER_CONTENT * bonus_multiplier) / (MULTIPLIER_SCALE * MULTIPLIER_SCALE);
    
    reward
}

/// Calculate reward for subscription
/// 計算訂閱的獎勵
public fun calculate_subscription_reward(
    spend_amount_sui: u64,
    streak: u64
): u64 {
    // raw_tokens = spend_amount_sui * BASE_RATE_POINTS_PER_SUI
    let raw_tokens = spend_amount_sui * BASE_RATE_POINTS_PER_SUI;
    
    // Determine loyalty bonus multiplier based on streak
    // 根據連續訂閱次數確定忠誠度獎勵倍數
    let loyalty_multiplier = if (streak == 1) {
        1000  // 1.0x
    } else if (streak == 2) {
        1100  // 1.1x
    } else if (streak == 3) {
        1200  // 1.2x
    } else if (streak == 4) {
        1300  // 1.3x
    } else if (streak == 5) {
        1400  // 1.4x
    } else {
        1500  // 1.5x for streak >= 6
    };
    
    // reward = raw_tokens * action_multiplier * loyalty_multiplier / (MULTIPLIER_SCALE * MULTIPLIER_SCALE)
    // 獎勵 = 原始代幣 * 操作倍數 * 忠誠度倍數 / (倍數比例 * 倍數比例)
    let reward = (raw_tokens * ACTION_MULTIPLIER_SUB * loyalty_multiplier) / (MULTIPLIER_SCALE * MULTIPLIER_SCALE);
    
    reward
}

/// Update streak and last expiry, and return loyalty multiplier
/// 更新連續訂閱次數和上次過期時間，並返回忠誠度倍數
public fun update_streak_for_subscription(
    account: &mut FanTokenAccount,
    current_time_ms: u64,
    new_expiry_ms: u64
): u64 {
    // Calculate new streak
    let old_expiry_ms = account.last_expiry;
    let streak_increment = if (old_expiry_ms == 0) {
        1 // First subscription, start at 1
    } else {
        let check = calculate_streak(old_expiry_ms, current_time_ms);
        if (check > 0) {
            account.streak + 1 // Increment streak
        } else {
            1 // Reset to 1
        }
    };
    
    // Update account
    account.streak = streak_increment;
    account.last_expiry = new_expiry_ms;
    
    streak_increment
}

/// Calculate streak from old expiry and current time
/// 從舊的過期時間和當前時間計算連續訂閱次數
public fun calculate_streak(
    old_expiry_ms: u64,
    current_time_ms: u64
): u64 {
    // Convert milliseconds to seconds for comparison
    // 將毫秒轉換為秒以便比較
    let old_expiry_sec = old_expiry_ms / 1000;
    let current_time_sec = current_time_ms / 1000;
    
    // Check if subscription is within grace period
    // 檢查訂閱是否在寬限期內
    if (current_time_sec <= old_expiry_sec + GRACE_SECONDS) {
        // Within grace period, maintain or increment streak
        // 在寬限期內，維持或增加連續訂閱次數
        // Note: We don't have the previous streak passed to this pure function, 
        // but this function is helper for update_streak_for_subscription which handles it.
        // For this pure helper, we return 1 to indicate "maintain streak logic" vs "reset"
        // Actually, let's just use update_streak_for_subscription logic
        1 // Return value logic handled in update_streak_for_subscription
    } else {
        // Expired beyond grace period, reset to 1
        // 超過寬限期過期，重置為 1
        0 // Return 0 to indicate reset
    }
}

/// Burn tokens from account
/// 從帳戶銷毀代幣
public entry fun burn_token(
    account: &mut FanTokenAccount,
    amount: u64,
    ctx: &TxContext
) {
    // Verify caller is the account owner
    // 驗證調用者是帳戶擁有者
    let caller = sui::tx_context::sender(ctx);
    assert!(caller == account.user, 2);
    
    // Verify sufficient balance
    // 驗證餘額充足
    assert!(account.balance >= amount, E_INSUFFICIENT_BALANCE);
    
    // Update balance and total_burned
    // 更新餘額和總銷毀量
    account.balance = account.balance - amount;
    account.total_burned = account.total_burned + amount;
    
    // Emit event
    // 發出事件
    event::emit(TokenBurned {
        account_id: sui::object::id(account),
        user: account.user,
        creator: account.creator,
        amount,
        new_balance: account.balance,
        new_total_burned: account.total_burned,
    });
}

