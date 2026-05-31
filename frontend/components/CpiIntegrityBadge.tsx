"use client";

/**
 * CpiIntegrityBadge — is the competitor price index (CPI) built on the price
 * that actually rang?
 *
 * A competitor index is only as trustworthy as the execution underneath it.
 * For every entity feeding the index, this badge answers whether the intended
 * price was *verified* at the register (emerald), is still *unverified*
 * (amber), or *mismatched* what actually rang (rose). Where an input
 * mismatched, the observed-vs-intended prices are surfaced so the drift is
 * legible, not hidden behind an aggregate.
 *
 * Renders only what the backend returns — no synthesis, no rounding beyond the
 * money formatter, no fabricated counts. Animates transform/opacity only and
 * lands in place under prefers-reduced-motion. The empty case
 * (total_inputs === 0) resolves to a calm resting state.
 */

import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import {
  ShieldCheck,
  CircleAlert,
  Hourglass,
  Gauge,
  ArrowRight,
} from "lucide-react";
import { EASE, DUR } from "@/lib/motion";
import { money } from "@/lib/format";
import type { CpiIntegrity, CpiIntegrityStatus } from "@/lib/types";

const STATUS_TONE: Record<
  CpiIntegrityStatus,
  { label: string; chip: string; text: string; dot: string; icon: typeof ShieldCheck }
> = {
  verified: {
    label: "Verified",
    chip: "border-emerald-400/35 bg-emerald-400/10",
    text: "text-emerald-200",
    dot: "bg-emerald-300",
    icon: ShieldCheck,
  },
  unverified: {
    label: "Unverified",
    chip: "border-amber-400/35 bg-amber-400/10",
    text: "text-amber-200",
    dot: "bg-amber-300",
    icon: Hourglass,
  },
  mismatch: {
    label: "Mismatch",
    chip: "border-rose-400/40 bg-rose-400/10",
    text: "text-rose-200",
    dot: "bg-rose-300",
    icon: CircleAlert,
  },
};

const LEGEND: CpiIntegrityStatus[] = ["verified", "unverified", "mismatch"];

export function CpiIntegrityBadge({ data }: { data: CpiIntegrity }) {
  const reduce = useReducedMotion();
  const isEmpty = data.total_inputs === 0;

  // The mismatched inputs are the ones worth surfacing in detail — they are
  // the index entries silently built on a price that never rang.
  const mismatches = data.items.filter((i) => i.status === "mismatch");

  const counts: Record<CpiIntegrityStatus, number> = {
    verified: data.verified,
    unverified: data.unverified,
    mismatch: data.mismatch,
  };

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.reveal, ease: EASE.outQuart }}
      className={clsx(
        "rounded-2xl border bg-[#0a0e18]/85 p-5 sm:p-6",
        data.mismatch > 0 ? "border-rose-400/25" : "border-white/10",
      )}
      aria-label="Competitor index integrity"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-orange-300">
          <Gauge className="h-3.5 w-3.5" />
          Competitor index integrity
        </div>
        {!isEmpty && (
          <div className="font-mono text-[11px] tabular-nums text-white/45">
            {data.verified}/{data.total_inputs} built on a verified price
          </div>
        )}
      </div>

      {isEmpty ? (
        <p className="mt-4 text-sm leading-relaxed text-white/45">
          No competitor-index inputs linked yet — link a canonical entity to an
          executed price and its integrity will appear here.
        </p>
      ) : (
        <>
          {/* Stacked share of each integrity state. */}
          <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-white/5">
            {LEGEND.map((st) =>
              counts[st] > 0 ? (
                <div
                  key={st}
                  className={STATUS_TONE[st].dot}
                  style={{
                    width: `${(counts[st] / data.total_inputs) * 100}%`,
                  }}
                />
              ) : null,
            )}
          </div>

          {/* Legend counts. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {LEGEND.map((st) => {
              const tone = STATUS_TONE[st];
              const Icon = tone.icon;
              return (
                <span
                  key={st}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums",
                    tone.chip,
                    tone.text,
                  )}
                >
                  <Icon className="h-3 w-3" />
                  <span className="font-mono">{counts[st]}</span>
                  {tone.label}
                </span>
              );
            })}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-white/55">
            {data.summary}
          </p>

          {/* Mismatched inputs — observed vs intended, so the drift is legible.
              These are the index entries built on a price that never rang. */}
          {mismatches.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="text-[10px] uppercase tracking-[.18em] text-rose-200/70">
                Built on a price that didn&apos;t ring
              </div>
              {mismatches.map((item, idx) => (
                <motion.div
                  key={item.entity_id + (item.sku ?? "") + (item.store_id ?? "")}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: DUR.base,
                    ease: EASE.outQuart,
                    delay: reduce ? 0 : idx * 0.05,
                  }}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">
                      {item.canonical_title}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-white/40">
                      {item.sku ?? "—"}
                      {item.store_id ? ` · ${item.store_id}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
                    <span className="text-white/45">
                      index {money(item.intended_price)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-rose-300/70" />
                    <span className="text-rose-200">
                      rang {money(item.observed_price)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}
