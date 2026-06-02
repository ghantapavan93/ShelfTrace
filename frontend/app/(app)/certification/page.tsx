"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import {
  ScanLine,
  Tag,
  Globe,
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  ArrowRight,
  Network,
  CheckCircle2,
  AlertCircle,
  Circle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { StatusPill } from "@/components/StatusPill";
import { DetailSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { EASE } from "@/lib/motion";
import { useWorkMode } from "@/components/ModeProvider";
import { SandboxStrip } from "@/components/LiveModeNotice";
import type { CertificationCheck, CertificationReport } from "@/lib/types";

// Canonical check order — what the page renders top-to-bottom regardless
// of what the API returns. Mirrors the safety story we tell reviewers:
// price first (the headline), then SLA, then off-shelf channel, then
// idempotency and recovery (the operational safety net), then canary
// (the structural protection).
const CHECK_ORDER = [
  "price_agreement",
  "markdown_sla",
  "ecommerce_verification",
  "idempotent_batch",
  "recovery_safety",
  "canary_protection",
] as const;

type CheckType = (typeof CHECK_ORDER)[number];

const CHECK_LABEL: Record<string, string> = {
  price_agreement: "Price Agreement",
  markdown_sla: "Markdown SLA",
  ecommerce_verification: "Ecommerce Verification",
  idempotent_batch: "Idempotent Batch",
  recovery_safety: "Recovery Safety",
  canary_protection: "Canary Protection",
};

// One-line description of what each check verifies — shown on the card
// before the result lands so the reviewer knows what's being tested.
const CHECK_BLURB: Record<string, string> = {
  price_agreement: "POS rings the approved price across every store.",
  markdown_sla: "Perishable items mark down before the deadline.",
  ecommerce_verification: "Ecommerce listings reflect the approved price.",
  idempotent_batch: "Replaying the same batch never duplicates or skips.",
  recovery_safety: "Retries restore the right state without side-effects.",
  canary_protection: "Expansion blocks when any shopper-facing channel disagrees.",
};

function checkStatus(report: CertificationReport, type: string): CertificationCheck | undefined {
  return report.checks.find((c) => c.check_type === type);
}

function ChannelCard({
  icon: Icon,
  name,
  provider,
  status,
}: {
  icon: React.ElementType;
  name: string;
  provider: string;
  status?: string;
}) {
  const tone =
    status === "failed"
      ? "border-rose-500/40 bg-rose-500/5 text-danger"
      : status === "recovered"
        ? "border-amber-500/40 bg-amber-500/5 text-warn"
        : "border-emerald-500/30 bg-emerald-500/5 text-verified";
  const label =
    status === "failed" ? "Failed" : status === "recovered" ? "Recovered After Retry" : "Passed";
  return (
    <div className={clsx("rounded-2xl border px-4 py-4", tone)}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
        <Icon className="h-4 w-4" /> {name}
      </div>
      <div className="mt-2 text-sm font-medium text-white">{provider}</div>
      <div className="mt-1 text-sm font-semibold">{label}</div>
    </div>
  );
}

export default function CertificationPage() {
  const { data, error, reload } = useLive<CertificationReport>(() => api.certificationCurrent());
  const [busy, setBusy] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const { mode, isHydrated } = useWorkMode();
  const isLiveWorkMode = isHydrated && mode === "live";

  // Progressive reveal state machine — drives the card grid below.
  // When the user explicitly clicks Reset or Rerun, we animate each
  // check landing in turn. On regular page-load (data already exists)
  // we skip the animation and show everything immediately.
  const [runningIndex, setRunningIndex] = useState<number>(-1);
  const [revealedCount, setRevealedCount] = useState<number>(CHECK_ORDER.length);
  const animTimers = useRef<number[]>([]);

  const clearAnimTimers = () => {
    animTimers.current.forEach((id) => window.clearTimeout(id));
    animTimers.current = [];
  };

  const playReveal = () => {
    if (reduced) {
      setRunningIndex(-1);
      setRevealedCount(CHECK_ORDER.length);
      return;
    }
    clearAnimTimers();
    setRunningIndex(-1);
    setRevealedCount(0);

    const STAGGER = 480; // ms between cards landing
    const RUN_LEAD = 140; // ms a card "glows running" before its result lands

    for (let i = 0; i < CHECK_ORDER.length; i++) {
      // Card i enters "running" state
      animTimers.current.push(
        window.setTimeout(() => setRunningIndex(i), i * STAGGER + RUN_LEAD),
      );
      // Card i flips to "result"
      animTimers.current.push(
        window.setTimeout(() => {
          setRevealedCount(i + 1);
          if (i === CHECK_ORDER.length - 1) setRunningIndex(-1);
        }, (i + 1) * STAGGER),
      );
    }
  };

  useEffect(() => () => clearAnimTimers(), []);

  async function reset() {
    setBusy("reset");
    try {
      await api.certificationReset();
      await reload();
      playReveal();
    } finally {
      setBusy(null);
    }
  }
  async function rerun() {
    if (!data) return;
    setBusy("rerun");
    try {
      await api.certificationRerun(data.run_id);
      await reload();
      playReveal();
    } finally {
      setBusy(null);
    }
  }

  if (error)
    return (
      <div className="space-y-6">
        {isLiveWorkMode && (
          <SandboxStrip
            surfaceName="Certification runs"
            missingForLive="Conformance gates run against a built-in sandbox connector profile. Production would scope to your real POS/ESL/ecommerce credentials and signed receipts."
          />
        )}
        <div className="glass rounded-2xl p-6 text-slate-300">
          Could not load certification. Try{" "}
          <button onClick={reset} className="text-brand-400 underline">
            Reset Certification Demo
          </button>
          .
          <div className="mt-1 text-xs text-slate-500">{error}</div>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="space-y-6">
        {isLiveWorkMode && (
          <SandboxStrip
            surfaceName="Certification runs"
            missingForLive="Conformance gates run against a built-in sandbox connector profile. Production would scope to your real POS/ESL/ecommerce credentials and signed receipts."
          />
        )}
        <DetailSkeleton />
      </div>
    );

  const failed = data.status === "failed_pending_remediation";
  const passed = data.status === "passed";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Connector <span className="iris-text">Certification</span> Lab</h1>
        <p className="mt-1 text-slate-400">
          Validate store-system reliability before automated price execution is enabled.
        </p>
      </div>

      {isLiveWorkMode && (
        <SandboxStrip
          surfaceName="Certification runs"
          missingForLive="Conformance gates run against a built-in sandbox connector profile. Production would scope to your real POS/ESL/ecommerce credentials and signed receipts."
        />
      )}

      {/* Status hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={clsx(
          "iris-border glow-iris relative overflow-hidden rounded-3xl px-7 py-7",
          failed ? "bg-gradient-to-br from-rose-950/30 via-ink-900 to-black" : "bg-gradient-to-br from-emerald-950/20 via-ink-900 to-black",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              {data.connector.name} · {data.connector.retailer_name}
            </div>
            <div className="mt-2 flex items-center gap-3">
              {failed ? (
                <ShieldAlert className="h-9 w-9 text-danger" />
              ) : (
                <ShieldCheck className="h-9 w-9 text-verified" />
              )}
              <h2 className={clsx("text-2xl font-bold", failed ? "text-danger text-glow-danger" : "text-verified")}>
                {failed ? "Failed Pending Remediation" : passed ? "Passed" : "Running"}
              </h2>
            </div>
            {data.final_recommendation && (
              <p className="mt-3 max-w-2xl text-sm text-slate-300">{data.final_recommendation}</p>
            )}
          </div>
          <div className="flex gap-2 text-center text-xs">
            <Stat v={data.summary.passed} l="Passed" cls="text-verified" />
            <Stat v={data.summary.recovered} l="Recovered" cls="text-warn" />
            <Stat v={data.summary.failed} l="Failed" cls="text-danger" />
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <ChannelCard icon={ScanLine} name="POS Checkout" provider={data.connector.pos_provider} status={checkStatus(data, "price_agreement")?.status} />
          <ChannelCard icon={Tag} name="Shelf Labels" provider={data.connector.esl_provider} status={checkStatus(data, "markdown_sla")?.status} />
          <ChannelCard icon={Globe} name="Ecommerce" provider={data.connector.ecommerce_provider} status={checkStatus(data, "ecommerce_verification")?.status} />
        </div>
      </motion.section>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={reset}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          <RotateCcw className={clsx("h-4 w-4", busy === "reset" && "animate-spin")} /> Reset Certification Demo
        </button>
        <button
          onClick={rerun}
          disabled={busy !== null || data.summary.failed === 0}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110 disabled:opacity-40"
        >
          <RefreshCw className={clsx("h-4 w-4", busy === "rerun" && "animate-spin")} /> Run Failed Checks Again
        </button>
        <Link
          href="/engineering?mode=certification"
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
        >
          <Network className="h-4 w-4" /> View Engineering Evidence
        </Link>
        <Link
          href="/operations"
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
        >
          Open Execution Assurance <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Reliability checks — progressive card grid */}
      <ReliabilityCheckGrid
        checks={data.checks}
        revealedCount={revealedCount}
        runningIndex={runningIndex}
        isAnimating={runningIndex !== -1 || revealedCount < CHECK_ORDER.length}
        reduced={!!reduced}
      />

      <p className="max-w-3xl text-sm leading-relaxed text-slate-400">
        Certification and live rollout run on the same reliability engine. These results are derived from real
        execution receipts, incidents, retries and audit records produced by the shared pipeline.
      </p>
    </div>
  );
}

function Stat({ v, l, cls }: { v: number; l: string; cls: string }) {
  return (
    <div className="glass rounded-xl px-4 py-2">
      <div className={clsx("text-2xl font-bold", cls)}>{v}</div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{l}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Reliability check grid — six cards that light up sequentially when the
// user kicks off a reset or rerun. Each card has four visual states:
//
//   pending  — dim border, gray dot, dim text (haven't been tested yet)
//   running  — orange glowing border, pulsing emerald dot (testing now)
//   passed   — emerald border + check icon + evidence panel
//   failed   — rose border + alert icon + remediation
//   recovered — amber border + check icon (failed then retried clean)
// ────────────────────────────────────────────────────────────────────────

interface CheckCardState {
  type: CheckType;
  data: CertificationCheck | undefined;
  phase: "pending" | "running" | "result";
}

function ReliabilityCheckGrid({
  checks,
  revealedCount,
  runningIndex,
  isAnimating,
  reduced,
}: {
  checks: CertificationCheck[];
  revealedCount: number;
  runningIndex: number;
  isAnimating: boolean;
  reduced: boolean;
}) {
  // Stable, canonical ordering. Even if the API returns checks in a
  // different order, the cards always render in the safety-story sequence.
  const ordered = useMemo<CheckCardState[]>(() => {
    return CHECK_ORDER.map((type, idx) => {
      const found = checks.find((c) => c.check_type === type);
      const phase: CheckCardState["phase"] = !isAnimating
        ? "result"
        : idx < revealedCount
          ? "result"
          : idx === runningIndex
            ? "running"
            : "pending";
      return { type, data: found, phase };
    });
  }, [checks, revealedCount, runningIndex, isAnimating]);

  const progressPct = (revealedCount / CHECK_ORDER.length) * 100;

  // Summary headline of what's resolved so far
  const completedStats = useMemo(() => {
    const completed = ordered.filter((c) => c.phase === "result" && c.data);
    const passed = completed.filter((c) => c.data?.status === "passed").length;
    const recovered = completed.filter((c) => c.data?.status === "recovered").length;
    const failed = completed.filter((c) => c.data?.status === "failed").length;
    return { completed: completed.length, passed, recovered, failed };
  }, [ordered]);

  return (
    <div className="holo-card overflow-hidden rounded-2xl">
      {/* Header + progress bar */}
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Reliability Checks</div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Six pre-flight safety tests against the same simulated reliability workflow used in the operations demo.
            </div>
          </div>
          <div className="font-mono text-xs text-slate-400 tabular-nums">
            {completedStats.completed} / {CHECK_ORDER.length} complete
            {isAnimating && (
              <span className="ml-2 text-emerald-300">· running</span>
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={reduced ? { duration: 0 } : { duration: 0.45, ease: EASE.outQuart }}
            className="h-full bg-gradient-to-r from-emerald-400 via-orange-300 to-orange-400"
          />
        </div>
      </div>

      {/* Card grid */}
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((cs, idx) => (
          <CheckCard key={cs.type} idx={idx} state={cs} reduced={reduced} />
        ))}
      </div>
    </div>
  );
}

function CheckCard({
  idx,
  state,
  reduced,
}: {
  idx: number;
  state: CheckCardState;
  reduced: boolean;
}) {
  const { type, data, phase } = state;
  const label = CHECK_LABEL[type] ?? type;
  const blurb = CHECK_BLURB[type] ?? "";

  const status = data?.status; // "passed" | "failed" | "recovered" | undefined
  const tone =
    phase === "pending"
      ? "border-white/[.06] bg-white/[.012]"
      : phase === "running"
        ? "border-orange-400/50 bg-orange-500/[.06] shadow-[0_0_0_3px_rgba(251,146,60,.08)]"
        : status === "failed"
          ? "border-rose-500/40 bg-rose-500/[.05]"
          : status === "recovered"
            ? "border-amber-500/40 bg-amber-500/[.05]"
            : "border-emerald-500/35 bg-emerald-500/[.04]";

  const numberTone =
    phase === "pending"
      ? "border-white/10 bg-white/5 text-slate-500"
      : phase === "running"
        ? "border-orange-400/60 bg-orange-500/15 text-orange-200"
        : status === "failed"
          ? "border-rose-500/40 bg-rose-500/15 text-rose-200"
          : status === "recovered"
            ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
            : "border-emerald-500/40 bg-emerald-500/15 text-emerald-200";

  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE.outQuart }}
      className={clsx("relative overflow-hidden rounded-2xl border p-4 transition-colors", tone)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={clsx(
              "mono grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[11px] font-semibold",
              numberTone,
            )}
          >
            {String(idx + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <div
              className={clsx(
                "text-sm font-semibold truncate transition-colors",
                phase === "pending" ? "text-slate-400" : "text-white",
              )}
            >
              {label}
            </div>
            <div
              className={clsx(
                "mt-0.5 text-[11px] leading-snug transition-colors",
                phase === "pending" ? "text-slate-500" : "text-slate-300/80",
              )}
            >
              {blurb}
            </div>
          </div>
        </div>
        <StatusIndicator phase={phase} status={status} reduced={reduced} />
      </div>

      {/* Evidence — only shown after the check resolves */}
      <AnimatePresence initial={false}>
        {phase === "result" && data && (
          <motion.div
            key="evidence"
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.28, ease: EASE.outQuart }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-white/[.06] pt-3 text-[11px] leading-relaxed text-slate-400">
              {String(data.evidence?.detail ?? data.scenario_name ?? "—")}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Running shimmer overlay */}
      {phase === "running" && !reduced && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_50%,rgba(251,146,60,.12),transparent_70%)]" />
        </motion.div>
      )}
    </motion.div>
  );
}

function StatusIndicator({
  phase,
  status,
  reduced,
}: {
  phase: CheckCardState["phase"];
  status: string | undefined;
  reduced: boolean;
}) {
  if (phase === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[.18em] text-slate-500">
        <Circle className="h-2.5 w-2.5" />
        Pending
      </span>
    );
  }
  if (phase === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[.18em] text-orange-200">
        <motion.span
          aria-hidden
          className="block h-2 w-2 rounded-full bg-orange-300 shadow-[0_0_0_3px_rgba(251,146,60,.25)]"
          animate={reduced ? undefined : { scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
          transition={reduced ? undefined : { duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
        />
        Running…
      </span>
    );
  }
  // result phase
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[.18em] text-rose-200">
        <AlertCircle className="h-3.5 w-3.5" />
        Failed
      </span>
    );
  }
  if (status === "recovered") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[.18em] text-amber-200">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Recovered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[.18em] text-emerald-200">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Passed
    </span>
  );
}
