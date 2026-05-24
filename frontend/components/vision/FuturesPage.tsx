"use client";

import Link from "next/link";
import { useRef } from "react";
import type { ElementType } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Boxes,
  CheckCircle2,
  CircleDot,
  Clock4,
  Eye,
  Glasses,
  Heart,
  Leaf,
  LineChart,
  Map,
  Network,
  Package,
  ScanLine,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Truck,
  Wifi,
  X,
} from "lucide-react";
import { Pill } from "./Shell";
import {
  ChapterMarker,
  CinePhoto,
  FilmGrain,
  MagneticButton,
  MagneticLink,
  Particles,
  PHOTOS,
} from "./cinematic";
import { EASE, MOTION_VARIANTS, PRESET, SPRING } from "@/lib/motion";

/* ────────────────────────────────────────────────────────────────────────────
   /vision/futures — "Beyond reliability — the product imagination."
   BetterBasket-style numbered vertical story. Each future is its own row:
   left = numbered headline + body, right = rich animated product-mockup visual.
   Every visual uses real BetterBasket-style product card chrome, not flat SVG
   charts. Every claim labeled "Vision concept · exploratory · not built today."
   ──────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────── 1. HERO ─────────────────────────────────── */

function Hero({ onScroll }: { onScroll: () => void }) {
  const reduced = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [reduced ? 1 : 1.06, reduced ? 1 : 1.22]);
  const overlay = useTransform(scrollYProgress, [0, 1], [0.6, 0.92]);

  return (
    <section ref={heroRef} className="relative isolate h-[100vh] min-h-[720px] w-full overflow-hidden">
      <div className="absolute inset-0 bg-[#04070b]" />
      <motion.div style={{ scale }} className="absolute inset-0">
        <CinePhoto src={PHOTOS.scan} alt="" />
      </motion.div>
      <motion.div
        style={{ opacity: overlay }}
        className="absolute inset-0 bg-gradient-to-b from-[#04070b]/65 via-[#04070b]/55 to-[#04070b]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(251,146,60,.16),transparent_55%),radial-gradient(ellipse_at_20%_-10%,rgba(167,139,250,.10),transparent_55%)]" />
      <Particles count={24} color="rgba(254,215,170,.45)" />

      <div className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-end px-5 pb-24 sm:px-8 sm:pb-32">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
          className="flex flex-wrap items-center gap-2"
        >
          <Pill tone="purple">Futures · product imagination</Pill>
          <Pill tone="neutral">Vision concepts · exploratory · not built today</Pill>
        </motion.div>
        <motion.h1
          initial={reduced ? false : MOTION_VARIANTS.fadeUpLarge.initial}
          animate={MOTION_VARIANTS.fadeUpLarge.animate}
          transition={{ ...PRESET.heroEntrance, delay: 0.15 }}
          className="mt-8 max-w-[22ch] text-[clamp(44px,7.5vw,120px)] font-semibold leading-[0.96] tracking-[-0.03em] text-white"
        >
          Beyond reliability —
          <br />
          <span className="bg-gradient-to-r from-orange-300 via-rose-300 to-violet-300 bg-clip-text text-transparent">
            the product imagination.
          </span>
        </motion.h1>
        <motion.p
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5 }}
          className="mt-7 max-w-2xl text-lg leading-relaxed text-white/70"
        >
          The shipped engine traces, evaluates, gates and audits every price. Below: seven
          future-state surfaces that extend the same primitives — each shown with a real
          product-mockup visual, not an abstract chart. All labeled as vision, not built today.
        </motion.p>
        <motion.div
          initial={reduced ? false : MOTION_VARIANTS.fadeUp.initial}
          animate={MOTION_VARIANTS.fadeUp.animate}
          transition={{ ...PRESET.fadeUp, delay: 0.65 }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <MagneticButton onClick={onScroll} variant="primary">
            See the seven futures <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </MagneticButton>
          <MagneticLink href="/vision/horizon" variant="ghost">
            Reliability concepts (related) <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </MagneticLink>
          <MagneticLink href="/operations" variant="quiet">
            Open Working Platform <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </MagneticLink>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── product card primitive ──────────────────── */
/* BetterBasket-style product card chrome. Reused across every future mockup. */

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

/* Sleek product card: name, glyph, price, units, badge. */
function ProductCard({
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
  glyph: ReactGlyph;
  badge?: { label: string; tone: "verified" | "warn" | "danger" | "review" | "primary" };
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
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.14em] ${
              badge.tone === "verified"
                ? "border-emerald-500/35 bg-emerald-500/[.10] text-emerald-200"
                : badge.tone === "warn"
                  ? "border-amber-500/35 bg-amber-500/[.10] text-amber-200"
                  : badge.tone === "danger"
                    ? "border-rose-500/35 bg-rose-500/[.10] text-rose-200"
                    : badge.tone === "review"
                      ? "border-violet-500/35 bg-violet-500/[.10] text-violet-200"
                      : "border-orange-500/35 bg-orange-500/[.10] text-orange-200"
            }`}
          >
            {badge.label}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── product glyphs ──────────────────────────── */
/* Compact SVG illustrations — fit into ProductCard's image area.             */

type ReactGlyph = React.ReactNode;

function MilkGlyph() {
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

function EggsGlyph() {
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

function StrawberryGlyph() {
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

function OJGlyph() {
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

function BreadGlyph() {
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

function ButterGlyph() {
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

function YogurtGlyph() {
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

/* ─────────────────────────── floating annotation ─────────────────────────── */
/* Reusable label/badge/pill that bobs and fades in.                          */

function Annotation({
  children,
  className = "",
  delay = 0,
  bob = true,
}: {
  children: React.ReactNode;
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

/* ─────────────────────────────── 7 RICH VISUAL MOCKUPS ──────────────────── */

/* Container for every visual — sets the stage size + atmospheric chrome.    */
function Stage({ children, accent = "orange" }: { children: React.ReactNode; accent?: "orange" | "violet" | "emerald" | "sky" | "rose" | "amber" }) {
  const tint =
    accent === "violet"
      ? "rgba(167,139,250,.10)"
      : accent === "emerald"
        ? "rgba(34,197,94,.10)"
        : accent === "sky"
          ? "rgba(96,165,250,.10)"
          : accent === "rose"
            ? "rgba(244,63,94,.10)"
            : accent === "amber"
              ? "rgba(245,158,11,.10)"
              : "rgba(251,146,60,.10)";
  return (
    <div className="relative h-[440px] w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#0a0e18] to-[#04070b]">
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 100%, ${tint}, transparent 60%)` }} />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <Particles count={6} color={tint.replace("0.10", "0.5")} />
      <div className="relative h-full w-full">{children}</div>
    </div>
  );
}

/* 01 — Predictive Pricing */
function PredictiveVisual() {
  const reduced = useReducedMotion();
  return (
    <Stage accent="orange">
      {/* forecast chart card top */}
      <div className="absolute inset-x-6 top-6 rounded-2xl border border-white/10 bg-[#0b1220]/90 p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[.2em] text-white/55">
            <LineChart className="h-3 w-3 text-orange-300" /> FORECAST · 14 DAYS
          </span>
          <span className="font-mono text-[10px] text-orange-300">pressure +0.42σ</span>
        </div>
        <svg viewBox="0 0 320 64" className="mt-3 h-[64px] w-full">
          <line x1="0" y1="48" x2="320" y2="48" stroke="rgba(255,255,255,.06)" />
          <motion.path
            d="M 4 36 L 36 32 L 68 38 L 100 28 L 132 24 L 164 32 L 196 18 L 228 12 L 260 22 L 292 10 L 316 6"
            stroke="#fb923c"
            strokeWidth="1.8"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={reduced ? undefined : { pathLength: [0, 1, 1] }}
            transition={reduced ? undefined : { duration: 4, repeat: Infinity, ease: EASE.outQuart, times: [0, 0.6, 1] }}
          />
          <motion.circle
            cx="292"
            cy="10"
            r="4"
            fill="#fb923c"
            animate={reduced ? undefined : { scale: [1, 1.6, 1] }}
            transition={reduced ? undefined : { duration: 1.8, repeat: Infinity }}
          />
        </svg>
      </div>

      {/* central product card */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <ProductCard
          name="Organic Whole Milk"
          units="1 GAL"
          price="$5.99"
          glyph={<MilkGlyph />}
          tone="primary"
          size="lg"
        />
      </div>

      {/* annotation pills */}
      <Annotation className="left-6 bottom-20" delay={0.6}>
        <span className="rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-[10px] uppercase tracking-[.18em] text-white/75 backdrop-blur">
          <Clock4 className="mr-1.5 inline h-3 w-3 text-orange-300" />
          review by Wed · 8:00
        </span>
      </Annotation>
      <Annotation className="right-6 bottom-20" delay={0.8}>
        <span className="rounded-full border border-orange-500/40 bg-orange-500/[.10] px-3 py-1.5 text-[10px] uppercase tracking-[.18em] text-orange-200 backdrop-blur">
          <Bell className="mr-1.5 inline h-3 w-3" />
          surfaces in queue
        </span>
      </Annotation>
    </Stage>
  );
}

/* 02 — Scenario Simulation */
function ScenarioVisual() {
  const reduced = useReducedMotion();
  return (
    <Stage accent="violet">
      {/* central "what if" hub */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-violet-500/50 bg-violet-500/[.12] backdrop-blur">
          <div className="text-center">
            <p className="font-mono text-[9px] uppercase tracking-[.18em] text-violet-200">WHAT</p>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-violet-100">IF</p>
          </div>
        </div>
      </div>

      {/* three branching lines */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {[
          ["50,50", "22,18"],
          ["50,50", "78,38"],
          ["50,50", "78,76"],
        ].map(([from, to], i) => {
          const [fx, fy] = from.split(",").map(Number);
          const [tx, ty] = to.split(",").map(Number);
          return (
            <motion.line
              key={i}
              x1={fx}
              y1={fy}
              x2={tx}
              y2={ty}
              stroke="rgba(167,139,250,.6)"
              strokeWidth="0.25"
              strokeDasharray="0.8 0.6"
              animate={reduced ? undefined : { strokeDashoffset: [0, -3] }}
              transition={reduced ? undefined : { duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
          );
        })}
      </svg>

      {/* three outcome cards */}
      <div className="absolute left-[6%] top-[10%]">
        <ProductCard
          name="Organic Milk"
          units="1 GAL"
          price="$5.39"
          oldPrice="$5.99"
          glyph={<MilkGlyph />}
          badge={{ label: "rethink", tone: "review" }}
          tone="review"
          size="sm"
        />
        <p className="mt-2 text-[10px] text-violet-200/80">if competitor −10%</p>
      </div>
      <div className="absolute right-[6%] top-[30%]">
        <ProductCard
          name="Organic Milk"
          units="1 GAL"
          price="$5.99"
          glyph={<MilkGlyph />}
          badge={{ label: "no cut", tone: "warn" }}
          tone="warn"
          size="sm"
        />
        <p className="mt-2 text-[10px] text-violet-200/80">if stock low</p>
      </div>
      <div className="absolute right-[6%] bottom-[6%]">
        <ProductCard
          name="Organic Milk"
          units="1 GAL"
          price="$6.29"
          oldPrice="$5.99"
          glyph={<MilkGlyph />}
          badge={{ label: "hold", tone: "primary" }}
          tone="primary"
          size="sm"
        />
        <p className="mt-2 text-[10px] text-violet-200/80">if holiday demand</p>
      </div>
    </Stage>
  );
}

/* 03 — Sustainability */
function SustainabilityVisual() {
  return (
    <Stage accent="emerald">
      {/* top: title strip */}
      <div className="absolute inset-x-6 top-6 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/[.06] px-4 py-2.5 backdrop-blur">
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-[.22em] text-emerald-200">
          <Leaf className="h-3.5 w-3.5" /> waste-aware markdowns · today
        </span>
        <span className="font-mono text-[10px] text-emerald-200/80">3 items at risk</span>
      </div>

      {/* three perishables row */}
      <div className="absolute left-1/2 top-[42%] flex -translate-x-1/2 items-end gap-6">
        <div className="relative">
          <ProductCard
            name="Fresh Strawberries"
            units="1 LB"
            price="$2.99"
            glyph={<StrawberryGlyph />}
            badge={{ label: "ok · 4d left", tone: "verified" }}
            tone="verified"
          />
        </div>
        <div className="relative">
          <ProductCard
            name="Organic Whole Milk"
            units="1 GAL"
            price="$3.99"
            oldPrice="$5.99"
            glyph={<MilkGlyph />}
            badge={{ label: "−33% · 4h", tone: "warn" }}
            tone="warn"
          />
          {/* glowing ring around urgent item */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 -m-2 rounded-3xl border border-amber-400/55"
            animate={{ opacity: [0.3, 0.85, 0.3] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <div className="relative">
          <ProductCard
            name="Greek Yogurt"
            units="5.3 OZ"
            price="$1.49"
            glyph={<YogurtGlyph />}
            badge={{ label: "ok · 8d left", tone: "verified" }}
            tone="verified"
          />
        </div>
      </div>

      {/* bottom: floating recommendation */}
      <Annotation className="bottom-6 left-1/2 -translate-x-1/2" delay={0.5}>
        <span className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/[.10] px-3 py-1.5 text-[11px] text-emerald-100 backdrop-blur">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Recommendation: markdown milk now, avoid 8 units shrink
        </span>
      </Annotation>
    </Stage>
  );
}

/* 04 — Competitor Tracking */
function CompetitorVisual() {
  const reduced = useReducedMotion();
  return (
    <Stage accent="sky">
      {/* top: ticker tape */}
      <div className="absolute inset-x-0 top-6 overflow-hidden border-y border-white/10 bg-[#0b1220]/95">
        <motion.div
          className="flex w-max gap-8 whitespace-nowrap py-2 text-[11px] font-mono text-white/75"
          animate={reduced ? undefined : { x: ["0%", "-50%"] }}
          transition={reduced ? undefined : { duration: 28, repeat: Infinity, ease: "linear" }}
        >
          {[...Array(2)].flatMap((_, dup) =>
            [
              ["Whole Milk 1G", "5.99", "5.49", "−.50"],
              ["Cage-Free Eggs", "4.19", "3.99", "−.20"],
              ["Premium OJ 64", "6.79", "6.99", "+.20"],
              ["Sweet Cream Butter", "4.49", "4.29", "−.20"],
              ["Fresh Bread", "3.99", "3.79", "−.20"],
              ["Greek Yogurt", "1.49", "1.59", "+.10"],
            ].map((row, i) => (
              <span key={`${dup}-${i}`} className="flex items-center gap-3">
                <span className="text-white/85">{row[0]}</span>
                <span className="text-white/55">us ${row[1]}</span>
                <span className="text-white/55">vs ${row[2]}</span>
                <span className={Number(row[3]) < -0.3 ? "text-rose-300" : Number(row[3]) < 0 ? "text-amber-300" : "text-emerald-300"}>
                  {row[3]}
                </span>
                <span className="text-white/15">·</span>
              </span>
            )),
          )}
        </motion.div>
      </div>

      {/* head-to-head cards */}
      <div className="absolute left-1/2 top-[40%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-6">
        <div className="text-center">
          <p className="mb-2 text-[10px] uppercase tracking-[.22em] text-emerald-300">ours</p>
          <ProductCard
            name="Organic Whole Milk"
            units="1 GAL"
            price="$5.99"
            glyph={<MilkGlyph />}
            badge={{ label: "approved", tone: "verified" }}
            tone="verified"
          />
        </div>

        {/* gap pill in the middle */}
        <div className="flex flex-col items-center gap-2">
          <motion.div
            animate={reduced ? undefined : { scale: [1, 1.08, 1] }}
            transition={reduced ? undefined : { duration: 2, repeat: Infinity }}
            className="flex h-16 w-16 items-center justify-center rounded-full border border-rose-500/50 bg-rose-500/[.10] backdrop-blur"
          >
            <div className="text-center">
              <p className="font-mono text-[9px] text-rose-300">GAP</p>
              <p className="font-mono text-sm font-bold text-rose-200">+$0.50</p>
            </div>
          </motion.div>
          <span className="font-mono text-[10px] text-white/45">review trigger</span>
        </div>

        <div className="text-center">
          <p className="mb-2 text-[10px] uppercase tracking-[.22em] text-rose-300">theirs</p>
          <ProductCard
            name="Brand X Whole Milk"
            units="1 GAL"
            price="$5.49"
            glyph={<MilkGlyph />}
            badge={{ label: "−9% vs us", tone: "danger" }}
            tone="danger"
          />
        </div>
      </div>

      {/* live indicator */}
      <Annotation className="bottom-6 left-6" delay={0.5} bob={false}>
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[.06] px-3 py-1 text-[10px] uppercase tracking-[.22em] text-emerald-200 backdrop-blur">
          <CircleDot className="h-2 w-2 animate-pulse" /> tracking · 412 SKUs
        </span>
      </Annotation>
    </Stage>
  );
}

/* 05 — Fairness / Trust */
function FairnessVisual() {
  const reduced = useReducedMotion();
  const items = [
    { name: "Whole Milk", price: "$5.99", glyph: <MilkGlyph />, ok: true },
    { name: "Cage-Free Eggs", price: "$4.19", glyph: <EggsGlyph />, ok: true },
    { name: "Fresh Bread", price: "$3.99", glyph: <BreadGlyph />, ok: false },
    { name: "Sweet Cream Butter", price: "$4.49", glyph: <ButterGlyph />, ok: true },
  ];
  return (
    <Stage accent="rose">
      {/* top: fairness check header */}
      <div className="absolute inset-x-6 top-6 rounded-xl border border-white/10 bg-[#0b1220]/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[.22em] text-rose-200">
            <Heart className="h-3.5 w-3.5" /> fairness audit · essentials
          </span>
          <span className="font-mono text-[10px] text-rose-200/80">1 flag · review queue</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {items.map((it, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={reduced ? { scale: 1, opacity: 1 } : { scale: [0.6, 1, 1], opacity: [0, 1, 1] }}
              transition={reduced ? undefined : { duration: 1.6, delay: 0.3 + i * 0.3, repeat: Infinity, repeatDelay: 4, times: [0, 0.5, 1] }}
              className={`flex h-5 w-5 items-center justify-center rounded-full ${it.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}
            >
              {it.ok ? <CheckCircle2 className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
            </motion.div>
          ))}
          <div className="ml-2 h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-400"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 2.2, ease: EASE.outQuart }}
            />
          </div>
        </div>
      </div>

      {/* product row */}
      <div className="absolute left-1/2 top-[58%] flex -translate-x-1/2 -translate-y-1/2 items-end gap-4">
        {items.map((it, i) => (
          <div key={i} className="relative">
            <ProductCard
              name={it.name}
              price={it.price}
              glyph={it.glyph}
              tone={it.ok ? "verified" : "danger"}
              badge={it.ok ? { label: "fair", tone: "verified" } : { label: "spike flag", tone: "danger" }}
              size="sm"
            />
            {!it.ok && (
              <Annotation className="-bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap" delay={0.8}>
                <span className="rounded-full border border-rose-500/40 bg-rose-500/[.10] px-2.5 py-1 text-[10px] font-medium text-rose-200 backdrop-blur">
                  Bread +12% w/w · essential
                </span>
              </Annotation>
            )}
          </div>
        ))}
      </div>
    </Stage>
  );
}

/* 06 — AR for Store Managers */
function ARVisual() {
  const reduced = useReducedMotion();
  return (
    <Stage accent="amber">
      {/* phone-in-3D shell */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ perspective: 900 }}>
        <motion.div
          animate={reduced ? undefined : { rotateY: [-8, 8, -8], rotateX: [4, -4, 4] }}
          transition={reduced ? undefined : { duration: 9, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformStyle: "preserve-3d" }}
          className="relative h-[300px] w-[540px] rounded-[28px] border border-white/15 bg-gradient-to-br from-[#1a1f2c] to-[#0a0d14] p-3 shadow-[0_40px_120px_-30px_rgba(245,158,11,.35)]"
        >
          {/* phone screen */}
          <div className="relative h-full w-full overflow-hidden rounded-[22px] border border-white/[.06] bg-[#0a0e18]">
            {/* fake aisle backdrop inside the phone screen */}
            <div className="absolute inset-0">
              <CinePhoto src={PHOTOS.store} alt="" />
              <div className="absolute inset-0 bg-gradient-to-b from-[#04070b]/65 to-[#04070b]/30" />
            </div>
            {/* AR HUD top */}
            <div className="relative flex items-center justify-between px-4 pt-3 text-[10px] uppercase tracking-[.22em] text-white/65">
              <span className="flex items-center gap-1.5">
                <Glasses className="h-3 w-3 text-amber-300" /> Aisle 4 · live
              </span>
              <span className="font-mono">3 anchors</span>
            </div>

            {/* floating AR product cards over the aisle */}
            <div className="absolute inset-x-0 top-[42%] flex items-end justify-center gap-3 px-4">
              {[
                { name: "Whole Milk", price: "$5.99", glyph: <MilkGlyph />, badge: { label: "verified", tone: "verified" as const }, tone: "verified" as const },
                { name: "Cage-Free Eggs", price: "$4.19", glyph: <EggsGlyph />, badge: { label: "retry pos", tone: "warn" as const }, tone: "warn" as const },
                { name: "Premium OJ 64", price: "$6.79", glyph: <OJGlyph />, badge: { label: "+$.20", tone: "primary" as const }, tone: "primary" as const },
              ].map((it, i) => (
                <motion.div
                  key={i}
                  animate={reduced ? undefined : { y: [-3, 3, -3] }}
                  transition={reduced ? undefined : { duration: 3.4 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
                >
                  <ProductCard
                    name={it.name}
                    price={it.price}
                    glyph={it.glyph}
                    badge={it.badge}
                    tone={it.tone}
                    size="sm"
                  />
                </motion.div>
              ))}
            </div>

            {/* AR anchor crosshairs */}
            <svg viewBox="0 0 540 300" className="absolute inset-0 h-full w-full pointer-events-none">
              {[
                [90, 230],
                [270, 240],
                [450, 230],
              ].map(([x, y], i) => (
                <g key={i}>
                  <circle cx={x} cy={y} r="4" fill="none" stroke="#fbbf24" strokeWidth="1" />
                  <circle cx={x} cy={y} r="1.5" fill="#fbbf24" />
                </g>
              ))}
            </svg>
          </div>
          {/* speaker pill */}
          <div className="absolute left-1/2 top-3 h-1 w-12 -translate-x-1/2 rounded-full bg-white/20" />
        </motion.div>
      </div>

      {/* caption */}
      <Annotation className="bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap" delay={0.5} bob={false}>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/[.06] px-3 py-1.5 text-[10px] uppercase tracking-[.22em] text-amber-200 backdrop-blur">
          <Wifi className="mr-1.5 inline h-3 w-3" />
          floor-tablet · device-camera AR
        </span>
      </Annotation>
    </Stage>
  );
}

/* 07 — Supply Chain Coordination */
function SupplyVisual() {
  const reduced = useReducedMotion();
  return (
    <Stage accent="emerald">
      {/* three-panel flow */}
      <div className="absolute inset-0 flex items-center justify-center gap-8 px-8">
        {/* Inventory card */}
        <div className="rounded-2xl border border-emerald-500/35 bg-[#0a141a]/95 p-5 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[.22em] text-emerald-200">INVENTORY</span>
            <Boxes className="h-4 w-4 text-emerald-300" />
          </div>
          <p className="mt-4 font-mono text-3xl font-bold tabular-nums text-white">12</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[.18em] text-white/45">units on hand</p>
          <div className="mt-3 h-1.5 w-32 overflow-hidden rounded-full bg-white/8">
            <div className="h-full w-[15%] bg-gradient-to-r from-emerald-400 to-rose-400" />
          </div>
          <p className="mt-2 text-[10px] text-rose-300">below safety stock</p>
        </div>

        {/* arrow */}
        <svg viewBox="0 0 80 20" className="h-8 w-20">
          <motion.line
            x1="2"
            y1="10"
            x2="76"
            y2="10"
            stroke="#fbbf24"
            strokeWidth="1.4"
            strokeDasharray="4 4"
            animate={reduced ? undefined : { strokeDashoffset: [0, -16] }}
            transition={reduced ? undefined : { duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <polygon points="76,10 70,6 70,14" fill="#fbbf24" />
        </svg>

        {/* Price card with BLOCKED stamp */}
        <div className="relative">
          <div className="rounded-2xl border border-rose-500/35 bg-[#1a0a0e]/95 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[.22em] text-rose-200">PRICE CUT</span>
              <TrendingDown className="h-4 w-4 text-rose-300" />
            </div>
            <p className="mt-3 font-mono text-[10px] text-white/45 line-through">$5.99</p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-rose-200">$5.39</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[.18em] text-white/45">proposed −10%</p>
          </div>
          {/* BLOCKED stamp */}
          <motion.div
            initial={{ opacity: 0, scale: 1.4, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: -12 }}
            transition={{ delay: 0.6, ...SPRING.bouncy }}
            className="absolute -right-4 -top-4 rotate-[-12deg] rounded-md border-2 border-rose-500 bg-[#1a0a0e]/95 px-3 py-1 backdrop-blur"
          >
            <p className="font-mono text-base font-extrabold tracking-[.18em] text-rose-200">BLOCKED</p>
            <p className="font-mono text-[9px] tracking-[.18em] text-rose-300/80">stock too low</p>
          </motion.div>
        </div>
      </div>

      {/* below: product reference */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <ProductCard
          name="Organic Whole Milk"
          units="1 GAL"
          price="$5.99"
          glyph={<MilkGlyph />}
          badge={{ label: "supply-paused", tone: "warn" }}
          tone="warn"
          size="sm"
        />
      </div>
    </Stage>
  );
}

/* ─────────────────────────────── future rows (story) ─────────────────────── */

type Future = {
  icon: ElementType;
  title: string;
  kicker: string;
  body: string;
  bullets: string[];
  visual: React.ReactNode;
  accent: "orange" | "violet" | "emerald" | "sky" | "rose" | "amber";
};

const FUTURES: Future[] = [
  {
    icon: LineChart,
    title: "Predictive Pricing",
    kicker: "WHAT NEEDS REVIEW NEXT WEEK",
    body: "Forecast pricing pressure from supplier cost, competitor moves, inventory and demand signals. Surface decisions that will matter — before a margin or stock-out problem opens.",
    bullets: [
      "14-day pressure forecast per SKU",
      "Surfaces in the operator's review queue",
      "Operator approves, defers, or ignores — no auto-act",
    ],
    visual: <PredictiveVisual />,
    accent: "orange",
  },
  {
    icon: Network,
    title: "Scenario Simulation",
    kicker: "IF / THEN BEFORE APPROVAL",
    body: "Test the approved action against simulated futures. Compare strategies side-by-side before pressing Expand. The engine that runs the scenario is the same one that runs live.",
    bullets: [
      "Competitor-move, supply-slip, season-start branches",
      "Each branch shows the resulting price + projected impact",
      "Compare three options; promote one to live",
    ],
    visual: <ScenarioVisual />,
    accent: "violet",
  },
  {
    icon: Leaf,
    title: "Sustainability Signals",
    kicker: "WASTE-AWARE MARKDOWNS",
    body: "Sustainability becomes a first-class signal, not an afterthought. Markdown perishables first when expiration approaches, balance margin with shrink, route fresh inventory before it dies on the shelf.",
    bullets: [
      "Days-to-expiry per perishable",
      "Recommended markdown + projected waste avoided",
      "Operator still presses the button — system just surfaces the urgent",
    ],
    visual: <SustainabilityVisual />,
    accent: "emerald",
  },
  {
    icon: ScanLine,
    title: "Real-Time Competitor Tracking",
    kicker: "WHERE PRICES MAY NEED REVIEW",
    body: "Continuously observe competitor pricing on KVIs. When gap-to-competitor crosses a threshold, the SKU lands in the review queue — surfaced, not auto-changed.",
    bullets: [
      "Ticker of every SKU under watch",
      "Configurable gap thresholds (per category, per zone)",
      "Audit trail of every observation and review trigger",
    ],
    visual: <CompetitorVisual />,
    accent: "sky",
  },
  {
    icon: Heart,
    title: "Pricing Fairness · Customer Trust",
    kicker: "FLAG WHAT MIGHT FEEL UNFAIR",
    body: "Surface unexpected spikes on essential items, inconsistent pricing across similar SKUs, aggressive changes during sensitive events. Trust is a measurable surface, not a hope.",
    bullets: [
      "Essentials list (bread, eggs, milk, butter, …)",
      "Spike / inconsistency / sensitivity flags",
      "Flag goes to review — humans decide intent",
    ],
    visual: <FairnessVisual />,
    accent: "rose",
  },
  {
    icon: Glasses,
    title: "AR for Store Managers",
    kicker: "PRICES IN PHYSICAL CONTEXT",
    body: "A manager holds a phone or tablet to the shelf; price actions, pending updates, and substitution recommendations overlay onto the real aisle. Execution issues become visible in situ.",
    bullets: [
      "Device-camera AR (no headset)",
      "Anchored to shelf-edge labels",
      "Tap to retry · roll back · escalate — same operator controls",
    ],
    visual: <ARVisual />,
    accent: "amber",
  },
  {
    icon: Truck,
    title: "Predictive Supply-Chain Coordination",
    kicker: "DON'T PRICE WHAT YOU CAN'T FULFILL",
    body: "Tie pricing decisions to live inventory and replenishment timing. The engine blocks an attractive price cut when stock is about to run out — and surfaces promotion conflicts before they reach the shelf.",
    bullets: [
      "Reads inventory snapshot per SKU per store",
      "Blocks promotional cuts that would over-stress supply",
      "Surfaces alternate substitution recommendations",
    ],
    visual: <SupplyVisual />,
    accent: "emerald",
  },
];

function StoryRow({ future, index }: { future: Future; index: number }) {
  const Icon = future.icon;
  const flip = index % 2 === 1;
  return (
    <section className="relative">
      <div className="relative mx-auto grid max-w-[1400px] gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.3fr] lg:items-center">
        {/* Numbered circle on the left margin (always there) */}
        <div className="absolute left-4 top-16 hidden h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#04070b] font-mono text-[11px] font-semibold text-white/55 sm:flex">
          {String(index + 1).padStart(2, "0")}
        </div>

        {/* Text column */}
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.7, ease: EASE.outQuart }}
          className={`min-w-0 ${flip ? "lg:order-2" : "lg:order-1"}`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] text-orange-300">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-[10px] uppercase tracking-[.22em] text-orange-300/80">{future.kicker}</span>
          </div>
          <h3 className="mt-5 text-[clamp(28px,3.5vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            {future.title}
          </h3>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/65">{future.body}</p>
          <ul className="mt-6 space-y-2.5">
            {future.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-white/70">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2 text-[10px] uppercase tracking-[.18em] text-white/45">
            <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">vision concept</span>
            <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">extends shipped engine</span>
            <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">operator stays in control</span>
          </div>
        </motion.div>

        {/* Visual column */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, delay: 0.1, ease: EASE.outQuart }}
          className={`min-w-0 ${flip ? "lg:order-1" : "lg:order-2"}`}
        >
          {future.visual}
        </motion.div>
      </div>
      {/* connecting vertical line */}
      <div className="absolute left-[33px] top-0 h-full w-px bg-gradient-to-b from-transparent via-white/8 to-transparent hidden sm:block" />
    </section>
  );
}

function FuturesStory({ anchorRef }: { anchorRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div ref={anchorRef} className="scroll-mt-12">
      <ChapterMarker n="01" label="Seven futures" />
      <div className="mx-auto max-w-[1400px] px-5 pt-6 sm:px-8">
        <div className="max-w-3xl">
          <Pill tone="orange">Each card extends the shipped engine</Pill>
          <h2 className="mt-5 text-[clamp(30px,4.5vw,60px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            Trace · evaluate · gate · audit —
            <br />
            same primitives, broader surface.
          </h2>
        </div>
      </div>
      {FUTURES.map((f, i) => (
        <StoryRow key={f.title} future={f} index={i} />
      ))}
    </div>
  );
}

/* ─────────────────────────── 3. THE THREAD ─────────────────────────────── */

function TheThread() {
  return (
    <section>
      <ChapterMarker n="02" label="The thread" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-orange-500/[.04] via-transparent to-violet-500/[.04] p-8 sm:p-12">
          <Pill tone="orange">Why they all fit</Pill>
          <h2 className="mt-5 max-w-3xl text-[clamp(28px,4vw,52px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            Every future capability reuses the same four shipped primitives.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: "Trace", v: "Every decision carries a causal record", icon: Eye },
              { k: "Evaluate", v: "Deterministic rules + scenario-driven adapters", icon: Boxes },
              { k: "Gate", v: "Canary containment · expansion blocked on disagreement", icon: ScanLine },
              { k: "Audit", v: "Tamper-evident trail · ack precedes resolve · always", icon: Sparkles },
            ].map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.k}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.55, delay: i * 0.06, ease: EASE.outQuart }}
                  className="rounded-2xl border border-white/10 bg-white/[.025] p-5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] text-orange-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="mt-4 text-lg font-semibold text-white">{p.k}</p>
                  <p className="mt-1 text-sm text-white/55">{p.v}</p>
                </motion.div>
              );
            })}
          </div>
          <p className="mt-8 max-w-2xl text-base leading-relaxed text-white/65">
            None of the seven futures require throwing the engine away. They're additive surfaces on
            top of the same reliability spine — each can ship on its own timeline, each carries the
            same audit guarantees.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── 4. CLOSING BRIDGE ─────────────────────────── */

function ClosingCta() {
  return (
    <section className="relative mx-auto max-w-[1400px] px-5 pb-28 pt-12 sm:px-8 sm:pb-32">
      <div className="relative overflow-hidden rounded-[32px] border border-orange-500/25 bg-gradient-to-br from-orange-500/[.06] via-transparent to-violet-500/[.06]">
        <div className="relative grid items-center gap-10 px-8 py-16 sm:px-14 sm:py-20 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <Pill tone="orange">Built today · vision tomorrow</Pill>
            <h3 className="mt-5 text-[clamp(28px,4vw,64px)] font-semibold leading-[1.04] tracking-[-0.02em] text-white">
              The engine is real. The futures extend it.
            </h3>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
              The Working Platform is what's shipped — outbox · canary containment ·
              audit-verified recovery · 47 PostgreSQL-backed tests. Concepts lists the four
              reliability-focused next steps. This page lists the broader product imagination.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <MagneticLink href="/operations" variant="primary">
                Open Working Platform <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </MagneticLink>
              <MagneticLink href="/vision/horizon" variant="ghost">
                Concrete next concepts <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </MagneticLink>
              <MagneticLink href="/vision/keynote" variant="quiet">
                Back to Keynote <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </MagneticLink>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={SPRING.gentle}
            className="rounded-2xl border border-white/10 bg-[#0b0f18]/90 p-5"
          >
            <p className="text-[10px] tracking-[.2em] text-orange-300 uppercase">Principle</p>
            <p className="mt-3 text-base font-medium leading-snug text-white">
              &ldquo;Imagination doesn't replace evidence. It extends it.&rdquo;
            </p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-white/45">
              ShelfTrace · independent execution-reliability prototype
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────── PAGE ─────────────────────────────────── */

export default function FuturesPage() {
  const storyRef = useRef<HTMLDivElement>(null);
  return (
    <div className="relative bg-[#04070b]">
      <FilmGrain id="futures" />
      <Hero onScroll={() => storyRef.current?.scrollIntoView({ behavior: "smooth" })} />
      <FuturesStory anchorRef={storyRef} />
      <TheThread />
      <ClosingCta />
    </div>
  );
}
