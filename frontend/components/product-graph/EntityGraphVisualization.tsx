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
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { Layers, Check, X as XIcon } from "lucide-react";
import { EASE } from "@/lib/motion";
import { money } from "@/lib/format";

interface SKU {
  sku: string;
  zone_id: string | null;
}

interface MatchSignals {
  title_sim: number | null;
  brand_match: boolean | null;
  unit_size_match: boolean | null;
  category_match: boolean | null;
}

interface CompetitorObservation {
  source: string;             // really the competitor_product_id; we group by inferred source
  source_id?: string | null;
  competitor_title?: string | null;
  competitor_category?: string | null;
  price: number;
  currency: string;
  zone_id: string | null;
  store_id: string | null;
  observed_at: string;
  delta_pct: number | null;
  match_score?: number | null;
  match_signals?: MatchSignals;
}

interface Props {
  entity: {
    canonical_title: string;
    brand: string | null;
    unit_size: string | null;
    is_manual: boolean;
    category_name?: string | null;
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

  // Build a lookup of hover-ids → tooltip payload. The same id keys both
  // the satellite node and its edge, so hovering either reveals the
  // match-reason card. We position tooltips at the satellite's pixel
  // location (the data-rich end of the edge) and let the card overflow
  // toward the center.
  const tooltipById = useMemo(() => {
    const map: Record<
      string,
      {
        kind: "sku" | "competitor";
        x: number; // svg-space anchor x
        y: number; // svg-space anchor y
        side: "left" | "right";
        sku?: SKU;
        observation?: CompetitorObservation;
      }
    > = {};
    linkedSkus.forEach((sku, i) => {
      const id = `sku-${sku.sku}-${sku.zone_id ?? "all"}`;
      map[id] = { kind: "sku", x: LEFT_X, y: skuPositions[i], side: "left", sku };
    });
    sources.forEach((src, i) => {
      const id = `src-${src.source}`;
      map[id] = {
        kind: "competitor",
        x: RIGHT_X,
        y: sourcePositions[i],
        side: "right",
        observation: src,
      };
    });
    return map;
  }, [linkedSkus, sources, skuPositions, sourcePositions]);

  const hoveredTooltip = hovered ? tooltipById[hovered] : null;

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

      <div className="relative">
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

      {/* HTML overlay: match-reason tooltip card. Positioned in viewBox-%
          space so it tracks the SVG at any width. Pointer-events disabled
          so it never interferes with hover. */}
      <AnimatePresence>
        {hoveredTooltip && (
          <MatchReasonCard
            key={hovered}
            tooltip={hoveredTooltip}
            entity={entity}
            reduced={reduced}
          />
        )}
      </AnimatePresence>
      </div>

      {/* Hint copy — discoverable without being intrusive */}
      {!isEmpty && (
        <p className="mt-2 text-[10px] text-slate-600">
          Hover any satellite to see the match signals that produced its link.
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Match-reason tooltip card
// ────────────────────────────────────────────────────────────────────────

function MatchReasonCard({
  tooltip,
  entity,
  reduced,
}: {
  tooltip: {
    kind: "sku" | "competitor";
    x: number;
    y: number;
    side: "left" | "right";
    sku?: SKU;
    observation?: CompetitorObservation;
  };
  entity: Props["entity"];
  reduced: boolean;
}) {
  // Convert SVG coords → percentage of the wrapper. The card sits just
  // inside the satellite, pointing toward the center.
  const left = (tooltip.x / WIDTH) * 100;
  const top = (tooltip.y / HEIGHT) * 100;
  const placement = tooltip.side === "left" ? "left" : "right";

  // Build the body
  let body: React.ReactNode = null;

  if (tooltip.kind === "sku" && tooltip.sku) {
    body = (
      <SkuReasonBody sku={tooltip.sku} />
    );
  } else if (tooltip.kind === "competitor" && tooltip.observation) {
    body = (
      <CompetitorReasonBody
        observation={tooltip.observation}
        entityTitle={entity.canonical_title}
      />
    );
  }

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -2 }}
      transition={reduced ? { duration: 0 } : { duration: 0.12, ease: EASE.outQuart }}
      className={clsx(
        "pointer-events-none absolute z-10 w-[270px] rounded-xl border border-white/10 bg-[#0a0e18]/95 p-3 shadow-2xl backdrop-blur-sm",
        placement === "left" ? "translate-x-4" : "-translate-x-[calc(100%+1rem)]",
      )}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        marginTop: "-2.5rem",
      }}
    >
      {body}
    </motion.div>
  );
}

function SkuReasonBody({ sku }: { sku: SKU }) {
  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-[.22em] text-orange-300">
          Internal SKU link
        </span>
      </div>
      <div className="mono text-[11px] text-white">{sku.sku}</div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
        <SignalRow label="Link type" value="Explicit" yes />
        <SignalRow label="Zone scope" value={sku.zone_id ?? "all zones"} yes />
      </div>
      <div className="mt-2 border-t border-white/5 pt-2 text-[10px] leading-relaxed text-slate-500">
        SKU&nbsp;→&nbsp;entity links are exact registrations — no fuzzy
        matching. Owned by the merchandising taxonomy.
      </div>
    </>
  );
}

function CompetitorReasonBody({
  observation,
  entityTitle,
}: {
  observation: CompetitorObservation;
  entityTitle: string;
}) {
  const sig = observation.match_signals;
  const titleSimPct = sig?.title_sim != null ? Math.round(sig.title_sim * 100) : null;
  const overallPct =
    observation.match_score != null
      ? Math.round(observation.match_score * 100)
      : titleSimPct;

  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-[.22em] text-emerald-300">
          Match reason
        </span>
        {overallPct != null && (
          <span className="mono rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200">
            {overallPct}% match
          </span>
        )}
      </div>

      <div className="text-[11px] text-white truncate" title={observation.competitor_title ?? observation.source}>
        {observation.competitor_title ?? observation.source}
      </div>
      <div className="mt-0.5 text-[9px] text-slate-500 truncate">
        vs <span className="text-slate-400">{entityTitle}</span>
      </div>

      <div className="mt-2 space-y-1 text-[10px]">
        {titleSimPct != null && (
          <SignalRow
            label="Title similarity"
            value={`${titleSimPct}%`}
            yes={titleSimPct >= 70}
            partial={titleSimPct >= 50 && titleSimPct < 70}
          />
        )}
        <SignalRow
          label="Brand"
          value={sig?.brand_match ? "matched" : "—"}
          yes={!!sig?.brand_match}
        />
        <SignalRow
          label="Unit size"
          value={sig?.unit_size_match ? "matched" : "—"}
          yes={!!sig?.unit_size_match}
        />
        <SignalRow
          label="Category"
          value={sig?.category_match ? "matched" : "—"}
          yes={!!sig?.category_match}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/5 pt-2 text-[10px]">
        <span className="text-slate-500">
          {observation.source_id ?? "competitor"}
        </span>
        <span className="mono tabular-nums text-slate-300">
          {money(observation.price)}
          {observation.delta_pct != null && (
            <span
              className={clsx(
                "ml-1.5",
                observation.delta_pct > 0 ? "text-rose-300" : "text-emerald-300",
              )}
            >
              {observation.delta_pct > 0 ? "+" : ""}
              {observation.delta_pct.toFixed(1)}%
            </span>
          )}
        </span>
      </div>
    </>
  );
}

function SignalRow({
  label,
  value,
  yes,
  partial,
}: {
  label: string;
  value: string;
  yes?: boolean;
  partial?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-slate-500">
        {yes ? (
          <Check className="h-2.5 w-2.5 text-emerald-400" />
        ) : partial ? (
          <Check className="h-2.5 w-2.5 text-amber-400" />
        ) : (
          <XIcon className="h-2.5 w-2.5 text-slate-600" />
        )}
        {label}
      </span>
      <span
        className={clsx(
          "mono text-[10px]",
          yes ? "text-emerald-200" : partial ? "text-amber-200" : "text-slate-500",
        )}
      >
        {value}
      </span>
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
