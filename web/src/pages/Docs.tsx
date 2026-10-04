import { CONTRACT_ID } from "../billcycle";
import { contractLink } from "../lib/stellar";
import { Link, useTitle } from "../lib/router";

const SECTIONS = [
  ["start", "Getting started"],
  ["concepts", "Concepts"],
  ["reference", "Contract reference"],
  ["faq", "FAQ"],
] as const;

export function Docs() {
  useTitle("Docs · billcycle");
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 lg:grid-cols-[210px_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-1 text-sm">
          <p className="mb-3 px-3 text-xs font-extrabold uppercase tracking-[0.18em] text-mint">On this page</p>
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href="#/docs"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
              }}
              className="block rounded-lg px-3 py-2 text-sub hover:bg-card hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>
      </aside>

      <article className="min-w-0 space-y-16">
        <header>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-mint">Documentation</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-ink">How billcycle works</h1>
          <p className="mt-4 max-w-2xl text-lg text-sub">A Soroban contract for recurring payments where the subscriber, not the merchant, controls how much can ever be pulled.</p>
        </header>

        <section id="start" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-extrabold tracking-tight text-ink">Getting started</h2>
          <ol className="space-y-3">
            {START.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-mint text-white">{i + 1}</span>
                <p className="pt-0.5 text-ink/80">{step}</p>
              </li>
            ))}
          </ol>
          <Link to="/app" className="btn btn-mint inline-block inline-block">Browse plans →</Link>
        </section>

        <section id="concepts" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-extrabold tracking-tight text-ink">Concepts</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {CONCEPTS.map(([term, body]) => (
              <div key={term} className="card p-5">
                <h3 className="text-lg font-extrabold tracking-tight text-ink">{term}</h3>
                <p className="mt-1.5 text-sm text-sub">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="reference" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-extrabold tracking-tight text-ink">Contract reference</h2>
          <p className="text-sub">
            Deployed on testnet at{" "}
            <a className="break-all font-mono text-sm underline text-mint" href={contractLink(CONTRACT_ID)} target="_blank" rel="noreferrer">{CONTRACT_ID}</a>
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-sub">
                <tr>
                  <th className="p-3.5">Function</th>
                  <th className="p-3.5">Signed by</th>
                  <th className="p-3.5">What it does</th>
                </tr>
              </thead>
              <tbody>
                {REFERENCE.map(([fn, who, what]) => (
                  <tr key={fn} className="border-t border-line">
                    <td className="p-3.5 font-mono text-xs text-ink">{fn}</td>
                    <td className="p-3.5 text-sub">{who}</td>
                    <td className="p-3.5 text-sub">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 space-y-3">
          <h2 className="text-3xl font-extrabold tracking-tight text-ink">FAQ</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className="card group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink">
                {q}
                <span className="transition group-open:rotate-45 text-mint">+</span>
              </summary>
              <p className="mt-3 text-sm text-sub">{a}</p>
            </details>
          ))}
        </section>
      </article>
    </div>
  );
}

const START: string[] = [
  "Install the Freighter browser wallet, switch it to Testnet and fund the account with test XLM from Friendbot (lab.stellar.org/account/fund).",
  "Merchants: open the app, go to “For merchants” and create a plan with a price and billing period.",
  "Subscribers: pick a plan under “Browse plans”, approve the allowance and subscribe. The first period is charged right away.",
  "When a period comes due, the merchant (or any keeper) runs charge. Subscribers manage everything under “My subscriptions”."
];

const CONCEPTS: [string, string][] = [
  [
    "Plan",
    "Merchant, token, price and period. Deactivating a plan stops new sign-ups; existing subscriptions keep running."
  ],
  [
    "Subscription",
    "Links a subscriber to a plan, with the next charge time and the number of periods paid."
  ],
  [
    "Allowance",
    "A standard token approval with an expiry. It caps what billcycle can pull and can be revoked from the wallet."
  ],
  [
    "Past due",
    "If a charge fails for lack of funds or allowance, the subscription is marked past due rather than accruing debt."
  ]
];

const REFERENCE: [string, string, string][] = [
  [
    "create_plan(merchant, token, price, period)",
    "merchant",
    "Publishes a plan and returns its id"
  ],
  [
    "deactivate_plan(plan_id)",
    "merchant",
    "Stops new subscriptions to a plan"
  ],
  [
    "subscribe(subscriber, plan_id)",
    "subscriber",
    "Starts a subscription and charges the first period"
  ],
  [
    "charge(subscription_id)",
    "anyone",
    "Collects one period if it’s due"
  ],
  [
    "cancel(caller, subscription_id)",
    "subscriber or merchant",
    "Ends the subscription"
  ],
  [
    "is_due(subscription_id)",
    "—",
    "Whether a charge can run now"
  ],
  [
    "get_plan · get_subscription",
    "—",
    "Read state"
  ]
];

const FAQ: [string, string][] = [
  [
    "Can a merchant charge me twice in one period?",
    "No. A charge only succeeds once the period is due, and it moves exactly the plan price."
  ],
  [
    "What if I don’t have enough balance?",
    "The charge fails and the subscription becomes past due. Nothing is owed retroactively."
  ],
  [
    "Who runs the charges?",
    "Anyone. Merchants typically run a small scheduled job, but the contract doesn’t care who calls it."
  ],
  [
    "Which tokens work?",
    "Native XLM and any Stellar asset with a Stellar Asset Contract, such as USDC."
  ],
  [
    "How do I stop paying?",
    "Cancel in the app, or revoke the token allowance in your wallet. Either works on its own."
  ],
  [
    "Is it audited?",
    "Not yet. It runs on Stellar testnet and is open source; treat it as a working prototype until it has been audited."
  ]
];
