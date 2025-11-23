#[test_only]
module ownlyfans::ownlyfans_tests;

use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;
use ownlyfans::allowlist::{Self, Allowlist};
use ownlyfans::campaign::{Self, Campaign};
use ownlyfans::content_registry::{Self, Content};
use ownlyfans::creator_registry::{Self, Creator};
use ownlyfans::fan_token::{Self, FanTokenAccount, CreatorTokenStats, CreatorStatsMap};
use ownlyfans::referral_split;
use ownlyfans::seal_access;
use ownlyfans::subscription::{Self, Subscription};

const CREATOR_ADDR: address = @0xAAA;
const BUYER_ADDR: address = @0xBBB;
const SUBSCRIBER_ADDR: address = @0xCCC;
const STRANGER_ADDR: address = @0xDDD;
const REFERRAL_ADDR: address = @0xEEE;
const REFERRAL_NONE: address = @0x0;
const SUBSCRIPTION_PRICE: u64 = 50_000_000;
const CONTENT_PRICE: u64 = 100_000_000;
const REFERRAL_RATIO_BPS: u64 = 1_500;
const CONTENT_BLOB_ID: vector<u8> = b"encrypted-blob";
const CAMPAIGN_COST: u64 = 1000;

fun init_stats_map(ts: &mut ts::Scenario) {
    ts.next_tx(CREATOR_ADDR);
    // Create CreatorStatsMap manually (normally done by init function)
    fan_token::create_and_share_stats_map_for_testing(ts.ctx());
}

fun init_creator(ts: &mut ts::Scenario) {
    // First ensure stats map exists
    init_stats_map(ts);
    
    ts.next_tx(CREATOR_ADDR);
    let mut stats_map = ts.take_shared<CreatorStatsMap>();
    creator_registry::register_creator(&mut stats_map, SUBSCRIPTION_PRICE, ts.ctx());
    ts::return_shared(stats_map);
}

fun init_content(ts: &mut ts::Scenario) {
    ts.next_tx(CREATOR_ADDR);
    let mut creator = ts.take_shared<Creator>();
    content_registry::create_content_entry(
        &mut creator,
        CONTENT_BLOB_ID,
        CONTENT_PRICE,
        REFERRAL_RATIO_BPS,
        ts.ctx()
    );
    ts::return_shared(creator);
}

fun create_fan_token_account(ts: &mut ts::Scenario, user: address, creator_addr: address): FanTokenAccount {
    ts.next_tx(user);
    fan_token::create_account(creator_addr, ts.ctx())
}

fun get_creator_stats_id(ts: &mut ts::Scenario, creator_addr: address): ID {
    let stats_map = ts.take_shared<CreatorStatsMap>();
    let stats_id = fan_token::get_creator_stats_id(&stats_map, creator_addr);
    ts::return_shared(stats_map);
    stats_id
}

fun create_subscription_for(ts: &mut ts::Scenario, subscriber: address) {
    ts.next_tx(subscriber);
    let creator = ts.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(ts, subscriber, creator_addr);
    let stats_id = get_creator_stats_id(ts, creator_addr);
    let mut creator_stats = ts.take_shared_by_id<CreatorTokenStats>(stats_id);
    let clock = clock::create_for_testing(ts.ctx());
    let coin = coin::mint_for_testing<SUI>(SUBSCRIPTION_PRICE, ts.ctx());
    subscription::subscribe_creator(&creator, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_NONE, &clock, ts.ctx());
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, subscriber);
    ts::return_shared(creator);
    clock.destroy_for_testing();
}

fun seal_identity(creator: &Creator, content: &Content): vector<u8> {
    let mut seal_id = creator_registry::get_seal_namespace(creator);
    vector::append(&mut seal_id, content_registry::get_seal_suffix(content));
    seal_id
}

#[test]
fun test_creator_registration_and_content_creation() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    // Verify creator data
    scenario.next_tx(CREATOR_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_id = creator_registry::get_creator_id(&creator);
    assert!(creator_registry::get_subscription_price(&creator) == SUBSCRIPTION_PRICE);
    ts::return_shared(creator);

    // Create content
    init_content(&mut scenario);

    // Validate content + allowlist linkage
    scenario.next_tx(CREATOR_ADDR);
    let content = scenario.take_shared<Content>();
    assert!(content_registry::get_creator_id(&content) == creator_id);
    assert!(content_registry::get_price(&content) == CONTENT_PRICE);
    let allowlist = scenario.take_shared<Allowlist>();
    assert!(allowlist::get_content_id(&allowlist) == content_registry::get_content_id(&content));
    assert!(allowlist::get_buyers_count(&allowlist) == 0);
    ts::return_shared(allowlist);
    ts::return_shared(content);

    ts::end(scenario);
}

#[test]
fun test_purchase_adds_allowlist_entry() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let mut content = scenario.take_shared<Content>();
    let mut allowlist = scenario.take_shared<Allowlist>();
    let coin = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    referral_split::purchase_content(&mut content, &mut allowlist, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_NONE, scenario.ctx());
    assert!(allowlist::get_buyers_count(&allowlist) == 1);
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, BUYER_ADDR);
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
fun test_subscription_validity_window() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    // Subscribe in first transaction
    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator_for_sub = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator_for_sub);
    let mut fan_token_account = create_fan_token_account(&mut scenario, SUBSCRIBER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let clock_for_sub = clock::create_for_testing(scenario.ctx());
    let coin = coin::mint_for_testing<SUI>(SUBSCRIPTION_PRICE, scenario.ctx());
    subscription::subscribe_creator(&creator_for_sub, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_NONE, &clock_for_sub, scenario.ctx());
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, SUBSCRIBER_ADDR);
    ts::return_shared(creator_for_sub);
    clock_for_sub.destroy_for_testing();

    // Validate subscription in a new transaction
    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_id = creator_registry::get_creator_id(&creator);
    ts::return_shared(creator);
    let subscription_obj = scenario.take_shared<Subscription>();
    let mut clock_obj = clock::create_for_testing(scenario.ctx());
    assert!(subscription::is_valid_subscription(&subscription_obj, creator_id, SUBSCRIBER_ADDR, &clock_obj));
    clock_obj.increment_for_testing(5 * 60 * 1000 + 1);
    assert!(!subscription::is_valid_subscription(&subscription_obj, creator_id, SUBSCRIBER_ADDR, &clock_obj));
    ts::return_shared(subscription_obj);
    clock_obj.destroy_for_testing();

    ts::end(scenario);
}

#[test]
fun test_seal_policy_allows_allowlist_viewer() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    // Buyer purchases content -> added to allowlist
    scenario.next_tx(BUYER_ADDR);
    let creator_purchase = scenario.take_shared<Creator>();
    let creator_addr_purchase = creator_registry::get_owner(&creator_purchase);
    let mut fan_token_account_purchase = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr_purchase);
    let stats_id_purchase = get_creator_stats_id(&mut scenario, creator_addr_purchase);
    let mut creator_stats_purchase = scenario.take_shared_by_id<CreatorTokenStats>(stats_id_purchase);
    let mut content_purchase = scenario.take_shared<Content>();
    let mut allowlist_purchase = scenario.take_shared<Allowlist>();
    let coin_purchase = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    referral_split::purchase_content(&mut content_purchase, &mut allowlist_purchase, &mut fan_token_account_purchase, &mut creator_stats_purchase, coin_purchase, REFERRAL_NONE, scenario.ctx());
    ts::return_shared(creator_stats_purchase);
    transfer::public_transfer(fan_token_account_purchase, BUYER_ADDR);
    ts::return_shared(allowlist_purchase);
    ts::return_shared(content_purchase);
    ts::return_shared(creator_purchase);

    // Create subscription for another address (so Subscription object exists)
    create_subscription_for(&mut scenario, SUBSCRIBER_ADDR);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let content = scenario.take_shared<Content>();
    let allowlist = scenario.take_shared<Allowlist>();
    let seal_id = seal_identity(&creator, &content);
    let seal_clock = clock::create_for_testing(scenario.ctx());
    seal_access::seal_approve(
        seal_id,
        &creator,
        &content,
        &allowlist,
        &seal_clock,
        scenario.ctx()
    );
    seal_clock.destroy_for_testing();
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = seal_access::E_NO_ACCESS)]
fun test_seal_policy_rejects_unauthorized_viewer() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);
    create_subscription_for(&mut scenario, SUBSCRIBER_ADDR);

    scenario.next_tx(STRANGER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let content = scenario.take_shared<Content>();
    let allowlist = scenario.take_shared<Allowlist>();
    let seal_id = seal_identity(&creator, &content);
    let seal_clock = clock::create_for_testing(scenario.ctx());
    seal_access::seal_approve(
        seal_id,
        &creator,
        &content,
        &allowlist,
        &seal_clock,
        scenario.ctx()
    );
    seal_clock.destroy_for_testing();
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);
    ts::end(scenario);
}

// ========== Fan Token Module Tests ==========

#[test]
fun test_fan_token_account_creation() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let account = fan_token::create_account(creator_addr, scenario.ctx());
    assert!(fan_token::get_user(&account) == BUYER_ADDR);
    assert!(fan_token::get_creator(&account) == creator_addr);
    assert!(fan_token::get_balance(&account) == 0);
    assert!(fan_token::get_streak(&account) == 0);
    sui::transfer::public_transfer(account, BUYER_ADDR);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
fun test_fan_token_reward_calculation_content() {
    // Test early buyer bonus tiers
    let reward_tier1 = fan_token::calculate_content_reward(100_000_000, 5); // sold_count < 10
    let reward_tier2 = fan_token::calculate_content_reward(100_000_000, 50); // 10 <= sold_count < 100
    let reward_tier3 = fan_token::calculate_content_reward(100_000_000, 150); // sold_count >= 100
    
    // Tier 1 should have highest reward (2.0x), tier 3 lowest (1.0x)
    assert!(reward_tier1 > reward_tier2);
    assert!(reward_tier2 > reward_tier3);
}

#[test]
fun test_fan_token_reward_calculation_subscription() {
    // Test loyalty bonus multipliers based on streak
    let reward_streak1 = fan_token::calculate_subscription_reward(50_000_000, 1);
    let reward_streak2 = fan_token::calculate_subscription_reward(50_000_000, 2);
    let reward_streak3 = fan_token::calculate_subscription_reward(50_000_000, 3);
    let reward_streak6 = fan_token::calculate_subscription_reward(50_000_000, 6);
    
    // Higher streak should give higher rewards
    assert!(reward_streak2 > reward_streak1);
    assert!(reward_streak3 > reward_streak2);
    assert!(reward_streak6 > reward_streak3);
}

#[test]
fun test_fan_token_streak_updates() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, SUBSCRIBER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    
    // First subscription - streak should be 1
    let clock1 = clock::create_for_testing(scenario.ctx());
    let current_time = clock1.timestamp_ms();
    let expires_at = current_time + 5 * 60 * 1000;
    let streak1 = fan_token::update_streak_for_subscription(&mut fan_token_account, current_time, expires_at);
    assert!(streak1 == 1);
    assert!(fan_token::get_streak(&fan_token_account) == 1);
    
    // Second subscription within grace period - streak should increment
    let new_expires_at = expires_at + 5 * 60 * 1000;
    let streak2 = fan_token::update_streak_for_subscription(&mut fan_token_account, expires_at - 1000, new_expires_at);
    assert!(streak2 == 2);
    assert!(fan_token::get_streak(&fan_token_account) == 2);
    
    // Subscription after grace period - streak should reset to 1
    // Convert to seconds for grace period check (grace period is 3 days = 259200 seconds)
    let late_time_sec = (expires_at / 1000) + 3 * 24 * 60 * 60 + 1; // After grace period in seconds
    let late_time_ms = late_time_sec * 1000;
    let new_expires_at2 = late_time_ms + 5 * 60 * 1000;
    let streak3 = fan_token::update_streak_for_subscription(&mut fan_token_account, late_time_ms, new_expires_at2);
    assert!(streak3 == 1);
    assert!(fan_token::get_streak(&fan_token_account) == 1);
    
    clock1.destroy_for_testing();
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, SUBSCRIBER_ADDR);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
fun test_fan_token_burn() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    // Purchase content to get tokens
    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let mut content = scenario.take_shared<Content>();
    let mut allowlist = scenario.take_shared<Allowlist>();
    let coin = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    referral_split::purchase_content(&mut content, &mut allowlist, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_NONE, scenario.ctx());
    let balance_before = fan_token::get_balance(&fan_token_account);
    assert!(balance_before > 0);
    
    // Burn some tokens
    let burn_amount = balance_before / 2;
    fan_token::burn_token(&mut fan_token_account, &mut creator_stats, burn_amount, scenario.ctx());
    let balance_after = fan_token::get_balance(&fan_token_account);
    assert!(balance_after == balance_before - burn_amount);
    assert!(fan_token::get_total_burned(&fan_token_account) == burn_amount);
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, BUYER_ADDR);
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = fan_token::E_INSUFFICIENT_BALANCE)]
fun test_fan_token_burn_insufficient_balance() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    
    // Try to burn tokens when balance is 0
    fan_token::burn_token(&mut fan_token_account, &mut creator_stats, 1000, scenario.ctx());
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, BUYER_ADDR);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
fun test_creator_stats_creation() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_stats_map(&mut scenario);
    
    // Use a different creator address to test stats creation
    let test_creator_addr = @0xFFF;

    scenario.next_tx(CREATOR_ADDR);
    let mut stats_map = scenario.take_shared<CreatorStatsMap>();
    let stats_id = fan_token::create_creator_stats(&mut stats_map, test_creator_addr, scenario.ctx());
    ts::return_shared(stats_map);
    
    // Verify stats can be retrieved
    let stats_map2 = scenario.take_shared<CreatorStatsMap>();
    let retrieved_stats_id = fan_token::get_creator_stats_id(&stats_map2, test_creator_addr);
    assert!(retrieved_stats_id == stats_id);
    ts::return_shared(stats_map2);

    ts::end(scenario);
}

// ========== Campaign Module Tests ==========

#[test]
fun test_campaign_creation() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    scenario.next_tx(CREATOR_ADDR);
    let title = std::string::utf8(b"Test Campaign");
    let description = std::string::utf8(b"Test Description");
    campaign::create_campaign(title, description, CAMPAIGN_COST, scenario.ctx());
    
    // Campaign created successfully (no assertion needed, just verify it doesn't fail)
    scenario.next_tx(CREATOR_ADDR);
    let _campaign = scenario.take_shared<Campaign>();
    ts::return_shared(_campaign);
    ts::end(scenario);
}

#[test]
fun test_campaign_join() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    // Create campaign
    scenario.next_tx(CREATOR_ADDR);
    let title = std::string::utf8(b"Test Campaign");
    let description = std::string::utf8(b"Test Description");
    campaign::create_campaign(title, description, CAMPAIGN_COST, scenario.ctx());
    
    // Purchase content to get tokens
    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let mut content = scenario.take_shared<Content>();
    let mut allowlist = scenario.take_shared<Allowlist>();
    let coin = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    referral_split::purchase_content(&mut content, &mut allowlist, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_NONE, scenario.ctx());
    let balance_before = fan_token::get_balance(&fan_token_account);
    assert!(balance_before >= CAMPAIGN_COST);
    
    // Join campaign
    let mut campaign = scenario.take_shared<Campaign>();
    campaign::join_campaign(&mut campaign, &mut fan_token_account, &mut creator_stats, scenario.ctx());
    let balance_after = fan_token::get_balance(&fan_token_account);
    assert!(balance_after == balance_before - CAMPAIGN_COST);
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, BUYER_ADDR);
    ts::return_shared(campaign);
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
fun test_campaign_close() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    // Create campaign
    scenario.next_tx(CREATOR_ADDR);
    let title = std::string::utf8(b"Test Campaign");
    let description = std::string::utf8(b"Test Description");
    campaign::create_campaign(title, description, CAMPAIGN_COST, scenario.ctx());
    
    // Close campaign
    scenario.next_tx(CREATOR_ADDR);
    let mut campaign = scenario.take_shared<Campaign>();
    campaign::close_campaign(&mut campaign, scenario.ctx());
    ts::return_shared(campaign);

    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = campaign::E_NOT_CREATOR)]
fun test_campaign_close_not_creator() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    // Create campaign
    scenario.next_tx(CREATOR_ADDR);
    let title = std::string::utf8(b"Test Campaign");
    let description = std::string::utf8(b"Test Description");
    campaign::create_campaign(title, description, CAMPAIGN_COST, scenario.ctx());
    
    // Try to close as non-creator
    scenario.next_tx(BUYER_ADDR);
    let mut campaign = scenario.take_shared<Campaign>();
    campaign::close_campaign(&mut campaign, scenario.ctx());
    
    ts::return_shared(campaign);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = campaign::E_ALREADY_JOINED)]
fun test_campaign_duplicate_join_prevention() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    // Create campaign
    scenario.next_tx(CREATOR_ADDR);
    let title = std::string::utf8(b"Test Campaign");
    let description = std::string::utf8(b"Test Description");
    campaign::create_campaign(title, description, CAMPAIGN_COST, scenario.ctx());
    
    // Purchase content to get tokens
    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let mut content = scenario.take_shared<Content>();
    let mut allowlist = scenario.take_shared<Allowlist>();
    let coin = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    referral_split::purchase_content(&mut content, &mut allowlist, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_NONE, scenario.ctx());
    
    // Join campaign first time
    let mut campaign = scenario.take_shared<Campaign>();
    campaign::join_campaign(&mut campaign, &mut fan_token_account, &mut creator_stats, scenario.ctx());
    
    // Try to join again - should fail
    campaign::join_campaign(&mut campaign, &mut fan_token_account, &mut creator_stats, scenario.ctx());
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, BUYER_ADDR);
    ts::return_shared(campaign);
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

// ========== Referral Split Module Tests ==========

#[test]
fun test_purchase_with_referral() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let mut content = scenario.take_shared<Content>();
    let mut allowlist = scenario.take_shared<Allowlist>();
    let coin = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    
    // Purchase with referral
    referral_split::purchase_content(&mut content, &mut allowlist, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_ADDR, scenario.ctx());
    
    // Verify buyer is in allowlist
    assert!(allowlist::get_buyers_count(&allowlist) == 1);
    assert!(allowlist::is_buyer(&allowlist, BUYER_ADDR));
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, BUYER_ADDR);
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
fun test_purchase_without_referral() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let mut content = scenario.take_shared<Content>();
    let mut allowlist = scenario.take_shared<Allowlist>();
    let coin = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    
    // Purchase without referral
    referral_split::purchase_content(&mut content, &mut allowlist, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_NONE, scenario.ctx());
    
    // Verify buyer is in allowlist
    assert!(allowlist::get_buyers_count(&allowlist) == 1);
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, BUYER_ADDR);
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
fun test_purchase_self_referral_prevention() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let mut content = scenario.take_shared<Content>();
    let mut allowlist = scenario.take_shared<Allowlist>();
    let coin = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    
    // Purchase with self as referral - should not give referral reward
    referral_split::purchase_content(&mut content, &mut allowlist, &mut fan_token_account, &mut creator_stats, coin, BUYER_ADDR, scenario.ctx());
    
    // Should still work, just no referral reward
    assert!(allowlist::get_buyers_count(&allowlist) == 1);
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, BUYER_ADDR);
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
fun test_purchase_creator_referral_prevention() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let mut content = scenario.take_shared<Content>();
    let mut allowlist = scenario.take_shared<Allowlist>();
    let coin = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    
    // Purchase with creator as referral - should not give referral reward
    referral_split::purchase_content(&mut content, &mut allowlist, &mut fan_token_account, &mut creator_stats, coin, CREATOR_ADDR, scenario.ctx());
    
    // Should still work, just no referral reward
    assert!(allowlist::get_buyers_count(&allowlist) == 1);
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, BUYER_ADDR);
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
fun test_purchase_fan_token_reward() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let mut content = scenario.take_shared<Content>();
    let mut allowlist = scenario.take_shared<Allowlist>();
    let coin = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    
    let balance_before = fan_token::get_balance(&fan_token_account);
    referral_split::purchase_content(&mut content, &mut allowlist, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_NONE, scenario.ctx());
    let balance_after = fan_token::get_balance(&fan_token_account);
    
    // Should have received tokens
    assert!(balance_after > balance_before);
    // Sold count should have increased
    assert!(content_registry::get_sold_count(&content) == 1);
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, BUYER_ADDR);
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

// ========== Subscription Module Tests ==========

#[test]
fun test_subscription_with_referral() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, SUBSCRIBER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let clock = clock::create_for_testing(scenario.ctx());
    let coin = coin::mint_for_testing<SUI>(SUBSCRIPTION_PRICE, scenario.ctx());
    
    subscription::subscribe_creator(&creator, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_ADDR, &clock, scenario.ctx());
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, SUBSCRIBER_ADDR);
    ts::return_shared(creator);
    clock.destroy_for_testing();
    
    // Verify subscription was created
    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator2 = scenario.take_shared<Creator>();
    let creator_id = creator_registry::get_creator_id(&creator2);
    ts::return_shared(creator2);
    let subscription_obj = scenario.take_shared<Subscription>();
    let clock2 = clock::create_for_testing(scenario.ctx());
    assert!(subscription::is_valid_subscription(&subscription_obj, creator_id, SUBSCRIBER_ADDR, &clock2));
    clock2.destroy_for_testing();
    ts::return_shared(subscription_obj);

    ts::end(scenario);
}

#[test]
fun test_subscription_without_referral() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, SUBSCRIBER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let clock = clock::create_for_testing(scenario.ctx());
    let coin = coin::mint_for_testing<SUI>(SUBSCRIPTION_PRICE, scenario.ctx());
    
    subscription::subscribe_creator(&creator, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_NONE, &clock, scenario.ctx());
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, SUBSCRIBER_ADDR);
    ts::return_shared(creator);
    clock.destroy_for_testing();

    ts::end(scenario);
}

#[test]
fun test_subscription_self_referral_prevention() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, SUBSCRIBER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let clock = clock::create_for_testing(scenario.ctx());
    let coin = coin::mint_for_testing<SUI>(SUBSCRIPTION_PRICE, scenario.ctx());
    
    // Subscribe with self as referral - should not give referral reward
    subscription::subscribe_creator(&creator, &mut fan_token_account, &mut creator_stats, coin, SUBSCRIBER_ADDR, &clock, scenario.ctx());
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, SUBSCRIBER_ADDR);
    ts::return_shared(creator);
    clock.destroy_for_testing();

    ts::end(scenario);
}

#[test]
fun test_subscription_fan_token_reward() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, SUBSCRIBER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let clock = clock::create_for_testing(scenario.ctx());
    let coin = coin::mint_for_testing<SUI>(SUBSCRIPTION_PRICE, scenario.ctx());
    
    let balance_before = fan_token::get_balance(&fan_token_account);
    subscription::subscribe_creator(&creator, &mut fan_token_account, &mut creator_stats, coin, REFERRAL_NONE, &clock, scenario.ctx());
    let balance_after = fan_token::get_balance(&fan_token_account);
    
    // Should have received tokens
    assert!(balance_after > balance_before);
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, SUBSCRIBER_ADDR);
    ts::return_shared(creator);
    clock.destroy_for_testing();

    ts::end(scenario);
}

#[test]
fun test_subscription_streak_increment() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    // First subscription
    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, SUBSCRIBER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let clock1 = clock::create_for_testing(scenario.ctx());
    let coin1 = coin::mint_for_testing<SUI>(SUBSCRIPTION_PRICE, scenario.ctx());
    subscription::subscribe_creator(&creator, &mut fan_token_account, &mut creator_stats, coin1, REFERRAL_NONE, &clock1, scenario.ctx());
    assert!(fan_token::get_streak(&fan_token_account) == 1);
    clock1.destroy_for_testing();
    
    // Second subscription within grace period
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, SUBSCRIBER_ADDR);
    ts::return_shared(creator);
    
    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator2 = scenario.take_shared<Creator>();
    let creator_addr2 = creator_registry::get_owner(&creator2);
    let mut fan_token_account2 = create_fan_token_account(&mut scenario, SUBSCRIBER_ADDR, creator_addr2);
    let stats_id2 = get_creator_stats_id(&mut scenario, creator_addr2);
    let mut creator_stats2 = scenario.take_shared_by_id<CreatorTokenStats>(stats_id2);
    let mut clock2 = clock::create_for_testing(scenario.ctx());
    // Advance clock but stay within grace period (4 minutes = 240000 ms)
    clock2.increment_for_testing(4 * 60 * 1000); // 4 minutes
    let coin2 = coin::mint_for_testing<SUI>(SUBSCRIPTION_PRICE, scenario.ctx());
    subscription::subscribe_creator(&creator2, &mut fan_token_account2, &mut creator_stats2, coin2, REFERRAL_NONE, &clock2, scenario.ctx());
    assert!(fan_token::get_streak(&fan_token_account2) == 2);
    clock2.destroy_for_testing();
    ts::return_shared(creator_stats2);
    sui::transfer::public_transfer(fan_token_account2, SUBSCRIBER_ADDR);
    ts::return_shared(creator2);

    ts::end(scenario);
}

// ========== Seal Access Module Tests ==========

#[test]
fun test_seal_approve_with_subscription() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);
    create_subscription_for(&mut scenario, SUBSCRIBER_ADDR);

    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let content = scenario.take_shared<Content>();
    let allowlist = scenario.take_shared<Allowlist>();
    let subscription_obj = scenario.take_shared<Subscription>();
    let seal_id = seal_identity(&creator, &content);
    let seal_clock = clock::create_for_testing(scenario.ctx());
    seal_access::seal_approve_with_subscription(
        seal_id,
        &creator,
        &content,
        &allowlist,
        &subscription_obj,
        &seal_clock,
        scenario.ctx()
    );
    seal_clock.destroy_for_testing();
    ts::return_shared(subscription_obj);
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
fun test_seal_approve_creator_access() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    scenario.next_tx(CREATOR_ADDR);
    let creator = scenario.take_shared<Creator>();
    let content = scenario.take_shared<Content>();
    let allowlist = scenario.take_shared<Allowlist>();
    let seal_id = seal_identity(&creator, &content);
    let seal_clock = clock::create_for_testing(scenario.ctx());
    seal_access::seal_approve(
        seal_id,
        &creator,
        &content,
        &allowlist,
        &seal_clock,
        scenario.ctx()
    );
    seal_clock.destroy_for_testing();
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = seal_access::E_INVALID_SEAL_ID)]
fun test_seal_approve_invalid_id() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let content = scenario.take_shared<Content>();
    let allowlist = scenario.take_shared<Allowlist>();
    let invalid_seal_id = b"invalid-seal-id";
    let seal_clock = clock::create_for_testing(scenario.ctx());
    seal_access::seal_approve(
        invalid_seal_id,
        &creator,
        &content,
        &allowlist,
        &seal_clock,
        scenario.ctx()
    );
    seal_clock.destroy_for_testing();
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);
    ts::end(scenario);
}

// ========== Allowlist Module Tests ==========

#[test]
fun test_allowlist_duplicate_buyer_prevention() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);
    init_content(&mut scenario);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let creator_addr = creator_registry::get_owner(&creator);
    let mut fan_token_account = create_fan_token_account(&mut scenario, BUYER_ADDR, creator_addr);
    let stats_id = get_creator_stats_id(&mut scenario, creator_addr);
    let mut creator_stats = scenario.take_shared_by_id<CreatorTokenStats>(stats_id);
    let mut content = scenario.take_shared<Content>();
    let mut allowlist = scenario.take_shared<Allowlist>();
    
    // First purchase
    let coin1 = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    referral_split::purchase_content(&mut content, &mut allowlist, &mut fan_token_account, &mut creator_stats, coin1, REFERRAL_NONE, scenario.ctx());
    assert!(allowlist::get_buyers_count(&allowlist) == 1);
    
    // Try to add buyer again (should not duplicate)
    allowlist::add_buyer(&mut allowlist, BUYER_ADDR);
    assert!(allowlist::get_buyers_count(&allowlist) == 1);
    
    ts::return_shared(creator_stats);
    sui::transfer::public_transfer(fan_token_account, BUYER_ADDR);
    ts::return_shared(allowlist);
    ts::return_shared(content);
    ts::return_shared(creator);

    ts::end(scenario);
}

