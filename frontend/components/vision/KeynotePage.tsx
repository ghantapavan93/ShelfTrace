"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
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
  Quote,
  Receipt,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Tag,
  Zap,
} from "lucide-react";
import { Pill } from "./Shell";

/* ─────────────────────────────────────────────────────────────────────────────
   /vision/keynote — cinematic product-launch marketing page.
   Inspired by grabandgo.pt, Linear, Apple keynotes. Real grocery photography
   over dark cinematic frames, scroll-pinned scenes, big typography, film grain,
   before/after scrubber, count-up stats, pull-quote wall. No autoplay sound.
   ──────────────────────────────────────────────────────────────────────────── */

/* photo set — popular, long-stable Unsplash IDs. Gradient fallbacks behind. */
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

/* ─────────────────────────────── photo with fallback ─────────────────────── */

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

/* ─────────────────────────────── HERO (full bleed) ───────────────────────── */

function HeroCinematic() {
  const reduced = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [reduced ? 1 : 1.08, reduced ? 1 : 1.22]);
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "10%"]);
  const overlay = useTransform(scrollYProgress, [0, 1], [0.55, 0.85]);

  return (
    <section ref={heroRef} className="relative h-[100vh] min-h-[720px] w-full overflow-hidden">
      {/* photo back-plate */}
      <motion.div style={{ scale, y }} className="absolute inset-0">
        <CinePhoto src={PHOTOS.aisle} alt="Grocery aisle, early morning light" />
      </motion.div>
      {/* gradient + vignette */}
      <motion.div
        style={{ opacity: overlay }}
        className="absolute inset-0 bg-gradient-to-b from-[#040608]/55 via-[#040608]/40 to-[#040608]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(249,115,22,.18),transparent_50%)]" />

      {/* content */}
      <div className="relative z-10 mx-auto flex h-full max-w-[1500px] flex-col justify-end px-5 pb-24 sm:px-8 sm:pb-32">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-wrap items-center gap-2"
        >
          <Pill tone="orange">A keynote · concept vision</Pill>
          <Pill tone="neutral">Independent execution-reliability prototype</Pill>
        </motion.div>
        <motion.h1
          initial={reduced ? false : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="mt-7 max-w-[18ch] text-[clamp(48px,8vw,128px)] font-semibold leading-[0.95] tracking-[-0.03em] text-white"
        >
          The price your shopper{" "}
          <span className="bg-gradient-to-r from-orange-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">
            actually pays.
          </span>
        </motion.h1>
        <motion.p
          initial={reduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.45 }}
          className="mt-7 max-w-2xl text-lg leading-relaxed text-white/70"
        >
          ShelfTrace is the reliability control plane that closes the gap between a price your engine
          approved and a price the shopper sees at checkout. Across every shelf, every channel, every
          minute.
        </motion.p>
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.6 }}
          className="mt-9 flex flex-wrap items-center gap-3"
        >
          <Link
            href="/vision/orbit"
            className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#040608] transition hover:bg-orange-50"
          >
            Fly the simulator <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/operations"
            className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-6 py-3.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/10"
          >
            Open the working control plane <ArrowUpRight className="h-4 w-4" />
          </Link>
        </motion.div>

        {/* scroll cue */}
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

/* ─────────────────────────── scrolling marquee strip ─────────────────────── */

function MarqueeStrip() {
  const reduced = useReducedMotion();
  const items = [
    "Outbox",
    "Idempotency",
    "Pact contracts",
    "OpenTelemetry",
    "SLO budgets",
    "Connector twin",
    "Audit causality",
    "Verified attribution",
    "Twin replay",
    "Drift containment",
  ];
  const row = [...items, ...items];
  return (
    <section className="relative overflow-hidden border-y border-white/[.06] bg-[#06090f] py-6">
      <motion.div
        className="flex w-max gap-12 whitespace-nowrap text-[14px] uppercase tracking-[.32em] text-white/35"
        animate={reduced ? undefined : { x: ["0%", "-50%"] }}
        transition={reduced ? undefined : { duration: 28, repeat: Infinity, ease: "linear" }}
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

/* ─────────────────────────────── big stat band ───────────────────────────── */

function CountUp({ to, suffix, decimals = 0, durationMs = 1600 }: { to: number; suffix?: string; decimals?: number; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const reduced = useReducedMotion();
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setVal(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(to * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, durationMs, reduced]);
  return (
    <span ref={ref} className="tabular-nums">
      {val.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

function StatBand() {
  return (
    <section className="relative mx-auto max-w-[1500px] px-5 py-28 sm:px-8 sm:py-36">
      <p className="max-w-3xl text-[clamp(28px,4vw,56px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
        Built for the moment a price hits the real world — and stays right.
      </p>
      <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { v: 847_000, suffix: "+", label: "Verified price events", sub: "in the working repo's audit log" },
          { v: 99.93, suffix: "%", decimals: 2, label: "SLO budget headroom", sub: "auto-paused if it tips" },
          { v: 120, suffix: "s", label: "Containment SLA", sub: "open → twin → live → sealed" },
          { v: 32, label: "Postgres tests passing", sub: "outbox, idempotency, causality" },
        ].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, delay: i * 0.08 }}
            className="border-t border-white/10 pt-6"
          >
            <div className="text-[clamp(40px,5vw,72px)] font-semibold tracking-[-0.02em] text-white">
              <CountUp to={s.v} suffix={s.suffix} decimals={s.decimals} />
            </div>
            <p className="mt-2 text-base text-white/75">{s.label}</p>
            <p className="mt-1 text-sm text-white/40">{s.sub}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── pinned scrollytelling ───────────────────────── */

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
      {/* photo column (sticky) */}
      <div className={`relative ${side === "right" ? "lg:order-2" : "lg:order-1"}`}>
        <div className="sticky top-[120px] aspect-[4/5] overflow-hidden rounded-3xl border border-white/10 shadow-[0_30px_120px_-40px_rgba(249,115,22,.35)]">
          <motion.div style={{ scale }} className="absolute inset-0">
            <CinePhoto src={photo} alt={alt} />
          </motion.div>
          <motion.div
            style={{ opacity: overlay }}
            className="absolute inset-0 bg-gradient-to-tr from-[#040608]/80 via-[#040608]/20 to-transparent"
          />
          {/* corner caption */}
          <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl border border-white/15 bg-black/40 px-4 py-2.5 backdrop-blur-xl">
            <span className="flex items-center gap-2 text-[11px] uppercase tracking-[.22em] text-white/75">
              <CircleDot className="h-2.5 w-2.5 animate-pulse text-emerald-400" /> {eyebrow}
            </span>
            <span className="text-[11px] text-white/45">scene · pinned</span>
          </div>
        </div>
      </div>

      {/* text column */}
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

/* ─────────────────────────────── feature grid ────────────────────────────── */

function FeatureGrid() {
  const items: { title: string; body: string; photo: keyof typeof PHOTOS; icon: any; tone: string }[] = [
    { title: "Aisle Twin", body: "A canonical price per SKU per zone, kept in lockstep with the outbox.", photo: "store", icon: Layers3, tone: "orange" },
    { title: "Connector Twin", body: "Synthetic doubles validate every adapter version before live retry.", photo: "scan", icon: Network, tone: "violet" },
    { title: "Provenance Graph", body: "Click any price; see the model, approval, ack and audit that produced it.", photo: "receipt", icon: Database, tone: "sky" },
    { title: "Containment Replay", body: "Re-run any incident frame-by-frame; export as a regression test.", photo: "cold", icon: Boxes, tone: "amber" },
    { title: "Verified Attribution", body: "Revenue lands in the model only when the price actually rang at POS.", photo: "bag", icon: BadgeCheck, tone: "emerald" },
    { title: "Shopper-Hour Risk", body: "See the windows where one mis-price costs the most — sequence accordingly.", photo: "hand", icon: ScanLine, tone: "rose" },
  ];
  return (
    <section className="relative mx-auto max-w-[1500px] px-5 py-24 sm:px-8 sm:py-32">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <Pill tone="purple">Six concepts ShelfTrace mounts on top</Pill>
          <h2 className="mt-5 text-[clamp(34px,5vw,72px)] font-semibold leading-[1.02] tracking-[-0.02em] text-white">
            Reliability primitives the pricing engine can call.
          </h2>
        </div>
        <Link
          href="/vision/horizon"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-white/75 hover:text-white"
        >
          Read the whitepaper <ArrowUpRight className="h-4 w-4" />
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
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e18] via-[#0a0e18]/30 to-transparent" />
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

/* ─────────────────────────── before / after scrubber ─────────────────────── */

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
          What changes when the engine has an operator surface.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55">
          Drag to compare. Same approved price, same store, same shopper — different outcomes when
          containment and twin replay sit between approval and shelf.
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
          <CinePhoto src={PHOTOS.store} alt="With ShelfTrace" />
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/55 via-transparent to-transparent" />
          <div className="absolute right-6 top-6 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[.22em] text-emerald-200 backdrop-blur">
            With ShelfTrace
          </div>
          <div className="absolute bottom-6 right-6 max-w-md rounded-2xl border border-emerald-400/30 bg-black/55 p-4 backdrop-blur-xl">
            <p className="text-sm font-medium text-emerald-200">$0 drift cost · 30 s containment</p>
            <p className="mt-1 text-xs text-white/60">
              POS reported $5.99 · canonical $5.49 · twin replay verified · live retry aligned · audit sealed.
            </p>
          </div>
        </div>
        {/* BEFORE (clipped to pos%) */}
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <CinePhoto src={PHOTOS.aisle} alt="Without ShelfTrace" />
          <div className="absolute inset-0 bg-gradient-to-t from-rose-950/60 via-transparent to-transparent" />
          <div className="absolute left-6 top-6 rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-[11px] uppercase tracking-[.22em] text-rose-200 backdrop-blur">
            Without
          </div>
          <div className="absolute bottom-6 left-6 max-w-md rounded-2xl border border-rose-400/30 bg-black/55 p-4 backdrop-blur-xl">
            <p className="text-sm font-medium text-rose-200">$1,284 drift cost · weekly recon meeting</p>
            <p className="mt-1 text-xs text-white/60">
              POS rang $5.99 for 7 hours. Shoppers paid more. Attribution learned a price that never
              actually executed correctly.
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

/* ─────────────────────────────── quote wall ──────────────────────────────── */

function QuoteWall() {
  const quotes = [
    {
      body: "Test before go-live. Guard after approval. Learn only from what shoppers actually saw.",
      who: "Operating principle",
      role: "ShelfTrace · core thesis",
    },
    {
      body: "If a price action wasn't executed correctly, the model should not learn from it.",
      who: "Verified Impact Gate",
      role: "Attribution discipline",
    },
    {
      body: "If it isn't simulatable, it isn't operable. Every primitive should be something an operator can poke.",
      who: "Operator surface",
      role: "Design constraint",
    },
  ];
  return (
    <section className="relative mx-auto max-w-[1500px] px-5 py-28 sm:px-8 sm:py-36">
      <div className="grid gap-6 lg:grid-cols-3">
        {quotes.map((q, i) => (
          <motion.figure
            key={i}
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7, delay: i * 0.08 }}
            className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[.04] to-transparent p-8"
          >
            <Quote className="h-6 w-6 text-orange-400/70" />
            <blockquote className="mt-5 text-xl leading-snug font-medium text-white">
              &ldquo;{q.body}&rdquo;
            </blockquote>
            <figcaption className="mt-6 border-t border-white/10 pt-4">
              <p className="text-sm font-medium text-white">{q.who}</p>
              <p className="text-xs text-white/45">{q.role}</p>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────── how it works ────────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Approve",
      body: "Your pricing engine commits an approved price to ShelfTrace's outbox in one transaction. Idempotency key issued.",
      icon: Sparkles,
    },
    {
      n: "02",
      title: "Dispatch",
      body: "Workers fan the event out to every channel — ESL, POS, web, mobile, kiosk — under FOR UPDATE SKIP LOCKED.",
      icon: Zap,
    },
    {
      n: "03",
      title: "Verify",
      body: "Acks reconcile against the canonical price. Any drift opens a containment window; twin replays before live retry.",
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

/* ─────────────────────────────── closing CTA ─────────────────────────────── */

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
              Six surfaces. One engine.
              <br />
              <span className="bg-gradient-to-r from-orange-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">
                Audit-grade, end to end.
              </span>
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65">
              Every concept on this page mounts on the working ShelfTrace repo. The control plane, the
              scenario engine, the certification lab, the audit log — already there. Mission Control
              and Command Sphere are the operator surfaces this page argues for.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/vision/orbit"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#040608] hover:bg-orange-50"
              >
                Try the simulator <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/vision/mission-control"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-6 py-3.5 text-sm text-white hover:bg-white/10"
              >
                See Mission Control <ArrowUpRight className="h-4 w-4" />
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

export default function KeynotePage() {
  return (
    <div className="relative bg-[#040608]">
      <FilmGrain />
      <HeroCinematic />
      <MarqueeStrip />
      <StatBand />
      <PinnedScene
        eyebrow="Scene · the moment of truth"
        kicker="A shopper lifts the product. The price had better be the price."
        photo={PHOTOS.scan}
        alt="Barcode scan at checkout"
        side="right"
        beats={[
          { chip: "01 · approve", title: "The engine commits the price.", body: "Outbox + idempotency key. One transaction. Workers race safely under FOR UPDATE SKIP LOCKED." },
          { chip: "02 · dispatch", title: "Every channel hears it the same way.", body: "ESL, POS, web, mobile, kiosk. Each connector signs the same contract, verified in CI by Pact." },
          { chip: "03 · verify", title: "Acks reconcile against canonical.", body: "If drift opens, containment fires before a single shopper rings the wrong price." },
        ]}
      />
      <PinnedScene
        eyebrow="Scene · containment"
        kicker="When a connector lies, the twin tells the truth first."
        photo={PHOTOS.cold}
        alt="Refrigerated grocery case"
        side="left"
        beats={[
          { chip: "04 · drift", title: "POS reports $5.99. Canonical was $5.49.", body: "Incident opens with full causal trace, SLA 120s, downstream paused, attribution held." },
          { chip: "05 · twin replay", title: "Synthetic double runs the failing call first.", body: "Same contract, no shelf risk. Verdict in milliseconds. Only safe-to-live earns the live retry." },
          { chip: "06 · seal", title: "Audit causality stamps the recovery.", body: "ack < resolve, recorded as legal record. The incident becomes a regression test." },
        ]}
      />
      <FeatureGrid />
      <BeforeAfter />
      <QuoteWall />
      <HowItWorks />
      <ClosingCta />
    </div>
  );
}
