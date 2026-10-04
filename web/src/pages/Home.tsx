import { useEffect, useState } from "react";
import { periodLabel, scan, type Plan, type Subscription } from "../billcycle";
import { XLM_SAC } from "../lib/stellar";
import { fromUnits } from "../lib/format";
import { Link, useTitle } from "../lib/router";

export function Home() {
  useTitle("billcycle · recurring payments with a customer-held cap");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  useEffect(() => {
    scan<Plan>("get_plan").then(setPlans).catch(() => setPlans([]));
    scan<Subscription>("get_subscription").then(setSubs).catch(() => setSubs([]));
  }, []);
  const STATS: [string, string][] = [
    ["Plans", plans ? String(plans.length) : "…"],
    ["Active subs", subs ? String(subs.filter((s) => s.status === 0).length) : "…"],
    ["Charges settled", subs ? String(subs.reduce((n, s) => n + s.periods_paid, 0)) : "…"],
  ];
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-[1.2fr_1fr] md:pt-20">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-mint">Recurring payments on Stellar</p>
          <h1 className="mt-4 text-5xl leading-[1.03] md:text-6xl font-extrabold tracking-tight text-ink">Subscriptions where the <span className="text-mint">customer holds the cap</span>.</h1>
          <p className="mt-6 max-w-xl text-lg text-sub">Merchants publish a plan. Subscribers approve a spending limit they can revoke any time. The contract charges once per period, never more than the plan price, and never back-bills a missed month.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app" className="btn btn-mint inline-block">Browse plans →</Link>
            <Link to="/docs" className="btn btn-out inline-block">How it works</Link>
          </div>
          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
            {STATS.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wider text-sub">{label}</dt>
                <dd className="mt-1 text-2xl font-extrabold tracking-tight text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="card p-7">
          <p className="text-xs font-extrabold uppercase tracking-wider text-sub">Live plans on testnet</p>
          <div className="mt-4 space-y-3">
            {plans === null && <p className="text-sm text-sub">Loading…</p>}
            {plans?.length === 0 && <p className="text-sm text-sub">No plans yet.</p>}
            {plans?.slice(0, 3).map((p) => (
              <div key={String(p.id)} className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
                <div>
                  <p className="font-extrabold">Plan #{String(p.id)}</p>
                  <p className="text-xs text-sub">{p.active ? "accepting subscribers" : "closed to new subscribers"}</p>
                </div>
                <p className="text-right">
                  <span className="text-xl font-extrabold">{fromUnits(p.price)}</span>{" "}
                  <span className="text-sm text-sub">
                    {p.token === XLM_SAC ? "XLM" : "tokens"} · {periodLabel(p.period)}
                  </span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl bg-mint-soft p-4 text-sm text-night">
            🔒 Subscribers approve a capped allowance. The merchant can pull at most one period’s price, once per period.
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-card">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-mint">How it works</p>
          <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight text-ink">Pull payments without the blank cheque</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="card p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold bg-mint text-white">{i + 1}</span>
                <h3 className="mt-4 text-xl font-extrabold tracking-tight text-ink">{title}</h3>
                <p className="mt-2 text-sm text-sub">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-mint">Use cases</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight text-ink">Recurring revenue, minus the card network</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {USES.map(([icon, title, body]) => (
            <div key={title} className="card p-6">
              <span className="text-3xl">{icon}</span>
              <h3 className="mt-3 text-lg font-extrabold tracking-tight text-ink">{title}</h3>
              <p className="mt-2 text-sm text-sub">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-mint">Guarantees</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight text-ink">Fair to both sides</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PROMISES.map(([title, body]) => (
            <div key={title} className="rounded-2xl p-7 bg-night text-white">
              <h3 className="text-xl font-extrabold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm text-white/70">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-20">
        <div className="card flex flex-col items-start justify-between gap-6 p-10 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-ink">Launch a plan in under a minute.</h2>
            <p className="mt-2 text-sub">Connect Freighter on testnet, open “For merchants”, and set a price and a period.</p>
          </div>
          <Link to="/app" className="btn btn-mint inline-block shrink-0">Browse plans →</Link>
        </div>
      </section>
    </>
  );
}

const STEPS: [string, string][] = [
  [
    "Merchant creates a plan",
    "Price, token and billing period. The plan id is all a customer needs."
  ],
  [
    "Customer subscribes",
    "They approve a token allowance and subscribe; the first period is charged immediately."
  ],
  [
    "Charged on schedule",
    "Anyone can run the charge once a period is due. If funds or allowance run out, the subscription goes past due instead of piling up debt."
  ]
];

const USES: [string, string, string][] = [
  [
    "📰",
    "Newsletters & media",
    "Monthly memberships paid in USDC or XLM, cancellable in one click."
  ],
  [
    "🛠️",
    "SaaS tools",
    "Plans billed on-chain with no chargebacks and no card fees."
  ],
  [
    "🎮",
    "Communities",
    "Discord or game-server memberships tied to an active subscription."
  ],
  [
    "☁️",
    "API access",
    "Usage tiers paid per period, verifiable by any backend."
  ]
];

const PROMISES: [string, string][] = [
  [
    "Never more than the price",
    "A charge moves exactly one period’s price. The contract has no way to take more."
  ],
  [
    "No back-billing",
    "Missed periods aren’t accumulated. A lapsed subscriber isn’t charged for the months they missed."
  ],
  [
    "Cancel any time",
    "Subscriber or merchant can cancel instantly, and revoking the allowance stops charges at the source."
  ]
];
