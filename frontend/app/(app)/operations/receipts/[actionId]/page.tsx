"use client";

/**
 * Decision Receipt — the connective evidence chain for one price action.
 *
 * Threads the full lifecycle of an approved price into a single causal record:
 * Signal → Match → Approved → Certified → Published → Verified → Measured →
 * Learned. The living rail at the top shows, at a glance, where the chain held
 * and where it broke; the cards below walk the same eight stages with their
 * underlying evidence. Everything here is a read-only projection of state the
 * validated core already maintains — no new tables, no writes, no audit events.
 */

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Radio,
  Link2,
  BadgeCheck,
  ShieldCheck,
  Send,
  ScanLine,
  BarChart3,
  GraduationCap,
  CircleDot,
  ExternalLink,
  FileCheck2,
  Lock,
  LockOpen,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money, dateTimeOf } from "@/lib/format";
import { EvidenceRail } from "@/components/EvidenceRail";
import { EligibilityPanel } from "@/components/EligibilityPanel";
import { AuditTimeline } from "@/components/AuditTimeline";
import { StatusPill } from "@/components/StatusPill";
import { DetailSkeleton } from "@/components/Skeleton";
import { EASE, DUR } from "@/lib/motion";
import type {
  DecisionReceiptView,
  EvidenceTone,
  MeasurementEligibilityView,
  ReceiptOutcome,
  ReceiptStageKey,
  ReceiptStageState,
  ReceiptStageView,
} from "@/lib/types";

const STAGE_ICON: Record<ReceiptStageKey, LucideIcon> = {
  signal: Radio,
  match: Link2,
  approved: BadgeCheck,
  certified: ShieldCheck,
  published: Send,
  verified: ScanLine,
  measured: BarChart3,
  learned: GraduationCap,
};

export default function ReceiptPage({ params }: { params: { actionId: string } }) {
  const { actionId } = params;
  const [activeKey, setActiveKey] = useState<ReceiptStageKey | null>(null);
  const r = useLive<DecisionReceiptView>(() => api.receipt(actionId), [actionId]);

  if (r.error)
    return (
      <div className="glass rounded-2xl p-6 text-slate-300">
        No Decision Receipt found for this action.
      </div>
    );
  if (!r.data) return <DetailSkeleton />;

  const receipt = r.data;
  const outcome = OUTCOME[receipt.outcome];

  function focusStage(key: ReceiptStageKey) {
    setActiveKey(key);
    document.getElementById(`stage-${key}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  return (
    <div className="space-y-6">
      <Link
        href="/operations/incidents"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to incidents
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.2em] text-orange-300">
              <FileCheck2 className="h-3 w-3" /> Decision Receipt
            </span>
            <h1 className="text-3xl font-bold text-white">{receipt.product_name}</h1>
          </div>
          <p className="mt-1.5 text-slate-400">
            SKU <span className="mono text-slate-300">{receipt.sku}</span> · Store{" "}
            {receipt.store_id} · {receipt.zone || "—"}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <Link
            href={`/operations/batches/${receipt.batch_id}`}
            className="mono inline-flex items-center gap-1 text-slate-300 hover:text-white"
          >
            {receipt.batch_external_id} <ExternalLink className="h-3 w-3" />
          </Link>
          <div className="mt-1">Generated {dateTimeOf(receipt.generated_at)}</div>
        </div>
      </div>

      {/* Outcome banner */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.reveal, ease: EASE.outQuart }}
        className={clsx(
          "rounded-3xl border p-6 shadow-[0_28px_90px_-50px]",
          outcome.ring,
          outcome.bg,
          outcome.shadow,
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.22em] text-white/50">
              Execution outcome
            </div>
            <p className={clsx("mt-1.5 text-lg font-semibold leading-snug", outcome.text)}>
              {receipt.headline}
            </p>
            {/* Channel mismatch subtitle — shows actual observed vs approved price for the offending channel */}
            <ChannelMismatchSubtitle
              channels={receipt.channels}
              approvedPrice={receipt.approved_price}
              outcomeText={outcome.text}
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-400">
              <Fact label="Prior" value={money(receipt.prior_price)} />
              <Fact label="Approved" value={money(receipt.approved_price)} accent={outcome.text} />
              <Fact label="Rollout decision" value={receipt.decision} />
              {receipt.is_kvi && <Tag>KVI</Tag>}
              {receipt.is_perishable && <Tag>Perishable</Tag>}
            </div>
          </div>
          <span
            className={clsx(
              "shrink-0 rounded-full border px-3 py-1 font-mono text-xs font-semibold",
              outcome.ring,
              outcome.chipBg,
              outcome.text,
            )}
          >
            {receipt.outcome.replace(/_/g, " ")}
          </span>
        </div>
      </motion.section>

      {/* Measurement Gate banner */}
      <MeasurementGateBanner eligibility={receipt.measurement_eligibility} />

      {/* Living lifecycle rail */}
      <section className="iris-border glow-iris overflow-hidden rounded-3xl bg-[#0a0e18]/85 p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[.18em] text-slate-300">
            Action Lifecycle
          </h2>
          <p className="text-[11px] text-slate-500">
            {receipt.stopped_at_stage
              ? "The chain stops at the stage that broke — nothing past the break is trusted."
              : "Every stage held — the result is trustworthy measurement evidence."}
          </p>
        </div>
        <EvidenceRail
          stages={receipt.stages}
          stoppedAtStage={receipt.stopped_at_stage}
          activeKey={activeKey}
          onSelect={focusStage}
        />
      </section>

      {/* Evidence chain + sidebar */}
      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* Stage cards */}
        <div className="space-y-3">
          {receipt.stages.map((stage, i) => (
            <StageCard
              key={stage.key}
              stage={stage}
              index={i}
              active={activeKey === stage.key}
              broke={receipt.stopped_at_stage === stage.key}
            />
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <EligibilityPanel eligibility={receipt.measurement_eligibility} />

          {receipt.incidents.length > 0 && (
            <section className="holo-card rounded-2xl p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
                Linked Incidents
              </h3>
              <ul className="space-y-2.5">
                {receipt.incidents.map((inc) => (
                  <li key={inc.id}>
                    <Link
                      href={`/operations/incidents/${inc.id}`}
                      className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[.02] p-3 transition hover:bg-white/[.05]"
                    >
                      <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill value={inc.status} />
                          <span className="text-[11px] uppercase tracking-wide text-slate-500">
                            {inc.type.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-300">{inc.summary}</p>
                      </div>
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 transition group-hover:text-white" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {receipt.audit.length > 0 && (
            <section className="holo-card rounded-2xl p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
                Audit Trail
              </h3>
              <AuditTimeline events={receipt.audit} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Stage card ───────────────────────────── */

function StageCard({
  stage,
  index,
  active,
  broke,
}: {
  stage: ReceiptStageView;
  index: number;
  active: boolean;
  broke: boolean;
}) {
  const tone = STATE_TONE[stage.state];
  const Icon = STAGE_ICON[stage.key];
  return (
    <motion.section
      id={`stage-${stage.key}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: EASE.outQuart, delay: Math.min(index * 0.04, 0.28) }}
      className={clsx(
        "scroll-mt-6 rounded-2xl border p-5 transition",
        broke ? "border-rose-500/40 bg-rose-500/[.04]" : "border-white/10 bg-[#0a0e18]/70",
        active && "ring-1 ring-white/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={clsx(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl border",
            tone.badge,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="text-sm font-semibold text-white">{stage.label}</h3>
            <span
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-[.14em]",
                tone.pill,
              )}
            >
              {STATE_WORD[stage.state]}
            </span>
            {stage.at && (
              <span className="text-[11px] text-slate-500">{dateTimeOf(stage.at)}</span>
            )}
          </div>
          <p className={clsx("mt-1.5 text-sm font-medium", tone.headline)}>{stage.headline}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{stage.detail}</p>

          {stage.evidence.length > 0 && (
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {stage.evidence.map((e, idx) => (
                <div key={idx} className="flex items-baseline justify-between gap-3 text-xs">
                  <dt className="shrink-0 text-slate-500">{e.label}</dt>
                  <dd
                    className={clsx(
                      "min-w-0 truncate text-right font-mono",
                      EVIDENCE_TONE[e.tone ?? "default"],
                    )}
                    title={e.value}
                  >
                    {e.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </motion.section>
  );
}

/* ───────────────────────────── small bits ───────────────────────────── */

function Fact({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-slate-500">{label}</span>
      <span className={clsx("mono font-semibold", accent ?? "text-slate-200")}>{value}</span>
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-amber-200">
      {children}
    </span>
  );
}

/* ─────────────────────── Measurement Gate banner ─────────────────────── */

/**
 * Shows the current measurement-gate decision for this price action:
 * quarantined (rose), awaiting (amber), or eligible (emerald). Reads
 * directly from the real MeasurementEligibilityView — no hardcoded text.
 */
function MeasurementGateBanner({
  eligibility,
}: {
  eligibility: MeasurementEligibilityView;
}) {
  const gate = GATE_TONE[eligibility.status] ?? GATE_TONE["default"];
  const Icon = gate.eligible ? LockOpen : Lock;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: EASE.outQuart, delay: 0.08 }}
      className={clsx(
        "rounded-2xl border p-4",
        gate.border,
        gate.bg,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={clsx(
            "grid h-8 w-8 shrink-0 place-items-center rounded-xl border",
            gate.iconWrapper,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={clsx(
                "rounded-full border px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[.18em]",
                gate.badge,
              )}
            >
              {gate.label}
            </span>
            {eligibility.blocked_channel && (
              <span className="text-[10px] uppercase tracking-[.12em] text-white/35">
                blocked at {eligibility.blocked_channel.toUpperCase()}
              </span>
            )}
          </div>
          <p className={clsx("mt-1.5 text-sm font-medium leading-snug", gate.headlineText)}>
            {eligibility.summary}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/40">
            {gate.tagline}
          </p>
          {/* Reason code pill */}
          <span className="mt-2 inline-flex items-center rounded border border-white/10 bg-white/[.04] px-2 py-0.5 font-mono text-[10px] text-white/45">
            {eligibility.reason}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────── Channel mismatch subtitle on outcome banner ─────────── */

/**
 * When one or more channels have a mismatch, renders a compact subtitle
 * line showing the first offending channel's observed vs. approved price.
 * Renders nothing when all channels are clean.
 */
function ChannelMismatchSubtitle({
  channels,
  approvedPrice,
  outcomeText,
}: {
  channels: ReceiptView["channels"];
  approvedPrice: number;
  outcomeText: string;
}) {
  const mismatched = channels.filter(
    (ch) => ch.status === "mismatch" && ch.observed_price !== null,
  );
  if (mismatched.length === 0) return null;

  const first = mismatched[0];
  const channelLabel = CHANNEL_LABEL[first.channel] ?? first.channel.toUpperCase();

  return (
    <p className={clsx("mt-1.5 text-sm leading-snug", outcomeText, "opacity-70")}>
      {channelLabel} returned {money(first.observed_price!)} · approved{" "}
      {money(approvedPrice)}
      {mismatched.length > 1 && (
        <span className="ml-2 text-xs opacity-60">
          +{mismatched.length - 1} more channel{mismatched.length - 1 > 1 ? "s" : ""}
        </span>
      )}
    </p>
  );
}

const CHANNEL_LABEL: Record<string, string> = {
  pos: "POS checkout",
  esl: "ESL label",
  ecommerce: "eCommerce",
};

/* helper type alias so ChannelMismatchSubtitle can share the prop type */
type ReceiptView = Pick<DecisionReceiptView, "channels">;

/* ───────────────────────────── tone tables ───────────────────────────── */

/* Gate tone table — keyed by MeasurementEligibilityStatus */
type GateTone = {
  eligible: boolean;
  label: string;
  tagline: string;
  border: string;
  bg: string;
  badge: string;
  iconWrapper: string;
  headlineText: string;
};

const GATE_TONE: Record<string, GateTone> = {
  ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED: {
    eligible: true,
    label: "Measurement Eligible",
    tagline:
      "Verified execution. Sell-through results are being attributed from this action.",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/[.04]",
    badge: "border-emerald-500/45 bg-emerald-500/12 text-emerald-200",
    iconWrapper: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    headlineText: "text-emerald-100/90",
  },
  INELIGIBLE_AWAITING_ACKNOWLEDGEMENT: {
    eligible: false,
    label: "Measurement Quarantined",
    tagline:
      "Sell-through results will be excluded from analytics until acknowledged and reconciled.",
    border: "border-amber-500/30",
    bg: "bg-amber-500/[.04]",
    badge: "border-amber-500/45 bg-amber-500/12 text-amber-200",
    iconWrapper: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    headlineText: "text-amber-100/90",
  },
  INELIGIBLE_EXECUTION_NOT_VERIFIED: {
    eligible: false,
    label: "Measurement Quarantined",
    tagline:
      "Sell-through results will be excluded from analytics until verified recovery.",
    border: "border-rose-500/30",
    bg: "bg-rose-500/[.04]",
    badge: "border-rose-500/45 bg-rose-500/12 text-rose-200",
    iconWrapper: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    headlineText: "text-rose-100/90",
  },
  EXCLUDED_RECOVERY_INCOMPLETE: {
    eligible: false,
    label: "Measurement Excluded",
    tagline:
      "Sell-through results will be excluded from analytics until the recovery task resolves.",
    border: "border-violet-500/30",
    bg: "bg-violet-500/[.04]",
    badge: "border-violet-500/45 bg-violet-500/12 text-violet-200",
    iconWrapper: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    headlineText: "text-violet-100/90",
  },
  default: {
    eligible: false,
    label: "Measurement Pending",
    tagline:
      "Execution evidence is incomplete — not yet eligible for downstream measurement.",
    border: "border-white/10",
    bg: "bg-white/[.03]",
    badge: "border-white/20 bg-white/[.06] text-slate-300",
    iconWrapper: "border-white/15 bg-white/[.04] text-slate-400",
    headlineText: "text-slate-200",
  },
};

const STATE_WORD: Record<ReceiptStageState, string> = {
  verified: "Verified",
  active: "In progress",
  pending: "Pending",
  failed: "Broke here",
  excluded: "Excluded",
  not_applicable: "N/A",
};

const STATE_TONE: Record<
  ReceiptStageState,
  { badge: string; pill: string; headline: string }
> = {
  verified: {
    badge: "border-emerald-500/45 bg-emerald-500/12 text-emerald-300",
    pill: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    headline: "text-emerald-100/90",
  },
  active: {
    badge: "border-amber-500/50 bg-amber-500/12 text-amber-300",
    pill: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    headline: "text-amber-100/90",
  },
  pending: {
    badge: "border-white/15 bg-white/[.04] text-slate-300",
    pill: "border-white/15 bg-white/[.04] text-slate-300",
    headline: "text-slate-200",
  },
  failed: {
    badge: "border-rose-500/60 bg-rose-500/14 text-rose-300",
    pill: "border-rose-500/45 bg-rose-500/10 text-rose-200",
    headline: "text-rose-100",
  },
  excluded: {
    badge: "border-violet-500/50 bg-violet-500/12 text-violet-300",
    pill: "border-violet-500/40 bg-violet-500/10 text-violet-200",
    headline: "text-violet-100/90",
  },
  not_applicable: {
    badge: "border-white/10 bg-white/[.02] text-slate-500",
    pill: "border-white/10 bg-white/[.02] text-slate-500",
    headline: "text-slate-400",
  },
};

const EVIDENCE_TONE: Record<NonNullable<EvidenceTone> | "default", string> = {
  verified: "text-emerald-300",
  danger: "text-rose-300",
  warn: "text-amber-300",
  violet: "text-violet-300",
  muted: "text-slate-500",
  default: "text-slate-200",
};

const OUTCOME: Record<
  ReceiptOutcome,
  { ring: string; bg: string; chipBg: string; shadow: string; text: string }
> = {
  VERIFIED_ELIGIBLE: {
    ring: "border-emerald-500/40",
    bg: "bg-emerald-500/[.05]",
    chipBg: "bg-emerald-500/15",
    shadow: "shadow-emerald-500/20",
    text: "text-emerald-200",
  },
  AWAITING_ACKNOWLEDGEMENT: {
    ring: "border-amber-500/40",
    bg: "bg-amber-500/[.05]",
    chipBg: "bg-amber-500/15",
    shadow: "shadow-amber-500/20",
    text: "text-amber-200",
  },
  EXECUTION_BLOCKED: {
    ring: "border-rose-500/45",
    bg: "bg-rose-500/[.05]",
    chipBg: "bg-rose-500/15",
    shadow: "shadow-rose-500/25",
    text: "text-rose-200",
  },
  EXCLUDED_RECOVERY: {
    ring: "border-violet-500/40",
    bg: "bg-violet-500/[.05]",
    chipBg: "bg-violet-500/15",
    shadow: "shadow-violet-500/20",
    text: "text-violet-200",
  },
  PENDING: {
    ring: "border-white/15",
    bg: "bg-white/[.03]",
    chipBg: "bg-white/[.06]",
    shadow: "shadow-black/20",
    text: "text-slate-200",
  },
};
