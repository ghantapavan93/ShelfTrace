"use client";

/* eslint-disable @next/next/no-img-element */

/* Shared cinematic primitives for Vision pages.
 *
 * Single source of truth for FilmGrain, CinePhoto, MagneticButton, PHOTOS
 * and the BetterBasket-style mockup family (ProductCard, Stage, Annotation,
 * product glyphs, ChannelAgreementPanel, AuditLogStream, OperatorActionRow,
 * LanePipe). Pages compose these — never redefine.
 *
 * Motion language flows through frontend/lib/motion.ts.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  Bell,
  CheckCircle2,
  CircleDot,
  CircleX,
  Database,
  GitBranch,
  Hand,
  Hourglass,
  Key,
  Lock,
  Network,
  RefreshCcw,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import { EASE, SPRING } from "@/lib/motion";

/* ════════════════════════════════════════════════════════════════════════════
   Tilt3DCard — mouse-follow 3D tilt for any child container.
   ════════════════════════════════════════════════════════════════════════════
   Max ±7° on both axes, springs for smooth tracking, mobile-safe (only on
   pointer:fine devices). Honors prefers-reduced-motion. Wrap any Stage /
   card / mockup with this to get a premium parallax feel on hover.            */

export function Tilt3DCard({
  children,
  max = 7,
  className = "",
}: {
  children: ReactNode;
  max?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rx = useSpring(useTransform(y, (v) => -v * max), { stiffness: 200, damping: 22 });
  const ry = useSpring(useTransform(x, (v) => v * max), { stiffness: 200, damping: 22 });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    x.set((e.clientX - r.left) / r.width - 0.5);
    y.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ perspective: 1200 }}
      className={className}
    >
      <motion.div
        style={{
          rotateX: rx,
          rotateY: ry,
          transformStyle: "preserve-3d",
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   InViewBurst — one-shot particle explosion when container enters viewport.
   ════════════════════════════════════════════════════════════════════════════
   Cheap (10 particles, single CSS animation). Cinema feel without cost.       */

export function InViewBurst({
  color = "rgba(251,146,60,.8)",
  count = 10,
}: {
  color?: string;
  count?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30% 0px -30% 0px" });
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2 + Math.random() * 0.6,
        distance: 80 + Math.random() * 60,
        delay: Math.random() * 0.1,
        size: 2 + Math.random() * 2.5,
      })),
    [count],
  );
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {inView && !reduced && (
          <>
            {dots.map((d, i) => (
              <motion.span
                key={i}
                className="absolute left-1/2 top-1/2 rounded-full"
                style={{
                  width: d.size,
                  height: d.size,
                  background: color,
                  boxShadow: `0 0 ${d.size * 4}px ${color}`,
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos(d.angle) * d.distance,
                  y: Math.sin(d.angle) * d.distance,
                  opacity: 0,
                  scale: 0.4,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, delay: d.delay, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
            {/* center flash */}
            <motion.span
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ width: 28, height: 28, background: color, filter: "blur(8px)" }}
              initial={{ opacity: 0.7, scale: 0.4 }}
              animate={{ opacity: 0, scale: 3 }}
              transition={{ duration: 0.65, ease: "easeOut" }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

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

/* ─────────────────────────────── live indicator + phase hook ─────────────── */
/* A pulsing "● LIVE / REC" chip + a reusable phase-cycling hook. Together they
   turn the static mockups into feeds that read as a working system: the badge
   signals "this is live," the hook drives state machines (reconciliation
   sweeps, canary verify→unlock loops) that keep moving instead of freezing
   after the entrance animation. Both honor prefers-reduced-motion.            */

export function LiveBadge({
  label = "LIVE",
  tone = "emerald",
  className = "",
}: {
  label?: string;
  tone?: "emerald" | "rose" | "sky";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const toneCls =
    tone === "rose"
      ? "border-rose-500/30 bg-rose-500/[.08] text-rose-200"
      : tone === "sky"
        ? "border-sky-500/30 bg-sky-500/[.08] text-sky-200"
        : "border-emerald-500/30 bg-emerald-500/[.08] text-emerald-200";
  const dot = tone === "rose" ? "bg-rose-400" : tone === "sky" ? "bg-sky-400" : "bg-emerald-400";
  const glow =
    tone === "rose" ? "rgba(251,113,133,.85)" : tone === "sky" ? "rgba(56,189,248,.85)" : "rgba(52,211,153,.85)";
  return (
    <span
      className={`pointer-events-none inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[.22em] backdrop-blur ${toneCls} ${className}`}
    >
      <motion.span
        className={`h-1.5 w-1.5 rounded-full ${dot}`}
        style={{ boxShadow: `0 0 8px ${glow}` }}
        animate={reduced ? undefined : { opacity: [1, 0.3, 1], scale: [1, 0.78, 1] }}
        transition={reduced ? undefined : { duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
      {label}
    </span>
  );
}

/** Cycle an index 0..phaseCount-1 on an interval. Returns the last phase when
 *  reduced-motion is set (so the mockup shows its resolved/final state) or when
 *  disabled. */
export function useCyclePhase(phaseCount: number, intervalMs = 1400, enabled = true): number {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!enabled || reduced || phaseCount <= 1) return;
    const id = setInterval(() => setPhase((p) => (p + 1) % phaseCount), intervalMs);
    return () => clearInterval(id);
  }, [phaseCount, intervalMs, enabled, reduced]);
  return reduced ? phaseCount - 1 : phase;
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
  // Additional cinematic backdrops — fall back to gradient art if any 404.
  nightAisle:
    "https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=2400&auto=format&fit=crop&q=80",
  receipt:
    "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=2000&auto=format&fit=crop&q=80",
  produce:
    "https://images.unsplash.com/photo-1542838-something?w=2000&auto=format&fit=crop&q=80",
};

/* ════════════════════════════════════════════════════════════════════════════
   BetterBasket-style mockup family
   ════════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────── Stage container ────────────────────────── */

export type StageAccent = "orange" | "violet" | "emerald" | "sky" | "rose" | "amber";

const STAGE_TINT: Record<StageAccent, string> = {
  orange: "rgba(251,146,60,.10)",
  violet: "rgba(167,139,250,.10)",
  emerald: "rgba(34,197,94,.10)",
  sky: "rgba(96,165,250,.10)",
  rose: "rgba(244,63,94,.10)",
  amber: "rgba(245,158,11,.10)",
};

export function Stage({
  children,
  accent = "orange",
  height = 440,
  live = false,
  liveLabel = "LIVE",
  liveTone = "emerald",
}: {
  children: ReactNode;
  accent?: StageAccent;
  height?: number;
  /** Show a pulsing LIVE chip in the corner so the mockup reads as a real feed. */
  live?: boolean;
  liveLabel?: string;
  liveTone?: "emerald" | "rose" | "sky";
}) {
  const tint = STAGE_TINT[accent];
  const particleColor = tint.replace(".10", ".5");
  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#0a0e18] to-[#04070b]"
      style={{ height }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 100%, ${tint}, transparent 60%)` }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <Particles count={6} color={particleColor} />
      {live && (
        <div className="absolute right-3 top-3 z-20">
          <LiveBadge label={liveLabel} tone={liveTone} />
        </div>
      )}
      <div className="relative h-full w-full">{children}</div>
    </div>
  );
}

/* ─────────────────────────────── product card ───────────────────────────── */

type Tone = "neutral" | "verified" | "warn" | "danger" | "primary" | "review";
const TONE_RING: Record<Tone, string> = {
  neutral: "border-white/12",
  verified: "border-emerald-500/40",
  warn: "border-amber-500/40",
  danger: "border-rose-500/40",
  primary: "border-orange-500/40",
  review: "border-violet-500/40",
};
const TONE_GLOW: Record<Tone, string> = {
  neutral: "shadow-[0_18px_40px_-24px_rgba(255,255,255,0.04)]",
  verified: "shadow-[0_18px_40px_-20px_rgba(34,197,94,0.4)]",
  warn: "shadow-[0_18px_40px_-20px_rgba(245,158,11,0.4)]",
  danger: "shadow-[0_18px_40px_-20px_rgba(244,63,94,0.5)]",
  primary: "shadow-[0_18px_40px_-20px_rgba(251,146,60,0.45)]",
  review: "shadow-[0_18px_40px_-20px_rgba(167,139,250,0.45)]",
};

export type BadgeTone = "verified" | "warn" | "danger" | "review" | "primary";
const BADGE_CLASSES: Record<BadgeTone, string> = {
  verified: "border-emerald-500/35 bg-emerald-500/[.10] text-emerald-200",
  warn: "border-amber-500/35 bg-amber-500/[.10] text-amber-200",
  danger: "border-rose-500/35 bg-rose-500/[.10] text-rose-200",
  review: "border-violet-500/35 bg-violet-500/[.10] text-violet-200",
  primary: "border-orange-500/35 bg-orange-500/[.10] text-orange-200",
};

export function ProductCard({
  name,
  units,
  price,
  oldPrice,
  glyph,
  badge,
  tone = "neutral",
  size = "md",
}: {
  name: string;
  units?: string;
  price: string;
  oldPrice?: string;
  glyph: ReactNode;
  badge?: { label: string; tone: BadgeTone };
  tone?: Tone;
  size?: "sm" | "md" | "lg";
}) {
  const cardWidth = size === "sm" ? "w-[126px]" : size === "lg" ? "w-[200px]" : "w-[164px]";
  const padding = size === "sm" ? "p-3" : "p-4";
  return (
    <div
      className={`relative ${cardWidth} ${padding} rounded-2xl border ${TONE_RING[tone]} bg-[#0e1320]/95 backdrop-blur-sm ${TONE_GLOW[tone]}`}
    >
      <div className="relative flex h-[68px] items-end justify-center overflow-hidden rounded-xl bg-gradient-to-b from-white/[.05] to-transparent">
        {glyph}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-1">
        {oldPrice && (
          <span className="font-mono text-[10px] text-white/35 line-through">{oldPrice}</span>
        )}
        <span className="ml-auto font-mono text-lg font-semibold tabular-nums text-white">
          {price}
        </span>
      </div>
      <p className="mt-1 text-[11px] font-medium text-white/85 truncate">{name}</p>
      {units && <p className="text-[10px] text-white/40">{units}</p>}
      {badge && (
        <div className="mt-2 flex">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.14em] ${BADGE_CLASSES[badge.tone]}`}
          >
            {badge.label}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── annotation ─────────────────────────────── */

export function Annotation({
  children,
  className = "",
  delay = 0,
  bob = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  bob?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: EASE.outQuart }}
      className={`absolute ${className}`}
    >
      <motion.div
        animate={reduced || !bob ? undefined : { y: [-2, 2, -2] }}
        transition={reduced || !bob ? undefined : { duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────── product glyphs ─────────────────────────── */
/* Compact illustrations sized to fit ProductCard's 68px image area.          */

export function MilkGlyph() {
  return (
    <svg viewBox="0 0 40 60" className="h-[60px] w-auto">
      <rect x="14" y="4" width="12" height="14" rx="1.5" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.5" />
      <rect x="12" y="2" width="16" height="4" rx="1" fill="#dc2626" />
      <rect x="6" y="18" width="28" height="38" rx="3" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.6" />
      <rect x="9" y="28" width="22" height="20" fill="#fff" stroke="#e2e8f0" strokeWidth="0.3" />
      <text x="20" y="38" fontSize="4.5" fontWeight="700" textAnchor="middle" fill="#0f172a" fontFamily="ui-sans-serif, system-ui">
        WHOLE MILK
      </text>
      <text x="20" y="44" fontSize="3.5" textAnchor="middle" fill="#64748b" fontFamily="ui-sans-serif, system-ui">
        1 GAL
      </text>
    </svg>
  );
}

export function EggsGlyph() {
  return (
    <svg viewBox="0 0 60 38" className="h-[60px] w-auto">
      <path d="M3 18 Q6 14 10 14 L50 14 Q54 14 57 18 L57 32 Q54 35 50 35 L10 35 Q6 35 3 32 Z" fill="#78350f" stroke="#451a03" strokeWidth="0.4" />
      <path d="M3 18 L57 18" stroke="#451a03" strokeWidth="0.3" />
      {[10, 20, 30, 40, 50].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="22" rx="3.8" ry="2.5" fill="#fef3c7" stroke="#fcd34d" strokeWidth="0.3" />
          <ellipse cx={x - 1} cy="21" rx="1" ry="0.6" fill="#fffbeb" />
        </g>
      ))}
      <text x="30" y="32" fontSize="2.8" fontWeight="700" textAnchor="middle" fill="#fffbeb" fontFamily="ui-sans-serif, system-ui">
        CAGE-FREE
      </text>
    </svg>
  );
}

export function StrawberryGlyph() {
  return (
    <svg viewBox="0 0 60 50" className="h-[60px] w-auto">
      <path d="M4 18 L56 18 L52 44 L8 44 Z" fill="rgba(15,23,42,.85)" stroke="#475569" strokeWidth="0.4" />
      {[14, 26, 38, 50].map((x, i) => (
        <line key={i} x1={x} y1="18" x2={x - 1} y2="44" stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" />
      ))}
      {[
        [14, 14],
        [26, 12],
        [38, 14],
        [50, 12],
        [20, 22],
        [32, 22],
        [44, 22],
      ].map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x} ${y} L${x - 4} ${y + 4} Q${x} ${y + 9} ${x + 4} ${y + 4} Z`} fill="#dc2626" />
          <path d={`M${x - 3} ${y} L${x} ${y - 2} L${x + 3} ${y} Z`} fill="#16a34a" />
        </g>
      ))}
    </svg>
  );
}

export function OJGlyph() {
  return (
    <svg viewBox="0 0 36 60" className="h-[60px] w-auto">
      <path d="M4 10 L18 2 L32 10 L32 14 L4 14 Z" fill="#fb923c" stroke="#9a3412" strokeWidth="0.4" />
      <rect x="4" y="14" width="28" height="42" rx="1.5" fill="#fb923c" stroke="#9a3412" strokeWidth="0.4" />
      <rect x="7" y="22" width="22" height="26" fill="rgba(255,255,255,0.92)" stroke="#9a3412" strokeWidth="0.3" />
      <text x="18" y="32" fontSize="4" fontWeight="700" textAnchor="middle" fill="#9a3412" fontFamily="ui-sans-serif, system-ui">
        PREMIUM
      </text>
      <text x="18" y="40" fontSize="7" fontWeight="800" textAnchor="middle" fill="#ea580c" fontFamily="ui-sans-serif, system-ui">
        OJ
      </text>
      <text x="18" y="46" fontSize="2.8" textAnchor="middle" fill="#9a3412" fontFamily="ui-sans-serif, system-ui">
        NFC
      </text>
    </svg>
  );
}

export function BreadGlyph() {
  return (
    <svg viewBox="0 0 60 36" className="h-[60px] w-auto">
      <path d="M6 22 Q6 10 18 8 Q26 4 36 8 Q50 10 54 18 Q56 26 50 30 L12 32 Q6 30 6 22 Z" fill="#fbbf24" stroke="#92400e" strokeWidth="0.4" />
      {[14, 22, 30, 38, 46].map((x, i) => (
        <path key={i} d={`M${x} 12 Q${x + 2} 18 ${x} 24`} stroke="#92400e" strokeWidth="0.4" fill="none" />
      ))}
      <text x="30" y="28" fontSize="3" fontWeight="700" textAnchor="middle" fill="#92400e" fontFamily="ui-sans-serif, system-ui">
        FRESH BAKED
      </text>
    </svg>
  );
}

export function ButterGlyph() {
  return (
    <svg viewBox="0 0 56 36" className="h-[60px] w-auto">
      <rect x="6" y="6" width="44" height="24" rx="2" fill="#fef3c7" stroke="#ca8a04" strokeWidth="0.5" />
      <rect x="6" y="6" width="44" height="6" fill="#fde047" />
      <text x="28" y="11" fontSize="3" fontWeight="800" textAnchor="middle" fill="#92400e" fontFamily="ui-sans-serif, system-ui">
        SWEET CREAM
      </text>
      <text x="28" y="22" fontSize="6" fontWeight="800" textAnchor="middle" fill="#a16207" fontFamily="ui-sans-serif, system-ui">
        BUTTER
      </text>
      <text x="28" y="28" fontSize="3" textAnchor="middle" fill="#92400e" fontFamily="ui-sans-serif, system-ui">
        1 LB · UNSALTED
      </text>
    </svg>
  );
}

export function YogurtGlyph() {
  return (
    <svg viewBox="0 0 40 48" className="h-[60px] w-auto">
      <path d="M8 8 L32 8 L30 42 L10 42 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.5" />
      <rect x="6" y="4" width="28" height="6" rx="1" fill="#dbeafe" stroke="#60a5fa" strokeWidth="0.4" />
      <rect x="11" y="14" width="18" height="22" fill="#dbeafe" stroke="#60a5fa" strokeWidth="0.3" />
      <text x="20" y="22" fontSize="3.5" fontWeight="700" textAnchor="middle" fill="#1e40af" fontFamily="ui-sans-serif, system-ui">
        GREEK
      </text>
      <text x="20" y="28" fontSize="4.5" fontWeight="800" textAnchor="middle" fill="#1e3a8a" fontFamily="ui-sans-serif, system-ui">
        VANILLA
      </text>
      <text x="20" y="34" fontSize="3" textAnchor="middle" fill="#1e40af" fontFamily="ui-sans-serif, system-ui">
        5.3 OZ
      </text>
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   New BetterBasket-style mockup primitives (for Principle + Connect pages)
   ════════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────── ChannelAgreementPanel ──────────────────── */
/* Compact pill showing which channels agree with the canonical price.        */

export function ChannelAgreementPanel({
  channels,
  className = "",
  live = false,
}: {
  channels: { name: string; status: "ok" | "fail" | "wait" }[];
  className?: string;
  /** Run a live reconciliation sweep: channels start "checking", then resolve
   *  one-by-one to their real status, hold, and re-scan — so the panel reads as
   *  a reconciliation loop, not a frozen result. */
  live?: boolean;
}) {
  const reduced = useReducedMotion();
  // Phases: 0 = all checking, 1..len = resolve k channels, len+1 = hold, repeat.
  const phase = useCyclePhase(channels.length + 2, 900, live);
  const revealed = !live || reduced ? channels.length : Math.min(phase, channels.length);

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0b1220]/95 px-3 py-2.5 backdrop-blur ${className}`}
    >
      <span className="font-mono text-[9px] uppercase tracking-[.22em] text-white/55">channels</span>
      {channels.map((c, i) => {
        const resolved = i < revealed;
        const status = resolved ? c.status : ("wait" as const);
        return (
          <span
            key={c.name}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[.18em] transition-colors duration-300 ${
              status === "ok"
                ? "border-emerald-500/35 bg-emerald-500/[.08] text-emerald-200"
                : status === "fail"
                  ? "border-rose-500/40 bg-rose-500/[.10] text-rose-200"
                  : "border-amber-500/35 bg-amber-500/[.08] text-amber-200"
            }`}
          >
            {status === "ok" ? (
              <CheckCircle2 className="h-2.5 w-2.5" />
            ) : status === "fail" ? (
              <CircleX className="h-2.5 w-2.5" />
            ) : (
              <motion.span
                animate={reduced ? undefined : { rotate: 360 }}
                transition={reduced ? undefined : { duration: 1.4, repeat: Infinity, ease: "linear" }}
                className="inline-flex"
              >
                <Hourglass className="h-2.5 w-2.5" />
              </motion.span>
            )}
            {c.name}
          </span>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────── AuditLogStream ─────────────────────────── */
/* Animated rolling audit-log mockup. Each row pre-rendered, looped opacity.  */

export function AuditLogStream({
  rows,
  className = "",
  live = false,
}: {
  rows: { t: string; event: string; actor?: string; tone?: "ok" | "warn" | "err" | "info" }[];
  className?: string;
  /** Stream rows in one-by-one (append-only) with a REC dot + blinking cursor,
   *  so the log reads as a live tail rather than a block that faded in once. */
  live?: boolean;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15%" });
  const stream = live && !reduced;
  const [count, setCount] = useState(stream ? 0 : rows.length);

  useEffect(() => {
    if (!stream) {
      setCount(rows.length);
      return;
    }
    if (!inView) return;
    setCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= rows.length) clearInterval(id);
    }, 620);
    return () => clearInterval(id);
  }, [stream, inView, rows.length]);

  const palette = {
    ok: "text-emerald-300",
    warn: "text-amber-300",
    err: "text-rose-300",
    info: "text-sky-300",
  } as const;
  const shown = stream ? rows.slice(0, count) : rows;
  const streaming = stream && count < rows.length;

  return (
    <div ref={ref} className={`rounded-2xl border border-white/10 bg-[#04070b] p-3 ${className}`}>
      <div className="flex items-center justify-between border-b border-white/[.06] pb-2">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[.22em] text-white/55">
          <Database className="h-3 w-3 text-orange-300" /> audit.log
          {stream && (
            <span className="ml-1 inline-flex items-center gap-1 text-rose-300">
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-rose-400"
                style={{ boxShadow: "0 0 8px rgba(251,113,133,.85)" }}
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
              />
              REC
            </span>
          )}
        </span>
        <span className="font-mono text-[9px] text-white/35">tamper-evident · causal</span>
      </div>
      <div className="mt-2 space-y-1.5 font-mono text-[11px] leading-snug">
        {shown.map((r, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={
              reduced
                ? undefined
                : stream
                  ? { duration: 0.35, ease: EASE.outQuart }
                  : { duration: 0.4, delay: 0.15 + i * 0.18, ease: EASE.outQuart }
            }
            className="flex items-baseline gap-2"
          >
            <span className="text-white/30">{r.t}</span>
            <span className={r.tone ? palette[r.tone] : "text-white/80"}>{r.event}</span>
            {r.actor && <span className="ml-auto text-white/35">· {r.actor}</span>}
          </motion.div>
        ))}
        {stream && (
          <div className="flex items-baseline gap-2 text-white/40">
            <span className="text-white/30">{streaming ? "T+……" : "T+02.91"}</span>
            <span className="text-white/40">{streaming ? "streaming" : "tail · sealed"}</span>
            <motion.span
              aria-hidden
              className="ml-1 inline-block h-3 w-[7px] rounded-[1px] bg-emerald-400/80"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: "steps(1)" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────── OperatorActionRow ──────────────────────── */
/* Three operator action buttons (Retry / Rollback / Resolve) with ripple.    */

export function OperatorActionRow({
  highlighted = 0,
  className = "",
}: {
  highlighted?: 0 | 1 | 2;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const actions = [
    { label: "Retry", icon: RefreshCcw, tone: "orange" },
    { label: "Rollback", icon: CircleX, tone: "rose" },
    { label: "Resolve", icon: CheckCircle2, tone: "emerald" },
  ];
  const toneRing: Record<string, string> = {
    orange: "border-orange-500/40 bg-orange-500/[.08] text-orange-200",
    rose: "border-rose-500/40 bg-rose-500/[.08] text-rose-200",
    emerald: "border-emerald-500/40 bg-emerald-500/[.08] text-emerald-200",
  };
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {actions.map((a, i) => {
        const Icon = a.icon;
        const isActive = i === highlighted;
        return (
          <div key={a.label} className="relative">
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={SPRING.gentle}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-sm transition ${
                isActive ? `${toneRing[a.tone]} font-semibold` : "border-white/10 bg-white/[.025] text-white/65"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                {a.label}
              </span>
              {isActive && !reduced && (
                <motion.span
                  className="ml-2 h-1.5 w-1.5 rounded-full bg-current"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
            </motion.button>
            {/* hand-cursor on highlighted button */}
            {isActive && (
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, ease: EASE.outQuart }}
                className="pointer-events-none absolute -right-7 top-1/2 -translate-y-1/2 text-white/55"
              >
                <Hand className="h-4 w-4" />
              </motion.span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────── LanePipe (fast / slow lanes) ───────────── */
/* Two horizontal animated pipes for the Principle page's fast/slow visual.    */

export function LanePipe() {
  const reduced = useReducedMotion();
  const safePackets = [0, 0.2, 0.4, 0.6, 0.8];
  return (
    <Stage accent="emerald" height={420} live liveLabel="LIVE · ENGINE">
      <div className="absolute inset-0 flex flex-col justify-center gap-12 px-8">
        {/* FAST LANE — safe */}
        <div className="relative">
          <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[.22em]">
            <span className="flex items-center gap-2 text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" /> fast lane · all channels agree
            </span>
            <span className="font-mono text-emerald-200/80">no friction</span>
          </div>
          <div className="relative h-16 overflow-hidden rounded-full border border-emerald-500/30 bg-emerald-500/[.04]">
            <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_18px,rgba(34,197,94,.04)_18px_36px)]" />
            {!reduced &&
              safePackets.map((p, i) => (
                <motion.span
                  key={i}
                  className="absolute top-1/2 -translate-y-1/2 h-5 w-12 rounded-md border border-emerald-500/50 bg-emerald-500/[.18] shadow-[0_0_18px_rgba(34,197,94,.45)]"
                  initial={{ left: `${-15 + p * 100}%` }}
                  animate={{ left: ["-15%", "110%"] }}
                  transition={{ duration: 4, repeat: Infinity, delay: i * 0.8, ease: "linear" }}
                />
              ))}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-emerald-500/40 bg-emerald-500/[.12] px-3 py-1 text-[10px] font-mono uppercase tracking-[.22em] text-emerald-200">
              expand
            </div>
          </div>
        </div>

        {/* SLOW LANE — escalates */}
        <div className="relative">
          <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[.22em]">
            <span className="flex items-center gap-2 text-rose-200">
              <Bell className="h-3.5 w-3.5" /> slow lane · channels disagree
            </span>
            <span className="font-mono text-rose-200/80">operator review</span>
          </div>
          <div className="relative h-16 overflow-hidden rounded-full border border-rose-500/30 bg-rose-500/[.04]">
            <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_18px,rgba(244,63,94,.04)_18px_36px)]" />
            {/* queue stuck behind gate */}
            {[0.05, 0.13, 0.21, 0.29, 0.37].map((p, i) => (
              <motion.span
                key={i}
                className="absolute top-1/2 -translate-y-1/2 h-5 w-12 rounded-md border border-rose-500/40 bg-rose-500/[.10]"
                initial={{ left: `${p * 100}%` }}
                animate={reduced ? undefined : { left: [`${p * 100}%`, `${p * 100 + 1}%`, `${p * 100}%`] }}
                transition={
                  reduced ? undefined : { duration: 2, repeat: Infinity, ease: "easeInOut" }
                }
              />
            ))}
            {/* gate */}
            <div className="absolute left-1/2 top-0 h-full w-2 -translate-x-1/2">
              <div className="h-full w-full bg-gradient-to-b from-rose-500/0 via-rose-500/70 to-rose-500/0" />
            </div>
            {/* review pill on the right */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/[.12] px-3 py-1 text-[10px] font-mono uppercase tracking-[.22em] text-rose-200">
              <Hand className="h-3 w-3" />
              human review
            </div>
          </div>
        </div>

        {/* caption */}
        <p className="text-center text-[11px] text-white/55">
          One engine. Most rollouts use the top lane. The bottom lane only opens when a
          shopper-facing channel disagrees.
        </p>
      </div>
    </Stage>
  );
}

/* ─────────────────────────────── OperatorDashboard ─────────────────────── */
/* Compact dashboard mockup highlighting human-control safeguards.            */

export function OperatorDashboard() {
  const reduced = useReducedMotion();
  // Live ack counter — ticks up to convey acknowledgements landing in real time.
  const [acks, setAcks] = useState(reduced ? 11 : 7);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setAcks((a) => (a >= 11 ? 7 : a + 1)), 1200);
    return () => clearInterval(id);
  }, [reduced]);
  return (
    <Stage accent="violet" height={460} live liveLabel="LIVE · CONSOLE">
      <div className="absolute inset-0 flex flex-col gap-3 p-5">
        {/* header */}
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b1220]/95 px-4 py-2.5 backdrop-blur">
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[.22em] text-white/65">
            <Lock className="h-3 w-3 text-violet-300" /> operator console
          </span>
          <span className="flex items-center gap-2 text-[10px] text-violet-200">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-orange-400 text-[9px] font-bold text-white">
              AD
            </span>
            Avery Davis · operator
          </span>
        </div>

        {/* safeguard chips */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {[
            { label: "Final approval", icon: Hand, tone: "primary" as const },
            { label: "Policy edits", icon: ShieldCheck, tone: "review" as const },
            { label: "API-key role", icon: Key, tone: "verified" as const },
            { label: "Audit trail", icon: Database, tone: "primary" as const },
            { label: "Manual retry", icon: RefreshCcw, tone: "warn" as const },
            { label: "Auth required", icon: Lock, tone: "review" as const },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] ${BADGE_CLASSES[s.tone]}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="truncate">{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* big expand button + state */}
        <div className="flex flex-1 items-center justify-center gap-6 rounded-2xl border border-white/10 bg-[#0b1220]/95 p-5">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[.22em] text-emerald-300">ready to expand</p>
            <p className="mt-1 text-lg font-semibold text-white">memorial-day-dallas-02</p>
            <p className="mt-0.5 text-xs text-white/55">
              All canary actions verified · 2 stores ·{" "}
              <span className="font-mono tabular-nums text-white/75">{acks}</span> acks
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/[.08] px-2 py-0.5 text-emerald-200">
                POS ✓
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/[.08] px-2 py-0.5 text-emerald-200">
                ESL ✓
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/[.08] px-2 py-0.5 text-emerald-200">
                WEB ✓
              </span>
            </div>
          </div>
          <motion.div
            animate={reduced ? undefined : { y: [-2, 2, -2] }}
            transition={reduced ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            className="relative"
          >
            <button className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#040608] shadow-[0_8px_30px_-6px_rgba(255,255,255,.4)] transition active:scale-[0.97]">
              Expand <TrendingUp className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] uppercase tracking-[.22em] text-white/45">
              awaiting operator press
            </span>
          </motion.div>
        </div>
      </div>
    </Stage>
  );
}
