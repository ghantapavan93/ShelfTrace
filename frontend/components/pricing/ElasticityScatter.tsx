"use client";

/**
 * ElasticityScatter — the picture behind β.
 *
 * Renders the historical (price, units) observations the OLS log-log
 * regression actually consumed, the fitted line Q = exp(α) · P^β through
 * those dots, the 95% CI band around the line, and a marker at the
 * candidate price. A data scientist looking at this should be able to
 * judge the fit's credibility in five seconds — without us writing a
 * paragraph of prose underneath the number.
 *
 * The chart axes are LINEAR (price on x, units on y), not log-log, even
 * though the regression is in log space. Linear axes are what humans
 * read prices and units in. The fitted curve appears as a curve, not a
 * straight line, which is honest: a constant-elasticity model is a
 * power law in raw space.
 *
 * Promotional observations are dimmed because they were excluded from
 * the fit — showing them anyway makes the exclusion visible rather
 * than mysterious.
 */

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { money } from "@/lib/format";

const W = 520;
const H = 220;
const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 14;
const PAD_B = 32;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;
const Z_95 = 1.96;

interface Observation {
  price: number;
  units: number;
  on_promotion: boolean;
}

interface Props {
  observations: Observation[];
  fit: {
    beta: number;
    intercept: number;
    beta_se: number;
    r_squared: number;
    n_observations: number;
    sufficient_data: boolean;
  };
  observedRange: { min: number; max: number };
  candidatePrice: number;
  currentPrice: number;
}

export function ElasticityScatter({
  observations,
  fit,
  observedRange,
  candidatePrice,
  currentPrice,
}: Props) {
  const reduced = !!useReducedMotion();

  const { xMin, xMax, yMin, yMax, dots, curve, bandTop, bandBot, fitOk } = useMemo(
    () =>
      computeScales({
        observations,
        fit,
        observedRange,
        candidatePrice,
        currentPrice,
      }),
    [observations, fit, observedRange, candidatePrice, currentPrice],
  );

  const x = (p: number) => PAD_L + ((p - xMin) / (xMax - xMin || 1)) * INNER_W;
  const y = (u: number) => PAD_T + INNER_H - ((u - yMin) / (yMax - yMin || 1)) * INNER_H;

  const xTicks = niceTicks(xMin, xMax, 4);
  const yTicks = niceTicks(yMin, yMax, 4);

  // Build SVG paths once positions are known
  const curvePath = curve.length
    ? "M " + curve.map((pt) => `${x(pt.p).toFixed(2)},${y(pt.q).toFixed(2)}`).join(" L ")
    : "";
  const bandPath =
    bandTop.length && bandBot.length
      ? "M " +
        bandTop.map((pt) => `${x(pt.p).toFixed(2)},${y(pt.q).toFixed(2)}`).join(" L ") +
        " L " +
        [...bandBot]
          .reverse()
          .map((pt) => `${x(pt.p).toFixed(2)},${y(pt.q).toFixed(2)}`)
          .join(" L ") +
        " Z"
      : "";

  // Candidate marker geometry — only render if within axis range
  const candidateInRange = candidatePrice >= xMin && candidatePrice <= xMax;
  const candidateUnits = Math.exp(fit.intercept + fit.beta * Math.log(Math.max(candidatePrice, 0.0001)));
  const candidateInUnits = candidateUnits >= yMin * 0.95 && candidateUnits <= yMax * 1.05;

  const promoCount = observations.filter((o) => o.on_promotion).length;
  const fittedCount = observations.length - promoCount;

  return (
    <div className="rounded-2xl border border-white/[.06] bg-white/[.015] p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-400">
          <span className="inline-block h-2 w-2 rounded-full bg-violet-400" />
          Regression fit · price vs units
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono uppercase tracking-[.18em] text-slate-500">
          <span>R² {fit.r_squared.toFixed(2)}</span>
          <span>n {fittedCount}{promoCount > 0 && <span className="text-slate-600"> · {promoCount} promo excl.</span>}</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Scatter of historical price vs units with fitted regression line, β = ${fit.beta.toFixed(2)}`}
      >
        {/* Axes */}
        <line x1={PAD_L} y1={PAD_T + INNER_H} x2={PAD_L + INNER_W} y2={PAD_T + INNER_H} stroke="rgba(255,255,255,.08)" strokeWidth={0.6} />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + INNER_H} stroke="rgba(255,255,255,.08)" strokeWidth={0.6} />

        {/* Y gridlines + ticks */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line
              x1={PAD_L}
              x2={PAD_L + INNER_W}
              y1={y(t)}
              y2={y(t)}
              stroke="rgba(255,255,255,.04)"
              strokeWidth={0.5}
            />
            <text
              x={PAD_L - 6}
              y={y(t) + 3}
              fontSize="9"
              textAnchor="end"
              fill="rgba(255,255,255,.4)"
              fontFamily="ui-monospace, monospace"
            >
              {formatUnits(t)}
            </text>
          </g>
        ))}

        {/* X gridlines + ticks */}
        {xTicks.map((t) => (
          <g key={`x-${t}`}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={PAD_T}
              y2={PAD_T + INNER_H}
              stroke="rgba(255,255,255,.04)"
              strokeWidth={0.5}
            />
            <text
              x={x(t)}
              y={PAD_T + INNER_H + 14}
              fontSize="9"
              textAnchor="middle"
              fill="rgba(255,255,255,.4)"
              fontFamily="ui-monospace, monospace"
            >
              {money(t)}
            </text>
          </g>
        ))}

        {/* Axis labels */}
        <text
          x={PAD_L + INNER_W / 2}
          y={H - 4}
          fontSize="9"
          textAnchor="middle"
          fill="rgba(255,255,255,.35)"
          fontFamily="ui-sans-serif, system-ui"
          letterSpacing="0.15em"
        >
          PRICE
        </text>
        <text
          transform={`translate(11, ${PAD_T + INNER_H / 2}) rotate(-90)`}
          fontSize="9"
          textAnchor="middle"
          fill="rgba(255,255,255,.35)"
          fontFamily="ui-sans-serif, system-ui"
          letterSpacing="0.15em"
        >
          UNITS
        </text>

        {/* Observed-range bracket on the X axis */}
        {fitOk && (
          <g>
            <line
              x1={x(observedRange.min)}
              x2={x(observedRange.max)}
              y1={PAD_T + INNER_H + 4}
              y2={PAD_T + INNER_H + 4}
              stroke="rgba(167,139,250,.4)"
              strokeWidth={1.5}
            />
            <line
              x1={x(observedRange.min)}
              x2={x(observedRange.min)}
              y1={PAD_T + INNER_H + 1}
              y2={PAD_T + INNER_H + 7}
              stroke="rgba(167,139,250,.4)"
              strokeWidth={1}
            />
            <line
              x1={x(observedRange.max)}
              x2={x(observedRange.max)}
              y1={PAD_T + INNER_H + 1}
              y2={PAD_T + INNER_H + 7}
              stroke="rgba(167,139,250,.4)"
              strokeWidth={1}
            />
          </g>
        )}

        {/* 95% confidence band */}
        {fitOk && bandPath && (
          <motion.path
            d={bandPath}
            fill="rgba(167,139,250,.10)"
            stroke="none"
            initial={reduced ? { opacity: 0.9 } : { opacity: 0 }}
            animate={{ opacity: 0.9 }}
            transition={reduced ? { duration: 0 } : { duration: 0.5, delay: 0.1, ease: EASE.outQuart }}
          />
        )}

        {/* Fitted curve */}
        {fitOk && curvePath && (
          <motion.path
            d={curvePath}
            stroke="#a78bfa"
            strokeWidth={1.4}
            fill="none"
            strokeLinecap="round"
            initial={reduced ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE.outQuart, delay: 0.15 }}
          />
        )}

        {/* Observations — dots */}
        {dots.map((d, i) => (
          <motion.circle
            key={i}
            cx={x(d.p)}
            cy={y(d.q)}
            r={d.on_promotion ? 2 : 2.4}
            fill={d.on_promotion ? "rgba(255,255,255,.18)" : "rgba(251,146,60,.85)"}
            stroke={d.on_promotion ? "rgba(255,255,255,.25)" : "rgba(251,146,60,1)"}
            strokeWidth={0.6}
            initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: d.on_promotion ? 0.4 : 0.85, scale: 1 }}
            transition={
              reduced
                ? { duration: 0 }
                : {
                    duration: 0.3,
                    ease: EASE.outQuart,
                    delay: 0.4 + (i / Math.max(dots.length, 1)) * 0.35,
                  }
            }
          >
            <title>
              {money(d.p)} → {d.q.toFixed(0)} units{d.on_promotion ? " · promo (excluded from fit)" : ""}
            </title>
          </motion.circle>
        ))}

        {/* Current price reference (faint vertical) */}
        {currentPrice >= xMin && currentPrice <= xMax && (
          <line
            x1={x(currentPrice)}
            x2={x(currentPrice)}
            y1={PAD_T}
            y2={PAD_T + INNER_H}
            stroke="rgba(255,255,255,.18)"
            strokeWidth={0.6}
            strokeDasharray="2 3"
          />
        )}

        {/* Candidate marker */}
        {candidateInRange && candidateInUnits && fitOk && (
          <motion.g
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <line
              x1={x(candidatePrice)}
              x2={x(candidatePrice)}
              y1={PAD_T}
              y2={PAD_T + INNER_H}
              stroke="rgba(251,146,60,.4)"
              strokeWidth={0.8}
              strokeDasharray="3 3"
            />
            <circle
              cx={x(candidatePrice)}
              cy={y(candidateUnits)}
              r={4.5}
              fill="rgba(251,146,60,1)"
              stroke="#0a0e18"
              strokeWidth={1.5}
            />
            <circle
              cx={x(candidatePrice)}
              cy={y(candidateUnits)}
              r={8}
              fill="none"
              stroke="rgba(251,146,60,.5)"
              strokeWidth={0.8}
            />
          </motion.g>
        )}

        {/* Insufficient-data overlay */}
        {!fitOk && (
          <g>
            <rect
              x={PAD_L + 8}
              y={PAD_T + 8}
              width={INNER_W - 16}
              height={28}
              rx={6}
              fill="rgba(255,255,255,.03)"
              stroke="rgba(245,158,11,.4)"
              strokeWidth={0.6}
            />
            <text
              x={PAD_L + INNER_W / 2}
              y={PAD_T + 26}
              fontSize="11"
              textAnchor="middle"
              fill="rgba(245,158,11,.85)"
              fontFamily="ui-sans-serif, system-ui"
            >
              Not enough history to fit — showing observations only
            </text>
          </g>
        )}
      </svg>

      {/* Tiny legend strip */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
        <Legend dot="bg-orange-400" label="Observed (fitted)" />
        {promoCount > 0 && <Legend dot="bg-white/30" label="Promo (excluded)" />}
        {fitOk && <LegendLine color="#a78bfa" label="Q = exp(α) · P^β" />}
        {fitOk && <LegendSwatch color="rgba(167,139,250,.4)" label="95% CI band" />}
        {fitOk && candidateInRange && (
          <LegendDot color="rgba(251,146,60,1)" label="Candidate price" />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Compute everything pure: scales, fitted curve points, CI band.
// ────────────────────────────────────────────────────────────────────────

function computeScales({
  observations,
  fit,
  observedRange,
  candidatePrice,
  currentPrice,
}: {
  observations: Observation[];
  fit: Props["fit"];
  observedRange: Props["observedRange"];
  candidatePrice: number;
  currentPrice: number;
}) {
  const fitOk = fit.sufficient_data && fit.n_observations >= 10;

  // Axis bounds — driven by the data, but stretched a little to include
  // the candidate and current prices so they're never clipped.
  const pricesForRange = [
    ...observations.map((o) => o.price),
    candidatePrice,
    currentPrice,
    observedRange.min,
    observedRange.max,
  ].filter((p) => p > 0 && Number.isFinite(p));

  const unitsForRange = observations
    .map((o) => o.units)
    .filter((u) => u > 0 && Number.isFinite(u));

  const rawXMin = pricesForRange.length ? Math.min(...pricesForRange) : 0;
  const rawXMax = pricesForRange.length ? Math.max(...pricesForRange) : 1;
  const xPad = Math.max((rawXMax - rawXMin) * 0.06, 0.1);
  const xMin = Math.max(0.01, rawXMin - xPad);
  const xMax = rawXMax + xPad;

  // Sample the fitted curve across the axis range so the line shows the
  // power-law curvature, not a straight line. Also compute the upper/lower
  // bands at each sample using β ± 1.96·SE in log space.
  const curve: { p: number; q: number }[] = [];
  const bandTop: { p: number; q: number }[] = [];
  const bandBot: { p: number; q: number }[] = [];

  if (fitOk) {
    const STEPS = 64;
    const beta_se = Math.max(fit.beta_se, 0.0001);
    for (let i = 0; i <= STEPS; i++) {
      const p = xMin + (xMax - xMin) * (i / STEPS);
      if (p <= 0) continue;
      const logP = Math.log(p);
      const q = Math.exp(fit.intercept + fit.beta * logP);
      // Widen band when outside the observed range — same widening logic
      // as the predictions panel uses, so the picture and the numbers
      // agree.
      const out_factor =
        p < observedRange.min
          ? 1 + (observedRange.min - p) / Math.max(observedRange.min, 0.01)
          : p > observedRange.max
            ? 1 + (p - observedRange.max) / Math.max(observedRange.max, 0.01)
            : 1;
      const sigma = Math.abs(logP) * beta_se * out_factor * Z_95;
      const q_low = q * Math.exp(-sigma);
      const q_high = q * Math.exp(sigma);
      curve.push({ p, q });
      bandTop.push({ p, q: q_high });
      bandBot.push({ p, q: q_low });
    }
  }

  // Y bounds — use observation range, the curve, and the candidate marker.
  const fittedAtCandidate = Math.exp(
    fit.intercept + fit.beta * Math.log(Math.max(candidatePrice, 0.0001)),
  );
  const candidateY = fitOk && Number.isFinite(fittedAtCandidate) ? fittedAtCandidate : 0;

  const yPoints = [
    ...unitsForRange,
    ...(fitOk ? curve.map((c) => c.q) : []),
    ...(fitOk ? [candidateY] : []),
  ].filter((v) => v > 0 && Number.isFinite(v));

  const rawYMin = yPoints.length ? Math.min(...yPoints) : 0;
  const rawYMax = yPoints.length ? Math.max(...yPoints) : 1;
  // Clamp Y so an outlier prediction (e.g., candidate WAY outside the
  // observed range) doesn't squash the rest of the chart into one line.
  const yCap = unitsForRange.length ? Math.max(...unitsForRange) * 4 : rawYMax;
  const yMin = Math.max(0, rawYMin * 0.85);
  const yMax = Math.min(rawYMax, yCap) * 1.1;

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    dots: observations.map((o) => ({ p: o.price, q: o.units, on_promotion: o.on_promotion })),
    curve,
    bandTop,
    bandBot,
    fitOk,
  };
}

// ────────────────────────────────────────────────────────────────────────
// "Nice number" axis ticks — pick a clean step.
// ────────────────────────────────────────────────────────────────────────

function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const range = max - min;
  const rough = range / count;
  const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow10;
  let step: number;
  if (norm < 1.5) step = 1 * pow10;
  else if (norm < 3) step = 2 * pow10;
  else if (norm < 7) step = 5 * pow10;
  else step = 10 * pow10;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + step * 0.001; v += step) {
    ticks.push(Number(v.toFixed(6)));
    if (ticks.length > 8) break;
  }
  return ticks;
}

function formatUnits(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  if (n >= 100) return n.toFixed(0);
  return n.toFixed(0);
}

// ────────────────────────────────────────────────────────────────────────
// Legend bits
// ────────────────────────────────────────────────────────────────────────

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full ring-2 ring-[#0a0e18]"
        style={{ background: color, boxShadow: `0 0 0 1.5px ${color}` }}
      />
      {label}
    </span>
  );
}

function LegendLine({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono">
      <span className="inline-block h-px w-5" style={{ background: color }} />
      {label}
    </span>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-3 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
