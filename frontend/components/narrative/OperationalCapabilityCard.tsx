"use client";

/**
 * OperationalCapabilityCard — wrapper for each Connect-page capability tile.
 *
 * Replaces the previous static-SVG card. Every tile now contains a small
 * looping operational animation that demonstrates what the capability
 * does (e.g. matched catalog rows, approval queue moving forward, margin
 * guardrail flexing). The card itself stays calm — animations are scoped
 * inside the mockup viewport so the page never feels noisy.
 *
 * Behavior:
 *   • Subtle on-mount hover lift (consistent with the rest of the page)
 *   • Inner animations run continuously but only while in viewport
 *     (Framer Motion's whileInView pauses them when scrolled away)
 *   • Reduced-motion: renders a clean static state with no loops
 *   • On hover/focus: card brightens its border, animation gets a
 *     1-step "deeper" reveal (e.g. extra status badge or row appears)
 *
 * Used by: components/vision/ConnectPage.tsx (DataFields section).
 */

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { EASE } from "@/lib/motion";
import type { LucideIcon } from "lucide-react";

interface Props {
  index: number;
  icon: LucideIcon;
  label: string;
  body: string;
  /** The inner animated visual (one of the AnimatedXxx components). */
  children: React.ReactNode;
}

export function OperationalCapabilityCard({ index, icon: Icon, label, body, children }: Props) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay: index * 0.05, ease: EASE.outQuart }}
      whileHover={reduced ? undefined : { y: -3 }}
      tabIndex={0}
      className={clsx(
        "group rounded-2xl border border-white/10 bg-white/[.025] p-5 transition-colors duration-200",
        "hover:border-orange-500/30 hover:bg-orange-500/[.04]",
        "focus-within:border-orange-500/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-orange-400/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] text-orange-300">
          <Icon className="h-4 w-4" />
        </span>
        <span className="font-mono text-[10px] tracking-[.22em] text-white/30">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <p className="mt-4 text-sm font-semibold text-white">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/55">{body}</p>
      {/* Animated mockup viewport — height fixed so card heights stay aligned. */}
      <div className="mt-4 h-[90px] overflow-hidden rounded-xl border border-white/[.06] bg-black/30 p-2">
        {children}
      </div>
    </motion.div>
  );
}
