"use client";

/**
 * ModeBadge — clickable toggle in the global header.
 *
 * Click flips between:
 *   DEMO MODE (violet, flask icon) — guided tour with Memorial Day seeded data
 *   LIVE MODE (rose, broadcast icon) — bring your own data, clean slate
 *
 * Backend stays the same (simulated retailers either way). This is a UX
 * affordance so a reviewer can immediately see "I'm in demo, with the
 * preset data" vs "I'm in live, working on my own catalog".
 *
 * Tooltip on hover explains the mode and how to switch. Persisted via
 * ModeProvider (localStorage).
 */

import { useState } from "react";
import clsx from "clsx";
import { Beaker, Radio, Info, ArrowLeftRight } from "lucide-react";
import { useWorkMode } from "./ModeProvider";

const COPY = {
  demo: {
    label: "DEMO MODE",
    Icon: Beaker,
    short: "Guided tour · Memorial Day data pre-seeded",
    long: "All scenarios run against simulated retailer connectors. The Memorial Day Dallas Zone 2 batch is auto-seeded. Use this mode to explore the platform without any setup.",
    accent: {
      ring: "border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15",
      iconColor: "text-violet-300",
      tooltipBorder: "border-violet-500/30",
    },
  },
  live: {
    label: "LIVE MODE",
    Icon: Radio,
    short: "Bring your own data · clean slate",
    long: "Upload your CSV catalog and configure real scenarios. Memorial Day shortcuts are hidden. Backend still uses simulated connectors (no actual POS/ESL/ecommerce traffic) — this mode is for working with YOUR data instead of the demo.",
    accent: {
      ring: "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15",
      iconColor: "text-rose-300",
      tooltipBorder: "border-rose-500/30",
    },
  },
} as const;

export function ModeBadge() {
  const { mode, toggle, isHydrated } = useWorkMode();
  const [showTooltip, setShowTooltip] = useState(false);

  // Avoid SSR flash by waiting for client hydration
  if (!isHydrated) {
    return <div className="h-[24px] w-[110px] animate-pulse rounded-full bg-white/5" />;
  }

  const config = COPY[mode];
  const otherConfig = COPY[mode === "demo" ? "live" : "demo"];
  const Icon = config.Icon;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label={`Currently ${config.label}. Click to switch to ${otherConfig.label}.`}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition",
          config.accent.ring,
        )}
      >
        <Icon className="h-3 w-3" />
        {config.label}
        <ArrowLeftRight className="ml-0.5 h-2.5 w-2.5 opacity-50" />
      </button>

      {showTooltip && (
        <div
          role="tooltip"
          className={clsx(
            "absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border bg-ink-900/95 p-3 text-xs shadow-2xl backdrop-blur-md",
            config.accent.tooltipBorder,
          )}
        >
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-100">
            <Info className={clsx("h-3.5 w-3.5", config.accent.iconColor)} />
            {config.short}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">{config.long}</p>
          <div className="mt-2 border-t border-white/5 pt-2 text-[10px] uppercase tracking-wider text-slate-500">
            Click to switch → {otherConfig.label}
          </div>
        </div>
      )}
    </div>
  );
}
