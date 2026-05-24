"use client";

/* eslint-disable @next/next/no-img-element */

/* Shared cinematic primitives for Vision pages.
 *
 * Extracted so new pages (Principle, Connect, Futures) don't each redefine
 * CinePhoto, FilmGrain, MagneticButton, etc. KeynotePage keeps its own
 * private copies for now — leave it alone to avoid regression risk.
 *
 * Motion language flows through frontend/lib/motion.ts.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";

/* ─────────────────────────────── film grain ──────────────────────────────── */

export function FilmGrain({ id = "fg" }: { id?: string }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full opacity-[.04] mix-blend-overlay"
    >
      <filter id={`grain-${id}`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#grain-${id})`} />
    </svg>
  );
}

/* ─────────────────────────────── photo + gradient fallback ───────────────── */

export function CinePhoto({
  src,
  alt,
  className,
  fallback = "linear-gradient(135deg, #1f2533 0%, #0c1018 60%, #1a0c12 100%)",
}: {
  src: string;
  alt: string;
  className?: string;
  fallback?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className ?? ""}`}
      style={{ background: fallback }}
    >
      {!failed && (
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 30% 40%, rgba(251,146,60,.16), transparent 55%), radial-gradient(circle at 75% 70%, rgba(167,139,250,.14), transparent 55%)",
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────── ambient particles ───────────────────────── */

export function Particles({
  count = 18,
  color = "rgba(251,146,60,.55)",
}: {
  count?: number;
  color?: string;
}) {
  const reduced = useReducedMotion();
  const dots = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 8,
        duration: 10 + Math.random() * 14,
        size: 1.5 + Math.random() * 2.5,
        drift: -20 + Math.random() * 40,
      })),
    [count],
  );
  if (reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d, i) => (
        <motion.span
          key={i}
          className="absolute bottom-0 rounded-full"
          style={{
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            background: color,
            boxShadow: `0 0 ${d.size * 3}px ${color}`,
          }}
          animate={{ y: ["0%", "-1200%"], x: [0, d.drift, 0], opacity: [0, 0.85, 0] }}
          transition={{ duration: d.duration, repeat: Infinity, delay: d.delay, ease: "linear" }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────── chapter marker ──────────────────────────── */

export function ChapterMarker({ n, label }: { n: string; label: string }) {
  return (
    <div className="relative mx-auto max-w-[1400px] px-5 pt-16 sm:px-8 sm:pt-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-30% 0px -50% 0px" }}
        transition={{ duration: 0.7, ease: EASE.outQuart }}
        className="flex items-center gap-4"
      >
        <span className="font-mono text-[clamp(40px,5vw,72px)] font-semibold leading-none tracking-[-0.04em] text-orange-300/80">
          {n}
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-orange-500/50 via-white/15 to-transparent" />
        <span className="text-[11px] uppercase tracking-[.32em] text-white/45">{label}</span>
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────── magnetic CTAs ──────────────────────────── */

type CtaVariant = "primary" | "ghost" | "quiet";

const CTA_CLASSES: Record<CtaVariant, string> = {
  primary:
    "group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#040608] " +
    "transition-all duration-200 ease-out hover:bg-orange-50 hover:-translate-y-[1px] " +
    "active:scale-[0.97] active:translate-y-0 shadow-[0_2px_0_rgba(0,0,0,.05)]",
  ghost:
    "group inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[.04] px-6 py-3.5 " +
    "text-sm font-medium text-white backdrop-blur transition-all duration-200 ease-out hover:bg-white/[.10] " +
    "hover:-translate-y-[1px] active:scale-[0.97] active:translate-y-0",
  quiet:
    "group inline-flex items-center gap-2 rounded-full border border-white/15 bg-transparent px-5 py-3 text-sm " +
    "font-medium text-white/75 transition-all duration-200 ease-out hover:text-white hover:bg-white/[.04] " +
    "active:scale-[0.97]",
};

export function MagneticButton({
  onClick,
  children,
  variant = "primary",
  disabled,
  type,
}: {
  onClick?: () => void;
  children: ReactNode;
  variant?: CtaVariant;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      className={`${CTA_CLASSES[variant]} ${disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}
    >
      {children}
    </button>
  );
}

export function MagneticLink({
  href,
  children,
  variant = "ghost",
}: {
  href: string;
  children: ReactNode;
  variant?: CtaVariant;
}) {
  return (
    <Link href={href} className={CTA_CLASSES[variant]}>
      {children}
    </Link>
  );
}

/* ─────────────────────────────── photo set ──────────────────────────────── */
/* Shared CDN URLs (heavily dimmed when used as backdrops).                   */

export const PHOTOS = {
  aisle:
    "https://images.unsplash.com/photo-1542838132-92c53300491e?w=2400&auto=format&fit=crop&q=80",
  cart:
    "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=2000&auto=format&fit=crop&q=80",
  cold:
    "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=2000&auto=format&fit=crop&q=80",
  scan:
    "https://images.unsplash.com/photo-1601598851547-4302969d0614?w=2000&auto=format&fit=crop&q=80",
  store:
    "https://images.unsplash.com/photo-1601612625308-6e16ae8c95ac?w=2000&auto=format&fit=crop&q=80",
};
