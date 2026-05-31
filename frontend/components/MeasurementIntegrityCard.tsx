"use client";

// Measurement-integrity cohort split.
//
// A downstream measurement layer can only attribute impact to prices that
// actually executed. This card splits the affected cohort into
// verified-affected (safe to attribute) vs execution-failed (must be excluded),
// with a per-status breakdown and the backend's deterministic summary line.
//
// Renders only values from the API — no fabricated numbers. Animations are
// transform/opacity only and hold steady under prefers-reduced-motion.

import { motion, useReducedMotion } from "framer-motion";

import type { MeasurementIntegrity } from "@/lib/types";
import { DUR, EASE } from "@/lib/motion";

// Color language per CLAUDE.md / the operations StatusPill: emerald = verified,
// rose = mismatch/drift, amber = hold (awaiting ack), violet = recovery.
const STATUS_META: Record<string, { label: string; dot: string; chip: string }> = {
  ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED: {
    label: "verified",
    dot: "bg-emerald-400",
    chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  },
  INELIGIBLE_EXECUTION_NOT_VERIFIED: {
    label: "mismatch",
    dot: "bg-rose-400",
    chip: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  },
  INELIGIBLE_AWAITING_ACKNOWLEDGEMENT: {
    label: "awaiting ack",
    dot: "bg-amber-400",
    chip: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  },
  EXCLUDED_RECOVERY_INCOMPLETE: {
    label: "recovery",
    dot: "bg-violet-400",
    chip: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  },
};

// Failure statuses in precedence order, matching the backend rollup.
const FAILED_ORDER = [
  "INELIGIBLE_AWAITING_ACKNOWLEDGEMENT",
  "INELIGIBLE_EXECUTION_NOT_VERIFIED",
  "EXCLUDED_RECOVERY_INCOMPLETE",
] as const;

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <div>
      <div className={`font-mono text-3xl font-semibold tabular-nums ${tone}`}>
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[.18em] text-white/40">
        {label}
      </div>
    </div>
  );
}

export default function MeasurementIntegrityCard({
  data,
}: {
  data: MeasurementIntegrity;
}) {
  const reduce = useReducedMotion();
  const {
    total_affected,
    verified_affected,
    execution_failed,
    verified_rate,
    breakdown,
    summary,
  } = data;

  // Bar fractions. With zero affected actions both are 0 → a flat empty track.
  const verifiedFrac = total_affected > 0 ? verified_affected / total_affected : 0;
  const failedFrac = total_affected > 0 ? execution_failed / total_affected : 0;
  const verifiedPct = Math.round(verified_rate * 100);

  const failedChips = FAILED_ORDER.filter((s) => (breakdown[s] ?? 0) > 0);

  const grow = (frac: number) =>
    reduce
      ? { initial: { scaleX: frac }, animate: { scaleX: frac } }
      : { initial: { scaleX: 0 }, animate: { scaleX: frac } };

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: EASE.outQuart }}
      className="mb-10 rounded-2xl border border-white/10 bg-[#0a0e18]/85 p-6"
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[.22em] text-orange-300">
          Measurement integrity
        </p>
        <p className="font-mono text-xs tabular-nums text-white/40">
          {verifiedPct}% verified
        </p>
      </div>

      <div className="mt-5 flex items-end gap-8">
        <Stat
          value={verified_affected}
          label="verified-affected"
          tone="text-emerald-300"
        />
        <Stat
          value={execution_failed}
          label="execution-failed"
          tone="text-rose-300"
        />
        <Stat value={total_affected} label="total affected" tone="text-white/80" />
      </div>

      {/* Split bar. Transform-only (scaleX) so it stays on the compositor. */}
      <div className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-white/[.05]">
        <motion.div
          className="h-full origin-left bg-emerald-400/80"
          style={{ width: `${verifiedFrac * 100}%` }}
          initial={grow(verifiedFrac).initial}
          animate={grow(verifiedFrac).animate}
          transition={{ duration: DUR.reveal, ease: EASE.outQuart }}
        />
        <motion.div
          className="h-full origin-left bg-rose-400/70"
          style={{ width: `${failedFrac * 100}%` }}
          initial={grow(failedFrac).initial}
          animate={grow(failedFrac).animate}
          transition={{ duration: DUR.reveal, ease: EASE.outQuart, delay: reduce ? 0 : 0.1 }}
        />
      </div>

      {failedChips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {failedChips.map((status) => {
            const meta = STATUS_META[status];
            return (
              <span
                key={status}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[.14em] ${meta.chip}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                <span className="tabular-nums">{breakdown[status]}</span>
                {meta.label}
              </span>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-sm leading-relaxed text-white/55">{summary}</p>
    </motion.section>
  );
}
