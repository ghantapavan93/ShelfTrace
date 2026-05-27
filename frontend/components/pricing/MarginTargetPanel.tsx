"use client";

/**
 * MarginTargetPanel — category-policy margin rollup vs target.
 *
 * Every grocer encodes a margin-target *policy*: KVI traffic-drivers run
 * tight to win the price-image fight, perishables need a spoilage
 * buffer, the standard catalog aims for a healthy baseline. The panel
 * exposes that policy lens directly — for each bucket, the live
 * weighted-average margin gets drawn against its target, color-coded by
 * the gap.
 *
 * Weighting: when historical revenue exists for a SKU·store, that's the
 * weight; otherwise the approved price stands in. The portfolio rollup
 * is a revenue-weighted blend.
 *
 * Visual: each row has an axis from 0% to ~1.3× target, a fill bar
 * animating to the current margin, a vertical target marker, a status
 * pill, and (when below target) a hint of how much margin we'd need
 * to recover to close the gap.
 */

import { useMemo } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import {
  Gauge,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertCircle,
} from "lucide-react";
import { useLive } from "@/lib/useLive";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { EASE } from "@/lib/motion";

type Data = Awaited<ReturnType<typeof api.pricingMarginTargets>>;
type Category = Data["categories"][number];

const STATUS_META: Record<
  Category["status"],
  {
    label: string;
    tone: "emerald" | "amber" | "rose" | "slate";
    icon: typeof ShieldCheck;
    description: string;
  }
> = {
  above: {
    label: "Above target",
    tone: "emerald",
    icon: TrendingUp,
    description: "Running ahead of plan — room to invest in price image.",
  },
  at: {
    label: "On target",
    tone: "emerald",
    icon: ShieldCheck,
    description: "Within ±1pp of target.",
  },
  near: {
    label: "Near band",
    tone: "amber",
    icon: Minus,
    description: "Within 3pp — close, but monitor.",
  },
  below: {
    label: "Below target",
    tone: "rose",
    icon: TrendingDown,
    description: "More than 3pp under target — material gap.",
  },
  no_data: {
    label: "No data",
    tone: "slate",
    icon: AlertCircle,
    description: "No SKUs in this bucket with cost on file.",
  },
};

export function MarginTargetPanel({
  reloadKey,
  liveScoped,
}: {
  reloadKey: number;
  liveScoped?: boolean;
}) {
  const data = useLive<Data>(() => api.pricingMarginTargets(), [reloadKey]);

  if (liveScoped) {
    return (
      <section className="rounded-2xl border border-sky-500/20 bg-sky-500/[.03] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-sky-300">
          <Gauge className="h-4 w-4" /> Margin targets
        </div>
        <h2 className="mt-2 text-base font-semibold text-white">
          Waiting for source-scoped margin history
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-slate-400">
          Demo margin rollups are hidden in Live mode because the current endpoint
          aggregates the shared pricing table. Uploaded recommendations still show
          below; production should add import/run provenance to historical sales and
          costs before this panel is re-enabled for Live mode.
        </p>
      </section>
    );
  }

  if (!data.data) {
    return (
      <section className="rounded-2xl border border-sky-500/20 bg-sky-500/[.03] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-sky-300">
          <Gauge className="h-4 w-4" /> Margin targets
        </div>
        <div className="mt-3 h-32 animate-pulse rounded-xl bg-white/[.02]" />
      </section>
    );
  }

  const { categories, portfolio, bands } = data.data;
  const hasData = portfolio.current_pct !== null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE.outQuart }}
      className="overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[.04] via-[#0a0e18]/0 to-[#0a0e18]/0 p-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-sky-300">
            <Gauge className="h-3 w-3" /> Margin targets
          </div>
          <h2 className="mt-1.5 text-base font-semibold text-white">
            Policy-bucket margin tracking
            <span className="ml-2 font-normal text-slate-500">
              · ±{bands.at_pp}pp = on target · ±{bands.near_pp}pp = near band
            </span>
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Each SKU classified by chain policy — KVI runs tight, perishables
            absorb spoilage, standard aims for healthy baseline. Margin is
            revenue-weighted where history exists, price-weighted otherwise.
          </p>
        </div>

        {/* Portfolio rollup tile */}
        {hasData && (
          <PortfolioTile portfolio={portfolio} bands={bands} />
        )}
      </div>

      {/* Per-category rows */}
      <div className="mt-5 space-y-2.5">
        {categories.map((cat, i) => (
          <MarginRow
            key={cat.policy}
            category={cat}
            bands={bands}
            stagger={i * 0.06}
          />
        ))}
      </div>

      {/* Footer hint */}
      <div className="mt-4 flex items-start gap-1.5 border-t border-white/5 pt-3 text-[10px] text-slate-500">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400/70" />
        <span>
          Targets are policy choices, not constraints — the engine still respects
          per-category cost floors and the shock cap when generating recs.
        </span>
      </div>
    </motion.section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Portfolio rollup tile (top-right)
// ────────────────────────────────────────────────────────────────────────

function PortfolioTile({
  portfolio,
  bands,
}: {
  portfolio: Data["portfolio"];
  bands: Data["bands"];
}) {
  const meta = STATUS_META[portfolio.status];
  const cur = portfolio.current_pct ?? 0;
  const tgt = portfolio.target_pct ?? 0;
  const gap = portfolio.gap_pct ?? 0;
  const Icon = meta.icon;

  const toneStyle = {
    emerald: "border-emerald-500/30 bg-emerald-500/[.06] text-emerald-200",
    amber: "border-amber-500/30 bg-amber-500/[.06] text-amber-200",
    rose: "border-rose-500/30 bg-rose-500/[.06] text-rose-200",
    slate: "border-white/10 bg-white/[.02] text-slate-300",
  }[meta.tone];

  return (
    <div className="flex shrink-0 flex-col items-end gap-1 rounded-xl border border-white/10 bg-white/[.025] px-4 py-3 text-right">
      <div className="text-[9px] font-semibold uppercase tracking-[.22em] text-slate-500">
        Portfolio
      </div>
      <div className="flex items-baseline gap-2">
        <span className="mono text-2xl font-bold tabular-nums text-white">
          {(cur * 100).toFixed(1)}%
        </span>
        <span className="mono text-[10px] text-slate-500">
          / {(tgt * 100).toFixed(1)}% tgt
        </span>
      </div>
      <span
        className={clsx(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
          toneStyle,
        )}
      >
        <Icon className="h-3 w-3" />
        <span className="font-medium">{meta.label}</span>
        <span className="mono tabular-nums">
          {gap >= 0 ? "+" : ""}
          {(gap * 100).toFixed(1)}pp
        </span>
      </span>
      <span className="text-[9px] text-slate-500">
        {portfolio.n_skus} SKUs · est{" "}
        <span className="mono">{money(portfolio.revenue_estimate)}</span>/period
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Per-category row
// ────────────────────────────────────────────────────────────────────────

function MarginRow({
  category,
  bands,
  stagger,
}: {
  category: Category;
  bands: Data["bands"];
  stagger: number;
}) {
  const meta = STATUS_META[category.status];
  const Icon = meta.icon;

  // Axis spans 0% to ~1.3× target so target sits ~75% across the bar by default.
  // Floor at 35% so a tiny target still renders sensibly.
  const axisMax = useMemo(() => {
    const t = category.target_pct;
    const c = category.current_pct ?? 0;
    return Math.max(t * 1.3, c * 1.15, 0.35);
  }, [category]);

  const currentPct = category.current_pct;
  const targetPct = category.target_pct;
  const currentFillPct = currentPct !== null ? (currentPct / axisMax) * 100 : 0;
  const targetLinePct = (targetPct / axisMax) * 100;

  const toneBorder = {
    emerald: "border-emerald-500/25",
    amber: "border-amber-500/30",
    rose: "border-rose-500/30",
    slate: "border-white/10",
  }[meta.tone];

  const toneBg = {
    emerald: "bg-emerald-500/[.03]",
    amber: "bg-amber-500/[.04]",
    rose: "bg-rose-500/[.04]",
    slate: "bg-white/[.015]",
  }[meta.tone];

  const toneFill = {
    emerald: "from-emerald-500/40 via-emerald-400 to-emerald-300",
    amber: "from-amber-500/40 via-amber-400 to-amber-300",
    rose: "from-rose-500/40 via-rose-400 to-rose-300",
    slate: "from-slate-500/40 via-slate-400 to-slate-300",
  }[meta.tone];

  const toneText = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    slate: "text-slate-400",
  }[meta.tone];

  // Gap framing — for below-target rows, surface "how far underwater"
  const gapShortfallPp = category.gap_pct !== null ? -category.gap_pct * 100 : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: EASE.outQuart, delay: stagger }}
      className={clsx("rounded-xl border px-4 py-3 transition", toneBorder, toneBg)}
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Status icon */}
        <span
          className={clsx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[.04]",
            toneText,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>

        {/* Label */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-white">
              {category.label}
            </span>
            <span className="mono rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-500">
              {category.policy}
            </span>
            <span className="text-[10px] text-slate-500">
              {category.n_skus} SKUs
              {category.n_with_cost < category.n_skus && (
                <span className="text-slate-600">
                  {" "}· {category.n_skus - category.n_with_cost} missing cost
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Current & target readout */}
        <div className="flex shrink-0 items-baseline gap-1.5 text-right">
          {currentPct !== null ? (
            <>
              <span className="mono text-xl font-bold tabular-nums text-white">
                {(currentPct * 100).toFixed(1)}%
              </span>
              <span className="mono text-[10px] text-slate-500">
                / {(targetPct * 100).toFixed(0)}% target
              </span>
            </>
          ) : (
            <span className="mono text-xl font-bold tabular-nums text-slate-600">
              —
            </span>
          )}
        </div>
      </div>

      {/* Progress bar with target marker */}
      {currentPct !== null && (
        <div className="mt-3">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/[.04]">
            {/* The "at-band" zone around the target — subtle green halo */}
            <div
              className="absolute top-0 h-full bg-emerald-500/10"
              style={{
                left: `${Math.max(0, ((targetPct - bands.at_pp / 100) / axisMax) * 100)}%`,
                width: `${(bands.at_pp * 2 / 100 / axisMax) * 100}%`,
              }}
            />
            {/* Fill bar — animates to current */}
            <motion.div
              className={clsx(
                "absolute left-0 top-0 h-full rounded-full bg-gradient-to-r",
                toneFill,
              )}
              initial={{ width: 0 }}
              animate={{ width: `${currentFillPct}%` }}
              transition={{ duration: 0.9, ease: EASE.outQuart, delay: stagger + 0.15 }}
            />
            {/* Target marker */}
            <div
              className="absolute top-1/2 h-3.5 w-px -translate-x-1/2 -translate-y-1/2 bg-white/60"
              style={{ left: `${targetLinePct}%` }}
            />
            <div
              className="absolute top-0 h-full w-px -translate-x-1/2 bg-white/30"
              style={{ left: `${targetLinePct}%` }}
            />
          </div>
          {/* Axis tick row — keep tight; the target marker speaks for itself */}
          <div className="mt-1 flex justify-between text-[9px] font-mono text-slate-600">
            <span>0%</span>
            <span className="text-slate-500">
              target {(targetPct * 100).toFixed(0)}%
            </span>
            <span>{(axisMax * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Status pill + actionable hint */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10px]">
        <span className={clsx("inline-flex items-center gap-1", toneText)}>
          <span className="font-medium">{meta.label}</span>
          {category.gap_pct !== null && (
            <span className="mono tabular-nums">
              · {category.gap_pct >= 0 ? "+" : ""}
              {(category.gap_pct * 100).toFixed(1)}pp
            </span>
          )}
        </span>

        {/* Below-target hint — speaks to actionability */}
        {category.status === "below" && gapShortfallPp !== null && currentPct !== null && (
          <span className="text-slate-500">
            ≈{" "}
            <span className="mono text-rose-300">
              {money((gapShortfallPp / 100) * category.revenue_estimate)}
            </span>{" "}
            of margin left on the table this period
          </span>
        )}

        {category.status === "near" && (
          <span className="text-slate-500">{meta.description}</span>
        )}

        {(category.status === "above" || category.status === "at") && (
          <span className="text-slate-500">{meta.description}</span>
        )}

        {category.status === "no_data" && (
          <span className="text-slate-500">{meta.description}</span>
        )}
      </div>
    </motion.div>
  );
}
