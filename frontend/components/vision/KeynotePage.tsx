"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { EASE, MOTION_VARIANTS, PRESET, SPRING } from "@/lib/motion";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleDot,
  Database,
  FlaskConical,
  Layers3,
  MapPinned,
  Moon,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Tablet,
  X,
} from "lucide-react";
import { Pill } from "./Shell";
import {
  ChannelAgreementPanel,
  MilkGlyph as SharedMilkGlyph,
  ProductCard,
} from "./cinematic";

/* ────────────────────────────────────────────────────────────────────────────
   /vision/keynote — ShelfTrace cinematic, evidence-first.
   Cinematic polish pass: real photo backdrops (dimmed), chapter rail, chapter
   announcement cards, cursor spotlight on the aisle, ambient particles in dark
   spaces, timecode HUD during the critical moment, line-stagger headline
   reveals. No vanity stats, no unsupported tech terms. 47 PostgreSQL-backed
   tests, configurable scenarios, certification lab, live control plane,
   deterministic reconciliation, audit-verified recovery. CinePhoto fallback
   to gradient art if any Unsplash photo 404s.
   ──────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────── photo set ───────────────────────────────── */

const PHOTOS = {
  aisle: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=2400&auto=format&fit=crop&q=80",
  cart: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=2000&auto=format&fit=crop&q=80",
  cold: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=2000&auto=format&fit=crop&q=80",
  scan: "https://images.unsplash.com/photo-1601598851547-4302969d0614?w=2000&auto=format&fit=crop&q=80",
  store: "https://images.unsplash.com/photo-1601612625308-6e16ae8c95ac?w=2000&auto=format&fit=crop&q=80",
};

function CinePhoto({
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
    <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`} style={{ background: fallback }}>
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

/* ─────────────────────────────── film grain overlay ──────────────────────── */

function FilmGrain() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full opacity-[.045] mix-blend-overlay"
    >
      <filter id="kn-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#kn-grain)" />
    </svg>
  );
}

/* ─────────────────────────────── ambient particles ───────────────────────── */
/* Drifting dust motes — purely decorative, CSS-transform animated.            */

function Particles({ count = 18, color = "rgba(251,146,60,.55)" }: { count?: number; color?: string }) {
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

/* ─────────────────────────────── chapter rail (sticky left) ──────────────── */

const CHAPTERS = [
  { id: "ch-aisle", label: "The Aisle", anchor: "scene-aisle" },
  { id: "ch-scan", label: "The Scan", anchor: "scene-scan" },
  { id: "ch-decision", label: "The Decision", anchor: "scene-decision" },
  { id: "ch-recovery", label: "The Recovery", anchor: "scene-recovery" },
  { id: "ch-promise", label: "The Promise", anchor: "scene-promise" },
  { id: "ch-handoff", label: "The Hand-off", anchor: "scene-handoff" },
  { id: "ch-night", label: "The Night", anchor: "scene-night" },
];

function ChapterRail() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      let idx = 0;
      for (let i = 0; i < CHAPTERS.length; i++) {
        const el = document.getElementById(CHAPTERS[i].anchor);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top < window.innerHeight * 0.4) idx = i;
      }
      setActive(idx);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav
      aria-label="Keynote chapters"
      className="pointer-events-none fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 lg:block"
    >
      <ol className="pointer-events-auto flex flex-col gap-3 rounded-full border border-white/10 bg-black/45 px-3 py-4 backdrop-blur-xl">
        {CHAPTERS.map((c, i) => {
          const isActive = i === active;
          return (
            <li key={c.id} className="group relative">
              <a
                href={`#${c.anchor}`}
                className="flex items-center gap-3"
                aria-current={isActive ? "true" : undefined}
              >
                <motion.span
                  initial={false}
                  animate={{ scale: isActive ? 1.15 : 1 }}
                  transition={SPRING.gentle}
                  className={`block h-[10px] w-[10px] rounded-full border transition-colors duration-150 ${
                    isActive
                      ? "border-orange-300 bg-orange-400 shadow-[0_0_10px_rgba(249,115,22,.6)]"
                      : i < active
                        ? "border-orange-400/50 bg-orange-400/40"
                        : "border-white/30 bg-transparent group-hover:border-white/55"
                  }`}
                />
                {/* Tooltip — origin-aware enter/exit, exit always faster than enter. */}
                <motion.span
                  initial={false}
                  animate={{
                    opacity: isActive ? 1 : 0,
                    x: isActive ? 0 : -4,
                    pointerEvents: isActive ? "auto" : "none",
                  }}
                  whileHover={{ opacity: 1, x: 0 }}
                  transition={isActive ? PRESET.tooltipIn : PRESET.tooltipOut}
                  className={`pointer-events-none absolute left-7 origin-left whitespace-nowrap rounded-md border border-white/10 bg-black/70 px-2 py-1 text-[10px] uppercase tracking-[.2em] backdrop-blur ${
                    isActive ? "text-orange-200" : "text-white/60"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")} · {c.label}
                </motion.span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ─────────────────────────────── chapter marker (inline) ─────────────────── */
/* Brief animated chapter announcement that appears as you enter a section.    */

function ChapterMarker({ n, label }: { n: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30% 0px -50% 0px" });
  const reduced = useReducedMotion();
  return (
    <div ref={ref} className="relative mx-auto max-w-[1400px] px-5 pt-16 sm:px-8 sm:pt-20">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
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

/* ─────────────────────────────── cursor spotlight ────────────────────────── */

function CursorSpotlight({ children, color = "rgba(249,115,22,.18)" }: { children: React.ReactNode; color?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sx = useSpring(50, SPRING.gentle as any);
  const sy = useSpring(50, SPRING.gentle as any);
  const reduced = useReducedMotion();
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    sx.set(((e.clientX - r.left) / r.width) * 100);
    sy.set(((e.clientY - r.top) / r.height) * 100);
  };
  const bg = useTransform([sx, sy], ([x, y]) => `radial-gradient(420px circle at ${x}% ${y}%, ${color}, transparent 65%)`);
  return (
    <div ref={wrapRef} onMouseMove={onMove} className="relative">
      <motion.div aria-hidden style={{ background: bg as any }} className="pointer-events-none absolute inset-0 -z-10" />
      {children}
    </div>
  );
}

/* ─────────────────────────────── line-stagger H1 reveal ──────────────────── */

function RevealHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.h1
      initial={reduced ? false : MOTION_VARIANTS.fadeUpLarge.initial}
      animate={MOTION_VARIANTS.fadeUpLarge.animate}
      transition={{ ...PRESET.heroEntrance, delay: 0.15 }}
      className={className}
    >
      {children}
    </motion.h1>
  );
}

/* ─────────────────────────────── magnetic buttons ────────────────────────── */
/* Polished CTA primitives:                                                   *
 *  • scale-down on press (active:scale-[0.97]) — Linear/Vercel cue           *
 *  • subtle 1px translate on hover via group utility                         *
 *  • three tones: primary (white pill on dark), ghost (bordered), quiet      *
 * Uses CSS transitions only — no JS overhead per button.                     */

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

function MagneticButton({
  onClick,
  children,
  variant = "primary",
}: {
  onClick?: () => void;
  children: React.ReactNode;
  variant?: CtaVariant;
}) {
  return (
    <button onClick={onClick} className={CTA_CLASSES[variant]}>
      {children}
    </button>
  );
}

function MagneticLink({
  href,
  children,
  variant = "ghost",
}: {
  href: string;
  children: React.ReactNode;
  variant?: CtaVariant;
}) {
  return (
    <Link href={href} className={CTA_CLASSES[variant]}>
      {children}
    </Link>
  );
}

/* ─────────────────────────────── timecode HUD ────────────────────────────── */

function TimecodeHUD({ play }: { play: boolean }) {
  const [t, setT] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!play || reduced) return;
    let raf = 0;
    let start = performance.now();
    const tick = (now: number) => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, reduced]);
  const mm = String(Math.floor(t / 60)).padStart(2, "0");
  const ss = String(Math.floor(t % 60)).padStart(2, "0");
  const ms = String(Math.floor((t % 1) * 100)).padStart(2, "0");
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-10 flex items-center gap-2 rounded-md border border-white/15 bg-black/65 px-3 py-1.5 backdrop-blur">
      <span className="flex items-center gap-1.5">
        <CircleDot className="h-2 w-2 animate-pulse text-rose-400" />
        <span className="text-[9px] uppercase tracking-[.22em] text-rose-300">REC</span>
      </span>
      <span className="font-mono text-[11px] tabular-nums text-white/75">
        {mm}:{ss}.{ms}
      </span>
    </div>
  );
}

/* ─────────────────────────────── illustrated products ────────────────────── */

function MilkBottle({ glow }: { glow?: boolean }) {
  return (
    <svg viewBox="0 0 60 100" className="h-full w-full">
      <defs>
        <linearGradient id="m-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="1" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>
      {glow && <ellipse cx="30" cy="55" rx="36" ry="44" fill="rgba(251,146,60,.18)" />}
      <rect x="22" y="6" width="16" height="22" rx="2" fill="url(#m-body)" stroke="#94a3b8" strokeWidth="0.6" />
      <rect x="20" y="3" width="20" height="7" rx="2" fill="#dc2626" />
      <rect x="8" y="26" width="44" height="68" rx="6" fill="url(#m-body)" stroke="#94a3b8" strokeWidth="0.8" />
      <rect x="12" y="44" width="36" height="34" fill="#ffffff" stroke="#e2e8f0" />
      <text x="30" y="58" fontSize="6.5" fontWeight="700" textAnchor="middle" fill="#0f172a" fontFamily="ui-sans-serif, system-ui">
        ORGANIC
      </text>
      <text x="30" y="66" fontSize="5.5" textAnchor="middle" fill="#475569" fontFamily="ui-sans-serif, system-ui">
        WHOLE MILK
      </text>
      <text x="30" y="74" fontSize="5" textAnchor="middle" fill="#64748b" fontFamily="ui-sans-serif, system-ui">
        1 GAL
      </text>
    </svg>
  );
}

function EggCarton({ glow }: { glow?: boolean }) {
  return (
    <svg viewBox="0 0 100 50" className="h-full w-full">
      {glow && <ellipse cx="50" cy="30" rx="46" ry="22" fill="rgba(251,146,60,.18)" />}
      <path d="M4 24 Q8 18 14 18 L86 18 Q92 18 96 24 L96 44 Q92 48 86 48 L14 48 Q8 48 4 44 Z" fill="#78350f" stroke="#451a03" strokeWidth="0.6" />
      <path d="M4 24 L96 24" stroke="#451a03" strokeWidth="0.5" />
      {[14, 28, 42, 56, 70, 84].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="28" rx="5.5" ry="4" fill="#fef3c7" stroke="#fcd34d" strokeWidth="0.4" />
          <ellipse cx={x - 1.5} cy="26" rx="1.5" ry="1" fill="#fffbeb" />
        </g>
      ))}
      <rect x="32" y="36" width="36" height="8" rx="1" fill="#fffbeb" stroke="#fcd34d" strokeWidth="0.3" />
      <text x="50" y="42" fontSize="4" fontWeight="700" textAnchor="middle" fill="#78350f" fontFamily="ui-sans-serif, system-ui">
        CAGE-FREE DOZEN
      </text>
    </svg>
  );
}

function StrawberryPunnet({ glow }: { glow?: boolean }) {
  return (
    <svg viewBox="0 0 100 70" className="h-full w-full">
      {glow && <ellipse cx="50" cy="40" rx="46" ry="30" fill="rgba(251,146,60,.18)" />}
      <path d="M6 28 L94 28 L88 64 L12 64 Z" fill="rgba(15,23,42,.85)" stroke="#475569" strokeWidth="0.6" />
      {[20, 32, 44, 56, 68, 80].map((x) => (
        <line key={x} x1={x} y1="28" x2={x - 2} y2="64" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
      ))}
      {[
        [22, 24],
        [38, 22],
        [54, 25],
        [70, 22],
        [30, 14],
        [48, 12],
        [66, 14],
        [80, 22],
      ].map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x} ${y} L${x - 6} ${y + 6} Q${x} ${y + 12} ${x + 6} ${y + 6} Z`} fill="#dc2626" />
          <path d={`M${x - 4} ${y} L${x} ${y - 3} L${x + 4} ${y} Z`} fill="#16a34a" />
        </g>
      ))}
    </svg>
  );
}

function OrangeJuiceCarton({ glow }: { glow?: boolean }) {
  return (
    <svg viewBox="0 0 60 100" className="h-full w-full">
      <defs>
        <linearGradient id="oj-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      {glow && <ellipse cx="30" cy="55" rx="36" ry="44" fill="rgba(251,146,60,.18)" />}
      <path d="M8 16 L30 4 L52 16 L52 22 L8 22 Z" fill="#fb923c" stroke="#9a3412" strokeWidth="0.5" />
      <rect x="8" y="22" width="44" height="74" rx="2" fill="url(#oj-body)" stroke="#9a3412" strokeWidth="0.6" />
      <rect x="12" y="36" width="36" height="42" fill="rgba(255,255,255,0.92)" stroke="#9a3412" strokeWidth="0.3" />
      <text x="30" y="48" fontSize="5.5" fontWeight="700" textAnchor="middle" fill="#9a3412" fontFamily="ui-sans-serif, system-ui">
        PREMIUM
      </text>
      <text x="30" y="60" fontSize="10" fontWeight="800" textAnchor="middle" fill="#ea580c" fontFamily="ui-sans-serif, system-ui">
        OJ
      </text>
      <text x="30" y="70" fontSize="4.5" textAnchor="middle" fill="#9a3412" fontFamily="ui-sans-serif, system-ui">
        NOT FROM CONCENTRATE
      </text>
      <circle cx="30" cy="86" r="3.5" fill="#fb923c" stroke="#9a3412" strokeWidth="0.3" />
      <path d="M28 84 Q30 81 32 84" stroke="#15803d" strokeWidth="0.5" fill="none" />
    </svg>
  );
}

/* ─────────────────────────────── illustrated shelf ───────────────────────── */

function AisleShelf({
  selected,
  onSelect,
  litUp = true,
}: {
  selected?: string | null;
  onSelect?: (id: string) => void;
  litUp?: boolean;
}) {
  const reduced = useReducedMotion();
  const products: Array<{
    id: string;
    label: string;
    price: string;
    Comp: React.FC<{ glow?: boolean }>;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [
    { id: "milk", label: "Organic Whole Milk", price: "$5.99", Comp: MilkBottle, x: 80, y: 100, w: 90, h: 150 },
    { id: "eggs", label: "Cage-Free Eggs", price: "$4.19", Comp: EggCarton, x: 220, y: 165, w: 140, h: 70 },
    { id: "strawberries", label: "Fresh Strawberries", price: "$3.49", Comp: StrawberryPunnet, x: 410, y: 155, w: 130, h: 85 },
    { id: "oj", label: "Premium Orange Juice", price: "$6.79", Comp: OrangeJuiceCarton, x: 590, y: 100, w: 80, h: 150 },
  ];

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#0a0d14] via-[#0c1018] to-[#06080c]">
      <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-transparent via-amber-200/30 to-transparent" />
      {litUp && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_center_top,rgba(254,243,199,.18),transparent_70%)]" />
      )}
      {litUp && (
        <div className="pointer-events-none absolute left-0 top-16 h-[260px] w-[220px] bg-[radial-gradient(ellipse_at_left,rgba(56,189,248,.18),transparent_70%)]" />
      )}
      <div className="absolute inset-x-6 top-20 bottom-16 rounded-2xl border border-white/[.05] bg-[#11161f]/60" />
      <div className="absolute inset-x-10 top-[90px] h-[2px] bg-gradient-to-r from-transparent via-orange-300/50 to-transparent" />
      <div className="absolute inset-x-6 top-[268px] h-[12px] rounded bg-[#1c2433] shadow-[inset_0_2px_4px_rgba(0,0,0,.6)]" />
      <Particles count={10} color="rgba(254,243,199,.45)" />

      <svg viewBox="0 0 780 420" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
        <ellipse cx="390" cy="380" rx="280" ry="14" fill="rgba(251,146,60,0.06)" />
        {products.map((p) => {
          const isSelected = selected === p.id;
          const isFaded = selected && selected !== p.id;
          return (
            <g
              key={p.id}
              transform={`translate(${p.x} ${p.y})`}
              className="cursor-pointer"
              style={{ opacity: isFaded ? 0.35 : 1, transition: "opacity .3s" }}
              onClick={() => onSelect?.(p.id)}
            >
              <foreignObject x="0" y="0" width={p.w} height={p.h}>
                <motion.div
                  whileHover={reduced ? undefined : { y: -4 }}
                  transition={{ type: "spring", stiffness: 280, damping: 22 }}
                  className="h-full w-full"
                >
                  <p.Comp glow={isSelected} />
                </motion.div>
              </foreignObject>
              <g transform={`translate(${p.w / 2 - 30} ${p.h + 8})`}>
                <rect
                  width="60"
                  height="22"
                  rx="3"
                  fill={isSelected ? "#fb923c" : "#1c2433"}
                  stroke={isSelected ? "#f97316" : "#334155"}
                  strokeWidth="0.6"
                />
                <text
                  x="30"
                  y="14"
                  fontSize="10"
                  fontWeight="700"
                  textAnchor="middle"
                  fill={isSelected ? "#0f172a" : "#fff7ed"}
                  fontFamily="ui-monospace, monospace"
                >
                  {p.price}
                </text>
              </g>
              <rect x="0" y="0" width={p.w} height={p.h + 32} fill="transparent" />
            </g>
          );
        })}
        {litUp && !reduced && (
          <g>
            <line x1="40" y1="320" x2="740" y2="320" stroke="rgba(251,146,60,0.18)" strokeWidth="1.5" />
            <motion.line
              x1="40"
              y1="320"
              x2="740"
              y2="320"
              stroke="#fb923c"
              strokeWidth="1.5"
              strokeDasharray="14 200"
              animate={{ strokeDashoffset: [0, -428] }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            />
          </g>
        )}
      </svg>

      {onSelect && !selected && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[11px] text-white/55 backdrop-blur">
          Click any product to inspect its execution path
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── 0. Store Awakening ──────────────────────── */

function StoreAwakening({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (reduced) {
      setStage(4);
      const t = setTimeout(onDone, 200);
      return () => clearTimeout(t);
    }
    const seq = [800, 1400, 2200, 3200, 4200];
    const timers = seq.map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    const done = setTimeout(onDone, 4800);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [reduced, onDone]);

  return (
    <motion.section
      key="awakening"
      className="fixed inset-0 z-[55] flex items-center justify-center bg-[#02030a]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        initial={{ opacity: 0, width: 0 }}
        animate={{ opacity: stage >= 1 ? 1 : 0, width: stage >= 1 ? "62%" : 0 }}
        transition={{ duration: 0.9 }}
        className="absolute top-1/2 left-1/2 h-[2px] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-orange-400 to-transparent"
        style={{ boxShadow: "0 0 24px rgba(251,146,60,.7)" }}
      />
      {[0.18, 0.34, 0.5, 0.66, 0.82].map((x, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: stage >= 2 ? 0.85 : 0, scale: stage >= 2 ? 1 : 0.4 }}
          transition={{ duration: 0.5, delay: i * 0.08 }}
          className="absolute top-[20%] h-2 w-12 rounded-full bg-amber-200/80 blur-[2px]"
          style={{ left: `${x * 100}%`, boxShadow: "0 0 32px rgba(254,243,199,.6)" }}
        />
      ))}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: stage >= 3 ? 1 : 0 }}
        transition={{ duration: 0.8 }}
        className="absolute left-[6%] top-[20%] h-[60%] w-[20%] rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.22),transparent_70%)]"
      />
      <div className="relative z-10 max-w-xl px-6 text-center">
        <AnimatePresence mode="wait">
          {stage <= 1 && (
            <motion.p
              key="prep"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5 }}
              className="font-mono text-sm tracking-[.22em] text-orange-300/85 uppercase"
            >
              Preparing execution environment…
            </motion.p>
          )}
          {stage >= 2 && stage <= 3 && (
            <motion.p
              key="ready"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5 }}
              className="font-mono text-sm tracking-[.22em] text-emerald-300/90 uppercase"
            >
              Store channel simulation ready
            </motion.p>
          )}
          {stage >= 4 && (
            <motion.p
              key="opening"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-mono text-sm tracking-[.22em] text-white/55 uppercase"
            >
              Opening the aisle…
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <button
        onClick={onDone}
        className="absolute bottom-6 right-6 rounded-full border border-white/15 bg-white/[.04] px-3 py-1.5 text-[11px] tracking-[.18em] text-white/55 uppercase hover:text-white"
      >
        Skip intro
      </button>
    </motion.section>
  );
}

/* ─────────────────────────────── 1. HERO with photo backdrop ─────────────── */

function Hero({ onScanner }: { onScanner: () => void }) {
  const reduced = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const photoScale = useTransform(scrollYProgress, [0, 1], [reduced ? 1 : 1.08, reduced ? 1 : 1.26]);
  const photoY = useTransform(scrollYProgress, [0, 1], ["0%", "14%"]);
  const photoBlur = useTransform(scrollYProgress, [0, 1], ["0px", "6px"]);
  const photoFilter = useTransform(photoBlur, (v) => `blur(${v})`);
  const overlayA = useTransform(scrollYProgress, [0, 1], [0.62, 0.92]);
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "-6%"]);

  return (
    <section ref={heroRef} className="relative isolate h-[100vh] min-h-[760px] w-full overflow-hidden">
      {/* layer 0: dark base */}
      <div className="absolute inset-0 bg-[#04070b]" />
      {/* layer 1: photo with Ken-Burns + parallax + scroll-blur */}
      <motion.div
        style={{ scale: photoScale, y: photoY, filter: photoFilter as any }}
        className="absolute inset-0"
      >
        <CinePhoto src={PHOTOS.aisle} alt="Grocery aisle, early light" />
      </motion.div>
      {/* layer 2: deep vignette + tonal grade */}
      <motion.div
        style={{ opacity: overlayA }}
        className="absolute inset-0 bg-gradient-to-b from-[#04070b]/60 via-[#04070b]/55 to-[#04070b]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_130%,rgba(249,115,22,.22),transparent_60%),radial-gradient(ellipse_at_18%_-10%,rgba(56,189,248,.12),transparent_55%)]" />
      {/* layer 3: thin horizon line */}
      <div className="absolute inset-x-0 top-[62%] h-px bg-gradient-to-r from-transparent via-orange-400/30 to-transparent" />
      {/* layer 4: floating particles */}
      <Particles count={22} color="rgba(254,215,170,.5)" />

      <motion.div
        style={{ y: contentY }}
        className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-end px-5 pb-24 sm:px-8 sm:pb-32"
      >
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
          className="flex flex-wrap items-center gap-2"
        >
          <Pill tone="orange">Keynote · cinematic vision</Pill>
          <Pill tone="neutral">Independent execution-reliability prototype</Pill>
        </motion.div>
        <RevealHeading className="mt-8 max-w-[22ch] text-[clamp(48px,8vw,128px)] font-semibold leading-[0.94] tracking-[-0.03em] text-white">
          A price is not real until{" "}
          <span className="bg-gradient-to-r from-orange-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">
            every surface agrees.
          </span>
        </RevealHeading>
        <motion.p
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5 }}
          className="mt-7 max-w-2xl text-lg leading-relaxed text-white/70"
        >
          ShelfTrace protects approved grocery price actions as they move through shelf labels,
          checkout systems and ecommerce channels.
        </motion.p>
        <motion.div
          initial={reduced ? false : MOTION_VARIANTS.fadeUp.initial}
          animate={MOTION_VARIANTS.fadeUp.animate}
          transition={{ ...PRESET.fadeUp, delay: 0.65 }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <MagneticButton onClick={onScanner} variant="primary">
            Watch the price move
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </MagneticButton>
          <MagneticLink href="/operations" variant="ghost">
            Open Working Platform <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </MagneticLink>
          <MagneticLink href="/engineering" variant="quiet">
            View Engineering Proof <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </MagneticLink>
        </motion.div>
        {!reduced && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6 }}
            className="absolute bottom-7 left-1/2 -translate-x-1/2 text-white/35"
          >
            <ChevronDown className="h-5 w-5 animate-bounce" />
          </motion.div>
        )}
      </motion.div>
    </section>
  );
}

/* ─────────────────────────────── 2. Product Aisle (with spotlight) ───────── */

type ProductStory = {
  id: "milk" | "eggs" | "strawberries" | "oj";
  name: string;
  tag: string;
  scenario: string;
  rows: { label: string; value: string; tone: "ok" | "err" | "warn" | "info" }[];
  status: { tone: "ok" | "err" | "warn"; text: string };
  recovery?: string;
  cta?: { href: string; label: string };
};

const STORIES: Record<string, ProductStory> = {
  milk: {
    id: "milk",
    name: "Organic Whole Milk · 1 Gallon",
    tag: "Working custom scenario",
    scenario: "Approved $5.99 · POS reported $6.49 · expansion blocked, then recovered after acknowledgement",
    rows: [
      { label: "Approved execution price", value: "$5.99", tone: "info" },
      { label: "Shelf Label", value: "$5.99 · verified", tone: "ok" },
      { label: "Ecommerce", value: "$5.99 · verified", tone: "ok" },
      { label: "Checkout POS", value: "$6.49 · mismatch +$0.50", tone: "err" },
    ],
    status: { tone: "err", text: "Critical mismatch · expansion blocked" },
    recovery:
      "POS acknowledged $5.99 → deterministic reconciliation verified → incident resolved · eligible for controlled expansion.",
    cta: { href: "/scenarios", label: "Build a scenario" },
  },
  eggs: {
    id: "eggs",
    name: "Cage-Free Eggs · 1 Dozen",
    tag: "Working live rollout scenario",
    scenario: "Approved $4.19 · canary mismatch in one store · expansion blocked before spread",
    rows: [
      { label: "Approved execution price", value: "$4.19", tone: "info" },
      { label: "Store 214 · checkout", value: "$4.59 · mismatch", tone: "err" },
      { label: "Store 302 · checkout", value: "$4.19 · verified", tone: "ok" },
      { label: "Expansion stores", value: "Held — waiting on canary", tone: "warn" },
    ],
    status: { tone: "warn", text: "Expansion blocked before mismatch spreads across the zone" },
    cta: { href: "/operations", label: "Open live operations" },
  },
  strawberries: {
    id: "strawberries",
    name: "Fresh Strawberries · 1 lb",
    tag: "Working deadline-risk scenario",
    scenario: "Markdown execution dispatched · shelf-label acknowledgement delayed · recovery completed",
    rows: [
      { label: "Markdown execution", value: "Dispatched", tone: "info" },
      { label: "Shelf Label acknowledgement", value: "Delayed", tone: "warn" },
      { label: "Deadline risk", value: "Detected", tone: "warn" },
      { label: "Retry outcome", value: "Acknowledged · verified", tone: "ok" },
    ],
    status: { tone: "warn", text: "Deadline-sensitive recovery completed in working scenario" },
    cta: { href: "/operations/markdowns", label: "Markdown SLAs" },
  },
  oj: {
    id: "oj",
    name: "Premium Orange Juice · 64 oz",
    tag: "Working verified path",
    scenario: "All required channels verified · rollout eligible for controlled expansion",
    rows: [
      { label: "Shelf Label", value: "Verified", tone: "ok" },
      { label: "Checkout POS", value: "Verified", tone: "ok" },
      { label: "Ecommerce", value: "Verified", tone: "ok" },
      { label: "Audit", value: "Causal order preserved", tone: "ok" },
    ],
    status: { tone: "ok", text: "Eligible for controlled expansion" },
    cta: { href: "/certification", label: "Certification Lab" },
  },
};

function ProductPanel({ story, onClose }: { story: ProductStory; onClose: () => void }) {
  const toneClasses = {
    ok: "border-emerald-500/40 text-emerald-300 bg-emerald-500/[.06]",
    err: "border-rose-500/40 text-rose-300 bg-rose-500/[.06]",
    warn: "border-amber-500/40 text-amber-300 bg-amber-500/[.06]",
    info: "border-white/10 text-white/75 bg-white/[.03]",
  } as const;
  return (
    <motion.aside
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 28 }}
      transition={{ type: "spring", stiffness: 240, damping: 28 }}
      className="rounded-3xl border border-white/10 bg-[#0a0e18]/95 p-6 backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Pill tone={story.status.tone === "ok" ? "green" : story.status.tone === "err" ? "red" : "orange"}>
            {story.tag}
          </Pill>
          <h3 className="mt-3 text-2xl font-semibold leading-tight text-white">{story.name}</h3>
          <p className="mt-2 text-sm text-white/55">{story.scenario}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md border border-white/10 bg-white/[.04] p-1.5 text-white/55 hover:text-white"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="mt-5 space-y-2">
        {story.rows.map((r, i) => (
          <li key={i} className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm ${toneClasses[r.tone]}`}>
            <span className="text-white/75">{r.label}</span>
            <span className="font-mono tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
      <div
        className={`mt-5 rounded-2xl border px-4 py-3 ${
          story.status.tone === "ok"
            ? "border-emerald-500/40 bg-emerald-500/[.08]"
            : story.status.tone === "err"
              ? "border-rose-500/40 bg-rose-500/[.08]"
              : "border-amber-500/40 bg-amber-500/[.08]"
        }`}
      >
        <p
          className={`text-sm font-medium ${
            story.status.tone === "ok"
              ? "text-emerald-200"
              : story.status.tone === "err"
                ? "text-rose-200"
                : "text-amber-200"
          }`}
        >
          {story.status.text}
        </p>
        {story.recovery && <p className="mt-1.5 text-xs text-white/55">{story.recovery}</p>}
      </div>
      {story.cta && (
        <Link
          href={story.cta.href}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-2.5 text-sm font-medium text-orange-200 hover:bg-orange-500/20"
        >
          {story.cta.label} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </motion.aside>
  );
}

function ProductAisle() {
  const [selected, setSelected] = useState<string | null>("milk");
  const story = selected ? STORIES[selected] : null;
  return (
    <section id="scene-aisle" className="relative scroll-mt-24">
      <ChapterMarker n="01" label="The Aisle" />
      <CursorSpotlight color="rgba(249,115,22,.16)">
        <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-10 sm:px-8 sm:pb-28">
          <div className="max-w-3xl">
            <Pill tone="orange">Aisle 4 · explore the execution path</Pill>
            <h2 className="mt-5 text-[clamp(32px,5vw,64px)] font-semibold leading-[1.04] tracking-[-0.02em] text-white">
              Four products. Four real execution paths.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55">
              Each product on the shelf is wired to a working scenario in the repo. Move your cursor
              to light the aisle. Click one to see what ShelfTrace observes — and what it does.
            </p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
            <AisleShelf selected={selected} onSelect={(id) => setSelected(id)} />
            <AnimatePresence mode="wait">
              {story && <ProductPanel key={story.id} story={story} onClose={() => setSelected(null)} />}
            </AnimatePresence>
          </div>
        </div>
      </CursorSpotlight>
    </section>
  );
}

/* ─────────────────────────────── 3. Scanner Showstopper (full bleed) ─────── */

function ScannerShowstopper({ playRef }: { playRef: React.RefObject<HTMLDivElement> }) {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { margin: "-30% 0px -30% 0px" });
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setStage(4);
      return;
    }
    setStage(0);
    const seq = [600, 1500, 2400, 3300, 4400];
    const ts = seq.map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, [inView, reduced]);

  return (
    <section id="scene-scan" ref={playRef} className="relative scroll-mt-24">
      <ChapterMarker n="02" label="The Scan" />
      <div ref={sectionRef} className="relative isolate overflow-hidden">
        {/* full-bleed dramatic backdrop */}
        <div className="absolute inset-0">
          <CinePhoto src={PHOTOS.scan} alt="Checkout scanner backdrop" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#04070b]/85 via-[#04070b]/92 to-[#04070b]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(244,63,94,.10),transparent_60%)]" />
        <Particles count={14} color="rgba(244,63,94,.55)" />

        <div className="relative mx-auto max-w-[1400px] px-5 py-28 sm:px-8 sm:py-36">
          <TimecodeHUD play={inView} />
          <div className="max-w-3xl">
            <Pill tone="red">The moment of truth</Pill>
            <h2 className="mt-5 text-[clamp(36px,6vw,88px)] font-semibold leading-[1.01] tracking-[-0.025em] text-white">
              One shelf. One shopper.
              <br />
              <span className="bg-gradient-to-r from-rose-300 via-orange-300 to-amber-300 bg-clip-text text-transparent">
                Two prices.
              </span>
            </h2>
          </div>

          <div className="relative mt-14 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            {/* SCENE */}
            <div className="relative h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-[#06090f]/80 backdrop-blur-sm">
              <svg viewBox="0 0 600 420" className="absolute inset-0 h-full w-full">
                <defs>
                  <linearGradient id="ss-floor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#0a0e18" />
                    <stop offset="1" stopColor="#020306" />
                  </linearGradient>
                </defs>
                <rect x="0" y="280" width="600" height="140" fill="url(#ss-floor)" />
                <g transform="translate(40 200)">
                  <rect x="0" y="0" width="120" height="40" rx="4" fill="#1c2433" stroke="#475569" />
                  <text x="60" y="14" fontSize="8" textAnchor="middle" fill="#94a3b8" fontFamily="ui-monospace, monospace">
                    SHELF PRICE
                  </text>
                  <text x="60" y="32" fontSize="20" textAnchor="middle" fill="#fb923c" fontWeight="700" fontFamily="ui-monospace, monospace">
                    $5.99
                  </text>
                </g>
                <rect x="20" y="240" width="160" height="6" fill="#1c2433" />

                <g transform="translate(380 230)">
                  <rect x="0" y="0" width="180" height="14" rx="2" fill="#1c2433" />
                  <rect x="40" y="-26" width="100" height="26" rx="3" fill="#0b1220" stroke="#334155" />
                  {stage >= 2 && !reduced && (
                    <motion.line
                      x1="50"
                      y1="-13"
                      x2="130"
                      y2="-13"
                      stroke="#f97316"
                      strokeWidth="2"
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 0.6, repeat: stage < 3 ? Infinity : 0 }}
                    />
                  )}
                </g>

                <g transform="translate(380 90)">
                  <rect x="0" y="0" width="180" height="100" rx="6" fill="#040608" stroke="#1f2937" strokeWidth="1.2" />
                  <rect x="6" y="6" width="168" height="88" rx="4" fill="#0a0e18" />
                  <text x="14" y="22" fontSize="9" fill="#64748b" fontFamily="ui-monospace, monospace">
                    CHECKOUT POS
                  </text>
                  <text x="14" y="36" fontSize="7" fill="#475569" fontFamily="ui-monospace, monospace">
                    Organic Whole Milk
                  </text>
                  {stage >= 3 && (
                    <>
                      <motion.text
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        x="14"
                        y="70"
                        fontSize="28"
                        fontWeight="800"
                        fill="#f43f5e"
                        fontFamily="ui-monospace, monospace"
                      >
                        $6.49
                      </motion.text>
                      <motion.rect
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        x="110"
                        y="56"
                        width="60"
                        height="20"
                        rx="3"
                        fill="#7f1d1d"
                        stroke="#f43f5e"
                      />
                      <motion.text
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        x="140"
                        y="70"
                        fontSize="10"
                        fontWeight="700"
                        textAnchor="middle"
                        fill="#fecaca"
                        fontFamily="ui-monospace, monospace"
                      >
                        +$0.50
                      </motion.text>
                    </>
                  )}
                  {stage < 3 && (
                    <text x="14" y="70" fontSize="14" fill="#475569" fontFamily="ui-monospace, monospace">
                      AWAITING SCAN
                    </text>
                  )}
                </g>

                {stage >= 4 && !reduced && (
                  <motion.circle
                    cx="470"
                    cy="140"
                    r="20"
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="2"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: [0.6, 2.2], opacity: [0.9, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  />
                )}
              </svg>

              <motion.div
                initial={{ left: "5%", top: "32%" }}
                animate={
                  reduced
                    ? { left: "60%", top: "44%" }
                    : stage >= 1
                      ? { left: "60%", top: "44%" }
                      : { left: "5%", top: "32%" }
                }
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute h-[110px] w-[70px]"
              >
                <MilkBottle glow={stage >= 3} />
              </motion.div>
            </div>

            <div className="relative">
              <AnimatePresence mode="wait">
                {stage >= 4 ? (
                  <motion.div
                    key="incident"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7 }}
                  >
                    <h3 id="scene-decision" className="text-[clamp(28px,4vw,52px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
                      The recommendation was approved.
                      <br />
                      <span className="bg-gradient-to-r from-rose-300 to-orange-300 bg-clip-text text-transparent">
                        Execution was not.
                      </span>
                    </h3>
                    <div className="mt-6 rounded-3xl border border-rose-500/30 bg-rose-500/[.05] p-6 backdrop-blur-sm">
                      <div className="flex items-center gap-2 text-[10px] tracking-[.22em] text-rose-300 uppercase">
                        <CircleAlert className="h-3.5 w-3.5" /> Critical price-integrity incident
                      </div>
                      <p className="mt-3 text-base text-white">
                        Checkout charged <span className="font-mono">$6.49</span> against an approved
                        shelf price of <span className="font-mono">$5.99</span>.
                      </p>
                      <p className="mt-2 text-sm text-rose-200">
                        <span className="font-semibold">Expansion blocked.</span> Downstream rollout
                        paused until acknowledgement reconciles.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="prelude"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.55 }}
                    exit={{ opacity: 0 }}
                    className="text-white/55"
                  >
                    <p className="text-base">
                      A milk gallon leaves the shelf. The label reads <span className="text-orange-300">$5.99</span>.
                    </p>
                    <p className="mt-3 text-base">Watch the checkout return its answer.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── 4. Execution Proof Rail ─────────────────── */

const PROOF_TILES = [
  {
    key: "APPROVED PRICE",
    main: "$5.99",
    sub: "Organic Whole Milk",
    icon: Sparkles,
    color: "#fb923c",
    border: "border-orange-500/35",
    bg: "bg-orange-500/[.06]",
  },
  {
    key: "CHECKOUT RESPONSE",
    main: "$6.49",
    sub: "POS mismatch · +$0.50",
    icon: ScanLine,
    color: "#f43f5e",
    border: "border-rose-500/40",
    bg: "bg-rose-500/[.06]",
  },
  {
    key: "SAFETY DECISION",
    main: "Expansion Blocked",
    sub: "Before wider rollout",
    icon: ShieldCheck,
    color: "#a78bfa",
    border: "border-violet-500/35",
    bg: "bg-violet-500/[.06]",
  },
  {
    key: "TECHNICAL PROOF",
    main: "47 Tests",
    sub: "PostgreSQL-backed recovery checks",
    icon: BadgeCheck,
    color: "#22c55e",
    border: "border-emerald-500/35",
    bg: "bg-emerald-500/[.06]",
  },
];

function ExecutionProofRail() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-150px" });
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setStage(4);
      return;
    }
    const ts = [400, 1100, 1800, 2500].map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, [inView, reduced]);

  return (
    <section ref={ref}>
      <ChapterMarker n="03" label="The Decision" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-3xl">
          <Pill tone="orange">Execution proof rail</Pill>
          <h2 className="mt-5 text-[clamp(28px,4vw,56px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            The system response, end to end.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/55">
            The signal travels approval → checkout → safety decision → preserved evidence. No vanity
            numbers; only the actual product story and the engineering it rests on.
          </p>
        </div>

        <div className="relative mt-12">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PROOF_TILES.map((t, i) => {
              const lit = stage > i;
              const Icon = t.icon;
              return (
                <motion.div
                  key={t.key}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: i * 0.06 }}
                  className={`relative overflow-hidden rounded-3xl border p-6 transition-all duration-500 ${
                    lit ? `${t.border} ${t.bg}` : "border-white/10 bg-white/[.02]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] tracking-[.22em] text-white/45 uppercase">{t.key}</span>
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[.04]"
                      style={{ color: lit ? t.color : "#475569" }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-6 text-[clamp(26px,3.2vw,42px)] font-semibold tracking-[-0.02em] text-white">
                    {t.main}
                  </div>
                  <p className="mt-2 text-sm text-white/55">{t.sub}</p>
                  {lit && !reduced && (
                    <motion.span
                      className="absolute -right-1 top-1/2 h-2 w-2 rounded-full"
                      style={{ background: t.color, boxShadow: `0 0 12px ${t.color}` }}
                      initial={{ opacity: 0.5, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1.2 }}
                      transition={{ duration: 0.6 }}
                    />
                  )}
                </motion.div>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-x-6 top-1/2 hidden h-px lg:block">
            <div className="h-full bg-gradient-to-r from-orange-500/30 via-rose-500/30 via-violet-500/30 to-emerald-500/30" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── 5. Before / After recovery ──────────────── */

/* ─────────────────────────── Recovery scene · cinematic upgrade ───────────── */
/* Full-bleed product-card scene on both sides:                                *
 *   BEFORE: red glow · POS chip = fail · big $6.49 receipt badge              *
 *   AFTER:  green glow · all 3 chips = ok · canonical $5.99 verified badge    *
 * Both share the same Milk product card center — only the chrome around it    *
 * changes as the scrubber moves. Animated chip state transitions, floating    *
 * ambient particles, larger handle with pulse ring + arrow icons.             */

function RecoveryScene({
  side,
}: {
  side: "before" | "after";
}) {
  const reduced = useReducedMotion();
  const isAfter = side === "after";

  // The full operations console per side. Each side composites:
  //   • Top bar:  eyebrow + incident id + timestamp
  //   • Center:   3-channel cards (Shelf / POS / Web) with real prices
  //   • Right:    big Milk product card with halo + receipt badge
  //   • Bottom:   audit-timeline strip showing recovery progression
  const eyebrow = isAfter ? "AFTER · acknowledgement received" : "BEFORE · mismatch open";
  const incidentId = "INC-2147";
  const timestamp = isAfter ? "T+03.78s" : "T+02.30s";

  const channels = isAfter
    ? [
        { name: "Shelf", price: "$5.99", status: "ok" as const },
        { name: "POS", price: "$5.99", status: "ok" as const },
        { name: "Web", price: "$5.99", status: "ok" as const },
      ]
    : [
        { name: "Shelf", price: "$5.99", status: "ok" as const },
        { name: "POS", price: "$6.49", status: "fail" as const },
        { name: "Web", price: "$5.99", status: "ok" as const },
      ];

  const timeline = [
    { t: "T+0.0", label: "approve", state: "done" as const },
    { t: "T+1.2", label: "dispatch", state: "done" as const },
    { t: "T+2.1", label: "ack", state: isAfter ? "done" : "active" as const },
    { t: "T+2.3", label: "drift", state: isAfter ? "done" : "active" as const },
    { t: "T+3.0", label: "retry", state: isAfter ? "done" : "pending" as const },
    { t: "T+3.5", label: "verify", state: isAfter ? "done" : "pending" as const },
    { t: "T+3.8", label: "seal", state: isAfter ? "done" : "pending" as const },
  ];

  return (
    <div
      className={`absolute inset-0 ${
        isAfter
          ? "bg-gradient-to-br from-emerald-950/60 via-[#0a1410] to-[#04070b]"
          : "bg-gradient-to-br from-rose-950/60 via-[#140a0d] to-[#04070b]"
      }`}
    >
      {/* subtle grid backplate so the canvas never reads as empty */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[.4]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* atmospheric tint */}
      <div
        className={`pointer-events-none absolute inset-0 ${
          isAfter
            ? "bg-[radial-gradient(ellipse_at_60%_50%,rgba(34,197,94,.22),transparent_65%)]"
            : "bg-[radial-gradient(ellipse_at_40%_50%,rgba(244,63,94,.26),transparent_65%)]"
        }`}
      />

      {/* TOP BAR — eyebrow + incident id + timestamp */}
      <div className="absolute inset-x-6 top-5 flex items-center justify-between">
        <span
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[.22em] backdrop-blur ${
            isAfter
              ? "border-emerald-500/40 bg-emerald-500/[.10] text-emerald-200"
              : "border-rose-500/45 bg-rose-500/[.10] text-rose-200"
          }`}
        >
          {isAfter ? <CheckCircle2 className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
          {eyebrow}
        </span>
        <span className="flex items-center gap-3 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 font-mono text-[10px] text-white/65 backdrop-blur">
          <span className={isAfter ? "text-emerald-300" : "text-rose-300"}>{incidentId}</span>
          <span className="text-white/30">·</span>
          <span>{timestamp}</span>
        </span>
      </div>

      {/* MAIN GRID — left: 3 channel cards · right: big product card */}
      <div className="absolute inset-x-6 top-20 bottom-20 grid grid-cols-[1.1fr_1fr] gap-6 items-center">
        {/* LEFT: channel grid */}
        <div className="grid grid-cols-1 gap-3">
          {channels.map((c) => (
            <motion.div
              key={c.name}
              initial={false}
              whileHover={reduced ? undefined : { x: 2 }}
              className={`relative rounded-2xl border bg-[#0e1320]/95 backdrop-blur p-4 transition-colors ${
                c.status === "ok"
                  ? "border-emerald-500/35"
                  : "border-rose-500/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[10px] uppercase tracking-[.22em] text-white/60">
                  {c.status === "ok" ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-300" />
                  ) : (
                    <CircleAlert className="h-3 w-3 text-rose-300" />
                  )}
                  {c.name}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[.2em] text-white/40">
                  channel
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span
                  className={`font-mono text-xl font-bold tabular-nums ${
                    c.status === "ok" ? "text-emerald-200" : "text-rose-200"
                  }`}
                >
                  {c.price}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[.18em] ${
                    c.status === "ok"
                      ? "border-emerald-500/40 bg-emerald-500/[.10] text-emerald-200"
                      : "border-rose-500/40 bg-rose-500/[.10] text-rose-200"
                  }`}
                >
                  {c.status === "ok" ? "verified" : "mismatch"}
                </span>
              </div>
              {/* pulse ring on the failing channel */}
              {c.status === "fail" && !reduced && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-rose-500/50"
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* RIGHT: big product card with halo + canonical / receipt info */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <motion.span
              aria-hidden
              className={`pointer-events-none absolute -inset-3 rounded-3xl border ${
                isAfter ? "border-emerald-500/40" : "border-rose-500/50"
              } ${
                isAfter
                  ? "shadow-[0_0_80px_-8px_rgba(34,197,94,.5)]"
                  : "shadow-[0_0_80px_-8px_rgba(244,63,94,.6)]"
              }`}
              initial={false}
              animate={
                reduced
                  ? undefined
                  : { opacity: isAfter ? [0.4, 0.7, 0.4] : [0.4, 0.95, 0.4] }
              }
              transition={
                reduced
                  ? undefined
                  : { duration: isAfter ? 2.6 : 1.4, repeat: Infinity, ease: "easeInOut" }
              }
            />
            <ProductCard
              name="Organic Whole Milk"
              units="1 GAL"
              price="$5.99"
              glyph={<SharedMilkGlyph />}
              tone="neutral"
              size="lg"
              badge={
                isAfter
                  ? { label: "approved · verified", tone: "verified" }
                  : { label: "approved · canonical", tone: "primary" }
              }
            />
          </div>
          {/* receipt badge */}
          {isAfter ? (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/[.10] px-3 py-1.5 text-[10px] font-mono uppercase tracking-[.18em] text-emerald-200 backdrop-blur">
              <CheckCircle2 className="h-3 w-3" />
              POS acknowledged $5.99
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-rose-500/45 bg-rose-500/[.12] px-3 py-1.5 text-[10px] font-mono uppercase tracking-[.18em] text-rose-200 backdrop-blur">
              <CircleAlert className="h-3 w-3" />
              POS rang $6.49 · +$0.50
            </span>
          )}
        </div>
      </div>

      {/* BOTTOM: audit timeline strip + decision pill */}
      <div className="absolute inset-x-6 bottom-5 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/55 px-4 py-2.5 backdrop-blur">
        <span className="text-[10px] uppercase tracking-[.22em] text-white/50">audit</span>
        <div className="flex flex-1 items-center gap-1">
          {timeline.map((t, i) => (
            <div key={t.t} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={`h-1.5 w-full rounded-full transition-colors ${
                  t.state === "done"
                    ? "bg-emerald-400"
                    : t.state === "active"
                      ? "bg-amber-300"
                      : "bg-white/10"
                }`}
              />
              <span
                className={`hidden md:block font-mono text-[8px] uppercase tracking-[.18em] ${
                  t.state === "done"
                    ? "text-emerald-300"
                    : t.state === "active"
                      ? "text-amber-300"
                      : "text-white/30"
                }`}
              >
                {t.label}
              </span>
            </div>
          ))}
        </div>
        <span
          className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-[.22em] ${
            isAfter ? "text-emerald-200" : "text-rose-200"
          }`}
        >
          {isAfter ? "expansion · eligible" : "expansion · blocked"}
        </span>
      </div>
    </div>
  );
}

function BeforeAfter() {
  const reduced = useReducedMotion();
  const [target, setTarget] = useState(50);
  const smoothed = useSpring(target, SPRING.bouncy as any);
  const [posDisplay, setPosDisplay] = useState(50);
  useEffect(() => {
    if (reduced) {
      setPosDisplay(target);
      return;
    }
    const unsub = smoothed.on("change", (v) => setPosDisplay(v));
    return () => unsub();
  }, [smoothed, reduced, target]);

  const dragging = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const updateFromClient = (clientX: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((clientX - r.left) / r.width) * 100;
    setTarget(Math.max(2, Math.min(98, x)));
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      setTarget((p) => Math.max(2, p - 4));
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      setTarget((p) => Math.min(98, p + 4));
      e.preventDefault();
    } else if (e.key === "Home") {
      setTarget(2);
      e.preventDefault();
    } else if (e.key === "End") {
      setTarget(98);
      e.preventDefault();
    }
  };

  return (
    <section id="scene-recovery" className="scroll-mt-24">
      <ChapterMarker n="04" label="The Recovery" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8">
        <div className="max-w-3xl">
          <Pill tone="purple">Before · After</Pill>
          <h2 className="mt-5 text-[clamp(32px,5vw,64px)] font-semibold leading-[1.04] tracking-[-0.02em] text-white">
            One drag.
            <br />
            <span className="bg-gradient-to-r from-rose-300 via-amber-200 to-emerald-300 bg-clip-text text-transparent">
              The whole recovery.
            </span>
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55">
            Same approved price. Same store. ShelfTrace resolves only after the channel that disagreed
            acknowledges the approved value. Drag the handle — watch POS flip from <span className="text-rose-300">$6.49&nbsp;mismatch</span> to <span className="text-emerald-300">$5.99&nbsp;verified</span>, the channels settle, the decision change.
          </p>
        </div>
        <div
          ref={wrapRef}
          tabIndex={0}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(posDisplay)}
          aria-label="Reveal before / after recovery"
          className="relative mt-12 aspect-[16/8] cursor-ew-resize overflow-hidden rounded-3xl border border-white/10 select-none outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60"
          onKeyDown={onKey}
          onPointerMove={(e) => dragging.current && updateFromClient(e.clientX)}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            updateFromClient(e.clientX);
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
          }}
        >
          {/* AFTER scene fills the canvas */}
          <RecoveryScene side="after" />
          {/* BEFORE scene clipped from the right */}
          <div
            className="absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - posDisplay}% 0 0)` }}
          >
            <RecoveryScene side="before" />
          </div>
          {/* Ambient drifting particles (above scenes, below handle) */}
          {!reduced && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {[12, 28, 44, 60, 76, 92].map((leftPct, i) => (
                <motion.span
                  key={leftPct}
                  className="absolute top-full h-1 w-1 rounded-full bg-white/40 shadow-[0_0_6px_rgba(255,255,255,.5)]"
                  style={{ left: `${leftPct}%` }}
                  animate={{ y: ["0%", "-3200%"], opacity: [0, 0.85, 0] }}
                  transition={{ duration: 10 + i, repeat: Infinity, delay: i * 1.4, ease: "linear" }}
                />
              ))}
            </div>
          )}
          {/* Handle */}
          <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${posDisplay}%` }}>
            <div className="-translate-x-1/2 h-full w-px bg-gradient-to-b from-rose-400/0 via-white/85 to-emerald-400/0" />
            <div
              className={`absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-white/15 text-white backdrop-blur shadow-[0_0_30px_rgba(255,255,255,.25)] transition-transform duration-200 ${
                dragging.current ? "scale-110" : "scale-100"
              }`}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                <path d="M2 10 L7 5 L7 15 Z" />
                <path d="M18 10 L13 15 L13 5 Z" />
              </svg>
              {/* pulse ring */}
              {!reduced && !dragging.current && (
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-white/55"
                  animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                />
              )}
            </div>
          </div>
          {/* Top progress band — shows the recovery sequence as you drag */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[.22em] text-rose-200/70">
              incident open
            </span>
            <div className="flex items-center gap-1.5">
              {[20, 40, 60, 80].map((threshold) => (
                <span
                  key={threshold}
                  className={`h-1.5 w-6 rounded-full transition-colors duration-200 ${
                    posDisplay >= threshold ? "bg-emerald-400" : "bg-white/15"
                  }`}
                />
              ))}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[.22em] text-emerald-200/70">
              sealed
            </span>
          </div>
        </div>
        {/* footer cue */}
        <p className="mt-5 text-center text-[11px] uppercase tracking-[.22em] text-white/40">
          drag the handle · or arrow keys ← → for keyboard
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────────── 6. Reliability Principles ───────────────── */

const PRINCIPLES = [
  {
    head: "Resolve only after acknowledgement.",
    body: "A retry is not success until the store channel confirms the approved price.",
  },
  {
    head: "Block wider rollout when shopper-facing prices disagree.",
    body: "A canary mismatch stops expansion before the issue spreads across the zone.",
  },
  {
    head: "Preserve every recovery as traceable evidence.",
    body: "Retries, acknowledgements, reconciliation results and resolution remain visible in the audit trail.",
  },
];

function ReliabilityPrinciples() {
  return (
    <section id="scene-promise" className="scroll-mt-24">
      <ChapterMarker n="05" label="The Promise" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-24 sm:px-8 sm:py-28">
        <div className="max-w-3xl">
          <Pill tone="sky">Reliability principles built into ShelfTrace</Pill>
          <h2 className="mt-5 text-[clamp(32px,5vw,64px)] font-semibold leading-[1.04] tracking-[-0.02em] text-white">
            Three commitments. Enforced in the engine.
          </h2>
        </div>
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <motion.div
              key={p.head}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.65, delay: i * 0.08 }}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[.04] to-transparent p-8"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
                <span className="font-mono text-sm">{String(i + 1).padStart(2, "0")}</span>
              </span>
              <p className="mt-5 text-[clamp(20px,2vw,26px)] font-semibold leading-snug text-white">
                {p.head}
              </p>
              <p className="mt-3 text-base leading-relaxed text-white/55">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── 7. Manager Tablet (with backdrop) ───────── */

function ManagerTablet() {
  const reduced = useReducedMotion();
  return (
    <section id="scene-handoff" className="relative scroll-mt-24">
      <ChapterMarker n="06" label="The Hand-off" />
      <div className="relative isolate overflow-hidden">
        {/* atmospheric backdrop */}
        <div className="absolute inset-0 opacity-50">
          <CinePhoto src={PHOTOS.cart} alt="" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#04070b] via-[#04070b]/85 to-[#04070b]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,rgba(249,115,22,.10),transparent_55%)]" />

        <div className="relative mx-auto max-w-[1400px] px-5 py-24 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <Pill tone="orange">Bridge into the working system</Pill>
              <h2 className="mt-5 text-[clamp(32px,5vw,68px)] font-semibold leading-[1.02] tracking-[-0.02em] text-white">
                From cinematic to control plane in one tap.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
                The alert above is dramatized. The control plane below it is real — a working FastAPI
                + PostgreSQL + Redis service in this repo. Every CTA lands in code you can read.
              </p>
            </div>
            <TabletShell />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Manager Tablet (cursor tilt) ────────────────── */

function TabletShell() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  /* Cursor-follow tilt: both axes flow through a spring so the response feels
   * physical, not jittery. Magnitudes are small (max ±8°) so the tilt reads
   * as confident, not gimmicky.                                              */
  const rxRaw = useMotionValue(0);
  const ryRaw = useMotionValue(0);
  const rx = useSpring(rxRaw, SPRING.gentle as any);
  const ry = useSpring(ryRaw, SPRING.gentle as any);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const cx = (e.clientX - r.left) / r.width - 0.5;
    const cy = (e.clientY - r.top) / r.height - 0.5;
    rxRaw.set(cy * -8);
    ryRaw.set(cx * 8);
  };
  const onLeave = () => {
    rxRaw.set(0);
    ryRaw.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      initial={reduced ? false : { opacity: 0, y: 24, rotateX: 8 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: EASE.outQuart }}
      style={{ transformStyle: "preserve-3d", perspective: 1400, rotateX: rx, rotateY: ry }}
      className="relative mx-auto w-full max-w-[540px] [transform-style:preserve-3d]"
    >
      <div className="relative aspect-[3/4] rounded-[36px] border border-white/10 bg-gradient-to-br from-[#1a1f2c] to-[#0a0d14] p-3 shadow-[0_40px_120px_-30px_rgba(244,63,94,.4)]">
        <div className="absolute left-1/2 top-2 h-1 w-12 -translate-x-1/2 rounded-full bg-white/20" />
        <div className="absolute inset-x-3 bottom-3 top-6 overflow-hidden rounded-[28px] border border-white/[.06] bg-[#06090f]">
          <div className="flex items-center justify-between px-5 py-3 text-[10px] uppercase tracking-[.22em] text-white/45">
            <span className="flex items-center gap-1.5">
              <Tablet className="h-3 w-3" /> Store · Aisle 4
            </span>
            <span className="font-mono">07:14</span>
          </div>
          <div className="mx-4 mt-2 rounded-2xl border border-rose-500/40 bg-rose-500/[.08] p-4">
            <div className="flex items-center gap-2 text-[10px] tracking-[.22em] text-rose-300 uppercase">
              <CircleAlert className="h-3.5 w-3.5" /> Critical price-integrity incident
            </div>
            <p className="mt-3 text-base font-semibold text-white">Organic Whole Milk</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-white/10 bg-white/[.03] p-2.5">
                <p className="text-[10px] uppercase tracking-[.18em] text-white/45">Expected</p>
                <p className="mt-0.5 font-mono text-base text-emerald-200">$5.99</p>
              </div>
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/[.06] p-2.5">
                <p className="text-[10px] uppercase tracking-[.18em] text-rose-300">POS returned</p>
                <p className="mt-0.5 font-mono text-base text-rose-200">$6.49</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-white/55">
              <span className="font-medium text-amber-200">Expansion paused.</span> Awaiting
              checkout acknowledgement.
            </p>
          </div>
          <div className="mx-4 mt-4 space-y-2">
            {[
              { href: "/operations", label: "Open Live Control Plane" },
              { href: "/engineering", label: "Inspect Engineering Trace" },
              { href: "/scenarios", label: "Configure Scenario" },
            ].map((cta) => (
              <Link
                key={cta.href}
                href={cta.href}
                className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-white/85 transition-all duration-200 hover:border-orange-500/40 hover:bg-orange-500/[.08] hover:text-white active:scale-[0.99]"
              >
                <span>{cta.label}</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[10px] uppercase tracking-[.22em] text-white/40">
            <CircleDot className="h-2 w-2 animate-pulse text-emerald-400" />
            Audit listener · live
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────── 8. Future concepts (restrained) ─────────── */

const FUTURE_CONCEPTS = [
  {
    title: "Verified Impact Gate",
    body: "Release revenue/margin attribution only after the price actually executed across required channels.",
    icon: BadgeCheck,
  },
  {
    title: "Real Data Replay",
    body: "Turn public or anonymized product/price observations into reliability test workloads with provenance attached.",
    icon: Database,
  },
  {
    title: "Recovery-to-Regression",
    body: "Every resolved incident becomes a permanent connector scenario for the next rollout.",
    icon: FlaskConical,
  },
  {
    title: "Zone Blast-Radius Studio",
    body: "Preview the stores, SKUs and deadlines protected when a rollout is paused — before expanding.",
    icon: MapPinned,
  },
];

function FutureConceptsPreview() {
  return (
    <section className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <Pill tone="purple">Vision concepts · exploratory</Pill>
          <h2 className="mt-5 text-[clamp(28px,4vw,56px)] font-semibold leading-[1.04] tracking-[-0.02em] text-white">
            Where verified execution could lead next.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/55">
            Each card below is a forward-looking concept layered on top of the working engine —
            shown for discussion, not as built functionality.
          </p>
        </div>
        <Link
          href="/vision/horizon"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.04] px-5 py-2.5 text-sm text-white/75 hover:text-white"
        >
          Explore Vision Concepts <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FUTURE_CONCEPTS.map((c, i) => {
          const Icon = c.icon;
          return (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, delay: i * 0.06 }}
              className="rounded-2xl border border-white/10 bg-white/[.025] p-5 hover:border-orange-500/30 hover:bg-orange-500/[.04]"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[.04] text-orange-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[9px] tracking-[.22em] text-white/40 uppercase">Vision concept</span>
              </div>
              <p className="mt-4 text-base font-semibold text-white">{c.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{c.body}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────────── 9. Night-time closing ───────────────────── */

function NightClosing() {
  const reduced = useReducedMotion();
  return (
    <section id="scene-night" className="relative isolate scroll-mt-24 overflow-hidden border-t border-white/[.06]">
      {/* photo backdrop deeply dimmed */}
      <div className="absolute inset-0 opacity-40">
        <CinePhoto src={PHOTOS.cold} alt="" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-[#04070b] via-[#04070b]/92 to-[#04070b]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(34,197,94,.10),transparent_55%),radial-gradient(ellipse_at_20%_0%,rgba(56,189,248,.08),transparent_45%)]" />
      <Particles count={14} color="rgba(134,239,172,.5)" />

      <ChapterMarker n="07" label="The Night" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-24 sm:px-8 sm:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-[10px] tracking-[.22em] text-emerald-300 uppercase">
              <Moon className="h-3.5 w-3.5" /> After hours · aisle 4
            </div>
            <h2 className="mt-5 text-[clamp(36px,5vw,84px)] font-semibold leading-[1.02] tracking-[-0.02em] text-white">
              The rollout ends.{" "}
              <span className="bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 bg-clip-text text-transparent">
                The evidence remains.
              </span>
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65">
              Every execution tested. Every mismatch traceable. Every recovery preserved for the next
              rollout.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {[
                "Configurable Scenarios",
                "Certification + Live Rollout",
                "Audit-Verified Recovery",
                "47 PostgreSQL-Backed Tests",
              ].map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[.06] px-3 py-1.5 text-xs font-medium text-emerald-200"
                >
                  <CheckCircle2 className="h-3 w-3" /> {chip}
                </span>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/operations"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#040608] hover:bg-orange-50"
              >
                Open Working Platform <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/engineering"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[.04] px-6 py-3.5 text-sm text-white hover:bg-white/10"
              >
                View Engineering Proof <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link
                href="/scenarios"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-transparent px-5 py-3 text-sm text-white/75 hover:text-white"
              >
                Build a Scenario <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          <div className="relative h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#070a12] to-[#02030a]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_50%,rgba(56,189,248,0.12),transparent_55%)]" />
            <svg viewBox="0 0 600 420" className="absolute inset-0 h-full w-full">
              <rect x="40" y="100" width="520" height="220" rx="6" fill="#0a0e18" stroke="rgba(255,255,255,0.06)" />
              {[80, 180, 280, 380, 480].map((x) => (
                <g key={x} transform={`translate(${x} 308)`}>
                  <rect width="60" height="14" rx="2" fill="#0a1410" stroke="#22c55e" strokeWidth="0.6" />
                  <text x="30" y="10" fontSize="6.5" textAnchor="middle" fill="#86efac" fontFamily="ui-monospace, monospace">
                    VERIFIED
                  </text>
                </g>
              ))}
              {[
                { x: 80, w: 50, h: 80 },
                { x: 180, w: 70, h: 40 },
                { x: 280, w: 65, h: 50 },
                { x: 380, w: 50, h: 80 },
                { x: 480, w: 50, h: 80 },
              ].map((p, i) => (
                <rect
                  key={i}
                  x={p.x}
                  y={300 - p.h}
                  width={p.w}
                  height={p.h}
                  rx={3}
                  fill="rgba(255,255,255,0.04)"
                  stroke="rgba(255,255,255,0.08)"
                />
              ))}
              <line x1="40" y1="350" x2="560" y2="350" stroke="rgba(34,197,94,0.15)" strokeWidth="1.4" />
              {!reduced && (
                <motion.line
                  x1="40"
                  y1="350"
                  x2="560"
                  y2="350"
                  stroke="#22c55e"
                  strokeWidth="1.4"
                  strokeDasharray="10 180"
                  animate={{ strokeDashoffset: [0, -380] }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                />
              )}
            </svg>
            <div className="absolute right-4 top-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[.06] px-3 py-2 backdrop-blur">
              <p className="text-[10px] tracking-[.18em] text-emerald-300 uppercase">Manager tablet</p>
              <p className="mt-0.5 text-xs font-medium text-emerald-100">All required channels verified</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────── PAGE ─────────────────────────────────── */

export default function KeynotePage() {
  const [introDone, setIntroDone] = useState(false);
  const reduced = useReducedMotion();
  const scannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (reduced) {
      setIntroDone(true);
      return;
    }
    if (sessionStorage.getItem("kn:intro") === "done") setIntroDone(true);
  }, [reduced]);

  const finishIntro = () => {
    if (typeof window !== "undefined") sessionStorage.setItem("kn:intro", "done");
    setIntroDone(true);
  };

  return (
    <div className="relative bg-[#04070b]">
      <FilmGrain />
      <AnimatePresence>{!introDone && <StoreAwakening onDone={finishIntro} />}</AnimatePresence>
      <ChapterRail />

      <Hero onScanner={() => scannerRef.current?.scrollIntoView({ behavior: "smooth" })} />
      <ProductAisle />
      <ScannerShowstopper playRef={scannerRef} />
      <ExecutionProofRail />
      <BeforeAfter />
      <ReliabilityPrinciples />
      <ManagerTablet />
      <FutureConceptsPreview />
      <NightClosing />
    </div>
  );
}
