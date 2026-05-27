"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldX,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  ArrowUpRight,
  Tag,
  ScanLine,
  Globe,
  RotateCcw,
  FlaskConical,
  ExternalLink,
} from "lucide-react";
import clsx from "clsx";
import { api, DEMO_BATCH } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money, timeOf, dateTimeOf } from "@/lib/format";
import { MetricCard } from "@/components/MetricCard";
import { Donut } from "@/components/Donut";
import { AuditTimeline } from "@/components/AuditTimeline";
import { BatchPicker } from "@/components/BatchPicker";
import { OperationsSkeleton } from "@/components/Skeleton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useWorkMode } from "@/components/ModeProvider";
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

/** Hero copy adapts to the batch's actual state — works for the demo
 *  seed, a custom blocked scenario, or an all-clear success run. */
function adaptiveHero(b: {
  status: string;
  expansion_blocked: boolean;
  critical_incidents: number;
  deadline_risks: number;
  verified_actions: number;
  total_actions: number;
}) {
  if (b.status === "completed") {
    return {
      title: "Rollout complete",
      sub: "every store verified across all channels.",
      line: "Completed",
      tone: "verified" as const,
    };
  }
  // All-clear path (no incidents, all verified) gets its own celebratory hero
  if (
    !b.expansion_blocked &&
    b.critical_incidents === 0 &&
    b.deadline_risks === 0 &&
    b.verified_actions === b.total_actions &&
    b.total_actions > 0
  ) {
    return {
      title: "All channels verified",
      sub: "every action confirmed across POS, shelf label, and ecommerce.",
      line: "Eligible for expansion",
      tone: "verified" as const,
    };
  }
  const map: Record<string, { title: string; sub: string; line: string; tone: "danger" | "warn" | "verified" | "neutral" }> = {
    blocked: {
      title: "Rollout held by canary mismatch",
      sub: "expansion paused until the offending channel acknowledges.",
      line: "Expansion blocked",
      tone: "danger",
    },
    partially_blocked: {
      title: "Expansion held",
      sub: "while shelf-label updates finish verifying.",
      line: "Expansion held",
      tone: "warn",
    },
    canary_verifying: {
      title: "Canary verifying",
      sub: "checking POS, shelf labels and ecommerce.",
      line: "Verification in progress",
      tone: "neutral",
    },
    ready_for_expansion: {
      title: "Canary verified",
      sub: "ready to expand to the full zone.",
      line: "Expansion eligible",
      tone: "verified",
    },
    expanding: {
      title: "Expanding to the zone",
      sub: "verifying the remaining stores.",
      line: "Expanding",
      tone: "neutral",
    },
  };
  return map[b.status] ?? map.canary_verifying;
}

export default function OperationsPage() {
  // useSearchParams in a client component must be wrapped in <Suspense>
  // for Next 14 to satisfy its prerender-bailout check.
  return (
    <Suspense fallback={<OperationsSkeleton />}>
      <OperationsContent />
    </Suspense>
  );
}

function OperationsContent() {
  const searchParams = useSearchParams();
  const externalId = searchParams?.get("external_id") || undefined;
  const fromScenario = searchParams?.get("from") === "scenario";
  const { mode, isHydrated } = useWorkMode();
  const { data, error, reload } = useLive(() => api.operations(externalId), [externalId]);
  const [resetting, setResetting] = useState(false);
  const [coldStartHint, setColdStartHint] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { toast } = useToast();

  // After 5s of no data, show a cold-start hint
  useEffect(() => {
    if (data || error) return;
    const t = window.setTimeout(() => setColdStartHint(true), 5_000);
    return () => window.clearTimeout(t);
  }, [data, error]);

  async function resetLive() {
    setResetting(true);
    try {
      await api.reset();
      await reload();
      toast.success("Demo state reset — Memorial Day batch reseeded.");
    } catch (e) {
      toast.error(`Reset failed: ${(e as Error).message}`);
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  }

  if (error) {
    // Distinguish "no batch yet" (the friendly cold-start case) from a
    // genuine API failure. The backend returns 404 when no live batch
    // exists — that should read as a CTA, not an error.
    const looksLikeColdStart =
      /->\s*404/.test(error) || /not.*found/i.test(error);
    if (looksLikeColdStart) {
      return (
        <div className="space-y-4">
          <div className="glass-strong rounded-3xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[.04] via-ink-900 to-black p-7 sm:p-10">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
                <FlaskConical className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-violet-300">
                  No batch yet
                </div>
                <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                  This is where your live rollout will land.
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-slate-400">
                  The Operations command center watches an approved price batch as it travels
                  through canary stores, reconciles every channel, and surfaces incidents
                  the moment a shopper-facing system disagrees. Start a scenario to populate it.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href="/scenarios"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110"
                  >
                    Build a scenario
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/vision/keynote"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[.04] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    Watch the keynote
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="glass rounded-2xl p-6 text-sm text-slate-300">
        Could not reach the API at <span className="mono text-brand-400">{api.base}</span>. Is the backend running?
        <div className="mt-1 text-xs text-slate-500">{error}</div>
      </div>
    );
  }
  if (!data) return <OperationsSkeleton coldStart={coldStartHint} />;

  const b = data.batch;
  const isLiveWorkMode = isHydrated && mode === "live";
  // Fire the Live-mode clean-slate banner when the user landed here with
  // no explicit external_id AND the backend's default batch is one of
  // the seeded surfaces (Memorial Day demo, the Realistic Scale catalog,
  // OR a certification sandbox run). If they have any live batches, the
  // backend returns the newest of those instead and the banner stays
  // hidden.
  const isSeededBatch =
    b.external_id === DEMO_BATCH ||
    b.external_id === "realistic-scale-catalog" ||
    b.external_id.startsWith("certification-");
  const showingDefaultDemoBatch = !externalId && isSeededBatch;

  if (isLiveWorkMode && showingDefaultDemoBatch) {
    return (
      <div className="space-y-4">
        <div className="glass-strong rounded-3xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[.04] via-ink-900 to-black p-7 sm:p-10">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
              <FlaskConical className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-violet-300">
                Live mode clean slate
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                Demo rollout hidden. Upload or run a scenario to populate Live mode.
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-slate-400">
                The backend still has the Memorial Day sample batch for Demo mode, but Live mode
                now keeps it out of the command center unless you open that exact demo batch.
                Your uploaded CSV or manually-created scenario will land here after execution.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/scenarios"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110"
                >
                  Upload or build scenario
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={`/operations?external_id=${DEMO_BATCH}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[.04] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Inspect demo batch explicitly
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const crit = data.critical_incident;
  const hero = adaptiveHero(b);
  const danger = hero.tone === "danger";
  const held = b.expansion_blocked;
  const isFresh = Date.now() - new Date(b.created_at).getTime() < 60_000;
  const allClear =
    !b.expansion_blocked &&
    b.critical_incidents === 0 &&
    b.deadline_risks === 0 &&
    b.verified_actions === b.total_actions &&
    b.total_actions > 0;

  return (
    <div className="space-y-6">
      {/* Header: batch picker + post-scenario breadcrumb + reset */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <BatchPicker currentExternalId={b.external_id} />
          {fromScenario && (
            <Link
              href="/scenarios"
              className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs text-violet-200 hover:bg-violet-500/15"
            >
              <FlaskConical className="h-3 w-3" />
              ← Back to scenario
            </Link>
          )}
        </div>
        {!isLiveWorkMode && (
          <button
            onClick={() => setConfirmReset(true)}
            disabled={resetting}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RotateCcw className={clsx("h-3.5 w-3.5", resetting && "animate-spin")} /> Reset demo seed
          </button>
        )}
        <ConfirmDialog
          open={confirmReset}
          title="Reset the demo state?"
          body={
            <>
              This wipes all custom scenarios and reseeds the Memorial Day
              Dallas Zone 2 batch. Custom batches you ran via{" "}
              <span className="text-slate-300">/scenarios</span> will be
              removed. The seed itself is regenerated, so the original
              demo experience comes back.
            </>
          }
          confirmLabel="Reset everything"
          variant="danger"
          busy={resetting}
          onCancel={() => setConfirmReset(false)}
          onConfirm={resetLive}
        />
      </div>

      {/* Hero — adaptive to ANY batch state */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={clsx(
          "relative overflow-hidden rounded-3xl border px-7 py-8",
          allClear
            ? "border-emerald-500/30 bg-gradient-to-br from-[#06120c] via-[#04070b] to-black"
            : "border-white/10 bg-gradient-to-br from-ink-850 via-ink-900 to-black",
        )}
      >
        <div
          className={clsx(
            "pointer-events-none absolute right-0 top-0 h-full w-1/2",
            allClear
              ? "bg-[radial-gradient(60%_80%_at_80%_30%,rgba(34,197,94,0.18),transparent_70%)]"
              : "bg-[radial-gradient(60%_80%_at_80%_30%,rgba(255,106,43,0.18),transparent_70%)]",
          )}
        />
        <div className="relative max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-brand-400">
            Operations Command Center
            {isFresh && (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] tracking-wide text-violet-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-300" />
                JUST RAN
              </span>
            )}
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
            <span className={clsx(
              held ? (danger ? "text-danger" : "text-warn") : "text-verified",
            )}>
              {hero.line}
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">
              {b.name} · created {timeOf(b.created_at)}
            </span>
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
          progress={b.canary_store_ids.length / Math.max(1, b.total_store_count)}
        />
            <MetricCard
          value={b.verified_actions}
          label="Verified actions"
          sub={`${data.rollout_progress.verified_pct}% of active scope`}
          tone="verified"
          progress={data.rollout_progress.verified / (data.rollout_progress.total || 1)}
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
              <Meta k="First detected" v={dateTimeOf(crit.created_at)} />
              <Meta k="Impact" v={`Store ${crit.store_id}`} />
              <Meta k="Status" v={crit.status} />
            </div>
          </div>
        ) : (
          /* All-clear state — celebratory, not "no incidents 🎉" */
          <div className="glass-strong rounded-2xl border border-emerald-500/25 p-6 xl:col-span-2">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-verified shadow-glow-verified">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-verified">
                  All canary actions verified
                </div>
                <h2 className="mt-0.5 text-lg font-semibold text-white">
                  No mismatches, no deadline risks
                </h2>
              </div>
            </div>
            <p className="mt-3 max-w-xl text-sm text-slate-400">
              Every action in this batch was acknowledged by POS, shelf label,
              and ecommerce at the approved price. {b.status === "completed"
                ? "Rollout is complete."
                : b.expansion_store_ids.length > 0
                ? `Safe to expand to ${b.expansion_store_ids.length} remaining store${b.expansion_store_ids.length === 1 ? "" : "s"}.`
                : "Rollout is complete."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href={`/operations/batches/${b.external_id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/15"
              >
                View verification matrix <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/engineering"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"
              >
                Engineering trace <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
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
          {/* Quick cross-page link to full batch breakdown */}
          <Link
            href={`/operations/batches/${b.external_id}`}
            className="glass group flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 text-xs text-slate-300 transition hover:border-brand/30 hover:bg-white/[.04]"
          >
            <div>
              <div className="font-medium text-white">Full verification matrix</div>
              <div className="mt-0.5 text-[11px] text-slate-500">All {b.total_actions} action{b.total_actions === 1 ? "" : "s"} · per-channel</div>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-slate-500 transition group-hover:text-brand-400" />
          </Link>
        </div>
      </section>

      {/* Activity + progress + stepper */}
      <section className="grid gap-4 xl:grid-cols-3">
        <div className="glass rounded-2xl p-5 xl:col-span-2">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">Recent Activity</h3>
          {data.recent_activity.length > 0 ? (
            <AuditTimeline events={data.recent_activity.slice(0, 6)} />
          ) : (
            <p className="text-xs text-slate-500">No audit events yet for this batch.</p>
          )}
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
