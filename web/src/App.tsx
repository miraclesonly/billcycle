import { useCallback, useEffect, useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { allowance, approve, billcycle, CONTRACT_ID, periodLabel, PERIODS, scan, type Plan, type Subscription } from "./billcycle";
import { addr, contractLink, i128, txLink, u64, XLM_SAC } from "./lib/stellar";
import { dateOf, fromUnits, short, timeLeft, toUnits } from "./lib/format";
import { useWallet } from "./lib/useWallet";
import { useAction } from "./lib/useAction";

type Wallet = ReturnType<typeof useWallet>;
type Tab = "plans" | "mine" | "merchant";

const asset = (t: string) => (t === XLM_SAC ? "XLM" : short(t, 4));

export default function App() {
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("plans");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [subs, setSubs] = useState<Subscription[] | null>(null);

  const refresh = useCallback(async () => {
    const [p, s] = await Promise.all([scan<Plan>("get_plan"), scan<Subscription>("get_subscription")]);
    setPlans(p);
    setSubs(s);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const stats = {
    active: subs?.filter((s) => s.status === 0).length ?? 0,
    mrr: (plans ?? [])
      .filter((p) => p.active && p.token === XLM_SAC)
      .reduce((sum, p) => {
        const n = subs?.filter((s) => s.plan_id === p.id && s.status === 0).length ?? 0;
        return sum + (p.price * BigInt(n) * 2_592_000n) / p.period;
      }, 0n),
  };

  return (
    <div className="min-h-screen">
      <header className="bg-night text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" className="h-8 w-8" alt="" />
            <span className="text-lg font-extrabold tracking-tight">billcycle</span>
          </div>
          {wallet.address ? (
            <span className="rounded-xl bg-white/10 px-3 py-2 font-mono text-xs">{short(wallet.address, 5)}</span>
          ) : (
            <button className="btn btn-mint" onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? "Connecting…" : "Connect Freighter"}
            </button>
          )}
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-12 pt-8">
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight md:text-5xl">
            Recurring payments where the <span className="text-mint">customer holds the cap</span>.
          </h1>
          <p className="mt-4 max-w-2xl text-white/70">
            Subscribers approve a spending limit they can revoke any time. Merchants are paid once per period, never
            back-billed, never more than the plan price.
          </p>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            {[
              ["Plans", plans?.length ?? "…"],
              ["Active subs", subs ? stats.active : "…"],
              ["Monthly volume", plans && subs ? `${fromUnits(stats.mrr)} XLM` : "…"],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-2xl bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wider text-white/50">{k}</p>
                <p className="mt-1 text-xl font-extrabold">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </header>
      {wallet.error && <p className="bg-rose/10 py-2 text-center text-sm text-rose">{wallet.error}</p>}

      <div className="mx-auto -mt-6 max-w-6xl px-5">
        <div className="card inline-flex gap-1 p-1.5">
          {(
            [
              ["plans", "Browse plans"],
              ["mine", "My subscriptions"],
              ["merchant", "For merchants"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={`btn ${tab === id ? "btn-night" : "text-sub"}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-5 py-8">
        {tab === "plans" && <PlansView plans={plans} wallet={wallet} onChange={refresh} />}
        {tab === "mine" && <MineView plans={plans ?? []} subs={subs} wallet={wallet} onChange={refresh} />}
        {tab === "merchant" && <MerchantView plans={plans ?? []} subs={subs ?? []} wallet={wallet} onChange={refresh} />}
      </main>

      <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-sub">
        Contract{" "}
        <a className="font-mono underline" href={contractLink(CONTRACT_ID)} target="_blank" rel="noreferrer">
          {short(CONTRACT_ID, 6)}
        </a>{" "}
        · Stellar testnet ·{" "}
        <a className="underline" href="https://github.com/miraclesonly/billcycle" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}

function Msg({ a }: { a: ReturnType<typeof useAction> }) {
  if (a.error) return <p className="rounded-xl bg-rose/10 px-3 py-2 text-sm text-rose">{a.error}</p>;
  if (a.notice)
    return (
      <p className="rounded-xl bg-mint-soft px-3 py-2 text-sm text-night">
        {a.notice.text}{" "}
        {a.notice.hash && (
          <a className="underline" href={txLink(a.notice.hash)} target="_blank" rel="noreferrer">
            View tx
          </a>
        )}
      </p>
    );
  return null;
}

function PlansView({ plans, wallet, onChange }: { plans: Plan[] | null; wallet: Wallet; onChange: () => void }) {
  if (!plans) return <p className="text-sub">Loading plans…</p>;
  const active = plans.filter((p) => p.active);
  if (!active.length) return <p className="card p-8 text-sub">No active plans yet. Create one under "For merchants".</p>;
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {active.map((p) => (
        <PlanCard key={String(p.id)} plan={p} wallet={wallet} onChange={onChange} />
      ))}
    </div>
  );
}

function PlanCard({ plan, wallet, onChange }: { plan: Plan; wallet: Wallet; onChange: () => void }) {
  const [periods, setPeriods] = useState(12);
  const [allowed, setAllowed] = useState<bigint | null>(null);
  const act = useAction();

  useEffect(() => {
    if (wallet.address) allowance(plan.token, wallet.address).then(setAllowed).catch(() => setAllowed(0n));
  }, [wallet.address, plan.token]);

  const enough = allowed !== null && allowed >= plan.price;
  const days = Math.ceil((Number(plan.period) * periods) / 86400) + 7;

  return (
    <div className="card flex flex-col p-6">
      <div className="flex items-center justify-between">
        <span className="chip bg-mint-soft text-night">Plan #{String(plan.id)}</span>
        <span className="text-xs text-sub">by {short(plan.merchant)}</span>
      </div>
      <p className="mt-5 text-4xl font-extrabold">
        {fromUnits(plan.price)} <span className="text-base font-bold text-sub">{asset(plan.token)}</span>
      </p>
      <p className="text-sm font-semibold text-mint">{periodLabel(plan.period)}</p>

      <div className="mt-5 rounded-xl bg-bg p-4 text-sm">
        <p className="font-bold">Step 1 · Set your spending cap</p>
        <div className="mt-2 flex items-center gap-2">
          <input className="inp w-20" type="number" min="1" max="60" value={periods} onChange={(e) => setPeriods(Number(e.target.value))} />
          <span className="text-sub">periods = {fromUnits(plan.price * BigInt(Math.max(1, periods)))} {asset(plan.token)}</span>
        </div>
        {allowed !== null && <p className="mt-2 text-xs text-sub">Current allowance: {fromUnits(allowed)} {asset(plan.token)}</p>}
        <button
          className="btn btn-soft mt-3 w-full"
          disabled={!!act.busy}
          onClick={async () => {
            const me = wallet.address ?? (await wallet.connect());
            if (!me) return;
            await act.run(
              "approve",
              async () => {
                const r = await approve(plan.token, me, plan.price * BigInt(Math.max(1, periods)), days);
                setAllowed(await allowance(plan.token, me));
                return r;
              },
              (r) => ({ text: "Allowance approved.", hash: r.hash }),
            );
          }}
        >
          Approve cap
        </button>
      </div>
      <button
        className="btn btn-mint mt-3"
        disabled={!!act.busy || !enough}
        title={enough ? "" : "Approve a cap first"}
        onClick={() =>
          act.run(
            "sub",
            async () => {
              const r = await billcycle.invoke<bigint>(wallet.address!, "subscribe", [addr(wallet.address!), u64(plan.id)]);
              onChange();
              return r;
            },
            (r) => ({ text: `Subscribed (#${r.result}). First period paid.`, hash: r.hash }),
          )
        }
      >
        Step 2 · Subscribe
      </button>
      <div className="mt-3">
        <Msg a={act} />
      </div>
    </div>
  );
}

const STATUS = [
  ["Active", "bg-mint-soft text-night"],
  ["Past due", "bg-amber/15 text-amber"],
  ["Cancelled", "bg-line text-sub"],
] as const;

function SubRow({ s, plan, me, onChange }: { s: Subscription; plan?: Plan; me: string | null; onChange: () => void }) {
  const act = useAction();
  const due = s.status !== 2 && Number(s.next_charge_at) * 1000 <= Date.now();
  const canCancel = me && (me === s.subscriber || me === plan?.merchant) && s.status !== 2;
  return (
    <div className="card flex flex-col gap-4 p-5 md:flex-row md:items-center">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`chip ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span>
          <span className="text-sm font-bold">Subscription #{String(s.id)}</span>
          <span className="text-xs text-sub">· plan #{String(s.plan_id)}</span>
        </div>
        <p className="mt-1 text-sm text-sub">
          {plan ? `${fromUnits(plan.price)} ${asset(plan.token)} ${periodLabel(plan.period).toLowerCase()}` : ""} · subscriber{" "}
          <span className="font-mono">{short(s.subscriber)}</span>
        </p>
      </div>
      <div className="text-sm">
        <p className="text-xs uppercase tracking-wider text-sub">Next charge</p>
        <p className="font-bold">{s.status === 2 ? "—" : `${dateOf(s.next_charge_at)} (${timeLeft(s.next_charge_at)})`}</p>
      </div>
      <div className="text-sm">
        <p className="text-xs uppercase tracking-wider text-sub">Paid</p>
        <p className="font-bold">{s.periods_paid} period{s.periods_paid === 1 ? "" : "s"}</p>
      </div>
      <div className="flex gap-2">
        {due && me && (
          <button
            className="btn btn-night"
            disabled={!!act.busy}
            onClick={() =>
              act.run("charge", async () => {
                const r = await billcycle.invoke<boolean>(me, "charge", [u64(s.id)]);
                onChange();
                return r;
              }, (r) => ({ text: r.result ? "Charged." : "Pull failed: now past due.", hash: r.hash }))
            }
          >
            Charge now
          </button>
        )}
        {canCancel && (
          <button
            className="btn btn-out"
            disabled={!!act.busy}
            onClick={() =>
              confirm("Cancel this subscription? No further charges will happen.") &&
              act.run("cancel", async () => {
                const r = await billcycle.invoke(me!, "cancel", [addr(me!), u64(s.id)]);
                onChange();
                return r;
              }, (r) => ({ text: "Cancelled.", hash: r.hash }))
            }
          >
            Cancel
          </button>
        )}
      </div>
      {(act.error || act.notice) && (
        <div className="md:basis-full">
          <Msg a={act} />
        </div>
      )}
    </div>
  );
}

function MineView({ plans, subs, wallet, onChange }: { plans: Plan[]; subs: Subscription[] | null; wallet: Wallet; onChange: () => void }) {
  const [viewAs, setViewAs] = useState("");
  const who = wallet.address ?? (StrKey.isValidEd25519PublicKey(viewAs) ? viewAs : null);
  const mine = (subs ?? []).filter((s) => s.subscriber === who);
  return (
    <div className="space-y-4">
      {!wallet.address && (
        <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <p className="text-sm text-sub">Connect your wallet, or look up any address read-only:</p>
          <input className="inp font-mono text-xs sm:max-w-md" placeholder="G…" value={viewAs} onChange={(e) => setViewAs(e.target.value.trim())} />
        </div>
      )}
      {who && mine.length === 0 && <p className="card p-8 text-sub">No subscriptions for {short(who)} yet.</p>}
      {mine.map((s) => (
        <SubRow key={String(s.id)} s={s} plan={plans.find((p) => p.id === s.plan_id)} me={wallet.address} onChange={onChange} />
      ))}
      <p className="text-xs text-sub">
        Revoke the cap any time from your wallet by approving 0 for this contract. Charges stop at the next period.
      </p>
    </div>
  );
}

function MerchantView({ plans, subs, wallet, onChange }: { plans: Plan[]; subs: Subscription[]; wallet: Wallet; onChange: () => void }) {
  const [price, setPrice] = useState("10");
  const [period, setPeriod] = useState(2_592_000);
  const [token, setToken] = useState(XLM_SAC);
  const act = useAction();
  const mine = plans.filter((p) => p.merchant === wallet.address);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <form
        className="card h-fit p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const me = wallet.address ?? (await wallet.connect());
          if (!me) return;
          act.run(
            "plan",
            async () => {
              const r = await billcycle.invoke<bigint>(me, "create_plan", [addr(me), addr(token), i128(toUnits(price)), u64(period)]);
              onChange();
              return r;
            },
            (r) => ({ text: `Plan #${r.result} is live.`, hash: r.hash }),
          );
        }}
      >
        <h2 className="text-xl font-extrabold">Create a plan</h2>
        <label className="mt-4 block text-sm font-semibold">
          Price per period
          <input className="inp mt-1" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm font-semibold">
          Billing period
          <select className="inp mt-1" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
            {PERIODS.map(([l, s]) => (
              <option key={s} value={s}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm font-semibold">
          Asset contract
          <input className="inp mt-1 font-mono text-xs" value={token} onChange={(e) => setToken(e.target.value.trim())} />
        </label>
        <button className="btn btn-mint mt-5 w-full" disabled={!!act.busy}>
          {act.busy ? "Confirm in wallet…" : "Publish plan"}
        </button>
        <div className="mt-3">
          <Msg a={act} />
        </div>
      </form>
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">Your plans</h2>
        {!wallet.address && <p className="card p-6 text-sub">Connect your merchant wallet to see your plans and subscribers.</p>}
        {wallet.address && mine.length === 0 && <p className="card p-6 text-sub">You haven't published a plan yet.</p>}
        {mine.map((p) => (
          <MerchantPlan key={String(p.id)} plan={p} subs={subs.filter((s) => s.plan_id === p.id)} wallet={wallet} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}

function MerchantPlan({ plan, subs, wallet, onChange }: { plan: Plan; subs: Subscription[]; wallet: Wallet; onChange: () => void }) {
  const act = useAction();
  const active = subs.filter((s) => s.status === 0).length;
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold">
            Plan #{String(plan.id)} · {fromUnits(plan.price)} {asset(plan.token)} {periodLabel(plan.period).toLowerCase()}
          </p>
          <p className="text-sm text-sub">
            {active} active · {subs.length - active} inactive · {plan.active ? "accepting subscribers" : "deactivated"}
          </p>
        </div>
        {plan.active && (
          <button
            className="btn btn-out"
            disabled={!!act.busy}
            onClick={() =>
              confirm("Deactivate this plan? It stops new subscriptions and all further charges.") &&
              act.run("deact", async () => {
                const r = await billcycle.invoke(wallet.address!, "deactivate_plan", [u64(plan.id)]);
                onChange();
                return r;
              }, (r) => ({ text: "Plan deactivated.", hash: r.hash }))
            }
          >
            Deactivate
          </button>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {subs.map((s) => (
          <SubRow key={String(s.id)} s={s} plan={plan} me={wallet.address} onChange={onChange} />
        ))}
      </div>
      <div className="mt-2">
        <Msg a={act} />
      </div>
    </div>
  );
}
