"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Beaker,
  Boxes,
  CircleDot,
  Clock4,
  Cpu,
  Eye,
  FileSignature,
  FlaskConical,
  GitBranch,
  Layers3,
  Map as MapIcon,
  Pause,
  Play,
  Radio,
  Repeat,
  ScanLine,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  TimerReset,
  Workflow,
  Zap,
} from "lucide-react";
import { BackgroundOrbits, Pill } from "./Shell";
import { EASE, SPRING } from "@/lib/motion";

/* ──────────────────────────────────────────────────────────────────────────────
   Cinematic Aisle — six chapters, scrubbable, with decision-stream narration.
   Frame budget: keep SVG flat, use transform-only animations.
   No real retailer logos, no sound, reduced-motion honored everywhere.
   ────────────────────────────────────────────────────────────────────────────── */

type Chapter = {
  id: string;
  title: string;
  tone: "neutral" | "orange" | "green" | "red" | "purple" | "sky";
  caption: string;
  narration: string[]; // lines streamed into decision-terminal
  shopperX: number; // 0–100
  scan: boolean;
  mismatch: boolean;
  resolved: boolean;
};

const CHAPTERS: Chapter[] = [
  {
    id: "approach",
    title: "Shopper enters Aisle 4",
    tone: "sky",
    caption: "Aisle Twin warms — 184 SKUs hydrated, 11 markdowns queued.",
    narration: [
      "[T+0.00] aisle-twin: warming · zone=dallas-mkt aisle=04",
      "[T+0.04] outbox: 11 pending markdowns · canary=02",
      "[T+0.07] traffic-forecast: 22 shoppers/15m · risk_index=0.42",
    ],
    shopperX: 8,
    scan: false,
    mismatch: false,
    resolved: false,
  },
  {
    id: "approved",
    title: "Memorial-Day batch lights the shelf",
    tone: "orange",
    caption: "Approved price signal flows price-engine → outbox → ESL → POS.",
    narration: [
      "[T+1.20] batch: memorial-day-dallas-02 · canary → full zone",
      "[T+1.21] outbox.dispatch: 11 events · FOR UPDATE SKIP LOCKED",
      "[T+1.34] esl.ack: 11/11 · checkout.ack: 10/11 · web.ack: 11/11",
    ],
    shopperX: 28,
    scan: false,
    mismatch: false,
    resolved: false,
  },
  {
    id: "pickup",
    title: "Greek Yogurt 32oz · barcode flash",
    tone: "purple",
    caption: "Shopper lifts the unit. Aisle Twin holds the canonical price.",
    narration: [
      "[T+2.08] vision.shelf-edge: label=$5.49 verified=true",
      "[T+2.09] provenance: model→approval→outbox→esl→audit",
      "[T+2.11] hold: canonical=$5.49 (idempotency_key=mk-dl-02-7741)",
    ],
    shopperX: 46,
    scan: false,
    mismatch: false,
    resolved: false,
  },
  {
    id: "mismatch",
    title: "POS reads $5.99 — drift detected",
    tone: "red",
    caption: "Checkout adapter returned stale_price. Containment opens.",
    narration: [
      "[T+3.40] pos.scan: sku=mk-dl-02-7741 reported=$5.99",
      "[T+3.41] reconcile: gap=+$0.50 · canonical=$5.49",
      "[T+3.42] incident.open: drift · sla_seconds=120",
      "[T+3.43] containment: pause downstream · hold attribution",
    ],
    shopperX: 64,
    scan: true,
    mismatch: true,
    resolved: false,
  },
  {
    id: "recover",
    title: "Recovery — regression replay retries idempotently",
    tone: "purple",
    caption: "A shadow run replays the failing event before retrying live.",
    narration: [
      "[T+3.71] regression.replay: sku=mk-dl-02-7741",
      "[T+3.74] replay.ack: ok · diff=resolved · safe-to-live=true",
      "[T+3.78] live.retry: pos.ack ok · canonical aligned",
    ],
    shopperX: 78,
    scan: true,
    mismatch: false,
    resolved: true,
  },
  {
    id: "audit",
    title: "Audit sealed · learning routed",
    tone: "green",
    caption: "Recovery becomes a regression. Attribution releases only verified revenue.",
    narration: [
      "[T+4.12] audit.seal: ack@T+3.42 < resolve@T+3.78 (causal ok)",
      "[T+4.14] regression.add: scenario=stale_price/yogurt-32oz",
      "[T+4.16] impact.gate: revenue released = verified-only window",
    ],
    shopperX: 92,
    scan: false,
    mismatch: false,
    resolved: true,
  },
];

/* ──────────────────────────────────────────────────────────────────────────────
   Typewriter — terminal-style line streamer
   ────────────────────────────────────────────────────────────────────────────── */

function useTypewriter(lines: string[], speedMs = 14) {
  const reduced = useReducedMotion();
  const [out, setOut] = useState<string[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    seq.current += 1;
    const mySeq = seq.current;
    if (reduced) {
      setOut(lines);
      return;
    }
    setOut([]);
    let cancelled = false;
    let i = 0;
    let buf = "";
    let charIdx = 0;
    const tick = () => {
      if (cancelled || mySeq !== seq.current) return;
      if (i >= lines.length) return;
      const line = lines[i];
      if (charIdx < line.length) {
        buf = line.slice(0, charIdx + 1);
        setOut((prev) => {
          const next = prev.slice(0, i);
          next.push(buf);
          return next;
        });
        charIdx += 1;
        setTimeout(tick, speedMs);
      } else {
        i += 1;
        charIdx = 0;
        buf = "";
        setTimeout(tick, 60);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [lines, reduced, speedMs]);

  return out;
}

/* ──────────────────────────────────────────────────────────────────────────────
   SVG primitives — kept flat & cheap so layering feels 3D without WebGL
   ────────────────────────────────────────────────────────────────────────────── */

function Shelf({
  x,
  y,
  highlight,
  labelColor,
  units,
}: {
  x: number;
  y: number;
  highlight: boolean;
  labelColor: string;
  units: string[];
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* shelf back */}
      <rect x="0" y="0" width="170" height="78" rx="4" fill="#11161f" stroke="#1e2533" />
      {/* lighting strip */}
      <rect x="6" y="2" width="158" height="2" fill="url(#shelfGlow)" opacity={highlight ? 1 : 0.3} />
      {/* units */}
      {units.map((color, i) => (
        <rect
          key={i}
          x={10 + i * 32}
          y={14}
          width={26}
          height={48}
          rx={3}
          fill={color}
          opacity={0.92}
          stroke="rgba(255,255,255,.06)"
        />
      ))}
      {/* shelf-edge label */}
      <rect x="6" y="64" width="60" height="10" rx="2" fill={labelColor} />
      <rect x="70" y="64" width="40" height="10" rx="2" fill="#0b0f17" stroke="rgba(255,255,255,.1)" />
    </g>
  );
}

function FloorTile() {
  return (
    <pattern id="floor" x="0" y="0" width="48" height="24" patternUnits="userSpaceOnUse">
      <rect width="48" height="24" fill="#0a0e16" />
      <path d="M0 24 L48 24" stroke="rgba(255,255,255,.04)" />
      <path d="M24 0 L24 24" stroke="rgba(255,255,255,.04)" />
    </pattern>
  );
}

function CartShopper({ x, scanning }: { x: number; scanning: boolean }) {
  // shopper + cart drawn at viewBox space, x ∈ 0..100 → translate 0..900
  const tx = (x / 100) * 900 + 40;
  return (
    <motion.g
      initial={false}
      animate={{ x: tx }}
      transition={{ type: "spring", stiffness: 60, damping: 18 }}
    >
      {/* cart shadow */}
      <ellipse cx="32" cy="298" rx="44" ry="4" fill="rgba(0,0,0,.5)" />
      {/* cart basket */}
      <g transform="translate(0 246)">
        <rect x="0" y="0" width="62" height="32" rx="3" fill="#1d2433" stroke="#2a3245" />
        <path d="M2 6 L60 6 M2 14 L60 14 M2 22 L60 22" stroke="rgba(255,255,255,.08)" />
        {/* handle */}
        <path d="M60 0 L78 -10 L88 -10" stroke="#3a4259" strokeWidth="2" fill="none" />
        {/* wheels */}
        <circle cx="10" cy="38" r="4" fill="#0c1018" stroke="#3a4259" />
        <circle cx="52" cy="38" r="4" fill="#0c1018" stroke="#3a4259" />
        {/* items */}
        <rect x="6" y="-8" width="12" height="14" rx="1.5" fill="#f97316" opacity=".85" />
        <rect x="22" y="-6" width="14" height="12" rx="1.5" fill="#a78bfa" opacity=".85" />
        <rect x="40" y="-10" width="14" height="16" rx="1.5" fill="#34d399" opacity=".85" />
      </g>
      {/* shopper */}
      <g transform="translate(82 196)">
        <circle cx="0" cy="0" r="9" fill="#e5e7eb" />
        <rect x="-9" y="9" width="18" height="32" rx="4" fill="#1e293b" />
        <rect x="-9" y="42" width="8" height="20" rx="2" fill="#0f172a" />
        <rect x="1" y="42" width="8" height="20" rx="2" fill="#0f172a" />
        {/* arm to handle */}
        <path d="M9 18 L4 50" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" />
      </g>
      {/* scan laser */}
      <AnimatePresence>
        {scanning && (
          <motion.g
            key="laser"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.line
              x1="92"
              y1="220"
              x2="92"
              y2="160"
              stroke="#f97316"
              strokeWidth="1.5"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            />
            <circle cx="92" cy="160" r="3" fill="#fb923c" />
          </motion.g>
        )}
      </AnimatePresence>
    </motion.g>
  );
}

function SignalTrail({ active, color }: { active: boolean; color: string }) {
  // Animated path from price engine (top-left) through outbox/worker → shelf edge
  return (
    <g opacity={active ? 1 : 0.25}>
      <path
        d="M40 60 C 220 40, 380 120, 520 110 S 820 150, 920 130"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeDasharray="6 6"
      >
        {active && (
          <animate attributeName="stroke-dashoffset" from="60" to="0" dur="1.2s" repeatCount="indefinite" />
        )}
      </path>
      {[160, 320, 520, 720, 880].map((x, i) => (
        <circle key={i} cx={x} cy={70 + i * 10} r="2.2" fill={color} opacity={active ? 0.9 : 0.4} />
      ))}
    </g>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   Cinematic stage
   ────────────────────────────────────────────────────────────────────────────── */

function CinematicAisle() {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const reduced = useReducedMotion();
  const chapter = CHAPTERS[idx];

  useEffect(() => {
    if (!playing || reduced) return;
    const id = setTimeout(() => {
      setIdx((i) => (i + 1) % CHAPTERS.length);
    }, 4200);
    return () => clearTimeout(id);
  }, [idx, playing, reduced]);

  const lines = useMemo(() => chapter.narration, [chapter]);
  const streamed = useTypewriter(lines, 12);

  const trailColor =
    chapter.tone === "red"
      ? "#f43f5e"
      : chapter.tone === "green"
        ? "#22c55e"
        : chapter.tone === "purple"
          ? "#a78bfa"
          : "#fb923c";

  const labelColor =
    chapter.tone === "red"
      ? "#7f1d1d"
      : chapter.tone === "green"
        ? "#14532d"
        : "#7c2d12";

  return (
    <section className="relative mt-10">
      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        {/* Stage */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#0c121d]/95 to-[#070a12]/95 p-5 shadow-[0_30px_80px_-40px_rgba(249,115,22,.4)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Pill tone={chapter.tone}>Chapter {String(idx + 1).padStart(2, "0")}</Pill>
              <span className="text-[11px] uppercase tracking-[.22em] text-white/35">Aisle 4 · Dallas Market</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[.04] text-white/70 hover:text-white"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  setIdx(0);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[.04] text-white/70 hover:text-white"
                aria-label="Restart"
              >
                <TimerReset className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* SVG stage */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/[.06] bg-[#06090f]">
            <svg viewBox="0 0 1000 320" className="block h-[300px] w-full">
              <defs>
                <linearGradient id="shelfGlow" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#fb923c" stopOpacity="0" />
                  <stop offset=".5" stopColor="#fb923c" stopOpacity="1" />
                  <stop offset="1" stopColor="#fb923c" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="ceiling" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#0c1320" />
                  <stop offset="1" stopColor="#06090f" />
                </linearGradient>
                <FloorTile />
              </defs>

              {/* ceiling */}
              <rect x="0" y="0" width="1000" height="40" fill="url(#ceiling)" />
              {/* ceiling lights */}
              {[120, 320, 520, 720, 900].map((x) => (
                <g key={x}>
                  <rect x={x - 22} y="6" width="44" height="6" rx="1.5" fill="#1c2333" />
                  <rect x={x - 18} y="8" width="36" height="2" fill="#fde68a" opacity=".7" />
                </g>
              ))}

              {/* signal trail */}
              <SignalTrail active={idx >= 1 && idx <= 4} color={trailColor} />

              {/* shelves row */}
              {[
                { x: 60, units: ["#f59e0b", "#fbbf24", "#f97316", "#fb923c", "#facc15"] },
                { x: 245, units: ["#a78bfa", "#8b5cf6", "#a78bfa", "#c4b5fd", "#8b5cf6"] },
                { x: 430, units: ["#34d399", "#10b981", "#6ee7b7", "#34d399", "#10b981"] },
                { x: 615, units: ["#60a5fa", "#3b82f6", "#93c5fd", "#60a5fa", "#3b82f6"] },
                { x: 800, units: ["#f472b6", "#ec4899", "#f9a8d4", "#f472b6", "#ec4899"] },
              ].map((s, i) => (
                <Shelf
                  key={s.x}
                  x={s.x}
                  y={150}
                  highlight={idx >= 1 && i === 2}
                  labelColor={i === 2 && (chapter.mismatch || chapter.resolved) ? labelColor : "#7c2d12"}
                  units={s.units}
                />
              ))}

              {/* floor */}
              <rect x="0" y="296" width="1000" height="24" fill="url(#floor)" />

              {/* shopper + cart layer */}
              <CartShopper x={chapter.shopperX} scanning={chapter.scan} />

              {/* drift callout */}
              <AnimatePresence>
                {chapter.mismatch && (
                  <motion.g
                    key="drift"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <rect x="600" y="100" width="160" height="38" rx="6" fill="#1a0a0e" stroke="#f43f5e" />
                    <text x="610" y="118" fill="#fecaca" fontSize="11" fontFamily="ui-monospace, monospace">
                      POS $5.99
                    </text>
                    <text x="610" y="132" fill="#fda4af" fontSize="10" fontFamily="ui-monospace, monospace">
                      drift +$0.50 · open
                    </text>
                  </motion.g>
                )}
                {chapter.resolved && !chapter.mismatch && (
                  <motion.g
                    key="ok"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <rect x="600" y="100" width="170" height="38" rx="6" fill="#072214" stroke="#22c55e" />
                    <text x="610" y="118" fill="#bbf7d0" fontSize="11" fontFamily="ui-monospace, monospace">
                      Canonical $5.49 ✓
                    </text>
                    <text x="610" y="132" fill="#86efac" fontSize="10" fontFamily="ui-monospace, monospace">
                      replay verified · live aligned
                    </text>
                  </motion.g>
                )}
              </AnimatePresence>
            </svg>
          </div>

          {/* caption + scrub */}
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">{chapter.title}</p>
              <p className="mt-1 text-xs text-white/55">{chapter.caption}</p>
            </div>
            <div className="text-right text-[10px] uppercase tracking-[.22em] text-white/35">
              T+{(idx * 0.84).toFixed(2)}s
            </div>
          </div>

          {/* timeline scrub */}
          <div className="mt-4 flex items-center gap-1.5" role="tablist" aria-label="Cinematic chapters">
            {CHAPTERS.map((c, i) => (
              <button
                key={c.id}
                onClick={() => {
                  setPlaying(false);
                  setIdx(i);
                }}
                role="tab"
                aria-selected={i === idx}
                className={`group relative h-2 flex-1 overflow-hidden rounded-full transition ${
                  i === idx ? "bg-orange-500" : i < idx ? "bg-orange-500/40" : "bg-white/8 hover:bg-white/15"
                }`}
              >
                <span className="sr-only">{c.title}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1.5 text-[9px] uppercase tracking-[.18em] text-white/35">
            {CHAPTERS.map((c, i) => (
              <span key={c.id} className={i === idx ? "text-orange-300" : ""}>
                {String(i + 1).padStart(2, "0")} {c.id}
              </span>
            ))}
          </div>
        </div>

        {/* Decision stream */}
        <div className="relative flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#06090f] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[.04]">
                  <Activity className="h-3 w-3 text-emerald-300" />
                </span>
                <p className="text-[11px] font-semibold tracking-[.18em] text-white/65 uppercase">
                  Decision Stream · live
                </p>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-white/35">
                <CircleDot className="h-2.5 w-2.5 animate-pulse text-emerald-400" />
                trace events
              </span>
            </div>
            <div
              aria-live="polite"
              className="mt-3 h-[218px] overflow-hidden rounded-lg bg-black/55 p-3 font-mono text-[11px] leading-[1.55] text-emerald-300/90"
            >
              {streamed.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  <span className="text-white/30">{">"}</span> {line}
                </div>
              ))}
              <span className="mt-1 inline-block h-3 w-1.5 animate-pulse bg-emerald-300" aria-hidden />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Canonical price" value="$5.49" tone="orange" icon={Tag} />
            <Kpi label="Drift window" value={chapter.mismatch ? "open · 120s" : "0s"} tone={chapter.mismatch ? "red" : "green"} icon={Clock4} />
            <Kpi label="Replay verdict" value={chapter.resolved ? "safe-to-live" : chapter.mismatch ? "investigating" : "warm"} tone={chapter.resolved ? "green" : "neutral"} icon={ShieldCheck} />
            <Kpi label="Attribution" value={idx >= 5 ? "released" : "held"} tone={idx >= 5 ? "green" : "purple"} icon={BadgeCheck} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: "orange" | "red" | "green" | "purple" | "neutral";
  icon: ElementType;
}) {
  const ring =
    tone === "orange"
      ? "border-orange-500/30"
      : tone === "red"
        ? "border-rose-500/30"
        : tone === "green"
          ? "border-emerald-500/30"
          : tone === "purple"
            ? "border-violet-500/30"
            : "border-white/10";
  return (
    <div className={`rounded-xl border ${ring} bg-white/[.025] p-3`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.18em] text-white/45">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   POS Scan Moment — four-frame storyboard
   ────────────────────────────────────────────────────────────────────────────── */

function PosScanMoment() {
  const reduced = useReducedMotion();
  const frames = [
    { title: "Scan", sub: "Barcode read · idempotency_key issued", icon: ScanLine },
    { title: "Fetch", sub: "Canonical price hydrated from Aisle Twin", icon: Server },
    { title: "Reconcile", sub: "POS reported vs canonical · drift gate", icon: Repeat },
    { title: "Resolve", sub: "Regression replay → live retry → audit sealed", icon: BadgeCheck },
  ];
  return (
    <section className="relative mt-12 overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1a]/85 p-6">
      <BackgroundOrbits variant="orange" />
      <div className="relative">
        <div className="flex items-end justify-between">
          <div>
            <Pill tone="orange">Checkout cinematic</Pill>
            <h3 className="mt-3 text-2xl font-semibold text-white tracking-tight">
              The 1.4-second scan that decides whether the price was real.
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              Most pricing systems trust the shelf. ShelfTrace treats the checkout scan as the moment of
              truth — and routes every drift back into the engine that approved it.
            </p>
          </div>
          <Pill tone="neutral">Vision concept</Pill>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {frames.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                viewport={{ once: true, margin: "-50px" }}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0c121d]/90 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold tracking-[.22em] text-orange-300">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Icon className="h-4 w-4 text-white/55" />
                </div>
                <p className="mt-3 text-sm font-medium text-white">{f.title}</p>
                <p className="mt-1 text-xs text-white/45">{f.sub}</p>
                {/* mini animation */}
                <div className="mt-4 h-14 rounded-lg border border-white/[.06] bg-black/40 p-2">
                  <ScanMiniFrame frame={i} />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ScanMiniFrame({ frame }: { frame: number }) {
  const reduced = useReducedMotion();
  if (frame === 0) {
    return (
      <svg viewBox="0 0 120 40" className="h-full w-full">
        {[6, 10, 14, 18, 22, 28, 32, 36, 42, 48, 52, 60, 64, 70, 76, 82].map((x, i) => (
          <rect key={i} x={x} y={6} width={i % 2 === 0 ? 1.4 : 2.2} height={28} fill="#e2e8f0" />
        ))}
        {!reduced && (
          <motion.line
            x1="6"
            x2="6"
            y1="3"
            y2="37"
            stroke="#f97316"
            strokeWidth="2"
            animate={{ x1: [6, 86, 6], x2: [6, 86, 6] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </svg>
    );
  }
  if (frame === 1) {
    return (
      <svg viewBox="0 0 120 40" className="h-full w-full">
        <rect x="4" y="14" width="22" height="14" rx="2" fill="#0b1220" stroke="#3b82f6" />
        <text x="9" y="24" fontSize="8" fill="#93c5fd" fontFamily="ui-monospace, monospace">DB</text>
        <path d="M28 21 L92 21" stroke="#60a5fa" strokeDasharray="4 3">
          {!reduced && <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />}
        </path>
        <rect x="92" y="14" width="22" height="14" rx="2" fill="#0b1220" stroke="#fb923c" />
        <text x="96" y="24" fontSize="8" fill="#fdba74" fontFamily="ui-monospace, monospace">POS</text>
      </svg>
    );
  }
  if (frame === 2) {
    return (
      <svg viewBox="0 0 120 40" className="h-full w-full">
        <line x1="60" y1="2" x2="60" y2="38" stroke="rgba(255,255,255,.1)" />
        <rect x="6" y="12" width="48" height="16" rx="2" fill="#0c2014" stroke="#22c55e" />
        <text x="10" y="23" fontSize="9" fill="#86efac" fontFamily="ui-monospace, monospace">$5.49 ✓</text>
        <rect x="66" y="12" width="48" height="16" rx="2" fill="#1a0a0e" stroke="#f43f5e" />
        <text x="70" y="23" fontSize="9" fill="#fda4af" fontFamily="ui-monospace, monospace">$5.99 ✗</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 40" className="h-full w-full">
      <circle cx="20" cy="20" r="9" fill="none" stroke="#a78bfa" strokeWidth="1.5" />
      <path d="M16 20 L19 23 L25 17" stroke="#a78bfa" strokeWidth="1.5" fill="none" />
      <path d="M30 20 L92 20" stroke="#22c55e" strokeDasharray="3 3">
        {!reduced && <animate attributeName="stroke-dashoffset" from="18" to="0" dur=".9s" repeatCount="indefinite" />}
      </path>
      <rect x="92" y="11" width="22" height="18" rx="3" fill="#072214" stroke="#22c55e" />
      <text x="96" y="23" fontSize="8" fill="#bbf7d0" fontFamily="ui-monospace, monospace">seal</text>
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   Future-concept grid (5)
   ────────────────────────────────────────────────────────────────────────────── */

type FutureConcept = {
  id: string;
  title: string;
  kicker: string;
  thesis: string;
  body: string;
  icon: ElementType;
  tone: "orange" | "purple" | "sky" | "green" | "red";
  visual: () => JSX.Element;
};

const FUTURE: FutureConcept[] = [
  {
    id: "twin",
    title: "Aisle Twin",
    kicker: "DIGITAL MIRROR",
    thesis: "Every shelf-edge label has a live, queryable twin.",
    body:
      "A canonical price object per SKU per zone, refreshed from the same outbox that drives ESL and POS. Drift surfaces in seconds, not after the weekly reconcile.",
    icon: Layers3,
    tone: "orange",
    visual: () => (
      <svg viewBox="0 0 240 90" className="h-full w-full">
        <rect x="10" y="20" width="220" height="50" rx="4" fill="#0c121d" stroke="#1d2433" />
        {Array.from({ length: 18 }).map((_, i) => (
          <rect key={i} x={16 + i * 12} y={26} width={9} height={28} rx={1} fill="#1e293b" />
        ))}
        {[3, 8, 13].map((i) => (
          <rect key={i} x={16 + i * 12} y={26} width={9} height={28} rx={1} fill="#fb923c" opacity=".9" />
        ))}
        <text x="16" y="82" fontSize="9" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace">
          18 SKUs · 3 drifted · last_sync=2.1s
        </text>
      </svg>
    ),
  },
  {
    id: "risk",
    title: "Shopper-Hour Risk Index",
    kicker: "EXPOSURE MATH",
    thesis: "Surface the 15-minute windows where mis-pricing costs most.",
    body:
      "Volume × price gap × foot-traffic forecast. Lets ops sequence canary windows and choose blast radius by hour, not by guess.",
    icon: Clock4,
    tone: "red",
    visual: () => (
      <svg viewBox="0 0 240 90" className="h-full w-full">
        {Array.from({ length: 24 }).map((_, i) => {
          const h = 6 + ((i * 13) % 38);
          const fill = h > 32 ? "#f43f5e" : h > 22 ? "#fb923c" : "#1e293b";
          return <rect key={i} x={6 + i * 9} y={60 - h} width="7" height={h} fill={fill} />;
        })}
        <line x1="6" y1="60" x2="222" y2="60" stroke="rgba(255,255,255,.12)" />
        <text x="6" y="78" fontSize="9" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace">
          peak risk · 11:45–12:00 · containment-window=120s
        </text>
      </svg>
    ),
  },
  {
    id: "graph",
    title: "Signal Provenance Graph",
    kicker: "FULL CAUSAL CHAIN",
    thesis: "Tap any price → see model, approval, outbox, ack, audit.",
    body:
      "A directed graph of every event that produced the current canonical price. Hover to inspect, click to scrub the moment it changed.",
    icon: GitBranch,
    tone: "purple",
    visual: () => (
      <svg viewBox="0 0 240 90" className="h-full w-full">
        {[
          [20, 45],
          [70, 22],
          [70, 68],
          [130, 45],
          [180, 22],
          [180, 68],
          [220, 45],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill={i === 3 ? "#a78bfa" : "#1e293b"} stroke="#a78bfa" />
        ))}
        <g stroke="rgba(167,139,250,.5)" fill="none">
          <path d="M25 45 L65 24" />
          <path d="M25 45 L65 66" />
          <path d="M75 24 L125 45" />
          <path d="M75 66 L125 45" />
          <path d="M135 45 L175 24" />
          <path d="M135 45 L175 66" />
          <path d="M185 24 L215 45" />
          <path d="M185 66 L215 45" />
        </g>
        <text x="6" y="86" fontSize="9" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace">
          7 nodes · 8 edges · root=memorial-day-dallas-02
        </text>
      </svg>
    ),
  },
  {
    id: "replay",
    title: "Containment Replay Theater",
    kicker: "INCIDENTS YOU CAN SCRUB",
    thesis: "Re-run any incident frame-by-frame with annotations.",
    body:
      "Pick a past drift, replay the outbox & ack timeline with synthetic shoppers, annotate at any timestamp, export as a regression test.",
    icon: Beaker,
    tone: "sky",
    visual: () => (
      <svg viewBox="0 0 240 90" className="h-full w-full">
        <rect x="10" y="22" width="220" height="40" rx="4" fill="#06121b" stroke="#1d3142" />
        <line x1="10" y1="42" x2="230" y2="42" stroke="rgba(56,189,248,.3)" />
        {[28, 70, 120, 168, 200].map((x, i) => (
          <g key={i}>
            <circle cx={x} cy={42} r="3.5" fill={i === 2 ? "#f43f5e" : i === 3 ? "#a78bfa" : "#0ea5e9"} />
            <line x1={x} y1={22} x2={x} y2={62} stroke="rgba(255,255,255,.08)" />
          </g>
        ))}
        <rect x="118" y="36" width="54" height="12" rx="2" fill="rgba(244,63,94,.18)" stroke="#f43f5e" />
        <text x="6" y="80" fontSize="9" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace">
          incident #INC-117 · drift window highlighted
        </text>
      </svg>
    ),
  },
  {
    id: "connector",
    title: "Connector Certification",
    kicker: "TEST BEFORE LIVE",
    thesis: "Synthetic doubles of every adapter — same contract, no shelf risk.",
    body:
      "Run new connector versions against recorded ack patterns; only promote when the regression verdict + connector certification checks pass and the reliability budget is healthy.",
    icon: FlaskConical,
    tone: "green",
    visual: () => (
      <svg viewBox="0 0 240 90" className="h-full w-full">
        <rect x="10" y="20" width="100" height="50" rx="5" fill="#0c1220" stroke="#22c55e" />
        <text x="18" y="40" fontSize="10" fill="#86efac" fontFamily="ui-monospace, monospace">candidate · vNext</text>
        <text x="18" y="56" fontSize="9" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace">certified: ok</text>
        <path d="M114 45 L130 45" stroke="#22c55e" strokeDasharray="3 3" />
        <rect x="132" y="20" width="100" height="50" rx="5" fill="#0c1220" stroke="#1e2533" />
        <text x="140" y="40" fontSize="10" fill="#e2e8f0" fontFamily="ui-monospace, monospace">live · vCurrent</text>
        <text x="140" y="56" fontSize="9" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace">budget: 99.93</text>
      </svg>
    ),
  },
];

function FutureGrid() {
  const [active, setActive] = useState<string>(FUTURE[0].id);
  const cur = FUTURE.find((f) => f.id === active) ?? FUTURE[0];
  const Icon = cur.icon;
  return (
    <section className="relative mt-12">
      <div className="flex items-end justify-between">
        <div>
          <Pill tone="purple">Concepts ShelfTrace adds on top</Pill>
          <h3 className="mt-3 text-2xl font-semibold text-white tracking-tight">
            Five reliability primitives a pricing engine can mount.
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Each is independent of any specific pricing brain — they describe how to make whatever
            decision the engine produces survive the trip to a real shopper&apos;s receipt.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <ul className="flex flex-col gap-2" role="tablist" aria-label="Future concept">
          {FUTURE.map((f) => {
            const FIcon = f.icon;
            const isActive = active === f.id;
            return (
              <li key={f.id}>
                <button
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(f.id)}
                  className={`group flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                    isActive
                      ? "border-orange-500/35 bg-orange-500/[.06]"
                      : "border-white/8 bg-white/[.02] hover:border-white/15 hover:bg-white/[.04]"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                      isActive ? "border-orange-500/40 bg-orange-500/15 text-orange-300" : "border-white/8 bg-white/[.04] text-white/55"
                    }`}
                  >
                    <FIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white">{f.title}</p>
                      <span className="text-[9px] tracking-[.22em] text-white/35">{f.kicker}</span>
                    </div>
                    <p className="mt-1 text-xs text-white/55 line-clamp-2">{f.thesis}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="rounded-2xl border border-white/10 bg-[#0b0f18]/90 p-6">
          <div className="flex items-center justify-between">
            <Pill tone={cur.tone}>{cur.kicker}</Pill>
            <Icon className="h-4 w-4 text-white/55" />
          </div>
          <h4 className="mt-3 text-xl font-semibold text-white tracking-tight">{cur.title}</h4>
          <p className="mt-2 text-sm text-white/65">{cur.thesis}</p>
          <p className="mt-3 text-sm text-white/45">{cur.body}</p>
          <div className="mt-5 overflow-hidden rounded-xl border border-white/[.06] bg-black/40 p-3">
            <div className="h-[120px]">{cur.visual()}</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[.18em] text-white/45">
            <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">vision concept</span>
            <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">non-disruptive add-on</span>
            <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">mounts on existing outbox</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   Architecture depth — methodologies/frameworks
   ────────────────────────────────────────────────────────────────────────────── */

const DEPTH: Array<{ name: string; sub: string; body: string; icon: ElementType }> = [
  {
    name: "Transactional outbox",
    sub: "POSTGRES · FOR UPDATE SKIP LOCKED",
    body: "Approved prices and the dispatch event commit in one transaction. Workers contend safely without losing or double-sending.",
    icon: Server,
  },
  {
    name: "Idempotency keys",
    sub: "EXACTLY-ONCE EFFECT",
    body: "Every connector call carries a deterministic key; retries are free and duplicate acks collapse to a single state transition.",
    icon: Repeat,
  },
  {
    name: "Connector certification",
    sub: "PROVIDER ↔ CONSUMER",
    body: "Adapters publish contracts; the engine verifies them in CI. Promotion blocks on certification green + reliability budget healthy.",
    icon: FileSignature,
  },
  {
    name: "Structured trace events",
    sub: "PRICE → ACK → AUDIT",
    body: "Every signal carries a trace_id from model output to shelf-edge ack, so any drift opens with a real causal path attached.",
    icon: Workflow,
  },
  {
    name: "Reliability + error budgets",
    sub: "ROLLOUT GUARDRAILS",
    body: "Canary stores burn against a per-connector budget. Auto-pause when the budget tips; auto-resume once the regression verdict clears.",
    icon: ShieldCheck,
  },
  {
    name: "Feature flags + blue/green",
    sub: "ROLLOUT, NOT RELEASE",
    body: "New behaviors ship dark, promote per-zone, and can rollback under one ms — independent of the deploy cadence.",
    icon: Settings2,
  },
  {
    name: "ADR-driven change",
    sub: "ARCHITECTURE OF RECORD",
    body: "Each non-trivial design move is captured as an ADR; the same file links to its contract, its outbox key, its test scenario.",
    icon: FileSignature,
  },
  {
    name: "Audit-as-source-of-truth",
    sub: "CAUSAL ORDERING",
    body: "Acknowledgements are stamped before resolution; the audit log is the legal record, not a derived view of state.",
    icon: BadgeCheck,
  },
];

function ArchitectureDepth() {
  return (
    <section className="relative mt-12 overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18]/80 p-6">
      <BackgroundOrbits variant="violet" />
      <div className="relative">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Pill tone="sky">Production-readiness</Pill>
            <h3 className="mt-3 text-2xl font-semibold text-white tracking-tight">
              The methodologies under every ShelfTrace surface.
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              Eight patterns that make &quot;test before go-live, guard after approval&quot; an enforceable
              property, not a slogan.
            </p>
          </div>
          <Pill tone="neutral">All wired in the working repo</Pill>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DEPTH.map((d) => {
            const Icon = d.icon;
            return (
              <div
                key={d.name}
                className="holo-card group rounded-2xl p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[.04] text-orange-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[9px] tracking-[.2em] text-white/40">{d.sub}</span>
                </div>
                <p className="mt-3 text-sm font-medium text-white">{d.name}</p>
                <p className="mt-1 text-xs text-white/45">{d.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SIGNATURE MOMENT — "Shelf-light Ignition"
   A row of shelf-edge price labels wakes left-to-right like store lights turning
   on. One label boots to a stale rose price, holds, then a ShelfTrace reconcile
   pulse sweeps across it and it snaps to the verified emerald canonical price —
   the shelf telling the truth. Transform + opacity + boxShadow only.
   Reduced-motion: all labels lit, the drift label already verified, static.
   ────────────────────────────────────────────────────────────────────────────── */

type ShelfLabel = {
  sku: string;
  name: string;
  /** verified canonical price shown once lit / reconciled */
  price: string;
  /** the one label that boots stale before ShelfTrace corrects it */
  drift?: { stale: string; gap: string };
};

const IGNITION_LABELS: ShelfLabel[] = [
  { sku: "mk-dl-02-7731", name: "Cold Brew 48oz", price: "$6.99" },
  { sku: "mk-dl-02-7736", name: "Sourdough Loaf", price: "$4.29" },
  { sku: "mk-dl-02-7741", name: "Greek Yogurt 32oz", price: "$5.49", drift: { stale: "$5.99", gap: "+$0.50" } },
  { sku: "mk-dl-02-7748", name: "Cold Press OJ", price: "$3.79" },
  { sku: "mk-dl-02-7754", name: "Trail Mix 16oz", price: "$7.49" },
];

/** Phases of the one drift label's lifecycle. */
type DriftPhase = "dark" | "stale" | "sweep" | "verified";

function ShelfLightIgnition() {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState<boolean[]>(() => IGNITION_LABELS.map(() => false));
  const [phase, setPhase] = useState<DriftPhase>("dark");
  const driftIdx = IGNITION_LABELS.findIndex((l) => l.drift);

  // run the choreography once when the rail scrolls into view
  const started = useRef(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    if (reduced) {
      // calm static final-state frame: everything lit, drift already verified
      setLit(IGNITION_LABELS.map(() => true));
      setPhase("verified");
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const ignite = () => {
      if (started.current) return;
      started.current = true;

      // 1 — lights wake left-to-right
      IGNITION_LABELS.forEach((label, i) => {
        timers.push(
          setTimeout(() => {
            setLit((prev) => {
              const next = [...prev];
              next[i] = true;
              return next;
            });
            // the drift label boots to its stale price the instant it lights
            if (i === driftIdx) setPhase("stale");
          }, 240 + i * 170),
        );
      });

      const allLitAt = 240 + (IGNITION_LABELS.length - 1) * 170;
      // 2 — hold the stale beat, then fire the reconcile sweep
      timers.push(setTimeout(() => setPhase("sweep"), allLitAt + 620));
      // 3 — snap to verified once the sweep has crossed the label
      timers.push(setTimeout(() => setPhase("verified"), allLitAt + 620 + 520));
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            ignite();
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [reduced, driftIdx]);

  return (
    <div
      ref={wrapRef}
      className="relative mt-10 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#0b1019]/90 to-[#06090f]/95 p-5 sm:p-6"
    >
      {/* faint ceiling light bar above the shelf — drifts on once anything is lit */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px origin-center"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(251,191,36,.55), rgba(251,191,36,.18), rgba(251,191,36,.55), transparent)",
        }}
        initial={reduced ? false : { opacity: 0, scaleX: 0.6 }}
        animate={{ opacity: phase === "dark" ? 0 : 1, scaleX: phase === "dark" ? 0.6 : 1 }}
        transition={{ duration: 0.9, ease: EASE.outQuart }}
      />

      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Pill tone="orange">Shelf-edge labels · Aisle 4</Pill>
          <span className="hidden text-[11px] uppercase tracking-[.22em] text-white/30 sm:inline">
            store lights waking
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[.2em] text-white/35">
          <CircleDot
            className={`h-2.5 w-2.5 ${
              phase === "stale"
                ? "text-rose-400"
                : phase === "verified"
                  ? "text-emerald-400"
                  : "text-amber-400"
            } ${reduced ? "" : "animate-pulse"}`}
          />
          {phase === "stale" ? "drift detected" : phase === "verified" ? "shelf verified" : "esl sync"}
        </span>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {IGNITION_LABELS.map((label, i) => (
          <IgnitionTile
            key={label.sku}
            label={label}
            lit={lit[i]}
            isDrift={i === driftIdx}
            phase={phase}
            reduced={!!reduced}
          />
        ))}
      </div>

      <p className="relative mt-4 max-w-xl text-xs leading-relaxed text-white/40">
        One canonical price per SKU. When a label boots stale, a ShelfTrace
        reconcile sweep corrects it in place — the shelf is made to tell the truth
        before a shopper ever reads it.
      </p>
    </div>
  );
}

function IgnitionTile({
  label,
  lit,
  isDrift,
  phase,
  reduced,
}: {
  label: ShelfLabel;
  lit: boolean;
  isDrift: boolean;
  phase: DriftPhase;
  reduced: boolean;
}) {
  // A normal tile is amber-verified once lit. The drift tile passes through
  // rose (stale) → sweep → emerald (verified). Resolve current visual state:
  const state: "dark" | "amber" | "rose" | "emerald" = !lit
    ? "dark"
    : isDrift
      ? phase === "stale"
        ? "rose"
        : phase === "verified"
          ? "emerald"
          : "rose" // hold rose through the sweep, snap after
      : "amber";

  const shown =
    isDrift && state === "rose" ? label.drift?.stale ?? label.price : label.price;

  const glow =
    state === "rose"
      ? "0 0 0 1px rgba(244,63,94,.45), 0 14px 40px -18px rgba(244,63,94,.65), 0 0 26px -10px rgba(244,63,94,.55)"
      : state === "emerald"
        ? "0 0 0 1px rgba(52,211,153,.45), 0 14px 40px -18px rgba(16,185,129,.6), 0 0 30px -10px rgba(52,211,153,.6)"
        : state === "amber"
          ? "0 0 0 1px rgba(251,146,60,.40), 0 14px 40px -18px rgba(249,115,22,.55), 0 0 26px -10px rgba(251,191,36,.55)"
          : "0 0 0 1px rgba(255,255,255,.05), 0 10px 30px -22px rgba(0,0,0,.6)";

  const priceColor =
    state === "rose"
      ? "text-rose-200"
      : state === "emerald"
        ? "text-emerald-200"
        : state === "amber"
          ? "text-amber-100"
          : "text-white/25";

  const dotColor =
    state === "rose"
      ? "bg-rose-400"
      : state === "emerald"
        ? "bg-emerald-400"
        : state === "amber"
          ? "bg-amber-300"
          : "bg-white/15";

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl border border-white/[.06] bg-[#0a0e16]/90 p-3.5"
      initial={reduced ? false : { opacity: 0.18, scale: 0.965, y: 6 }}
      animate={{
        opacity: lit ? 1 : 0.2,
        scale: lit ? 1 : 0.965,
        y: lit ? 0 : 6,
        boxShadow: glow,
      }}
      transition={
        reduced
          ? { duration: 0 }
          : { ...SPRING.gentle, boxShadow: { duration: 0.5, ease: EASE.outQuart } }
      }
    >
      {/* booting scanlines — only visible while still dark */}
      {!reduced && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 1px, transparent 1px 3px)",
          }}
          animate={{ opacity: lit ? 0 : 0.5 }}
          transition={{ duration: 0.4 }}
        />
      )}

      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[8.5px] font-mono uppercase tracking-[.16em] text-white/35">
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
          {label.sku}
        </span>
        {isDrift && state === "rose" && (
          <motion.span
            initial={reduced ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: EASE.outQuart }}
            className="rounded-full border border-rose-400/40 bg-rose-500/10 px-1.5 py-0.5 text-[8px] font-mono tracking-[.1em] text-rose-200"
          >
            POS {label.drift?.gap}
          </motion.span>
        )}
        {isDrift && state === "emerald" && (
          <motion.span
            initial={reduced ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: EASE.outQuart }}
            className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-mono tracking-[.1em] text-emerald-200"
          >
            <BadgeCheck className="h-2.5 w-2.5" /> verified
          </motion.span>
        )}
      </div>

      <p className="relative mt-2 truncate text-[11px] font-medium text-white/65">
        {label.name}
      </p>

      {/* price — cross-fades between stale and canonical on the snap */}
      <div className="relative mt-1 h-7 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={shown + state}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: EASE.outQuart }}
            className={`absolute inset-x-0 top-0 font-mono text-xl font-semibold tabular-nums ${priceColor}`}
          >
            {shown}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* ShelfTrace reconcile pulse — a vertical bar that sweeps the drift tile
          left→right (transform only) the instant before the price snaps green. */}
      {isDrift && !reduced && (
        <AnimatePresence>
          {phase === "sweep" && (
            <motion.div
              key="sweep"
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(52,211,153,.0) 10%, rgba(52,211,153,.55) 50%, rgba(167,243,208,.85) 60%, transparent)",
              }}
              initial={{ x: "-120%", opacity: 0 }}
              animate={{ x: "320%", opacity: [0, 1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.52, ease: EASE.outQuart }}
            />
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   Hero + CTA
   ────────────────────────────────────────────────────────────────────────────── */

function Hero() {
  const reduced = useReducedMotion();
  return (
    <section className="relative overflow-hidden pb-10 pt-10">
      <BackgroundOrbits variant="orange" />
      <div className="relative mx-auto max-w-[1320px] px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="orange">04 · Aisle Twin</Pill>
          <Pill tone="purple">Concept vision</Pill>
          <Pill tone="neutral">Mounts on the working engine</Pill>
        </div>
        <motion.h1
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl"
        >
          Watch a price travel from approval to shopper&apos;s receipt —
          <span className="iris-text">
            {" "}live, and accountable at every frame.
          </span>
        </motion.h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/55">
          Aisle Twin is a digital mirror of the shelf, the cart, and the checkout. Every chapter below
          is a real reliability primitive — the kind that decides whether an approved price actually
          becomes the price a shopper pays.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/operations"
            className="glow-iris inline-flex items-center gap-2 rounded-xl border border-orange-500/50 bg-orange-500/15 px-4 py-2.5 text-sm font-medium text-orange-200 transition hover:bg-orange-500/25"
          >
            Open the working Control Plane <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/vision/horizon"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm text-white/70 transition hover:text-white"
          >
            See Horizon Studio <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Signature moment — shelf-edge labels ignite, drift self-corrects */}
        <ShelfLightIgnition />
      </div>
    </section>
  );
}

function CtaRail() {
  return (
    <section className="relative mt-12 overflow-hidden rounded-3xl border border-orange-500/25 bg-gradient-to-br from-orange-500/[.07] via-transparent to-violet-500/[.07] p-6">
      <div className="grid gap-5 md:grid-cols-[1.6fr_1fr]">
        <div>
          <Pill tone="orange">Built beside the working engine</Pill>
          <h3 className="mt-3 text-2xl font-semibold text-white tracking-tight">
            Every concept here mounts on what already passes {TEST_COUNT}{" "}
            PostgreSQL-backed tests.
          </h3>
          <p className="mt-2 max-w-xl text-sm text-white/55">
            Outbox, idempotency, audit causality and scenario-driven adapters already exist in the working repo.
            Aisle Twin, Connector Certification, the Provenance Graph and Replay Theater extend that surface — they do
            not replace it.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/scenarios"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-white/75 hover:text-white"
            >
              Working scenario builder <ArrowUpRight className="h-3 w-3" />
            </Link>
            <Link
              href="/certification"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-white/75 hover:text-white"
            >
              Certification lab <ArrowUpRight className="h-3 w-3" />
            </Link>
            <Link
              href="/engineering"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-white/75 hover:text-white"
            >
              Engineering trace <ArrowUpRight className="h-3 w-3" />
            </Link>
            <Link
              href="/operations/incidents"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-white/75 hover:text-white"
            >
              Incidents <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0b0f18]/90 p-5">
          <p className="text-[10px] font-semibold tracking-[.2em] text-orange-300">PRINCIPLE</p>
          <p className="mt-3 text-base font-medium leading-snug text-white">
            &ldquo;Test before go-live. Guard after approval. Learn only from what shoppers actually saw.&rdquo;
          </p>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-white/45">
            <Sparkles className="h-3.5 w-3.5 text-orange-300" />
            ShelfTrace · independent execution-reliability prototype
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────────────────────── */

export default function AislePage() {
  return (
    <div className="relative">
      <Hero />
      <div className="relative mx-auto max-w-[1320px] px-4 sm:px-6">
        <CinematicAisle />
        <PosScanMoment />
        <FutureGrid />
        <ArchitectureDepth />
        <CtaRail />
      </div>
    </div>
  );
}
