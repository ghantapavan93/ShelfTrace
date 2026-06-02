"use client";

/**
 * ExperienceAssurance — a subtle, native self-check that the page communicates
 * its proof accessibly (HCI/a11y discipline made visible, not gimmicky).
 *
 * It is NOT a runtime accessibility scanner; it's a small, honest checklist of
 * the experience properties this page was built to satisfy (status has text not
 * just color, next action is obvious, evidence is visible, motion is reducible,
 * etc.). Pass the checks relevant to the surface; it renders "N/M checks passed"
 * and, if any fail, one plain suggestion. Static, deterministic, calm.
 */

import { ShieldCheck, Check, Info } from "lucide-react";
import clsx from "clsx";

export interface AssuranceCheck {
  label: string;
  passed: boolean;
}

export function ExperienceAssurance({
  checks,
  suggestion,
  className,
}: {
  checks: AssuranceCheck[];
  /** Shown only when at least one check fails; one short plain-language tip. */
  suggestion?: string;
  className?: string;
}) {
  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const allPassed = passed === total;

  return (
    <section
      aria-label="Experience assurance"
      className={clsx(
        "rounded-2xl border p-4",
        allPassed
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : "border-amber-500/25 bg-amber-500/[0.05]",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={clsx(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg border",
            allPassed
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
              : "border-amber-400/40 bg-amber-400/10 text-amber-300",
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
        </span>
        <div className="flex flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[10px] font-semibold uppercase leading-relaxed tracking-[.22em] text-white/55">
            Experience Assurance
          </span>
          <span
            className={clsx(
              "font-mono text-xs font-semibold tabular-nums",
              allPassed ? "text-emerald-200" : "text-amber-200",
            )}
          >
            {passed}/{total} checks passed
          </span>
        </div>
      </div>

      <ul className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-300">
            <Check
              className={clsx(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                c.passed ? "text-emerald-400" : "text-white/20",
              )}
              aria-hidden="true"
            />
            <span className={clsx(!c.passed && "text-slate-500")}>
              {c.label}
              {!c.passed && <span className="ml-1 text-amber-300/70">(open)</span>}
            </span>
          </li>
        ))}
      </ul>

      {!allPassed && suggestion && (
        <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-amber-200/80">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">Suggestion:</span> {suggestion}
          </span>
        </p>
      )}
    </section>
  );
}
