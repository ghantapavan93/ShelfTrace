"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ElementType, MouseEvent as ReactMouseEvent } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import type { MotionValue } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  Cable,
  CircleDot,
  Clock4,
  Cpu,
  Database,
  Eye,
  FileSignature,
  Gauge,
  Globe2,
  Layers3,
  Network,
  Pause,
  Play,
  Radio,
  Receipt,
  Repeat,
  Rocket,
  ScanLine,
  Server,
  ShieldCheck,
  Signal,
  Sparkles,
  Tag,
  Terminal,
  Wifi,
  Zap,
} from "lucide-react";
import { BackgroundOrbits, Pill } from "./Shell";
import { EASE } from "@/lib/motion";

/* ────────────────────────────────────────────────────────────────────────────
   ShelfTrace — Mission Control
   One animation clock drives the whole page. Every panel breathes off of it.
   No autoplay sound, no real retailer logos, fictional Dallas Market context.
   Honors prefers-reduced-motion. Working backend not touched.
   ──────────────────────────────────────────────────────────────────────────── */

const MISSION_SECONDS = 30; // total loop length

/* ─────────────────────────────────── shared clock ─────────────────────────── */

function useMissionClock(paused: boolean) {
  const reduced = useReducedMotion();
  // motion value updates without React re-renders
  const mv = useMotionValue(0);
  const sec = useMotionValue(0);
  const [discrete, setDiscrete] = useState(0); // for things that need React state

  useEffect(() => {
    if (paused || reduced) {
      if (reduced) {
        mv.set(0.42);
        sec.set(MISSION_SECONDS * 0.42);
        setDiscrete(Math.floor(MISSION_SECONDS * 0.42 * 10));
      }
      return;
    }
    let raf = 0;
    let start = performance.now();
    const tick = (now: number) => {
      const elapsed = ((now - start) / 1000) % MISSION_SECONDS;
      const t = elapsed / MISSION_SECONDS;
      mv.set(t);
      sec.set(elapsed);
      // throttle discrete state updates to 10 Hz
      setDiscrete((d) => {
        const next = Math.floor(elapsed * 10);
        return next === d ? d : next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, reduced, mv, sec]);

  return { t: mv, sec, discrete };
}

/* ─────────────────────────────────── helpers ──────────────────────────────── */

function fmtClock(seconds: number, missionStart = 8): string {
  const total = Math.round(seconds * 10) / 10;
  const offset = total - missionStart;
  const sign = offset < 0 ? "T-" : "T+";
  const abs = Math.abs(offset);
  const mm = Math.floor(abs / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(abs % 60)
    .toString()
    .padStart(2, "0");
  const ms = Math.floor((abs % 1) * 10);
  return `${sign}${mm}:${ss}.${ms}`;
}

function useMouseParallax(strength = 12) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 70, damping: 18 });
  const y = useSpring(0, { stiffness: 70, damping: 18 });
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const node = ref.current;
    if (!node) return;
    const onMove = (e: MouseEvent) => {
      const r = node.getBoundingClientRect();
      const cx = (e.clientX - r.left) / r.width - 0.5;
      const cy = (e.clientY - r.top) / r.height - 0.5;
      x.set(cx * strength);
      y.set(cy * strength);
    };
    const onLeave = () => {
      x.set(0);
      y.set(0);
    };
    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseleave", onLeave);
    return () => {
      node.removeEventListener("mousemove", onMove);
      node.removeEventListener("mouseleave", onLeave);
    };
  }, [reduced, strength, x, y]);
  return { ref, x, y };
}

/* ─────────────────────────────── stores (live grid) ───────────────────────── */

type Store = {
  id: string;
  label: string;
  zone: string;
  x: number; // percent
  y: number;
  canary: boolean;
  state: "verified" | "drift" | "warming" | "held";
};

const STORES: Store[] = [
  { id: "dl-02", label: "Dallas Market 02", zone: "DAL", x: 22, y: 38, canary: true, state: "verified" },
  { id: "dl-04", label: "Dallas Market 04", zone: "DAL", x: 30, y: 56, canary: true, state: "verified" },
  { id: "dl-07", label: "Dallas Market 07", zone: "DAL", x: 18, y: 64, canary: false, state: "warming" },
  { id: "au-01", label: "Austin Zone 01", zone: "AUS", x: 38, y: 78, canary: false, state: "verified" },
  { id: "au-03", label: "Austin Zone 03", zone: "AUS", x: 48, y: 72, canary: false, state: "drift" },
  { id: "au-09", label: "Austin Zone 09", zone: "AUS", x: 54, y: 84, canary: false, state: "held" },
  { id: "hs-12", label: "Houston 12", zone: "HOU", x: 62, y: 64, canary: false, state: "verified" },
  { id: "hs-18", label: "Houston 18", zone: "HOU", x: 70, y: 52, canary: false, state: "warming" },
  { id: "ok-04", label: "Oklahoma 04", zone: "OKC", x: 42, y: 22, canary: false, state: "verified" },
  { id: "ok-06", label: "Oklahoma 06", zone: "OKC", x: 50, y: 32, canary: false, state: "verified" },
  { id: "mp-21", label: "Memphis 21", zone: "MEM", x: 78, y: 28, canary: false, state: "warming" },
  { id: "mp-28", label: "Memphis 28", zone: "MEM", x: 84, y: 42, canary: false, state: "verified" },
  { id: "no-05", label: "New Orleans 05", zone: "NOL", x: 86, y: 78, canary: false, state: "verified" },
  { id: "no-09", label: "New Orleans 09", zone: "NOL", x: 92, y: 66, canary: false, state: "held" },
];

const STATE_TONE: Record<Store["state"], { dot: string; ring: string; label: string }> = {
  verified: { dot: "#22c55e", ring: "rgba(34,197,94,.32)", label: "Verified" },
  drift: { dot: "#f43f5e", ring: "rgba(244,63,94,.42)", label: "Drift" },
  warming: { dot: "#fb923c", ring: "rgba(251,146,60,.32)", label: "Warming" },
  held: { dot: "#a78bfa", ring: "rgba(167,139,250,.32)", label: "Held" },
};

/* ─────────────────────────────── HERO LAUNCH ──────────────────────────────── */

function MissionTimer({ sec, paused }: { sec: MotionValue<number>; paused: boolean }) {
  const [label, setLabel] = useState("T-00:08.0");
  useEffect(() => {
    const unsub = sec.on("change", (s) => setLabel(fmtClock(s)));
    return () => unsub();
  }, [sec]);
  return (
    <div className="rounded-2xl border border-orange-500/35 bg-gradient-to-br from-orange-500/[.10] via-transparent to-transparent p-5">
      <div className="flex items-center gap-2 text-[10px] tracking-[.2em] text-orange-200/80 uppercase">
        <Rocket className="h-3 w-3" /> Mission · memorial-day-dallas-02
      </div>
      <div className="mt-3 font-mono text-4xl font-bold tracking-tight text-white tabular-nums">
        {label}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-white/55">
        <span className={`h-1.5 w-1.5 rounded-full ${paused ? "bg-white/40" : "bg-emerald-400 animate-pulse"}`} />
        {paused ? "Hold — operator paused" : "Sequence running · auto-loop"}
      </div>
    </div>
  );
}

/** A single ack dot — its own component so the hook isn't called in a loop. */
function AckDot({ t, off, color, seed }: { t: MotionValue<number>; off: number; color: string; seed: number }) {
  const top = useTransform(t, (v) => `${((v + off + seed * 0.07) * 100) % 100}%`);
  return (
    <motion.span
      style={{ top, background: color }}
      className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full shadow-[0_0_8px_currentColor]"
    />
  );
}

/** A vertical telemetry strip — animated dots fall as acks arrive. */
function TelemetryStrip({
  label,
  Icon,
  color,
  t,
  seed,
}: {
  label: string;
  Icon: ElementType;
  color: string;
  t: MotionValue<number>;
  seed: number;
}) {
  const reduced = useReducedMotion();
  const offsets = [0, 0.18, 0.36, 0.54, 0.72];
  return (
    <div className="relative flex h-full w-12 flex-col items-center rounded-xl border border-white/8 bg-white/[.025] p-2">
      <div className="text-[9px] uppercase tracking-[.2em] text-white/45">{label}</div>
      <div className="relative mt-2 h-full w-full overflow-hidden rounded-lg bg-black/40">
        {/* grid */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-white/[.04]"
            style={{ top: `${(i / 12) * 100}%` }}
          />
        ))}
        {/* baseline */}
        <div className="absolute inset-x-2 top-1/2 h-px bg-white/10" />
        {/* moving acks */}
        {!reduced &&
          offsets.map((off, i) => <AckDot key={i} t={t} off={off} color={color} seed={seed} />)}
        {/* "now" line */}
        <div className="absolute inset-x-0 top-1/2 h-[2px] bg-orange-500/40" />
      </div>
      <Icon className="mt-2 h-3.5 w-3.5" style={{ color }} />
    </div>
  );
}

/** Central isometric grid — store shelves seen from above, breathing. */
function IsoCore({
  t,
  mouseX,
  mouseY,
}: {
  t: MotionValue<number>;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}) {
  const rotateX = useTransform(mouseY, (v: number) => 52 + v * 0.4);
  const rotateZ = useTransform(mouseX, (v: number) => -28 + v * 0.4);
  const pulse = useTransform(t, (v) => 0.55 + Math.abs(Math.sin(v * Math.PI * 2)) * 0.35);
  return (
    <motion.div
      style={{
        rotateX,
        rotateZ,
        transformStyle: "preserve-3d",
        perspective: 900,
      }}
      className="relative mx-auto h-[300px] w-[300px]"
    >
      {/* floor grid */}
      <div className="absolute inset-0 rounded-2xl border border-white/10 bg-[#070a12] [background-image:linear-gradient(rgba(251,146,60,.10)_1px,transparent_1px),linear-gradient(90deg,rgba(251,146,60,.10)_1px,transparent_1px)] [background-size:24px_24px]" />
      {/* shelves */}
      {[
        [40, 40],
        [120, 40],
        [200, 40],
        [40, 130],
        [120, 130],
        [200, 130],
        [40, 220],
        [120, 220],
        [200, 220],
      ].map(([x, y], i) => (
        <motion.div
          key={i}
          style={{
            left: x,
            top: y,
            width: 60,
            height: 36,
            translateZ: 14 + (i % 3) * 6,
            background:
              i === 4
                ? "linear-gradient(180deg, rgba(251,146,60,.55), rgba(249,115,22,.18))"
                : "linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.02))",
            boxShadow: i === 4 ? "0 0 28px rgba(249,115,22,.6)" : undefined,
          }}
          className="absolute rounded-md border border-white/15"
        />
      ))}
      {/* pulse rings emanating from canary */}
      <motion.div
        style={{ opacity: pulse, scale: pulse }}
        className="pointer-events-none absolute left-[120px] top-[130px] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-orange-400/50"
      />
    </motion.div>
  );
}

/* ─────────────────────────── Command Grid Boot (signature) ────────────────────
   The hero's control board powers on: a matrix of cells lights up in a staggered
   diagonal wave (opacity/scale), iris-threaded, with a few cells holding as "live
   channels." A single scan sweep crosses on entry. Reduced-motion → fully lit,
   static, no wave / no scan. transform + opacity + boxShadow only.
   ──────────────────────────────────────────────────────────────────────────── */

const GRID_COLS = 13;
const GRID_ROWS = 7;
const GRID_TOTAL = GRID_COLS * GRID_ROWS;

// deterministic per-cell character so SSR and client agree (no Math.random)
function cellSeed(i: number): number {
  // cheap hash → 0..1
  const v = Math.sin(i * 12.9898 + 4.137) * 43758.5453;
  return v - Math.floor(v);
}

// iris-thread the boot colors so it reads as the same family as iris-text
const GRID_TONES = [
  "rgba(34,211,238,", // cyan
  "rgba(129,140,248,", // indigo
  "rgba(192,132,252,", // violet
  "rgba(251,146,60,", // orange
] as const;

type GridCell = {
  i: number;
  col: number;
  row: number;
  diag: number; // 0..1 normalized diagonal position → wave order
  tone: string;
  live: boolean; // keeps pulsing after boot as a "channel"
  hot: boolean; // brighter seed cell
};

const GRID_CELLS: GridCell[] = Array.from({ length: GRID_TOTAL }).map((_, i) => {
  const col = i % GRID_COLS;
  const row = Math.floor(i / GRID_COLS);
  const s = cellSeed(i);
  return {
    i,
    col,
    row,
    diag: (col + row) / (GRID_COLS + GRID_ROWS - 2),
    tone: GRID_TONES[i % GRID_TONES.length],
    // ~1 in 7 cells stays alive as a live channel; a few are extra-hot
    live: s > 0.84,
    hot: s > 0.93,
  };
});

/** A single live cell — own component so the pulse hook isn't called in a loop. */
function LiveCell({
  delay,
  tone,
}: {
  delay: number;
  tone: string;
}) {
  return (
    <motion.span
      aria-hidden
      className="absolute inset-[1px] rounded-[3px]"
      style={{ background: `${tone}0.9)` }}
      initial={{ opacity: 0.18 }}
      animate={{ opacity: [0.18, 0.7, 0.18] }}
      transition={{
        duration: 2.6,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    />
  );
}

function CommandGridBoot() {
  const reduced = useReducedMotion();
  // total wave time so the scan sweep + cells share one boot window
  const BOOT = 1.15;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
    >
      {/* the board: a single transform/opacity element, masked to fade at edges */}
      <motion.div
        className="relative grid h-[118%] w-[118%] gap-[6px] px-6"
        style={{
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
          maskImage:
            "radial-gradient(120% 90% at 50% 38%, black 38%, transparent 82%)",
          WebkitMaskImage:
            "radial-gradient(120% 90% at 50% 38%, black 38%, transparent 82%)",
          opacity: 0.5,
        }}
        initial={reduced ? false : { opacity: 0 }}
        animate={reduced ? undefined : { opacity: 0.5 }}
        transition={reduced ? undefined : { duration: 0.5, ease: EASE.outQuart }}
      >
        {GRID_CELLS.map((c) => {
          // diagonal wave: cells further along the diagonal light later
          const cellDelay = c.diag * BOOT;
          const restOpacity = c.hot ? 0.5 : c.live ? 0.4 : 0.22;
          const border = c.hot
            ? `${c.tone}0.55)`
            : c.live
              ? `${c.tone}0.4)`
              : "rgba(255,255,255,0.07)";
          const shadow = c.hot
            ? `0 0 14px ${c.tone}0.45)`
            : c.live
              ? `0 0 9px ${c.tone}0.3)`
              : "none";

          return (
            <motion.div
              key={c.i}
              className="relative rounded-[4px] border"
              style={{
                borderColor: border,
                boxShadow: shadow,
                background:
                  c.hot || c.live
                    ? `${c.tone}0.06)`
                    : "rgba(255,255,255,0.012)",
              }}
              initial={reduced ? false : { opacity: 0, scale: 0.6 }}
              animate={
                reduced
                  ? undefined
                  : {
                      opacity: [0, c.hot ? 0.95 : 0.85, restOpacity],
                      scale: [0.6, 1.06, 1],
                    }
              }
              transition={
                reduced
                  ? undefined
                  : {
                      duration: 0.7,
                      ease: EASE.outQuart,
                      delay: cellDelay,
                      times: [0, 0.55, 1],
                    }
              }
            >
              {/* live channels keep breathing after the wave settles */}
              {!reduced && c.live && (
                <LiveCell tone={c.tone} delay={BOOT + cellDelay * 0.4} />
              )}
            </motion.div>
          );
        })}

        {/* one-shot scan sweep across the board on entry */}
        {!reduced && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(129,140,248,0.16) 40%, rgba(34,211,238,0.22) 50%, rgba(251,146,60,0.16) 60%, transparent)",
              filter: "blur(2px)",
            }}
            initial={{ x: "0%", opacity: 0 }}
            animate={{ x: ["0%", "60%", "380%", "440%"], opacity: [0, 1, 1, 0] }}
            transition={{
              duration: BOOT + 0.5,
              ease: EASE.outQuart,
              times: [0, 0.12, 0.88, 1],
              delay: 0.15,
            }}
          />
        )}
      </motion.div>
    </div>
  );
}

/** Hero with parallax, timer, telemetry strips, isometric core, decision stream. */
function HeroLaunchConsole({
  paused,
  setPaused,
}: {
  paused: boolean;
  setPaused: (p: boolean) => void;
}) {
  const { t, sec, discrete } = useMissionClock(paused);
  const { ref, x, y } = useMouseParallax(10);
  const heroTilt = useTransform(x, (v) => v * 0.6);
  const heroTilt2 = useTransform(y, (v) => v * -0.6);
  const reduced = useReducedMotion();

  // decision stream: append a line every 0.6s, max 9 visible
  const [logs, setLogs] = useState<{ t: string; line: string; tone: "ok" | "warn" | "err" | "info" }[]>([]);
  useEffect(() => {
    if (reduced) {
      setLogs(SAMPLE_LOGS.slice(0, 8));
      return;
    }
    const lines = SAMPLE_LOGS;
    const id = setInterval(() => {
      const i = Math.floor((Date.now() / 600) % lines.length);
      const next = lines[i];
      setLogs((prev) => {
        const updated = [...prev, next];
        return updated.slice(-9);
      });
    }, 600);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden border-b border-white/[.06]"
      style={{ perspective: 1400 }}
    >
      <BackgroundOrbits variant="orange" />
      {/* grid floor receding */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[280px] opacity-40"
        style={{
          background:
            "linear-gradient(to top, rgba(249,115,22,.10), transparent 60%), linear-gradient(rgba(251,146,60,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(251,146,60,.16) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 56px 56px, 56px 56px",
          maskImage: "linear-gradient(to top, black, transparent)",
          transform: "perspective(900px) rotateX(60deg)",
          transformOrigin: "bottom",
        }}
      />
      {/* signature: control board powers on behind the console */}
      <CommandGridBoot />
      <motion.div
        style={{ rotateY: heroTilt, rotateX: heroTilt2, transformStyle: "preserve-3d" }}
        className="relative z-10 mx-auto max-w-[1400px] px-4 pb-12 pt-12 sm:px-6"
      >
        {/* top eyebrow */}
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="orange">05 · Mission Control</Pill>
          <Pill tone="purple">Concept vision</Pill>
          <Pill tone="neutral">One clock · every panel breathes</Pill>
        </div>

        <div className="mt-8 grid items-stretch gap-5 lg:grid-cols-[1.05fr_1.55fr_1fr]">
          {/* Left: timer + GO/NO-GO board */}
          <div className="flex flex-col gap-4">
            <MissionTimer sec={sec} paused={paused} />
            <GoNoGoBoard sec={sec} />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaused(!paused)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-white/75 transition hover:text-white"
              >
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {paused ? "Resume sequence" : "Hold sequence"}
              </button>
              <button
                onClick={() => setPaused(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
                title="Operator-only — concept demo"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Abort
              </button>
            </div>
          </div>

          {/* Center: telemetry + iso */}
          <div className="relative flex h-[420px] flex-col rounded-2xl border border-white/10 bg-[#06090f]/85 p-5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] tracking-[.22em] text-white/55 uppercase">
                CHANNEL TELEMETRY · 5 channels
              </p>
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-300">
                <CircleDot className="h-2.5 w-2.5 animate-pulse" />
                streaming
              </div>
            </div>
            <div className="mt-4 flex flex-1 gap-3">
              <div className="flex w-[56px] flex-col items-center justify-between gap-3">
                <TelemetryStrip label="POS" Icon={ScanLine} color="#fb923c" t={t} seed={0} />
                <TelemetryStrip label="ESL" Icon={Tag} color="#a78bfa" t={t} seed={1} />
              </div>
              <div className="relative flex-1">
                <IsoCore t={t} mouseX={x} mouseY={y} />
                <div className="absolute inset-x-0 bottom-1 text-center text-[10px] tracking-[.22em] text-white/35 uppercase">
                  Zone Dallas · 11 SKU · canary lit
                </div>
              </div>
              <div className="flex w-[56px] flex-col items-center justify-between gap-3">
                <TelemetryStrip label="WEB" Icon={Globe2} color="#60a5fa" t={t} seed={2} />
                <TelemetryStrip label="APP" Icon={Wifi} color="#22c55e" t={t} seed={3} />
              </div>
              <div className="flex w-[56px] flex-col items-center justify-between gap-3">
                <TelemetryStrip label="KSK" Icon={Radio} color="#ec4899" t={t} seed={4} />
                <div className="rounded-xl border border-white/10 bg-white/[.025] p-2 text-center">
                  <div className="text-[9px] uppercase tracking-[.2em] text-white/45">RTT</div>
                  <div className="mt-1 font-mono text-xs text-emerald-300">42ms</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: decision stream */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-black/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-emerald-300" />
                <p className="text-[10px] tracking-[.2em] text-white/65 uppercase">decision.stream</p>
              </div>
              <span className="text-[10px] text-white/35 tabular-nums">tick {discrete}</span>
            </div>
            <div
              aria-live="polite"
              className="mt-3 flex-1 overflow-hidden rounded-lg border border-white/[.04] bg-[#040608] p-3 font-mono text-[11px] leading-[1.55]"
            >
              <AnimatePresence initial={false}>
                {logs.map((l, i) => (
                  <motion.div
                    key={l.t + i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="whitespace-pre-wrap"
                  >
                    <span className="text-white/30">{l.t}</span>{" "}
                    <span
                      className={
                        l.tone === "ok"
                          ? "text-emerald-300"
                          : l.tone === "warn"
                            ? "text-orange-300"
                            : l.tone === "err"
                              ? "text-rose-300"
                              : "text-sky-300"
                      }
                    >
                      {l.line}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <p className="mt-3 text-[10px] text-white/40">
              ⌘ hover any panel to inspect · keyboard: <kbd className="rounded bg-white/[.06] px-1">space</kbd> hold
            </p>
          </div>
        </div>

        {/* Headline */}
        <div className="mt-10 max-w-3xl">
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">
            One launch console for every price
            <span className="iris-text">
              {" "}— from approval to a shopper&apos;s receipt.
            </span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/55">
            Treat a price rollout the way SpaceX treats a launch sequence. Pre-flight gates, multi-channel
            telemetry, per-store readiness, and an audit trail that prints in real time. Every element
            below is wired to one clock — pause it, and the entire page holds with you.
          </p>
        </div>
      </motion.div>
    </section>
  );
}

const SAMPLE_LOGS: { t: string; line: string; tone: "ok" | "warn" | "err" | "info" }[] = [
  { t: "[T-08.0]", line: "preflight: outbox staged · 11 events", tone: "info" },
  { t: "[T-06.4]", line: "preflight: certification green · pos/esl/web", tone: "ok" },
  { t: "[T-04.1]", line: "preflight: reliability.budget=0.07% headroom", tone: "ok" },
  { t: "[T-01.2]", line: "preflight: regression.verdict=safe-to-live", tone: "ok" },
  { t: "[T+00.0]", line: "GO · dispatching canary {dl-02,dl-04}", tone: "info" },
  { t: "[T+00.4]", line: "outbox.dispatch: 11/11 · skip-locked", tone: "ok" },
  { t: "[T+01.1]", line: "esl.ack: 11/11 · 88ms p50", tone: "ok" },
  { t: "[T+01.4]", line: "pos.ack: 10/11 · 1 retry queued", tone: "warn" },
  { t: "[T+02.2]", line: "drift: au-03 · sku=mk-au-03-2199 +$0.42", tone: "err" },
  { t: "[T+02.3]", line: "incident.open: INC-2147 · sla=120s", tone: "err" },
  { t: "[T+02.7]", line: "regression.replay: ok · safe-to-live", tone: "ok" },
  { t: "[T+03.0]", line: "live.retry: pos.ack ok · canonical aligned", tone: "ok" },
  { t: "[T+03.4]", line: "audit.seal: ack@T+02.3 < resolve@T+03.0", tone: "ok" },
  { t: "[T+04.0]", line: "attribution: released window verified-only", tone: "ok" },
];

/* ─────────────────────────────── GO/NO-GO board ───────────────────────────── */

const GATES = [
  { id: "outbox", label: "Outbox staged", at: 0.06 },
  { id: "contract", label: "Connector certification checks", at: 0.12 },
  { id: "slo", label: "Reliability budget", at: 0.18 },
  { id: "twin", label: "Regression replay verdict", at: 0.22 },
  { id: "canary", label: "Canary stores ready", at: 0.27 },
  { id: "audit", label: "Audit listener", at: 0.31 },
  { id: "kill", label: "Kill switch armed", at: 0.34 },
  { id: "go", label: "Operator GO", at: 0.4 },
];

function GoNoGoBoard({ sec }: { sec: MotionValue<number> }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const unsub = sec.on("change", (s) => setPct(s / MISSION_SECONDS));
    return () => unsub();
  }, [sec]);
  return (
    <div className="flex-1 rounded-2xl border border-white/10 bg-[#0a0e18]/85 p-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] tracking-[.2em] text-white/55 uppercase">GO / NO-GO board</p>
        <span className="text-[10px] text-white/35">8 gates</span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {GATES.map((g) => {
          const lit = pct >= g.at;
          return (
            <li
              key={g.id}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] transition ${
                lit
                  ? "border-emerald-500/25 bg-emerald-500/[.06] text-emerald-200"
                  : "border-white/8 bg-white/[.02] text-white/45"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  lit ? "bg-emerald-400 shadow-[0_0_6px_#22c55e]" : "bg-white/15"
                }`}
              />
              <span className="flex-1 truncate">{g.label}</span>
              <span className="font-mono text-[9px] text-white/40">
                {lit ? "GO" : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─────────────────────────── live store grid + spotlight ──────────────────── */

function LiveStoreMap() {
  const [hover, setHover] = useState<Store | null>(null);
  const [pinned, setPinned] = useState<Store | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const sx = useSpring(50, { stiffness: 80, damping: 18 });
  const sy = useSpring(50, { stiffness: 80, damping: 18 });
  const reduced = useReducedMotion();

  const onMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (reduced) return;
      const r = mapRef.current?.getBoundingClientRect();
      if (!r) return;
      sx.set(((e.clientX - r.left) / r.width) * 100);
      sy.set(((e.clientY - r.top) / r.height) * 100);
    },
    [reduced, sx, sy],
  );

  const spotlight = useTransform([sx, sy], ([x, y]) =>
    `radial-gradient(220px circle at ${x}% ${y}%, rgba(249,115,22,.22), transparent 65%)`,
  );

  const inspect = pinned ?? hover;

  return (
    <section className="relative mt-14 mx-auto max-w-[1400px] px-4 sm:px-6">
      <div className="flex items-end justify-between">
        <div>
          <Pill tone="orange">Live store fleet</Pill>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            14 stores, one canary corridor — hover to inspect, click to pin.
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            The cursor lights what it touches. State pulses derive from per-store ack pressure and
            drift windows — green is verified, red is open drift, violet is held under containment.
          </p>
        </div>
        <Pill tone="purple">Cursor-aware</Pill>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div
          ref={mapRef}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          className="relative h-[440px] overflow-hidden rounded-3xl border border-white/10 bg-[#06090f]"
        >
          {/* grid */}
          <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:42px_42px] opacity-50" />
          {/* spotlight */}
          <motion.div style={{ background: spotlight as any }} className="absolute inset-0 pointer-events-none" />

          {/* arcs from dispatch origin (dl-02) to all canary/active */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            {STORES.filter((s) => s.id !== "dl-02").map((s) => {
              const x1 = 22,
                y1 = 38;
              const x2 = s.x,
                y2 = s.y;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2 - 8;
              return (
                <path
                  key={s.id}
                  d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
                  stroke={
                    s.state === "drift"
                      ? "rgba(244,63,94,.45)"
                      : s.state === "held"
                        ? "rgba(167,139,250,.3)"
                        : "rgba(251,146,60,.25)"
                  }
                  strokeWidth="0.2"
                  fill="none"
                  strokeDasharray="0.6 0.4"
                />
              );
            })}
          </svg>

          {/* stores */}
          {STORES.map((s) => {
            const tone = STATE_TONE[s.state];
            const active = inspect?.id === s.id;
            return (
              <button
                key={s.id}
                onMouseEnter={() => setHover(s)}
                onClick={() => setPinned((p) => (p?.id === s.id ? null : s))}
                className="group absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none"
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
                aria-label={`${s.label} · ${tone.label}`}
              >
                <span
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    width: active ? 44 : 30,
                    height: active ? 44 : 30,
                    boxShadow: `0 0 22px ${tone.ring}`,
                    background: tone.ring,
                    transition: "all .22s ease",
                  }}
                />
                <span
                  className="relative z-10 block h-3.5 w-3.5 rounded-full ring-2 ring-black/40"
                  style={{ background: tone.dot }}
                />
                {!reduced && s.state === "drift" && (
                  <motion.span
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                    style={{ borderColor: tone.dot }}
                    initial={{ width: 12, height: 12, opacity: 0.8 }}
                    animate={{ width: 48, height: 48, opacity: 0 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                {s.canary && (
                  <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[8px] tracking-[.18em] text-orange-200 uppercase">
                    canary
                  </span>
                )}
              </button>
            );
          })}

          {/* legend */}
          <div className="absolute bottom-3 left-3 flex gap-2 rounded-lg border border-white/10 bg-black/55 px-3 py-2 text-[10px] text-white/65">
            {(Object.entries(STATE_TONE) as [Store["state"], (typeof STATE_TONE)[Store["state"]]][]).map(
              ([k, v]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: v.dot }} /> {v.label}
                </span>
              ),
            )}
          </div>
        </div>

        {/* inspector */}
        <div className="rounded-3xl border border-white/10 bg-[#0a0e18]/85 p-5">
          <div className="flex items-center justify-between">
            <Pill tone={inspect?.state === "drift" ? "red" : inspect?.state === "held" ? "purple" : "green"}>
              {inspect ? STATE_TONE[inspect.state].label : "No selection"}
            </Pill>
            <span className="text-[10px] text-white/40 tracking-[.2em] uppercase">Inspector</span>
          </div>
          {!inspect ? (
            <div className="mt-6 flex h-[300px] items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-sm text-white/40">
              Hover a store dot to inspect.
              <br /> Click to pin.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[.2em] text-white/45">Store</p>
                <p className="mt-1 text-lg font-semibold text-white">{inspect.label}</p>
                <p className="text-[11px] text-white/45">
                  Zone {inspect.zone} · {inspect.canary ? "canary corridor" : "downstream"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="canonical" value="$5.49" />
                <Stat label="last ack" value="92 ms" />
                <Stat label="connector" value="esl-v3.4" />
                <Stat label="trace_id" value="7741af3b" mono />
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[.025] p-3">
                <p className="text-[10px] uppercase tracking-[.2em] text-white/45">recent events</p>
                <ul className="mt-2 space-y-1 font-mono text-[11px] text-white/65">
                  <li><span className="text-white/35">T+01.1</span> esl.ack ok</li>
                  <li><span className="text-white/35">T+01.4</span> pos.ack ok</li>
                  {inspect.state === "drift" && (
                    <li className="text-rose-300"><span className="text-white/35">T+02.3</span> drift opened · +$0.42</li>
                  )}
                  {inspect.state === "held" && (
                    <li className="text-violet-300"><span className="text-white/35">T+02.4</span> hold · containment</li>
                  )}
                  <li className="text-emerald-300"><span className="text-white/35">T+03.0</span> aligned</li>
                </ul>
              </div>
              <Link
                href="/operations/batches/memorial-day-dallas-02"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-200 hover:bg-orange-500/20"
              >
                Open working batch <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[.025] p-2">
      <div className="text-[9px] uppercase tracking-[.2em] text-white/45">{label}</div>
      <div className={`mt-0.5 text-sm text-white ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

/* ─────────────────────────── cost-of-drift counter ────────────────────────── */

function CostOfDrift() {
  const reduced = useReducedMotion();
  const [val, setVal] = useState(0);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (reduced) {
      setVal(842.18);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setVal((v) => {
        if (!open) return v;
        // burn ~$84/s in open drift
        const next = v + dt * 84;
        if (next > 1280) {
          setOpen(false);
          return next;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, open]);

  const formatted = useMemo(
    () => val.toLocaleString("en-US", { style: "currency", currency: "USD" }),
    [val],
  );

  return (
    <section className="relative mt-14 mx-auto max-w-[1400px] px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-rose-500/[.06] via-transparent to-orange-500/[.06] p-8">
        <BackgroundOrbits variant="red" />
        <div className="relative grid items-center gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <Pill tone={open ? "red" : "green"}>{open ? "Drift window open" : "Drift resolved"}</Pill>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Cost-of-drift, ticking in real time.
            </h3>
            <p className="mt-2 max-w-xl text-sm text-white/55">
              Volume × price gap × foot traffic, in the very 15-minute window the drift is open.
              ShelfTrace surfaces it before the weekly recon meeting — and freezes the meter the second
              the regression replay re-aligns the canonical price.
            </p>
            <div className="mt-6 flex items-baseline gap-3">
              <div className="font-mono text-6xl font-bold tabular-nums text-white">{formatted}</div>
              <div className={`text-xs uppercase tracking-[.2em] ${open ? "text-rose-300" : "text-emerald-300"}`}>
                {open ? "burn rate $84/s" : "frozen · resolved"}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-[10px] uppercase tracking-[.18em] text-white/45">
              <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">incident INC-2147</span>
              <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">SKU mk-au-03-2199</span>
              <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">store au-03</span>
              <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">sla 120s</span>
            </div>
          </div>
          <ConnectorGauges open={open} />
        </div>
      </div>
    </section>
  );
}

function ConnectorGauges({ open }: { open: boolean }) {
  const reduced = useReducedMotion();
  const channels = [
    { name: "POS", value: open ? 0.71 : 0.42, color: "#fb923c", icon: ScanLine },
    { name: "ESL", value: 0.31, color: "#a78bfa", icon: Tag },
    { name: "WEB", value: 0.46, color: "#60a5fa", icon: Globe2 },
    { name: "APP", value: 0.28, color: "#22c55e", icon: Wifi },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {channels.map((c) => {
        const dash = 2 * Math.PI * 28;
        return (
          <div key={c.name} className="relative rounded-2xl border border-white/10 bg-[#0a0e18]/85 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[.18em] text-white/55">
                <c.icon className="h-3 w-3" style={{ color: c.color }} /> {c.name}
              </span>
              <span className="font-mono text-[10px] text-white/40">load</span>
            </div>
            <div className="relative mt-2 flex items-center justify-center">
              <svg viewBox="0 0 80 80" className="h-[110px] w-[110px]">
                <circle cx="40" cy="40" r="28" stroke="rgba(255,255,255,.08)" strokeWidth="6" fill="none" />
                <motion.circle
                  cx="40"
                  cy="40"
                  r="28"
                  stroke={c.color}
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={dash}
                  initial={false}
                  animate={{ strokeDashoffset: dash * (1 - c.value) }}
                  transition={{ duration: reduced ? 0 : 0.8, ease: "easeOut" }}
                  transform="rotate(-90 40 40)"
                />
                <text
                  x="40"
                  y="44"
                  textAnchor="middle"
                  fontFamily="ui-monospace, monospace"
                  fontSize="13"
                  fill="#fff"
                >
                  {Math.round(c.value * 100)}%
                </text>
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────── multi-channel telemetry tape ──────────────────── */

function ChannelTape({
  name,
  color,
  Icon,
  speed,
  spikes,
}: {
  name: string;
  color: string;
  Icon: ElementType;
  speed: number;
  spikes: { at: number; tone: "ok" | "warn" | "err" }[];
}) {
  const reduced = useReducedMotion();
  return (
    <div className="rounded-2xl border border-white/10 bg-[#06090f] p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-white/65">
          <Icon className="h-3.5 w-3.5" style={{ color }} /> {name}
        </span>
        <span className="font-mono text-[10px] text-white/40">
          ack/s {Math.round(8 + speed * 6)}
        </span>
      </div>
      <div className="relative mt-3 h-[64px] overflow-hidden rounded-lg border border-white/[.04] bg-black/45">
        {/* baseline */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
        {/* moving waveform */}
        <motion.svg
          viewBox="0 0 200 64"
          className="absolute inset-y-0 left-0 h-full"
          style={{ width: "400%" }}
          animate={reduced ? undefined : { x: ["0%", "-50%"] }}
          transition={reduced ? undefined : { duration: 10 / speed, repeat: Infinity, ease: "linear" }}
        >
          <path
            d={generateWave(400, 64, 18 / speed)}
            fill="none"
            stroke={color}
            strokeWidth="1.2"
            opacity="0.85"
          />
        </motion.svg>
        {/* spikes layered */}
        {spikes.map((s, i) => (
          <span
            key={i}
            className="absolute top-1.5 h-[52px] w-[2px] rounded"
            style={{
              left: `${s.at}%`,
              background:
                s.tone === "ok" ? "#22c55e" : s.tone === "warn" ? "#fb923c" : "#f43f5e",
              opacity: 0.85,
              boxShadow: `0 0 8px ${
                s.tone === "ok" ? "#22c55e" : s.tone === "warn" ? "#fb923c" : "#f43f5e"
              }`,
            }}
          />
        ))}
        {/* now marker */}
        <div className="absolute right-3 top-0 h-full w-px bg-orange-500/40" />
      </div>
    </div>
  );
}

function generateWave(width: number, height: number, period: number): string {
  let d = `M 0 ${height / 2}`;
  for (let x = 0; x <= width; x += 2) {
    const y =
      height / 2 +
      Math.sin(x / period) * (height / 5) +
      Math.sin(x / (period * 0.31)) * (height / 9);
    d += ` L ${x} ${y.toFixed(2)}`;
  }
  return d;
}

function ChannelTapes() {
  return (
    <section className="relative mt-14 mx-auto max-w-[1400px] px-4 sm:px-6">
      <div className="flex items-end justify-between">
        <div>
          <Pill tone="orange">Connector telemetry</Pill>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Every channel, scrolling — one tape per integration.
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Spikes mark acks: green for verified, amber for retry, red for drift.
            The orange line is &quot;now.&quot; If a channel slows, the waveform compresses; if it
            stops, the tape goes flat.
          </p>
        </div>
        <Pill tone="purple">Live</Pill>
      </div>
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <ChannelTape
          name="POS · checkout adapter"
          color="#fb923c"
          Icon={ScanLine}
          speed={1.0}
          spikes={[
            { at: 12, tone: "ok" },
            { at: 28, tone: "ok" },
            { at: 41, tone: "warn" },
            { at: 56, tone: "ok" },
            { at: 72, tone: "err" },
            { at: 79, tone: "ok" },
          ]}
        />
        <ChannelTape
          name="ESL · shelf-edge labels"
          color="#a78bfa"
          Icon={Tag}
          speed={1.6}
          spikes={[
            { at: 8, tone: "ok" },
            { at: 22, tone: "ok" },
            { at: 36, tone: "ok" },
            { at: 50, tone: "ok" },
            { at: 64, tone: "ok" },
            { at: 78, tone: "ok" },
          ]}
        />
        <ChannelTape
          name="WEB · catalog & PDP"
          color="#60a5fa"
          Icon={Globe2}
          speed={0.8}
          spikes={[
            { at: 14, tone: "ok" },
            { at: 33, tone: "warn" },
            { at: 48, tone: "ok" },
            { at: 70, tone: "ok" },
          ]}
        />
        <ChannelTape
          name="APP · mobile / kiosk"
          color="#22c55e"
          Icon={Wifi}
          speed={1.2}
          spikes={[
            { at: 18, tone: "ok" },
            { at: 30, tone: "ok" },
            { at: 44, tone: "ok" },
            { at: 60, tone: "ok" },
            { at: 76, tone: "ok" },
          ]}
        />
      </div>
    </section>
  );
}

/* ─────────────────────────── animated thermal receipt ─────────────────────── */

const RECEIPT_LINES = [
  "  S H E L F T R A C E   A U D I T",
  "  ─────────────────────────────────",
  "  Batch     memorial-day-dallas-02",
  "  Started   T+00.0  · 11 events",
  "  Channel   POS  ESL  WEB  APP",
  "  Acks      10   11   11   11",
  "  Drift     1  → INC-2147 (au-03)",
  "  Replay    regression  → safe-to-live",
  "  Retry     live  → aligned",
  "  Audit     ack@T+02.3 < res@T+03.0",
  "  Verdict   ✓ ATTRIBUTION RELEASED",
  "  ─────────────────────────────────",
  "  trace_id  7741af3b · sealed",
];

function ThermalReceipt() {
  const reduced = useReducedMotion();
  const [printedLines, setPrintedLines] = useState(0);
  const [printedChars, setPrintedChars] = useState(0);

  useEffect(() => {
    if (reduced) {
      setPrintedLines(RECEIPT_LINES.length);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      if (dt > 30) {
        last = now;
        setPrintedChars((c) => {
          const line = RECEIPT_LINES[printedLines] ?? "";
          if (c + 1 > line.length) {
            setPrintedLines((l) => {
              if (l + 1 >= RECEIPT_LINES.length) return l; // stop at end
              return l + 1;
            });
            return 0;
          }
          return c + 1;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, printedLines]);

  const reset = () => {
    setPrintedLines(0);
    setPrintedChars(0);
  };

  return (
    <section className="relative mt-14 mx-auto max-w-[1400px] px-4 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Pill tone="orange">Audit receipt</Pill>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            The audit prints in real time. You can tear it off.
          </h3>
          <p className="mt-2 max-w-xl text-sm text-white/55">
            Every rollout produces a tamper-evident receipt: ack ordering, retries, regression verdicts,
            attribution gate. It is the same data that backs the working <code className="text-orange-300">/engineering</code>
            {" "}trace — printed here for the operator&apos;s eye.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Stat label="batch" value="DAL-02" />
            <Stat label="trace" value="7741af3b" mono />
            <Stat label="result" value="released" />
          </div>
          <div className="mt-5 flex gap-2">
            <Link
              href="/engineering"
              className="inline-flex items-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-200 hover:bg-orange-500/20"
            >
              Open Engineering Trace <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-white/75 hover:text-white"
            >
              <Receipt className="h-3.5 w-3.5" /> Re-print
            </button>
          </div>
        </div>
        {/* printer */}
        <div className="relative mx-auto w-full max-w-[420px]">
          {/* printer head */}
          <div className="relative z-10 mx-auto h-14 w-[88%] rounded-t-2xl border border-white/10 bg-gradient-to-b from-[#1a1f2c] to-[#0e131c] shadow-[0_8px_30px_rgba(0,0,0,.5)]">
            <div className="absolute inset-x-6 top-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-orange-300">
                <Receipt className="h-3 w-3" /> THERMAL PRINTER
              </div>
              <span className="flex items-center gap-1 text-[10px] text-emerald-300">
                <CircleDot className="h-2 w-2 animate-pulse" /> printing
              </span>
            </div>
            <div className="absolute inset-x-3 bottom-2 h-[6px] rounded bg-black/60">
              <div className="h-full w-[26px] rounded bg-orange-500/70 shadow-[0_0_8px_#f97316]" />
            </div>
          </div>
          {/* paper */}
          <div className="relative -mt-1 mx-auto w-[78%] rounded-b-md bg-[#fffdf6] px-4 py-4 font-mono text-[11px] leading-[1.55] text-[#262019] shadow-[0_30px_60px_-30px_rgba(249,115,22,.55)]">
            <div
              className="pointer-events-none absolute inset-0 opacity-[.06]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent 0 3px, rgba(0,0,0,.4) 3px 4px)",
              }}
            />
            {RECEIPT_LINES.slice(0, printedLines).map((line, i) => (
              <div key={i} className="whitespace-pre">{line}</div>
            ))}
            {printedLines < RECEIPT_LINES.length && (
              <div className="whitespace-pre">
                {RECEIPT_LINES[printedLines].slice(0, printedChars)}
                <span className="ml-px inline-block h-3 w-1.5 animate-pulse bg-[#262019] align-middle" />
              </div>
            )}
            {/* tear edge */}
            <div
              className="absolute -bottom-2 inset-x-0 h-3"
              style={{
                background:
                  "radial-gradient(circle at 4px 0, transparent 3px, #fffdf6 3.5px) repeat-x",
                backgroundSize: "8px 6px",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── mission log waterfall (terminal) ──────────────── */

const WATERFALL: { tone: "ok" | "warn" | "err" | "info"; line: string }[] = [
  { tone: "info", line: "preflight.outbox: 11 events staged · skip-locked" },
  { tone: "ok", line: "preflight.certification: verified · pos/esl/web/app" },
  { tone: "ok", line: "preflight.budget: error_budget_remaining=0.07%" },
  { tone: "ok", line: "preflight.regression: verdict=safe-to-live · replay_lag=14ms" },
  { tone: "info", line: "dispatch.canary: {dl-02, dl-04} · 11/11" },
  { tone: "ok", line: "ack.esl[dl-02]: 11/11 · p50=88ms" },
  { tone: "ok", line: "ack.pos[dl-02]: 11/11 · p50=104ms" },
  { tone: "ok", line: "ack.web[dl-02]: 11/11 · p50=42ms" },
  { tone: "info", line: "expand.zone: dal → aus, hou, okc, mem, nol" },
  { tone: "warn", line: "ack.pos[au-03]: reported=$5.99 canonical=$5.49" },
  { tone: "err", line: "reconcile.drift: open · INC-2147 · sla=120s" },
  { tone: "info", line: "containment.hold: downstream paused · attribution held" },
  { tone: "ok", line: "regression.replay[au-03]: ok · safe-to-live=true" },
  { tone: "ok", line: "live.retry[au-03]: pos.ack ok · canonical=$5.49" },
  { tone: "ok", line: "audit.seal: causal ok · ack < resolve" },
  { tone: "ok", line: "attribution.release: window=verified-only" },
  { tone: "info", line: "regression.add: scenario=stale_price/yogurt-32oz" },
  { tone: "ok", line: "mission.complete · 30.0s · 14 stores green" },
];

function MissionLogWaterfall() {
  const reduced = useReducedMotion();
  const [feed, setFeed] = useState<typeof WATERFALL>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduced) {
      setFeed(WATERFALL.slice(0, 12));
      return;
    }
    if (paused) return;
    let i = 0;
    const id = setInterval(() => {
      setFeed((prev) => {
        const next = [...prev, WATERFALL[i % WATERFALL.length]];
        i += 1;
        return next.slice(-14);
      });
    }, 750);
    return () => clearInterval(id);
  }, [reduced, paused]);

  const palette = {
    ok: "text-emerald-300",
    warn: "text-orange-300",
    err: "text-rose-300",
    info: "text-sky-300",
  } as const;

  return (
    <section className="relative mt-14 mx-auto max-w-[1400px] px-4 sm:px-6">
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-[#040608] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-emerald-300" />
              <span className="text-[10px] tracking-[.2em] text-white/65 uppercase">mission.log · live</span>
            </div>
            <button
              onClick={() => setPaused((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[.04] px-2 py-1 text-[10px] text-white/65 hover:text-white"
            >
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {paused ? "resume" : "hold"}
            </button>
          </div>
          <div className="mt-3 h-[300px] overflow-hidden rounded-xl border border-white/[.04] bg-black/55 p-3 font-mono text-[12px] leading-[1.6]">
            <AnimatePresence initial={false}>
              {feed.map((l, i) => (
                <motion.div
                  key={`${l.line}-${i}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="whitespace-pre-wrap"
                >
                  <span className="text-white/30">[{(i * 0.75).toFixed(2)}]</span>{" "}
                  <span className={palette[l.tone]}>{l.line}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <ArchitectureRail />
      </div>
    </section>
  );
}

/* ─────────────────────── architecture rail (production principles) ───────── */

const PRINCIPLES = [
  { name: "Outbox + SKIP LOCKED", sub: "Postgres", icon: Database },
  { name: "Idempotency keys", sub: "Exactly-once effect", icon: Repeat },
  { name: "Connector certification", sub: "Provider/consumer", icon: FileSignature },
  { name: "Structured trace events", sub: "trace_id end-to-end", icon: Network },
  { name: "Reliability budgets", sub: "Auto-pause", icon: ShieldCheck },
  { name: "Feature flags", sub: "Per-zone rollout", icon: Cable },
  { name: "ADR-driven", sub: "Decisions of record", icon: FileSignature },
  { name: "Audit causality", sub: "ack < resolve", icon: BadgeCheck },
];

function ArchitectureRail() {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0a0e18]/85 p-5">
      <div className="flex items-center justify-between">
        <Pill tone="sky">Production-ready under the hood</Pill>
        <span className="text-[10px] text-white/40 tracking-[.2em] uppercase">8 principles</span>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2">
        {PRINCIPLES.map((p) => (
          <li
            key={p.name}
            className="group flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[.025] p-2.5 transition hover:border-orange-500/30 hover:bg-orange-500/[.04]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[.04] text-orange-300">
              <p.icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-medium text-white">{p.name}</span>
              <span className="block text-[9px] uppercase tracking-[.18em] text-white/40">{p.sub}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] text-white/45">
        Wired in the working repo. Mission Control is the operator surface on top.
      </p>
    </div>
  );
}

/* ─────────────────────────────── footer CTAs ──────────────────────────────── */

function CtaRail() {
  return (
    <section className="relative mt-14 mx-auto max-w-[1400px] px-4 sm:px-6 pb-20">
      <div className="overflow-hidden rounded-3xl border border-orange-500/25 bg-gradient-to-br from-orange-500/[.07] via-transparent to-violet-500/[.07] p-6">
        <div className="grid items-center gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <Pill tone="orange">Click anything · open the real surface</Pill>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Mission Control is a concept. The engine underneath is real.
            </h3>
            <p className="mt-2 max-w-xl text-sm text-white/55">
              The cinematic above is rendered. The outbox, audit, scenario engine and tests behind it
              exist in the working repo. Every panel here links back into that surface.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                ["/operations", "Live Operations"],
                ["/scenarios", "Scenario Builder"],
                ["/certification", "Certification Lab"],
                ["/engineering", "Engineering Trace"],
                ["/operations/incidents", "Incidents"],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-white/75 hover:text-white"
                >
                  {label} <ArrowUpRight className="h-3 w-3" />
                </Link>
              ))}
            </div>
          </div>
          <div className="holo-card glow-iris rounded-2xl p-5">
            <p className="text-[10px] tracking-[.2em] text-orange-300 uppercase">Principle</p>
            <p className="mt-3 text-base font-medium leading-snug text-white">
              &ldquo;Treat every price like a launch. Pre-flight gates. Live telemetry. A receipt the
              operator can tear off.&rdquo;
            </p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-white/45">
              <Sparkles className="h-3.5 w-3.5 text-orange-300" />
              ShelfTrace · independent execution-reliability prototype
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────── page ─────────────────────────────────── */

export default function MissionControlPage() {
  const [paused, setPaused] = useState(false);

  // keyboard: space toggles pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative">
      <HeroLaunchConsole paused={paused} setPaused={setPaused} />
      <LiveStoreMap />
      <ChannelTapes />
      <CostOfDrift />
      <ThermalReceipt />
      <MissionLogWaterfall />
      <CtaRail />
    </div>
  );
}
