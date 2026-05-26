"use client";

/**
 * WhatIfSimulator — the interactive price exploration surface.
 *
 * One-shot fetch of the fitted elasticity + cost + constraint inputs,
 * then ALL the math runs client-side as the slider moves. Zero network
 * roundtrips during interaction = instant feel.
 *
 * What it answers, live:
 *   • At this price, what's predicted demand?           Q = exp(α) · P^β
 *   • What revenue & profit does that produce?
 *   • Which constraints would fire (cost floor, KVI lock,
 *     competitor ceiling, shock cap, etc.)?
 *   • How wide is the confidence band when the candidate price
 *     is outside the observed range?
 *
 * Design language matches the keynote + vision pages: muted ink-900
 * surfaces, orange accent, framer-motion smoothing, tabular nums for
 * every number that ticks.
 *
 * Edge cases handled:
 *   • Insufficient data → render an explainer instead of the simulator
 *   • Veblen good (β >= 0) → warning banner, slider still works
 *   • Missing cost → profit panel shows "—" with explanation
 *   • Outside observed price range → confidence band visibly widens
 *   • prefers-reduced-motion → no live animation, results still update
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  ShieldCheck,
  CircleAlert,
  Sparkles,
  X,
} from "lucide-react";
import { EASE } from "@/lib/motion";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

// Constraint tuning — kept in sync with backend/app/pricing/constraints.py.
// These are the same numbers the production engine enforces. Duplicating
// them in TS gives us instant slider feedback without a roundtrip.
const MIN_MARGIN_PCT = 0.05;
const KVI_COMPETITOR_TOLERANCE = 0.015;
const COMPETITOR_CEILING_PCT = 0.15;
const SHOCK_CAP_PCT = 0.25;
const PERISHABLE_MARKDOWN_PCT = 0.30;

type Fit = Awaited<ReturnType<typeof api.pricingWhatIfFit>>;

interface Props {
  sku: string;
  storeId: string;
  /** If provided, marks the engine's recommendation on the slider. */
  recommendedPrice?: number;
  /** Caller can close the panel. */
  onClose?: () => void;
}

interface ConstraintCheck {
  code: string;
  label: string;
  fired: boolean;
  tone: "ok" | "warn" | "danger";
  message?: string;
}

export function WhatIfSimulator({ sku, storeId, recommendedPrice, onClose }: Props) {
  const reduced = useReducedMotion();
  const [fit, setFit] = useState<Fit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<number | null>(null);

  // ── 1. Fetch the fit once on mount ────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setFit(null);
    setError(null);
    api
      .pricingWhatIfFit(sku, storeId)
      .then((f) => {
        if (!alive) return;
        setFit(f);
        setCandidate(f.current_price);
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [sku, storeId]);

  // ── 2. Loading / empty / error states ─────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[.04] p-5 text-sm text-rose-200">
        <CircleAlert className="mr-2 inline h-4 w-4" />
        Could not load what-if data: {error}
      </div>
    );
  }

  if (!fit || candidate === null) {
    return (
      <div className="grid h-[380px] place-items-center rounded-2xl border border-white/10 bg-[#0a0e18]/85 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
          Fitting elasticity for {sku} · {storeId}…
        </div>
      </div>
    );
  }

  // ── 3. Slider range ───────────────────────────────────────────────────
  // Bounded by cost (if known) on the low end, and 2× the higher of
  // (observed-max, current price) on the high end. This keeps the
  // simulator focused on realistic territory.
  const sliderMin = Math.max(0.01, fit.cost ?? fit.observed_price_range.min * 0.5);
  const sliderMax = Math.max(fit.observed_price_range.max, fit.current_price) * 2;

  return (
    <Inner
      fit={fit}
      candidate={candidate}
      setCandidate={setCandidate}
      sliderMin={sliderMin}
      sliderMax={sliderMax}
      recommendedPrice={recommendedPrice}
      onClose={onClose}
      reduced={!!reduced}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────
// Inner — split out so hooks can rely on `fit` and `candidate` being set
// ────────────────────────────────────────────────────────────────────────

function Inner({
  fit,
  candidate,
  setCandidate,
  sliderMin,
  sliderMax,
  recommendedPrice,
  onClose,
  reduced,
}: {
  fit: Fit;
  candidate: number;
  setCandidate: (n: number) => void;
  sliderMin: number;
  sliderMax: number;
  recommendedPrice?: number;
  onClose?: () => void;
  reduced: boolean;
}) {
  // ── 4. Predictions at the candidate price ─────────────────────────────
  const predicted = useMemo(() => {
    const { beta, intercept, beta_se, n_observations, sufficient_data } = fit.elasticity;

    // Q = exp(α) · P^β  (constant-elasticity demand from the fit)
    const safePrice = Math.max(candidate, 0.0001);
    const expected = Math.exp(intercept) * Math.pow(safePrice, beta);

    // Confidence band: propagate β uncertainty into Q's exponent. Widen
    // further when candidate is outside the observed price range — the
    // model has no support out there and the user should see that.
    const logSafe = Math.log(safePrice);
    const beta_sigma = Math.max(beta_se, 0.0001);
    const out_of_range_factor =
      candidate < fit.observed_price_range.min
        ? 1 + (fit.observed_price_range.min - candidate) / Math.max(fit.observed_price_range.min, 0.01)
        : candidate > fit.observed_price_range.max
        ? 1 + (candidate - fit.observed_price_range.max) / Math.max(fit.observed_price_range.max, 0.01)
        : 1;
    const log_units_sigma = Math.abs(logSafe) * beta_sigma * out_of_range_factor;
    const units_low = expected * Math.exp(-log_units_sigma);
    const units_high = expected * Math.exp(log_units_sigma);

    const revenue = expected * candidate;
    const revenue_low = units_low * candidate;
    const revenue_high = units_high * candidate;

    const cost = fit.cost;
    const profit = cost !== null ? expected * (candidate - cost) : null;
    const profit_low = cost !== null ? units_low * (candidate - cost) : null;
    const profit_high = cost !== null ? units_high * (candidate - cost) : null;

    // Predicted at current price for delta comparisons
    const units_at_current = Math.exp(intercept) * Math.pow(fit.current_price, beta);
    const revenue_at_current = units_at_current * fit.current_price;
    const profit_at_current =
      cost !== null ? units_at_current * (fit.current_price - cost) : null;

    return {
      units: expected,
      units_low,
      units_high,
      revenue,
      revenue_low,
      revenue_high,
      profit,
      profit_low,
      profit_high,
      units_at_current,
      revenue_at_current,
      profit_at_current,
      enough_data: sufficient_data && n_observations >= 10,
    };
  }, [candidate, fit]);

  // ── 5. Constraint checks at the candidate price ───────────────────────
  const constraints = useMemo<ConstraintCheck[]>(() => {
    const out: ConstraintCheck[] = [];
    const { cost, competitor_price, is_kvi, is_perishable, days_to_deadline, current_price } = fit;

    // Cost floor (5% margin minimum)
    if (cost !== null) {
      const floor = cost * (1 + MIN_MARGIN_PCT);
      const fired = candidate < floor;
      out.push({
        code: "COST_FLOOR",
        label: "Cost + margin floor",
        fired,
        tone: fired ? "danger" : "ok",
        message: fired
          ? `Below ${money(floor)} — would force-clip to floor.`
          : `${(((candidate - cost) / cost) * 100).toFixed(0)}% margin`,
      });
    }

    // KVI lock (within ±1.5% of competitor)
    if (is_kvi && competitor_price && competitor_price > 0) {
      const upper = competitor_price * (1 + KVI_COMPETITOR_TOLERANCE);
      const lower = competitor_price * (1 - KVI_COMPETITOR_TOLERANCE);
      const fired = candidate > upper || candidate < lower;
      out.push({
        code: "KVI_LOCK",
        label: "KVI competitor lock",
        fired,
        tone: fired ? "warn" : "ok",
        message: fired
          ? `Must be ${money(lower)}–${money(upper)} (±${(KVI_COMPETITOR_TOLERANCE * 100).toFixed(1)}%)`
          : `Within ±${(KVI_COMPETITOR_TOLERANCE * 100).toFixed(1)}% of competitor ${money(competitor_price)}`,
      });
    } else if (competitor_price && competitor_price > 0) {
      // Competitor ceiling for non-KVI
      const ceiling = competitor_price * (1 + COMPETITOR_CEILING_PCT);
      const fired = candidate > ceiling;
      out.push({
        code: "COMPETITOR_CEILING",
        label: "Competitor ceiling",
        fired,
        tone: fired ? "warn" : "ok",
        message: fired
          ? `Above ${(COMPETITOR_CEILING_PCT * 100).toFixed(0)}% over competitor ${money(competitor_price)}`
          : `Within ${(COMPETITOR_CEILING_PCT * 100).toFixed(0)}% of competitor ${money(competitor_price)}`,
      });
    }

    // Shock cap (±25% of current)
    const shock_upper = current_price * (1 + SHOCK_CAP_PCT);
    const shock_lower = current_price * (1 - SHOCK_CAP_PCT);
    const shock_fired = candidate > shock_upper || candidate < shock_lower;
    out.push({
      code: "SHOCK_CAP",
      label: "Shopper-shock cap",
      fired: shock_fired,
      tone: shock_fired ? "warn" : "ok",
      message: shock_fired
        ? `Move > ${(SHOCK_CAP_PCT * 100).toFixed(0)}% from current ${money(current_price)}`
        : `Within ±${(SHOCK_CAP_PCT * 100).toFixed(0)}% of current ${money(current_price)}`,
    });

    // Perishable urgency (deadline <= 2 days → force markdown 30%)
    if (is_perishable && days_to_deadline !== null && days_to_deadline <= 2) {
      const forced = current_price * (1 - PERISHABLE_MARKDOWN_PCT);
      const fired = candidate > forced;
      out.push({
        code: "PERISHABLE_URGENCY",
        label: "Perishable urgency",
        fired,
        tone: fired ? "danger" : "ok",
        message: fired
          ? `Deadline ${days_to_deadline}d — markdown to ≤ ${money(forced)} required`
          : `At or below required markdown ${money(forced)}`,
      });
    }

    return out;
  }, [candidate, fit]);

  // ── 6. Render ────────────────────────────────────────────────────────
  const change_pct = ((candidate - fit.current_price) / fit.current_price) * 100;
  const outside_observed =
    candidate < fit.observed_price_range.min || candidate > fit.observed_price_range.max;
  const veblen = fit.elasticity.beta >= 0;

  return (
    <motion.section
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE.outQuart }}
      className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a0e18] via-[#0a0e18] to-[#0c1018]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/[.06] px-6 py-5">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-orange-300">
            <Sparkles className="h-3 w-3" /> What-if simulator
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">{fit.product_name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className="mono">{fit.sku}</span> · {fit.store_id} · live model
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close simulator"
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Empty / Veblen banner */}
      {(!predicted.enough_data || veblen) && (
        <div
          className={clsx(
            "border-b px-6 py-3 text-xs",
            veblen
              ? "border-amber-500/25 bg-amber-500/[.05] text-amber-200"
              : "border-amber-500/20 bg-amber-500/[.03] text-amber-200/80",
          )}
        >
          <CircleAlert className="mr-2 inline h-3.5 w-3.5" />
          {veblen ? (
            <>
              Estimated elasticity is positive (β = {fit.elasticity.beta.toFixed(2)}) — either a Veblen
              good or contaminated data. Treat predictions as illustrative only.
            </>
          ) : (
            <>
              Limited history ({fit.elasticity.n_observations} observations) — predictions have wide
              confidence bands. Use the simulator to explore, not to commit.
            </>
          )}
        </div>
      )}

      {/* Slider section */}
      <div className="px-6 pt-6">
        <PriceSlider
          min={sliderMin}
          max={sliderMax}
          value={candidate}
          onChange={setCandidate}
          marks={[
            ...(fit.cost !== null
              ? [{ value: fit.cost, label: `cost ${money(fit.cost)}`, tone: "rose" as const }]
              : []),
            { value: fit.current_price, label: `current ${money(fit.current_price)}`, tone: "neutral" as const },
            ...(recommendedPrice && Math.abs(recommendedPrice - fit.current_price) > 0.005
              ? [{ value: recommendedPrice, label: `engine ${money(recommendedPrice)}`, tone: "violet" as const }]
              : []),
            ...(fit.competitor_price
              ? [{ value: fit.competitor_price, label: `competitor ${money(fit.competitor_price)}`, tone: "emerald" as const }]
              : []),
          ]}
          reduced={reduced}
        />

        {/* Candidate readout */}
        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">
              Candidate price
            </div>
            <AnimatedNumber
              value={candidate}
              format={(v) => money(v)}
              className="mt-1 text-5xl font-bold tabular-nums text-white"
            />
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">
              vs current {money(fit.current_price)}
            </div>
            <div
              className={clsx(
                "mt-1 inline-flex items-center gap-1 text-2xl font-semibold tabular-nums",
                Math.abs(change_pct) < 0.5
                  ? "text-slate-400"
                  : change_pct > 0
                  ? "text-orange-300"
                  : "text-emerald-300",
              )}
            >
              {Math.abs(change_pct) < 0.5 ? (
                <Minus className="h-4 w-4" />
              ) : change_pct > 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {change_pct >= 0 ? "+" : ""}
              {change_pct.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-1 gap-3 px-6 pt-6 sm:grid-cols-3">
        <MetricTile
          label="Predicted units / period"
          value={predicted.units}
          low={predicted.units_low}
          high={predicted.units_high}
          baseline={predicted.units_at_current}
          formatter={(v) => v.toFixed(1)}
          deltaLabel="vs current units"
          accentInverted // fewer units = bad
        />
        <MetricTile
          label="Expected revenue"
          value={predicted.revenue}
          low={predicted.revenue_low}
          high={predicted.revenue_high}
          baseline={predicted.revenue_at_current}
          formatter={(v) => money(v)}
          deltaLabel="vs current revenue"
        />
        <MetricTile
          label="Expected profit"
          value={predicted.profit}
          low={predicted.profit_low}
          high={predicted.profit_high}
          baseline={predicted.profit_at_current}
          formatter={(v) => money(v)}
          deltaLabel="vs current profit"
          unavailableNote={fit.cost === null ? "no cost on file" : undefined}
        />
      </div>

      {/* Constraints + Fit summary */}
      <div className="grid grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Constraints panel */}
        <div className="rounded-2xl border border-white/[.06] bg-white/[.015] p-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-400">
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            Would-fire constraints
          </div>
          <ul className="space-y-2">
            {constraints.map((c) => (
              <ConstraintRow key={c.code} c={c} reduced={reduced} />
            ))}
            {constraints.length === 0 && (
              <li className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">
                No constraint inputs available (no cost, no competitor price, not KVI/perishable).
              </li>
            )}
          </ul>
        </div>

        {/* Fit summary */}
        <div className="rounded-2xl border border-white/[.06] bg-white/[.015] p-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-400">
            <Sparkles className="h-3 w-3 text-violet-300" />
            Elasticity fit
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <FitStat label="β (elasticity)" value={`${fit.elasticity.beta.toFixed(2)} ± ${fit.elasticity.beta_se.toFixed(2)}`} />
            <FitStat
              label="95% CI"
              value={`[${fit.elasticity.beta_ci_low.toFixed(2)}, ${fit.elasticity.beta_ci_high.toFixed(2)}]`}
            />
            <FitStat label="R²" value={fit.elasticity.r_squared.toFixed(2)} />
            <FitStat label="Observations" value={String(fit.elasticity.n_observations)} />
            <FitStat
              label="Observed range"
              value={`${money(fit.observed_price_range.min)} – ${money(fit.observed_price_range.max)}`}
            />
            <FitStat
              label="Regime"
              value={
                fit.elasticity.is_elastic
                  ? "Elastic (β < −1)"
                  : fit.elasticity.is_inelastic
                  ? "Inelastic (−1 < β < 0)"
                  : "Anomalous"
              }
            />
          </div>
          {outside_observed && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[.04] px-3 py-2 text-[11px] text-amber-200">
              <CircleAlert className="mr-1 inline h-3 w-3" />
              Candidate price is outside the observed range ({money(fit.observed_price_range.min)}–
              {money(fit.observed_price_range.max)}). Confidence band is widened accordingly.
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

function PriceSlider({
  min,
  max,
  value,
  onChange,
  marks,
  reduced,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  marks: { value: number; label: string; tone: "rose" | "neutral" | "violet" | "emerald" }[];
  reduced: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Convert price ↔ percent
  const toPct = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const fromPct = (pct: number) => min + (max - min) * (Math.max(0, Math.min(100, pct)) / 100);

  // ── Pointer drag handling ──────────────────────────────────────────
  const updateFromPointer = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    const raw = fromPct(pct);
    // Snap to cents
    onChange(Math.round(raw * 100) / 100);
  };

  const startDrag = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.10 : 0.01;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(min, Math.round((value - step) * 100) / 100));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(max, Math.round((value + step) * 100) / 100));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(min);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(max);
    }
  };

  const valuePct = toPct(value);

  const toneClass = {
    rose: "bg-rose-400",
    neutral: "bg-slate-400",
    violet: "bg-violet-400",
    emerald: "bg-emerald-400",
  };

  return (
    <div className="select-none">
      {/* Mark labels on top */}
      <div className="relative mb-4 h-4">
        {marks.map((m) => {
          const pct = toPct(m.value);
          return (
            <div
              key={`${m.label}-${m.value}`}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium uppercase tracking-[.18em] text-slate-500"
              style={{ left: `${pct}%` }}
            >
              {m.label}
            </div>
          );
        })}
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label="Candidate price"
        onPointerDown={startDrag}
        onPointerMove={(e) => {
          if (e.buttons === 1) updateFromPointer(e.clientX);
        }}
        onKeyDown={handleKey}
        className="relative h-12 cursor-pointer focus:outline-none"
      >
        {/* Track */}
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/5">
          {/* Fill from min to value */}
          <motion.div
            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-orange-400/40 via-orange-400 to-orange-300"
            initial={false}
            animate={{ width: `${valuePct}%` }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 28 }}
          />
        </div>

        {/* Mark ticks */}
        {marks.map((m) => {
          const pct = toPct(m.value);
          return (
            <div
              key={`tick-${m.label}-${m.value}`}
              className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${pct}%` }}
            >
              <div className={clsx("h-full w-full rounded-full", toneClass[m.tone])} />
            </div>
          );
        })}

        {/* Thumb */}
        <motion.div
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orange-300 bg-[#0a0e18] shadow-[0_0_0_4px_rgba(251,146,60,0.15)]"
          initial={false}
          animate={{ left: `${valuePct}%` }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 26 }}
        />
      </div>

      {/* Range labels */}
      <div className="mt-2 flex justify-between text-[10px] font-mono text-slate-500">
        <span>{money(min)}</span>
        <span>{money(max)}</span>
      </div>
    </div>
  );
}

function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(value);
  const display = useTransform(motionValue, (v) => format(v));
  const [rendered, setRendered] = useState(format(value));

  useEffect(() => {
    if (reduced) {
      motionValue.set(value);
      setRendered(format(value));
      return;
    }
    const controls = animate(motionValue, value, {
      duration: 0.32,
      ease: EASE.outQuart,
      onUpdate: (latest) => setRendered(format(latest)),
    });
    return () => controls.stop();
  }, [value, reduced, motionValue, format]);

  return <div className={className}>{rendered}</div>;
}

function MetricTile({
  label,
  value,
  low,
  high,
  baseline,
  formatter,
  deltaLabel,
  unavailableNote,
  accentInverted,
}: {
  label: string;
  value: number | null;
  low: number | null;
  high: number | null;
  baseline: number | null;
  formatter: (v: number) => string;
  deltaLabel: string;
  unavailableNote?: string;
  accentInverted?: boolean;
}) {
  if (value === null) {
    return (
      <div className="rounded-2xl border border-white/[.06] bg-white/[.015] p-5">
        <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">
          {label}
        </div>
        <div className="mt-2 text-3xl font-bold tabular-nums text-slate-600">—</div>
        {unavailableNote && (
          <div className="mt-2 text-[11px] text-slate-500">{unavailableNote}</div>
        )}
      </div>
    );
  }

  const delta = baseline !== null && baseline !== 0 ? ((value - baseline) / Math.abs(baseline)) * 100 : 0;
  const positive = delta > 0;
  const negligible = Math.abs(delta) < 0.5;
  // For "units" we want positive delta to look bad if accentInverted is set;
  // for revenue/profit, positive delta is good.
  const isGood = accentInverted ? !positive && !negligible : positive && !negligible;
  const isBad = accentInverted ? positive && !negligible : !positive && !negligible;

  return (
    <div className="rounded-2xl border border-white/[.06] bg-white/[.015] p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">
        {label}
      </div>
      <AnimatedNumber
        value={value}
        format={formatter}
        className="mt-2 text-3xl font-bold tabular-nums text-white"
      />
      {low !== null && high !== null && (
        <div className="mt-1 text-[11px] font-mono text-slate-500">
          {formatter(low)} – {formatter(high)}
        </div>
      )}
      <div
        className={clsx(
          "mt-2 inline-flex items-center gap-1 text-xs font-medium",
          negligible && "text-slate-500",
          isGood && "text-emerald-300",
          isBad && "text-rose-300",
        )}
      >
        {negligible ? (
          <Minus className="h-3 w-3" />
        ) : positive ? (
          <TrendingUp className="h-3 w-3" />
        ) : (
          <TrendingDown className="h-3 w-3" />
        )}
        {delta >= 0 ? "+" : ""}
        {delta.toFixed(1)}% {deltaLabel}
      </div>
    </div>
  );
}

function ConstraintRow({ c, reduced }: { c: ConstraintCheck; reduced: boolean }) {
  const toneStyle = c.fired
    ? c.tone === "danger"
      ? "border-rose-500/40 bg-rose-500/[.06] text-rose-200"
      : "border-amber-500/40 bg-amber-500/[.06] text-amber-200"
    : "border-emerald-500/20 bg-emerald-500/[.04] text-emerald-200";
  return (
    <motion.li
      layout={!reduced}
      transition={reduced ? { duration: 0 } : { duration: 0.28, ease: EASE.outQuart }}
      className={clsx(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
        toneStyle,
      )}
    >
      <span className="mt-0.5 flex h-4 w-4 items-center justify-center">
        {c.fired ? (
          <CircleAlert className="h-3.5 w-3.5" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{c.label}</div>
        {c.message && (
          <div className="mt-0.5 text-[11px] opacity-80">{c.message}</div>
        )}
      </div>
    </motion.li>
  );
}

function FitStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[.18em] text-slate-500">{label}</div>
      <div className="mono mt-0.5 text-sm text-slate-200">{value}</div>
    </div>
  );
}
