import { addr, client, i128, server, u32, u64, XLM_SAC } from "./lib/stellar";

export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID ?? "CA3TWAQJKBKKMIGWHO72UEQ2XRXK5J7OWYOYM3F5LLHWPHTRVMX7A4PC";

export const ERRORS: Record<number, string> = {
  1: "No plan with that id.",
  2: "No subscription with that id.",
  3: "Price must be positive and the period at least an hour.",
  4: "This plan is no longer active.",
  5: "Not due yet: this period is already paid.",
  6: "This subscription was cancelled.",
  7: "Only the merchant can do that.",
  8: "Only the subscriber or merchant can cancel.",
  9: "The first payment failed. Approve an allowance of at least one period's price, and check your balance.",
};

export const billcycle = client(CONTRACT_ID, ERRORS);

export interface Plan {
  id: bigint;
  merchant: string;
  token: string;
  price: bigint;
  period: bigint;
  active: boolean;
}
export interface Subscription {
  id: bigint;
  plan_id: bigint;
  subscriber: string;
  next_charge_at: bigint;
  periods_paid: number;
  status: number; // 0 active, 1 past due, 2 cancelled
}

export const PERIODS: [string, number][] = [
  ["Hourly (testing)", 3600],
  ["Weekly", 604800],
  ["Monthly (30 days)", 2592000],
  ["Yearly", 31536000],
];

export function periodLabel(p: bigint | number): string {
  const n = Number(p);
  const hit = PERIODS.find(([, s]) => s === n);
  if (hit) return hit[0].replace(" (30 days)", "").replace(" (testing)", "");
  return n % 86400 === 0 ? `Every ${n / 86400} days` : `Every ${Math.round(n / 3600)}h`;
}

const COUNTERS: Record<string, string> = { get_plan: "plan_count", get_subscription: "subscription_count" };

/**
 * Load every plan or subscription. Uses the contract's counter and parallel
 * batches when available; older deployments fall back to probing ids.
 */
export async function scan<T>(method: string, batch = 10): Promise<T[]> {
  const out: T[] = [];
  const count = await billcycle.read<bigint>(COUNTERS[method]).then(Number, () => null);
  if (count !== null) {
    for (let start = 1; start <= count; start += batch) {
      const ids = Array.from({ length: Math.min(batch, count - start + 1) }, (_, i) => start + i);
      const got = await Promise.allSettled(ids.map((id) => billcycle.read<T>(method, [u64(id)])));
      for (const r of got) if (r.status === "fulfilled") out.push(r.value);
    }
    return out;
  }
  for (let id = 1; ; id++) {
    try {
      out.push(await billcycle.read<T>(method, [u64(id)]));
    } catch {
      break;
    }
  }
  return out;
}

const token = client(XLM_SAC);
export const tokenClient = (id: string) => (id === XLM_SAC ? token : client(id));

export async function allowance(tokenId: string, owner: string): Promise<bigint> {
  return tokenClient(tokenId).read<bigint>("allowance", [addr(owner), addr(CONTRACT_ID)]);
}

/** Approve `periods` × price for roughly `days` days of ledgers. */
export async function approve(tokenId: string, owner: string, amount: bigint, days: number) {
  const latest = await server.getLatestLedger();
  const expiration = latest.sequence + Math.min(days * 17_280, 3_000_000);
  return tokenClient(tokenId).invoke(owner, "approve", [addr(owner), addr(CONTRACT_ID), i128(amount), u32(expiration)]);
}
