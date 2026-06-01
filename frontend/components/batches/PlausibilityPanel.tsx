"use client";

/**
 * PlausibilityPanel — the pre-execution price-integrity guard, surfaced.
 *
 * This is the layer a pricing AI's push→measure loop lacks: it asks "is this
 * approved price even plausible?" (decimal slip, below cost, one store wildly
 * off its siblings) BEFORE the price reaches a shopper. A CRITICAL finding holds
 * the batch; warnings are advisory. The panel shows the verdict + each finding
 * with its evidence — never auto-corrects, a human decides.
 *
 * Design: matches the BatchLifecycleStepper house style — rounded-2xl card on
 * #0a0e18, eyebrow at tracking-[.22em], font-mono tabular numbers, staggered
 * Framer entrance (transform/opacity only), reduced-motion respected. Renders
 * nothing while the report is still loading so the page is never disturbed.
 */

import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import {
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  Coins,
  SplitSquareHorizontal,
} from "lucide-react";
import { EASE, DUR } from "@/lib/motion";
import { money } from "@/lib/format";
import type { PlausibilityReport, PlausibilityFinding } from "@/lib/types";

const CODE_META: Record<
  PlausibilityFinding["code"],
  { label: string; icon: typeof TrendingDown }
> = {
  below_cost: { label: "Below cost", icon: Coins },
  extreme_swing: { label: "Extreme swing", icon: TrendingDown },
  cross_store_outlier: { label: "Cross-store outlier", icon: SplitSquareHorizontal },
};

export function PlausibilityPanel({ report }: { report: PlausibilityReport | null }) {
  const reduce = useReducedMotion();
  if (!report) return null;

  const critical = report.findings.filter((f) => f.severity === "critical");
  const warnings = report.findings.filter((f) => f.severity === "warning");
  const ordered = [...critical, ...warnings];
  const clean = report.findings.length === 0;

  // Tone resolves to the most severe state present: critical (rose) > warning
  // (amber) > clean (emerald). Mirrors the stepper's tonal chip system.
  const tone = critical.length > 0 ? "rose" : warnings.length > 0 ? "amber" : "emerald";
  const T = {
    rose: {
      ring: "border-rose-500/25",
      glow: "shadow-[0_0_0_1px_rgba(244,63,94,0.10),0_18px_50px_-28px_rgba(244,63,94,0.45)]",
      eyebrow: "text-rose-300",
      icon: "border-rose-500/40 bg-rose-500/15 text-rose-300",
      hero: "text-rose-200",
    },
    amber: {
      ring: "border-amber-500/25",
      glow: "shadow-[0_0_0_1px_rgba(245,158,11,0.08),0_18px_50px_-30px_rgba(245,158,11,0.35)]",
      eyebrow: "text-amber-300",
      icon: "border-amber-500/40 bg-amber-500/15 text-amber-300",
      hero: "text-amber-200",
    },
    emerald: {
      ring: "border-emerald-500/20",
      glow: "",
      eyebrow: "text-emerald-300",
      icon: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
      hero: "text-emerald-200",
    },
  }[tone];

  const enter = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 12, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: DUR.base, ease: EASE.outQuart, delay: reduce ? 0 : i * 0.06 },
  });

  return (
    <motion.section
      {...enter(0)}
      aria-label="Price plausibility guard"
      className={clsx(
        "rounded-2xl border bg-[#0a0e18]/85 p-5 sm:p-6",
        T.ring,
        T.glow,
      )}
    >
      {/* Eyebrow row — house standard: 10px, tracking .22em, tonal icon. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={clsx("flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em]", T.eyebrow)}>
          {clean ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
          Price plausibility guard
        </div>
        <div className="font-mono text-[11px] tabular-nums text-white/45">
          pre-execution · flags data errors
        </div>
      </div>

      {clean ? (
        // Calm resting state — the guard ran and found nothing suspect. Visible
        // so a reviewer knows the check happened, not that it was skipped.
        <div className="mt-4 flex items-center gap-3">
          <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-full border", T.icon)}>
            <ShieldCheck className="h-4 w-4" />
          </span>
          <p className="text-sm leading-relaxed text-white/65">
            <span className="font-medium text-white">{report.checked_actions}</span> approved
            price{report.checked_actions === 1 ? "" : "s"} screened — none look like data errors.
          </p>
        </div>
      ) : (
        <>
          {/* Verdict line with a hero count, mirroring the stepper's big mono number. */}
          <div className="mt-5 flex items-start gap-4">
            <span className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-full border", T.icon)}>
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className={clsx("font-mono text-3xl font-semibold leading-none tabular-nums", T.hero)}>
                  {critical.length > 0 ? critical.length : warnings.length}
                </span>
                <span className="text-sm font-medium text-white/80">
                  {critical.length > 0
                    ? `approved price${critical.length === 1 ? "" : "s"} look${critical.length === 1 ? "s" : ""} like a data error`
                    : `price${warnings.length === 1 ? "" : "s"} worth a second look`}
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-white/55">
                {critical.length > 0 ? (
                  <>
                    {critical.length === 1 ? "It is" : "They are"} holding this batch —
                    channel reconciliation alone would have passed{" "}
                    {critical.length === 1 ? "it" : "them"}, because every surface
                    agrees on the wrong number. A human should confirm before rollout.
                  </>
                ) : (
                  <>Advisory only — these do not block the rollout.</>
                )}
              </p>
            </div>
          </div>

          {/* Findings — each its own tonal row, staggered in. */}
          <div className="mt-5 flex flex-col gap-2">
            {ordered.map((f, i) => {
              const meta = CODE_META[f.code];
              const Icon = meta.icon;
              const isCritical = f.severity === "critical";
              return (
                <motion.div
                  key={`${f.action_id}-${f.code}-${i}`}
                  {...enter(i + 1)}
                  className={clsx(
                    "group flex items-start gap-3 rounded-xl border p-3.5 transition-colors",
                    isCritical
                      ? "border-rose-500/20 bg-rose-500/[0.05] hover:bg-rose-500/[0.08]"
                      : "border-amber-500/20 bg-amber-500/[0.05] hover:bg-amber-500/[0.08]",
                  )}
                >
                  <span
                    className={clsx(
                      "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border",
                      isCritical
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-300",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span
                        className={clsx(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.18em]",
                          isCritical
                            ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-200",
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-white">
                        {money(f.approved_price)}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-white/40">
                        {f.sku} · Store {f.store_id}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                      {f.message}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-white/35">
            <ShieldCheck className="h-3 w-3" />
            The guard flags — it never auto-corrects. Every finding carries its
            evidence; an operator decides.
          </p>
        </>
      )}
    </motion.section>
  );
}
