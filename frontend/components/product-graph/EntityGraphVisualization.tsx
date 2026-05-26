"use client";

/**
 * EntityGraphVisualization — a small force-directed-style graph
 * showing how one canonical product entity unifies many internal SKUs
 * (left) with many competitor sources (right).
 *
 * The point: a founder hears "knowledge graph" and expects to SEE the
 * unification. A flat list undersells what's happening underneath. This
 * component renders the central canonical node and draws curved edges
 * out to the satellite SKU + competitor nodes, with match-score labels
 * on each edge.
 *
 * Interactions:
 *   • Each satellite node animates in (stagger)
 *   • Each edge animates its stroke pathLength from 0 → 1 (deferred so
 *     nodes land first)
 *   • Hovering a satellite node dims everything not directly connected
 *     to that node, and brightens the focused pair
 *   • Hovering the center node leaves everything bright
 *
 * Layout:
 *   • SVG viewBox 800×360
 *   • Center node at (400, 180)
 *   • SKU nodes laid out vertically on the left (x ≈ 80)
 *   • Competitor source nodes laid out vertically on the right (x ≈ 720)
 *   • Curved edges (cubic Béziers) so the graph reads as flowing, not
 *     mechanical
 *
 * Edge cases:
 *   • 0 SKUs or 0 competitor observations → renders the center alone
 *     with an inline empty-state pill
 *   • >6 SKUs or >6 sources → graph compresses vertical spacing
 *   • prefers-reduced-motion → static positions, no animation
 */

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { Layers } from "lucide-react";
import { EASE } from "@/lib/motion";
import { money } from "@/lib/format";

interface SKU {
  sku: string;
  zone_id: string | null;
}

interface CompetitorObservation {
  source: string;             // really the competitor_product_id; we group by inferred source
  price: number;
  currency: string;
  zone_id: string | null;
  store_id: string | null;
  observed_at: string;
  delta_pct: number | null;
}

interface Props {
  entity: {
    canonical_title: string;
    brand: string | null;
    unit_size: string | null;
    is_manual: boolean;
  };
  linkedSkus: SKU[];
  competitorObservations: CompetitorObservation[];
}

// ────────────────────────────────────────────────────────────────────────
// Layout constants
// ────────────────────────────────────────────────────────────────────────

const WIDTH = 800;
const HEIGHT = 360;
const CENTER_X = 400;
const CENTER_Y = 180;
const LEFT_X = 90;
const RIGHT_X = 710;
const NODE_R = 8;
const CENTER_R = 18;
const MAX_VERTICAL_SPAN = 280; // distance between top-most and bottom-most satellite

const COLOR_CENTER = "#a78bfa";       // violet — canonical entity
const COLOR_SKU = "#fb923c";          // orange — internal SKU
const COLOR_COMP_UP = "#f43f5e";      // rose — competitor priced ABOVE ours
const COLOR_COMP_DOWN = "#22c55e";    // emerald — competitor priced BELOW
const COLOR_EDGE = "rgba(148,163,184,.4)"; // slate-400 at 40%
const COLOR_DIM = "rgba(255,255,255,.06)";

const MONO = "ui-monospace, monospace";
const SANS = "ui-sans-serif, system-ui";

// ────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────

export function EntityGraphVisualization({ entity, linkedSkus, competitorObservations }: Props) {
  // useReducedMotion returns boolean | null; coerce so child components see a real boolean.
  const reduced = !!useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);

  // Deduplicate competitor observations by source (one node per source)
  const sources = useMemo(() => {
    const bySource: Record<string, CompetitorObservation> = {};
    for (const obs of competitorObservations) {
      // The detail endpoint exposes `source` as either the source_id or
      // the competitor_product_id. We dedupe by it directly.
      if (!bySource[obs.source]) bySource[obs.source] = obs;
    }
    return Object.values(bySource);
  }, [competitorObservations]);

  // Distribute satellites vertically around CENTER_Y
  const skuPositions = useMemo(
    () => distributeY(linkedSkus.length, CENTER_Y, MAX_VERTICAL_SPAN),
    [linkedSkus.length],
  );
  const sourcePositions = useMemo(
    () => distributeY(sources.length, CENTER_Y, MAX_VERTICAL_SPAN),
    [sources.length],
  );

  const isEmpty = linkedSkus.length === 0 && sources.length === 0;

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-[#0a0a14]/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-violet-300">
          <Layers className="h-3 w-3" /> Cross-source graph
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <Legend dotClass="bg-orange-400" label="Internal SKU" />
          <Legend dotClass="bg-violet-400" label="Canonical entity" />
          <Legend dotClass="bg-emerald-400" label="Competitor (lower)" />
          <Legend dotClass="bg-rose-400" label="Competitor (higher)" />
        </div>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Cross-source graph for ${entity.canonical_title}`}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Faint backdrop circle to anchor the eye */}
        <circle
          cx={CENTER_X}
          cy={CENTER_Y}
          r={140}
          fill="none"
          stroke="rgba(167,139,250,.08)"
          strokeWidth="0.5"
          strokeDasharray="2 4"
        />

        {/* ── Edges (drawn first, behind nodes) ───────────────────── */}
        {linkedSkus.map((sku, i) => {
          const id = `sku-${sku.sku}-${sku.zone_id ?? "all"}`;
          const pos = skuPositions[i];
          const dim = hovered !== null && hovered !== id;
          return (
            <Edge
              key={id}
              from={{ x: LEFT_X + NODE_R, y: pos }}
              to={{ x: CENTER_X - CENTER_R, y: CENTER_Y }}
              color={COLOR_SKU}
              dim={dim}
              delay={0.4 + i * 0.08}
              reduced={reduced}
              direction="ltr"
              labelText={sku.zone_id ?? "all zones"}
            />
          );
        })}

        {sources.map((src, i) => {
          const id = `src-${src.source}`;
          const pos = sourcePositions[i];
          const above = (src.delta_pct ?? 0) > 0;
          const color = above ? COLOR_COMP_UP : COLOR_COMP_DOWN;
          const dim = hovered !== null && hovered !== id;
          const deltaLabel =
            src.delta_pct != null
              ? `${src.delta_pct > 0 ? "+" : ""}${src.delta_pct.toFixed(1)}%`
              : "";
          return (
            <Edge
              key={id}
              from={{ x: CENTER_X + CENTER_R, y: CENTER_Y }}
              to={{ x: RIGHT_X - NODE_R, y: pos }}
              color={color}
              dim={dim}
              delay={0.55 + i * 0.08}
              reduced={reduced}
              direction="rtl"
              labelText={deltaLabel}
            />
          );
        })}

        {/* ── Central canonical entity node ───────────────────────── */}
        <CenterNode
          x={CENTER_X}
          y={CENTER_Y}
          title={entity.canonical_title}
          brand={entity.brand}
          unitSize={entity.unit_size}
          isManual={entity.is_manual}
          dimmed={false /* center never dims */}
          reduced={reduced}
        />

        {/* ── SKU satellite nodes ─────────────────────────────────── */}
        {linkedSkus.map((sku, i) => {
          const id = `sku-${sku.sku}-${sku.zone_id ?? "all"}`;
          const pos = skuPositions[i];
          const dim = hovered !== null && hovered !== id;
          return (
            <SatelliteNode
              key={id}
              id={id}
              x={LEFT_X}
              y={pos}
              color={COLOR_SKU}
              icon="sku"
              primary={sku.sku}
              secondary={sku.zone_id ?? "all zones"}
              dim={dim}
              delay={0.1 + i * 0.08}
              reduced={reduced}
              onHoverChange={setHovered}
              side="left"
            />
          );
        })}

        {/* ── Competitor source satellite nodes ───────────────────── */}
        {sources.map((src, i) => {
          const id = `src-${src.source}`;
          const pos = sourcePositions[i];
          const above = (src.delta_pct ?? 0) > 0;
          const color = above ? COLOR_COMP_UP : COLOR_COMP_DOWN;
          const dim = hovered !== null && hovered !== id;
          return (
            <SatelliteNode
              key={id}
              id={id}
              x={RIGHT_X}
              y={pos}
              color={color}
              icon="globe"
              primary={src.source}
              secondary={`${money(src.price)} ${src.currency}`}
              dim={dim}
              delay={0.25 + i * 0.08}
              reduced={reduced}
              onHoverChange={setHovered}
              side="right"
            />
          );
        })}

        {/* Empty-state callout */}
        {isEmpty && (
          <g>
            <rect
              x={CENTER_X - 140}
              y={CENTER_Y + 50}
              width="280"
              height="32"
              rx="6"
              fill="rgba(255,255,255,.03)"
              stroke="rgba(255,255,255,.08)"
              strokeWidth="0.5"
            />
            <text
              x={CENTER_X}
              y={CENTER_Y + 70}
              fontSize="11"
              textAnchor="middle"
              fill="rgba(255,255,255,.5)"
              fontFamily={SANS}
            >
              No SKUs or competitor sources linked yet
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

function CenterNode({
  x,
  y,
  title,
  brand,
  unitSize,
  isManual,
  dimmed,
  reduced,
}: {
  x: number;
  y: number;
  title: string;
  brand: string | null;
  unitSize: string | null;
  isManual: boolean;
  dimmed: boolean;
  reduced: boolean;
}) {
  const truncatedTitle = title.length > 32 ? title.slice(0, 30) + "…" : title;
  return (
    <motion.g
      initial={reduced ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: dimmed ? 0.35 : 1 }}
      transition={reduced ? { duration: 0 } : { duration: 0.55, ease: EASE.outQuart }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    >
      {/* Soft glow */}
      <circle cx={x} cy={y} r={CENTER_R + 12} fill="rgba(167,139,250,.07)" />
      {/* Pulse ring */}
      {!reduced && (
        <motion.circle
          cx={x}
          cy={y}
          r={CENTER_R}
          fill="none"
          stroke={COLOR_CENTER}
          strokeWidth="1"
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: [1, 1.6, 1.9], opacity: [0.6, 0.2, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 0.6, ease: EASE.outQuart }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}
      {/* Solid core */}
      <circle
        cx={x}
        cy={y}
        r={CENTER_R}
        fill="rgba(167,139,250,.18)"
        stroke={COLOR_CENTER}
        strokeWidth="1.5"
      />
      {/* Title */}
      <text
        x={x}
        y={y - CENTER_R - 16}
        fontSize="13"
        fontWeight="600"
        textAnchor="middle"
        fill="#fff"
        fontFamily={SANS}
      >
        {truncatedTitle}
      </text>
      {/* Manual badge */}
      {isManual && (
        <g>
          <rect
            x={x - 30}
            y={y - CENTER_R - 36}
            width="60"
            height="14"
            rx="3"
            fill="rgba(34,197,94,.12)"
            stroke="rgba(34,197,94,.4)"
            strokeWidth="0.5"
          />
          <text
            x={x}
            y={y - CENTER_R - 26}
            fontSize="8"
            fontWeight="600"
            textAnchor="middle"
            fill="#86efac"
            fontFamily={MONO}
          >
            CURATED
          </text>
        </g>
      )}
      {/* Sub-line: brand / unit */}
      {(brand || unitSize) && (
        <text
          x={x}
          y={y + CENTER_R + 18}
          fontSize="10"
          textAnchor="middle"
          fill="rgba(255,255,255,.45)"
          fontFamily={MONO}
        >
          {[brand, unitSize].filter(Boolean).join(" · ")}
        </text>
      )}
    </motion.g>
  );
}

function SatelliteNode({
  id,
  x,
  y,
  color,
  icon,
  primary,
  secondary,
  dim,
  delay,
  reduced,
  onHoverChange,
  side,
}: {
  id: string;
  x: number;
  y: number;
  color: string;
  icon: "sku" | "globe";
  primary: string;
  secondary: string;
  dim: boolean;
  delay: number;
  reduced: boolean;
  onHoverChange: (id: string | null) => void;
  side: "left" | "right";
}) {
  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  return (
    <motion.g
      initial={reduced ? false : { opacity: 0, x: side === "left" ? -10 : 10 }}
      animate={{ opacity: dim ? 0.2 : 1, x: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.45, ease: EASE.outQuart, delay }}
      onMouseEnter={() => onHoverChange(id)}
      style={{ cursor: "pointer" }}
    >
      {/* Hit box (larger than visible node for easier hover) */}
      <rect
        x={side === "left" ? x - 88 : x - 12}
        y={y - 16}
        width="100"
        height="32"
        fill="transparent"
      />

      {/* Glow halo */}
      <circle cx={x} cy={y} r={NODE_R + 6} fill={color} opacity="0.08" />
      {/* Node circle */}
      <circle cx={x} cy={y} r={NODE_R} fill="rgba(20,24,36,1)" stroke={color} strokeWidth="1.5" />
      {/* Inner glyph */}
      {icon === "sku" ? (
        <text
          x={x}
          y={y + 3}
          fontSize="9"
          fontWeight="700"
          textAnchor="middle"
          fill={color}
          fontFamily={MONO}
        >
          #
        </text>
      ) : (
        <circle cx={x} cy={y} r="2.5" fill={color} />
      )}

      {/* Label */}
      <text
        x={side === "left" ? x - NODE_R - 8 : x + NODE_R + 8}
        y={y - 2}
        fontSize="10"
        fontWeight="600"
        textAnchor={side === "left" ? "end" : "start"}
        fill="#fff"
        fontFamily={MONO}
      >
        {truncate(primary, side === "left" ? 22 : 20)}
      </text>
      <text
        x={side === "left" ? x - NODE_R - 8 : x + NODE_R + 8}
        y={y + 10}
        fontSize="9"
        textAnchor={side === "left" ? "end" : "start"}
        fill="rgba(255,255,255,.45)"
        fontFamily={MONO}
      >
        {truncate(secondary, side === "left" ? 22 : 20)}
      </text>
    </motion.g>
  );
}

/** Curved edge with animated stroke length + label */
function Edge({
  from,
  to,
  color,
  dim,
  delay,
  reduced,
  direction,
  labelText,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  dim: boolean;
  delay: number;
  reduced: boolean;
  direction: "ltr" | "rtl";
  labelText: string;
}) {
  // Cubic Bezier with control points pulled toward center horizontally
  // so edges have a soft S-curve feel instead of straight lines.
  const dx = to.x - from.x;
  const controlOffset = dx * 0.5;
  const path = `M ${from.x},${from.y} C ${from.x + controlOffset},${from.y} ${to.x - controlOffset},${to.y} ${to.x},${to.y}`;

  // Midpoint of the curve for the label
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2 - 4;

  return (
    <motion.g
      initial={false}
      animate={{ opacity: dim ? 0.1 : 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.path
        d={path}
        stroke={dim ? COLOR_DIM : color}
        strokeWidth={dim ? 0.6 : 1.2}
        fill="none"
        strokeOpacity={dim ? 0.4 : 0.85}
        strokeLinecap="round"
        initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.7, ease: EASE.outQuart, delay }}
      />
      {labelText && !dim && (
        <motion.g
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.3, delay: delay + 0.5 }}
        >
          <rect
            x={midX - labelText.length * 3 - 4}
            y={midY - 8}
            width={labelText.length * 6 + 8}
            height="12"
            rx="3"
            fill="rgba(10,10,20,.9)"
            stroke={color}
            strokeOpacity="0.3"
            strokeWidth="0.5"
          />
          <text
            x={midX}
            y={midY}
            fontSize="8.5"
            fontWeight="600"
            textAnchor="middle"
            fill={color}
            fontFamily={MONO}
          >
            {labelText}
          </text>
        </motion.g>
      )}
    </motion.g>
  );
}

function Legend({ dotClass, label }: { dotClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("h-2 w-2 rounded-full", dotClass)} />
      {label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

/** Distribute N points vertically centered on centerY within ±maxSpan/2. */
function distributeY(n: number, centerY: number, maxSpan: number): number[] {
  if (n === 0) return [];
  if (n === 1) return [centerY];
  const span = Math.min(maxSpan, (n - 1) * 56);
  const top = centerY - span / 2;
  return Array.from({ length: n }, (_, i) => top + (span / (n - 1)) * i);
}
