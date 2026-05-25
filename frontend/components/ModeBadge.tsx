"use client";

/**
 * ModeBadge — a small pill in the global header that tells the reviewer
 * at a glance whether they're looking at:
 *
 *   DEMO MODE  (violet) — simulated retailers, safe to click anything
 *   LIVE MODE  (rose)   — real connectors wired, actions are real
 *
 * Hovering surfaces a tooltip with the why (no real systems are contacted,
 * Memorial Day data is auto-seeded, etc.) so a founder doesn't need to ask
 * "but is this real or fake?"
 */

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Beaker, Radio, Info } from "lucide-react";
import { api } from "@/lib/api";

type Mode = {
  mode: "demo" | "live";
  label: string;
  tone: "violet" | "rose";
  description: string;
  details: string;
};

export function ModeBadge() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .mode()
      .then((m) => {
        if (alive) setMode(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!mode) return null;

  const isDemo = mode.mode === "demo";
  const Icon = isDemo ? Beaker : Radio;

  return (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition",
          isDemo
            ? "border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15"
            : "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15",
        )}
      >
        <Icon className="h-3 w-3" />
        {mode.label}
      </button>

      {showTooltip && (
        <div
          role="tooltip"
          className={clsx(
            "absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border p-3 text-xs shadow-2xl backdrop-blur-md",
            isDemo
              ? "border-violet-500/30 bg-ink-900/95 text-slate-200"
              : "border-rose-500/30 bg-ink-900/95 text-slate-200",
          )}
        >
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold">
            <Info className={clsx("h-3.5 w-3.5", isDemo ? "text-violet-300" : "text-rose-300")} />
            {mode.description}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">{mode.details}</p>
        </div>
      )}
    </div>
  );
}
