"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  Cable,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Cloud,
  Database,
  FileUp,
  GitBranch,
  Lock,
  Package,
  ScanLine,
  Server,
  ShieldCheck,
  Sparkles,
  Tag,
  Terminal,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { Pill } from "./Shell";
import {
  ChapterMarker,
  CinePhoto,
  FilmGrain,
  InViewBurst,
  MagneticButton,
  MagneticLink,
  Particles,
  PHOTOS,
  Tilt3DCard,
} from "./cinematic";
import { EASE, MOTION_VARIANTS, PRESET, SPRING } from "@/lib/motion";
import { api } from "@/lib/api";

/* ────────────────────────────────────────────────────────────────────────────
   /vision/connect — "Bring your retailer data. Watch it travel through."
   Interactive data-flow page. The "Run live demo" button actually calls the
   backend (POST /api/v1/demo/reset → real BatchSummary). Everything else is
   either illustrated SVG or qualitative explanation — no fake metrics.
   ──────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────── 1. HERO ─────────────────────────────────── */

function Hero({ onLive }: { onLive: () => void }) {
  const reduced = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [reduced ? 1 : 1.06, reduced ? 1 : 1.2]);
  const overlay = useTransform(scrollYProgress, [0, 1], [0.6, 0.92]);

  return (
    <section ref={heroRef} className="relative isolate h-[100vh] min-h-[720px] w-full overflow-hidden">
      <div className="absolute inset-0 bg-[#04070b]" />
      <motion.div style={{ scale }} className="absolute inset-0">
        <CinePhoto src={PHOTOS.cold} alt="" />
      </motion.div>
      <motion.div
        style={{ opacity: overlay }}
        className="absolute inset-0 bg-gradient-to-b from-[#04070b]/60 via-[#04070b]/55 to-[#04070b]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(167,139,250,.16),transparent_55%),radial-gradient(ellipse_at_85%_-10%,rgba(96,165,250,.10),transparent_55%)]" />
      <Particles count={22} color="rgba(196,181,253,.5)" />

      <div className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-end px-5 pb-24 sm:px-8 sm:pb-32">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
          className="flex flex-wrap items-center gap-2"
        >
          <Pill tone="purple">Connect · data flow</Pill>
          <Pill tone="neutral">Prototype shows the workflow · production uses approved integrations</Pill>
        </motion.div>
        <motion.h1
          initial={reduced ? false : MOTION_VARIANTS.fadeUpLarge.initial}
          animate={MOTION_VARIANTS.fadeUpLarge.animate}
          transition={{ ...PRESET.heroEntrance, delay: 0.15 }}
          className="mt-8 max-w-[24ch] text-[clamp(44px,7.5vw,120px)] font-semibold leading-[0.96] tracking-[-0.03em] text-white"
        >
          Bring your data.
          <br />
          <span className="bg-gradient-to-r from-violet-200 via-sky-200 to-orange-200 bg-clip-text text-transparent">
            Watch it travel through.
          </span>
        </motion.h1>
        <motion.p
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5 }}
          className="mt-7 max-w-2xl text-lg leading-relaxed text-white/70"
        >
          Any approved price action — from a CSV, a REST POST, or a direct database hand-off —
          enters the same engine you saw in the Keynote. Below: what the system needs, three ways
          to feed it, and a live button that actually runs the demo.
        </motion.p>
        <motion.div
          initial={reduced ? false : MOTION_VARIANTS.fadeUp.initial}
          animate={MOTION_VARIANTS.fadeUp.animate}
          transition={{ ...PRESET.fadeUp, delay: 0.65 }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <MagneticButton onClick={onLive} variant="primary">
            Try the live demo <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </MagneticButton>
          <MagneticLink href="/scenarios" variant="ghost">
            Open the working scenario builder <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </MagneticLink>
          <MagneticLink href="/engineering" variant="quiet">
            View Engineering Proof <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </MagneticLink>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────── data-field mini mockups ────────────────────── */
/* Tiny illustrative previews — one per data shape. Inline SVG, no chrome. */

function MiniProductCatalog() {
  return (
    <svg viewBox="0 0 160 60" className="h-full w-full">
      {[6, 58, 110].map((x, i) => (
        <g key={x}>
          <rect x={x} y="6" width="44" height="48" rx="3" fill="#0e1320" stroke={i === 1 ? "#fb923c" : "#1e293b"} strokeWidth="0.6" />
          <rect x={x + 6} y="12" width="32" height="18" rx="1.5" fill="rgba(255,255,255,.05)" />
          <text x={x + 22} y="42" fontSize="6" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily="ui-monospace, monospace">
            ${[5.99, 4.19, 6.79][i]}
          </text>
          <text x={x + 22} y="49" fontSize="3.5" textAnchor="middle" fill="rgba(255,255,255,.45)" fontFamily="ui-sans-serif, system-ui">
            {["MILK", "EGGS", "OJ"][i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

function MiniApprovedActions() {
  return (
    <svg viewBox="0 0 160 60" className="h-full w-full">
      <text x="14" y="22" fontSize="11" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace" textDecoration="line-through">$5.49</text>
      <line x1="56" y1="20" x2="100" y2="20" stroke="#fb923c" strokeWidth="1.4" />
      <polygon points="100,20 94,16 94,24" fill="#fb923c" />
      <text x="108" y="22" fontSize="13" fontWeight="700" fill="#fb923c" fontFamily="ui-monospace, monospace">$5.99</text>
      <rect x="14" y="36" width="132" height="14" rx="2" fill="#0e1320" stroke="#22c55e" strokeWidth="0.5" />
      <text x="20" y="46" fontSize="7" fill="#86efac" fontFamily="ui-monospace, monospace">approved · memorial-day · zone DAL</text>
    </svg>
  );
}

function MiniMarginBar() {
  return (
    <svg viewBox="0 0 160 60" className="h-full w-full">
      <text x="10" y="14" fontSize="7" fill="rgba(255,255,255,.55)" fontFamily="ui-monospace, monospace">COST</text>
      <text x="106" y="14" fontSize="7" fill="rgba(255,255,255,.55)" fontFamily="ui-monospace, monospace">PRICE</text>
      <rect x="10" y="20" width="140" height="14" rx="3" fill="#0e1320" stroke="#1e293b" strokeWidth="0.5" />
      <rect x="10" y="20" width="84" height="14" rx="3" fill="rgba(244,63,94,.25)" />
      <rect x="94" y="20" width="56" height="14" rx="3" fill="rgba(34,197,94,.45)" />
      <text x="50" y="29" fontSize="7" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily="ui-monospace, monospace">$3.59</text>
      <text x="122" y="29" fontSize="7" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily="ui-monospace, monospace">+$2.40</text>
      <text x="10" y="46" fontSize="6.5" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace">margin 40% · target 38%</text>
    </svg>
  );
}

function MiniInventory() {
  const dots = Array.from({ length: 12 });
  return (
    <svg viewBox="0 0 160 60" className="h-full w-full">
      {dots.map((_, i) => {
        const filled = i < 4;
        return (
          <rect
            key={i}
            x={10 + i * 12}
            y="22"
            width="10"
            height="22"
            rx="2"
            fill={filled ? "#22c55e" : "rgba(255,255,255,.06)"}
            stroke={filled ? "#16a34a" : "#1e293b"}
            strokeWidth="0.4"
          />
        );
      })}
      <text x="10" y="14" fontSize="7" fill="rgba(255,255,255,.55)" fontFamily="ui-monospace, monospace">ON HAND</text>
      <text x="150" y="14" fontSize="7" textAnchor="end" fill="#fda4af" fontFamily="ui-monospace, monospace">4 / 12 · low</text>
    </svg>
  );
}

function MiniCompetitor() {
  return (
    <svg viewBox="0 0 160 60" className="h-full w-full">
      <rect x="6" y="10" width="64" height="40" rx="3" fill="#0e1320" stroke="#22c55e" strokeWidth="0.6" />
      <text x="38" y="22" fontSize="6.5" textAnchor="middle" fill="#86efac" fontFamily="ui-monospace, monospace">OURS</text>
      <text x="38" y="38" fontSize="12" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily="ui-monospace, monospace">$5.99</text>
      <rect x="90" y="10" width="64" height="40" rx="3" fill="#0e1320" stroke="#f43f5e" strokeWidth="0.6" />
      <text x="122" y="22" fontSize="6.5" textAnchor="middle" fill="#fda4af" fontFamily="ui-monospace, monospace">THEIRS</text>
      <text x="122" y="38" fontSize="12" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily="ui-monospace, monospace">$5.49</text>
      <text x="80" y="56" fontSize="6.5" textAnchor="middle" fill="#fda4af" fontFamily="ui-monospace, monospace">gap −$0.50</text>
    </svg>
  );
}

function MiniSubstitution() {
  return (
    <svg viewBox="0 0 160 60" className="h-full w-full">
      <rect x="10" y="14" width="52" height="32" rx="3" fill="#0e1320" stroke="#94a3b8" strokeWidth="0.5" />
      <text x="36" y="28" fontSize="7" textAnchor="middle" fill="#fff" fontFamily="ui-sans-serif, system-ui">Brand A</text>
      <text x="36" y="40" fontSize="6" textAnchor="middle" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace">out</text>
      <line x1="70" y1="30" x2="92" y2="30" stroke="#a78bfa" strokeWidth="1.4" strokeDasharray="3 2" />
      <polygon points="92,30 86,26 86,34" fill="#a78bfa" />
      <rect x="98" y="14" width="52" height="32" rx="3" fill="#0e1320" stroke="#a78bfa" strokeWidth="0.5" />
      <text x="124" y="28" fontSize="7" textAnchor="middle" fill="#fff" fontFamily="ui-sans-serif, system-ui">Brand B</text>
      <text x="124" y="40" fontSize="6" textAnchor="middle" fill="#c4b5fd" fontFamily="ui-monospace, monospace">substitute</text>
    </svg>
  );
}

function MiniPromotional() {
  return (
    <svg viewBox="0 0 160 60" className="h-full w-full">
      <rect x="10" y="10" width="140" height="40" rx="3" fill="#0e1320" stroke="#fb923c" strokeWidth="0.6" />
      <rect x="10" y="10" width="140" height="10" rx="3" fill="rgba(251,146,60,.18)" />
      <text x="14" y="18" fontSize="6" fill="#fdba74" fontFamily="ui-monospace, monospace">MEMORIAL DAY · MAY 27</text>
      <text x="14" y="32" fontSize="8" fill="#fff" fontFamily="ui-sans-serif, system-ui">Markdown · 4 SKUs · zone DAL</text>
      <text x="14" y="43" fontSize="6" fill="rgba(255,255,255,.45)" fontFamily="ui-monospace, monospace">deadline · 6 PM</text>
    </svg>
  );
}

function MiniApprovalPolicy() {
  return (
    <svg viewBox="0 0 160 60" className="h-full w-full">
      <circle cx="32" cy="30" r="14" fill="rgba(167,139,250,.18)" stroke="#a78bfa" strokeWidth="0.6" />
      <text x="32" y="33" fontSize="8" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily="ui-sans-serif, system-ui">AD</text>
      <text x="56" y="26" fontSize="8" fill="#fff" fontFamily="ui-sans-serif, system-ui">Avery Davis</text>
      <text x="56" y="36" fontSize="6.5" fill="rgba(255,255,255,.55)" fontFamily="ui-monospace, monospace">operator · zones DAL/AUS</text>
      <rect x="56" y="42" width="42" height="10" rx="2" fill="rgba(34,197,94,.18)" stroke="#22c55e" strokeWidth="0.4" />
      <text x="77" y="49" fontSize="5.5" textAnchor="middle" fill="#86efac" fontFamily="ui-monospace, monospace">may expand</text>
    </svg>
  );
}

/* ─────────────────────────── 2. DATA THE SYSTEM NEEDS ────────────────────── */

const DATA_FIELDS: {
  icon: any;
  label: string;
  body: string;
  mockup: React.ReactNode;
}[] = [
  { icon: Package, label: "Product catalog", body: "SKU · name · category · brand · KVI flag", mockup: <MiniProductCatalog /> },
  { icon: TrendingUp, label: "Approved price actions", body: "Approved price · prior price · reason · effective window", mockup: <MiniApprovedActions /> },
  { icon: Tag, label: "Cost & margin context", body: "Unit cost · margin target · projected impact", mockup: <MiniMarginBar /> },
  { icon: Boxes, label: "Inventory snapshot", body: "On-hand units · replenishment timing · perishable flag", mockup: <MiniInventory /> },
  { icon: ScanLine, label: "Competitor reference", body: "Recent observed prices · trusted-source attribution", mockup: <MiniCompetitor /> },
  { icon: GitBranch, label: "Substitution map", body: "Acceptable alternates when inventory or supply slips", mockup: <MiniSubstitution /> },
  { icon: Sparkles, label: "Promotional context", body: "Event · markdown deadline · bundle membership", mockup: <MiniPromotional /> },
  { icon: ShieldCheck, label: "Approval policy", body: "Who can expand · which zones · which categories", mockup: <MiniApprovalPolicy /> },
];

function DataFields() {
  return (
    <section>
      <ChapterMarker n="01" label="What the system needs" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-24 sm:px-8 sm:py-28">
        <div className="max-w-3xl">
          <Pill tone="orange">The contract</Pill>
          <h2 className="mt-5 text-[clamp(30px,4.5vw,60px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            Eight data shapes describe almost any retailer's pricing reality.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55">
            The engine doesn't need every column populated for every SKU — it gracefully handles
            missing fields and routes risky cases to a human. But these are the categories it knows
            how to evaluate.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DATA_FIELDS.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.04, ease: EASE.outQuart }}
                whileHover={{ y: -3 }}
                className="group rounded-2xl border border-white/10 bg-white/[.025] p-5 transition-colors duration-200 hover:border-orange-500/30 hover:bg-orange-500/[.04]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] text-orange-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-mono text-[10px] tracking-[.22em] text-white/30">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <p className="mt-4 text-sm font-semibold text-white">{f.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/55">{f.body}</p>
                {/* mini-mockup — shows the shape of the data, not just words */}
                <div className="mt-4 h-[70px] overflow-hidden rounded-xl border border-white/[.06] bg-black/30 p-2">
                  {f.mockup}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── 3. THREE INTEGRATION PATHS ─────────────────── */

/* ─────────────────────── integration-path mockups ──────────────────────── */

function CsvFileMockup() {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#04070b]">
      <div className="flex items-center justify-between border-b border-white/[.06] px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[.22em] text-emerald-300">
          <FileUp className="h-3 w-3" /> actions.csv
        </span>
        <span className="font-mono text-[10px] text-white/35">1,247 rows</span>
      </div>
      <table className="w-full font-mono text-[10px] text-white/65">
        <thead className="text-white/35">
          <tr>
            <th className="px-2 py-1 text-left">sku</th>
            <th className="px-2 py-1 text-right">approved</th>
            <th className="px-2 py-1 text-left">zone</th>
            <th className="px-2 py-1 text-left">deadline</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["mk-001", "$5.99", "DAL", "—"],
            ["egg-12", "$4.19", "DAL", "—"],
            ["str-1lb", "$2.99", "DAL", "6 PM"],
            ["oj-64", "$6.79", "AUS", "—"],
          ].map((row, i) => (
            <tr key={i} className={i % 2 ? "bg-white/[.02]" : ""}>
              {row.map((c, j) => (
                <td key={j} className={`px-2 py-1 ${j === 1 ? "text-right text-emerald-200" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RestApiMockup() {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#04070b]">
      <div className="flex items-center justify-between border-b border-white/[.06] px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[.22em] text-violet-300">
          <Terminal className="h-3 w-3" /> request
        </span>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/[.08] px-2 py-0.5 text-[9px] font-mono text-emerald-200">
          202
        </span>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-[10px] leading-relaxed">
        <span className="text-violet-300">POST</span>{" "}
        <span className="text-white/75">/api/v1/price-batches</span>{"\n"}
        <span className="text-white/45">Content-Type:</span>{" "}
        <span className="text-emerald-200">application/json</span>{"\n"}
        <span className="text-white/45">X-API-Key:</span>{" "}
        <span className="text-orange-200">op-key-…</span>{"\n"}
        {"\n"}
        <span className="text-white/65">{`{ "idempotency_key": "md-`}</span>
        <span className="text-orange-200">…</span>
        <span className="text-white/65">{`", "external_id": "MD-DAL-02", … }`}</span>
      </pre>
    </div>
  );
}

function DbConnectorMockup() {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#04070b] p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[.22em] text-sky-300">
          <Database className="h-3 w-3" /> source-of-truth
        </span>
        <span className="font-mono text-[10px] text-white/35">read-only</span>
      </div>
      <svg viewBox="0 0 240 90" className="mt-2 h-[90px] w-full">
        <rect x="6" y="14" width="80" height="60" rx="4" fill="#0e1320" stroke="#60a5fa" strokeWidth="0.6" />
        <text x="46" y="28" fontSize="7" textAnchor="middle" fill="#bfdbfe" fontFamily="ui-monospace, monospace">
          prices
        </text>
        <line x1="14" y1="34" x2="78" y2="34" stroke="rgba(255,255,255,.1)" />
        {[42, 50, 58, 66].map((y, i) => (
          <g key={y}>
            <rect x="14" y={y - 2} width="40" height="4" rx="1" fill="rgba(255,255,255,.08)" />
            <rect x="58" y={y - 2} width="18" height="4" rx="1" fill={i === 1 ? "#22c55e" : "rgba(34,197,94,.4)"} />
          </g>
        ))}
        <line x1="86" y1="44" x2="148" y2="44" stroke="#60a5fa" strokeWidth="1" strokeDasharray="3 3" />
        <polygon points="148,44 142,40 142,48" fill="#60a5fa" />
        <rect x="150" y="22" width="84" height="44" rx="6" fill="#0e1320" stroke="#fb923c" strokeWidth="0.8" />
        <text x="192" y="40" fontSize="7" textAnchor="middle" fill="#fdba74" fontFamily="ui-monospace, monospace">
          ShelfTrace
        </text>
        <text x="192" y="52" fontSize="6" textAnchor="middle" fill="rgba(255,255,255,.55)" fontFamily="ui-monospace, monospace">
          engine
        </text>
        <text x="192" y="78" fontSize="6" textAnchor="middle" fill="#86efac" fontFamily="ui-monospace, monospace">
          audit-logged
        </text>
      </svg>
    </div>
  );
}

function IntegrationPaths() {
  const paths: {
    icon: any;
    title: string;
    sub: string;
    body: string;
    mockup: React.ReactNode;
  }[] = [
    {
      icon: FileUp,
      title: "CSV upload",
      sub: "Fastest path · zero infra",
      body: "Drop a CSV of approved price actions. The engine validates, batches by zone, and runs the same canary-first execution.",
      mockup: <CsvFileMockup />,
    },
    {
      icon: Cloud,
      title: "REST API ingestion",
      sub: "POST /api/v1/price-batches · idempotent",
      body: "Same endpoint the demo uses. Idempotency key required; same key always maps to the same workflow.",
      mockup: <RestApiMockup />,
    },
    {
      icon: Database,
      title: "Direct database connector",
      sub: "Production · approved access",
      body: "Secure connector reads approved actions from a retailer's source-of-truth on a schedule, replays through the engine.",
      mockup: <DbConnectorMockup />,
    },
  ];
  return (
    <section>
      <ChapterMarker n="02" label="Three ways to feed it" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-3xl">
          <Pill tone="purple">Pick the path that fits</Pill>
          <h2 className="mt-5 text-[clamp(30px,4.5vw,60px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            Same engine. Three doors in.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {paths.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.65, delay: i * 0.08, ease: EASE.outQuart }}
              >
                <Tilt3DCard className="h-full">
                  <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[.04] to-transparent p-7 transition-shadow duration-300 hover:shadow-[0_30px_80px_-30px_rgba(167,139,250,.4)]">
                    {/* one-shot particle burst when entering view */}
                    <InViewBurst
                      color={
                        i === 0
                          ? "rgba(34,197,94,.7)"
                          : i === 1
                            ? "rgba(167,139,250,.7)"
                            : "rgba(96,165,250,.7)"
                      }
                    />
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[.04] text-violet-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="mt-5 text-xl font-semibold text-white">{p.title}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[.22em] text-violet-300/80">
                      {p.sub}
                    </p>
                    <p className="mt-4 text-sm leading-relaxed text-white/55">{p.body}</p>
                    <div className="mt-5">{p.mockup}</div>
                  </article>
                </Tilt3DCard>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── 4. LIVE DEMO (real backend call) ───────────── */

type DemoOutcome = {
  external_id: string;
  name: string;
  status: string;
  expansion_blocked: boolean;
  total_actions: number;
  verified_actions: number;
  blocked_actions: number;
  retry_actions: number;
  zone: string;
};

function LiveDemoSection({ liveRef }: { liveRef: React.RefObject<HTMLDivElement> }) {
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<DemoOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      // POST /api/v1/demo/reset — re-seeds the live-rollout batch and runs it.
      // Returns the real BatchSummary from the working engine.
      const data = await api.reset();
      setOutcome(data as unknown as DemoOutcome);
    } catch (e: any) {
      setError(
        "Couldn't reach the backend on /api/v1/demo/reset. If running locally, make sure the docker stack is up (docker compose up).",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <section ref={liveRef} className="scroll-mt-12">
      <ChapterMarker n="03" label="The live demo" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-3xl">
          <Pill tone="green">Real backend · real response</Pill>
          <h2 className="mt-5 text-[clamp(30px,4.5vw,60px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            One click reseeds the live rollout. The numbers below are from the engine.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55">
            The button POSTs to <code className="rounded bg-white/[.06] px-1 text-orange-200">/api/v1/demo/reset</code>{" "}
            on the working FastAPI backend. The result you see is the real <code className="rounded bg-white/[.06] px-1 text-orange-200">BatchSummary</code>{" "}
            for the Memorial Day · Dallas Zone 2 scenario, drained through the outbox + worker + reconciler.
          </p>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          {/* Control panel */}
          <div className="rounded-3xl border border-white/10 bg-[#0a0e18]/85 p-6">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[10px] uppercase tracking-[.22em] text-white/55">
                <Terminal className="h-3 w-3 text-emerald-300" /> demo.console
              </span>
              <span className="flex items-center gap-1 text-[10px] text-emerald-300">
                <CircleDot className="h-2 w-2 animate-pulse" /> backend ready
              </span>
            </div>
            <div className="mt-5 space-y-3 font-mono text-[12px] text-white/60">
              <div>
                <span className="text-white/35">$ scenario</span>{" "}
                <span className="text-orange-200">memorial-day-dallas-02</span>
              </div>
              <div>
                <span className="text-white/35">$ stores</span>{" "}
                <span className="text-white">214, 302, 317, 401</span>{" "}
                <span className="text-white/35">(canary: 214, 302)</span>
              </div>
              <div>
                <span className="text-white/35">$ products</span>{" "}
                <span className="text-white">Eggs · Strawberries · Orange Juice</span>
              </div>
              <div>
                <span className="text-white/35">$ endpoint</span>{" "}
                <span className="text-violet-200">POST /api/v1/demo/reset</span>
              </div>
            </div>
            <div className="mt-6">
              <MagneticButton onClick={run} variant="primary" disabled={running}>
                {running ? "Running engine…" : "Run the rollout"}
                {!running && <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />}
              </MagneticButton>
            </div>
            {error && (
              <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/[.06] p-3 text-[12px] text-rose-200">
                <CircleAlert className="mr-1.5 inline h-3.5 w-3.5" />
                {error}
              </div>
            )}
            <div className="mt-6 border-t border-white/10 pt-4 text-[11px] text-white/40">
              No payload to write — the demo endpoint reseeds the showcased scenario and runs it
              through the same engine. For a custom payload, use{" "}
              <code className="text-orange-200">/api/v1/scenarios</code>.
            </div>
          </div>

          {/* Result panel */}
          <div className="rounded-3xl border border-white/10 bg-[#06090f] p-6">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[.22em] text-white/55">
                BatchSummary · response body
              </span>
              <span className="font-mono text-[10px] text-white/35">application/json</span>
            </div>
            <AnimatePresence mode="wait">
              {outcome ? (
                <motion.div
                  key="result"
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, y: -8 }}
                  variants={{
                    hidden: {},
                    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
                  }}
                  className="mt-5 space-y-4"
                >
                  {/* Step 1 — batch header */}
                  <motion.div
                    variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                    transition={PRESET.fadeUp}
                    className="flex items-center justify-between rounded-2xl border border-orange-500/30 bg-orange-500/[.06] p-4"
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-[.22em] text-orange-300">batch</p>
                      <p className="mt-1 font-mono text-sm text-white">{outcome.external_id ?? "—"}</p>
                      <p className="mt-0.5 text-xs text-white/55">
                        {outcome.name ?? "Memorial Day · Dallas Zone 2"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[.22em] ${
                        outcome.expansion_blocked
                          ? "border-rose-500/40 bg-rose-500/[.08] text-rose-200"
                          : "border-emerald-500/40 bg-emerald-500/[.08] text-emerald-200"
                      }`}
                    >
                      {outcome.status ?? "unknown"}
                    </span>
                  </motion.div>
                  {/* Step 2 — counts (themselves staggered) */}
                  <motion.div
                    variants={{
                      hidden: {},
                      visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
                    }}
                    className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                  >
                    {[
                      { label: "total actions", value: outcome.total_actions, tone: undefined as undefined | "green" | "amber" | "red" },
                      { label: "verified", value: outcome.verified_actions, tone: "green" as const },
                      { label: "retrying", value: outcome.retry_actions, tone: "amber" as const },
                      { label: "blocked", value: outcome.blocked_actions, tone: "red" as const },
                    ].map((s) => (
                      <motion.div
                        key={s.label}
                        variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                        transition={{ duration: 0.3, ease: EASE.outQuart }}
                      >
                        <Stat label={s.label} value={String(s.value)} tone={s.tone} />
                      </motion.div>
                    ))}
                  </motion.div>
                  {/* Step 3 — deep-link CTAs */}
                  <motion.div
                    variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                    transition={PRESET.fadeUp}
                  >
                    <Link
                      href="/operations"
                      className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-white/75 hover:border-orange-500/40 hover:bg-orange-500/[.06] hover:text-white"
                    >
                      Inspect the rollout in the working control plane
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </motion.div>
                  <motion.div
                    variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                    transition={PRESET.fadeUp}
                  >
                    <Link
                      href="/engineering"
                      className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-white/75 hover:border-orange-500/40 hover:bg-orange-500/[.06] hover:text-white"
                    >
                      See the full outbox + audit trail
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-5 flex h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 text-center"
                >
                  <Server className="h-6 w-6 text-white/35" />
                  <p className="mt-3 text-sm text-white/55">Press <span className="text-orange-200">Run the rollout</span> to see the engine respond.</p>
                  <p className="mt-1 text-[11px] text-white/35">
                    The response below will be the real BatchSummary returned by the backend.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
  const ring =
    tone === "green"
      ? "border-emerald-500/30 text-emerald-200"
      : tone === "amber"
        ? "border-amber-500/30 text-amber-200"
        : tone === "red"
          ? "border-rose-500/30 text-rose-200"
          : "border-white/10 text-white";
  return (
    <div className={`rounded-xl border ${ring} bg-white/[.025] p-3`}>
      <p className="text-[10px] uppercase tracking-[.22em] text-white/45">{label}</p>
      <p className="mt-1 font-mono text-xl tabular-nums">{value}</p>
    </div>
  );
}

/* ─────────────────────── 5. POST-INGEST PIPELINE ─────────────────────────── */

const PIPELINE = [
  { icon: FileUp, label: "Arrives", body: "POST · CSV · DB pull · same engine entry" },
  { icon: ShieldCheck, label: "Validated", body: "Idempotency key + schema + policy checks" },
  { icon: Database, label: "Outbox", body: "Commit to PostgreSQL in one transaction" },
  { icon: Workflow, label: "Workers", body: "Redis-fanned dispatch · SKIP LOCKED" },
  { icon: Cable, label: "Channels", body: "Shelf label · checkout POS · ecommerce" },
  { icon: GitBranch, label: "Reconciled", body: "Acks compared against canonical" },
  { icon: BadgeCheck, label: "Sealed", body: "Audit row · ack < resolve · causal" },
];

function PostIngestFlow() {
  return (
    <section>
      <ChapterMarker n="04" label="What happens after ingest" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-3xl">
          <Pill tone="orange">The pipeline · always the same</Pill>
          <h2 className="mt-5 text-[clamp(30px,4.5vw,60px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            Seven steps. One audit-grade path.
          </h2>
        </div>
        <div className="relative mt-12 overflow-x-auto">
          <div className="flex min-w-max items-stretch gap-3 pb-3">
            {PIPELINE.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.06, ease: EASE.outQuart }}
                  className="flex w-[180px] flex-col items-center rounded-2xl border border-white/10 bg-white/[.025] p-4 text-center"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/[.08] text-orange-300">
                    <Icon className="h-4.5 w-4.5" size={18} />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-white">{s.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/45">{s.body}</p>
                </motion.div>
              );
            })}
          </div>
          {/* connector line behind on lg */}
          <div className="pointer-events-none absolute inset-x-3 top-[44px] hidden h-px lg:block">
            <div className="h-full bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── 6. HONEST PRODUCTION FRAMING ───────────────── */

function ProductionFraming() {
  return (
    <section>
      <div className="relative mx-auto max-w-[1400px] px-5 py-16 sm:px-8 sm:py-20">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/[.04] via-transparent to-emerald-500/[.04] p-8 sm:p-10">
          <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <Pill tone="sky">Honest framing · prototype vs production</Pill>
              <h3 className="mt-5 text-[clamp(26px,3.5vw,44px)] font-semibold leading-snug tracking-[-0.015em] text-white">
                The prototype shows the engine.
                <br />
                A real deployment would plug into approved retailer connectors.
              </h3>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
                Production integration would require secure, scoped access to retailer or BetterBasket
                source-of-truth data — not the simulated sample dataset used here. The engine
                evaluates whatever it receives the same way, but no private data is read or written
                by the prototype today.
              </p>
            </div>
            <ul className="space-y-2">
              {[
                { icon: Lock, label: "Scoped credentials per integration" },
                { icon: ShieldCheck, label: "Read-only by default" },
                { icon: BadgeCheck, label: "Every read + write audit-logged" },
                { icon: Cable, label: "Retailer-specific connector adapters" },
              ].map((row, i) => {
                const Icon = row.icon;
                return (
                  <motion.li
                    key={row.label}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.5, delay: i * 0.06, ease: EASE.outQuart }}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-white/80"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[.04] text-sky-200">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {row.label}
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── 7. CLOSING BRIDGE ─────────────────────────── */

function ClosingCta() {
  return (
    <section className="relative mx-auto max-w-[1400px] px-5 pb-28 pt-12 sm:px-8 sm:pb-32">
      <div className="relative overflow-hidden rounded-[32px] border border-violet-500/25 bg-gradient-to-br from-violet-500/[.06] via-transparent to-orange-500/[.06]">
        <div className="relative grid items-center gap-10 px-8 py-16 sm:px-14 sm:py-20 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <Pill tone="purple">Ready to feed it</Pill>
            <h3 className="mt-5 text-[clamp(28px,4vw,64px)] font-semibold leading-[1.04] tracking-[-0.02em] text-white">
              Same engine.
              <br />
              <span className="bg-gradient-to-r from-violet-200 via-sky-200 to-orange-200 bg-clip-text text-transparent">
                Any data shape that fits the contract.
              </span>
            </h3>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
              The working surfaces are real APIs — go build a scenario, watch the rollout, inspect
              the trace.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <MagneticLink href="/scenarios" variant="primary">
                Build a scenario <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </MagneticLink>
              <MagneticLink href="/operations" variant="ghost">
                Live Operations <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </MagneticLink>
              <MagneticLink href="/vision/futures" variant="quiet">
                Where it could go <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
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
            <p className="text-[10px] tracking-[.2em] text-orange-300 uppercase">Endpoint sample</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/55 p-3 font-mono text-[10.5px] leading-relaxed text-emerald-300/90">
{`POST /api/v1/price-batches
Content-Type: application/json
X-API-Key: op-key-…
{
  "idempotency_key": "memorial-day-…",
  "external_id": "MD-DAL-02",
  "zone": "Dallas Zone 2",
  "store_ids": ["214","302","317","401"],
  "actions": [ {"sku":"egg-12","approved_price":4.19,…} ]
}`}
            </pre>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* helper: Link must be a real Next.js Link for prefetch behaviour. */
import Link from "next/link";

/* ─────────────────────────────────── PAGE ─────────────────────────────────── */

export default function ConnectPage() {
  const liveRef = useRef<HTMLDivElement>(null);
  return (
    <div className="relative bg-[#04070b]">
      <FilmGrain id="connect" />
      <Hero onLive={() => liveRef.current?.scrollIntoView({ behavior: "smooth" })} />
      <DataFields />
      <IntegrationPaths />
      <LiveDemoSection liveRef={liveRef} />
      <PostIngestFlow />
      <ProductionFraming />
      <ClosingCta />
    </div>
  );
}
