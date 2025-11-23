module ownlyfans::referral_split;

use sui::coin::{Self, Coin};
use sui::balance;
use sui::sui::SUI;
use sui::event;
use ownlyfans::content_registry::{Self, Content};
use ownlyfans::allowlist::{Self, Allowlist};
use ownlyfans::fan_token::{Self, FanTokenAccount, CreatorTokenStats};

/// Event emitted when content is purchased
/// 購買內容時發出的事件
public struct ContentPurchased has copy, drop {
    content_id: ID,
    buyer: address,
    referral_address: address,
    amount: u64,
    referral_share: u64,
    creator_share: u64,
}

/// Purchase content with optional referral address
/// 購買內容（可選推廣地址）
public entry fun purchase_content(
    content: &mut Content,
    allowlist: &mut Allowlist,
    fan_token_account: &mut FanTokenAccount,
    creator_stats: &mut CreatorTokenStats,
    payment: Coin<SUI>,
    referral_address: address,
    ctx: &mut TxContext
) {
    let buyer = sui::tx_context::sender(ctx);

    // Verify fan_token_account belongs to buyer and matches creator
    assert!(fan_token::get_user(fan_token_account) == buyer, 2);
    assert!(fan_token::get_creator(fan_token_account) == content_registry::get_creator(content), 3);

    let price = content_registry::get_price(content);
    let referral_split_ratio = content_registry::get_referral_split_ratio(content);
    let creator = content_registry::get_creator(content);
    
    // Verify allowlist matches content
    // 驗證允許列表與內容匹配
    let content_id = content_registry::get_content_id(content);
    let allowlist_content_id = allowlist::get_content_id(allowlist);
    assert!(content_id == allowlist_content_id, 4);

    // Convert Coin to Balance for splitting
    // 將 Coin 轉換為 Balance 以便分割
    let mut payment_balance = coin::into_balance(payment);
    let payment_amount = balance::value(&payment_balance);
    
    // Verify payment amount
    // 驗證付款金額
    assert!(payment_amount >= price, 1);

    // Calculate and add Fan Token reward
    // 計算並添加 Fan Token 獎勵
    let sold_count = content_registry::get_sold_count(content);
    let reward = fan_token::calculate_content_reward(payment_amount, sold_count);
    fan_token::add_reward(fan_token_account, creator_stats, reward);
    
    // Increment sold count
    // 增加銷售計數
    content_registry::increment_sold_count(content);

    // Calculate split amounts
    // 計算分配金額
    // Anti-self-referral: If buyer is the referral or creator is the referral, no referral reward
    // 防自推廣：如果購買者是推廣者或創作者是推廣者，則無推廣獎勵
    let referral_share = if (referral_address == @0x0) {
        // No referral, all goes to creator
        // 無推廣，全部歸創作者
        0
    } else if (buyer == referral_address || creator == referral_address) {
        // Anti-self-referral: No referral reward for self-referral
        // 防自推廣：自推廣無推廣獎勵
        0
    } else {
        (payment_amount * referral_split_ratio) / 10000
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
        transfer::public_transfer(creator_coin, creator);
    } else {
        // If no creator share, return to buyer
        // 如果沒有創作者份額，返回給購買者
        let return_coin = coin::from_balance(payment_balance, ctx);
        transfer::public_transfer(return_coin, buyer);
    };

    // Add buyer to allowlist for content access
    // 將購買者添加到允許列表以獲得內容訪問權限
    allowlist::add_buyer(allowlist, buyer);
    
    // Emit purchase event
    // 發出購買事件
    event::emit(ContentPurchased {
        content_id: content_registry::get_content_id(content),
        buyer,
        referral_address,
        amount: payment_amount,
        referral_share,
        creator_share,
    });
}
