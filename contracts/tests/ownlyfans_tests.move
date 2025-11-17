#[test_only]
module ownlyfans::ownlyfans_tests;

use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;
use ownlyfans::allowlist::{Self, Allowlist};
use ownlyfans::content_registry::{Self, Content};
use ownlyfans::creator_registry::{Self, Creator};
use ownlyfans::referral_split;
use ownlyfans::seal_access;
use ownlyfans::subscription::{Self, Subscription};

const CREATOR_ADDR: address = @0xAAA;
const BUYER_ADDR: address = @0xBBB;
const SUBSCRIBER_ADDR: address = @0xCCC;
const STRANGER_ADDR: address = @0xDDD;
const REFERRAL_NONE: address = @0x0;
const SUBSCRIPTION_PRICE: u64 = 50_000_000;
const CONTENT_PRICE: u64 = 100_000_000;
const REFERRAL_RATIO_BPS: u64 = 1_500;
const CONTENT_BLOB_ID: vector<u8> = b"encrypted-blob";

fun init_creator(ts: &mut ts::Scenario) {
    ts.next_tx(CREATOR_ADDR);
    creator_registry::register_creator(SUBSCRIPTION_PRICE, ts.ctx());
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

fun create_subscription_for(ts: &mut ts::Scenario, subscriber: address) {
    ts.next_tx(subscriber);
    let creator = ts.take_shared<Creator>();
    let clock = clock::create_for_testing(ts.ctx());
    let coin = coin::mint_for_testing<SUI>(SUBSCRIPTION_PRICE, ts.ctx());
    subscription::subscribe_creator(&creator, coin, &clock, ts.ctx());
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
    let content = scenario.take_shared<Content>();
    let mut allowlist = scenario.take_shared<Allowlist>();
    let coin = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    referral_split::purchase_content(&content, &mut allowlist, coin, REFERRAL_NONE, scenario.ctx());
    assert!(allowlist::get_buyers_count(&allowlist) == 1);
    ts::return_shared(allowlist);
    ts::return_shared(content);

    ts::end(scenario);
}

#[test]
fun test_subscription_validity_window() {
    let mut scenario = ts::begin(CREATOR_ADDR);
    init_creator(&mut scenario);

    // Subscribe in first transaction
    scenario.next_tx(SUBSCRIBER_ADDR);
    let creator_for_sub = scenario.take_shared<Creator>();
    let clock_for_sub = clock::create_for_testing(scenario.ctx());
    let coin = coin::mint_for_testing<SUI>(SUBSCRIPTION_PRICE, scenario.ctx());
    subscription::subscribe_creator(&creator_for_sub, coin, &clock_for_sub, scenario.ctx());
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
    let content_purchase = scenario.take_shared<Content>();
    let mut allowlist_purchase = scenario.take_shared<Allowlist>();
    let coin_purchase = coin::mint_for_testing<SUI>(CONTENT_PRICE, scenario.ctx());
    referral_split::purchase_content(&content_purchase, &mut allowlist_purchase, coin_purchase, REFERRAL_NONE, scenario.ctx());
    ts::return_shared(allowlist_purchase);
    ts::return_shared(content_purchase);

    // Create subscription for another address (so Subscription object exists)
    create_subscription_for(&mut scenario, SUBSCRIBER_ADDR);

    scenario.next_tx(BUYER_ADDR);
    let creator = scenario.take_shared<Creator>();
    let content = scenario.take_shared<Content>();
    let allowlist = scenario.take_shared<Allowlist>();
    let subscription_obj = scenario.take_shared<Subscription>();
    let seal_id = seal_identity(&creator, &content);
    let seal_clock = clock::create_for_testing(scenario.ctx());
    seal_access::seal_approve(
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
    let subscription_obj = scenario.take_shared<Subscription>();
    let seal_id = seal_identity(&creator, &content);
    let seal_clock = clock::create_for_testing(scenario.ctx());
    seal_access::seal_approve(
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

