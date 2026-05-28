"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import type { ElementType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
            className="overflow-hidden rounded-[30px] border border-white/10 bg-[#0b0e16]/78"
          >
            <div className="grid min-h-[540px] lg:grid-cols-[.78fr_1.22fr]">
              <div className="p-6 sm:p-8">
                <Pill tone="purple">Vision concept</Pill>
                <Icon className="mt-10 h-9 w-9 text-orange-300" />
                <p className="mt-7 text-[10px] font-semibold tracking-[.25em] text-orange-300">
                  {active.kicker}
                </p>
                <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-.05em] text-white">
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
        <div className="rounded-2xl border border-white/10 bg-[#0c111a]/84 p-5">
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
            className="mt-6 flex w-full items-center justify-between rounded-xl bg-orange-500 px-5 py-4 text-sm font-semibold text-white transition hover:brightness-110"
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
