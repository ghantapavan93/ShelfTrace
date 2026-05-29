"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import type { ElementType } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  Compass,
  Eye,
  Footprints,
  Gauge,
  HandHelping,
  History,
  ShieldQuestion,
  Slash,
  TrendingDown,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { Pill } from "./Shell";
import {
  Annotation,
  AuditLogStream,
  ChannelAgreementPanel,
  ChapterMarker,
  CinePhoto,
  FilmGrain,
  LanePipe,
  MagneticButton,
  MagneticLink,
  MilkGlyph,
  OperatorActionRow,
  OperatorDashboard,
  Particles,
  PHOTOS,
  ProductCard,
  Stage,
  useCyclePhase,
} from "./cinematic";
import { EASE, MOTION_VARIANTS, PRESET, SPRING } from "@/lib/motion";
import { BlurTextAnimation } from "@/components/text/BlurTextAnimation";
import { BlurRevealHeading } from "@/components/narrative/BlurRevealHeading";

/* ────────────────────────────────────────────────────────────────────────────
   /vision/principle — "It guides. It does not act alone."
   BetterBasket-style numbered story rows for "the six things it does" —
   each row gets a rich animated product/UI mockup on alternating sides.
   Fast-lane / Slow-lane becomes one animated 2-pipe diagram.
   Human-control safeguards become one operator-dashboard mockup.
   Hero · Seatbelt · Risks · Closing unchanged.
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
        <BlurRevealHeading
          text="It guides. It does not act alone."
          emphasis={["does not act alone."]}
          as="h1"
          size="hero"
          delay={0.15}
          stagger={0.08}
          className="mt-8 max-w-[24ch]"
        />
        <motion.p
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5 }}
          className="mt-7 max-w-2xl text-lg leading-relaxed text-white/70"
        >
          <BlurTextAnimation
            text="ShelfTrace is a control system for approved retail price execution. It evaluates risk, highlights problems, remembers policy and supports approvals — but humans keep the final action. A safety layer that does not interfere with normal operation, until it has to."
          />
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

/* ─────────────────────────────── 6 rich visual mockups ─────────────────── */

/* 01 — Guides decisions: product card + 3-channel agreement panel */
function GuidesVisual() {
  return (
    <Stage accent="sky" live liveLabel="LIVE · RECONCILE">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4">
        <ProductCard
          name="Organic Whole Milk"
          units="1 GAL"
          price="$5.99"
          glyph={<MilkGlyph />}
          tone="primary"
          size="lg"
          badge={{ label: "canonical", tone: "primary" }}
        />
        <ChannelAgreementPanel
          live
          channels={[
            { name: "POS", status: "fail" },
            { name: "ESL", status: "ok" },
            { name: "WEB", status: "ok" },
          ]}
        />
      </div>
      <Annotation className="top-6 left-6" delay={0.5} bob={false}>
        <span className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[10px] uppercase tracking-[.22em] text-white/60 backdrop-blur">
          operator sees full context
        </span>
      </Annotation>
      <Annotation className="bottom-6 right-6" delay={0.7}>
        <span className="rounded-full border border-rose-500/40 bg-rose-500/[.10] px-3 py-1 text-[10px] uppercase tracking-[.22em] text-rose-200 backdrop-blur">
          POS disagrees · review
        </span>
      </Annotation>
    </Stage>
  );
}

/* 02 — Evaluates risk: canary verifies live, then the gate decides.
   Live loop (4 phases): verifying → both verified → gate evaluates →
   gate HOLDS expansion (the safety property). Re-runs so it reads as a
   working engine continuously checking, never auto-opening the gate. */
function EvaluatesVisual() {
  const reduced = useReducedMotion();
  const canary = ["Store 214", "Store 302"];
  const expansion = ["Store 317", "Store 401"];
  // phase 0: canary verifying · 1: canary 1 verified · 2: both verified ·
  // 3: gate evaluates + pulses (still holds). Then loops.
  const phase = useCyclePhase(4, 1500, true);
  const verifiedCount = phase === 0 ? 0 : phase === 1 ? 1 : 2;
  const gateActive = phase >= 2; // gate "live-checking" once canary is green
  return (
    <Stage accent="orange" live liveLabel="LIVE · CANARY">
      <div className="absolute inset-0 flex flex-col justify-center px-8">
        <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-[.22em]">
          <span className="text-orange-200">canary corridor · first</span>
          <span className="text-white/45">expansion · after verified</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* canary stores — flip verifying → verified live */}
          <div className="space-y-3">
            {canary.map((s, i) => {
              const isVerified = i < verifiedCount;
              return (
                <motion.div
                  key={s}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 + i * 0.1, ease: EASE.outQuart }}
                  className={`rounded-xl border px-4 py-3 backdrop-blur transition-colors duration-500 ${
                    isVerified
                      ? "border-emerald-500/40 bg-emerald-500/[.07]"
                      : "border-orange-500/40 bg-orange-500/[.06]"
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-[.22em] text-orange-300">canary</p>
                  <p className="mt-1 text-sm font-semibold text-white">{s}</p>
                  {isVerified ? (
                    <p className="mt-1 font-mono text-[10px] text-emerald-300">verified ✓</p>
                  ) : (
                    <p className="mt-1 flex items-center gap-1 font-mono text-[10px] text-amber-300/90">
                      <motion.span
                        className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300"
                        animate={reduced ? undefined : { opacity: [1, 0.2, 1] }}
                        transition={reduced ? undefined : { duration: 0.9, repeat: Infinity }}
                      />
                      verifying…
                    </p>
                  )}
                </motion.div>
              );
            })}
          </div>
          {/* the gate — brightens + emits a checking pulse once canary is green */}
          <div className="relative flex h-[160px] flex-col items-center justify-center">
            <motion.div
              animate={
                reduced
                  ? undefined
                  : gateActive
                    ? { opacity: [0.8, 1, 0.8], scaleY: [1, 1.06, 1] }
                    : { opacity: 0.4 }
              }
              transition={
                reduced ? undefined : { duration: 1.4, repeat: gateActive ? Infinity : 0, ease: "easeInOut" }
              }
              className="h-full w-[3px] bg-gradient-to-b from-orange-400/0 via-orange-400 to-orange-400/0 shadow-[0_0_18px_rgba(251,146,60,.6)]"
            />
            {/* evaluating pulse traveling up the gate */}
            {gateActive && !reduced && (
              <motion.span
                aria-hidden
                className="absolute left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-orange-400/30 blur-md"
                animate={{ top: ["80%", "10%"], opacity: [0, 0.9, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <span className="absolute top-1/2 -translate-y-1/2 rounded-full border border-orange-500/50 bg-[#04070b] px-3 py-1 text-[9px] uppercase tracking-[.22em] text-orange-200">
              {gateActive ? "gate · eval" : "gate"}
            </span>
          </div>
          {/* expansion — stays HELD (the safety property the loop proves) */}
          <div className="space-y-3">
            {expansion.map((s, i) => (
              <motion.div
                key={s}
                initial={{ opacity: 0, x: 10 }}
                whileInView={{ opacity: 0.55, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + i * 0.1, ease: EASE.outQuart }}
                className="rounded-xl border border-white/8 bg-white/[.02] px-4 py-3"
              >
                <p className="text-[10px] uppercase tracking-[.22em] text-white/45">expansion</p>
                <p className="mt-1 text-sm font-semibold text-white/70">{s}</p>
                <p className="mt-1 flex items-center gap-1 font-mono text-[10px] text-amber-300/80">
                  <motion.span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400/70"
                    animate={reduced ? undefined : { opacity: [0.4, 1, 0.4] }}
                    transition={reduced ? undefined : { duration: 1.8, repeat: Infinity, delay: i * 0.3 }}
                  />
                  waiting · held
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </Stage>
  );
}

/* 03 — Remembers policy: rolling audit log */
function RemembersVisual() {
  return (
    <Stage accent="orange" live liveLabel="LIVE · TAIL">
      <div className="absolute inset-x-8 top-1/2 -translate-y-1/2">
        <AuditLogStream
          live
          rows={[
            { t: "T+02.30", event: "incident.open · INC-2147 · drift +$0.50", tone: "err", actor: "system" },
            { t: "T+02.34", event: "containment.hold · downstream paused", tone: "warn", actor: "system" },
            { t: "T+02.71", event: "twin.replay · safe-to-live=true", tone: "ok", actor: "system" },
            { t: "T+02.78", event: "live.retry · pos.ack ok · aligned", tone: "ok", actor: "system" },
            { t: "T+02.84", event: "audit.seal · ack < resolve · sealed", tone: "ok", actor: "Avery Davis" },
            { t: "T+02.91", event: "attribution.release · verified-only", tone: "ok", actor: "system" },
          ]}
        />
      </div>
      <Annotation className="bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap" delay={0.6} bob={false}>
        <span className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[10px] uppercase tracking-[.22em] text-white/65 backdrop-blur">
          every action · microsecond-stamped · ack precedes resolve · always
        </span>
      </Annotation>
    </Stage>
  );
}

/* 04 — Highlights problems: incident card with a live monitoring feel.
   The POS price re-reads (shimmer) and a monitoring dot ticks, so the card
   reads as a system actively watching the drift, not a frozen screenshot. */
function HighlightsVisual() {
  const reduced = useReducedMotion();
  // Tiny live "seconds since surfaced" counter for the in-card monitor line.
  const [secs, setSecs] = useState(reduced ? 3 : 0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setSecs((s) => (s >= 9 ? 2 : s + 1)), 1000);
    return () => clearInterval(id);
  }, [reduced]);
  return (
    <Stage accent="rose" live liveLabel="LIVE · MONITOR" liveTone="rose">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ ...SPRING.bouncy, delay: 0.2 }}
          className="relative w-[340px] rounded-2xl border border-rose-500/50 bg-[#1a0a0e]/95 p-5 backdrop-blur shadow-[0_30px_60px_-20px_rgba(244,63,94,.55)]"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[.22em] text-rose-300">
              <TriangleAlert className="h-3.5 w-3.5" /> critical incident
            </span>
            <span className="font-mono text-[10px] text-rose-300/80">INC-2147</span>
          </div>
          <p className="mt-3 text-base font-semibold text-white">Organic Whole Milk · Aisle 4</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[.06] p-2.5">
              <p className="text-[10px] uppercase tracking-[.18em] text-emerald-200">canonical</p>
              <p className="mt-0.5 font-mono text-base text-emerald-100">$5.99</p>
            </div>
            <div className="relative overflow-hidden rounded-lg border border-rose-500/40 bg-rose-500/[.10] p-2.5">
              <p className="text-[10px] uppercase tracking-[.18em] text-rose-200">POS rang</p>
              <p className="mt-0.5 font-mono text-base text-rose-100">$6.49</p>
              {/* live re-read shimmer sweeping the disagreeing channel */}
              {!reduced && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-rose-300/25 to-transparent"
                  animate={{ left: ["-33%", "133%"] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-white/55">
            <span className="font-medium text-amber-200">Drift +$0.50.</span> Downstream rollout paused
            pending acknowledgement.
          </p>
          {/* live monitor line */}
          <div className="mt-3 flex items-center gap-1.5 border-t border-white/[.06] pt-2.5 font-mono text-[10px] text-rose-300/80">
            <motion.span
              className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400"
              animate={reduced ? undefined : { opacity: [1, 0.2, 1] }}
              transition={reduced ? undefined : { duration: 1, repeat: Infinity }}
            />
            monitoring · drift open {secs}s · re-reading POS…
          </div>
          {!reduced && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute -inset-0.5 rounded-2xl border-2 border-rose-500/50"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </motion.div>
      </div>
      <Annotation className="top-6 right-6" delay={0.7} bob={false}>
        <span className="rounded-full border border-rose-500/30 bg-rose-500/[.10] px-3 py-1 text-[10px] uppercase tracking-[.22em] text-rose-200 backdrop-blur">
          surfaced in seconds · not the weekly recon
        </span>
      </Annotation>
    </Stage>
  );
}

/* 05 — Supports approvals: 3 operator action buttons */
function SupportsVisual() {
  return (
    <Stage accent="emerald" live liveLabel="LIVE · TRIAGE">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px]">
        <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[.22em] text-white/55">
          <span>operator actions · INC-2147</span>
          <span className="font-mono text-emerald-300">awaiting</span>
        </div>
        <OperatorActionRow highlighted={2} />
        <p className="mt-4 text-[11px] text-white/55">
          Resolution requires acknowledgement. The engine will refuse if the channel still disagrees.
        </p>
      </div>
    </Stage>
  );
}

/* 06 — Humans stay in control: dashboard mockup primitive */
function HumansVisual() {
  return <OperatorDashboard />;
}

/* ─────────────────────────────── story row layout ──────────────────────── */

type Thing = {
  icon: ElementType;
  title: string;
  body: string;
  bullets: string[];
  visual: React.ReactNode;
};

const SIX_THINGS: Thing[] = [
  {
    icon: Compass,
    title: "Guides decisions",
    body: "Surfaces the canonical price, which channels agree, and which channel disagreed — so the operator decides with full context, not in the dark.",
    bullets: [
      "Canonical price + 3-channel agreement signal",
      "Disagreeing channel pulses, not buried in a log",
      "Drilldown to source receipt in one click",
    ],
    visual: <GuidesVisual />,
  },
  {
    icon: ShieldQuestion,
    title: "Evaluates risk",
    body: "Every approved price flows through the same engine: canary stores first, every channel reconciled, expansion gated on verified state.",
    bullets: [
      "Canary corridor before any wider rollout",
      "Gate physically blocks expansion until canary verified",
      "No path around it — the schema enforces ordering",
    ],
    visual: <EvaluatesVisual />,
  },
  {
    icon: History,
    title: "Remembers policy decisions",
    body: "Every retry, acknowledgement, reconciliation and resolution lands in an immutable audit trail with preserved causal ordering — ack always precedes resolve.",
    bullets: [
      "Microsecond-stamped event ordering",
      "Tamper-evident · the legal record",
      "Operator name attached to every manual action",
    ],
    visual: <RemembersVisual />,
  },
  {
    icon: TriangleAlert,
    title: "Highlights problems",
    body: "A POS that returns the wrong price opens a critical incident the moment it's observed — before a shopper rings it twice.",
    bullets: [
      "Reconciliation runs on every ack, not on a schedule",
      "Incidents typed by severity (critical · urgent · warning)",
      "Containment fires before downstream stores see the drift",
    ],
    visual: <HighlightsVisual />,
  },
  {
    icon: HandHelping,
    title: "Supports approvals",
    body: "Operators retry, roll back, resolve, or escalate to a store task. The system enforces the rule that resolution requires acknowledgement.",
    bullets: [
      "Four operator paths · all reversible until sealed",
      "Engine refuses to close on a stale view",
      "Two operators on the same incident are serialised by row lock",
    ],
    visual: <SupportsVisual />,
  },
  {
    icon: UserCheck,
    title: "Humans stay in control",
    body: "Expansion to the rest of the zone is never automatic when shopper-facing prices disagree. The operator presses Expand. Always.",
    bullets: [
      "Final approval gates every mutating endpoint",
      "API-key role required for write operations",
      "Audit row captures who pressed the button",
    ],
    visual: <HumansVisual />,
  },
];

function ThingRow({ thing, index }: { thing: Thing; index: number }) {
  const Icon = thing.icon;
  const flip = index % 2 === 1;
  return (
    <section className="relative">
      <div className="relative mx-auto grid max-w-[1400px] gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.3fr] lg:items-center">
        <div className="absolute left-4 top-16 hidden h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#04070b] font-mono text-[11px] font-semibold text-white/55 sm:flex">
          {String(index + 1).padStart(2, "0")}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.7, ease: EASE.outQuart }}
          className={`min-w-0 ${flip ? "lg:order-2" : "lg:order-1"}`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] text-sky-300">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-[10px] uppercase tracking-[.22em] text-sky-300/80">six things · #{index + 1}</span>
          </div>
          <h3 className="mt-5 text-[clamp(26px,3.5vw,46px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            {thing.title}
          </h3>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/65">{thing.body}</p>
          <ul className="mt-6 space-y-2.5">
            {thing.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-white/70">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
                {b}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, delay: 0.1, ease: EASE.outQuart }}
          className={`min-w-0 ${flip ? "lg:order-1" : "lg:order-2"}`}
        >
          {thing.visual}
        </motion.div>
      </div>
      <div className="absolute left-[33px] top-0 h-full w-px bg-gradient-to-b from-transparent via-white/8 to-transparent hidden sm:block" />
    </section>
  );
}

function SixThingsStory({ anchorRef }: { anchorRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div ref={anchorRef} className="scroll-mt-12">
      <ChapterMarker n="01" label="The six things it does" />
      <div className="mx-auto max-w-[1400px] px-5 pt-6 sm:px-8">
        <div className="max-w-3xl">
          <Pill tone="orange">Each row maps to working code</Pill>
          <h2 className="mt-5 text-[clamp(30px,4.5vw,60px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
            A control system, not a decision-maker.
          </h2>
        </div>
      </div>
      {SIX_THINGS.map((t, i) => (
        <ThingRow key={t.title} thing={t} index={i} />
      ))}
    </div>
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

/* ─────────────────────────────── 4. RISKS LIST ─────────────────────────── */

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
                whileHover={{ y: -2 }}
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

/* ─────────────────────────── 5. FAST LANE / SLOW LANE ─────────────────── */

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
            ShelfTrace doesn't add friction to normal operation. The same engine runs both paths —
            visualised below as two pipes, one flowing freely, one stopped at the human-review gate.
          </p>
        </div>
        <div className="mt-12">
          <LanePipe />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── 6. HUMAN CONTROL ──────────────────────────── */

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
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: EASE.outQuart }}
          >
            <OperatorDashboard />
          </motion.div>
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
              audit-verified recovery, PostgreSQL-backed test suite.
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
      <SixThingsStory anchorRef={sixRef} />
      <SeatbeltMoment />
      <RisksItPrevents />
      <FastLaneSlowLane />
      <HumanControl />
      <ClosingCta />
    </div>
  );
}
