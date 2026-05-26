"use client";

/**
 * Root-level error boundary. Catches any uncaught render error in a
 * route segment so the founder never sees Next.js's red default screen.
 *
 * The copy is intentionally calm and operational — same voice as the
 * platform itself ("the engine caught X, here's what you can do") —
 * rather than apologetic. There's a Retry that re-mounts the segment
 * and a Reset that hard-reloads the route.
 */

import { useEffect } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, RotateCcw, Activity, ArrowRight } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reduced = useReducedMotion();

  // Surface for telemetry. In production, this is where we'd page a
  // proper error-tracking client (Sentry, Datadog, etc.).
  useEffect(() => {
    console.error("[shelftrace] render error:", error);
  }, [error]);

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#040608] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_15%,rgba(244,63,94,.14),transparent_55%),radial-gradient(ellipse_at_85%_85%,rgba(245,158,11,.10),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-500/40 to-transparent" />

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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/35 bg-rose-500/[.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200">
          <AlertTriangle className="h-3 w-3" /> Surface unavailable
        </span>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-3xl">
          <motion.span
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/[.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-200"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            Render error
          </motion.span>
          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 text-[clamp(40px,7vw,88px)] font-semibold leading-[1.0] tracking-[-0.03em] text-white"
          >
            This surface hit
            <br />
            <span className="bg-gradient-to-r from-rose-300 via-rose-400 to-orange-300 bg-clip-text text-transparent">
              something it could not render.
            </span>
          </motion.h1>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-7 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg"
          >
            The control plane itself is fine — the rest of the platform is still operational.
            Try the page again, or jump to a known-good surface below.
          </motion.p>

          {error?.digest && (
            <p className="mt-4 font-mono text-[11px] text-white/35">
              digest <span className="text-white/55">{error.digest}</span>
            </p>
          )}

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <button
              type="button"
              onClick={reset}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#040608] transition hover:bg-orange-50"
            >
              <RotateCcw className="h-4 w-4 transition group-hover:-rotate-12" />
              Retry this surface
            </button>
            <Link
              href="/operations"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[.04] px-6 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/10"
            >
              Open Working Platform
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/vision/keynote"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.02] px-6 py-3 text-sm text-slate-300 transition hover:bg-white/[.06]"
            >
              Back to keynote
            </Link>
          </motion.div>
        </div>
      </div>

      <footer className="relative z-10 px-6 py-6 text-[11px] text-white/40 sm:px-10">
        ShelfTrace · reliability layer for grocery price execution
      </footer>
    </main>
  );
}
