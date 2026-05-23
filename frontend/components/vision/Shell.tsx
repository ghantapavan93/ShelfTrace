"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Layers3 } from "lucide-react";
import type { ReactNode } from "react";

export type PageId = "signal" | "theater" | "horizon" | "aisle" | "mission";
export type Tone = "neutral" | "orange" | "green" | "red" | "purple" | "sky";

export const PAGES: { id: PageId; href: string; label: string; number: string }[] = [
  { id: "signal", href: "/vision", label: "Signal to Shelf", number: "01" },
  { id: "theater", href: "/vision/reliability", label: "Reliability Theater", number: "02" },
  { id: "horizon", href: "/vision/horizon", label: "Horizon Studio", number: "03" },
  { id: "aisle", href: "/vision/aisle", label: "Aisle Twin", number: "04" },
  { id: "mission", href: "/vision/mission-control", label: "Mission Control", number: "05" },
];

export function currentPageId(pathname: string): PageId {
  if (pathname.startsWith("/vision/reliability")) return "theater";
  if (pathname.startsWith("/vision/horizon")) return "horizon";
  if (pathname.startsWith("/vision/aisle")) return "aisle";
  if (pathname.startsWith("/vision/mission-control")) return "mission";
  return "signal";
}

const toneClasses: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/[.04] text-white/58",
  orange: "border-orange-500/32 bg-orange-500/10 text-orange-300",
  green: "border-emerald-500/28 bg-emerald-500/[.08] text-emerald-300",
  red: "border-rose-500/30 bg-rose-500/[.09] text-rose-300",
  purple: "border-violet-400/25 bg-violet-400/[.08] text-violet-200",
  sky: "border-sky-400/25 bg-sky-400/[.08] text-sky-200",
};

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[9px] font-semibold uppercase tracking-[.2em] ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

export function VisionLogo() {
  return (
    <Link href="/vision" className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 shadow-[0_0_28px_rgba(249,115,22,.3)]">
        <Layers3 className="h-5 w-5 text-white" />
      </div>
      <div>
        <div className="text-lg font-semibold tracking-tight text-white">ShelfTrace</div>
        <div className="text-[9px] font-bold tracking-[.22em] text-orange-400">RELIABILITY CONTROL PLANE</div>
      </div>
    </Link>
  );
}

export function BackgroundOrbits({ variant = "orange" }: { variant?: "orange" | "red" | "violet" }) {
  const reduced = useReducedMotion();
  const color =
    variant === "red"
      ? "rgba(244,63,94,.16)"
      : variant === "violet"
        ? "rgba(139,92,246,.15)"
        : "rgba(249,115,22,.16)";
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        animate={reduced ? undefined : { rotate: 360 }}
        transition={reduced ? undefined : { duration: 32, repeat: Infinity, ease: "linear" }}
        className="absolute -right-32 top-20 h-[560px] w-[560px] rounded-full border border-white/[.04]"
        style={{ boxShadow: `inset 0 0 100px ${color}` }}
      />
      <motion.div
        animate={reduced ? undefined : { rotate: -360 }}
        transition={reduced ? undefined : { duration: 42, repeat: Infinity, ease: "linear" }}
        className="absolute -left-56 bottom-0 h-[520px] w-[520px] rounded-full border border-orange-400/[.06]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:64px_64px] opacity-30" />
    </div>
  );
}

export function GlobalHeader() {
  const pathname = usePathname();
  const page = currentPageId(pathname);
  return (
    <header className="relative z-30 flex h-[72px] items-center justify-between border-b border-white/[.07] bg-[#070a11]/85 px-4 backdrop-blur-xl sm:px-7">
      <VisionLogo />
      <nav className="hidden items-center gap-2 lg:flex" aria-label="Vision Studio pages">
        {PAGES.map((p) => (
          <Link
            key={p.id}
            href={p.href}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
              page === p.id
                ? "border border-orange-500/30 bg-orange-500/10 text-orange-300"
                : "text-white/52 hover:text-white"
            }`}
          >
            <span className="text-[10px] text-white/32">{p.number}</span>
            {p.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <Pill tone="purple">Concept Vision</Pill>
        <Link
          href="/operations"
          className="hidden rounded-xl border border-white/10 bg-white/[.04] px-4 py-2 text-xs text-white/70 transition hover:text-white md:block"
        >
          Open Working Platform
        </Link>
      </div>
    </header>
  );
}

export function ProgressNavigation() {
  const pathname = usePathname();
  const page = currentPageId(pathname);
  return (
    <nav
      aria-label="Vision Studio progress"
      className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#090d15]/88 p-2 shadow-2xl backdrop-blur-xl sm:bottom-7"
    >
      {PAGES.map((p, index) => (
        <Link
          key={p.id}
          href={p.href}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-medium transition ${
            page === p.id
              ? "bg-orange-500 text-white shadow-[0_0_20px_rgba(249,115,22,.3)]"
              : "text-white/45 hover:text-white"
          }`}
        >
          <span>{index + 1}</span>
          <span className="hidden sm:inline">{p.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function VisionFooter() {
  return (
    <footer className="relative mx-auto max-w-[1580px] px-4 pb-32 pt-2 sm:px-6">
      <p className="text-center text-[11px] leading-relaxed text-white/35">
        <span className="font-semibold text-white/45">Interactive concept vision · Working platform linked throughout.</span>{" "}
        Independent concept inspired by public grocery pricing workflows. Working ShelfTrace modules use sample data and
        simulated integrations. Future concepts shown are exploratory only.
      </p>
    </footer>
  );
}
