"use client";

/**
 * KviWatchlist — Key Value Items, sorted by absolute gap to competitor.
 *
 * KVIs are the SKUs shoppers price-check — eggs, milk, OJ, hot dogs. For
 * these, retailers lock to a tolerance band (±1.5%) around the competitor
 * because price perception drives traffic, not per-unit margin. A SKU
 * sitting outside the band is either bleeding margin (below) or risking
 * shopper trust (above) — and the watchlist surfaces both in one glance.
 *
 * The panel is read-only signal; actionable recommendations are still in
 * the main list. The point here is "are my traffic drivers on-strategy?"
 * — answered before you scroll.
 */

import { useMemo } from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion, useReducedMotion } from "framer-motion";
import {
  Target,
  ShieldCheck,
  CircleAlert,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useLive } from "@/lib/useLive";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { EASE } from "@/lib/motion";
import { useWorkMode } from "@/components/ModeProvider";

type WatchlistData = Awaited<ReturnType<typeof api.pricingKviWatchlist>>;
type Item = WatchlistData["items"][number];

export function KviWatchlist({
  reloadKey,
  allowedSkus,
  sourceLabel,
}: {
  reloadKey: number;
  allowedSkus?: Set<string> | null;
  sourceLabel?: string;
}) {
  // Send ?scope=live so the backend filters demo rows at the SQL layer;
  // allowedSkus stays as belt-and-suspenders for legacy frontend hides.
  const { mode, isHydrated } = useWorkMode();
  const isLiveWorkMode = isHydrated && mode === "live";
  const watchlist = useLive<WatchlistData>(
    () => api.pricingKviWatchlist(isLiveWorkMode ? "live" : undefined),
    [reloadKey, isLiveWorkMode],
  );

  if (!watchlist.data) {
    return (
      <section className="rounded-2xl border border-violet-500/20 bg-violet-500/[.03] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-violet-300">
          <Target className="h-4 w-4" /> KVI Watchlist
        </div>
        <div className="mt-3 h-20 animate-pulse rounded-xl bg-white/[.02]" />
      </section>
    );
  }

  const { tolerance_pct } = watchlist.data;
  const items = allowedSkus
    ? watchlist.data.items.filter((item) => allowedSkus.has(item.sku))
    : watchlist.data.items;
  const summary = {
    total: items.length,
    within_band: items.filter((item) => item.band === "within").length,
    above_band: items.filter((item) => item.band === "above").length,
    below_band: items.filter((item) => item.band === "below").length,
    max_abs_gap_pct: items.reduce(
      (max, item) => Math.max(max, item.abs_gap_pct ?? 0),
      0,
    ),
  };

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-violet-500/20 bg-violet-500/[.03] p-5">
        <Header tolerancePct={tolerance_pct} summary={summary} sourceLabel={sourceLabel} />
        <p className="mt-3 text-xs text-slate-500">
          No KVI-flagged actions in the current price book — flag traffic-driver SKUs (eggs, milk, OJ&hellip;) in your scenarios to populate this watchlist.
        </p>
      </section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE.outQuart }}
      className="rounded-2xl border border-violet-500/20 bg-violet-500/[.03] p-5"
    >
      <Header tolerancePct={tolerance_pct} summary={summary} sourceLabel={sourceLabel} />

      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <KviRow key={`${item.sku}-${item.store_id}`} item={item} tolerancePct={tolerance_pct} />
        ))}
      </div>
    </motion.section>
  );
}

function Header({
  tolerancePct,
  summary,
  sourceLabel,
}: {
  tolerancePct: number;
  summary: WatchlistData["summary"];
  sourceLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-violet-300">
          <Target className="h-3 w-3" /> KVI Watchlist
        </div>
        <h2 className="mt-1.5 text-base font-semibold text-white">
          Traffic-driver alignment
          <span className="ml-2 font-normal text-slate-500">
            · ±{tolerancePct.toFixed(1)}% tolerance to competitor
          </span>
          {sourceLabel && (
            <span className="ml-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-normal text-violet-200">
              {sourceLabel}
            </span>
          )}
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-slate-400">
          Key Value Items — the SKUs shoppers price-check. We track each
          one&apos;s gap to the latest competitor reference; outside the
          band, the KVI lock would force-clip on the next engine run.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StatPill tone="emerald" icon={ShieldCheck} value={summary.within_band} label="within" />
        <StatPill tone="rose" icon={TrendingUp} value={summary.above_band} label="above" />
        <StatPill tone="amber" icon={TrendingDown} value={summary.below_band} label="below" />
        {summary.max_abs_gap_pct > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[.02] px-2 py-0.5 text-[10px] text-slate-400">
            max gap{" "}
            <span className="mono font-semibold text-slate-200">
              {summary.max_abs_gap_pct.toFixed(1)}%
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function KviRow({ item, tolerancePct }: { item: Item; tolerancePct: number }) {
  const bandStyle = useMemo(() => {
    switch (item.band) {
      case "within":
        return {
          border: "border-emerald-500/25",
          bg: "bg-emerald-500/[.03]",
          accent: "text-emerald-300",
          dotBg: "bg-emerald-400",
          icon: ShieldCheck,
          label: "Within band",
        };
      case "above":
        return {
          border: "border-rose-500/30",
          bg: "bg-rose-500/[.04]",
          accent: "text-rose-300",
          dotBg: "bg-rose-400",
          icon: CircleAlert,
          label: `Above band by ${((item.abs_gap_pct ?? 0) - tolerancePct).toFixed(1)}%`,
        };
      case "below":
        return {
          border: "border-amber-500/30",
          bg: "bg-amber-500/[.04]",
          accent: "text-amber-300",
          dotBg: "bg-amber-400",
          icon: CircleAlert,
          label: `Below band by ${((item.abs_gap_pct ?? 0) - tolerancePct).toFixed(1)}%`,
        };
      case "no_competitor":
      default:
        return {
          border: "border-white/10",
          bg: "bg-white/[.015]",
          accent: "text-slate-500",
          dotBg: "bg-slate-400",
          icon: CircleAlert,
          label: "No competitor reference",
        };
    }
  }, [item, tolerancePct]);

  const Icon = bandStyle.icon;

  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3 transition",
        bandStyle.border,
        bandStyle.bg,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={clsx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[.04]",
            bandStyle.accent,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>

        {/* SKU + product */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-white">{item.product_name}</span>
            <span className="mono rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-violet-300/80">
              KVI
            </span>
            <span className="mono rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] text-slate-500">
              {item.sku} · store {item.store_id}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
            <span>
              ours{" "}
              <span className="mono tabular-nums font-semibold text-white">
                {money(item.current_price)}
              </span>
            </span>
            <span className="text-slate-600">·</span>
            {item.competitor_price != null ? (
              <>
                <span>
                  competitor{" "}
                  <span className="mono tabular-nums text-slate-200">
                    {money(item.competitor_price)}
                  </span>
                  {item.competitor_source && (
                    <span className="ml-1 text-[10px] text-slate-500">
                      ({item.competitor_source})
                    </span>
                  )}
                </span>
                <span className="text-slate-600">·</span>
                <span
                  className={clsx(
                    "mono tabular-nums font-semibold",
                    bandStyle.accent,
                  )}
                >
                  {(item.gap_pct ?? 0) > 0 ? "+" : ""}
                  {(item.gap_pct ?? 0).toFixed(1)}%
                  <span className="ml-1 text-slate-500">
                    ({(item.gap_dollar ?? 0) > 0 ? "+" : ""}
                    {money(item.gap_dollar ?? 0)})
                  </span>
                </span>
              </>
            ) : (
              <span className="italic text-slate-500">no competitor link</span>
            )}
          </div>
        </div>

        {/* Recommendation hint */}
        <div className="flex shrink-0 items-center gap-2">
          {item.recommendation ? (
            <Link
              href="#"
              className="group inline-flex items-center gap-1 rounded-lg border border-brand/30 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand-400 hover:bg-brand/15"
              title={`Engine suggests ${money(item.recommendation.recommended_price)}`}
            >
              <Sparkles className="h-3 w-3" /> Rec{" "}
              <span className="mono">{money(item.recommendation.recommended_price)}</span>
              <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </Link>
          ) : item.band === "within" ? (
            <span className="text-[10px] text-emerald-300/70">on-strategy</span>
          ) : (
            <span className="text-[10px] text-slate-500">no active rec</span>
          )}
        </div>
      </div>

      {/* Position-on-band visualization — small, only when we have a competitor reference */}
      {item.competitor_price != null && (
        <KviBandTrack
          gapPct={item.gap_pct ?? 0}
          tolerancePct={tolerancePct}
          dotBg={bandStyle.dotBg}
        />
      )}
    </div>
  );
}

/**
 * Tiny horizontal track showing where this SKU sits relative to the
 * tolerance band around the competitor. The competitor reference sits
 * at the center; the green strip is the ±tolerance band; the dot is us.
 */
function KviBandTrack({
  gapPct,
  tolerancePct,
  dotBg,
}: {
  gapPct: number;
  tolerancePct: number;
  dotBg: string;
}) {
  // Cap the visible range at ±3× tolerance so far-out outliers don't
  // squish the band into a sliver. Beyond that we clamp the dot to the
  // edge so you can still see *direction*.
  const RANGE = Math.max(tolerancePct * 3, Math.abs(gapPct) + 0.5);
  const dotPctFromCenter = Math.max(-RANGE, Math.min(RANGE, gapPct));
  const dotLeftPct = 50 + (dotPctFromCenter / RANGE) * 50;

  const bandHalfWidth = (tolerancePct / RANGE) * 50;
  const bandLeft = 50 - bandHalfWidth;
  const bandWidth = bandHalfWidth * 2;
  const reduced = useReducedMotion();

  return (
    <div className="mt-2 pl-10">
      <div className="relative h-1.5 w-full rounded-full bg-white/[.04]">
        {/* Tolerance band */}
        <div
          className="absolute top-0 h-full rounded-full bg-emerald-500/15"
          style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
        />
        {/* Competitor center marker */}
        <div
          className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-violet-400/50"
          style={{ left: "50%" }}
        />
        {/* Our position */}
        <motion.div
          initial={false}
          animate={{ left: `${dotLeftPct}%` }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 25 }}
          className={clsx(
            "absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#0a0e18]",
          )}
        >
          <div className={clsx("h-full w-full rounded-full", dotBg)} />
        </motion.div>
      </div>
      <div className="mt-1 flex justify-between text-[9px] font-mono text-slate-600">
        <span>−{RANGE.toFixed(1)}%</span>
        <span className="text-slate-500">competitor</span>
        <span>+{RANGE.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function StatPill({
  tone,
  value,
  label,
  icon: Icon,
}: {
  tone: "emerald" | "rose" | "amber";
  value: number;
  label: string;
  icon: typeof ShieldCheck;
}) {
  const cls = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  }[tone];

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px]",
        cls,
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="mono font-semibold tabular-nums">{value}</span>
      <span className="text-[9px] uppercase tracking-wider opacity-80">{label}</span>
    </span>
  );
}
