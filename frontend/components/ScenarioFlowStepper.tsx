"use client";

/**
 * ScenarioFlowStepper — a top-of-page visual guide that shows reviewers
 * the three steps of the scenario journey:
 *
 *   1. CONFIGURE — paste / upload / load preset / type by hand
 *   2. VALIDATE  — server-validated preview catches bad rows before run
 *   3. RUN       — Certification (pre-flight) or Live Rollout (full canary)
 *
 * The active step lights up based on signals from the parent:
 *   • hasActions      → "Configure" is done
 *   • hasValidated    → "Validate" is done (CSV was server-checked)
 *   • busy === "live" / "certification" → "Run" is firing
 *
 * The point: a founder who lands here for the first time immediately
 * understands the workflow without reading a wiki.
 */

import { motion } from "framer-motion";
import clsx from "clsx";
import {
  Upload,
  CheckCircle2,
  Rocket,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

interface Props {
  hasActions: boolean;
  hasValidated: boolean;
  isRunning: boolean;
}

export function ScenarioFlowStepper({ hasActions, hasValidated, isRunning }: Props) {
  const steps: Array<{
    id: string;
    icon: typeof Upload;
    label: string;
    sub: string;
    state: "done" | "active" | "pending";
  }> = [
    {
      id: "configure",
      icon: Upload,
      label: "Configure",
      sub: "Upload CSV · paste · load preset · type",
      state: hasActions ? "done" : "active",
    },
    {
      id: "validate",
      icon: CheckCircle2,
      label: "Validate",
      sub: "Server checks every row before run",
      state: hasValidated ? "done" : hasActions ? "active" : "pending",
    },
    {
      id: "run",
      icon: Rocket,
      label: "Run",
      sub: "Certification or Live Rollout",
      state: isRunning ? "active" : hasActions && hasValidated ? "active" : "pending",
    },
  ];

  return (
    <section className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        <ShieldCheck className="h-3 w-3 text-emerald-400" /> Scenario journey
      </div>
      <div className="flex items-stretch gap-2">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isLast = idx === steps.length - 1;
          return (
            <div key={step.id} className="flex flex-1 items-stretch gap-2">
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.08 }}
                className={clsx(
                  "flex flex-1 items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                  step.state === "done" &&
                    "border-emerald-500/30 bg-emerald-500/5",
                  step.state === "active" &&
                    "border-brand/40 bg-brand/10 shadow-glow-brand",
                  step.state === "pending" &&
                    "border-white/5 bg-white/[0.015] opacity-60",
                )}
              >
                <div
                  className={clsx(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-bold",
                    step.state === "done" &&
                      "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
                    step.state === "active" &&
                      "border-brand/50 bg-brand/20 text-brand-300",
                    step.state === "pending" &&
                      "border-white/10 bg-white/[0.04] text-slate-500",
                  )}
                >
                  {step.state === "done" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={clsx(
                      "text-sm font-semibold",
                      step.state === "pending" ? "text-slate-500" : "text-white",
                    )}
                  >
                    {step.label}
                  </div>
                  <div className="truncate text-[11px] text-slate-500">{step.sub}</div>
                </div>
              </motion.div>
              {!isLast && (
                <div className="flex items-center text-slate-600">
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
