/**
 * Motion tokens — the canonical animation language for ShelfTrace.
 *
 * Why: previously every Framer Motion `transition={{ duration: 0.6 }}` was
 * picked ad-hoc, so entrances and exits felt inconsistent and the page didn't
 * have a "voice." These tokens give every motion call site a single named
 * answer to "what easing / how long?" — exactly how Linear, Vercel and Emil's
 * libraries (sonner, vaul) feel as cohesive as they do.
 *
 * Two families:
 *   • EASE   — cubic-bezier tuples for time-based motion (entrances, fades).
 *   • SPRING — physics-based motion for gestures, hover-follow, drag.
 *
 * Rule of thumb: use a SPRING any time something responds to user input
 * (drag, hover, cursor). Use EASE for autonomous reveals (scroll, mount).
 */

import type { Easing, Transition } from "framer-motion";

/* ─────────────────────────────── EASES ──────────────────────────────────── */
/* All values are cubic-bezier tuples that Framer Motion accepts as
 * `ease: [x1, y1, x2, y2]`. Names follow easings.net conventions so they're
 * memorable.                                                                 */

export const EASE = {
  /** Apple/Linear-style decel. Default for hero + element entrances. */
  outQuart: [0.16, 1, 0.3, 1] as Easing,
  /** Snappier decel for in-view fade-ups. */
  outExpo: [0.19, 1, 0.22, 1] as Easing,
  /** Standard ease-out for less-prominent reveals. */
  outCubic: [0.33, 1, 0.68, 1] as Easing,
  /** Quick accel for exits / dismissals. Never use for entrances. */
  inQuart: [0.5, 0, 0.75, 0] as Easing,
  /** Symmetric — only for indeterminate loops (marquee, scan laser). */
  linear: "linear" as const,
} as const;

/* ─────────────────────────────── SPRINGS ────────────────────────────────── */
/* Springs are physics objects: stiffness controls how aggressive the pull,
 * damping how quickly oscillation settles. These three cover everything we
 * need.                                                                      */

export const SPRING = {
  /** Cursor follow, tablet tilt — calm and confident, no oscillation. */
  gentle: { type: "spring", stiffness: 80, damping: 18 } as Transition,
  /** Drag release (scrubber handle, drawer settle). Slight overshoot. */
  bouncy: { type: "spring", stiffness: 220, damping: 24 } as Transition,
  /** Snappy panel slide (inspector drawer, mobile sheet). */
  snappy: { type: "spring", stiffness: 280, damping: 28 } as Transition,
} as const;

/* ─────────────────────────────── DURATIONS ──────────────────────────────── */
/* Time scale in seconds. Use these named durations so we never write a magic
 * number in a transition object again.                                       */

export const DUR = {
  /** Tooltip exit, micro-feedback. */
  instant: 0.08,
  /** Tooltip enter, button press feedback. */
  fast: 0.12,
  /** Hover scale, small reveals. */
  brisk: 0.22,
  /** Standard element fade-up. */
  base: 0.45,
  /** Section reveal on scroll. */
  reveal: 0.7,
  /** Hero entrance cascade. */
  hero: 1.05,
} as const;

/* ─────────────────────────────── PRESETS ────────────────────────────────── */
/* High-level recipes for the call sites that repeat across pages. Use these
 * by spreading `{...PRESET.heroEntrance}` into a `transition={...}` prop.    */

export const PRESET = {
  /** Top-of-fold H1 + lede cascade. Combine with `delay` per element. */
  heroEntrance: { duration: DUR.hero, ease: EASE.outQuart } satisfies Transition,
  /** Element fading up into view on scroll. */
  fadeUp: { duration: DUR.reveal, ease: EASE.outQuart } satisfies Transition,
  /** Element fading out. Always faster than its entrance. */
  fadeOut: { duration: DUR.brisk, ease: EASE.inQuart } satisfies Transition,
  /** Tooltip — asymmetric, exit must be faster than enter. */
  tooltipIn: { duration: DUR.fast, ease: EASE.outCubic } satisfies Transition,
  tooltipOut: { duration: DUR.instant, ease: EASE.inQuart } satisfies Transition,
  /** Chapter card / inline marker entrance. */
  chapterMarker: { duration: DUR.reveal, ease: EASE.outQuart, delay: 0.05 } satisfies Transition,
} as const;

/* ─────────────────────────── INITIAL/ANIMATE PAIRS ──────────────────────── */
/* Spread these to skip writing identical `initial`/`animate` props.          */

export const MOTION_VARIANTS = {
  fadeUp: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
  },
  fadeUpLarge: {
    initial: { opacity: 0, y: 26 },
    animate: { opacity: 1, y: 0 },
  },
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
  },
  /** For drawer / sheet entries from the right. */
  slideInRight: {
    initial: { opacity: 0, x: 28 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 28 },
  },
} as const;
