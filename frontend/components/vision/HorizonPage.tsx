"use client";

import Link from "next/link";
import { Fragment, useCallback, useRef, useState } from "react";
import type { ElementType, PointerEvent as ReactPointerEvent } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { EASE, SPRING } from "@/lib/motion";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Boxes,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Database,
  FlaskConical,
  Layers3,
  MapPinned,
  ShieldCheck,
  Workflow,
  Zap,
} from "lucide-react";
import { BackgroundOrbits, Pill } from "./Shell";
import { LiveBadge, useCyclePhase } from "./cinematic";
import { BlurRevealHeading } from "@/components/narrative/BlurRevealHeading";

type HorizonConcept = "impact" | "replay" | "regression" | "blast";

type Concept = {
  title: string;
  kicker: string;
  thesis: string;
  explanation: string;
  icon: ElementType;
};

const concepts: Record<HorizonConcept, Concept> = {
  impact: {
    title: "Verified Impact Gate",
    kicker: "OUTCOME INTEGRITY",
    thesis:
      "A model should not learn from a price action the store never correctly executed.",
    explanation:
      "Hold revenue and margin attribution until execution is verified across required shopper-facing channels.",
    icon: BarChart3,
  },
  replay: {
    title: "Real Data Replay",
    kicker: "SOURCE LINEAGE",
    thesis:
      "Bring public or anonymized grocery observations into reliability testing with provenance attached.",
    explanation:
      "Turn a sourced product or price record into a replay workload for certification and safe rollout validation.",
    icon: Database,
  },
  regression: {
    title: "Recovery-to-Regression",
    kicker: "OPERATIONAL MEMORY",
    thesis: "Every resolved failure becomes a permanent test case for the next rollout.",
    explanation:
      "Capture incidents as reusable connector scenarios so edge cases become engineering knowledge.",
    icon: Boxes,
  },
  blast: {
    title: "Zone Blast-Radius Studio",
    kicker: "EXPANSION SAFETY",
    thesis: "Preview the stores, SKUs and deadlines protected when a rollout is paused.",
    explanation:
      "Visualize exposure before expanding a price batch from canary stores to the full zone.",
    icon: MapPinned,
  },
};

const architecture: Array<{ name: string; sub: string; icon: ElementType }> = [
  { name: "Approved Price", sub: "Input", icon: ClipboardCheck },
  { name: "FastAPI", sub: "Ingestion", icon: Zap },
  { name: "PostgreSQL", sub: "Outbox", icon: Database },
  { name: "Redis", sub: "Worker", icon: Layers3 },
  { name: "Adapters", sub: "POS / ESL / Web", icon: Workflow },
  { name: "Reconcile", sub: "Deterministic", icon: ShieldCheck },
  { name: "Audit", sub: "Recovery", icon: BadgeCheck },
];

function ArchitectureRail() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c111a]/82 p-5">
      <p className="text-[10px] font-semibold tracking-[.22em] text-orange-300">
        SHARED RELIABILITY ENGINE
      </p>
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {architecture.map(({ name, sub, icon: Icon }) => (
          <Fragment key={name}>
            <div className="min-w-[122px] rounded-xl border border-white/10 bg-white/[.025] p-3 text-center">
              <Icon className="mx-auto h-5 w-5 text-orange-300" />
              <p className="mt-3 text-xs text-white">{name}</p>
              <p className="text-[9px] text-white/38">{sub}</p>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function DataNode({
  label,
  detail,
  icon: Icon,
}: {
  label: string;
  detail: string;
  icon: ElementType;
}) {
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-white/10 bg-white/[.03] p-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-orange-500/26 bg-orange-500/[.08]">
        <Icon className="h-6 w-6 text-orange-300" />
      </div>
      <div>
        <p className="font-semibold text-white">{label}</p>
        <p className="mt-1 text-sm text-white/46">{detail}</p>
      </div>
    </div>
  );
}

function FlowArrow() {
  const reduced = useReducedMotion();
  return (
    <div className="flex justify-center">
      <motion.div
        animate={reduced ? undefined : { y: [-2, 5, -2] }}
        transition={reduced ? undefined : { repeat: Infinity, duration: 1.6 }}
      >
        <ArrowRight className="rotate-90 text-orange-400" />
      </motion.div>
    </div>
  );
}

/* Regression checklist that "applies" each guard in sequence on a loop — reads
   as the engine re-running the captured case, not a static list of ticks. */
function RegressionVisual() {
  const reduced = useReducedMotion();
  const guards = [
    "Block zone expansion",
    "Require POS acknowledgement",
    "Enforce audit causality",
    "Replay before new connector activation",
  ];
  // active index cycles 0..len (len = "all applied" hold), then repeats
  const phase = useCyclePhase(guards.length + 1, 900, true);
  return (
    <div className="border-t border-white/[.06] p-6 lg:border-l lg:border-t-0 sm:p-8">
      <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[.04] p-5">
        <div className="flex items-center justify-between">
          <Pill tone="orange">Regression Case #017</Pill>
          <LiveBadge label="LIVE · REPLAY" />
        </div>
        <h3 className="mt-5 text-xl font-semibold text-white">
          Stale checkout price after shelf confirmation
        </h3>
        <div className="mt-6 space-y-3">
          {guards.map((item, i) => {
            const applied = reduced ? true : i < phase;
            const active = !reduced && i === phase;
            return (
              <div
                key={item}
                className={`flex items-center gap-2 rounded-xl border p-3 text-sm transition-colors duration-300 ${
                  active
                    ? "border-orange-500/40 bg-orange-500/[.08] text-white"
                    : applied
                      ? "border-emerald-500/25 bg-emerald-500/[.05] text-white/72"
                      : "border-white/10 bg-white/[.025] text-white/45"
                }`}
              >
                {active ? (
                  <motion.span
                    className="inline-flex h-4 w-4 items-center justify-center"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <span className="h-3 w-3 rounded-full border-2 border-orange-300 border-t-transparent" />
                  </motion.span>
                ) : (
                  <CheckCircle2
                    className={`h-4 w-4 ${applied ? "text-emerald-400" : "text-white/25"}`}
                  />
                )}
                {item}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ConceptVisual({ concept }: { concept: HorizonConcept }) {
  const reduced = useReducedMotion();
  if (concept === "impact") {
    return (
      <div className="relative flex flex-col justify-center border-t border-white/[.06] bg-[radial-gradient(circle_at_60%_32%,rgba(249,115,22,.12),transparent_42%)] p-6 lg:border-l lg:border-t-0 sm:p-8">
        <div className="relative rounded-2xl border border-white/10 bg-[#0b1018] p-6">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold tracking-[.22em] text-white/38">
              REVENUE IMPACT · LAST 7 DAYS
            </p>
            <LiveBadge label="LIVE" />
          </div>
          <div className="relative mt-6 flex h-44 items-end gap-3 overflow-hidden border-b border-white/10 pb-3">
            {[22, 35, 30, 48, 43, 68, 78, 70].map((height, index) => (
              <motion.div
                key={`${height}-${index}`}
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ delay: reduced ? 0 : index * 0.06 }}
                className="relative flex-1 origin-bottom rounded-t bg-gradient-to-t from-orange-500/20 to-orange-400"
              >
                {/* held bars (last two — unverified) breathe to read as "pending attribution" */}
                {!reduced && index >= 6 && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 origin-bottom rounded-t bg-rose-400/30"
                    animate={{ opacity: [0, 0.6, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: (index - 6) * 0.3 }}
                  />
                )}
              </motion.div>
            ))}
            {/* live scan sweep across the chart */}
            {!reduced && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-orange-300/15 to-transparent"
                animate={{ left: ["-25%", "125%"] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </div>
          <div className="relative mt-5 overflow-hidden rounded-xl border border-rose-500/32 bg-rose-500/[.07] p-4">
            <div className="flex items-center gap-2 text-rose-300">
              <motion.span
                className="inline-flex"
                animate={reduced ? undefined : { opacity: [1, 0.4, 1] }}
                transition={reduced ? undefined : { duration: 1.2, repeat: Infinity }}
              >
                <CircleAlert className="h-4 w-4" />
              </motion.span>
              <span className="text-sm font-semibold">Execution not verified at Store 214</span>
            </div>
            <p className="mt-2 text-xs text-white/48">Do not attribute outcome yet.</p>
          </div>
        </div>
      </div>
    );
  }
  if (concept === "replay") {
    return (
      <div className="flex items-center justify-center border-t border-white/[.06] p-6 lg:border-l lg:border-t-0 sm:p-9">
        <div className="w-full space-y-4">
          <DataNode
            label="USDA / Anonymized Source"
            detail="Product + observed price + provenance"
            icon={Database}
          />
          <FlowArrow />
          <DataNode
            label="Scenario Configuration"
            detail="Connector behaviors + canary scope"
            icon={FlaskConical}
          />
          <FlowArrow />
          <DataNode
            label="Execution Trace"
            detail="Receipt → Incident → Recovery"
            icon={Workflow}
          />
        </div>
      </div>
    );
  }
  if (concept === "regression") {
    return <RegressionVisual />;
  }
  return (
    <div className="relative border-t border-white/[.06] p-6 lg:border-l lg:border-t-0 sm:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_55%_50%,rgba(244,63,94,.15),transparent_32%)]" />
      <div className="relative rounded-2xl border border-white/10 bg-[#090e17]/80 p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold tracking-[.22em] text-orange-300">
            POTENTIAL IMPACT PREVIEW
          </p>
          <LiveBadge label="LIVE · SCAN" tone="rose" />
        </div>
        <div className="mt-7 grid grid-cols-2 gap-3">
          {[
            ["18", "Stores held"],
            ["7", "Markdown SKUs"],
            ["$24.3K", "Potential exposure"],
            ["1", "Issue isolated"],
          ].map(([number, label], i) => (
            <motion.div
              key={label}
              className="rounded-xl border border-white/10 bg-white/[.03] p-4"
              animate={reduced ? undefined : { borderColor: ["rgba(255,255,255,.1)", "rgba(251,146,60,.3)", "rgba(255,255,255,.1)"] }}
              transition={reduced ? undefined : { duration: 2.4, repeat: Infinity, delay: i * 0.5, ease: "easeInOut" }}
            >
              <p className="text-2xl font-semibold text-white">{number}</p>
              <p className="mt-1 text-xs text-white/44">{label}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-7 flex justify-center">
          <motion.div
            animate={reduced ? undefined : { scale: [1, 1.06, 1] }}
            transition={reduced ? undefined : { duration: 2, repeat: Infinity }}
            className="relative flex h-32 w-32 items-center justify-center rounded-full border border-rose-500/32 bg-rose-500/[.06]"
          >
            {/* rotating radar scan line — reads as live blast-radius sweep */}
            {!reduced && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, rgba(251,146,60,.35), transparent 80deg, transparent 360deg)",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
              />
            )}
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-orange-500/34 bg-orange-500/[.12]">
              <CircleAlert className="h-7 w-7 text-orange-300" />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Concept Constellation ──────────────────────────
   Signature moment: the four exploratory concepts as nodes orbiting a central
   "approved price" core — the on-thesis object that has to reliably reach POS,
   shelf-label and ecommerce. Iris threads draw from the core to each node
   (scaleX). The whole field drifts with pointer parallax (SPRING.gentle, small
   magnitude). Focusing a node pulls it forward + wraps it in a rotating iris
   halo and dims the rest. Reduced-motion collapses to a calm static grid.     */

type ConstellationNode = {
  id: HorizonConcept;
  /* corner anchor in %, the static layout slot (never animated) */
  ax: number;
  ay: number;
  /* parallax depth multiplier — far nodes travel a touch more */
  depth: number;
  /* thread angle (deg) from core toward this node, for the draw-in line */
  angle: number;
};

const NODES: ConstellationNode[] = [
  { id: "impact", ax: 15, ay: 20, depth: 1.0, angle: 213 },
  { id: "replay", ax: 85, ay: 18, depth: 0.78, angle: 327 },
  { id: "regression", ax: 13, ay: 80, depth: 0.86, angle: 147 },
  { id: "blast", ax: 87, ay: 82, depth: 1.12, angle: 33 },
];

function ConstellationThread({
  angle,
  delay,
  dim,
  reduced,
}: {
  angle: number;
  delay: number;
  dim: boolean;
  reduced: boolean | null;
}) {
  // line anchored at the core (center), rotated outward, length set by width %.
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 h-px origin-left"
      style={{
        width: "38%",
        rotate: `${angle}deg`,
        background:
          "linear-gradient(90deg, rgba(168,139,250,.55), rgba(34,211,238,.28) 55%, transparent)",
      }}
      initial={reduced ? false : { scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: dim ? 0.18 : 0.7 }}
      transition={
        reduced
          ? { duration: 0 }
          : { scaleX: { duration: 0.9, ease: EASE.outQuart, delay }, opacity: { duration: 0.4 } }
      }
    />
  );
}

function ConstellationNodeCard({
  node,
  focused,
  dimmed,
  reduced,
  parallaxX,
  parallaxY,
  onFocus,
  onBlur,
  onActivate,
}: {
  node: ConstellationNode;
  focused: boolean;
  dimmed: boolean;
  reduced: boolean | null;
  parallaxX: ReturnType<typeof useMotionValue<number>>;
  parallaxY: ReturnType<typeof useMotionValue<number>>;
  onFocus: () => void;
  onBlur: () => void;
  onActivate: () => void;
}) {
  const concept = concepts[node.id];
  const Icon = concept.icon;
  // tie each node's translate to the shared pointer springs, scaled by depth.
  // far corners get a sign so the field feels like it has volume.
  const signX = node.ax < 50 ? 1 : -1;
  const signY = node.ay < 50 ? 1 : -1;
  const x = useTransform(parallaxX, (v) => v * node.depth * signX);
  const y = useTransform(parallaxY, (v) => v * node.depth * signY);

  return (
    <motion.div
      className="absolute"
      style={{
        left: `${node.ax}%`,
        top: `${node.ay}%`,
        x: reduced ? 0 : x,
        y: reduced ? 0 : y,
        zIndex: focused ? 30 : 10,
      }}
    >
      <motion.button
        type="button"
        onMouseEnter={onFocus}
        onMouseLeave={onBlur}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onActivate}
        aria-label={`${concept.title} — ${concept.kicker}`}
        className={`holo-card group relative block w-[208px] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-4 text-left outline-none transition-[border-color] ${
          focused ? "iris-ring" : ""
        } focus-visible:border-violet-300/60`}
        animate={
          reduced
            ? undefined
            : { scale: focused ? 1.07 : 1, opacity: dimmed ? 0.42 : 1 }
        }
        transition={reduced ? undefined : SPRING.gentle}
        whileTap={reduced ? undefined : { scale: focused ? 1.02 : 0.97 }}
      >
        <div className="relative z-[2] flex items-center justify-between">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
              focused
                ? "border-violet-300/40 bg-violet-400/[.12]"
                : "border-white/10 bg-white/[.04]"
            }`}
          >
            <Icon
              className={`h-4 w-4 transition-colors ${
                focused ? "text-orange-200" : "text-orange-300/80"
              } group-hover:translate-x-px`}
            />
          </span>
          <Pill tone="purple">Vision</Pill>
        </div>
        <p
          className={`relative z-[2] mt-3 text-sm font-semibold leading-snug ${
            focused ? "iris-text" : "text-white"
          }`}
        >
          {concept.title}
        </p>
        <p className="relative z-[2] mt-1 text-[9px] font-semibold uppercase tracking-[.2em] text-white/40">
          {concept.kicker}
        </p>
      </motion.button>
    </motion.div>
  );
}

function ConceptConstellation({
  active,
  onSelect,
}: {
  active: HorizonConcept;
  onSelect: (id: HorizonConcept) => void;
}) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState<HorizonConcept | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  // raw pointer offset (px from field center), smoothed by a gentle spring so
  // the drift trails the cursor with confidence and never jitters.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, SPRING.gentle as any);
  const sy = useSpring(py, SPRING.gentle as any);

  const handleMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (reduced) return;
      const el = fieldRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // normalize to [-1,1] then scale to a small max travel (px).
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      px.set(nx * 22);
      py.set(ny * 22);
    },
    [px, py, reduced],
  );

  const handleLeave = useCallback(() => {
    px.set(0);
    py.set(0);
    setHovered(null);
  }, [px, py]);

  const focusId = hovered ?? active;

  // ── Reduced-motion: calm static responsive grid, hover = border only ──
  if (reduced) {
    return (
      <div className="relative mt-8">
        <div className="grid gap-3 sm:grid-cols-2">
          {NODES.map((node) => {
            const concept = concepts[node.id];
            const Icon = concept.icon;
            const isActive = active === node.id;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelect(node.id)}
                aria-label={`${concept.title} — ${concept.kicker}`}
                className={`holo-card block rounded-2xl p-5 text-left transition-colors ${
                  isActive ? "border-violet-300/50" : "hover:border-violet-300/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[.04]">
                    <Icon className="h-4 w-4 text-orange-300/80" />
                  </span>
                  <Pill tone="purple">Vision</Pill>
                </div>
                <p className="mt-3 text-sm font-semibold text-white">{concept.title}</p>
                <p className="mt-1 text-[9px] font-semibold uppercase tracking-[.2em] text-white/40">
                  {concept.kicker}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="relative mt-8">
      <div className="mb-4 flex items-center gap-2">
        <Pill tone="sky">Concept constellation</Pill>
        <span className="text-[11px] text-white/40">
          One approved price · four directions it could travel
        </span>
      </div>
      <motion.div
        ref={fieldRef}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE.outQuart }}
        className="relative h-[440px] overflow-hidden rounded-[30px] border border-white/[.07] bg-[radial-gradient(circle_at_50%_50%,rgba(129,140,248,.10),transparent_58%)]"
      >
        {/* iridescent starfield — static dots, no layout animation */}
        <Starfield />

        {/* threads from core to each node (drawn with scaleX) */}
        <div className="pointer-events-none absolute inset-0">
          {NODES.map((node, i) => (
            <ConstellationThread
              key={node.id}
              angle={node.angle}
              delay={0.25 + i * 0.12}
              dim={focusId !== node.id}
              reduced={reduced}
            />
          ))}
        </div>

        {/* central core: the approved price object that must reach every channel */}
        <CoreNode reduced={reduced} parallaxX={sx} parallaxY={sy} />

        {/* the four concept nodes */}
        {NODES.map((node) => (
          <ConstellationNodeCard
            key={node.id}
            node={node}
            focused={focusId === node.id}
            dimmed={focusId !== node.id}
            reduced={reduced}
            parallaxX={sx}
            parallaxY={sy}
            onFocus={() => setHovered(node.id)}
            onBlur={() => setHovered(null)}
            onActivate={() => onSelect(node.id)}
          />
        ))}
      </motion.div>
    </div>
  );
}

function CoreNode({
  reduced,
  parallaxX,
  parallaxY,
}: {
  reduced: boolean | null;
  parallaxX: ReturnType<typeof useMotionValue<number>>;
  parallaxY: ReturnType<typeof useMotionValue<number>>;
}) {
  // core counter-drifts slightly (negative depth) so the field gains parallax depth.
  const x = useTransform(parallaxX, (v) => v * -0.35);
  const y = useTransform(parallaxY, (v) => v * -0.35);
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 z-20"
      style={{ x: reduced ? 0 : x, y: reduced ? 0 : y }}
    >
      <div className="relative -translate-x-1/2 -translate-y-1/2">
        {/* breathing rings radiating outward — the price reaching its channels */}
        {!reduced &&
          [0, 1, 2].map((ring) => (
            <motion.span
              key={ring}
              aria-hidden
              className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-300/25"
              animate={{ scale: [0.6, 1.9], opacity: [0.5, 0] }}
              transition={{
                duration: 3.4,
                repeat: Infinity,
                ease: "easeOut",
                delay: ring * 1.13,
              }}
            />
          ))}
        <div className="iris-ring glow-iris relative flex h-[92px] w-[92px] items-center justify-center rounded-full bg-[#0a0e18]/90">
          <div className="text-center">
            <p className="text-[8px] font-semibold uppercase tracking-[.22em] text-white/45">
              Approved
            </p>
            <p className="iris-text text-[15px] font-semibold leading-tight">Price</p>
          </div>
        </div>
        {/* tiny channel labels orbiting the core, static (reduced-safe) */}
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-semibold uppercase tracking-[.2em] text-cyan-200/70">
          POS
        </span>
        <span className="absolute -left-7 top-1/2 -translate-y-1/2 text-[8px] font-semibold uppercase tracking-[.2em] text-violet-200/70">
          ESL
        </span>
        <span className="absolute -right-9 top-1/2 -translate-y-1/2 text-[8px] font-semibold uppercase tracking-[.2em] text-orange-200/70">
          WEB
        </span>
      </div>
    </motion.div>
  );
}

/* Static iridescent dot field — deterministic positions so SSR/CSR match and
   nothing animates layout. Pure decoration behind the constellation. */
function Starfield() {
  const stars = [
    [8, 14], [22, 64], [34, 28], [46, 88], [58, 18], [69, 52], [78, 36],
    [88, 72], [14, 44], [40, 58], [52, 40], [64, 80], [74, 12], [92, 28],
    [28, 86], [6, 70], [83, 56], [49, 70], [18, 30], [60, 92],
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {stars.map(([sx, sy], i) => (
        <span
          key={i}
          className="absolute h-px w-px rounded-full bg-white"
          style={{
            left: `${sx}%`,
            top: `${sy}%`,
            opacity: i % 3 === 0 ? 0.5 : 0.25,
            boxShadow:
              i % 4 === 0
                ? "0 0 4px 1px rgba(129,140,248,.6)"
                : "0 0 2px 0 rgba(255,255,255,.4)",
          }}
        />
      ))}
    </div>
  );
}

export default function HorizonPage() {
  const [concept, setConcept] = useState<HorizonConcept>("impact");
  const active = concepts[concept];
  const Icon = active.icon;
  return (
    <motion.section
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative mx-auto max-w-[1580px] px-4 pb-12 pt-6 sm:px-6"
    >
      <BackgroundOrbits variant="violet" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="purple">03 · Horizon Studio</Pill>
          <Pill>Exploratory concepts · Not implemented claims</Pill>
        </div>
        <BlurRevealHeading
          text="What this reliability foundation could enable next."
          emphasis={["enable next."]}
          as="h1"
          size="display"
          delay={0.1}
          stagger={0.06}
          className="mt-6 max-w-4xl"
        />
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/56">
          Future ideas built around the same operational boundary: evidence, trust, learning and safe
          expansion.
        </p>
        <ConceptConstellation active={concept} onSelect={setConcept} />
      </div>
      <div className="relative mt-8 grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          {(Object.keys(concepts) as HorizonConcept[]).map((id) => {
            const item = concepts[id];
            const ConceptIcon = item.icon;
            return (
              <motion.button
                type="button"
                whileHover={{ x: 4 }}
                onClick={() => setConcept(id)}
                key={id}
                className={`w-full rounded-2xl border p-5 text-left transition ${
                  concept === id
                    ? "border-orange-500/34 bg-orange-500/[.08]"
                    : "border-white/10 bg-white/[.025]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <ConceptIcon
                    className={`h-5 w-5 ${
                      concept === id ? "text-orange-300" : "text-white/38"
                    }`}
                  />
                  <Pill tone="purple">Vision</Pill>
                </div>
                <p className="mt-4 text-lg font-semibold text-white">{item.title}</p>
                <p className="mt-2 text-xs text-white/46">{item.kicker}</p>
              </motion.button>
            );
          })}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={concept}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="holo-card rounded-[30px]"
          >
            <div className="grid min-h-[540px] lg:grid-cols-[.78fr_1.22fr]">
              <div className="p-6 sm:p-8">
                <Pill tone="purple">Vision concept</Pill>
                <Icon className="mt-10 h-9 w-9 text-orange-300" />
                <p className="mt-7 text-[10px] font-semibold tracking-[.25em] text-orange-300">
                  {active.kicker}
                </p>
                <h2 className="iris-text mt-4 text-4xl font-semibold leading-tight tracking-[-.05em]">
                  {active.title}
                </h2>
                <p className="mt-5 text-lg leading-8 text-white/76">{active.thesis}</p>
                <p className="mt-5 text-sm leading-7 text-white/48">{active.explanation}</p>
              </div>
              <ConceptVisual concept={concept} />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="relative mt-6 grid gap-4 lg:grid-cols-[1fr_390px]">
        <ArchitectureRail />
        <div className="holo-card rounded-2xl p-5">
          <Pill tone="green">Working today</Pill>
          <ul className="mt-5 space-y-3 text-sm text-white/65">
            {[
              { label: "Scenario Builder", href: "/scenarios" },
              { label: "Certification Lab", href: "/certification" },
              { label: "Live Control Plane", href: "/operations" },
              { label: "Incident Recovery", href: "/operations/incidents" },
              { label: "Engineering Trace", href: "/engineering" },
            ].map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2 transition hover:text-white"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/operations"
            className="glow-iris mt-6 flex w-full items-center justify-between rounded-xl bg-orange-500 px-5 py-4 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Open ShelfTrace Platform <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            href="/engineering"
            className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/10 px-5 py-3 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            View Working Engineering Trace <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="relative mt-6 flex flex-wrap justify-between gap-3">
        <Link
          href="/vision/reliability"
          className="flex items-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm text-white/65 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Reliability Theater
        </Link>
        <p className="self-center text-xs text-white/35">
          Independent concept inspired by public grocery pricing workflows · Simulated integrations
        </p>
      </div>
    </motion.section>
  );
}
