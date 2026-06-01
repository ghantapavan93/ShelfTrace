"use client";

import { ShieldAlert, ShieldCheck, AlertTriangle, TrendingDown } from "lucide-react";
import clsx from "clsx";
import { money } from "@/lib/format";
import type { PlausibilityReport, PlausibilityFinding } from "@/lib/types";

/**
 * PlausibilityPanel — surfaces the pre-execution price-integrity guard.
 *
 * This is the layer a pricing AI's push→measure loop lacks: it asks "is this
 * approved price even plausible?" (decimal slip, below cost, one store wildly
 * off its siblings) BEFORE the price reaches a shopper. A CRITICAL finding holds
 * the batch; warnings are advisory. The panel shows the verdict + each finding
 * with its evidence — never auto-corrects, a human decides.
 *
 * Renders nothing while loading or on error (the rest of the page is unaffected).
 */

const CODE_META: Record<
  PlausibilityFinding["code"],
  { label: string; icon: typeof AlertTriangle }
> = {
  below_cost: { label: "Below cost", icon: TrendingDown },
  extreme_swing: { label: "Extreme price swing", icon: AlertTriangle },
  cross_store_outlier: { label: "Cross-store outlier", icon: AlertTriangle },
};

export function PlausibilityPanel({ report }: { report: PlausibilityReport | null }) {
  if (!report) return null;

  const clean = report.findings.length === 0;

  // Clean batch — a quiet, reassuring "checked, nothing suspect" so the guard's
  // presence is visible even when it has nothing to flag.
  if (clean) {
    return (
      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />
          <p className="text-sm text-emerald-200/90">
            <span className="font-medium text-emerald-100">Price plausibility checked</span>{" "}
            — {report.checked_actions} approved price
            {report.checked_actions === 1 ? "" : "s"} screened, none look like data
            errors.
          </p>
        </div>
      </section>
    );
  }

  const critical = report.findings.filter((f) => f.severity === "critical");
  const warnings = report.findings.filter((f) => f.severity === "warning");

  return (
    <section
      className={clsx(
        "rounded-2xl border px-5 py-4",
        report.critical_count > 0
          ? "border-rose-500/30 bg-rose-500/[0.05]"
          : "border-amber-500/30 bg-amber-500/[0.05]",
      )}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <ShieldAlert
          className={clsx(
            "h-4 w-4 shrink-0",
            report.critical_count > 0 ? "text-rose-300" : "text-amber-300",
          )}
        />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
          Plausibility guard
        </h3>
        <span className="ml-auto text-[10px] uppercase tracking-[.18em] text-slate-500">
          Pre-execution · flags data errors
        </span>
      </div>

      <p className="mb-3 text-sm text-slate-300">
        {report.critical_count > 0 ? (
          <>
            <span className="font-semibold text-rose-200">
              {report.critical_count} approved price
              {report.critical_count === 1 ? " looks" : "s look"} like a data error
            </span>{" "}
            and {report.critical_count === 1 ? "is" : "are"} holding this batch —
            a human should confirm before rollout.
          </>
        ) : (
          <>
            {warnings.length} price{warnings.length === 1 ? "" : "s"} worth a
            second look (advisory — not blocking).
          </>
        )}
      </p>

      <ul className="space-y-2">
        {[...critical, ...warnings].map((f, i) => {
          const meta = CODE_META[f.code];
          const Icon = meta.icon;
          const isCritical = f.severity === "critical";
          return (
            <li
              key={`${f.action_id}-${f.code}-${i}`}
              className={clsx(
                "flex items-start gap-3 rounded-xl border px-3.5 py-2.5",
                isCritical
                  ? "border-rose-500/25 bg-rose-500/[0.06]"
                  : "border-amber-500/25 bg-amber-500/[0.05]",
              )}
            >
              <Icon
                className={clsx(
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  isCritical ? "text-rose-300" : "text-amber-300",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={clsx(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.16em]",
                      isCritical
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-200",
                    )}
                  >
                    {meta.label}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-white">
                    {money(f.approved_price)}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {f.sku} · Store {f.store_id}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-300">
                  {f.message}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] text-slate-500">
        The guard flags — it never auto-corrects. Every finding carries its
        evidence; an operator decides.
      </p>
    </section>
  );
}
