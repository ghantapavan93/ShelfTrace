"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShieldX,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  Tag,
  ScanLine,
  Globe,
} from "lucide-react";
import clsx from "clsx";
import { api, DEMO_BATCH } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money, timeOf } from "@/lib/format";
import { MetricCard } from "@/components/MetricCard";
import { Donut } from "@/components/Donut";
import { AuditTimeline } from "@/components/AuditTimeline";
import type { ChannelView } from "@/lib/types";

const CH_ICON = { esl: Tag, pos: ScanLine, ecommerce: Globe } as const;
const CH_NAME = { esl: "Shelf Label", pos: "Checkout POS", ecommerce: "Ecommerce" } as const;

function ChannelMini({ c }: { c: ChannelView }) {
  const Icon = CH_ICON[c.channel];
  const bad = c.status === "mismatch";
  const to = c.status === "timeout";
  return (
    <div
      className={clsx(
        "rounded-xl border px-3 py-3",
        bad ? "border-rose-500/40 bg-rose-500/5" : to ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5" /> {CH_NAME[c.channel]}
      </div>
      <div
        className={clsx(
          "mt-1 text-2xl font-bold tabular-nums",
          bad ? "text-danger text-glow-danger" : to ? "text-warn" : "text-verified",
        )}
      >
        {to ? money(c.expected_price) : money(c.observed_price ?? c.expected_price)}
      </div>
      <div className={clsx("mt-0.5 text-[11px] font-medium", bad ? "text-danger" : to ? "text-warn" : "text-verified")}>
        {bad ? "Mismatch" : to ? "No acknowledgement" : "Verified"}
      </div>
    </div>
  );
}

const STEPS = ["Select Stores", "Canary", "Evaluate", "Expand"];

export default function OperationsPage() {
  const { data, error } = useLive(() => api.operations(DEMO_BATCH));

  if (error)
    return (
      <div className="glass rounded-2xl p-6 text-sm text-slate-300">
        Could not reach the API at <span className="mono text-brand-400">{api.base}</span>. Is the backend running?
        <div className="mt-1 text-xs text-slate-500">{error}</div>
      </div>
    );
  if (!data) return <div className="text-slate-400">Loading command center…</div>;

  const b = data.batch;
  const crit = data.critical_incident;

  const HERO: Record<string, { title: string; sub: string; line: string }> = {
    blocked: {
      title: "Canary rollout stopped",
      sub: "before a checkout mismatch reached the zone.",
      line: "Expansion blocked",
    },
    partially_blocked: {
      title: "Expansion held",
      sub: "while shelf-label updates finish verifying.",
      line: "Expansion held",
    },
    canary_verifying: {
      title: "Canary verifying",
      sub: "checking POS, shelf labels and ecommerce.",
      line: "Verification in progress",
    },
    ready_for_expansion: {
      title: "Canary verified",
      sub: "ready to expand to the full zone.",
      line: "Expansion eligible",
    },
    expanding: {
      title: "Expanding to the zone",
      sub: "verifying the remaining stores.",
      line: "Expanding",
    },
    completed: {
      title: "Rollout complete",
      sub: "every store verified across all channels.",
      line: "Completed",
    },
  };
  const hero = HERO[b.status] ?? HERO.canary_verifying;
  const danger = b.status === "blocked";
  const held = b.expansion_blocked;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-ink-850 via-ink-900 to-black px-7 py-8"
      >
        <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(60%_80%_at_80%_30%,rgba(255,106,43,0.18),transparent_70%)]" />
        <div className="relative max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-400">
            Operations Command Center
          </div>
          <h1 className="mt-3 text-4xl font-bold leading-tight text-white">
            {hero.title}
            <span className="block text-2xl font-medium text-slate-400">{hero.sub}</span>
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-300">
            <span>
              {b.critical_incidents} critical · {b.deadline_risks} deadline risk
            </span>
            <span className="text-slate-600">•</span>
            <span className={held ? (danger ? "text-danger" : "text-warn") : "text-verified"}>{hero.line}</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">No shopper impact</span>
          </div>
        </div>
        <div className="relative mt-6 flex items-center gap-3">
          <div
            className={clsx(
              "grid h-16 w-16 place-items-center rounded-2xl border",
              danger
                ? "border-rose-500/40 bg-rose-500/10 shadow-glow-danger"
                : held
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-emerald-500/40 bg-emerald-500/10 shadow-glow-verified",
            )}
          >
            {held ? (
              <ShieldX className={clsx("h-8 w-8", danger ? "text-danger" : "text-warn")} />
            ) : (
              <ShieldCheck className="h-8 w-8 text-verified" />
            )}
          </div>
          <div className="text-xs uppercase tracking-widest text-slate-400">
            Expansion
            <span className={clsx("ml-2 font-bold", danger ? "text-danger" : held ? "text-warn" : "text-verified")}>
              {hero.line}
            </span>
          </div>
        </div>
      </motion.section>

      {/* Metrics */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard value={b.total_actions} label="Price actions" sub="In this batch" tone="brand" />
        <MetricCard
          value={`${b.canary_store_ids.length} of ${b.total_store_count}`}
          label="Stores in canary"
          sub="Testing first"
          tone="warn"
          progress={b.canary_store_ids.length / b.total_store_count}
        />
        <MetricCard
          value={b.verified_actions}
          label="Verified actions"
          sub={`${data.rollout_progress.verified_pct}% of canary`}
          tone="verified"
          progress={data.rollout_progress.verified / (b.canary_action_count || 1)}
        />
        <MetricCard value={b.critical_incidents} label="Critical incident" sub="Requires attention" tone="danger" />
        <MetricCard value={b.deadline_risks} label="Deadline risk" sub="Needs resolution" tone="warn" />
        <MetricCard
          value={b.expansion_blocked ? "Blocked" : "Clear"}
          label="Expansion status"
          sub={b.expansion_blocked ? "Until issues resolved" : "Safe to expand"}
          tone={b.expansion_blocked ? "danger" : "verified"}
        />
      </section>

      {/* Critical + side cards */}
      <section className="grid gap-4 xl:grid-cols-3">
        {crit ? (
          <div className="glass-strong rounded-2xl border border-rose-500/30 p-5 xl:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-danger">
                  <AlertTriangle className="h-4 w-4" /> Critical Incident
                  <span className="font-normal text-slate-500">· detected {timeOf(crit.created_at)}</span>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-white">
                  {crit.product_name} · Store {crit.store_id}
                </h2>
                <p className="text-sm text-slate-400">Checkout mismatch detected between shelf label and POS.</p>
              </div>
              <Link
                href={`/operations/incidents/${crit.id}`}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Investigate <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {crit.channels.map((c) => (
                <ChannelMini key={c.channel} c={c} />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2.5 text-sm text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
              A shopper could see {money(crit.approved_price)} on the shelf and be charged{" "}
              {money(crit.observed_price)} at checkout.
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <Meta k="Incident ID" v={crit.id} />
              <Meta k="First detected" v={timeOf(crit.created_at)} />
              <Meta k="Impact" v={`Store ${crit.store_id}`} />
              <Meta k="Status" v={crit.status} />
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-5 xl:col-span-2 text-slate-300">No critical incidents. 🎉</div>
        )}

        <div className="space-y-4">
          {data.deadline_risk && (
            <div className="glass rounded-2xl border border-amber-500/25 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-warn">
                <Clock className="h-4 w-4" /> Deadline Risk
              </div>
              <h3 className="mt-2 font-semibold text-white">{data.deadline_risk.product_name}</h3>
              <p className="mt-1 text-xs text-slate-400">
                Markdown deadline approaching. Shelf label has not acknowledged the update.
              </p>
              <Link
                href={`/operations/incidents/${data.deadline_risk.id}`}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-warn hover:underline"
              >
                Review <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
          {data.eligible_action && (
            <div className="glass rounded-2xl border border-emerald-500/25 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-verified">
                <ShieldCheck className="h-4 w-4" /> Verified · Eligible for expansion
              </div>
              <h3 className="mt-2 font-semibold text-white">{data.eligible_action.product_name}</h3>
              <p className="mt-1 text-xs text-slate-400">All channels verified and ready to expand.</p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full rounded-full bg-verified" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Activity + progress + stepper */}
      <section className="grid gap-4 xl:grid-cols-3">
        <div className="glass rounded-2xl p-5 xl:col-span-2">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">Recent Activity</h3>
          <AuditTimeline events={data.recent_activity.slice(0, 6)} />
        </div>
        <div className="space-y-4">
          <div className="glass rounded-2xl p-5">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">Rollout Progress</h3>
            <div className="flex items-center gap-4">
              <Donut
                verified={data.rollout_progress.verified}
                blocked={data.rollout_progress.blocked}
                pending={data.rollout_progress.pending}
                total={data.rollout_progress.total}
              />
              <ul className="space-y-1.5 text-xs">
                <Legend color="bg-verified" label="Verified" v={data.rollout_progress.verified} />
                <Legend color="bg-danger" label="Blocked" v={data.rollout_progress.blocked} />
                <Legend color="bg-warn" label="Pending" v={data.rollout_progress.pending} />
              </ul>
            </div>
          </div>
          <div className="glass rounded-2xl p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">Expansion Status</h3>
            <div className="flex items-center justify-between">
              {STEPS.map((s, i) => {
                const state = i === 0 ? "done" : i === 1 ? "active" : "pending";
                return (
                  <div key={s} className="flex flex-1 flex-col items-center text-center">
                    <span
                      className={clsx(
                        "grid h-7 w-7 place-items-center rounded-full text-xs font-bold",
                        state === "done"
                          ? "bg-brand text-white"
                          : state === "active"
                            ? "bg-brand/30 text-brand-400 ring-2 ring-brand/50"
                            : "bg-white/5 text-slate-500",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="mt-1 text-[10px] text-slate-400">{s}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-slate-500">{k}</div>
      <div className="mono truncate text-slate-200">{v}</div>
    </div>
  );
}

function Legend({ color, label, v }: { color: string; label: string; v: number }) {
  return (
    <li className="flex items-center gap-2 text-slate-300">
      <span className={clsx("h-2.5 w-2.5 rounded-full", color)} /> {label}
      <span className="ml-auto tabular-nums text-slate-400">{v}</span>
    </li>
  );
}
