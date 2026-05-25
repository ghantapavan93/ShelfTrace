"use client";

/**
 * Skeleton — premium loading placeholders for the analysis surfaces.
 *
 * Replaces the old `<div>Loading…</div>` text with proper shimmer that
 * matches the eventual layout. Critical for the Render free-tier cold-
 * start window (~30s) — reviewers see *structure* immediately, not
 * a "is this broken?" blank screen.
 *
 * Honors prefers-reduced-motion: under reduced motion the shimmer
 * collapses to a flat tone (no animated gradient).
 */

import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";

export function SkeletonLine({
  width = "100%",
  height = 12,
  className,
}: {
  width?: string | number;
  height?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-md bg-white/[.04]",
        className,
      )}
      style={{ width, height }}
    >
      {!reduced && (
        <motion.div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[.06] to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </div>
  );
}

export function SkeletonBlock({
  className,
  height = 100,
}: {
  className?: string;
  height?: number | string;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border border-white/[.06] bg-white/[.02]",
        className,
      )}
      style={{ height }}
    >
      {!reduced && (
        <motion.div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[.05] to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.15,
          }}
        />
      )}
    </div>
  );
}

/**
 * Pre-composed skeleton for the /operations Command Center hero +
 * metrics row. Matches the post-load layout so the page feels stable.
 */
export function OperationsSkeleton({
  coldStart = false,
}: {
  coldStart?: boolean;
}) {
  return (
    <div className="space-y-6">
      {coldStart && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/[.06] px-4 py-2.5 text-xs text-violet-200">
          <span className="font-mono">●</span> Waking the free-tier backend
          container — first request takes ~30 s after idle. Subsequent
          navigation will be instant.
        </div>
      )}

      {/* Hero skeleton */}
      <SkeletonBlock height={200} className="rounded-3xl" />

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} height={88} />
        ))}
      </div>

      {/* Critical + side */}
      <div className="grid gap-4 xl:grid-cols-3">
        <SkeletonBlock height={320} className="xl:col-span-2" />
        <div className="space-y-4">
          <SkeletonBlock height={150} />
          <SkeletonBlock height={150} />
        </div>
      </div>
    </div>
  );
}

/** List-shaped skeleton for /incidents, /batches, etc. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} height={72} />
      ))}
    </div>
  );
}

/** Detail-page shaped skeleton (incident detail, batch detail). */
export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SkeletonLine width={240} height={20} />
        <SkeletonLine width={360} height={12} />
      </div>
      <SkeletonBlock height={280} className="rounded-3xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        <SkeletonBlock height={140} />
        <SkeletonBlock height={140} />
        <SkeletonBlock height={140} />
      </div>
      <SkeletonBlock height={200} />
    </div>
  );
}
