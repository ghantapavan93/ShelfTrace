"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Layers3 } from "lucide-react";
import type { ReactNode } from "react";

export type PageId = "keynote" | "signal" | "theater" | "horizon" | "aisle" | "mission" | "orbit";
export type Tone = "neutral" | "orange" | "green" | "red" | "purple" | "sky";

export const PAGES: { id: PageId; href: string; label: string; number: string }[] = [
  { id: "keynote", href: "/vision/keynote", label: "Keynote", number: "00" },
  { id: "signal", href: "/vision", label: "Signal to Shelf", number: "01" },
  { id: "theater", href: "/vision/reliability", label: "Reliability Theater", number: "02" },
  { id: "horizon", href: "/vision/horizon", label: "Horizon Studio", number: "03" },
  { id: "aisle", href: "/vision/aisle", label: "Aisle Twin", number: "04" },
  { id: "mission", href: "/vision/mission-control", label: "Mission Control", number: "05" },
  { id: "orbit", href: "/vision/orbit", label: "Command Sphere", number: "06" },
];

export function currentPageId(pathname: string): PageId {
  if (pathname.startsWith("/vision/keynote")) return "keynote";
  if (pathname.startsWith("/vision/reliability")) return "theater";
  if (pathname.startsWith("/vision/horizon")) return "horizon";
  if (pathname.startsWith("/vision/aisle")) return "aisle";
  if (pathname.startsWith("/vision/mission-control")) return "mission";
  if (pathname.startsWith("/vision/orbit")) return "orbit";
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

/**
 * Reviewer-facing navigation: deliberately minimal.
 * Only four destinations are surfaced so the visitor stays focused on the
 * Keynote story and the working surfaces it bridges into. Experimental routes
 * (aisle, mission-control, orbit) remain reachable by direct URL but are
 * intentionally not in the nav.
 */
const REVIEWER_NAV: { label: string; href: string; external?: boolean }[] = [
  { label: "Keynote", href: "/vision/keynote" },
  { label: "Working Platform", href: "/operations", external: true },
  { label: "Engineering Proof", href: "/engineering", external: true },
  { label: "Vision Concepts", href: "/vision/horizon" },
];

export function GlobalHeader() {
  const pathname = usePathname();
  return (
    <header className="relative z-30 flex h-[72px] items-center justify-between border-b border-white/[.07] bg-[#070a11]/85 px-4 backdrop-blur-xl sm:px-7">
      <VisionLogo />
      <nav className="hidden items-center gap-1 lg:flex" aria-label="ShelfTrace reviewer navigation">
        {REVIEWER_NAV.map((p) => {
          const active = pathname === p.href || (p.href === "/vision/keynote" && pathname.startsWith("/vision/keynote"));
          return (
            <Link
              key={p.href}
              href={p.href}
              className={`rounded-full px-4 py-2 text-sm transition ${
                active
                  ? "border border-orange-500/30 bg-orange-500/10 text-orange-300"
                  : "text-white/55 hover:text-white"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3">
        <Pill tone="purple">Concept Vision</Pill>
      </div>
    </header>
  );
}

/**
 * ProgressNavigation kept as a function for back-compat but renders nothing.
 * The simplified reviewer nav lives entirely in the header.
 */
export function ProgressNavigation() {
  return null;
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
