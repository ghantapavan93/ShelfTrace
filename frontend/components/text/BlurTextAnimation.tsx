"use client";

/**
 * BlurTextAnimation — word-by-word blur fade-in for prose.
 *
 * Adapted from a public snippet to fit the ShelfTrace cadence:
 *  - Inline (no fullscreen wrapper) so it slots into existing copy.
 *  - Plays once per viewport entry instead of looping forever — the source
 *    rewinds-and-replays in a loop, which is fine on a marketing splash
 *    but becomes distracting around dense paragraphs of operational copy.
 *  - Honors prefers-reduced-motion (renders the prose flat).
 *
 * Used by:
 *  - /engineering · shared_engine_statement
 *  - /vision/principle lead paragraph
 */

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

interface WordSpec {
  text: string;
  duration: number;
  delay: number;
  blur: number;
  scale: number;
}

interface BlurTextAnimationProps {
  text: string;
  className?: string;
  /** Replay on viewport re-entry. Default: false (one-shot, calmer). */
  loop?: boolean;
  /** ms to wait before replay when loop=true. */
  loopDelay?: number;
  /** Force-disable the animation (e.g. for SSR snapshots or tests). */
  disabled?: boolean;
}

function planWords(text: string): WordSpec[] {
  const parts = text.split(/\s+/).filter(Boolean);
  const total = parts.length;
  return parts.map((word, i) => {
    const progress = i / Math.max(1, total);
    const exponentialDelay = Math.pow(progress, 0.8) * 0.5;
    const baseDelay = i * 0.06;
    const micro = (Math.sin(i * 17.3) - 0.5) * 0.04; // deterministic, SSR-safe
    return {
      text: word,
      duration: 2.0 + Math.cos(i * 0.3) * 0.25,
      delay: baseDelay + exponentialDelay + micro,
      blur: 10 + ((i * 7) % 6),
      scale: 0.94 + Math.sin(i * 0.2) * 0.04,
    };
  });
}

export function BlurTextAnimation({
  text,
  className,
  loop = false,
  loopDelay = 6000,
  disabled = false,
}: BlurTextAnimationProps) {
  const words = useMemo(() => planWords(text), [text]);
  const containerRef = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  const [animating, setAnimating] = useState(false);
  const reducedRef = useRef(false);

  // One-time reduced-motion check (client only).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  // Trigger once the paragraph enters the viewport.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [disabled]);

  // Animation lifecycle.
  useEffect(() => {
    if (!inView || disabled) return;
    if (reducedRef.current) {
      setAnimating(true);
      return;
    }

    const start = window.setTimeout(() => setAnimating(true), 120);
    if (!loop) return () => window.clearTimeout(start);

    const maxTime =
      words.reduce(
        (m, w) => Math.max(m, w.delay + w.duration),
        0,
      ) * 1000;

    const loopTimer = window.setInterval(() => {
      setAnimating(false);
      window.setTimeout(() => setAnimating(true), 200);
    }, maxTime + loopDelay);

    return () => {
      window.clearTimeout(start);
      window.clearInterval(loopTimer);
    };
  }, [inView, disabled, loop, loopDelay, words]);

  // Flat fallback for reduced-motion or disabled.
  if (disabled) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span ref={containerRef} className={clsx("inline", className)}>
      {words.map((w, i) => (
        <span
          key={i}
          className="inline-block will-change-[filter,transform,opacity]"
          style={{
            transitionProperty: "filter, transform, opacity",
            transitionDuration: `${w.duration}s`,
            transitionDelay: `${w.delay}s`,
            transitionTimingFunction:
              "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            opacity: animating ? 1 : 0,
            filter: animating
              ? "blur(0px) brightness(1)"
              : `blur(${w.blur}px) brightness(0.6)`,
            transform: animating
              ? "translateY(0) scale(1)"
              : `translateY(10px) scale(${w.scale})`,
            marginRight: "0.32em",
          }}
        >
          {w.text}
        </span>
      ))}
    </span>
  );
}
