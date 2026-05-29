"use client";

/**
 * EvidenceRail — the living lifecycle rail for one Decision Receipt.
 *
 * Renders the eight canonical stages in order:
 *
 *   Signal → Match → Approved → Certified → Published → Verified → Measured → Learned
 *
 * The rail is a faithful, read-only projection of the backend receipt. When an
 * action breaks, the rail *stops visibly at the failed stage*: that node glows,
 * the connectors after it go dashed and dim, and downstream nodes recede — so a
 * reviewer can see, at a glance, exactly where the chain broke and that nothing
 * past the break is being trusted.
 *
 * Pure presentation. State, tone and headlines all come from the server. Motion
 * is opt-out: every animated flourish (entrance stagger, failed-node pulse,
 * verified-connector shimmer) is suppressed under `prefers-reduced-motion`.
 */

import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import {
  Radio,
  Link2,
  BadgeCheck,
  ShieldCheck,
  Send,
  ScanLine,
  BarChart3,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { EASE, DUR } from "@/lib/motion";
import type { ReceiptStageView, ReceiptStageKey, ReceiptStageState } from "@/lib/types";

/* ── per-stage iconography (constant by key, so the rail is recognisable) ── */
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

/* ── tone per state — reuses the EligibilityPanel colour vocabulary ── */
type ToneTokens = { badge: string; label: string; state: string; line: string };

const TONE: Record<ReceiptStageState, ToneTokens> = {
  verified: {
    badge: "border-emerald-500/45 bg-emerald-500/12 text-emerald-300",
    label: "text-emerald-100/90",
    state: "text-emerald-300/80",
    line: "bg-emerald-500/40",
  },
  active: {
    badge: "border-amber-500/50 bg-amber-500/12 text-amber-300",
    label: "text-amber-100/90",
    state: "text-amber-300/80",
    line: "bg-amber-500/35",
  },
  pending: {
    badge: "border-white/15 bg-white/[.04] text-slate-300",
    label: "text-slate-300",
    state: "text-slate-500",
    line: "bg-white/12",
  },
  failed: {
    badge: "border-rose-500/60 bg-rose-500/14 text-rose-300",
    label: "text-rose-100",
    state: "text-rose-300/90",
    line: "bg-rose-500/40",
  },
  excluded: {
    badge: "border-violet-500/50 bg-violet-500/12 text-violet-300",
    label: "text-violet-100/90",
    state: "text-violet-300/80",
    line: "bg-violet-500/35",
  },
  not_applicable: {
    badge: "border-white/10 bg-white/[.02] text-slate-500",
    label: "text-slate-500",
    state: "text-slate-600",
    line: "bg-white/[.06]",
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

export function EvidenceRail({
  stages,
  stoppedAtStage,
  activeKey,
  onSelect,
}: {
  stages: ReceiptStageView[];
  stoppedAtStage: ReceiptStageKey | null;
  activeKey?: ReceiptStageKey | null;
  onSelect?: (key: ReceiptStageKey) => void;
}) {
  const reduce = useReducedMotion();
  const stopIndex =
    stoppedAtStage == null ? -1 : stages.findIndex((s) => s.key === stoppedAtStage);

  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-[680px] items-start">
        {stages.map((stage, i) => {
          const tone = TONE[stage.state];
          const Icon = STAGE_ICON[stage.key];
          const isFailed = stage.state === "failed";
          const isDownstream = stopIndex >= 0 && i > stopIndex;
          // The connector to the *right* of this node. Broken once we reach the
          // failed node (so the segment leaving the break reads as severed).
          const connectorBroken = stopIndex >= 0 && i >= stopIndex;
          const isActive = activeKey === stage.key;

          return (
            <li
              key={stage.key}
              className={clsx(
                "relative flex flex-1 flex-col items-center text-center",
                isDownstream && "opacity-55",
              )}
            >
              {/* connector to the next node — sits behind the badge */}
              {i < stages.length - 1 && (
                <span
                  aria-hidden
                  className={clsx(
                    "absolute top-[22px] left-1/2 h-px w-full",
                    connectorBroken
                      ? "border-t border-dashed border-white/15 bg-transparent"
                      : tone.line,
                  )}
                >
                  {/* shimmer travelling along a healthy, verified segment */}
                  {!reduce && !connectorBroken && stage.state === "verified" && (
                    <motion.span
                      className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent"
                      initial={{ x: "-20%", opacity: 0 }}
                      animate={{ x: "120%", opacity: [0, 1, 0] }}
                      transition={{
                        duration: 2.2,
                        ease: EASE.outCubic,
                        repeat: Infinity,
                        repeatDelay: 1.6 + i * 0.2,
                      }}
                    />
                  )}
                </span>
              )}

              <motion.button
                type="button"
                onClick={onSelect ? () => onSelect(stage.key) : undefined}
                disabled={!onSelect}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DUR.reveal, ease: EASE.outQuart, delay: reduce ? 0 : i * 0.06 }}
                className={clsx(
                  "relative z-10 grid h-11 w-11 place-items-center rounded-full border backdrop-blur transition",
                  tone.badge,
                  onSelect && "cursor-pointer hover:scale-[1.06] active:scale-[0.97]",
                  isActive && "ring-2 ring-white/60 ring-offset-2 ring-offset-[#040608]",
                )}
                aria-label={`${stage.label}: ${STATE_WORD[stage.state]}`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {/* failed node glows with a pulsing rose halo */}
                {isFailed && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full ring-2 ring-rose-500/60"
                    initial={false}
                    animate={
                      reduce
                        ? { opacity: 0.8 }
                        : { opacity: [0.25, 0.85, 0.25], scale: [1, 1.28, 1] }
                    }
                    transition={
                      reduce
                        ? undefined
                        : { duration: 2, ease: EASE.outCubic, repeat: Infinity }
                    }
                  />
                )}
              </motion.button>

              <div className="mt-2.5 px-1">
                <div className={clsx("text-[11px] font-semibold tracking-tight", tone.label)}>
                  {stage.label}
                </div>
                <div
                  className={clsx(
                    "mt-0.5 text-[9px] font-medium uppercase tracking-[.16em]",
                    tone.state,
                  )}
                >
                  {STATE_WORD[stage.state]}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
