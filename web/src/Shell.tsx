import { useEffect, useRef, useState, type ReactNode } from "react";
import { short } from "./lib/format";
import type { Wallet } from "./Workspace";
import { CONTRACT_ID } from "./billcycle";
import { contractLink } from "./lib/stellar";
import { Link, useTitle } from "./lib/router";

const NAV = [
  ["/", "Home"],
  ["/app", "App"],
  ["/docs", "Docs"],
] as const;

const REPO = "https://github.com/miraclesonly/billcycle";

function HeaderAction({ wallet }: { wallet: Wallet }) {
  if (wallet.address)
    return <span className="rounded-xl bg-mint-soft px-3 py-2 font-mono text-xs text-night">● {short(wallet.address, 5)}</span>;
  return (
    <button className="btn btn-mint inline-block" onClick={wallet.connect} disabled={wallet.connecting}>
      {wallet.connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}

export function Shell({ route, wallet, children }: { route: string; wallet: Wallet; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Close on navigation; Escape closes and hands focus back to the toggle.
  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
            <span className="text-lg font-extrabold tracking-tight text-ink">billcycle</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map(([to, label]) => (
              <Link key={to} to={to} className={`rounded-xl px-3.5 py-2 text-sm font-bold ${route === to ? "bg-night text-white" : "text-sub hover:bg-card hover:text-ink"}`}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="hidden md:block">
            <HeaderAction wallet={wallet} />
          </div>
          <button className="rounded-xl border border-line bg-card px-3 py-2 md:hidden" onClick={() => setOpen((v) => !v)} ref={toggleRef} aria-label="Menu" aria-controls="mobile-menu" aria-expanded={open}>
            {open ? "✕" : "☰"}
          </button>
        </div>
        {open && (
          <div id="mobile-menu" ref={menuRef} className="space-y-1 border-t border-line px-5 py-4 md:hidden" onClick={() => setOpen(false)}>
            {NAV.map(([to, label]) => (
              <Link key={to} to={to} className={`block rounded-xl px-3.5 py-2 text-sm font-bold ${route === to ? "bg-night text-white" : "text-sub hover:bg-card hover:text-ink"}`}>
                {label}
              </Link>
            ))}
            <div className="pt-2">
              <HeaderAction wallet={wallet} />
            </div>
          </div>
        )}
        {wallet.error && <p className="bg-rose/10 text-rose py-2 text-center text-sm">{wallet.error}</p>}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-20 border-t border-line bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="text-lg font-extrabold tracking-tight text-ink">billcycle</p>
            <p className="mt-2 max-w-xs text-sm text-sub">Recurring payments on Stellar where the customer holds the cap.</p>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-ink">Product</p>
            <ul className="mt-3 space-y-2 text-sub">
              <li><Link to="/app" className="hover:underline">App</Link></li>
              <li><Link to="/docs" className="hover:underline">Documentation</Link></li>
              <li><Link to="/docs/faq" className="hover:underline">FAQ</Link></li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-ink">Open source</p>
            <ul className="mt-3 space-y-2 text-sub">
              <li><a href={REPO} target="_blank" rel="noreferrer" className="hover:underline">GitHub</a></li>
              <li><a href={contractLink(CONTRACT_ID)} target="_blank" rel="noreferrer" className="hover:underline">Contract on testnet</a></li>
              <li><a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className="hover:underline">MIT license</a></li>
            </ul>
          </div>
        </div>
        <p className="pb-8 text-center text-xs text-sub opacity-80">Runs on Stellar testnet. Not audited; don’t use with real funds yet.</p>
      </footer>
    </div>
  );
}

export function NotFound() {
  useTitle("Not found · billcycle");
  return (
    <section className="mx-auto max-w-xl px-5 py-28 text-center">
      <p className="text-8xl font-extrabold tracking-tight text-mint">404</p>
      <p className="mt-4 text-lg text-sub">There’s nothing at this address.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link to="/" className="btn btn-mint inline-block">Back home</Link>
        <Link to="/docs" className="btn btn-out inline-block">Read the docs</Link>
      </div>
    </section>
  );
}
