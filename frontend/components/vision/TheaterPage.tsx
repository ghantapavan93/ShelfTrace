"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import type { ElementType } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Database,
  Layers3,
  ScanBarcode,
  ShieldCheck,
  ShoppingCart,
  Store,
  Workflow,
  Zap,
} from "lucide-react";
import { BackgroundOrbits, Pill } from "./Shell";

type TheaterMode = "certification" | "rollout" | "trace";

const architecture: Array<{ name: string; sub: string; icon: ElementType }> = [
  { name: "Approved Price", sub: "Input", icon: ClipboardCheck },
  { name: "FastAPI", sub: "Ingestion", icon: Zap },
  { name: "PostgreSQL", sub: "Outbox", icon: Database },
  { name: "Redis", sub: "Worker", icon: Layers3 },
  { name: "Adapters", sub: "POS / ESL / Web", icon: Workflow },
  { name: "Reconcile", sub: "Deterministic", icon: ShieldCheck },
  { name: "Audit", sub: "Recovery", icon: BadgeCheck },
];

const recovery = [
  "Critical incident opened",
  "POS retry requested",
  "POS acknowledgement received",
  "Reconciliation verified all channels",
  "Incident resolved",
  "Action eligible for expansion",
];

function ConnectorCards({ failure = true }: { failure?: boolean }) {
  const cards: Array<{ name: string; price: string; ok: boolean; icon: ElementType }> = [
    { name: "Shelf Label (ESL)", price: "$5.99", ok: true, icon: Store },
    { name: "Checkout POS", price: failure ? "$6.49" : "$5.99", ok: !failure, icon: ScanBarcode },
    { name: "Ecommerce", price: "$5.99", ok: true, icon: ShoppingCart },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map(({ name, price, ok, icon: Icon }) => (
        <div
          key={name}
          className={`rounded-2xl border p-4 ${
            ok ? "border-emerald-500/20 bg-emerald-500/[.04]" : "border-rose-500/30 bg-rose-500/[.07]"
          }`}
        >
          <div className="flex items-center gap-2 text-[10px] text-white/45">
            <Icon className="h-3.5 w-3.5" />
            {name}
          </div>
          <p className={`mt-5 text-3xl font-semibold ${ok ? "text-emerald-300" : "text-rose-400"}`}>
            {price}
          </p>
          <div
            className={`mt-2 flex items-center gap-1 text-xs ${ok ? "text-emerald-300" : "text-rose-300"}`}
          >
            {ok ? <CheckCircle2 className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
            {ok ? "Verified" : "Mismatch"}
          </div>
        </div>
      ))}
    </div>
  );
}

function CanaryMap({ blocked = true }: { blocked?: boolean }) {
  const reduced = useReducedMotion();
  const stores: Array<{ id: string; canary: boolean; error: boolean }> = [
    { id: "214", canary: true, error: blocked },
    { id: "302", canary: true, error: false },
    { id: "317", canary: false, error: false },
    { id: "401", canary: false, error: false },
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0c111a]/82 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-[.22em] text-orange-300">
          CANARY ROLLOUT · DALLAS ZONE 2
        </p>
        <Pill tone={blocked ? "red" : "green"}>
          {blocked ? "Expansion blocked" : "Ready to expand"}
        </Pill>
      </div>
      <div className="relative mt-8 flex items-center justify-around">
        <div className="absolute left-[12%] right-[12%] top-7 h-[2px] bg-white/10" />
        <div
          className={`absolute left-[12%] top-7 h-[2px] ${
            blocked
              ? "w-[30%] bg-gradient-to-r from-rose-500 to-orange-500"
              : "w-[76%] bg-gradient-to-r from-orange-500 to-emerald-400"
          }`}
        />
        {stores.map(({ id, canary, error }) => (
          <div className="relative z-10 flex flex-col items-center" key={id}>
            <motion.div
              animate={!reduced && error ? { scale: [1, 1.06, 1] } : undefined}
              transition={!reduced && error ? { duration: 1.8, repeat: Infinity } : undefined}
              className={`flex h-12 w-12 items-center justify-center rounded-xl border sm:h-14 sm:w-14 ${
                error
                  ? "border-rose-500/45 bg-rose-500/15 text-rose-300 shadow-[0_0_28px_rgba(244,63,94,.25)]"
                  : canary
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 bg-white/[.03] text-white/42"
              }`}
            >
              <Store className="h-5 w-5 sm:h-6 sm:w-6" />
            </motion.div>
            <p
              className={`mt-2 text-[10px] sm:text-xs ${
                error ? "text-rose-300" : canary ? "text-emerald-300" : "text-white/55"
              }`}
            >
              Store {id}
            </p>
            <p className="text-[7px] tracking-[.18em] text-white/34 sm:text-[8px]">
              {canary ? "CANARY" : "WAITING"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditCard({ complete = false }: { complete?: boolean }) {
  const count = complete ? recovery.length : 2;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c111a]/82 p-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-[.22em] text-orange-300">
          AUDIT-TRUE RECOVERY
        </p>
        <Pill tone="green">40 tests</Pill>
      </div>
      <div className="mt-5 space-y-4">
        {recovery.slice(0, count).map((entry, index) => (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.07 }}
            key={entry}
            className="flex items-center gap-3"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                index === 0 ? "bg-rose-400" : index === 1 ? "bg-orange-400" : "bg-emerald-400"
              }`}
            />
            <span className="flex-1 text-sm text-white/72">{entry}</span>
            <span className="text-[9px] tracking-widest text-white/32">
              {index === 1 ? "OPERATOR" : "AUTOMATED"}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function CodeCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/32 p-4">
      <p className="text-[9px] font-semibold tracking-[.2em] text-white/35">{title}</p>
      <pre className="mt-4 whitespace-pre-wrap text-xs leading-6 text-emerald-300">{text}</pre>
    </div>
  );
}

function TraceView() {
  return (
    <div className="mt-6 grid gap-4">
      <div className="rounded-xl border border-orange-500/22 bg-orange-500/[.04] p-4">
        <div className="flex flex-wrap justify-between gap-2">
          <Pill tone="orange">From configured behavior</Pill>
          <span className="text-xs text-white/40">scenario cfg_ee163a41683b</span>
        </div>
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-5">
          <span className="text-white/45">Store 501</span>
          <span className="text-white/45">POS</span>
          <span className="text-orange-300">stale_price</span>
          <span className="text-rose-300">Observed $6.49</span>
          <span className="text-emerald-300">Retry $5.99</span>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <CodeCard
          title="POS RECEIPT"
          text={`status: MISMATCH\nexpected: 5.99\nobserved: 6.49\nbehavior: stale_price`}
        />
        <CodeCard
          title="RECONCILIATION"
          text={`decision: EXPANSION_BLOCKED\nincident_from_config: true\naudit_causality: enforced`}
        />
      </div>
    </div>
  );
}

function ArchitectureRail({ vertical = false }: { vertical?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c111a]/82 p-5">
      <p className="text-[10px] font-semibold tracking-[.22em] text-orange-300">
        SHARED RELIABILITY ENGINE
      </p>
      <div className={`mt-5 ${vertical ? "space-y-2" : "flex gap-2 overflow-x-auto pb-1"}`}>
        {architecture.map(({ name, sub, icon: Icon }, index) => (
          <Fragment key={name}>
            <div
              className={`rounded-xl border border-white/10 bg-white/[.025] p-3 ${
                vertical ? "flex items-center gap-4" : "min-w-[122px] text-center"
              }`}
            >
              <Icon className={`${vertical ? "" : "mx-auto"} h-5 w-5 text-orange-300`} />
              <div>
                <p className={`${vertical ? "" : "mt-3"} text-xs text-white`}>{name}</p>
                <p className="text-[9px] text-white/38">{sub}</p>
              </div>
            </div>
            {vertical && index < architecture.length - 1 && (
              <div className="ml-5 h-3 w-px bg-orange-500/38" />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export default function TheaterPage() {
  const [mode, setMode] = useState<TheaterMode>("certification");
  const isTrace = mode === "trace";
  const isRollout = mode === "rollout";
  const title =
    mode === "certification"
      ? "Dallas Market Sandbox"
      : isRollout
        ? "Memorial Day · Dallas Zone 2"
        : "Weekend Milk Price Integrity Test";
  const eyebrow =
    mode === "certification"
      ? "CONNECTOR CERTIFICATION LAB"
      : isRollout
        ? "LIVE CONTROL PLANE"
        : "ENGINEERING TRACE";
  const status = isTrace
    ? "Evidence loaded"
    : isRollout
      ? "Expansion blocked"
      : "Failed pending remediation";
  const workingLinkHref = isTrace ? "/engineering" : isRollout ? "/operations" : "/certification";
  const workingLinkLabel = isTrace
    ? "Open Working Engineering Trace"
    : isRollout
      ? "Open Working Live Control Plane"
      : "Open Working Certification Lab";

  return (
    <motion.section
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative mx-auto max-w-[1580px] px-4 pb-12 pt-6 sm:px-6"
    >
      <BackgroundOrbits variant="red" />
      <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Pill tone="orange">02 · Reliability Theater</Pill>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-.06em] text-white sm:text-5xl">
            The working system behind
            <br />
            <span className="text-orange-400">trusted price execution.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/55">
            Certification before launch. Canary protection after approval. The same execution engine
            makes each failure visible, recoverable and auditable.
          </p>
        </div>
        <div className="flex gap-2 rounded-2xl border border-white/10 bg-white/[.03] p-2">
          {(["certification", "rollout", "trace"] as TheaterMode[]).map((item) => (
            <button
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-xl px-4 py-3 text-sm capitalize transition ${
                mode === item ? "bg-orange-500 text-white" : "text-white/48 hover:text-white"
              }`}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-7 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <div className="grid content-start gap-4">
          <div className="rounded-[28px] border border-white/10 bg-[#0b0e16]/78 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold tracking-[.23em] text-orange-300">{eyebrow}</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">{title}</h2>
              </div>
              <Pill tone={isTrace ? "green" : "red"}>{status}</Pill>
            </div>
            {isTrace ? (
              <TraceView />
            ) : (
              <div className="mt-6">
                <ConnectorCards failure />
                <div className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/[.06] p-4 text-sm text-rose-200">
                  {isRollout
                    ? "Expansion remains blocked until checkout verification passes consistently."
                    : "Automated rollout remains disabled until checkout verification passes consistently."}
                </div>
              </div>
            )}
            <Link
              href={workingLinkHref}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/[.04] px-4 py-2 text-xs font-medium text-white/80 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              {workingLinkLabel} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {isRollout && <CanaryMap />}
        </div>
        <div className="grid content-start gap-4">
          <AuditCard complete={isTrace} />
          {isTrace ? <ArchitectureRail vertical /> : <CanaryMap />}
        </div>
      </div>
      <div className="relative mt-5 flex flex-wrap justify-between gap-3">
        <Link
          href="/vision"
          className="flex items-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm text-white/65 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Story
        </Link>
        <Link
          href="/vision/horizon"
          className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Explore Future Systems <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </motion.section>
  );
}
