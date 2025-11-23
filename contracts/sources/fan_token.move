module ownlyfans::fan_token;

use sui::event;
use sui::table::{Self, Table};

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

/// Creator Token Statistics
/// 創作者代幣統計
public struct CreatorTokenStats has key {
    id: UID,
    creator: address,
    total_minted: u64,
    total_burned: u64,
}

/// Creator Stats Map to store creator -> stats_id mapping
/// 創作者統計映射表，存儲創作者 -> 統計對象 ID 的映射
public struct CreatorStatsMap has key {
    id: UID,
    map: Table<address, ID>,
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

/// Event emitted when tokens are minted for a creator
/// 為創作者鑄造代幣時發出的事件
public struct TokensMinted has copy, drop {
    creator: address,
    amount: u64,
    new_total_minted: u64,
}

/// Event emitted when tokens are burned for a creator
/// 為創作者銷毀代幣時發出的事件
public struct CreatorTokensBurned has copy, drop {
    creator: address,
    amount: u64,
    new_total_burned: u64,
}

/// Event emitted when CreatorStatsMap is initialized
/// CreatorStatsMap 初始化時發出的事件
public struct CreatorStatsMapInitialized has copy, drop {
    stats_map_id: ID,
}

/// Event emitted when CreatorTokenStats is created
/// 創建 CreatorTokenStats 時發出的事件
public struct CreatorStatsCreated has copy, drop {
    creator: address,
    stats_id: ID,
}

/// Constants for reward calculation
/// 獎勵計算的常數
const MIST_PER_SUI: u64 = 1_000_000_000;         // 1 SUI = 10^9 MIST
const MULTIPLIER_SCALE: u64 = 1000;              // Represents 1.0x
const BASE_RATE_POINTS_PER_SUI: u64 = 10000;     // 1 SUI = 10,000 base tokens
const ACTION_MULTIPLIER_CONTENT: u64 = 1000;     // 1.0x for content purchase
const ACTION_MULTIPLIER_SUB: u64 = 700;           // 0.7x for subscription

/// Early buyer bonus tiers
/// 早期購買者獎勵等級
const EARLY_BONUS_TIER1: u64 = 2000;              // 2.0x for sold_count < 10
const EARLY_BONUS_TIER2: u64 = 1500;              // 1.5x for 10 <= sold_count < 100
const EARLY_BONUS_TIER3: u64 = 1000;              // 1.0x for sold_count >= 100

/// Time constants for streak calculation
/// 用於計算連續訂閱的時間常數
/// const PERIOD_SECONDS: u64 = 30 * 24 * 60 * 60;    // 30 days in seconds
const GRACE_SECONDS: u64 = 3 * 24 * 60 * 60;      // 3 days grace period

/// Error codes
/// 錯誤代碼
const E_INSUFFICIENT_BALANCE: u64 = 1;
const E_STATS_NOT_FOUND: u64 = 2;
const E_STATS_ALREADY_EXISTS: u64 = 3;

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
public fun add_reward(
    account: &mut FanTokenAccount,
    stats: &mut CreatorTokenStats,
    amount: u64
) {
    account.balance = account.balance + amount;
    increment_total_minted(stats, amount);
}

/// Calculate reward for content purchase
/// 計算內容購買的獎勵
public fun calculate_content_reward(
    spend_amount_sui: u64,
    sold_count: u64
): u64 {
    // raw_tokens = (spend_amount_mist * BASE_RATE_POINTS_PER_SUI) / MIST_PER_SUI
    let raw_tokens = (spend_amount_sui * BASE_RATE_POINTS_PER_SUI) / MIST_PER_SUI;
    
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
    // raw_tokens = (spend_amount_mist * BASE_RATE_POINTS_PER_SUI) / MIST_PER_SUI
    let raw_tokens = (spend_amount_sui * BASE_RATE_POINTS_PER_SUI) / MIST_PER_SUI;
    
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

/// Burn tokens from account (public version)
/// 從帳戶銷毀代幣（公開版本）
public fun burn_token_internal(
    account: &mut FanTokenAccount,
    stats: &mut CreatorTokenStats,
    amount: u64,
    _ctx: &TxContext
) {
    // Verify caller is the account owner (or authorized module)
    // Note: In Move, we can't easily verify caller in public functions called by other modules
    // but the FanTokenAccount is an owned object, so only the owner can pass a mutable reference
    // to a transaction entry function.
    // 注意：在 Move 中，我們無法輕易驗證其他模組調用的公開函數中的調用者
    // 但 FanTokenAccount 是一個擁有的對象，因此只有擁有者可以將可變引用傳遞給交易入口函數。
    
    // Verify sufficient balance
    // 驗證餘額充足
    assert!(account.balance >= amount, E_INSUFFICIENT_BALANCE);
    
    // Update balance and total_burned
    // 更新餘額和總銷毀量
    account.balance = account.balance - amount;
    account.total_burned = account.total_burned + amount;
    
    // Update creator stats
    // 更新創作者統計
    increment_total_burned(stats, amount);
    
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

/// Burn tokens from account
/// 從帳戶銷毀代幣
public entry fun burn_token(
    account: &mut FanTokenAccount,
    stats: &mut CreatorTokenStats,
    amount: u64,
    ctx: &TxContext
) {
    // Verify caller is the account owner
    // 驗證調用者是帳戶擁有者
    let caller = sui::tx_context::sender(ctx);
    assert!(caller == account.user, 2);
    
    burn_token_internal(account, stats, amount, ctx);
}

/// Initialize CreatorStatsMap (called once during module initialization)
/// 初始化創作者統計映射表（在模組初始化時調用一次）
fun init(ctx: &mut TxContext) {
    let map = CreatorStatsMap {
        id: sui::object::new(ctx),
        map: table::new(ctx),
    };
    let map_id = sui::object::id(&map);
    event::emit(CreatorStatsMapInitialized {
        stats_map_id: map_id,
    });
    transfer::share_object(map);
}

/// Create and share CreatorStatsMap for testing (test-only)
/// 為測試創建並共享 CreatorStatsMap（僅測試用）
#[test_only]
public fun create_and_share_stats_map_for_testing(ctx: &mut TxContext) {
    let map = CreatorStatsMap {
        id: sui::object::new(ctx),
        map: table::new(ctx),
    };
    let map_id = sui::object::id(&map);
    event::emit(CreatorStatsMapInitialized {
        stats_map_id: map_id,
    });
    transfer::share_object(map);
}

/// Create creator token statistics
/// 創建創作者代幣統計
public fun create_creator_stats(
    stats_map: &mut CreatorStatsMap,
    creator: address,
    ctx: &mut TxContext
): ID {
    // Check if stats already exists
    // 檢查統計是否已存在
    assert!(!table::contains(&stats_map.map, creator), E_STATS_ALREADY_EXISTS);
    
    let stats = CreatorTokenStats {
        id: sui::object::new(ctx),
        creator,
        total_minted: 0,
        total_burned: 0,
    };
    
    let stats_id = sui::object::id(&stats);
    table::add(&mut stats_map.map, creator, stats_id);
    transfer::share_object(stats);
    
    // Emit event
    // 發出事件
    event::emit(CreatorStatsCreated {
        creator,
        stats_id,
    });
    
    stats_id
}

/// Get creator stats ID from map
/// 從映射表中獲取創作者統計 ID
public fun get_creator_stats_id(
    stats_map: &CreatorStatsMap,
    creator: address
): ID {
    assert!(table::contains(&stats_map.map, creator), E_STATS_NOT_FOUND);
    *table::borrow(&stats_map.map, creator)
}

/// Increment total minted for creator
/// 增加創作者的總鑄造量
public fun increment_total_minted(
    stats: &mut CreatorTokenStats,
    amount: u64
) {
    stats.total_minted = stats.total_minted + amount;
    event::emit(TokensMinted {
        creator: stats.creator,
        amount,
        new_total_minted: stats.total_minted,
    });
}

/// Increment total burned for creator
/// 增加創作者的總銷毀量
public fun increment_total_burned(
    stats: &mut CreatorTokenStats,
    amount: u64
) {
    stats.total_burned = stats.total_burned + amount;
    event::emit(CreatorTokensBurned {
        creator: stats.creator,
        amount,
        new_total_burned: stats.total_burned,
    });
}

/// Get total minted
/// 獲取總鑄造量
public fun get_total_minted(stats: &CreatorTokenStats): u64 {
    stats.total_minted
}

/// Get total burned for creator
/// 獲取創作者的總銷毀量
public fun get_creator_total_burned(stats: &CreatorTokenStats): u64 {
    stats.total_burned
}

/// Get current supply (total_minted - total_burned)
/// 獲取當前供應量（總鑄造量 - 總銷毀量）
public fun get_current_supply(stats: &CreatorTokenStats): u64 {
    if (stats.total_minted >= stats.total_burned) {
        stats.total_minted - stats.total_burned
    } else {
        0
    }
}

/// Get creator address from stats
/// 從統計中獲取創作者地址
public fun get_creator_from_stats(stats: &CreatorTokenStats): address {
    stats.creator
}

