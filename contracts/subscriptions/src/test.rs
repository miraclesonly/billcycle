#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::StellarAssetClient,
    Env,
};

const MONTH: u64 = 30 * 86_400;
const PRICE: i128 = 10_000_000; // 1 unit of a 7-decimal asset

struct Setup<'a> {
    env: Env,
    subs: SubscriptionsClient<'a>,
    token: Address,
    token_client: token::Client<'a>,
    merchant: Address,
    customer: Address,
    plan_id: u64,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.timestamp = 1_700_000_000;
        l.sequence_number = 100;
    });
    let id = env.register(Subscriptions, ());
    let subs = SubscriptionsClient::new(&env, &id);
    let token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let token_client = token::Client::new(&env, &token);
    let merchant = Address::generate(&env);
    let customer = Address::generate(&env);
    StellarAssetClient::new(&env, &token).mint(&customer, &(PRICE * 100));

    let plan_id = subs.create_plan(&merchant, &token, &PRICE, &MONTH);
    Setup {
        env,
        subs,
        token,
        token_client,
        merchant,
        customer,
        plan_id,
    }
}

/// The customer lets the contract pull up to `periods` payments.
fn allow(s: &Setup, periods: i128) {
    s.token_client
        .approve(&s.customer, &s.subs.address, &(PRICE * periods), &100_000);
}

fn advance(s: &Setup, secs: u64) {
    s.env.ledger().with_mut(|l| {
        l.timestamp += secs;
        l.sequence_number += 10;
    });
}

#[test]
fn plan_validation() {
    let s = setup();
    assert_eq!(
        s.subs.try_create_plan(&s.merchant, &s.token, &0, &MONTH),
        Err(Ok(Error::InvalidPlan))
    );
    assert_eq!(
        s.subs
            .try_create_plan(&s.merchant, &s.token, &PRICE, &(MIN_PERIOD - 1)),
        Err(Ok(Error::InvalidPlan))
    );
    let plan = s.subs.get_plan(&s.plan_id);
    assert_eq!(plan.price, PRICE);
    assert!(plan.active);
}

#[test]
fn subscribing_charges_the_first_period() {
    let s = setup();
    allow(&s, 12);

    let sub_id = s.subs.subscribe(&s.customer, &s.plan_id);

    assert_eq!(s.token_client.balance(&s.merchant), PRICE);
    let sub = s.subs.get_subscription(&sub_id);
    assert_eq!(sub.periods_paid, 1);
    assert_eq!(sub.status, SubStatus::Active);
    assert_eq!(sub.next_charge_at, s.env.ledger().timestamp() + MONTH);
}

#[test]
fn subscribing_without_an_allowance_fails() {
    let s = setup();
    assert_eq!(
        s.subs.try_subscribe(&s.customer, &s.plan_id),
        Err(Ok(Error::InitialPaymentFailed))
    );
    assert_eq!(s.token_client.balance(&s.merchant), 0);
}

#[test]
fn charges_at_most_once_per_period() {
    let s = setup();
    allow(&s, 12);
    let sub_id = s.subs.subscribe(&s.customer, &s.plan_id);

    assert_eq!(s.subs.try_charge(&sub_id), Err(Ok(Error::NotDue)));
    assert!(!s.subs.is_due(&sub_id));

    advance(&s, MONTH);
    assert!(s.subs.is_due(&sub_id));
    assert!(s.subs.charge(&sub_id));
    assert_eq!(s.subs.try_charge(&sub_id), Err(Ok(Error::NotDue)));

    assert_eq!(s.token_client.balance(&s.merchant), 2 * PRICE);
    assert_eq!(s.subs.get_subscription(&sub_id).periods_paid, 2);
}

#[test]
fn missed_periods_are_never_back_billed() {
    let s = setup();
    allow(&s, 12);
    let sub_id = s.subs.subscribe(&s.customer, &s.plan_id);
    let first_due = s.subs.get_subscription(&sub_id).next_charge_at;

    // The keeper was offline: three due dates (first_due, +1, +2 months)
    // pass before the next charge attempt.
    advance(&s, 3 * MONTH + MONTH / 2);
    assert!(s.subs.charge(&sub_id));

    // One charge, not three, and the schedule skips to the next boundary.
    assert_eq!(s.token_client.balance(&s.merchant), 2 * PRICE);
    assert_eq!(
        s.subs.get_subscription(&sub_id).next_charge_at,
        first_due + 3 * MONTH
    );
    assert_eq!(s.subs.try_charge(&sub_id), Err(Ok(Error::NotDue)));
}

#[test]
fn failed_pull_marks_past_due_without_reverting() {
    let s = setup();
    allow(&s, 1); // only enough for the first period
    let sub_id = s.subs.subscribe(&s.customer, &s.plan_id);

    advance(&s, MONTH);
    assert!(!s.subs.charge(&sub_id));
    assert_eq!(s.subs.get_subscription(&sub_id).status, SubStatus::PastDue);
    assert_eq!(s.token_client.balance(&s.merchant), PRICE);

    // Customer tops up the allowance; the retry succeeds and reactivates.
    allow(&s, 6);
    assert!(s.subs.charge(&sub_id));
    assert_eq!(s.subs.get_subscription(&sub_id).status, SubStatus::Active);
    assert_eq!(s.token_client.balance(&s.merchant), 2 * PRICE);
}

#[test]
fn cancelling_stops_future_charges() {
    let s = setup();
    allow(&s, 12);
    let sub_id = s.subs.subscribe(&s.customer, &s.plan_id);

    s.subs.cancel(&s.customer, &sub_id);
    advance(&s, MONTH);

    assert_eq!(s.subs.try_charge(&sub_id), Err(Ok(Error::Cancelled)));
    assert!(!s.subs.is_due(&sub_id));
    assert_eq!(
        s.subs.try_cancel(&s.customer, &sub_id),
        Err(Ok(Error::Cancelled))
    );
}

#[test]
fn merchant_can_cancel_but_strangers_cannot() {
    let s = setup();
    allow(&s, 12);
    let sub_id = s.subs.subscribe(&s.customer, &s.plan_id);
    let stranger = Address::generate(&s.env);

    assert_eq!(
        s.subs.try_cancel(&stranger, &sub_id),
        Err(Ok(Error::NotSubscriber))
    );
    s.subs.cancel(&s.merchant, &sub_id);
    assert_eq!(
        s.subs.get_subscription(&sub_id).status,
        SubStatus::Cancelled
    );
}

#[test]
fn deactivated_plans_take_no_new_subscribers_and_stop_charging() {
    let s = setup();
    allow(&s, 12);
    let sub_id = s.subs.subscribe(&s.customer, &s.plan_id);

    s.subs.deactivate_plan(&s.plan_id);
    advance(&s, MONTH);

    assert_eq!(s.subs.try_charge(&sub_id), Err(Ok(Error::PlanInactive)));
    assert_eq!(
        s.subs.try_subscribe(&s.customer, &s.plan_id),
        Err(Ok(Error::PlanInactive))
    );
}

#[test]
fn customer_can_revoke_the_allowance_from_their_wallet() {
    let s = setup();
    allow(&s, 12);
    let sub_id = s.subs.subscribe(&s.customer, &s.plan_id);

    // Revoking is just approving zero; no contract call needed.
    s.token_client
        .approve(&s.customer, &s.subs.address, &0, &100_000);
    advance(&s, MONTH);

    assert!(!s.subs.charge(&sub_id));
    assert_eq!(s.token_client.balance(&s.merchant), PRICE);
}

#[test]
fn unknown_ids_are_reported() {
    let s = setup();
    assert_eq!(s.subs.try_get_plan(&99), Err(Ok(Error::PlanNotFound)));
    assert_eq!(s.subs.try_charge(&99), Err(Ok(Error::SubscriptionNotFound)));
    assert_eq!(
        s.subs.try_subscribe(&s.customer, &99),
        Err(Ok(Error::PlanNotFound))
    );
}
