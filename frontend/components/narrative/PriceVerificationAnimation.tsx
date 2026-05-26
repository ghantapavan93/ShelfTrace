"use client";

/**
 * PriceVerificationAnimation — the Showcase hero proof moment.
 *
 * Visualizes: approved price → multi-channel execution → POS ring-up →
 * comparison → "Verified" or "Mismatch".
 *
 * This sits directly under the hero statement "The price they ring up
 * should be the price you approved." and gives it operational weight —
 * the reviewer sees the concept happening, not just hears it.
 *
 * Loop sequence (timed):
 *   0.0 → Approved price card appears ($4.19)
 *   0.6 → Three channel chips light up (ESL, POS, Ecommerce)
 *   1.6 → Each channel responds — POS shows the wrong price ($4.49)
 *   2.4 → System detects mismatch, raises a "MISMATCH" verdict
 *   4.0 → Reset, but on next loop POS responds correctly → "VERIFIED"
 *
 * Reduced motion: renders the verified end-state with all chips lit.
 */

import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";

const COLORS = {
  bg: "#0a0e18",
  panel: "#0e1320",
  panelStroke: "#1e293b",
  orange: "#fb923c",
  orangeSoft: "rgba(251,146,60,.15)",
  green: "#22c55e",
  greenSoft: "rgba(34,197,94,.15)",
  red: "#f43f5e",
  redSoft: "rgba(244,63,94,.15)",
  amber: "#f59e0b",
  textMuted: "rgba(255,255,255,.5)",
  textDim: "rgba(255,255,255,.35)",
};

const MONO = "ui-monospace, monospace";
const SANS = "ui-sans-serif, system-ui";

export function PriceVerificationAnimation() {
  const reduced = useReducedMotion();
  const LOOP = 6.5; // seconds

  // ── Phase times normalised to LOOP ────────────────────────────────────
  // 0.00–0.10: approved card slides in
  // 0.10–0.25: 3 channel chips light
  // 0.25–0.45: channels respond (POS shows wrong price)
  // 0.45–0.70: mismatch verdict
  // 0.70–1.00: reset / verified pulse

  return (
    <svg
      viewBox="0 0 880 360"
      className="h-auto w-full"
      role="img"
      aria-label="Approved price flowing to POS, ESL, and ecommerce and being verified"
    >
      {/* faint grid background */}
      <defs>
        <linearGradient id="vGradOrange" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fdba74" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
        <linearGradient id="vGradRose" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fda4af" />
          <stop offset="1" stopColor="#f43f5e" />
        </linearGradient>
      </defs>

      {/* ───── approved price card (left) ─────────────────────────────── */}
      <motion.g
        initial={reduced ? false : { opacity: 0, x: -16 }}
        animate={reduced ? undefined : { opacity: 1, x: 0 }}
        transition={reduced ? undefined : { duration: 0.7, ease: EASE.outQuart }}
      >
        <rect x="36" y="120" width="200" height="120" rx="14" fill={COLORS.panel} stroke={COLORS.orange} strokeWidth="0.8" />
        <text x="56" y="148" fontSize="11" fill={COLORS.textMuted} fontFamily={MONO} letterSpacing="3">
          APPROVED PRICE
        </text>
        <text x="56" y="200" fontSize="48" fontWeight="700" fill="url(#vGradOrange)" fontFamily={MONO}>
          $4.19
        </text>
        <text x="56" y="222" fontSize="11" fill={COLORS.textMuted} fontFamily={SANS}>
          eggs · 12ct · Dallas Zone 2
        </text>
      </motion.g>

      {/* ───── flow lines from approved card to each channel chip ─────── */}
      {[120, 180, 240].map((y, i) => (
        <motion.path
          key={`line-${i}`}
          d={`M 240 180 C 320 180, 380 ${y}, 460 ${y}`}
          fill="none"
          stroke={COLORS.orange}
          strokeWidth="1.2"
          strokeOpacity="0.5"
          strokeDasharray="4 4"
          initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
          animate={reduced ? undefined : { pathLength: [0, 1, 1, 1, 0] }}
          transition={
            reduced
              ? undefined
              : {
                  duration: LOOP,
                  repeat: Infinity,
                  times: [0, 0.15, 0.45, 0.85, 1],
                  delay: 0.1 + i * 0.05,
                  ease: EASE.outQuart,
                }
          }
        />
      ))}

      {/* ───── three channel chips ───────────────────────────────────── */}
      <ChannelChip
        x={460} y={104}
        label="SHELF LABEL · ESL"
        priceLabel="$4.19"
        // ESL responds correctly
        status="verified"
        delay={0.18}
        reduced={!!reduced}
        loop={LOOP}
      />
      <ChannelChip
        x={460} y={164}
        label="CHECKOUT POS"
        priceLabel="$4.49"
        // POS responds with wrong price — this is the mismatch
        status="mismatch"
        delay={0.22}
        reduced={!!reduced}
        loop={LOOP}
      />
      <ChannelChip
        x={460} y={224}
        label="ECOMMERCE"
        priceLabel="$4.19"
        status="verified"
        delay={0.26}
        reduced={!!reduced}
        loop={LOOP}
      />

      {/* ───── verdict on right ──────────────────────────────────────── */}
      <g>
        <rect x="708" y="120" width="148" height="120" rx="14" fill={COLORS.panel} stroke={COLORS.panelStroke} strokeWidth="0.6" />
        <text x="724" y="148" fontSize="11" fill={COLORS.textMuted} fontFamily={MONO} letterSpacing="3">
          VERDICT
        </text>

        {reduced ? (
          // Static end-state for reduced motion: show MISMATCH (more informative)
          <g>
            <text x="724" y="196" fontSize="22" fontWeight="700" fill={COLORS.red} fontFamily={MONO}>
              MISMATCH
            </text>
            <text x="724" y="218" fontSize="10" fill="#fda4af" fontFamily={SANS}>
              POS reports $4.49
            </text>
            <text x="724" y="232" fontSize="10" fill={COLORS.textMuted} fontFamily={SANS}>
              Expansion blocked.
            </text>
          </g>
        ) : (
          <>
            {/* MISMATCH phase */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 1, 1, 0] }}
              transition={{ duration: LOOP, repeat: Infinity, times: [0, 0.42, 0.5, 0.78, 0.85] }}
            >
              <text x="724" y="196" fontSize="22" fontWeight="700" fill={COLORS.red} fontFamily={MONO}>
                MISMATCH
              </text>
              <text x="724" y="218" fontSize="10" fill="#fda4af" fontFamily={SANS}>
                POS reports $4.49
              </text>
              <text x="724" y="232" fontSize="10" fill={COLORS.textMuted} fontFamily={SANS}>
                Expansion blocked.
              </text>
            </motion.g>

            {/* Retry → VERIFIED phase */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 0, 0, 1, 1, 0] }}
              transition={{ duration: LOOP, repeat: Infinity, times: [0, 0.42, 0.78, 0.85, 0.9, 0.97, 1] }}
            >
              <text x="724" y="196" fontSize="22" fontWeight="700" fill={COLORS.green} fontFamily={MONO}>
                VERIFIED
              </text>
              <text x="724" y="218" fontSize="10" fill="#86efac" fontFamily={SANS}>
                Retry succeeded.
              </text>
              <text x="724" y="232" fontSize="10" fill={COLORS.textMuted} fontFamily={SANS}>
                Safe to expand.
              </text>
            </motion.g>
          </>
        )}
      </g>

      {/* ───── annotation legend below ───────────────────────────────── */}
      <g>
        <text x="36" y="288" fontSize="10" fill={COLORS.textDim} fontFamily={MONO} letterSpacing="2">
          01 · APPROVE
        </text>
        <text x="296" y="288" fontSize="10" fill={COLORS.textDim} fontFamily={MONO} letterSpacing="2">
          02 · EXECUTE TO CHANNELS
        </text>
        <text x="676" y="288" fontSize="10" fill={COLORS.textDim} fontFamily={MONO} letterSpacing="2">
          03 · RECONCILE
        </text>
        <line x1="36" y1="298" x2="240" y2="298" stroke={COLORS.panelStroke} strokeWidth="0.5" />
        <line x1="296" y1="298" x2="656" y2="298" stroke={COLORS.panelStroke} strokeWidth="0.5" />
        <line x1="676" y1="298" x2="856" y2="298" stroke={COLORS.panelStroke} strokeWidth="0.5" />
      </g>
    </svg>
  );
}

function ChannelChip({
  x, y, label, priceLabel, status, delay, reduced, loop,
}: {
  x: number;
  y: number;
  label: string;
  priceLabel: string;
  status: "verified" | "mismatch";
  delay: number;
  reduced: boolean;
  loop: number;
}) {
  const stroke = status === "mismatch" ? COLORS.red : COLORS.green;
  const tintFill = status === "mismatch" ? COLORS.redSoft : COLORS.greenSoft;
  const priceColor = status === "mismatch" ? "#fda4af" : "#86efac";

  return (
    <g>
      {/* chip frame */}
      <motion.rect
        x={x}
        y={y}
        width={216}
        height={52}
        rx={10}
        fill={COLORS.panel}
        stroke={stroke}
        strokeWidth="0.8"
        initial={reduced ? false : { opacity: 0.3 }}
        animate={reduced ? undefined : { opacity: [0.3, 1, 1, 0.3] }}
        transition={
          reduced
            ? undefined
            : { duration: loop, repeat: Infinity, times: [0, delay, 0.85, 1] }
        }
      />
      {/* fill tint glows during "response" phase */}
      {!reduced && (
        <motion.rect
          x={x}
          y={y}
          width={216}
          height={52}
          rx={10}
          fill={tintFill}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 1, 1, 0] }}
          transition={{ duration: loop, repeat: Infinity, times: [0, 0.3, 0.4, 0.78, 0.85] }}
        />
      )}
      <text x={x + 14} y={y + 20} fontSize="9" fill={COLORS.textMuted} fontFamily={MONO} letterSpacing="2">
        {label}
      </text>
      <text x={x + 14} y={y + 42} fontSize="18" fontWeight="700" fill={priceColor} fontFamily={MONO}>
        {priceLabel}
      </text>
      {status === "mismatch" && (
        <text x={x + 200} y={y + 42} fontSize="10" textAnchor="end" fill="#fda4af" fontFamily={SANS}>
          {reduced ? "expected $4.19" : ""}
        </text>
      )}
    </g>
  );
}
