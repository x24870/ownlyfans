module ownlyfans::referral_split;

use sui::coin::{Self, Coin};
use sui::balance::{Self, Balance};
use sui::sui::SUI;
use sui::tx_context::{TxContext};
use sui::event;
use sui::object::{UID, ID};
use sui::transfer;
use ownlyfans::content_registry::{Self, Content};

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

/// Track processed transactions to prevent duplicate profit distribution
/// 追蹤已處理的交易以防止重複分潤
public struct ProcessedTx has key {
    id: UID,
    processed_txs: vector<vector<u8>>, // Store transaction digests
}

/// Global state for tracking processed transactions
/// 用於追蹤已處理交易的全局狀態
fun init(ctx: &mut TxContext) {
    let processed_tx = ProcessedTx {
        id: sui::object::new(ctx),
        processed_txs: vector::empty(),
    };
    transfer::share_object(processed_tx);
}

/// Check if transaction has been processed
/// 檢查交易是否已處理
fun is_tx_processed(tx_digest: &vector<u8>, processed_tx: &ProcessedTx): bool {
    let len = vector::length(&processed_tx.processed_txs);
    let mut i = 0;
    while (i < len) {
        let stored_digest = vector::borrow(&processed_tx.processed_txs, i);
        if (*stored_digest == *tx_digest) {
            return true
        };
        i = i + 1;
    };
    false
}

/// Mark transaction as processed
/// 標記交易為已處理
fun mark_tx_processed(tx_digest: vector<u8>, processed_tx: &mut ProcessedTx) {
    vector::push_back(&mut processed_tx.processed_txs, tx_digest);
}

/// Purchase content with optional referral address
/// 購買內容（可選推廣地址）
public entry fun purchase_content(
    content: &mut Content,
    payment: Coin<SUI>,
    referral_address: address,
    processed_tx: &mut ProcessedTx,
    ctx: &mut TxContext
) {
    let buyer = sui::tx_context::sender(ctx);
    let tx_digest_ref = sui::tx_context::digest(ctx);
    let tx_digest = *tx_digest_ref;

    // Anti-self-referral: Reject if buyer is the same as referral
    // 防自推廣：如果購買者與推廣者相同則拒絕
    assert!(buyer != referral_address, 1);

    // Anti-duplicate profit: Check if transaction has been processed
    // 防重複分潤：檢查交易是否已處理
    assert!(!is_tx_processed(&tx_digest, processed_tx), 2);
    
    // Mark transaction as processed
    // 標記交易為已處理
    mark_tx_processed(tx_digest, processed_tx);

    let price = content_registry::get_price(content);
    let referral_split_ratio = content_registry::get_referral_split_ratio(content);
    let creator = content_registry::get_creator(content);

    // Convert Coin to Balance for splitting
    // 將 Coin 轉換為 Balance 以便分割
    let mut payment_balance = coin::into_balance(payment);
    let payment_amount = balance::value(&payment_balance);
    
    // Verify payment amount
    // 驗證付款金額
    assert!(payment_amount >= price, 3);

    // Calculate split amounts
    // 計算分配金額
    let referral_share = if (referral_address == @0x0) {
        // No referral, all goes to creator
        // 無推廣，全部歸創作者
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
