"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import type { ElementType } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Calendar,
  Eye,
  Glasses,
  Heart,
  Leaf,
  LineChart,
  MapPinned,
  Network,
  ScanLine,
  Sparkles,
  Truck,
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
   /vision/futures — "Where ShelfTrace could go."
   Seven future capabilities. Every card explicitly marked Vision concept ·
   exploratory. No claims of built functionality.
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
          future-state capabilities that would extend the same primitives — predictive pricing,
          scenario simulation, sustainability signals, competitor tracking, fairness, AR for store
          managers, and supply-chain coordination. All labeled as vision, not built today.
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

/* ─────────────────────────────── 2. SEVEN FUTURES ───────────────────────── */

type Future = {
  icon: ElementType;
  title: string;
  kicker: string;
  body: string;
  visual: (key: string) => React.ReactNode;
  tone: "orange" | "purple" | "green" | "sky" | "rose" | "amber" | "emerald";
};

const FUTURES: Future[] = [
  {
    icon: LineChart,
    title: "Predictive Pricing",
    kicker: "WHAT NEEDS REVIEW NEXT WEEK",
    body: "Forecast pricing pressure from supplier cost, competitor moves, inventory and demand signals — surface which decisions may matter before a margin or stock-out problem opens.",
    tone: "orange",
    visual: (k) => <ChartVisual key={k} />,
  },
  {
    icon: Network,
    title: "Scenario Simulation",
    kicker: "IF / THEN BEFORE APPROVAL",
    body: "Run an approved price action against simulated futures — competitor cuts 10%, supply slips, a season starts — and compare strategies side by side before pressing Expand.",
    tone: "purple",
    visual: (k) => <BranchVisual key={k} />,
  },
  {
    icon: Leaf,
    title: "Sustainability Signals",
    kicker: "WASTE-AWARE MARKDOWNS",
    body: "Mark down items nearing expiration first, balance margin with shrink, route fresh inventory before it dies on the shelf. Sustainability becomes a first-class signal, not an afterthought.",
    tone: "green",
    visual: (k) => <LeafVisual key={k} />,
  },
  {
    icon: ScanLine,
    title: "Real-Time Competitor Tracking",
    kicker: "WHERE PRICES MAY NEED REVIEW",
    body: "Continuously observe competitor pricing on KVIs. Highlight gaps where the gap-to-competitor crosses a threshold — push a review to the operator's queue.",
    tone: "sky",
    visual: (k) => <TickerVisual key={k} />,
  },
  {
    icon: Heart,
    title: "Pricing Fairness · Customer Trust",
    kicker: "FLAG WHAT MIGHT FEEL UNFAIR",
    body: "Surface unexpected spikes on essential items, inconsistent pricing across similar SKUs, aggressive changes during sensitive events. Trust is a measurable surface, not a hope.",
    tone: "rose",
    visual: (k) => <TrustVisual key={k} />,
  },
  {
    icon: Glasses,
    title: "AR for Store Managers",
    kicker: "PRICES IN PHYSICAL CONTEXT",
    body: "A manager walks the aisle wearing a phone or headset; price actions, pending updates and substitution recommendations overlay onto the real shelf — execution issues become visible in situ.",
    tone: "amber",
    visual: (k) => <ARVisual key={k} />,
  },
  {
    icon: Truck,
    title: "Predictive Supply-Chain Coordination",
    kicker: "DON'T PRICE WHAT YOU CAN'T FULFILL",
    body: "Tie pricing decisions to live inventory + replenishment timing. Don't recommend an attractive price change when stock is about to run out; surface promotion conflicts before they reach the shelf.",
    tone: "emerald",
    visual: (k) => <SupplyVisual key={k} />,
  },
];

function FuturesGrid({ anchorRef }: { anchorRef: React.RefObject<HTMLDivElement> }) {
  const [active, setActive] = useState(0);
  const current = FUTURES[active];
  const Icon = current.icon;
  return (
    <section ref={anchorRef} className="scroll-mt-12">
      <ChapterMarker n="01" label="Seven futures" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-3xl">
          <Pill tone="orange">Each card extends the shipped engine</Pill>
          <h2 className="mt-5 text-[clamp(30px,4.5vw,60px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            Trace · evaluate · gate · audit —
            <br />
            same primitives, broader surface.
          </h2>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          {/* selector list */}
          <ul className="flex flex-col gap-2">
            {FUTURES.map((f, i) => {
              const isActive = i === active;
              const FIcon = f.icon;
              return (
                <li key={f.title}>
                  <button
                    onClick={() => setActive(i)}
                    className={`group flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all duration-200 ${
                      isActive
                        ? "border-orange-500/40 bg-orange-500/[.06]"
                        : "border-white/8 bg-white/[.02] hover:border-white/20 hover:bg-white/[.04]"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                        isActive
                          ? "border-orange-500/40 bg-orange-500/[.12] text-orange-200"
                          : "border-white/10 bg-white/[.04] text-white/55"
                      }`}
                    >
                      <FIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{f.title}</p>
                        <span className="font-mono text-[9px] tracking-[.22em] text-white/30">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] uppercase tracking-[.18em] text-orange-300/80">
                        {f.kicker}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* detail */}
          <motion.div
            key={current.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING.gentle}
            className="rounded-3xl border border-white/10 bg-[#0b0f18]/90 p-6"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/[.08] text-orange-300">
                <Icon className="h-5 w-5" />
              </span>
              <Pill tone="purple">Vision concept · exploratory</Pill>
            </div>
            <h3 className="mt-5 text-2xl font-semibold leading-snug text-white">{current.title}</h3>
            <p className="mt-1 text-[11px] uppercase tracking-[.18em] text-orange-300/80">
              {current.kicker}
            </p>
            <p className="mt-4 text-base leading-relaxed text-white/70">{current.body}</p>
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/[.06] bg-black/40 p-3">
              <div className="h-[160px]">{current.visual(current.title)}</div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-[10px] uppercase tracking-[.18em] text-white/45">
              <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">
                extends shipped engine
              </span>
              <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">
                not built today
              </span>
              <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-1">
                operator stays in control
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── visualisations (SVG, no real data) ──────────────── */

function ChartVisual() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full">
      <line x1="0" y1="100" x2="320" y2="100" stroke="rgba(255,255,255,.1)" />
      {[
        [10, 70],
        [50, 60],
        [90, 78],
        [130, 52],
        [170, 40],
        [210, 64],
        [250, 32],
        [290, 24],
        [310, 18],
      ].map(([x, y], i, arr) => {
        const next = arr[i + 1];
        if (!next) return null;
        return (
          <line
            key={i}
            x1={x}
            y1={y}
            x2={next[0]}
            y2={next[1]}
            stroke="#fb923c"
            strokeWidth="1.6"
          />
        );
      })}
      {[
        [50, 60],
        [170, 40],
        [290, 24],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="#fb923c" />
      ))}
      <text x="6" y="14" fontSize="8" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace">
        forecast pressure · next 14d
      </text>
    </svg>
  );
}

function BranchVisual() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full">
      <g stroke="rgba(167,139,250,.5)" fill="none" strokeWidth="1.4">
        <path d="M30 60 L120 60 L210 30" />
        <path d="M120 60 L210 60" />
        <path d="M120 60 L210 90" />
      </g>
      {[
        [30, 60, "now"],
        [120, 60, "branch"],
        [210, 30, "+10% cut"],
        [210, 60, "stable"],
        [210, 90, "+stock"],
      ].map(([x, y, label]) => (
        <g key={label as string}>
          <circle cx={x as number} cy={y as number} r="4" fill="#a78bfa" />
          <text
            x={(x as number) + 8}
            y={(y as number) + 3}
            fontSize="8"
            fill="rgba(255,255,255,.65)"
            fontFamily="ui-monospace, monospace"
          >
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function LeafVisual() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full">
      {[0, 1, 2, 3, 4, 5, 6].map((d) => {
        const x = 30 + d * 40;
        const urgency = d / 6;
        const fill = urgency > 0.66 ? "#dc2626" : urgency > 0.33 ? "#fb923c" : "#22c55e";
        const h = 20 + urgency * 50;
        return (
          <g key={d}>
            <rect x={x - 12} y={100 - h} width="24" height={h} rx="2" fill={fill} opacity="0.6" />
            <text
              x={x}
              y={114}
              fontSize="8"
              textAnchor="middle"
              fill="rgba(255,255,255,.45)"
              fontFamily="ui-monospace, monospace"
            >
              D-{6 - d}
            </text>
          </g>
        );
      })}
      <text x="6" y="14" fontSize="8" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace">
        markdown urgency · days to expiry
      </text>
    </svg>
  );
}

function TickerVisual() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full">
      {[
        { sku: "Milk 1G", ours: 5.99, theirs: 5.49, gap: -0.5 },
        { sku: "Eggs 12", ours: 4.19, theirs: 3.99, gap: -0.2 },
        { sku: "OJ 64", ours: 6.79, theirs: 6.99, gap: 0.2 },
        { sku: "Berries", ours: 3.49, theirs: 3.29, gap: -0.2 },
      ].map((row, i) => (
        <g key={row.sku} transform={`translate(0 ${10 + i * 25})`}>
          <text x="6" y="10" fontSize="9" fill="#fff" fontFamily="ui-monospace, monospace">
            {row.sku}
          </text>
          <text x="80" y="10" fontSize="9" fill="rgba(255,255,255,.6)" fontFamily="ui-monospace, monospace">
            ours ${row.ours.toFixed(2)}
          </text>
          <text x="170" y="10" fontSize="9" fill="rgba(255,255,255,.6)" fontFamily="ui-monospace, monospace">
            theirs ${row.theirs.toFixed(2)}
          </text>
          <text
            x="260"
            y="10"
            fontSize="9"
            fill={row.gap < -0.3 ? "#f43f5e" : row.gap < 0 ? "#fb923c" : "#22c55e"}
            fontFamily="ui-monospace, monospace"
          >
            {row.gap > 0 ? "+" : ""}
            {row.gap.toFixed(2)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function TrustVisual() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full">
      {[20, 60, 100, 140, 180, 220, 260, 300].map((x, i) => {
        const h = i === 4 ? 70 : 20 + (i % 4) * 6;
        const spike = i === 4;
        return (
          <rect
            key={x}
            x={x - 8}
            y={100 - h}
            width="16"
            height={h}
            rx="2"
            fill={spike ? "#f43f5e" : "rgba(255,255,255,.18)"}
          />
        );
      })}
      <g transform="translate(180 14)">
        <rect width="120" height="14" rx="3" fill="rgba(244,63,94,.18)" stroke="#f43f5e" />
        <text x="6" y="10" fontSize="8" fill="#fda4af" fontFamily="ui-monospace, monospace">
          flagged · essential spike
        </text>
      </g>
    </svg>
  );
}

function ARVisual() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full">
      {/* shelf */}
      <rect x="20" y="60" width="280" height="40" rx="3" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.1)" />
      {[40, 90, 140, 190, 240].map((x, i) => (
        <rect key={x} x={x} y="40" width="34" height="48" rx="2" fill="rgba(255,255,255,.08)" />
      ))}
      {/* AR overlay callouts */}
      {[
        { x: 57, y: 30, txt: "$5.99 ✓" },
        { x: 157, y: 30, txt: "RETRY" },
        { x: 257, y: 30, txt: "+0.20" },
      ].map((o, i) => (
        <g key={i}>
          <line x1={o.x} y1={o.y + 6} x2={o.x} y2={40} stroke="#fb923c" strokeDasharray="2 2" />
          <rect x={o.x - 22} y={o.y - 10} width="44" height="16" rx="3" fill="#0a0e18" stroke="#fb923c" />
          <text
            x={o.x}
            y={o.y + 1}
            fontSize="8"
            textAnchor="middle"
            fill="#fdba74"
            fontFamily="ui-monospace, monospace"
          >
            {o.txt}
          </text>
        </g>
      ))}
    </svg>
  );
}

function SupplyVisual() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full">
      <g>
        <rect x="20" y="20" width="80" height="80" rx="6" fill="rgba(34,197,94,.06)" stroke="#22c55e" />
        <text x="60" y="48" fontSize="9" textAnchor="middle" fill="#bbf7d0" fontFamily="ui-monospace, monospace">
          INVENTORY
        </text>
        <text x="60" y="68" fontSize="14" textAnchor="middle" fill="#fff" fontFamily="ui-monospace, monospace" fontWeight="700">
          12
        </text>
        <text x="60" y="84" fontSize="8" textAnchor="middle" fill="rgba(255,255,255,.55)" fontFamily="ui-monospace, monospace">
          units
        </text>
      </g>
      <path d="M105 60 L155 60" stroke="rgba(255,255,255,.3)" strokeDasharray="3 3" />
      <g>
        <rect x="160" y="20" width="80" height="80" rx="6" fill="rgba(244,63,94,.06)" stroke="#f43f5e" />
        <text x="200" y="48" fontSize="9" textAnchor="middle" fill="#fecaca" fontFamily="ui-monospace, monospace">
          PRICE CUT
        </text>
        <text x="200" y="68" fontSize="14" textAnchor="middle" fill="#fff" fontFamily="ui-monospace, monospace" fontWeight="700">
          BLOCKED
        </text>
        <text x="200" y="84" fontSize="8" textAnchor="middle" fill="rgba(255,255,255,.55)" fontFamily="ui-monospace, monospace">
          stock too low
        </text>
      </g>
      <path d="M245 60 L295 60" stroke="rgba(255,255,255,.3)" strokeDasharray="3 3" />
      <text x="300" y="63" fontSize="8" fill="rgba(255,255,255,.55)" fontFamily="ui-monospace, monospace">
        operator
      </text>
    </svg>
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
              {
                k: "Trace",
                v: "Every decision carries a causal record",
                icon: Eye,
              },
              {
                k: "Evaluate",
                v: "Deterministic rules + scenario-driven adapters",
                icon: Boxes,
              },
              {
                k: "Gate",
                v: "Canary containment · expansion blocked on disagreement",
                icon: ScanLine,
              },
              {
                k: "Audit",
                v: "Tamper-evident trail · ack precedes resolve · always",
                icon: Sparkles,
              },
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
            None of the seven futures require throwing the engine away. They're additive surfaces
            on top of the same reliability spine — each can ship on its own timeline, each carries
            the same audit guarantees.
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
              The Working Platform is what's shipped: outbox + canary containment + audit-verified
              recovery + 47 PostgreSQL-backed tests. The Vision Concepts page lists the four
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
  const gridRef = useRef<HTMLDivElement>(null);
  return (
    <div className="relative bg-[#04070b]">
      <FilmGrain id="futures" />
      <Hero onScroll={() => gridRef.current?.scrollIntoView({ behavior: "smooth" })} />
      <FuturesGrid anchorRef={gridRef} />
      <TheThread />
      <ClosingCta />
    </div>
  );
}
