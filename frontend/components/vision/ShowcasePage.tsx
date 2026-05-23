"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  ChevronDown,
  CircleDot,
  Database,
  Layers3,
  Network,
  Receipt,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Tag,
  Zap,
} from "lucide-react";
import { Pill } from "./Shell";

/* ────────────────────────────────────────────────────────────────────────────
   /vision/showcase — cinematic marketing twin to the Keynote.
   Same visual richness: full-bleed photography, Ken-Burns hero, pinned
   scrollytelling, feature grid, before/after scrubber, big closing CTA.
   Discipline preserved: NO fake stats, NO unsupported tech terms, NO
   fabricated dollar amounts. Outcomes shown qualitatively as "what becomes
   possible." Reliability principles replace any quote/testimonial wall.
   Real-repo proof claims only:
     • Configurable Scenario Builder · Certification Lab · Live Control Plane
     • PostgreSQL Transactional Outbox · Redis Worker
     • Deterministic Reconciliation · Audit-Verified Recovery
     • 47 PostgreSQL-Backed Tests
   ──────────────────────────────────────────────────────────────────────────── */

/* photo set — long-stable Unsplash IDs, CSS gradient fallback if any 404 */
const PHOTOS = {
  aisle: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=2400&auto=format&fit=crop&q=80",
  cart: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=2000&auto=format&fit=crop&q=80",
  cold: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=2000&auto=format&fit=crop&q=80",
  scan: "https://images.unsplash.com/photo-1601598851547-4302969d0614?w=2000&auto=format&fit=crop&q=80",
  receipt: "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=1600&auto=format&fit=crop&q=80",
  bag: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=1600&auto=format&fit=crop&q=80",
  store: "https://images.unsplash.com/photo-1601612625308-6e16ae8c95ac?w=2000&auto=format&fit=crop&q=80",
  hand: "https://images.unsplash.com/photo-1583168256-418811576931?w=1600&auto=format&fit=crop&q=80",
};

/* ─────────────────────────── film grain (filmic overlay) ─────────────────── */

function FilmGrain() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full opacity-[.04] mix-blend-overlay"
    >
      <filter id="sh-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#sh-grain)" />
    </svg>
  );
}

/* ─────────────────────────── photo with gradient fallback ────────────────── */

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
              "radial-gradient(circle at 30% 40%, rgba(251,146,60,.18), transparent 55%), radial-gradient(circle at 75% 70%, rgba(167,139,250,.16), transparent 55%)",
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────── 1. HERO ─────────────────────────────────── */

function HeroCinematic() {
  const reduced = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [reduced ? 1 : 1.08, reduced ? 1 : 1.22]);
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "10%"]);
  const overlay = useTransform(scrollYProgress, [0, 1], [0.55, 0.85]);

  return (
    <section ref={heroRef} className="relative h-[100vh] min-h-[720px] w-full overflow-hidden">
      <motion.div style={{ scale, y }} className="absolute inset-0">
        <CinePhoto src={PHOTOS.aisle} alt="Grocery aisle, soft morning light" />
      </motion.div>
      <motion.div
        style={{ opacity: overlay }}
        className="absolute inset-0 bg-gradient-to-b from-[#040608]/55 via-[#040608]/40 to-[#040608]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(249,115,22,.18),transparent_50%)]" />

      <div className="relative z-10 mx-auto flex h-full max-w-[1500px] flex-col justify-end px-5 pb-24 sm:px-8 sm:pb-32">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0 }}
          className="flex flex-wrap items-center gap-2"
        >
          <Pill tone="orange">Showcase · cinematic vision</Pill>
          <Pill tone="neutral">Independent execution-reliability prototype</Pill>
        </motion.div>
        <motion.h1
          initial={reduced ? false : { opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="mt-7 max-w-[20ch] text-[clamp(48px,8vw,128px)] font-semibold leading-[0.95] tracking-[-0.03em] text-white"
        >
          The price they ring up{" "}
          <span className="bg-gradient-to-r from-orange-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">
            should be the price you approved.
          </span>
        </motion.h1>
        <motion.p
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.45 }}
          className="mt-7 max-w-2xl text-lg leading-relaxed text-white/70"
        >
          Imagine an execution-reliability layer that watches every approved grocery price as it moves
          through shelf labels, checkout systems and ecommerce — and stops a rollout the moment a
          shopper-facing channel disagrees.
        </motion.p>
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.6 }}
          className="mt-9 flex flex-wrap items-center gap-3"
        >
          <Link
            href="/vision/keynote"
            className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#040608] transition hover:bg-orange-50"
          >
            See the story <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/operations"
            className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[.04] px-6 py-3.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/10"
          >
            Open Working Platform <ArrowUpRight className="h-4 w-4" />
          </Link>
        </motion.div>
        {!reduced && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="absolute bottom-7 left-1/2 -translate-x-1/2 text-white/45"
          >
            <ChevronDown className="h-5 w-5 animate-bounce" />
          </motion.div>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────── 2. Marquee (real terms only) ────────────────── */

function MarqueeStrip() {
  const reduced = useReducedMotion();
  const items = [
    "Configurable Scenarios",
    "Certification Lab",
    "Live Control Plane",
    "PostgreSQL Outbox",
    "Redis Worker",
    "Deterministic Reconciliation",
    "Audit-Verified Recovery",
    "Scenario-Driven Connectors",
    "Canary Containment",
    "PostgreSQL-Backed Tests",
  ];
  const row = [...items, ...items];
  return (
    <section className="relative overflow-hidden border-y border-white/[.06] bg-[#06090f] py-6">
      <motion.div
        className="flex w-max gap-12 whitespace-nowrap text-[14px] uppercase tracking-[.32em] text-white/35"
        animate={reduced ? undefined : { x: ["0%", "-50%"] }}
        transition={reduced ? undefined : { duration: 32, repeat: Infinity, ease: "linear" }}
      >
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400/60" /> {t}
          </span>
        ))}
      </motion.div>
    </section>
  );
}

/* ─────────────────────────── 3. Outcomes (no numbers) ────────────────────── */

const OUTCOMES = [
  {
    head: "Approved prices that survive the trip to the shopper.",
    body: "Close the gap between what your engine approved and what the checkout actually rings.",
  },
  {
    head: "A canary mismatch never becomes a zone-wide issue.",
    body: "Expansion is blocked the moment any shopper-facing channel disagrees with the approved price.",
  },
  {
    head: "Recovery you can trust because every step is preserved.",
    body: "Every retry, acknowledgement and reconciliation stays visible in the audit trail.",
  },
  {
    head: "A reliability surface your pricing engine can lean on.",
    body: "Configurable scenarios let you certify a behavior before it ever touches a live rollout.",
  },
];

function OutcomeBand() {
  return (
    <section className="relative mx-auto max-w-[1500px] px-5 py-28 sm:px-8 sm:py-36">
      <p className="max-w-3xl text-[clamp(28px,4vw,56px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
        What becomes possible when execution itself is observable.
      </p>
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55">
        These are outcomes the working ShelfTrace engine is built to enable — qualitative, because
        honest pre-launch claims belong in plain language, not invented metrics.
      </p>
      <div className="mt-14 grid gap-10 sm:grid-cols-2">
        {OUTCOMES.map((o, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, delay: i * 0.08 }}
            className="border-t border-white/10 pt-6"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/[.08] text-orange-300">
              <span className="font-mono text-sm">{String(i + 1).padStart(2, "0")}</span>
            </span>
            <p className="mt-5 text-[clamp(22px,2.2vw,30px)] font-semibold leading-snug text-white">
              {o.head}
            </p>
            <p className="mt-3 text-base leading-relaxed text-white/55">{o.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── 4. Pinned scrollytelling ────────────────────── */

type Beat = { title: string; body: string; chip?: string };

function PinnedScene({
  photo,
  alt,
  side = "right",
  beats,
  eyebrow,
  kicker,
}: {
  photo: string;
  alt: string;
  side?: "left" | "right";
  beats: Beat[];
  eyebrow: string;
  kicker: string;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] });
  const reduced = useReducedMotion();
  const scale = useTransform(scrollYProgress, [0, 1], [reduced ? 1 : 1.0, reduced ? 1 : 1.18]);
  const overlay = useTransform(scrollYProgress, [0, 1], [0.25, 0.55]);

  return (
    <section
      ref={sectionRef}
      className="relative mx-auto grid max-w-[1500px] gap-10 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:items-start lg:py-32"
    >
      <div className={`relative ${side === "right" ? "lg:order-2" : "lg:order-1"}`}>
        <div className="sticky top-[120px] aspect-[4/5] overflow-hidden rounded-3xl border border-white/10 shadow-[0_30px_120px_-40px_rgba(249,115,22,.35)]">
          <motion.div style={{ scale }} className="absolute inset-0">
            <CinePhoto src={photo} alt={alt} />
          </motion.div>
          <motion.div
            style={{ opacity: overlay }}
            className="absolute inset-0 bg-gradient-to-tr from-[#040608]/85 via-[#040608]/25 to-transparent"
          />
          <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl border border-white/15 bg-black/45 px-4 py-2.5 backdrop-blur-xl">
            <span className="flex items-center gap-2 text-[11px] uppercase tracking-[.22em] text-white/75">
              <CircleDot className="h-2.5 w-2.5 animate-pulse text-emerald-400" /> {eyebrow}
            </span>
            <span className="text-[11px] text-white/45">scene · pinned</span>
          </div>
        </div>
      </div>

      <div className={`relative ${side === "right" ? "lg:order-1" : "lg:order-2"}`}>
        <Pill tone="orange">{eyebrow}</Pill>
        <h2 className="mt-5 text-[clamp(32px,5vw,72px)] font-semibold leading-[1.02] tracking-[-0.02em] text-white">
          {kicker}
        </h2>
        <div className="mt-12 space-y-12">
          {beats.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-150px" }}
              transition={{ duration: 0.65, delay: 0.05 }}
              className="border-l-2 border-orange-500/30 pl-5"
            >
              {b.chip && (
                <span className="text-[10px] tracking-[.22em] uppercase text-orange-300">{b.chip}</span>
              )}
              <p className="mt-1.5 text-2xl font-medium leading-snug text-white">{b.title}</p>
              <p className="mt-2 text-base leading-relaxed text-white/55">{b.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── 5. Feature grid (real capabilities) ─────────── */

function FeatureGrid() {
  const items: { title: string; body: string; photo: keyof typeof PHOTOS; icon: any }[] = [
    {
      title: "Configurable Scenarios",
      body: "Author a connector behavior — success, stale price, timeout, duplicate ack — then certify it before any live rollout sees it.",
      photo: "store",
      icon: Layers3,
    },
    {
      title: "PostgreSQL Outbox",
      body: "Approved prices and their dispatch events commit in one transaction. Workers contend safely without losing or double-sending.",
      photo: "scan",
      icon: Database,
    },
    {
      title: "Deterministic Reconciliation",
      body: "Channel acknowledgements are reconciled against the canonical approved price. Drift surfaces as a real incident, not a delayed report.",
      photo: "receipt",
      icon: Network,
    },
    {
      title: "Audit-Verified Recovery",
      body: "Every retry, acknowledgement and resolution lands in an audit trail with preserved causal ordering — ack before resolve, always.",
      photo: "cold",
      icon: ShieldCheck,
    },
    {
      title: "Canary Containment",
      body: "When a shopper-facing channel disagrees in one store, expansion to the rest of the zone holds until the canary is verified.",
      photo: "bag",
      icon: BadgeCheck,
    },
    {
      title: "Certification Lab",
      body: "Replay any scenario against the same engine that drives live rollouts. The behavior you certified is the behavior that runs.",
      photo: "hand",
      icon: Boxes,
    },
  ];
  return (
    <section className="relative mx-auto max-w-[1500px] px-5 py-24 sm:px-8 sm:py-32">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <Pill tone="purple">Capabilities · all wired in the working repo</Pill>
          <h2 className="mt-5 text-[clamp(34px,5vw,72px)] font-semibold leading-[1.02] tracking-[-0.02em] text-white">
            Six surfaces. One reliability engine.
          </h2>
        </div>
        <Link
          href="/vision/horizon"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.04] px-5 py-2.5 text-sm text-white/75 hover:text-white"
        >
          Explore Vision Concepts <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <motion.article
              key={it.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.65, delay: i * 0.06 }}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18] transition hover:-translate-y-0.5 hover:border-white/25"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <motion.div className="absolute inset-0" whileHover={{ scale: 1.06 }} transition={{ duration: 0.8 }}>
                  <CinePhoto src={PHOTOS[it.photo]} alt={it.title} />
                </motion.div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e18] via-[#0a0e18]/40 to-transparent" />
                <span className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-black/45 text-orange-300 backdrop-blur">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="px-6 pb-6 pt-5">
                <p className="text-xl font-semibold text-white">{it.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{it.body}</p>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-orange-300 opacity-0 transition group-hover:opacity-100">
                  Learn more <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────── 6. Before / After (no $ amounts) ────────────── */

function BeforeAfter() {
  const [pos, setPos] = useState(48);
  const dragging = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const onMove = (clientX: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((clientX - r.left) / r.width) * 100;
    setPos(Math.max(2, Math.min(98, x)));
  };
  return (
    <section className="relative mx-auto max-w-[1500px] px-5 py-24 sm:px-8">
      <div className="max-w-3xl">
        <Pill tone="red">Before / after</Pill>
        <h2 className="mt-5 text-[clamp(34px,5vw,72px)] font-semibold leading-[1.02] tracking-[-0.02em] text-white">
          What changes when execution itself is verified.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55">
          Drag to compare. Same approved price, same store, same shopper — different outcomes when
          canary containment and audit-verified recovery sit between approval and shelf.
        </p>
      </div>
      <div
        ref={wrapRef}
        className="relative mt-14 aspect-[16/8] cursor-ew-resize overflow-hidden rounded-3xl border border-white/10 shadow-[0_30px_120px_-40px_rgba(249,115,22,.35)]"
        onPointerMove={(e) => dragging.current && onMove(e.clientX)}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          onMove(e.clientX);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
        }}
      >
        {/* AFTER (full) */}
        <div className="absolute inset-0">
          <CinePhoto src={PHOTOS.store} alt="Aisle after verified recovery" />
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/65 via-transparent to-transparent" />
          <div className="absolute right-6 top-6 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[.22em] text-emerald-200 backdrop-blur">
            With ShelfTrace
          </div>
          <div className="absolute bottom-6 right-6 max-w-md rounded-2xl border border-emerald-400/30 bg-black/55 p-4 backdrop-blur-xl">
            <p className="text-sm font-medium text-emerald-200">All channels agree. Rollout may continue.</p>
            <p className="mt-1 text-xs text-white/65">
              Shelf, checkout and ecommerce verified after acknowledgement. Audit causality preserved.
              Incident sealed.
            </p>
          </div>
        </div>
        {/* BEFORE (clipped) */}
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <CinePhoto src={PHOTOS.aisle} alt="Aisle with open mismatch" />
          <div className="absolute inset-0 bg-gradient-to-t from-rose-950/70 via-transparent to-transparent" />
          <div className="absolute left-6 top-6 rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-[11px] uppercase tracking-[.22em] text-rose-200 backdrop-blur">
            Without
          </div>
          <div className="absolute bottom-6 left-6 max-w-md rounded-2xl border border-rose-400/30 bg-black/55 p-4 backdrop-blur-xl">
            <p className="text-sm font-medium text-rose-200">Checkout disagreed. Nobody knew until later.</p>
            <p className="mt-1 text-xs text-white/65">
              Shoppers paid a price the engine never approved. Attribution learned a behavior the
              store did not actually execute.
            </p>
          </div>
        </div>
        {/* slider */}
        <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${pos}%` }}>
          <div className="-translate-x-1/2 h-full w-px bg-white/80" />
          <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-white/15 text-white backdrop-blur shadow-2xl">
            <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
              <path d="M2 10 L7 5 L7 15 Z" />
              <path d="M18 10 L13 15 L13 5 Z" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── 7. Reliability principles ───────────────────── */

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
    <section className="relative mx-auto max-w-[1500px] px-5 py-28 sm:px-8 sm:py-36">
      <div className="max-w-3xl">
        <Pill tone="sky">Reliability principles built into ShelfTrace</Pill>
        <h2 className="mt-5 text-[clamp(34px,5vw,72px)] font-semibold leading-[1.02] tracking-[-0.02em] text-white">
          Three commitments. Enforced in the engine.
        </h2>
      </div>
      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {PRINCIPLES.map((p, i) => (
          <motion.figure
            key={i}
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7, delay: i * 0.08 }}
            className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[.04] to-transparent p-8"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
              <span className="font-mono text-sm">{String(i + 1).padStart(2, "0")}</span>
            </span>
            <p className="mt-6 text-[clamp(20px,2vw,26px)] font-semibold leading-snug text-white">
              {p.head}
            </p>
            <p className="mt-3 text-base leading-relaxed text-white/55">{p.body}</p>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── 8. How it works ─────────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Approve",
      body: "Your pricing engine commits an approved price to ShelfTrace's outbox in one PostgreSQL transaction.",
      icon: Sparkles,
    },
    {
      n: "02",
      title: "Dispatch",
      body: "The Redis worker fans the event out to every channel — shelf label, checkout, ecommerce — under safe concurrent locking.",
      icon: Zap,
    },
    {
      n: "03",
      title: "Verify",
      body: "Acknowledgements reconcile against the canonical price. Any disagreement opens an incident; expansion holds until recovery is verified.",
      icon: ShieldCheck,
    },
  ];
  return (
    <section className="relative mx-auto max-w-[1500px] px-5 py-24 sm:px-8 sm:py-32">
      <div className="max-w-3xl">
        <Pill tone="sky">How it works</Pill>
        <h2 className="mt-5 text-[clamp(34px,5vw,72px)] font-semibold leading-[1.02] tracking-[-0.02em] text-white">
          Three steps. One source of truth.
        </h2>
      </div>
      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.65, delay: i * 0.1 }}
              className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18] p-8"
            >
              <div className="flex items-center justify-between">
                <span className="text-[64px] font-semibold leading-none tracking-[-0.04em] text-orange-300/30">{s.n}</span>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[.04] text-orange-300">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-6 text-2xl font-semibold text-white">{s.title}</p>
              <p className="mt-3 text-sm leading-relaxed text-white/55">{s.body}</p>
              {i < 2 && (
                <ArrowRight className="absolute right-6 top-1/2 hidden h-6 w-6 -translate-y-1/2 translate-x-12 text-orange-400/70 lg:block" />
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────── 9. Closing CTA ──────────────────────────────── */

function ClosingCta() {
  return (
    <section className="relative mx-auto max-w-[1500px] px-5 pb-28 pt-12 sm:px-8 sm:pb-32">
      <div className="relative overflow-hidden rounded-[32px] border border-orange-500/25">
        <div className="absolute inset-0">
          <CinePhoto src={PHOTOS.cart} alt="Cart in a calm aisle" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#040608] via-[#040608]/85 to-[#040608]/40" />
        </div>
        <div className="relative grid items-center gap-10 px-8 py-16 sm:px-14 sm:py-24 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <Pill tone="orange">Ready when you are</Pill>
            <h2 className="mt-5 text-[clamp(36px,5vw,88px)] font-semibold leading-[1.02] tracking-[-0.02em] text-white">
              Independent reliability layer.
              <br />
              <span className="bg-gradient-to-r from-orange-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">
                Audit-grade, end to end.
              </span>
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65">
              Every capability shown here lives in the working ShelfTrace repo: the configurable
              scenario engine, the certification lab, the live control plane, the audit-verified
              recovery path, and the PostgreSQL-backed test suite that holds them honest.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/vision/keynote"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#040608] hover:bg-orange-50"
              >
                See the Keynote story <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/operations"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[.04] px-6 py-3.5 text-sm text-white hover:bg-white/10"
              >
                Open Working Platform <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-white/15 bg-black/55 p-6 backdrop-blur-xl">
            <p className="text-[10px] tracking-[.2em] text-orange-300 uppercase">Working surfaces</p>
            <ul className="mt-4 space-y-3">
              {[
                ["/operations", "Live Operations"],
                ["/scenarios", "Scenario Builder"],
                ["/certification", "Certification Lab"],
                ["/engineering", "Engineering Trace"],
                ["/operations/incidents", "Incidents"],
                ["/operations/markdowns", "Markdown SLAs"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-sm text-white/75 hover:border-orange-500/35 hover:text-white"
                  >
                    {label}
                    <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────── PAGE ─────────────────────────────────── */

export default function ShowcasePage() {
  return (
    <div className="relative bg-[#040608]">
      <FilmGrain />
      <HeroCinematic />
      <MarqueeStrip />
      <OutcomeBand />
      <PinnedScene
        eyebrow="Scene · the moment of truth"
        kicker="A shopper lifts the product. The price had better be the price."
        photo={PHOTOS.scan}
        alt="Checkout scan"
        side="right"
        beats={[
          {
            chip: "01 · approve",
            title: "The engine commits the price once.",
            body: "Approved price and dispatch event commit in one PostgreSQL transaction. The outbox is the source of truth.",
          },
          {
            chip: "02 · dispatch",
            title: "Every channel hears it the same way.",
            body: "The Redis worker fans the event out to shelf label, checkout and ecommerce — under safe concurrent locking.",
          },
          {
            chip: "03 · verify",
            title: "Acknowledgements reconcile against canonical.",
            body: "If a shopper-facing channel disagrees, an incident opens before a single shopper rings the wrong price.",
          },
        ]}
      />
      <PinnedScene
        eyebrow="Scene · containment"
        kicker="When one store disagrees, the rest of the zone waits."
        photo={PHOTOS.cold}
        alt="Refrigerated aisle"
        side="left"
        beats={[
          {
            chip: "04 · canary",
            title: "Canary stores carry the risk first.",
            body: "A small set of stores receives the rollout before any wider expansion is allowed.",
          },
          {
            chip: "05 · contain",
            title: "A single mismatch holds the whole zone.",
            body: "Expansion pauses while ShelfTrace works the recovery — no further stores see the disputed price.",
          },
          {
            chip: "06 · seal",
            title: "Audit causality stamps the recovery.",
            body: "Acknowledgement before resolution, every time. The audit trail is the legal record, not a derived view.",
          },
        ]}
      />
      <FeatureGrid />
      <BeforeAfter />
      <ReliabilityPrinciples />
      <HowItWorks />
      <ClosingCta />
    </div>
  );
}
