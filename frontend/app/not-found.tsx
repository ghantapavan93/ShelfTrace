"use client";

/**
 * Custom 404 — premium, on-brand, recoverable.
 *
 * Matches the vision-page typography language (clamp + tracking) and
 * the operations color palette. The hero line riffs on the product's
 * own copy: "A price is not real until every system agrees" — so an
 * accidental 404 reads as a designed moment, not a system error.
 *
 * Honors prefers-reduced-motion (no animation), and falls back to two
 * useful destinations: the keynote (narrative) and the working
 * platform (operational).
 */

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Activity, Compass } from "lucide-react";

export default function NotFound() {
  const reduced = useReducedMotion();

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#040608] text-white">
      {/* Soft ambient gradients matching the vision pages */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_15%,rgba(251,146,60,.16),transparent_55%),radial-gradient(ellipse_at_10%_85%,rgba(167,139,250,.12),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 shadow-[0_0_20px_rgba(251,146,60,0.4)]">
            <Activity className="h-4 w-4 text-white" />
          </span>
          <span className="leading-none">
            <span className="block text-sm font-bold tracking-tight text-white">ShelfTrace</span>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.22em] text-orange-300">
              Control Plane
            </span>
          </span>
        </Link>
        <span className="hidden items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/[.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200 sm:flex">
          <Compass className="h-3 w-3" /> 404 · off path
        </span>
      </header>

      {/* Hero */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-3xl">
          <motion.span
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
            Page not found
          </motion.span>
          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 text-[clamp(48px,8vw,108px)] font-semibold leading-[0.96] tracking-[-0.03em] text-white"
          >
            This path is not on
            <br />
            <span className="bg-gradient-to-r from-orange-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">
              the rollout map.
            </span>
          </motion.h1>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-7 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg"
          >
            The URL you tried isn't part of the platform — could be a typo, a stale link,
            or a surface that has not been built yet. Try one of the canonical entry points
            below.
          </motion.p>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/vision/keynote"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#040608] transition hover:bg-orange-50"
            >
              Watch the keynote
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/operations"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[.04] px-6 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/10"
            >
              Open Working Platform
            </Link>
            <Link
              href="/scenarios"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.02] px-6 py-3 text-sm text-slate-300 transition hover:bg-white/[.06]"
            >
              Build a scenario
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Footer line — same tone as the rest of the app */}
      <footer className="relative z-10 px-6 py-6 text-[11px] text-white/40 sm:px-10">
        ShelfTrace · reliability layer for grocery price execution
      </footer>
    </main>
  );
}
