"use client";

/**
 * AnimatedCapabilityVisuals — eight small operational animations that
 * sit inside each Connect-page capability tile.
 *
 * Each visual is built around ONE clear operational truth:
 *
 *   AnimatedCatalogGraph        — SKUs match across stores → "verified"
 *   AnimatedApprovalQueue       — pending → reviewed → approved → executing
 *   AnimatedMarginGuardrail     — cost rises, margin shrinks, guardrail caps it
 *   AnimatedInventoryAware      — stock drops, pricing action pauses on that store
 *   AnimatedCompetitorPulse     — competitor price observed, our gap recomputes
 *   AnimatedSubstitutionFlow    — primary unavailable, substitute lights up
 *   AnimatedPromotionalWindow   — event window opens, deadline counter pulses
 *   AnimatedApprovalPolicy      — operator badge gates expansion to allowed zones
 *
 * Reduced-motion: every visual renders a meaningful static end-state.
 * Animations only run while in viewport (whileInView) to keep the page
 * calm and battery friendly.
 *
 * Visual language matches the existing static mockups so this is a
 * drop-in replacement — same colors, same SVG viewport, same fonts.
 */

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";

const VIEWBOX = "0 0 200 80";

const COLORS = {
  panel: "#0e1320",
  panelStroke: "#1e293b",
  orange: "#fb923c",
  orangeSoft: "rgba(251,146,60,.18)",
  green: "#22c55e",
  greenSoft: "rgba(34,197,94,.18)",
  red: "#f43f5e",
  redSoft: "rgba(244,63,94,.18)",
  violet: "#a78bfa",
  violetSoft: "rgba(167,139,250,.18)",
  amber: "#f59e0b",
  amberSoft: "rgba(245,158,11,.18)",
  textMuted: "rgba(255,255,255,.45)",
  textDim: "rgba(255,255,255,.30)",
};

const MONO = "ui-monospace, monospace";
const SANS = "ui-sans-serif, system-ui";

/* ────────────────────────────────────────────────────────────────────────── */
/* 01. Product Catalog — three SKU rows match across stores                  */
/* ────────────────────────────────────────────────────────────────────────── */

export function AnimatedCatalogGraph() {
  const reduced = useReducedMotion();
  const rows = [
    { name: "MILK · 1gal", price: "$5.99" },
    { name: "EGGS · 12ct", price: "$4.19" },
    { name: "OJ · 52oz", price: "$6.79" },
  ];
  return (
    <svg viewBox={VIEWBOX} className="h-full w-full" role="img" aria-label="Catalog rows matching across stores">
      {/* left column: SKUs */}
      {rows.map((r, i) => (
        <motion.g
          key={`a-${i}`}
          initial={reduced ? false : { opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: false, margin: "-40px" }}
          transition={{ delay: 0.1 + i * 0.18, duration: 0.5, ease: EASE.outQuart }}
        >
          <rect x="6" y={6 + i * 22} width="68" height="18" rx="3" fill={COLORS.panel} stroke={COLORS.panelStroke} strokeWidth="0.5" />
          <text x="10" y={14 + i * 22} fontSize="5.5" fill={COLORS.textMuted} fontFamily={MONO}>
            {r.name}
          </text>
          <text x="10" y={21 + i * 22} fontSize="7" fontWeight="700" fill="#fff" fontFamily={MONO}>
            {r.price}
          </text>
        </motion.g>
      ))}

      {/* right column: matched store */}
      {rows.map((r, i) => (
        <motion.g
          key={`b-${i}`}
          initial={reduced ? false : { opacity: 0, x: 8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: false, margin: "-40px" }}
          transition={{ delay: 0.35 + i * 0.18, duration: 0.5, ease: EASE.outQuart }}
        >
          <rect x="126" y={6 + i * 22} width="68" height="18" rx="3" fill={COLORS.panel} stroke={COLORS.green} strokeWidth="0.5" />
          <text x="130" y={14 + i * 22} fontSize="5.5" fill={COLORS.textMuted} fontFamily={MONO}>
            STORE 214
          </text>
          <text x="130" y={21 + i * 22} fontSize="7" fontWeight="700" fill="#86efac" fontFamily={MONO}>
            matched
          </text>
        </motion.g>
      ))}

      {/* connecting matched lines — draw stroke */}
      {rows.map((_, i) => (
        <motion.line
          key={`l-${i}`}
          x1="74"
          y1={15 + i * 22}
          x2="126"
          y2={15 + i * 22}
          stroke={COLORS.green}
          strokeWidth="0.8"
          strokeDasharray="2 2"
          initial={reduced ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0.4 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: false, margin: "-40px" }}
          transition={{ delay: 0.5 + i * 0.18, duration: 0.6, ease: EASE.outQuart }}
        />
      ))}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 02. Approved Price Actions — pending → reviewed → approved → executing    */
/* ────────────────────────────────────────────────────────────────────────── */

export function AnimatedApprovalQueue() {
  const reduced = useReducedMotion();
  // Each chip occupies a column; chips advance through stages in a loop.
  const stages = ["pending", "reviewed", "approved", "executing"];

  return (
    <svg viewBox={VIEWBOX} className="h-full w-full" role="img" aria-label="Price action advancing through approval queue">
      {/* stage track */}
      <line x1="14" y1="56" x2="186" y2="56" stroke={COLORS.panelStroke} strokeWidth="0.5" strokeDasharray="2 3" />
      {stages.map((s, i) => {
        const x = 14 + i * 58;
        return (
          <g key={s}>
            <circle cx={x} cy="56" r="2" fill={COLORS.panelStroke} />
            <text x={x} y="68" fontSize="5.5" textAnchor="middle" fill={COLORS.textMuted} fontFamily={MONO}>
              {s}
            </text>
          </g>
        );
      })}

      {/* moving chip — shows approved_price and slides along the track */}
      <motion.g
        initial={reduced ? { x: 174 } : { x: 0 }}
        animate={
          reduced
            ? { x: 174 }
            : { x: [0, 58, 116, 174, 0] }
        }
        transition={
          reduced
            ? undefined
            : { duration: 8, repeat: Infinity, ease: EASE.outQuart, times: [0, 0.28, 0.55, 0.85, 1] }
        }
      >
        <rect x="0" y="14" width="48" height="32" rx="4" fill={COLORS.panel} stroke={COLORS.orange} strokeWidth="0.7" />
        <text x="6" y="24" fontSize="5.5" fill={COLORS.textMuted} fontFamily={MONO}>
          EGGS · 12ct
        </text>
        <text x="6" y="36" fontSize="9" fontWeight="700" fill={COLORS.orange} fontFamily={MONO}>
          $4.19
        </text>
        <text x="6" y="44" fontSize="4.5" fill={COLORS.textDim} fontFamily={MONO}>
          DAL · canary
        </text>
      </motion.g>

      {/* stage label that brightens as the chip passes */}
      {stages.map((s, i) => {
        const x = 14 + i * 58;
        return reduced ? null : (
          <motion.circle
            key={`pulse-${s}`}
            cx={x}
            cy="56"
            r="3.5"
            fill={i === 3 ? COLORS.green : COLORS.orange}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0] }}
            transition={{
              duration: 8,
              repeat: Infinity,
              times: [0, 0.05, 0.2],
              delay: i * 2,
            }}
          />
        );
      })}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 03. Cost & Margin Context — cost rises, margin shrinks, guardrail caps    */
/* ────────────────────────────────────────────────────────────────────────── */

export function AnimatedMarginGuardrail() {
  const reduced = useReducedMotion();
  // Bar splits into cost (rose) + margin (green); cost grows in loop.
  return (
    <svg viewBox={VIEWBOX} className="h-full w-full" role="img" aria-label="Cost grows, margin shrinks, guardrail enforces floor">
      <text x="10" y="14" fontSize="6" fill={COLORS.textMuted} fontFamily={MONO}>COST</text>
      <text x="190" y="14" fontSize="6" textAnchor="end" fill={COLORS.textMuted} fontFamily={MONO}>PRICE</text>

      <rect x="10" y="22" width="180" height="18" rx="4" fill={COLORS.panel} stroke={COLORS.panelStroke} strokeWidth="0.4" />

      {/* cost portion grows */}
      <motion.rect
        x="10"
        y="22"
        width="110"
        height="18"
        rx="4"
        fill={COLORS.redSoft}
        initial={reduced ? { width: 130 } : { width: 110 }}
        animate={reduced ? { width: 130 } : { width: [110, 130, 130, 110, 110] }}
        transition={reduced ? undefined : { duration: 7, repeat: Infinity, times: [0, 0.35, 0.6, 0.85, 1], ease: EASE.outQuart }}
      />

      {/* guardrail tick — flares when cost crosses threshold */}
      <motion.line
        x1="130"
        y1="18"
        x2="130"
        y2="44"
        stroke={COLORS.amber}
        strokeWidth="1.4"
        initial={reduced ? { opacity: 0.9 } : { opacity: 0.35 }}
        animate={reduced ? undefined : { opacity: [0.35, 1, 1, 0.35, 0.35] }}
        transition={reduced ? undefined : { duration: 7, repeat: Infinity, times: [0, 0.35, 0.6, 0.85, 1] }}
      />

      {/* margin badge */}
      <motion.g
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={reduced ? undefined : { opacity: [0, 1, 1, 0.8, 0], y: [4, 0, 0, 0, 4] }}
        transition={reduced ? undefined : { duration: 7, repeat: Infinity, times: [0.3, 0.4, 0.65, 0.85, 1] }}
      >
        <rect x="60" y="50" width="80" height="14" rx="3" fill={COLORS.amberSoft} stroke={COLORS.amber} strokeWidth="0.5" />
        <text x="100" y="59" fontSize="6.5" fontWeight="600" textAnchor="middle" fill="#fde68a" fontFamily={MONO}>
          guardrail · margin floor
        </text>
      </motion.g>

      {/* idle margin label */}
      <text x="100" y="34" fontSize="6.5" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily={MONO}>
        margin
      </text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 04. Inventory Snapshot — store stock drops, action pauses on that store   */
/* ────────────────────────────────────────────────────────────────────────── */

export function AnimatedInventoryAware() {
  const reduced = useReducedMotion();
  const stores = [4, 3, 2, 4]; // 4 store tiles; we'll deplete the 3rd
  return (
    <svg viewBox={VIEWBOX} className="h-full w-full" role="img" aria-label="Store inventory drops, pricing action pauses on that location">
      {stores.map((_, idx) => {
        const baseX = 12 + idx * 46;
        return (
          <g key={idx}>
            <rect x={baseX} y="10" width="38" height="38" rx="4" fill={COLORS.panel} stroke={COLORS.panelStroke} strokeWidth="0.5" />
            <text x={baseX + 19} y="20" fontSize="5.5" textAnchor="middle" fill={COLORS.textMuted} fontFamily={MONO}>
              {`STORE ${214 + idx * 88}`}
            </text>
            {/* 4 stacked stock pips */}
            {[0, 1, 2, 3].map((p) => {
              const filled = p < (idx === 2 ? 1 : 3);
              return (
                <motion.rect
                  key={p}
                  x={baseX + 6 + p * 7}
                  y="28"
                  width="5"
                  height="14"
                  rx="1"
                  initial={false}
                  animate={
                    reduced
                      ? { fill: filled ? COLORS.green : "rgba(255,255,255,.06)" }
                      : idx === 2
                      ? {
                          fill: p === 0 ? COLORS.green : ["rgba(34,197,94,.6)", "rgba(244,63,94,.45)", "rgba(255,255,255,.06)"],
                        }
                      : { fill: filled ? COLORS.green : "rgba(255,255,255,.06)" }
                  }
                  transition={
                    reduced
                      ? undefined
                      : idx === 2
                      ? { duration: 5, repeat: Infinity, times: [0, 0.5, 1], delay: 0.4 + p * 0.1 }
                      : undefined
                  }
                />
              );
            })}
          </g>
        );
      })}

      {/* "paused" label appearing over store 3 */}
      {!reduced && (
        <motion.g
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: [0, 1, 1, 0], y: [4, 0, 0, 4] }}
          transition={{ duration: 5, repeat: Infinity, times: [0.5, 0.62, 0.9, 1] }}
        >
          <rect x="100" y="56" width="42" height="14" rx="3" fill={COLORS.redSoft} stroke={COLORS.red} strokeWidth="0.5" />
          <text x="121" y="65" fontSize="6.5" fontWeight="600" textAnchor="middle" fill="#fda4af" fontFamily={MONO}>
            stock · paused
          </text>
        </motion.g>
      )}
      {reduced && (
        <g>
          <rect x="100" y="56" width="42" height="14" rx="3" fill={COLORS.redSoft} stroke={COLORS.red} strokeWidth="0.5" />
          <text x="121" y="65" fontSize="6.5" fontWeight="600" textAnchor="middle" fill="#fda4af" fontFamily={MONO}>
            stock · paused
          </text>
        </g>
      )}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 05. Competitor Reference — observation arrives, gap recomputes            */
/* ────────────────────────────────────────────────────────────────────────── */

export function AnimatedCompetitorPulse() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox={VIEWBOX} className="h-full w-full" role="img" aria-label="Competitor price observed, gap recomputed">
      {/* OURS */}
      <rect x="10" y="10" width="78" height="44" rx="4" fill={COLORS.panel} stroke={COLORS.green} strokeWidth="0.6" />
      <text x="49" y="24" fontSize="6.5" textAnchor="middle" fill="#86efac" fontFamily={MONO}>OURS</text>
      <text x="49" y="42" fontSize="13" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily={MONO}>$5.99</text>

      {/* THEIRS */}
      <rect x="112" y="10" width="78" height="44" rx="4" fill={COLORS.panel} stroke={COLORS.red} strokeWidth="0.6" />
      <text x="151" y="24" fontSize="6.5" textAnchor="middle" fill="#fda4af" fontFamily={MONO}>THEIRS</text>
      {/* their price ticks between two observations */}
      <motion.text
        x="151"
        y="42"
        fontSize="13"
        fontWeight="700"
        textAnchor="middle"
        fill="#fff"
        fontFamily={MONO}
        initial={false}
        animate={reduced ? { opacity: 1 } : { opacity: [1, 0, 1, 1] }}
        transition={reduced ? undefined : { duration: 5, repeat: Infinity, times: [0, 0.45, 0.5, 1] }}
      >
        $5.49
      </motion.text>

      {/* pulse ring on THEIRS — new observation incoming */}
      {!reduced && (
        <motion.circle
          cx="151"
          cy="32"
          r="22"
          fill="none"
          stroke={COLORS.red}
          strokeWidth="0.6"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.7, 0], scale: [0.6, 1.3, 1.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: EASE.outQuart, repeatDelay: 2.2 }}
        />
      )}

      {/* recomputed gap label */}
      <motion.g
        initial={reduced ? false : { opacity: 0 }}
        animate={reduced ? undefined : { opacity: [0, 1, 1, 0] }}
        transition={reduced ? undefined : { duration: 5, repeat: Infinity, times: [0.5, 0.62, 0.9, 1] }}
      >
        <rect x="64" y="60" width="72" height="14" rx="3" fill={COLORS.amberSoft} stroke={COLORS.amber} strokeWidth="0.4" />
        <text x="100" y="69" fontSize="6.5" fontWeight="600" textAnchor="middle" fill="#fde68a" fontFamily={MONO}>
          gap · −$0.50
        </text>
      </motion.g>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 06. Substitution Map — primary unavailable, substitute lights up          */
/* ────────────────────────────────────────────────────────────────────────── */

export function AnimatedSubstitutionFlow() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox={VIEWBOX} className="h-full w-full" role="img" aria-label="Primary product unavailable, substitute activated">
      <rect x="10" y="14" width="68" height="44" rx="4" fill={COLORS.panel} stroke="#94a3b8" strokeWidth="0.5" />
      <text x="44" y="30" fontSize="7.5" textAnchor="middle" fill="#fff" fontFamily={SANS}>Brand A</text>
      <motion.text
        x="44"
        y="46"
        fontSize="6.5"
        textAnchor="middle"
        fill="#fda4af"
        fontFamily={MONO}
        initial={false}
        animate={reduced ? { opacity: 1 } : { opacity: [0.4, 1, 1, 0.4] }}
        transition={reduced ? undefined : { duration: 4, repeat: Infinity, times: [0, 0.25, 0.75, 1] }}
      >
        out of stock
      </motion.text>

      {/* dashed arrow grows */}
      <motion.line
        x1="80"
        y1="36"
        x2="122"
        y2="36"
        stroke={COLORS.violet}
        strokeWidth="1.4"
        strokeDasharray="3 2"
        initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
        animate={reduced ? undefined : { pathLength: [0, 1, 1, 0] }}
        transition={reduced ? undefined : { duration: 4, repeat: Infinity, times: [0, 0.4, 0.8, 1] }}
      />
      <polygon points="122,36 116,32 116,40" fill={COLORS.violet} />

      <rect x="124" y="14" width="68" height="44" rx="4" fill={COLORS.panel} stroke={COLORS.violet} strokeWidth="0.6" />
      <text x="158" y="30" fontSize="7.5" textAnchor="middle" fill="#fff" fontFamily={SANS}>Brand B</text>
      <motion.text
        x="158"
        y="46"
        fontSize="6.5"
        textAnchor="middle"
        fill="#c4b5fd"
        fontFamily={MONO}
        initial={false}
        animate={reduced ? { opacity: 1 } : { opacity: [0.3, 1, 1, 0.3] }}
        transition={reduced ? undefined : { duration: 4, repeat: Infinity, times: [0.4, 0.55, 0.95, 1] }}
      >
        substitute · live
      </motion.text>

      {/* pulse ring on Brand B */}
      {!reduced && (
        <motion.circle
          cx="158"
          cy="36"
          r="22"
          fill="none"
          stroke={COLORS.violet}
          strokeWidth="0.5"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: [0, 0.6, 0], scale: [0.7, 1.2, 1.4] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.4 }}
        />
      )}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 07. Promotional Context — event window opens, deadline counter pulses     */
/* ────────────────────────────────────────────────────────────────────────── */

export function AnimatedPromotionalWindow() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox={VIEWBOX} className="h-full w-full" role="img" aria-label="Promotional window opens, deadline pulses">
      <rect x="10" y="10" width="180" height="60" rx="5" fill={COLORS.panel} stroke={COLORS.orange} strokeWidth="0.6" />

      {/* progress bar fills then resets */}
      <rect x="10" y="10" width="180" height="11" rx="5" fill={COLORS.orangeSoft} />
      <motion.rect
        x="10"
        y="10"
        height="11"
        rx="5"
        fill={COLORS.orange}
        initial={reduced ? { width: 144 } : { width: 0 }}
        animate={reduced ? undefined : { width: [0, 144, 144, 0] }}
        transition={reduced ? undefined : { duration: 6, repeat: Infinity, ease: EASE.outQuart, times: [0, 0.6, 0.9, 1] }}
      />

      <text x="14" y="19" fontSize="6" fill="#fdba74" fontFamily={MONO}>
        MEMORIAL DAY · MAY 27
      </text>

      <text x="14" y="35" fontSize="8" fill="#fff" fontFamily={SANS}>
        Markdown · 4 SKUs · zone DAL
      </text>

      {/* deadline counter — flips and pulses */}
      <motion.g
        initial={reduced ? false : { opacity: 1 }}
        animate={reduced ? undefined : { opacity: [1, 0.4, 1] }}
        transition={reduced ? undefined : { duration: 1.4, repeat: Infinity }}
      >
        <text x="14" y="50" fontSize="6.5" fill={COLORS.amber} fontFamily={MONO}>
          deadline · 6:00 PM
        </text>
        <circle cx="48" cy="48" r="2" fill={COLORS.amber} />
      </motion.g>

      {/* sku chips */}
      {[0, 1, 2, 3].map((i) => (
        <motion.rect
          key={i}
          x={108 + i * 18}
          y="44"
          width="14"
          height="14"
          rx="2"
          fill={COLORS.orangeSoft}
          stroke={COLORS.orange}
          strokeWidth="0.4"
          initial={reduced ? false : { opacity: 0, y: 4 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, margin: "-40px" }}
          transition={{ delay: 0.4 + i * 0.1, duration: 0.4, ease: EASE.outQuart }}
        />
      ))}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 08. Approval Policy — operator badge gates zones                          */
/* ────────────────────────────────────────────────────────────────────────── */

export function AnimatedApprovalPolicy() {
  const reduced = useReducedMotion();
  const zones = ["DAL", "AUS", "HOU"];
  return (
    <svg viewBox={VIEWBOX} className="h-full w-full" role="img" aria-label="Operator badge approves zone expansion">
      {/* operator avatar — soft pulse */}
      <motion.circle
        cx="32"
        cy="40"
        r="20"
        fill={COLORS.violetSoft}
        stroke={COLORS.violet}
        strokeWidth="0.7"
        initial={false}
        animate={reduced ? undefined : { scale: [1, 1.06, 1] }}
        transition={reduced ? undefined : { duration: 2.4, repeat: Infinity, ease: EASE.outQuart }}
        style={{ transformOrigin: "32px 40px" }}
      />
      <text x="32" y="44" fontSize="9" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily={SANS}>
        AD
      </text>

      <text x="62" y="22" fontSize="7.5" fill="#fff" fontFamily={SANS}>Avery Davis</text>
      <text x="62" y="30" fontSize="6" fill={COLORS.textMuted} fontFamily={MONO}>
        operator · pricing ops
      </text>

      {/* zone chips light up in sequence */}
      {zones.map((z, i) => (
        <motion.g
          key={z}
          initial={reduced ? false : { opacity: 0.25 }}
          animate={reduced ? undefined : { opacity: [0.25, 1, 1, 0.25] }}
          transition={
            reduced
              ? undefined
              : { duration: 6, repeat: Infinity, times: [0, 0.18, 0.5, 1], delay: i * 1.4 }
          }
        >
          <rect x={62 + i * 36} y="40" width="32" height="16" rx="3" fill={COLORS.greenSoft} stroke={COLORS.green} strokeWidth="0.4" />
          <text x={78 + i * 36} y="50" fontSize="6.5" fontWeight="600" textAnchor="middle" fill="#86efac" fontFamily={MONO}>
            {z} · ok
          </text>
        </motion.g>
      ))}

      <text x="62" y="68" fontSize="5.5" fill={COLORS.textDim} fontFamily={MONO}>
        may expand · 3 zones
      </text>
    </svg>
  );
}
