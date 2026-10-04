#![no_std]

//! Subscriptions: recurring payments on Stellar without handing over keys.
//!
//! A merchant publishes a *plan* (price, asset, billing period). A customer
//! subscribes by granting this contract a token **allowance**: a capped,
//! expiring permission to pull funds, which the customer can shrink or
//! revoke at any time from their own wallet. The first period is charged
//! on subscribe; after that anyone (usually the merchant's keeper bot)
//! calls `charge` when a period is due.
//!
//! Rules that protect subscribers:
//! - At most one charge per period, never more than the plan price.
//! - No back-billing: if charges were missed for several periods, the next
//!   charge covers one period and the schedule skips ahead.
//! - Cancelling stops all future charges immediately.
//! - A failed pull (allowance or balance too low) never reverts the
//!   keeper's call; the subscription is marked `PastDue` and can be
//!   retried once the subscriber tops up.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Plan {
    pub id: u64,
    pub merchant: Address,
    pub token: Address,
    /// Charged once per period, in the token's smallest unit.
    pub price: i128,
    /// Billing period in seconds (e.g. 2_592_000 for 30 days).
    pub period: u64,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SubStatus {
    Active = 0,
    PastDue = 1,
    Cancelled = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Subscription {
    pub id: u64,
    pub plan_id: u64,
    pub subscriber: Address,
    /// Ledger timestamp at which the next period becomes chargeable.
    pub next_charge_at: u64,
    pub periods_paid: u32,
    pub status: SubStatus,
}

#[contracttype]
pub enum DataKey {
    NextPlanId,
    NextSubId,
    Plan(u64),
    Sub(u64),
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    PlanNotFound = 1,
    SubscriptionNotFound = 2,
    InvalidPlan = 3,
    PlanInactive = 4,
    NotDue = 5,
    Cancelled = 6,
    NotMerchant = 7,
    NotSubscriber = 8,
    InitialPaymentFailed = 9,
}

#[contractevent(topics = ["sub", "plan"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlanCreated {
    pub plan_id: u64,
}

#[contractevent(topics = ["sub", "started"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Subscribed {
    #[topic]
    pub plan_id: u64,
    pub subscription_id: u64,
}

#[contractevent(topics = ["sub", "charged"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Charged {
    #[topic]
    pub subscription_id: u64,
    pub amount: i128,
    pub periods_paid: u32,
}

#[contractevent(topics = ["sub", "pastdue"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PastDue {
    pub subscription_id: u64,
}

#[contractevent(topics = ["sub", "cancel"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubCancelled {
    pub subscription_id: u64,
}

const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
const BUMP_TO: u32 = 120 * DAY_IN_LEDGERS;
/// Shortest allowed billing period (1 hour) to stop accidental drain plans.
pub const MIN_PERIOD: u64 = 3_600;

#[contract]
pub struct Subscriptions;

#[contractimpl]
impl Subscriptions {
    pub fn create_plan(
        env: Env,
        merchant: Address,
        token: Address,
        price: i128,
        period: u64,
    ) -> Result<u64, Error> {
        merchant.require_auth();
        if price <= 0 || period < MIN_PERIOD {
            return Err(Error::InvalidPlan);
        }
        let id = next_id(&env, DataKey::NextPlanId);
        let plan = Plan {
            id,
            merchant,
            token,
            price,
            period,
            active: true,
        };
        save_plan(&env, &plan);
        PlanCreated { plan_id: id }.publish(&env);
        Ok(id)
    }

    /// Merchant stops a plan: no new subscribers, and no further charges.
    pub fn deactivate_plan(env: Env, plan_id: u64) -> Result<(), Error> {
        let mut plan = Self::get_plan(env.clone(), plan_id)?;
        plan.merchant.require_auth();
        plan.active = false;
        save_plan(&env, &plan);
        Ok(())
    }

    /// Start a subscription and charge the first period immediately. The
    /// subscriber must already have approved this contract to spend at
    /// least `price` of the plan's token.
    pub fn subscribe(env: Env, subscriber: Address, plan_id: u64) -> Result<u64, Error> {
        subscriber.require_auth();
        let plan = Self::get_plan(env.clone(), plan_id)?;
        if !plan.active {
            return Err(Error::PlanInactive);
        }
        if !pull(&env, &plan, &subscriber) {
            return Err(Error::InitialPaymentFailed);
        }

        let now = env.ledger().timestamp();
        let id = next_id(&env, DataKey::NextSubId);
        let sub = Subscription {
            id,
            plan_id,
            subscriber,
            next_charge_at: now + plan.period,
            periods_paid: 1,
            status: SubStatus::Active,
        };
        save_sub(&env, &sub);
        Subscribed {
            plan_id,
            subscription_id: id,
        }
        .publish(&env);
        Charged {
            subscription_id: id,
            amount: plan.price,
            periods_paid: 1,
        }
        .publish(&env);
        Ok(id)
    }

    /// Charge a due period. Callable by anyone. Returns `true` if the
    /// payment went through, `false` if the pull failed and the
    /// subscription is now `PastDue` (the call itself still succeeds, so
    /// a keeper batch isn't reverted by one empty wallet).
    pub fn charge(env: Env, subscription_id: u64) -> Result<bool, Error> {
        let mut sub = Self::get_subscription(env.clone(), subscription_id)?;
        if sub.status == SubStatus::Cancelled {
            return Err(Error::Cancelled);
        }
        let plan = Self::get_plan(env.clone(), sub.plan_id)?;
        if !plan.active {
            return Err(Error::PlanInactive);
        }
        let now = env.ledger().timestamp();
        if now < sub.next_charge_at {
            return Err(Error::NotDue);
        }

        if !pull(&env, &plan, &sub.subscriber) {
            sub.status = SubStatus::PastDue;
            save_sub(&env, &sub);
            PastDue { subscription_id }.publish(&env);
            return Ok(false);
        }

        // No back-billing: skip any whole periods that were missed, so this
        // single charge covers the current period only.
        let missed = (now - sub.next_charge_at) / plan.period;
        sub.next_charge_at += (missed + 1) * plan.period;
        sub.periods_paid += 1;
        sub.status = SubStatus::Active;
        save_sub(&env, &sub);
        Charged {
            subscription_id,
            amount: plan.price,
            periods_paid: sub.periods_paid,
        }
        .publish(&env);
        Ok(true)
    }

    /// Subscriber or merchant can cancel; no further charges ever happen.
    pub fn cancel(env: Env, caller: Address, subscription_id: u64) -> Result<(), Error> {
        caller.require_auth();
        let mut sub = Self::get_subscription(env.clone(), subscription_id)?;
        let plan = Self::get_plan(env.clone(), sub.plan_id)?;
        if caller != sub.subscriber && caller != plan.merchant {
            return Err(Error::NotSubscriber);
        }
        if sub.status == SubStatus::Cancelled {
            return Err(Error::Cancelled);
        }
        sub.status = SubStatus::Cancelled;
        save_sub(&env, &sub);
        SubCancelled { subscription_id }.publish(&env);
        Ok(())
    }

    pub fn is_due(env: Env, subscription_id: u64) -> Result<bool, Error> {
        let sub = Self::get_subscription(env.clone(), subscription_id)?;
        Ok(sub.status != SubStatus::Cancelled && env.ledger().timestamp() >= sub.next_charge_at)
    }

    pub fn get_plan(env: Env, plan_id: u64) -> Result<Plan, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Plan(plan_id))
            .ok_or(Error::PlanNotFound)
    }

    pub fn get_subscription(env: Env, subscription_id: u64) -> Result<Subscription, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Sub(subscription_id))
            .ok_or(Error::SubscriptionNotFound)
    }
}

/// Pull one period's price from the subscriber to the merchant using the
/// allowance granted to this contract. Returns false instead of trapping
/// when the allowance or balance is insufficient.
fn pull(env: &Env, plan: &Plan, subscriber: &Address) -> bool {
    let client = token::Client::new(env, &plan.token);
    matches!(
        client.try_transfer_from(
            &env.current_contract_address(),
            subscriber,
            &plan.merchant,
            &plan.price,
        ),
        Ok(Ok(()))
    )
}

fn save_plan(env: &Env, plan: &Plan) {
    let key = DataKey::Plan(plan.id);
    env.storage().persistent().set(&key, plan);
    env.storage()
        .persistent()
        .extend_ttl(&key, BUMP_THRESHOLD, BUMP_TO);
}

fn save_sub(env: &Env, sub: &Subscription) {
    let key = DataKey::Sub(sub.id);
    env.storage().persistent().set(&key, sub);
    env.storage()
        .persistent()
        .extend_ttl(&key, BUMP_THRESHOLD, BUMP_TO);
}

fn next_id(env: &Env, key: DataKey) -> u64 {
    let next: u64 = env.storage().instance().get(&key).unwrap_or(0u64) + 1;
    env.storage().instance().set(&key, &next);
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
    next
}

mod test;
