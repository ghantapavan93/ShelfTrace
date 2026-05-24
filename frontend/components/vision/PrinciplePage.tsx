"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Brain,
  Compass,
  Eye,
  Footprints,
  Gauge,
  Hand,
  HandHelping,
  History,
  Lock,
  PencilLine,
  ShieldCheck,
  ShieldQuestion,
  SignpostBig,
  Slash,
  TrendingDown,
  TriangleAlert,
  UserCheck,
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
   /vision/principle — "It guides. It does not act alone."
   The positioning page. Frames ShelfTrace as a control system + safety layer
   for approved pricing decisions, not an autonomous agent. Humans keep the
   final approval — every claim verifiable against the working repo.
   ──────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────── 1. HERO ─────────────────────────────────── */

function Hero({ onScroll }: { onScroll: () => void }) {
  const reduced = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [reduced ? 1 : 1.06, reduced ? 1 : 1.18]);
  const overlay = useTransform(scrollYProgress, [0, 1], [0.65, 0.92]);

  return (
    <section ref={heroRef} className="relative isolate h-[100vh] min-h-[720px] w-full overflow-hidden">
      <div className="absolute inset-0 bg-[#04070b]" />
      <motion.div style={{ scale }} className="absolute inset-0">
        <CinePhoto src={PHOTOS.store} alt="" />
      </motion.div>
      <motion.div
        style={{ opacity: overlay }}
        className="absolute inset-0 bg-gradient-to-b from-[#04070b]/65 via-[#04070b]/60 to-[#04070b]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(56,189,248,.14),transparent_55%),radial-gradient(ellipse_at_20%_-10%,rgba(34,197,94,.10),transparent_55%)]" />
      <Particles count={20} color="rgba(186,230,253,.45)" />

      <div className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-end px-5 pb-24 sm:px-8 sm:pb-32">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
          className="flex flex-wrap items-center gap-2"
        >
          <Pill tone="sky">Positioning · how ShelfTrace fits</Pill>
          <Pill tone="neutral">Smart guide · not an autonomous agent</Pill>
        </motion.div>
        <motion.h1
          initial={reduced ? false : MOTION_VARIANTS.fadeUpLarge.initial}
          animate={MOTION_VARIANTS.fadeUpLarge.animate}
          transition={{ ...PRESET.heroEntrance, delay: 0.15 }}
          className="mt-8 max-w-[24ch] text-[clamp(44px,7.5vw,120px)] font-semibold leading-[0.96] tracking-[-0.03em] text-white"
        >
          It guides.
          <br />
          <span className="bg-gradient-to-r from-sky-200 via-emerald-200 to-emerald-300 bg-clip-text text-transparent">
            It does not act alone.
          </span>
        </motion.h1>
        <motion.p
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5 }}
          className="mt-7 max-w-2xl text-lg leading-relaxed text-white/70"
        >
          ShelfTrace is a control system for approved retail price execution. It evaluates risk,
          highlights problems, remembers policy and supports approvals — but humans keep the final
          action. A safety layer that does not interfere with normal operation, until it has to.
        </motion.p>
        <motion.div
          initial={reduced ? false : MOTION_VARIANTS.fadeUp.initial}
          animate={MOTION_VARIANTS.fadeUp.animate}
          transition={{ ...PRESET.fadeUp, delay: 0.65 }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <MagneticButton onClick={onScroll} variant="primary">
            See the six things it does <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </MagneticButton>
          <MagneticLink href="/operations" variant="ghost">
            Open Working Platform <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </MagneticLink>
          <MagneticLink href="/vision/keynote" variant="quiet">
            Keynote story <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </MagneticLink>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── 2. SIX THINGS IT DOES ──────────────────── */

const SIX_THINGS = [
  {
    icon: Compass,
    title: "Guides decisions",
    body: "Shows the canonical price, the channels in agreement, and the channel that disagreed — so the operator decides with full context, not in the dark.",
  },
  {
    icon: ShieldQuestion,
    title: "Evaluates risk",
    body: "Every approved price flows through the same engine: canary stores first, every channel reconciled, expansion gated on verified state.",
  },
  {
    icon: History,
    title: "Remembers policy decisions",
    body: "Every retry, acknowledgement, reconciliation and resolution lands in an immutable audit trail with preserved causal ordering.",
  },
  {
    icon: TriangleAlert,
    title: "Highlights problems",
    body: "A POS that returned the wrong price opens a critical incident the moment it's observed — before a shopper rings it twice.",
  },
  {
    icon: HandHelping,
    title: "Supports approvals",
    body: "Operators retry, roll back, resolve, or escalate to a store task. The system enforces the rule that resolution requires acknowledgement.",
  },
  {
    icon: UserCheck,
    title: "Humans stay in control",
    body: "Expansion to the rest of the zone is never automatic when shopper-facing prices disagree. The operator presses Expand. Always.",
  },
];

function SixThings({ anchorRef }: { anchorRef: React.RefObject<HTMLDivElement> }) {
  return (
    <section ref={anchorRef} className="scroll-mt-12">
      <ChapterMarker n="01" label="What it actually does" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-24 sm:px-8 sm:py-28">
        <div className="max-w-3xl">
          <Pill tone="orange">Six things, every time</Pill>
          <h2 className="mt-5 text-[clamp(32px,5vw,64px)] font-semibold leading-[1.04] tracking-[-0.02em] text-white">
            A control system, not a decision-maker.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55">
            Each row maps to working code in the repo. None of these are aspirational — they're
            what the 47-test engine already does, every batch.
          </p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SIX_THINGS.map((t, i) => {
            const Icon = t.icon;
            return (
              <motion.div
                key={t.title}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.65, delay: i * 0.06, ease: EASE.outQuart }}
                whileHover={{ y: -3 }}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[.04] to-transparent p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[.04] text-sky-300 transition-colors duration-300 group-hover:text-orange-300">
                    <Icon className="h-4.5 w-4.5" size={18} />
                  </span>
                  <span className="font-mono text-[10px] tracking-[.22em] text-white/30 uppercase">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <p className="mt-5 text-lg font-semibold leading-snug text-white">{t.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{t.body}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── 3. SEATBELT MOMENT ─────────────────────── */

function SeatbeltMoment() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const beltY = useTransform(scrollYProgress, [0, 1], reduced ? ["0%", "0%"] : ["-30%", "30%"]);
  const beltOpacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0]);

  return (
    <section ref={ref} className="relative isolate overflow-hidden border-y border-white/[.06]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(34,197,94,.06),transparent_55%),linear-gradient(180deg,#06090f,#04070b)]" />
      {/* the "seatbelt" line — abstract, just a tilted accent */}
      <motion.div
        style={{ y: beltY, opacity: beltOpacity }}
        className="pointer-events-none absolute -right-32 top-1/2 h-[140%] w-[2px] -translate-y-1/2 rotate-[18deg] bg-gradient-to-b from-transparent via-orange-400/55 to-transparent shadow-[0_0_60px_rgba(251,146,60,.3)]"
      />
      <Particles count={10} color="rgba(254,215,170,.4)" />

      <div className="relative mx-auto max-w-[1400px] px-5 py-28 sm:px-8 sm:py-40">
        <div className="max-w-3xl">
          <Pill tone="green">The seatbelt</Pill>
          <h2 className="mt-5 text-[clamp(34px,5.5vw,80px)] font-semibold leading-[1.02] tracking-[-0.025em] text-white">
            Safety that does not slow you down.
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-orange-300 to-rose-300 bg-clip-text text-transparent">
              Until it has to.
            </span>
          </h2>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-white/65">
            A seatbelt does not interfere with normal driving. It becomes extremely valuable when
            something unexpected happens. ShelfTrace works the same way: safe, common decisions pass
            through predefined checks at full speed; unusual cases are flagged, blocked, or routed to
            a human. Most rollouts feel like nothing changed. The ones that needed catching get
            caught.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── 4. WHAT ONE BAD DECISION COSTS ─────────── */

const RISKS = [
  { icon: TrendingDown, label: "Shoppers charged the wrong price at checkout" },
  { icon: Slash, label: "Poor or missing substitutions" },
  { icon: Gauge, label: "Margin loss from miscommunicated cost changes" },
  { icon: Eye, label: "Misleading promotional recommendations" },
  { icon: Footprints, label: "Inventory mismatch — shelf says yes, system says no" },
  { icon: ShieldQuestion, label: "Store-manager confusion mid-shift" },
  { icon: Brain, label: "Customer-trust damage when prices feel arbitrary" },
];

function RisksItPrevents() {
  return (
    <section>
      <ChapterMarker n="02" label="What one bad decision costs" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-3xl">
          <Pill tone="red">Why the safety layer exists</Pill>
          <h2 className="mt-5 text-[clamp(30px,4.5vw,56px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            One mis-executed price action can ripple a long way.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/55">
            The cost of a wrong call rarely stops at the register. Each of the below is a real
            failure mode a deterministic execution layer prevents.
          </p>
        </div>
        <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RISKS.map((r, i) => {
            const Icon = r.icon;
            return (
              <motion.li
                key={r.label}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.04, ease: EASE.outQuart }}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-4 transition-colors duration-200 hover:border-rose-500/30 hover:bg-rose-500/[.04]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] text-rose-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm text-white/75">{r.label}</span>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────── 5. FAST LANE / SLOW LANE ───────────────────── */

function FastLaneSlowLane() {
  return (
    <section>
      <ChapterMarker n="03" label="Speed without compromise" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-3xl">
          <Pill tone="orange">Two lanes, one engine</Pill>
          <h2 className="mt-5 text-[clamp(30px,4.5vw,56px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            Safe decisions move fast. Risky ones surface to a human.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/55">
            ShelfTrace doesn't add friction to normal operation. The same engine runs both paths.
          </p>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {/* Fast lane */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.65, ease: EASE.outQuart }}
            className="relative overflow-hidden rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[.06] to-transparent p-7"
          >
            <div className="flex items-center justify-between">
              <Pill tone="green">Fast lane · default</Pill>
              <span className="text-[10px] tracking-[.22em] text-emerald-300/80 uppercase">
                automatic
              </span>
            </div>
            <h3 className="mt-5 text-2xl font-semibold leading-snug text-white">
              All channels agree.
              <br /> Eligible to expand.
            </h3>
            <ol className="mt-6 space-y-3 text-sm text-white/65">
              {[
                "Approved price commits to outbox in one PostgreSQL transaction",
                "Workers dispatch to shelf · POS · ecommerce under SKIP LOCKED",
                "Acknowledgements reconcile against canonical",
                "All channels verified → status: ready_for_expansion",
                "Operator presses Expand · audit trail sealed",
              ].map((line, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-500/[.08] text-[10px] font-semibold text-emerald-200">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </motion.div>
          {/* Slow lane */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.65, delay: 0.1, ease: EASE.outQuart }}
            className="relative overflow-hidden rounded-3xl border border-rose-500/25 bg-gradient-to-br from-rose-500/[.06] to-transparent p-7"
          >
            <div className="flex items-center justify-between">
              <Pill tone="red">Slow lane · escalates</Pill>
              <span className="text-[10px] tracking-[.22em] text-rose-300/80 uppercase">
                operator review
              </span>
            </div>
            <h3 className="mt-5 text-2xl font-semibold leading-snug text-white">
              Channels disagree.
              <br /> Expansion blocked.
            </h3>
            <ol className="mt-6 space-y-3 text-sm text-white/65">
              {[
                "POS reports a different price than the canonical $5.99",
                "Reconciliation detects the gap · critical incident opens",
                "Containment fires · downstream rollout paused · attribution held",
                "Operator inspects, retries the failing channel, or rolls back",
                "Resolution requires acknowledgement · then the lane reopens",
              ].map((line, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rose-500/35 bg-rose-500/[.08] text-[10px] font-semibold text-rose-200">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </motion.div>
        </div>
        <p className="mt-6 max-w-3xl text-center mx-auto text-sm text-white/45">
          Most rollouts run the fast lane end-to-end. The slow lane only opens when a shopper-facing
          channel disagrees. That's the only friction by design.
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────── 6. HUMAN CONTROL SAFEGUARDS ───────────────── */

const HUMAN_CONTROLS = [
  { icon: Hand, label: "Final approval to expand · always" },
  { icon: PencilLine, label: "Policy edits and overrides" },
  { icon: Lock, label: "Role-based access (operator / viewer)" },
  { icon: BadgeCheck, label: "Audit trail · who approved what, when" },
  { icon: SignpostBig, label: "Manual retry · rollback · escalate" },
  { icon: ShieldCheck, label: "Auth-required mutating endpoints" },
];

function HumanControl() {
  return (
    <section>
      <ChapterMarker n="04" label="What humans always control" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <Pill tone="purple">Operator-led, end-to-end</Pill>
            <h2 className="mt-5 text-[clamp(30px,4.5vw,56px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
              The system supports.
              <br />
              <span className="bg-gradient-to-r from-violet-200 to-sky-200 bg-clip-text text-transparent">
                The operator decides.
              </span>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/55">
              ShelfTrace is opinionated about reliability, not about authority. Every irreversible
              action runs through a human's hand — backed by an X-API-Key operator role and an
              audit row recording who pressed the button.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <MagneticLink href="/operations/incidents" variant="ghost">
                See incident controls <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </MagneticLink>
              <MagneticLink href="/engineering" variant="quiet">
                Engineering proof <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </MagneticLink>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {HUMAN_CONTROLS.map((h, i) => {
              const Icon = h.icon;
              return (
                <motion.li
                  key={h.label}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.5, delay: i * 0.05, ease: EASE.outQuart }}
                  whileHover={{ scale: 1.02 }}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-4"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/[.08] text-violet-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm text-white/80">{h.label}</span>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── 7. CLOSING / BRIDGE ───────────────────────── */

function ClosingCta() {
  return (
    <section className="relative mx-auto max-w-[1400px] px-5 pb-28 pt-12 sm:px-8 sm:pb-32">
      <div className="relative overflow-hidden rounded-[32px] border border-sky-500/25 bg-gradient-to-br from-sky-500/[.06] via-transparent to-emerald-500/[.06]">
        <div className="relative grid items-center gap-10 px-8 py-16 sm:px-14 sm:py-20 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <Pill tone="sky">Trust by construction</Pill>
            <h3 className="mt-5 text-[clamp(30px,4.5vw,68px)] font-semibold leading-[1.04] tracking-[-0.02em] text-white">
              A safer way to ship price decisions —
              <br />
              <span className="bg-gradient-to-r from-emerald-200 via-sky-200 to-violet-200 bg-clip-text text-transparent">
                without slowing the team down.
              </span>
            </h3>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
              The system you saw in the Keynote isn't a different category of tool. It is this
              positioning, made real in code — outbox, reconciliation, canary containment,
              audit-verified recovery, 47 PostgreSQL-backed tests.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <MagneticLink href="/operations" variant="primary">
                Open Working Platform <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </MagneticLink>
              <MagneticLink href="/vision/connect" variant="ghost">
                See how data flows in <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </MagneticLink>
              <MagneticLink href="/vision/futures" variant="quiet">
                Product futures <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </MagneticLink>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={SPRING.gentle}
            className="rounded-2xl border border-white/10 bg-[#0b0f18]/90 p-5"
          >
            <p className="text-[10px] tracking-[.2em] text-orange-300 uppercase">Principle</p>
            <p className="mt-3 text-base font-medium leading-snug text-white">
              &ldquo;A control system, not an agent. Speed by default. Safety when it matters.&rdquo;
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

export default function PrinciplePage() {
  const sixRef = useRef<HTMLDivElement>(null);
  return (
    <div className="relative bg-[#04070b]">
      <FilmGrain id="principle" />
      <Hero onScroll={() => sixRef.current?.scrollIntoView({ behavior: "smooth" })} />
      <SixThings anchorRef={sixRef} />
      <SeatbeltMoment />
      <RisksItPrevents />
      <FastLaneSlowLane />
      <HumanControl />
      <ClosingCta />
    </div>
  );
}
