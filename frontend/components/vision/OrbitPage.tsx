"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ElementType, PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CircleDot,
  Database,
  Gauge,
  Globe2,
  Layers3,
  Move3d,
  Pause,
  Play,
  Radio,
  Repeat,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Tag,
  Terminal,
  Thermometer,
  Wifi,
  Zap,
} from "lucide-react";
import { BackgroundOrbits, Pill } from "./Shell";
import { EASE } from "@/lib/motion";

/* ─────────────────────────────────────────────────────────────────────────────
   /vision/orbit — Command Sphere
   A single-page operator simulator. Inject actions actually mutate the sim;
   every panel reads from one shared state. 3D-CSS perspective sphere with
   drag-to-rotate, scrubbable timeline. No new deps, no audio.
   ──────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────── simulation state machine ────────────────────── */

type Severity = "info" | "ok" | "warn" | "err";
type LogEntry = { id: number; t: number; tone: Severity; line: string };
type IncidentState = "open" | "twin" | "live" | "sealed";
type Incident = { id: string; store: string; opened: number; state: IncidentState; sku: string; gap: number };

type SimMode = "calm" | "burst" | "drift" | "throttled";

type SimState = {
  t: number; // sim seconds elapsed
  playing: boolean;
  mode: SimMode;
  throughput: number; // events/s
  sloRemaining: number; // 0..1
  driftDollars: number;
  log: LogEntry[];
  incidents: Incident[];
  loads: Record<string, number>; // 0..1 per node
  highlightStore: string | null;
  inspector: { kind: "node" | "store" | null; id: string | null };
};

const NODES = [
  { id: "core", label: "Approved Price", icon: Sparkles, color: "#fb923c", angle: 0 },
  { id: "outbox", label: "Outbox", icon: Database, color: "#fb923c", angle: 0 },
  { id: "twin", label: "Regression Replay", icon: Layers3, color: "#a78bfa", angle: 45 },
  { id: "esl", label: "ESL adapter", icon: Tag, color: "#a78bfa", angle: 90 },
  { id: "pos", label: "POS adapter", icon: ScanLine, color: "#fb923c", angle: 135 },
  { id: "web", label: "WEB adapter", icon: Globe2, color: "#60a5fa", angle: 180 },
  { id: "app", label: "APP adapter", icon: Wifi, color: "#22c55e", angle: 225 },
  { id: "kiosk", label: "Kiosk", icon: Radio, color: "#ec4899", angle: 270 },
  { id: "audit", label: "Audit · seal", icon: BadgeCheck, color: "#22c55e", angle: 315 },
] as const;

const STORES = [
  { id: "dl-02", label: "Dallas 02", zone: "DAL", angle: 18, canary: true },
  { id: "dl-04", label: "Dallas 04", zone: "DAL", angle: 47, canary: true },
  { id: "dl-07", label: "Dallas 07", zone: "DAL", angle: 70, canary: false },
  { id: "au-01", label: "Austin 01", zone: "AUS", angle: 102, canary: false },
  { id: "au-03", label: "Austin 03", zone: "AUS", angle: 134, canary: false },
  { id: "au-09", label: "Austin 09", zone: "AUS", angle: 158, canary: false },
  { id: "hs-12", label: "Houston 12", zone: "HOU", angle: 182, canary: false },
  { id: "hs-18", label: "Houston 18", zone: "HOU", angle: 211, canary: false },
  { id: "ok-04", label: "Oklahoma 04", zone: "OKC", angle: 238, canary: false },
  { id: "ok-06", label: "Oklahoma 06", zone: "OKC", angle: 260, canary: false },
  { id: "mp-21", label: "Memphis 21", zone: "MEM", angle: 284, canary: false },
  { id: "no-05", label: "New Orleans 05", zone: "NOL", angle: 312, canary: false },
  { id: "no-09", label: "New Orleans 09", zone: "NOL", angle: 338, canary: false },
];

const INITIAL: SimState = {
  t: 0,
  playing: true,
  mode: "calm",
  throughput: 24,
  sloRemaining: 0.993,
  driftDollars: 0,
  log: [
    { id: 0, t: 0, tone: "info", line: "sim.boot · ShelfTrace orbital console online" },
    { id: 1, t: 0.2, tone: "ok", line: "preflight.certification: 4 adapters verified" },
    { id: 2, t: 0.4, tone: "ok", line: "preflight.budget: reliability budget 99.30% available" },
  ],
  incidents: [],
  loads: { core: 0.4, outbox: 0.42, twin: 0.18, esl: 0.31, pos: 0.46, web: 0.32, app: 0.28, kiosk: 0.18, audit: 0.22 },
  highlightStore: null,
  inspector: { kind: null, id: null },
};

type Action =
  | { type: "tick"; dt: number }
  | { type: "togglePlay" }
  | { type: "setMode"; mode: SimMode }
  | { type: "inject"; kind: "drift" | "spike" | "throttle" | "replay" | "reset"; store?: string }
  | { type: "select"; kind: "node" | "store" | null; id: string | null }
  | { type: "resolveIncident"; id: string }
  | { type: "log"; tone: Severity; line: string };

let LOG_ID = 100;
function pushLog(state: SimState, tone: Severity, line: string): LogEntry[] {
  const next = [...state.log, { id: LOG_ID++, t: state.t, tone, line }];
  return next.slice(-32);
}

function reducer(state: SimState, action: Action): SimState {
  switch (action.type) {
    case "tick": {
      if (!state.playing) return state;
      const t = state.t + action.dt;
      // throughput jitter
      let baseThru = 24;
      if (state.mode === "burst") baseThru = 78;
      if (state.mode === "throttled") baseThru = 9;
      const throughput = Math.round(baseThru + Math.sin(t * 1.8) * 4 + (Math.random() - 0.5) * 3);

      // drift dollars accumulate while any open incident exists
      const openIncidents = state.incidents.filter((i) => i.state === "open");
      let driftDollars = state.driftDollars + openIncidents.length * action.dt * 84;

      // automatic incident progression: open → twin (after 1.5s) → live (1s) → sealed (1s)
      let log = state.log;
      const incidents = state.incidents.map((inc) => {
        const elapsed = t - inc.opened;
        if (inc.state === "open" && elapsed > 1.5) {
          log = pushLog({ ...state, log }, "ok", `regression.replay[${inc.store}]: ok · safe-to-live`);
          return { ...inc, state: "twin" as IncidentState };
        }
        if (inc.state === "twin" && elapsed > 2.5) {
          log = pushLog({ ...state, log }, "ok", `live.retry[${inc.store}]: pos.ack ok · canonical aligned`);
          return { ...inc, state: "live" as IncidentState };
        }
        if (inc.state === "live" && elapsed > 3.5) {
          log = pushLog({ ...state, log }, "ok", `audit.seal[${inc.store}]: ack < resolve · sealed`);
          return { ...inc, state: "sealed" as IncidentState };
        }
        return inc;
      });

      // SLO budget recovery
      const allSealed = incidents.length === 0 || incidents.every((i) => i.state === "sealed");
      let sloRemaining = state.sloRemaining;
      if (allSealed) sloRemaining = Math.min(0.999, sloRemaining + action.dt * 0.0005);

      // loads jitter (cheap)
      const loads = { ...state.loads };
      Object.keys(loads).forEach((k) => {
        const target = state.mode === "burst" ? 0.78 : state.mode === "throttled" && k === "esl" ? 0.92 : 0.32;
        loads[k] = loads[k] + (target - loads[k]) * 0.04 + (Math.random() - 0.5) * 0.02;
        loads[k] = Math.max(0.05, Math.min(0.98, loads[k]));
      });

      // throttled mode → esl load spike + occasional warn
      if (state.mode === "throttled" && Math.random() < action.dt * 0.5) {
        log = pushLog({ ...state, log }, "warn", `esl.lag · p99=${Math.round(220 + Math.random() * 60)}ms`);
      }

      // mode auto-reset to calm after a while
      let mode = state.mode;
      if ((state.mode === "burst" || state.mode === "throttled") && Math.random() < action.dt * 0.08) {
        mode = "calm";
        log = pushLog({ ...state, log }, "ok", `sim.mode → calm`);
      }

      return { ...state, t, throughput, driftDollars, log, incidents, loads, sloRemaining, mode };
    }
    case "togglePlay":
      return { ...state, playing: !state.playing };
    case "setMode":
      return { ...state, mode: action.mode };
    case "inject": {
      if (action.kind === "reset") {
        return {
          ...INITIAL,
          t: state.t,
          log: pushLog(state, "info", "sim.reset · baseline restored"),
        };
      }
      if (action.kind === "drift") {
        const store = action.store ?? STORES[Math.floor(Math.random() * STORES.length)].id;
        const gap = Math.round((30 + Math.random() * 70)) / 100;
        const inc: Incident = {
          id: `INC-${Math.floor(Math.random() * 9000 + 1000)}`,
          store,
          opened: state.t,
          state: "open",
          sku: `mk-${store}-${Math.floor(Math.random() * 9000)}`,
          gap,
        };
        const log1 = pushLog(state, "warn", `pos.ack[${store}]: reported $5.99 canonical $5.49`);
        const log2 = pushLog({ ...state, log: log1 }, "err", `reconcile.drift: ${inc.id} +$${gap.toFixed(2)} · sla=120s`);
        return {
          ...state,
          incidents: [...state.incidents, inc],
          highlightStore: store,
          mode: "drift",
          sloRemaining: Math.max(0.95, state.sloRemaining - 0.002),
          log: log2,
        };
      }
      if (action.kind === "spike") {
        return {
          ...state,
          mode: "burst",
          log: pushLog(state, "info", "traffic.spike · 3.2× baseline · 15-min window"),
        };
      }
      if (action.kind === "throttle") {
        return {
          ...state,
          mode: "throttled",
          log: pushLog(state, "warn", "esl.throttle · vendor backpressure detected"),
        };
      }
      if (action.kind === "replay") {
        const inc = state.incidents.find((i) => i.state === "open");
        if (inc) {
          return {
            ...state,
            log: pushLog(state, "info", `manual.replay[${inc.store}] · regression spawned`),
            incidents: state.incidents.map((i) => (i.id === inc.id ? { ...i, state: "twin", opened: state.t - 1.5 } : i)),
          };
        }
        return { ...state, log: pushLog(state, "info", "manual.replay · no open incident") };
      }
      return state;
    }
    case "select":
      return { ...state, inspector: { kind: action.kind, id: action.id } };
    case "resolveIncident":
      return {
        ...state,
        incidents: state.incidents.map((i) => (i.id === action.id ? { ...i, state: "sealed" } : i)),
        log: pushLog(state, "ok", `manual.seal[${action.id}]`),
      };
    case "log":
      return { ...state, log: pushLog(state, action.tone, action.line) };
  }
}

/* ─────────────────────────────── helpers ──────────────────────────────────── */

function polar(angleDeg: number, radius: number) {
  const a = (angleDeg - 90) * (Math.PI / 180);
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
}

function fmtDollars(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/* ─────────────────────────────── COMMAND TOOLBAR ──────────────────────────── */

function CommandToolbar({
  state,
  dispatch,
}: {
  state: SimState;
  dispatch: React.Dispatch<Action>;
}) {
  return (
    <div className="sticky top-[72px] z-40 border-y border-white/8 bg-[#06090f]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <button
          onClick={() => dispatch({ type: "togglePlay" })}
          className="flex items-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-200 hover:bg-orange-500/20"
        >
          {state.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {state.playing ? "Hold" : "Resume"}
        </button>
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[.04] p-1">
          {(["drift", "spike", "throttle", "replay", "reset"] as const).map((k) => {
            const meta = {
              drift: { label: "Inject drift", icon: AlertOctagon, tone: "text-rose-300" },
              spike: { label: "Spike traffic", icon: Zap, tone: "text-orange-300" },
              throttle: { label: "Throttle ESL", icon: Gauge, tone: "text-amber-300" },
              replay: { label: "Trigger replay", icon: Repeat, tone: "text-violet-300" },
              reset: { label: "Reset", icon: RotateCcw, tone: "text-white/60" },
            }[k];
            const Icon = meta.icon;
            return (
              <button
                key={k}
                onClick={() => dispatch({ type: "inject", kind: k })}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] hover:bg-white/5 ${meta.tone}`}
              >
                <Icon className="h-3 w-3" /> {meta.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-white/55">
          <span className="rounded-lg border border-white/10 bg-white/[.04] px-2 py-1 font-mono">
            t = {state.t.toFixed(1)}s
          </span>
          <span
            className={`rounded-lg border px-2 py-1 ${
              state.mode === "calm"
                ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/[.06]"
                : state.mode === "drift"
                  ? "border-rose-500/30 text-rose-300 bg-rose-500/[.06]"
                  : state.mode === "throttled"
                    ? "border-amber-500/30 text-amber-300 bg-amber-500/[.06]"
                    : "border-orange-500/30 text-orange-300 bg-orange-500/[.06]"
            }`}
          >
            mode · {state.mode}
          </span>
          <span className="rounded-lg border border-white/10 bg-white/[.04] px-2 py-1 font-mono">
            slo {(state.sloRemaining * 100).toFixed(2)}%
          </span>
          <span className="rounded-lg border border-white/10 bg-white/[.04] px-2 py-1 font-mono">
            {state.throughput} ev/s
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────── SPHERE ───────────────────────────────── */

function Sphere({
  state,
  dispatch,
}: {
  state: SimState;
  dispatch: React.Dispatch<Action>;
}) {
  const reduced = useReducedMotion();
  const [drag, setDrag] = useState({ ry: -22, rx: 12 });
  const dragRef = useRef<{ startX: number; startY: number; ry: number; rx: number } | null>(null);

  // passive auto-rotation when not actively dragging
  const [yaw, setYaw] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      if (!dragRef.current) setYaw((y) => (y + 0.6) % 360);
    }, 80);
    return () => clearInterval(id);
  }, [reduced]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, ry: drag.ry, rx: drag.rx };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setDrag({ ry: d.ry + dx * 0.4, rx: Math.max(-30, Math.min(40, d.rx - dy * 0.3)) });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  const radius = 220;
  const storeRadius = 320;

  // incidents per store
  const incidentByStore = useMemo(() => {
    const m: Record<string, Incident | undefined> = {};
    state.incidents.forEach((i) => {
      if (i.state !== "sealed") m[i.store] = i;
    });
    return m;
  }, [state.incidents]);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative mx-auto h-[640px] max-w-[820px] cursor-grab touch-none select-none active:cursor-grabbing"
      style={{ perspective: 1400 }}
      role="application"
      aria-label="Command sphere · drag to rotate"
    >
      <div
        className="relative h-full w-full"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${drag.rx}deg) rotateY(${drag.ry + yaw}deg)`,
          transition: dragRef.current ? "none" : "transform .15s linear",
        }}
      >
        {/* equator rings */}
        {[0, 60, 120].map((r) => (
          <div
            key={r}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-orange-500/12"
            style={{
              width: storeRadius * 2,
              height: storeRadius * 2,
              transform: `translate(-50%,-50%) rotateX(${r}deg)`,
            }}
          />
        ))}

        {/* SVG layer with connection lines from core to each node and to each store */}
        <svg
          viewBox="-400 -400 800 800"
          className="absolute inset-0 h-full w-full"
          style={{ overflow: "visible" }}
        >
          <defs>
            <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#fb923c" stopOpacity="0.9" />
              <stop offset="1" stopColor="#fb923c" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* core glow */}
          <circle cx="0" cy="0" r="78" fill="url(#coreGlow)" opacity="0.6" />
          {/* node connections */}
          {NODES.filter((n) => n.id !== "core").map((n) => {
            const p = polar(n.angle, radius);
            const inc = state.mode === "drift" && (n.id === "pos" || n.id === "twin");
            const stroke = inc ? "#f43f5e" : n.color;
            return (
              <g key={n.id}>
                <line
                  x1="0"
                  y1="0"
                  x2={p.x}
                  y2={p.y}
                  stroke={stroke}
                  strokeOpacity="0.28"
                  strokeWidth="1.4"
                />
                <line
                  x1="0"
                  y1="0"
                  x2={p.x}
                  y2={p.y}
                  stroke={stroke}
                  strokeWidth="1.4"
                  strokeDasharray="6 8"
                  opacity="0.9"
                >
                  {!reduced && (
                    <animate
                      attributeName="stroke-dashoffset"
                      from="0"
                      to="-28"
                      dur={state.mode === "burst" ? "0.6s" : "1.4s"}
                      repeatCount="indefinite"
                    />
                  )}
                </line>
              </g>
            );
          })}
          {/* store arcs */}
          {STORES.map((s) => {
            const p = polar(s.angle, storeRadius);
            const inc = incidentByStore[s.id];
            const highlighted = state.highlightStore === s.id || state.inspector.id === s.id;
            const color = inc
              ? inc.state === "open"
                ? "#f43f5e"
                : inc.state === "twin"
                  ? "#a78bfa"
                  : inc.state === "live"
                    ? "#fbbf24"
                    : "#22c55e"
              : s.canary
                ? "#fb923c"
                : "#22c55e";
            return (
              <g key={s.id}>
                <line
                  x1="0"
                  y1="0"
                  x2={p.x}
                  y2={p.y}
                  stroke={color}
                  strokeOpacity={highlighted ? 0.55 : 0.12}
                  strokeWidth="0.8"
                />
              </g>
            );
          })}
        </svg>

        {/* center core (CSS) */}
        <div
          className="absolute left-1/2 top-1/2 flex h-[110px] w-[110px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(251,146,60,.55), rgba(249,115,22,.18) 65%, transparent 75%)",
            transformStyle: "preserve-3d",
          }}
        >
          <div className="rounded-full border border-orange-500/40 bg-[#0a0f1a]/85 px-3 py-2 text-center backdrop-blur-md">
            <p className="text-[9px] uppercase tracking-[.22em] text-orange-300">CORE</p>
            <p className="mt-1 font-mono text-sm text-white">{state.throughput}</p>
            <p className="text-[9px] text-white/45">ev/s</p>
          </div>
          {!reduced && (
            <motion.span
              className="absolute inset-0 rounded-full border border-orange-400/60"
              animate={{ scale: [1, 1.6], opacity: [0.55, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </div>

        {/* satellite nodes */}
        {NODES.filter((n) => n.id !== "core").map((n) => {
          const p = polar(n.angle, radius);
          const Icon = n.icon;
          const load = state.loads[n.id] ?? 0.3;
          const isHover = state.inspector.kind === "node" && state.inspector.id === n.id;
          return (
            <button
              key={n.id}
              onClick={() => dispatch({ type: "select", kind: "node", id: n.id })}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 group focus:outline-none"
              style={{ transform: `translate(${p.x - 0}px, ${p.y - 0}px) translate(-50%,-50%)` }}
            >
              <div
                className={`relative flex w-[120px] flex-col items-center gap-1 rounded-xl border bg-[#0a0e18]/90 px-3 py-2 text-center shadow-[0_8px_30px_rgba(0,0,0,.35)] backdrop-blur-sm transition ${
                  isHover ? "border-orange-500/50" : "border-white/10 group-hover:border-orange-500/30"
                }`}
              >
                <Icon className="h-4 w-4" style={{ color: n.color }} />
                <span className="text-[11px] font-medium text-white">{n.label}</span>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full"
                    style={{
                      width: `${load * 100}%`,
                      background: load > 0.75 ? "#f43f5e" : load > 0.5 ? "#fb923c" : "#22c55e",
                    }}
                  />
                </div>
                <span className="text-[9px] font-mono text-white/45">{Math.round(load * 100)}%</span>
              </div>
            </button>
          );
        })}

        {/* stores on outer ring */}
        {STORES.map((s) => {
          const p = polar(s.angle, storeRadius);
          const inc = incidentByStore[s.id];
          const isHover = state.inspector.kind === "store" && state.inspector.id === s.id;
          const color = inc
            ? inc.state === "open"
              ? "#f43f5e"
              : inc.state === "twin"
                ? "#a78bfa"
                : inc.state === "live"
                  ? "#fbbf24"
                  : "#22c55e"
            : s.canary
              ? "#fb923c"
              : "#22c55e";
          return (
            <button
              key={s.id}
              onClick={() => dispatch({ type: "select", kind: "store", id: s.id })}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 focus:outline-none"
              style={{ transform: `translate(${p.x}px, ${p.y}px) translate(-50%,-50%)` }}
              aria-label={s.label}
            >
              <span
                className={`block rounded-full transition ${isHover ? "ring-2 ring-orange-400" : ""}`}
                style={{
                  width: 18,
                  height: 18,
                  background: color,
                  boxShadow: `0 0 16px ${color}`,
                }}
              />
              {inc && inc.state === "open" && !reduced && (
                <motion.span
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                  style={{ borderColor: color }}
                  initial={{ width: 18, height: 18, opacity: 0.8 }}
                  animate={{ width: 64, height: 64, opacity: 0 }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <span className="mt-1 block whitespace-nowrap text-[9px] text-white/55">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* hint overlay */}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[10px] text-white/55 backdrop-blur-md">
        <Move3d className="mr-1 inline h-3 w-3 text-orange-300" />
        drag to rotate · click a node or store to inspect
      </div>
    </div>
  );
}

/* ─────────────────────────────── INSPECTOR DRAWER ─────────────────────────── */

function Inspector({
  state,
  dispatch,
}: {
  state: SimState;
  dispatch: React.Dispatch<Action>;
}) {
  const { kind, id } = state.inspector;
  const close = () => dispatch({ type: "select", kind: null, id: null });

  let body: React.ReactNode = null;
  let title = "Inspector";
  let kicker = "select a node or store";

  if (kind === "node" && id) {
    const node = NODES.find((n) => n.id === id);
    if (node) {
      const load = state.loads[id] ?? 0.3;
      title = node.label;
      kicker = `connector · load ${Math.round(load * 100)}%`;
      body = (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <KV label="certification" value="verified ✓" />
            <KV label="version" value="v3.4" />
            <KV label="p50" value={`${Math.round(40 + load * 80)}ms`} />
            <KV label="p99" value={`${Math.round(140 + load * 220)}ms`} />
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[.025] p-3">
            <p className="text-[10px] uppercase tracking-[.2em] text-white/45">recent acks</p>
            <ul className="mt-2 space-y-1 font-mono text-[11px] text-white/65">
              <li><span className="text-white/35">{state.t.toFixed(1)}s</span> ack ok · sku=mk-dl-02-7741</li>
              <li><span className="text-white/35">{(state.t - 0.4).toFixed(1)}s</span> ack ok · sku=mk-au-01-9012</li>
              <li><span className="text-white/35">{(state.t - 0.8).toFixed(1)}s</span> ack ok · sku=mk-dl-04-1188</li>
            </ul>
          </div>
        </div>
      );
    }
  } else if (kind === "store" && id) {
    const store = STORES.find((s) => s.id === id);
    if (store) {
      const inc = state.incidents.find((i) => i.store === id && i.state !== "sealed");
      title = store.label;
      kicker = `zone ${store.zone} · ${store.canary ? "canary corridor" : "downstream"}`;
      body = (
        <div className="space-y-4">
          {inc ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/[.06] p-3">
              <p className="text-[10px] uppercase tracking-[.2em] text-rose-300">incident {inc.id}</p>
              <p className="mt-1 text-sm text-white">stale_price · {inc.sku}</p>
              <p className="mt-1 text-[11px] text-white/55">
                gap +${inc.gap.toFixed(2)} · state <span className="text-orange-300">{inc.state}</span>
              </p>
              <button
                onClick={() => dispatch({ type: "resolveIncident", id: inc.id })}
                className="mt-3 w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
              >
                Force-seal
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[.06] p-3">
              <p className="text-[10px] uppercase tracking-[.2em] text-emerald-300">verified</p>
              <p className="mt-1 text-sm text-white">all channels aligned</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <KV label="canonical" value="$5.49" />
            <KV label="last ack" value={`${Math.round(60 + Math.random() * 60)} ms`} />
            <KV label="trace_id" value={id.replace("-", "") + "af"} mono />
            <KV label="connector" value="esl-v3.4" />
          </div>
          <Link
            href="/operations/batches/memorial-day-dallas-02"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-200 hover:bg-orange-500/20"
          >
            Open working batch <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      );
    }
  }

  return (
    <AnimatePresence>
      {kind && id && (
        <motion.aside
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
          className="fixed inset-y-0 right-0 z-50 w-full max-w-[380px] border-l border-white/10 bg-[#06090f]/95 p-5 shadow-[0_30px_120px_rgba(0,0,0,.7)] backdrop-blur-2xl"
        >
          <div className="flex items-center justify-between">
            <Pill tone={kind === "store" ? "orange" : "purple"}>{kicker}</Pill>
            <button
              onClick={close}
              className="rounded-md border border-white/10 bg-white/[.04] px-2 py-1 text-[11px] text-white/65 hover:text-white"
            >
              close
            </button>
          </div>
          <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">{title}</h3>
          <div className="mt-5">{body}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[.025] p-2">
      <div className="text-[9px] uppercase tracking-[.2em] text-white/45">{label}</div>
      <div className={`mt-0.5 text-sm text-white ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

/* ─────────────────────────────── HUD STATS + STREAM ───────────────────────── */

function HudCorner({ state }: { state: SimState }) {
  const openCount = state.incidents.filter((i) => i.state !== "sealed").length;
  return (
    <div className="absolute right-4 top-4 z-30 flex w-[220px] flex-col gap-2">
      <Stat icon={Activity} label="throughput" value={`${state.throughput} ev/s`} tone="orange" />
      <Stat icon={ShieldCheck} label="reliability budget" value={`${(state.sloRemaining * 100).toFixed(2)}%`} tone={state.sloRemaining > 0.99 ? "green" : "amber"} />
      <Stat icon={AlertOctagon} label="open incidents" value={String(openCount)} tone={openCount ? "red" : "green"} />
      <Stat icon={Thermometer} label="drift cost" value={fmtDollars(state.driftDollars)} tone={state.driftDollars ? "red" : "neutral"} />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ElementType;
  label: string;
  value: string;
  tone: "orange" | "green" | "red" | "amber" | "neutral";
}) {
  const ring =
    tone === "orange"
      ? "border-orange-500/30"
      : tone === "green"
        ? "border-emerald-500/30"
        : tone === "red"
          ? "border-rose-500/30"
          : tone === "amber"
            ? "border-amber-500/30"
            : "border-white/10";
  return (
    <div className={`rounded-xl border ${ring} bg-[#06090f]/85 p-2.5 backdrop-blur-xl`}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[.2em] text-white/45">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3 w-3" /> {label}
        </span>
      </div>
      <div className="mt-1 font-mono text-base tabular-nums text-white">{value}</div>
    </div>
  );
}

function LiveStream({ state }: { state: SimState }) {
  const palette = {
    ok: "text-emerald-300",
    warn: "text-orange-300",
    err: "text-rose-300",
    info: "text-sky-300",
  };
  return (
    <div className="absolute bottom-4 left-4 z-30 w-[360px] rounded-2xl border border-white/10 bg-black/65 p-3 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-white/65">
          <Terminal className="h-3 w-3 text-emerald-300" /> sim.trace
        </div>
        <span className="flex items-center gap-1 text-[10px] text-emerald-300">
          <CircleDot className="h-2 w-2 animate-pulse" /> live
        </span>
      </div>
      <div className="mt-2 h-[160px] overflow-hidden rounded-lg border border-white/[.04] bg-[#040608] p-2 font-mono text-[11px] leading-[1.55]">
        <AnimatePresence initial={false}>
          {state.log.slice(-8).map((l) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="whitespace-pre-wrap"
            >
              <span className="text-white/30">[{l.t.toFixed(1)}]</span>{" "}
              <span className={palette[l.tone]}>{l.line}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─────────────────────────────── TIMELINE TAPE ────────────────────────────── */

function Timeline({ state }: { state: SimState }) {
  const reduced = useReducedMotion();
  // 120s window
  const windowSec = 120;
  const pct = ((state.t % windowSec) / windowSec) * 100;
  const incidents = state.incidents.slice(-12);
  return (
    <section className="relative mt-16 mx-auto max-w-[1500px] px-4 sm:px-6">
      <div className="flex items-end justify-between">
        <div>
          <Pill tone="orange">Mission timeline</Pill>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Every injected event lands on the tape — scrub or replay.
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            120-second rolling window. Markers below pin to incidents. Each marker is clickable; the
            inspector follows.
          </p>
        </div>
        <Pill tone="purple">{state.incidents.length} events</Pill>
      </div>
      <div className="mt-6 rounded-3xl border border-white/10 bg-[#06090f] p-5">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[.2em] text-white/45">
          <span>0s</span>
          <span>{windowSec}s</span>
        </div>
        <div className="relative mt-2 h-[120px] overflow-hidden rounded-2xl border border-white/[.06] bg-black/40">
          {/* graph baseline */}
          <div className="absolute inset-x-3 top-1/2 h-px bg-white/10" />
          {/* throughput proxy waveform */}
          {!reduced && (
            <motion.svg
              viewBox="0 0 1000 120"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              <path
                d="M0 60 L40 50 L80 70 L120 40 L180 78 L240 36 L300 70 L360 28 L440 88 L520 40 L580 72 L660 34 L740 86 L820 38 L900 70 L1000 50"
                stroke="#fb923c"
                strokeOpacity="0.45"
                fill="none"
                strokeWidth="1.4"
              />
            </motion.svg>
          )}
          {/* incident pins */}
          {incidents.map((inc) => {
            const x = ((inc.opened % windowSec) / windowSec) * 100;
            const color =
              inc.state === "open"
                ? "#f43f5e"
                : inc.state === "twin"
                  ? "#a78bfa"
                  : inc.state === "live"
                    ? "#fbbf24"
                    : "#22c55e";
            return (
              <div
                key={inc.id}
                className="absolute top-2 bottom-2 w-[2px] cursor-pointer rounded"
                style={{ left: `${x}%`, background: color, boxShadow: `0 0 8px ${color}` }}
                title={`${inc.id} · ${inc.store} · ${inc.state}`}
              />
            );
          })}
          {/* playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-orange-500"
            style={{ left: `${pct}%`, boxShadow: "0 0 12px #f97316" }}
          />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {incidents.length === 0 ? (
            <span className="col-span-full text-center text-[11px] text-white/40">
              No incidents yet. Click <span className="text-rose-300">Inject drift</span> in the toolbar.
            </span>
          ) : (
            incidents.map((inc) => (
              <span
                key={inc.id}
                className="truncate rounded-md border border-white/10 bg-white/[.025] px-2 py-1 font-mono text-[10px] text-white/55"
              >
                {inc.id} · {inc.store} · {inc.state}
              </span>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── CONNECTOR TWIN DIFF ──────────────────────── */

function ConnectorTwinDiff({ state }: { state: SimState }) {
  const reduced = useReducedMotion();
  const liveLatency = Math.round(82 + (state.loads.pos ?? 0.4) * 240);
  const twinLatency = Math.round(58 + (state.loads.pos ?? 0.4) * 60);
  const liveDriftRate = state.mode === "drift" ? 0.12 : 0.0;
  const twinDriftRate = 0.0;
  return (
    <section className="relative mt-12 mx-auto max-w-[1500px] px-4 sm:px-6">
      <div className="flex items-end justify-between">
        <div>
          <Pill tone="purple">Regression replay</Pill>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Synthetic double, running the same contract — no shelf risk.
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            The regression run mirrors live traffic, runs the candidate adapter version, and gates promotion on
            certification-checks-green + reliability-budget-healthy. When the live adapter drifts, the regression run replays
            and validates the fix before the live retry.
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <DiffCard
          title="LIVE · v3.4"
          tone="orange"
          latency={liveLatency}
          drift={liveDriftRate}
          ack={state.mode === "drift" ? 0.91 : 0.997}
        />
        <DiffCard
          title="REGRESSION · vNext"
          tone="green"
          latency={twinLatency}
          drift={twinDriftRate}
          ack={0.999}
        />
      </div>
    </section>
  );
}

function DiffCard({
  title,
  tone,
  latency,
  drift,
  ack,
}: {
  title: string;
  tone: "orange" | "green";
  latency: number;
  drift: number;
  ack: number;
}) {
  const ring = tone === "orange" ? "border-orange-500/30" : "border-emerald-500/30";
  return (
    <div className={`rounded-3xl border ${ring} bg-[#0a0e18]/85 p-5`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[.2em] text-white/65">{title}</span>
        <span className="text-[10px] text-white/40">live snapshot</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric label="p50 latency" value={`${latency}ms`} highlight={tone === "orange" && latency > 200} />
        <Metric label="ack rate" value={`${(ack * 100).toFixed(1)}%`} highlight={ack < 0.98} />
        <Metric label="drift" value={`${(drift * 100).toFixed(2)}%`} highlight={drift > 0} />
      </div>
      <div className="mt-4 h-[120px] rounded-2xl border border-white/[.06] bg-black/45 p-3">
        <DiffSpark high={tone === "orange"} drift={drift > 0} />
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight ? "border-rose-500/35 bg-rose-500/[.06]" : "border-white/8 bg-white/[.025]"
      }`}
    >
      <p className="text-[10px] uppercase tracking-[.2em] text-white/45">{label}</p>
      <p className={`mt-1 font-mono text-base tabular-nums ${highlight ? "text-rose-300" : "text-white"}`}>{value}</p>
    </div>
  );
}

function DiffSpark({ high, drift }: { high: boolean; drift: boolean }) {
  const baseY = 50;
  // generate path with optional spike for drift
  let d = "M 0 50";
  for (let x = 0; x <= 400; x += 8) {
    const noise = Math.sin(x / 14) * (high ? 14 : 6) + Math.sin(x / 7) * (high ? 6 : 3);
    const spike = drift && x > 220 && x < 260 ? -28 : 0;
    d += ` L ${x} ${(baseY + noise + spike).toFixed(2)}`;
  }
  return (
    <svg viewBox="0 0 400 100" className="h-full w-full">
      <path d={d} fill="none" stroke={drift ? "#f43f5e" : high ? "#fb923c" : "#22c55e"} strokeWidth="1.4" />
      <line x1="0" y1="50" x2="400" y2="50" stroke="rgba(255,255,255,.08)" />
    </svg>
  );
}

/* ─────────────────────────────── DAY HEATMAP ──────────────────────────────── */

function DayHeatmap({ dispatch }: { dispatch: React.Dispatch<Action> }) {
  // 24 columns × 6 rows, deterministic seed
  const cells = useMemo(() => {
    const arr: { h: number; r: number; v: number }[] = [];
    for (let h = 0; h < 24; h++) {
      for (let r = 0; r < 6; r++) {
        const peak =
          h === 12
            ? 0.95
            : h === 17
              ? 0.86
              : h === 11 || h === 18
                ? 0.72
                : h >= 7 && h <= 21
                  ? 0.45
                  : 0.18;
        const v = Math.max(0, Math.min(1, peak + (Math.sin(h * 0.7 + r * 1.1) * 0.18)));
        arr.push({ h, r, v });
      }
    }
    return arr;
  }, []);
  return (
    <section className="relative mt-12 mx-auto max-w-[1500px] px-4 sm:px-6">
      <div className="flex items-end justify-between">
        <div>
          <Pill tone="red">Shopper-hour risk</Pill>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Where the cost of a single mis-priced minute is highest.
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Volume × price gap × foot-traffic forecast, per 15-minute window. Operators sequence
            canary rollouts to avoid the dark squares.
          </p>
        </div>
        <button
          onClick={() => dispatch({ type: "inject", kind: "drift" })}
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
        >
          Inject drift at peak hour
        </button>
      </div>
      <div className="mt-6 rounded-3xl border border-white/10 bg-[#0a0e18]/85 p-5">
        <div className="grid grid-cols-24 gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          {cells.map((c, i) => {
            const color =
              c.v > 0.85
                ? "rgba(244,63,94,.85)"
                : c.v > 0.65
                  ? "rgba(251,146,60,.85)"
                  : c.v > 0.4
                    ? "rgba(251,191,36,.55)"
                    : c.v > 0.2
                      ? "rgba(34,197,94,.35)"
                      : "rgba(255,255,255,.08)";
            return (
              <span
                key={i}
                title={`${String(c.h).padStart(2, "0")}:${String(c.r * 10).padStart(2, "0")} · risk=${c.v.toFixed(2)}`}
                className="block h-4 rounded-sm transition hover:scale-110"
                style={{ background: color }}
              />
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[.2em] text-white/45">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── CTAs ─────────────────────────────────────── */

function CtaRail() {
  return (
    <section className="relative mt-14 mx-auto max-w-[1500px] px-4 sm:px-6 pb-24">
      <div className="overflow-hidden rounded-3xl border border-orange-500/25 bg-gradient-to-br from-orange-500/[.07] via-transparent to-violet-500/[.07] p-6">
        <div className="grid items-center gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <Pill tone="orange">Click anything · open the real surface</Pill>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              You just flew the simulator. The engine underneath is real.
            </h3>
            <p className="mt-2 max-w-xl text-sm text-white/55">
              The orbital console renders state from a reducer that mirrors what the working
              ShelfTrace backend already enforces: outbox dispatch, idempotency, regression verdicts,
              audit causality, attribution gates. Every CTA below jumps to that surface.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                ["/operations", "Live Operations"],
                ["/scenarios", "Scenario Builder"],
                ["/certification", "Certification Lab"],
                ["/engineering", "Engineering Trace"],
                ["/operations/incidents", "Incidents"],
                ["/vision/mission-control", "Mission Control"],
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
              &ldquo;If it isn&apos;t simulatable, it isn&apos;t operable. Every reliability primitive
              should be something an operator can poke and see respond.&rdquo;
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

/* ─────────────────────────── SIGNATURE · ORBITING CHANNELS ─────────────────
   Hero showpiece. A ShelfTrace core (the approved price) sits center; three
   channel nodes — POS, ESL, Ecommerce — orbit on iridescent rings. The orbit
   container rotates; each node's label counter-rotates so text stays upright
   (transform only). Periodically the core emits a price pulse — a ring scaling
   outward + fading — and as the wave reaches each node it flashes
   verified-emerald, the on-thesis moment: one approved price landing on every
   channel. Reduced-motion: nodes parked static, one static pulse ring, no spin.
   ──────────────────────────────────────────────────────────────────────────── */

const ORBIT_CHANNELS = [
  { id: "pos", label: "POS", sub: "register", icon: ScanLine, angle: -90, ring: 0 },
  { id: "esl", label: "ESL", sub: "shelf label", icon: Tag, angle: 30, ring: 1 },
  { id: "web", label: "Ecommerce", sub: "web · app", icon: Globe2, angle: 150, ring: 2 },
] as const;

// Three concentric orbit radii (px, at the stage's base scale).
const ORBIT_RADII = [104, 150, 196] as const;
// Seconds for one full revolution of the orbit container.
const ORBIT_PERIOD = 26;

function OrbitingChannels() {
  const reduced = useReducedMotion();

  // Master orbit angle (degrees). One continuous rotation; nodes counter-rotate.
  const [spin, setSpin] = useState(0);
  // Pulse cadence: each tick emits a new ring + arms the verified flash wave.
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setSpin((s) => (s + (dt * 360) / ORBIT_PERIOD) % 360);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setPulseKey((k) => k + 1), 3600);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[440px]">
      {/* soft field glow behind the system */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-70"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(168,139,250,.16), rgba(34,211,238,.08) 42%, transparent 68%)",
        }}
      />

      {/* the perspective stage */}
      <div className="absolute inset-0" style={{ perspective: 1100 }}>
        {/* tilted plane: rings + nodes share one transform context */}
        <div
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d", transform: "rotateX(58deg)" }}
        >
          {/* three iridescent orbit rings (the outermost gets the hero conic ring) */}
          {ORBIT_RADII.map((r, i) => (
            <div
              key={r}
              className={`absolute left-1/2 top-1/2 rounded-full ${
                i === ORBIT_RADII.length - 1 ? "iris-ring" : "iris-border"
              }`}
              style={{
                width: r * 2,
                height: r * 2,
                transform: "translate(-50%, -50%)",
                opacity: 0.45 + i * 0.12,
              }}
            />
          ))}

          {/* static pulse ring for reduced-motion — one calm verified halo */}
          {reduced && (
            <div
              className="absolute left-1/2 top-1/2 rounded-full border border-emerald-400/45"
              style={{
                width: ORBIT_RADII[2] * 2 + 28,
                height: ORBIT_RADII[2] * 2 + 28,
                transform: "translate(-50%, -50%)",
                boxShadow: "0 0 40px rgba(34,197,94,.18)",
              }}
            />
          )}

          {/* animated price pulses — a ring scales outward from the core + fades */}
          {!reduced && (
            <AnimatePresence>
              {[pulseKey, pulseKey - 1].map((k) => (
                <motion.span
                  key={k}
                  className="absolute left-1/2 top-1/2 rounded-full border border-orange-300/70"
                  style={{
                    width: 96,
                    height: 96,
                    marginLeft: -48,
                    marginTop: -48,
                    boxShadow: "0 0 24px rgba(251,146,60,.35)",
                  }}
                  initial={{ scale: 0.34, opacity: 0 }}
                  animate={{ scale: 4.6, opacity: [0, 0.7, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 3.4, ease: EASE.outQuart }}
                />
              ))}
            </AnimatePresence>
          )}

          {/* rotating orbit container — rotate ONLY; nodes counter-rotate */}
          <motion.div
            className="absolute inset-0"
            style={{ rotate: reduced ? 0 : spin, transformStyle: "preserve-3d" }}
          >
            {ORBIT_CHANNELS.map((ch, idx) => {
              const radius = ORBIT_RADII[ch.ring];
              const p = polar(ch.angle, radius);
              const Icon = ch.icon;
              return (
                <div
                  key={ch.id}
                  className="absolute left-1/2 top-1/2"
                  style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
                >
                  {/* counter-rotate the plane tilt + the spin so the chip faces the viewer upright */}
                  <div
                    style={{
                      transform: reduced
                        ? "translate(-50%, -50%)"
                        : `translate(-50%, -50%) rotate(${-spin}deg) rotateX(-58deg)`,
                      transformStyle: "preserve-3d",
                    }}
                  >
                    <OrbitNode
                      label={ch.label}
                      sub={ch.sub}
                      Icon={Icon}
                      pulseKey={pulseKey}
                      delay={0.45 + ch.ring * 0.34}
                      reduced={!!reduced}
                    />
                  </div>
                </div>
              );
            })}
          </motion.div>
        </div>
      </div>

      {/* the core — approved price, dead center, above the tilted plane */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {!reduced && (
          <motion.span
            key={`core-${pulseKey}`}
            aria-hidden
            className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(251,146,60,.55), transparent 70%)" }}
            initial={{ scale: 0.8, opacity: 0.9 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.1, ease: EASE.outQuart }}
          />
        )}
        <div className="glow-iris relative flex h-[108px] w-[108px] flex-col items-center justify-center rounded-full border border-orange-400/40 bg-[#0a0f1a]/85 backdrop-blur-md">
          <span className="text-[8px] uppercase tracking-[.24em] text-orange-300">approved</span>
          <span className="mt-0.5 font-mono text-xl tabular-nums text-white">$5.49</span>
          <span className="mt-0.5 flex items-center gap-1 text-[8px] uppercase tracking-[.18em] text-emerald-300">
            <ShieldCheck className="h-2.5 w-2.5" /> canonical
          </span>
        </div>
      </div>

      {/* caption */}
      <p className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] uppercase tracking-[.22em] text-white/40">
        one price · every channel
      </p>
    </div>
  );
}

function OrbitNode({
  label,
  sub,
  Icon,
  pulseKey,
  delay,
  reduced,
}: {
  label: string;
  sub: string;
  Icon: ElementType;
  pulseKey: number;
  delay: number;
  reduced: boolean;
}) {
  // Each pulse arms a brief verified-emerald flash as the wave reaches this ring.
  const verified = {
    boxShadow: [
      "0 8px 30px rgba(0,0,0,.35)",
      "0 0 22px rgba(34,197,94,.55)",
      "0 8px 30px rgba(0,0,0,.35)",
    ],
    borderColor: [
      "rgba(255,255,255,.12)",
      "rgba(52,211,153,.7)",
      "rgba(255,255,255,.12)",
    ],
    scale: [1, 1.06, 1],
  };

  return (
    <motion.div
      className="flex w-[112px] flex-col items-center gap-1 rounded-2xl border border-white/12 bg-[#0a0e18]/90 px-3 py-2.5 text-center backdrop-blur-sm"
      style={{ boxShadow: "0 8px 30px rgba(0,0,0,.35)" }}
      animate={reduced ? undefined : verified}
      transition={
        reduced
          ? undefined
          : { duration: 1.05, ease: EASE.outQuart, delay, repeat: 0 }
      }
      // re-keying on pulseKey restarts the flash each cadence
      key={`${label}-${pulseKey}`}
    >
      <motion.span
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[.04]"
        animate={
          reduced
            ? undefined
            : { color: ["#a78bfa", "#34d399", "#a78bfa"] }
        }
        transition={reduced ? undefined : { duration: 1.05, ease: EASE.outQuart, delay }}
        style={{ color: reduced ? "#34d399" : "#a78bfa" }}
      >
        <Icon className="h-3.5 w-3.5" />
      </motion.span>
      <span className="text-[11px] font-semibold leading-none text-white">{label}</span>
      <span className="text-[8px] uppercase tracking-[.16em] text-white/40">{sub}</span>
      {reduced && (
        <span className="flex items-center gap-0.5 text-[8px] uppercase tracking-[.14em] text-emerald-300">
          <BadgeCheck className="h-2.5 w-2.5" /> verified
        </span>
      )}
    </motion.div>
  );
}

/* ─────────────────────────────────── PAGE ─────────────────────────────────── */

export default function OrbitPage() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const reduced = useReducedMotion();

  // sim clock
  useEffect(() => {
    if (reduced) {
      dispatch({ type: "tick", dt: 0.1 });
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      dispatch({ type: "tick", dt });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // keyboard: D=drift, S=spike, T=throttle, R=replay, X=reset, space=pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target !== document.body) return;
      const map: Record<string, () => void> = {
        d: () => dispatch({ type: "inject", kind: "drift" }),
        s: () => dispatch({ type: "inject", kind: "spike" }),
        t: () => dispatch({ type: "inject", kind: "throttle" }),
        r: () => dispatch({ type: "inject", kind: "replay" }),
        x: () => dispatch({ type: "inject", kind: "reset" }),
      };
      if (e.code === "Space") {
        e.preventDefault();
        dispatch({ type: "togglePlay" });
      } else if (map[e.key.toLowerCase()]) {
        map[e.key.toLowerCase()]();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative">
      <section className="relative overflow-hidden pb-6 pt-10">
        <BackgroundOrbits variant="orange" />
        <div className="relative mx-auto max-w-[1500px] px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="orange">06 · Command Sphere</Pill>
                <Pill tone="purple">Concept vision</Pill>
                <Pill tone="neutral">Interactive simulator — your inputs change the state</Pill>
              </div>
              <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">
                Fly the engine.
                <span className="iris-text">
                  {" "}Inject drift. Watch reliability respond.
                </span>
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/55">
                This is not a video. The orbital console below is a live state machine. Click any inject
                button (or press <kbd className="rounded bg-white/[.06] px-1">D</kbd>{" "}
                <kbd className="rounded bg-white/[.06] px-1">S</kbd>{" "}
                <kbd className="rounded bg-white/[.06] px-1">T</kbd>{" "}
                <kbd className="rounded bg-white/[.06] px-1">R</kbd>{" "}
                <kbd className="rounded bg-white/[.06] px-1">X</kbd>) — the simulation reacts in real time:
                log streams update, dollar counters move, regression spawns, audit seals. Drag the sphere to
                rotate; click any node or store to inspect.
              </p>
            </div>
            <OrbitingChannels />
          </div>
        </div>
      </section>

      <CommandToolbar state={state} dispatch={dispatch} />

      <section className="relative isolate overflow-hidden border-b border-white/[.06]">
        <BackgroundOrbits variant="violet" />
        <div className="relative mx-auto max-w-[1500px] px-4 sm:px-6 py-10">
          <HudCorner state={state} />
          <Sphere state={state} dispatch={dispatch} />
          <LiveStream state={state} />
        </div>
      </section>

      <Timeline state={state} />
      <ConnectorTwinDiff state={state} />
      <DayHeatmap dispatch={dispatch} />
      <CtaRail />
      <Inspector state={state} dispatch={dispatch} />
    </div>
  );
}
