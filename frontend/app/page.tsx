import Link from "next/link";
import {
  Play,
  ArrowRight,
  Target,
  MonitorCheck,
  ShieldAlert,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { LivePipeline } from "@/components/LivePipeline";

const FEATURES = [
  {
    n: "01",
    title: "Canary First",
    Icon: Target,
    points: ["Start small. Always.", "Probe low-risk stores first.", "Auto-pause on anomalies.", "Data-driven confidence gates."],
  },
  {
    n: "02",
    title: "Verify Every Channel",
    Icon: MonitorCheck,
    points: ["POS, ESL, Ecommerce.", "Prices, promos, taxes & rounding.", "Real-time verification.", "See the truth before full expansion."],
  },
  {
    n: "03",
    title: "Block Risky Changes",
    Icon: ShieldAlert,
    points: ["Detect mismatches & violations.", "Auto-hold before expansion.", "Protect margin & shopper trust.", "Stop bad changes from spreading."],
  },
  {
    n: "04",
    title: "Explain & Recover",
    Icon: RefreshCw,
    points: ["Root cause in seconds.", "One-click rollback or safe expansion.", "Complete audit trail.", "Recover fast. Learn continuously."],
  },
];

const STACK = ["Next.js", "TypeScript", "FastAPI", "PostgreSQL", "Redis", "Docker", "Azure-ready"];

const PREVIEWS = [
  { href: "/operations", title: "Operations Command Center", sub: "Rollout health · stores · at-risk · blocked" },
  { href: "/operations/incidents", title: "Incident Detail", sub: "Shelf vs POS variance · root cause" },
  { href: "/engineering", title: "Engineering Trace", sub: "Batch → canary → verify → block" },
];

export default function Landing() {
  return (
    <div className="bg-aurora min-h-screen">
      <TopNav />

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-5 pb-10 pt-12">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-400">
              Execution Reliability After Approval
            </span>
            <h1 className="mt-5 text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl">
              ShelfTrace
              <br />
              Control Plane
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
              A pricing system decides the right price.{" "}
              <span className="text-brand-400">ShelfTrace makes sure it actually reaches every channel safely</span>{" "}
              before touching the full zone.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Canary rollout. Execution verification. Shopper trust. Safe recovery.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/operations"
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110"
              >
                <Play className="h-4 w-4" /> Open the Command Center
              </Link>
              <Link
                href="/engineering"
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                View Architecture
              </Link>
            </div>
          </div>
          <LivePipeline />
        </div>

        {/* Problem band */}
        <div className="mt-12 overflow-hidden rounded-3xl border border-rose-500/20 bg-gradient-to-br from-rose-950/30 via-black to-black p-7">
          <div className="grid items-center gap-6 md:grid-cols-[auto_auto_1fr]">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-rose-400">The problem</div>
              <div className="mt-2 text-3xl font-bold text-white">
                Shelf: <span className="text-verified">$4.19</span>
              </div>
              <div className="text-3xl font-bold text-white">
                Checkout: <span className="text-danger text-glow-danger">$4.49</span>
              </div>
            </div>
            <div className="grid h-16 w-16 place-items-center rounded-full border border-rose-500/40 bg-rose-500/10 shadow-glow-danger">
              <AlertCircle className="h-8 w-8 text-danger" />
            </div>
            <div>
              <div className="text-2xl font-bold text-danger">Expansion blocked</div>
              <p className="mt-1 max-w-md text-sm text-slate-400">
                before shoppers were affected. Price changes fail in the real world — late updates, bad promos, or
                mismatched systems. ShelfTrace prevents execution risk from becoming shopper impact.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.n} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand-400">
                  <f.Icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-slate-600">{f.n}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
              <ul className="mt-3 space-y-1.5">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm text-slate-400">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand/70" /> {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Built for teams */}
      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="glass-strong rounded-3xl p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr] lg:items-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-brand-400">
                Built for operations &amp; engineering
              </div>
              <h2 className="mt-2 text-3xl font-bold text-white">Designed for teams who own execution.</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {PREVIEWS.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className="group rounded-2xl border border-white/10 bg-black/40 p-4 transition hover:border-brand/40"
                >
                  <div className="flex h-20 items-center justify-center rounded-xl bg-gradient-to-br from-ink-800 to-black text-xs text-slate-500">
                    <span className="rounded-md border border-white/10 px-2 py-1">{p.title}</span>
                  </div>
                  <div className="mt-3 text-sm font-medium text-white">{p.title}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{p.sub}</div>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-400 opacity-0 transition group-hover:opacity-100">
                    Open <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Stack */}
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/5 pt-5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Built on modern, reliable infrastructure
            </span>
            {STACK.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-sm text-slate-300">
                <span className="h-2 w-2 rounded-full bg-brand/70" /> {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-5 py-10">
        <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-white/10 bg-gradient-to-r from-ink-850 to-black p-7 md:flex-row">
          <div>
            <h3 className="text-2xl font-bold text-white">
              Execution is your last mile. <span className="text-brand-400">Make it your strongest.</span>
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              ShelfTrace Control Plane — the execution reliability layer for AI-approved pricing.
            </p>
          </div>
          <Link
            href="/operations"
            className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110"
          >
            <Play className="h-4 w-4" /> Open the demo
          </Link>
        </div>
        <p className="mt-6 text-center text-xs text-slate-600">
          Independent execution-reliability prototype with simulated POS / ESL / Ecommerce adapters and sample data.
          Not affiliated with, or a claim about, any company&apos;s internal systems.
        </p>
      </section>
    </div>
  );
}
