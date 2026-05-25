"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FlaskConical,
  Pause,
  Play,
  ScanBarcode,
} from "lucide-react";
import { BackgroundOrbits, Pill } from "./Shell";

type SignalChapter = "aisle" | "approved" | "checkout" | "recover";

const chapters: Array<{ id: SignalChapter; label: string; title: string; copy: string }> = [
  {
    id: "aisle",
    label: "Aisle",
    title: "Every price decision touches a shopper.",
    copy: "Organic milk moves from a data decision to a shelf label in a real grocery aisle.",
  },
  {
    id: "approved",
    label: "Approved",
    title: "The price action enters the store boundary.",
    copy: "ShelfTrace starts after a price is approved: verifying execution, not deciding strategy.",
  },
  {
    id: "checkout",
    label: "Mismatch",
    title: "The error appears at checkout.",
    copy: "Shelf reads $5.99. Register returns $6.49. Expansion stops before risk spreads.",
  },
  {
    id: "recover",
    label: "Recovered",
    title: "Recovery completes only after proof.",
    copy: "Acknowledgement arrives, reconciliation verifies, and only then can the action expand.",
  },
];

function MilkBottle({ glow = false }: { glow?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      animate={reduced ? undefined : { y: [0, -6, 0] }}
      transition={reduced ? undefined : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      className="relative h-[250px] w-[120px] sm:h-[300px] sm:w-[148px]"
    >
      <div className="absolute left-[46px] top-0 h-7 w-40 -translate-x-1/2 scale-x-[.32] rounded-t-lg bg-emerald-700 shadow-[0_0_20px_rgba(16,185,129,.38)] sm:left-[56px] sm:w-48" />
      <div
        className={`absolute left-[16px] top-7 h-[218px] w-[86px] rounded-t-[26px] rounded-b-[15px] border border-orange-100/25 bg-gradient-to-br from-[#fff5df] via-[#ecd2af] to-[#c29163] shadow-[0_35px_65px_rgba(0,0,0,.45)] sm:left-[20px] sm:h-[265px] sm:w-[104px] sm:rounded-t-[30px] ${
          glow ? "ring-1 ring-orange-400/50" : ""
        }`}
      />
      <div className="absolute left-[25px] top-[112px] flex h-[70px] w-[68px] flex-col items-center justify-center rounded-md border border-emerald-800/35 bg-emerald-950/90 sm:left-[32px] sm:top-[139px] sm:h-[82px] sm:w-[80px]">
        <span className="text-[8px] font-bold text-orange-100 sm:text-[9px]">ORGANIC</span>
        <span className="text-xs font-black text-white sm:text-sm">WHOLE</span>
        <span className="text-xs font-black text-white sm:text-sm">MILK</span>
        <span className="mt-1 text-[7px] text-white/50 sm:text-[8px]">1 GALLON</span>
      </div>
      <div className="absolute left-[100px] top-[92px] h-48 w-[21px] scale-y-[.48] rounded-r-3xl border-y-2 border-r-2 border-orange-100/20 sm:left-[121px] sm:top-[106px] sm:h-60 sm:w-[27px]" />
    </motion.div>
  );
}

function Eggs() {
  return (
    <div className="relative h-[68px] w-[122px] rounded-xl border border-orange-100/18 bg-gradient-to-b from-[#d3b082] to-[#87603b] shadow-2xl sm:h-[86px] sm:w-[168px]">
      <div className="absolute inset-x-3 top-3 rounded-md border border-black/10 bg-[#dfbd91] px-1 py-1.5 text-center text-[7px] font-black tracking-wide text-[#452d1d] sm:inset-x-4 sm:top-4 sm:px-2 sm:py-2 sm:text-[9px]">
        CAGE FREE
        <br />
        LARGE BROWN EGGS
      </div>
    </div>
  );
}

function Berries() {
  return (
    <div className="relative grid h-[78px] w-[110px] grid-cols-4 gap-1 overflow-hidden rounded-xl border border-white/16 bg-white/10 p-2 shadow-2xl backdrop-blur sm:h-[105px] sm:w-[155px]">
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={index}
          className="rounded-full bg-gradient-to-br from-red-400 to-rose-900 shadow-[0_0_8px_rgba(244,63,94,.35)]"
        />
      ))}
      <div className="absolute inset-x-2 bottom-2 rounded bg-orange-50/85 p-1 text-center text-[6px] font-black text-emerald-950 sm:inset-x-4 sm:text-[8px]">
        FRESH STRAWBERRIES
      </div>
    </div>
  );
}

function PriceTag({
  name,
  price,
  state = "ok",
}: {
  name: string;
  price: string;
  state?: "ok" | "error" | "pending";
}) {
  const error = state === "error";
  const pending = state === "pending";
  return (
    <div
      className={`flex min-w-[102px] items-center justify-between rounded-lg border px-2 py-2 backdrop-blur sm:min-w-[124px] sm:px-3 ${
        error
          ? "border-rose-500/40 bg-rose-950/50"
          : pending
            ? "border-orange-500/25 bg-orange-950/30"
            : "border-white/12 bg-black/45"
      }`}
    >
      <div>
        <p className="text-[7px] tracking-[.2em] text-white/36 sm:text-[8px]">{name}</p>
        <p
          className={`text-base font-semibold sm:text-xl ${
            error ? "text-rose-300" : pending ? "text-orange-300" : "text-white"
          }`}
        >
          {price}
        </p>
      </div>
      {error ? (
        <CircleAlert className="h-4 w-4 text-rose-400" />
      ) : (
        <CheckCircle2 className={`h-4 w-4 ${pending ? "text-orange-400" : "text-emerald-400"}`} />
      )}
    </div>
  );
}

function GroceryWorld({ chapter }: { chapter: SignalChapter }) {
  const reduced = useReducedMotion();
  const mismatch = chapter === "checkout";
  const resolved = chapter === "recover";
  const pending = chapter === "aisle";
  return (
    <div className="relative h-full min-h-[560px] overflow-hidden rounded-[30px] border border-white/10 bg-[#090d15] sm:min-h-[610px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_56%_20%,rgba(252,154,55,.13),transparent_35%),linear-gradient(105deg,#090d15,#10161c_52%,#090d15)]" />
      <div className="absolute inset-x-0 top-10 flex gap-5 px-5 opacity-40 sm:gap-9 sm:px-9">
        {[1, 2, 3].map((shelf) => (
          <div
            key={shelf}
            className="h-[230px] flex-1 rounded-lg border border-white/[.06] bg-[repeating-linear-gradient(180deg,rgba(255,255,255,.08)_0px,rgba(255,255,255,.08)_2px,transparent_2px,transparent_47px)] sm:h-[270px]"
          />
        ))}
      </div>
      <div className="absolute bottom-[108px] left-4 right-4 h-4 rounded-t-lg bg-gradient-to-r from-[#362418] via-[#b17745] to-[#362418] sm:bottom-[122px] sm:left-6 sm:right-6" />
      <div className="absolute inset-x-0 bottom-0 h-[108px] bg-gradient-to-b from-[#0c1017] to-[#05070b] sm:h-[122px]" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 900 650" aria-hidden="true">
        <defs>
          <linearGradient id="signal-trail" x1="430" y1="570" x2="800" y2="110">
            <stop stopColor="#fb923c" />
            <stop offset=".5" stopColor="#f97316" />
            <stop offset="1" stopColor={mismatch ? "#fb7185" : "#34d399"} />
          </linearGradient>
        </defs>
        <motion.path
          d="M250 532 C 355 512, 380 452, 442 404 S 526 335, 600 318 S 726 230, 786 152"
          stroke="url(#signal-trail)"
          strokeWidth="4"
          fill="none"
          strokeDasharray="8 12"
          animate={reduced ? undefined : { strokeDashoffset: [100, 0] }}
          transition={reduced ? undefined : { duration: 2.2, repeat: Infinity, ease: "linear" }}
        />
      </svg>
      <div className="absolute bottom-[113px] left-5 flex items-end gap-3 sm:bottom-[127px] sm:left-12 sm:gap-12">
        <Eggs />
        <MilkBottle glow={chapter !== "aisle"} />
        <Berries />
      </div>
      <div className="absolute bottom-5 left-3 flex gap-2 sm:bottom-9 sm:left-10 sm:gap-8">
        <PriceTag name="EGGS" price="$4.19" />
        <PriceTag
          name="MILK"
          price="$5.99"
          state={pending ? "pending" : mismatch ? "error" : "ok"}
        />
        <PriceTag name="BERRIES" price="$2.49" />
      </div>
      <AnimatePresence mode="wait">
        {(chapter === "approved" || chapter === "aisle") && (
          <motion.div
            key="approved"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute right-4 top-4 w-[250px] rounded-2xl border border-orange-500/38 bg-[#151017]/86 p-4 shadow-[0_0_40px_rgba(249,115,22,.2)] backdrop-blur-xl sm:right-8 sm:top-8 sm:w-[280px] sm:p-5"
          >
            <p className="text-[9px] font-semibold tracking-[.23em] text-orange-300">
              APPROVED PRICE ACTION
            </p>
            <p className="mt-3 text-sm font-medium">Organic Whole Milk, 1 Gallon</p>
            <div className="mt-3 flex items-center gap-3 text-2xl font-semibold">
              <span className="text-white/55">$6.49</span>
              <ArrowRight className="h-4 w-4 text-orange-300" />
              <span className="text-emerald-300">$5.99</span>
            </div>
            <p className="mt-3 text-xs text-white/52">
              Reason: Competitive response
              <br />
              Zone: Austin Zone 1
            </p>
          </motion.div>
        )}
        {mismatch && (
          <motion.div
            key="mismatch"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute right-4 top-4 w-[250px] rounded-2xl border border-rose-500/38 bg-[#190e15]/92 p-4 shadow-[0_0_42px_rgba(244,63,94,.2)] backdrop-blur-xl sm:right-8 sm:top-8 sm:w-[280px] sm:p-5"
          >
            <Pill tone="red">Critical mismatch</Pill>
            <p className="mt-4 text-xs text-white/48">CHECKOUT POS CHARGED</p>
            <div className="mt-1 flex items-end justify-between">
              <span className="text-4xl font-semibold text-rose-400">$6.49</span>
              <span className="rounded-full bg-rose-500/15 px-3 py-1 text-sm font-semibold text-rose-300">
                +$0.50
              </span>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[.06] p-3 text-sm text-emerald-200">
              Shelf price: $5.99 ✓
            </div>
          </motion.div>
        )}
        {resolved && (
          <motion.div
            key="resolved"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute right-4 top-4 w-[250px] rounded-2xl border border-emerald-500/30 bg-[#071613]/90 p-4 shadow-[0_0_42px_rgba(16,185,129,.16)] backdrop-blur-xl sm:right-8 sm:top-8 sm:w-[280px] sm:p-5"
          >
            <Pill tone="green">Verified after recovery</Pill>
            <p className="mt-4 text-sm text-white/70">Checkout POS acknowledged</p>
            <p className="mt-1 text-4xl font-semibold text-emerald-300">$5.99</p>
            <p className="mt-3 text-xs text-white/48">Safe for controlled expansion.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StoryStrip({
  icon: Icon,
  title,
  copy,
  status,
}: {
  icon: ElementType;
  title: string;
  copy: string;
  status: string;
}) {
  return (
    <motion.div whileHover={{ y: -4 }} className="rounded-2xl border border-white/10 bg-[#0b0e16]/72 p-5">
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-orange-300" />
        <Pill>{status}</Pill>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/48">{copy}</p>
    </motion.div>
  );
}

export default function SignalPage() {
  const reduced = useReducedMotion();
  const [chapter, setChapter] = useState<SignalChapter>("aisle");
  const [playing, setPlaying] = useState(true);
  const active = chapters.find((item) => item.id === chapter) ?? chapters[0];

  useEffect(() => {
    if (!playing || reduced) return;
    const timer = window.setInterval(() => {
      setChapter((current) => {
        const currentIndex = chapters.findIndex((item) => item.id === current);
        return chapters[(currentIndex + 1) % chapters.length].id;
      });
    }, 5200);
    return () => window.clearInterval(timer);
  }, [playing, reduced]);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative mx-auto max-w-[1580px] px-4 pb-12 pt-6 sm:px-6"
    >
      <BackgroundOrbits />
      <div className="relative mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Pill tone="orange">01 · Signal to Shelf</Pill>
          <Pill>Working story + cinematic layer</Pill>
        </div>
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2 text-xs text-white/65 transition hover:text-white"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? "Pause story" : "Play story"}
        </button>
      </div>
      <div className="relative grid gap-5 xl:grid-cols-[430px_1fr]">
        <div className="flex min-h-[520px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#0b0e16]/82 p-6 sm:min-h-[610px] sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={chapter}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <p className="text-[10px] font-semibold tracking-[.26em] text-orange-400">
                {active.label.toUpperCase()}
              </p>
              <h1 className="mt-6 text-[40px] font-semibold leading-[1.02] tracking-[-.065em] text-white sm:text-[52px]">
                {chapter === "aisle" ? (
                  <>
                    A price is <span className="text-orange-400">not real</span> until every surface{" "}
                    <span className="text-orange-400">agrees.</span>
                  </>
                ) : (
                  active.title
                )}
              </h1>
              <p className="mt-6 max-w-sm text-base leading-7 text-white/60">{active.copy}</p>
            </motion.div>
          </AnimatePresence>
          <div className="mt-8">
            <div className="mb-6 flex flex-wrap gap-2">
              {chapters.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setChapter(item.id);
                    setPlaying(false);
                  }}
                  className={`rounded-full border px-4 py-2 text-xs transition ${
                    chapter === item.id
                      ? "border-orange-500/40 bg-orange-500/12 text-orange-300"
                      : "border-white/10 text-white/45 hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/vision/reliability"
                className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(249,115,22,.28)] transition hover:brightness-110"
              >
                Enter Reliability Theater <ChevronRight className="h-4 w-4" />
              </Link>
              <Link
                href="/scenarios"
                className="rounded-xl border border-white/10 px-5 py-3 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
              >
                Open Working Scenario
              </Link>
            </div>
          </div>
        </div>
        <GroceryWorld chapter={chapter} />
      </div>
      <div className="relative mt-5 grid gap-4 lg:grid-cols-3">
        <StoryStrip
          icon={FlaskConical}
          title="Certification before go-live"
          copy="Test connector failures safely before automated execution is enabled."
          status="Working today"
        />
        <StoryStrip
          icon={ScanBarcode}
          title="The physical moment"
          copy="Make a shelf-versus-checkout mismatch instantly understandable."
          status="Story layer"
        />
        <StoryStrip
          icon={BadgeCheck}
          title="Recovery with proof"
          copy="Resolve only after acknowledgement and reconciliation."
          status="82 tests passed"
        />
      </div>
    </motion.section>
  );
}
