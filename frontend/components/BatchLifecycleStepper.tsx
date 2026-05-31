"use client";

/**
 * BatchLifecycleStepper — the post-export reliability ladder for one batch.
 *
 *   Exported → Published → Verified → Measured
 *
 * Most pricing tools stop at "exported": they hand an approved price to a
 * connector and assume it landed. ShelfTrace proves the rest of the chain —
 * that the price *published* to every channel, *verified* against what
 * actually rang, and became *measured*-eligible. That post-export segment
 * (Published → Verified → Measured) is the differentiator competitors lack,
 * so it's visually emphasised here while "Exported" reads as the calm
 * starting point.
 *
 * Renders only the counts the backend returns — no synthesis, no rounding,
 * no fabricated outcomes. Animates transform/opacity only and lands in place
 * when the viewer prefers reduced motion. Takes a non-null BatchLifecycle;
 * the all-zero / empty batch is handled with a calm resting state.
 */

import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import {
  PackageCheck,
  Radio,
  ShieldCheck,
  Gauge,
  ArrowRight,
} from "lucide-react";
import { EASE, DUR } from "@/lib/motion";
import type { BatchLifecycle } from "@/lib/types";

type Tone = "neutral" | "brand" | "verified";

type Node = {
  key: keyof Pick<
    BatchLifecycle,
    "exported" | "published" | "verified" | "measured"
  >;
  label: string;
  sub: string;
  icon: typeof PackageCheck;
  tone: Tone;
};

// Exported is the calm origin (neutral). The post-export segment carries the
// emphasis: Published/Verified lean on the brand accent, Measured resolves to
// the verified emerald — the proof that the chain completed.
const NODES: Node[] = [
  {
    key: "exported",
    label: "Exported",
    sub: "Approved & handed off",
    icon: PackageCheck,
    tone: "neutral",
  },
  {
    key: "published",
    label: "Published",
    sub: "Dispatched to every channel",
    icon: Radio,
    tone: "brand",
  },
  {
    key: "verified",
    label: "Verified",
    sub: "Matched the price that rang",
    icon: ShieldCheck,
    tone: "brand",
  },
  {
    key: "measured",
    label: "Measured",
    sub: "Eligible for performance read",
    icon: Gauge,
    tone: "verified",
  },
];

const TONE: Record<
  Tone,
  { ring: string; chip: string; icon: string; value: string; dot: string }
> = {
  neutral: {
    ring: "border-white/10",
    chip: "bg-white/[0.03]",
    icon: "border-white/12 bg-white/[0.04] text-white/70",
    value: "text-white",
    dot: "bg-white/30",
  },
  brand: {
    ring: "border-orange-400/30",
    chip: "bg-orange-400/[0.06]",
    icon: "border-orange-400/40 bg-orange-400/15 text-orange-300",
    value: "text-orange-200",
    dot: "bg-orange-300",
  },
  verified: {
    ring: "border-emerald-400/30",
    chip: "bg-emerald-400/[0.06]",
    icon: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
    value: "text-emerald-200",
    dot: "bg-emerald-300",
  },
};

export function BatchLifecycleStepper({
  lifecycle,
}: {
  lifecycle: BatchLifecycle;
}) {
  const reduce = useReducedMotion();
  const isEmpty = lifecycle.total === 0;

  return (
    <section
      className="rounded-2xl border border-white/10 bg-[#0a0e18]/85 p-5 sm:p-6"
      aria-label="Batch lifecycle"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-orange-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Post-export lifecycle
        </div>
        {!isEmpty && (
          <div className="font-mono text-[11px] tabular-nums text-white/45">
            {lifecycle.measured}/{lifecycle.total} measured-eligible
          </div>
        )}
      </div>

      {isEmpty ? (
        <p className="mt-4 text-sm leading-relaxed text-white/45">
          No actions in this batch yet — the lifecycle ladder lights up once
          prices are exported and start reconciling across channels.
        </p>
      ) : (
        <>
          {/* The ladder. Each node carries its own count; the connector after
              "Exported" is tinted to signal where the differentiating
              post-export work begins. */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-2">
            {NODES.map((node, idx) => {
              const value = lifecycle[node.key];
              const tone = TONE[node.tone];
              const isLast = idx === NODES.length - 1;
              // The connector leading into a node belongs to the post-export
              // segment when that node is Published or later.
              const postExport = idx >= 1;
              return (
                <div
                  key={node.key}
                  className="flex flex-1 items-stretch gap-2"
                >
                  <motion.div
                    initial={
                      reduce ? false : { opacity: 0, y: 12, scale: 0.98 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      duration: DUR.base,
                      ease: EASE.outQuart,
                      delay: reduce ? 0 : idx * 0.08,
                    }}
                    className={clsx(
                      "flex flex-1 flex-col gap-3 rounded-xl border p-4",
                      tone.ring,
                      tone.chip,
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={clsx(
                          "grid h-9 w-9 shrink-0 place-items-center rounded-full border",
                          tone.icon,
                        )}
                      >
                        <node.icon className="h-4 w-4" />
                      </span>
                      <span
                        className={clsx(
                          "font-mono text-2xl font-semibold tabular-nums leading-none",
                          tone.value,
                        )}
                      >
                        {value}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {node.label}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-white/45">
                        {node.sub}
                      </div>
                    </div>
                  </motion.div>

                  {!isLast && (
                    <div className="flex items-center justify-center sm:px-0.5">
                      <ArrowRight
                        className={clsx(
                          "h-3.5 w-3.5 rotate-90 sm:rotate-0",
                          postExport ? "text-orange-300/70" : "text-white/25",
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Differentiator marker for the post-export segment. */}
          <div className="mt-4 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-300" />
            <span className="text-[10px] uppercase tracking-[.18em] text-white/40">
              Published → Verified → Measured · proof competitors stop short of
            </span>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-white/55">
            {lifecycle.summary}
          </p>
        </>
      )}
    </section>
  );
}
