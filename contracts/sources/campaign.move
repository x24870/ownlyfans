module ownlyfans::campaign;

use std::string::{String};
use sui::event;
use ownlyfans::fan_token::{Self, FanTokenAccount, CreatorTokenStats};

/// Campaign object
/// 活動對象
public struct Campaign has key, store {
    id: UID,
    creator: address,
    title: String,
    description: String,
    cost: u64,
    participants: vector<address>, // Track participants to enforce once-per-user
    active: bool
}

/// Event emitted when a campaign is created
/// 創建活動時發出的事件
public struct CampaignCreated has copy, drop {
    campaign_id: ID,
    creator: address,
    title: String,
    cost: u64,
}

/// Event emitted when a user joins a campaign
/// 用戶參加活動時發出的事件
public struct CampaignJoined has copy, drop {
    campaign_id: ID,
    user: address,
    cost: u64,
}

/// Error codes
/// 錯誤代碼
const E_NOT_CREATOR: u64 = 1;
const E_CAMPAIGN_NOT_ACTIVE: u64 = 2;
const E_INVALID_CREATOR_ACCOUNT: u64 = 3;
const E_ALREADY_JOINED: u64 = 4;

/// Create a new campaign
/// 創建新活動
public entry fun create_campaign(
    title: String,
    description: String,
    cost: u64,
    ctx: &mut TxContext
) {
    let creator = sui::tx_context::sender(ctx);
    
    let campaign = Campaign {
        id: sui::object::new(ctx),
        creator,
        title,
        description,
        cost,
        participants: vector::empty(),
        active: true,
    };
    
    let campaign_id = sui::object::id(&campaign);
    
    event::emit(CampaignCreated {
        campaign_id,
        creator,
        title,
        cost,
    });
    
    sui::transfer::share_object(campaign);
}

/// Join a campaign
/// 參加活動
public entry fun join_campaign(
    campaign: &mut Campaign,
    account: &mut FanTokenAccount,
    creator_stats: &mut CreatorTokenStats,
    ctx: &mut TxContext
) {
    let sender = sui::tx_context::sender(ctx);
    
    // Check if campaign is active
    // 檢查活動是否有效
    assert!(campaign.active, E_CAMPAIGN_NOT_ACTIVE);
    
    // Check if account belongs to the campaign creator
    // 檢查帳戶是否屬於活動創作者
    assert!(fan_token::get_creator(account) == campaign.creator, E_INVALID_CREATOR_ACCOUNT);
    
    // Check if user has already joined
    // 檢查用戶是否已參加
    let len = vector::length(&campaign.participants);
    let mut i = 0;
    while (i < len) {
        let participant = vector::borrow(&campaign.participants, i);
        assert!(*participant != sender, E_ALREADY_JOINED);
        i = i + 1;
    };
    
    // Burn tokens
    // 銷毀代幣
    fan_token::burn_token_internal(account, creator_stats, campaign.cost, ctx);
    
    // Add to participants
    // 添加到參與者列表
    vector::push_back(&mut campaign.participants, sender);
    
    event::emit(CampaignJoined {
        campaign_id: sui::object::id(campaign),
        user: sender,
        cost: campaign.cost,
    });
}

/// Close a campaign
/// 關閉活動
public entry fun close_campaign(
    campaign: &mut Campaign,
    ctx: &mut TxContext
) {
    let sender = sui::tx_context::sender(ctx);
    
    // Only creator can close campaign
    // 只有創作者可以關閉活動
    assert!(sender == campaign.creator, E_NOT_CREATOR);
    
    campaign.active = false;
}

