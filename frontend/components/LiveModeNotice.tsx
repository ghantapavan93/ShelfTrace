"use client";

/**
 * LiveModeNotice — opt-in banner shown on surfaces that don't yet have
 * a true Live/Demo data boundary, but should still feel intentional in
 * Live mode rather than silently leaking demo data.
 *
 * Two variants:
 *   • "clean-slate" → hides the page body entirely, shows hero+CTAs to
 *     get the user back to a surface that *is* Live-aware. Use when the
 *     underlying data is unambiguously demo-only (markdowns SLA, demo
 *     batch operations).
 *
 *   • "sandbox-strip" → renders inline above the page body to label the
 *     surface as sandbox/demo data in both modes. Use when the surface
 *     is a working tool but its data source isn't yet tenant-scoped
 *     (scrapers, certification, engineering trace).
 *
 * Honest framing throughout: no "coming soon" handwaves — each notice
 * names exactly what's missing (per-tenant scope, real connectors,
 * import provenance) so reviewers know what production needs.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { FlaskConical, ArrowRight, Info } from "lucide-react";
import { EASE } from "@/lib/motion";

interface CleanSlateProps {
  /** Headline shown when this surface is fully blocked in Live mode. */
  title: string;
  /** Why this surface isn't yet live-scoped. Stay specific and honest. */
  body: React.ReactNode;
  /** Primary CTA — usually navigate to a Live-aware surface. */
  primaryHref: string;
  primaryLabel: string;
  /** Optional secondary CTA — usually "go upload data" or "switch mode". */
  secondaryHref?: string;
  secondaryLabel?: string;
}

/** Hide page body. Show a violet hero explaining why Live is empty here. */
export function LiveCleanSlate({
  title,
  body,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: CleanSlateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE.outQuart }}
      className="glass-strong rounded-3xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[.04] via-ink-900 to-black p-7 sm:p-10"
    >
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
          <FlaskConical className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-violet-300">
            Live mode clean slate
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-400">{body}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={primaryHref}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110"
            >
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {secondaryHref && secondaryLabel && (
              <Link
                href={secondaryHref}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[.04] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                {secondaryLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface SandboxStripProps {
  /** What kind of sandbox data is this (e.g. "Certification runs"). */
  surfaceName: string;
  /** What's missing before this surface is Live-scoped. Be specific. */
  missingForLive: React.ReactNode;
}

/** Inline thin strip above the page body — keeps the working surface
 *  visible but labels it honestly. */
export function SandboxStrip({ surfaceName, missingForLive }: SandboxStripProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE.outQuart }}
      className="flex items-start gap-2 rounded-xl border border-violet-500/25 bg-violet-500/[.04] px-3 py-2 text-[12px] text-violet-200"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">
        <span className="font-semibold">{surfaceName}</span>
        <span className="text-violet-300/80"> · sandbox data shown in Live mode.</span>{" "}
        <span className="text-violet-300/70">{missingForLive}</span>
      </div>
    </motion.div>
  );
}
