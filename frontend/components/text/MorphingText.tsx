"use client";

/**
 * MorphingText — gooey blur-threshold morph between strings.
 *
 * Adapted from the public liquid-text snippet. Cycles through `texts` with
 * an SVG threshold filter that creates a "blob morph" feel. Cheap on GPU
 * (single filter pass, no canvas).
 *
 * In ShelfTrace, used by the Keynote `NightClosing` sign-off to morph
 * through the four pillar verbs.
 *
 * Honors prefers-reduced-motion: if reduced, just shows the first text.
 */

import { useCallback, useEffect, useRef } from "react";
import clsx from "clsx";

const MORPH_TIME = 1.5;
const COOLDOWN_TIME = 0.5;

function useMorphingText(texts: string[], enabled: boolean) {
  const textIndexRef = useRef(0);
  const morphRef = useRef(0);
  const cooldownRef = useRef(0);
  const timeRef = useRef<number>(0);

  const text1Ref = useRef<HTMLSpanElement>(null);
  const text2Ref = useRef<HTMLSpanElement>(null);

  const setStyles = useCallback(
    (fraction: number) => {
      const a = text1Ref.current;
      const b = text2Ref.current;
      if (!a || !b || !texts || texts.length === 0) return;

      b.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
      b.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;

      const inv = 1 - fraction;
      a.style.filter = `blur(${Math.min(8 / inv - 8, 100)}px)`;
      a.style.opacity = `${Math.pow(inv, 0.4) * 100}%`;

      a.textContent = texts[textIndexRef.current % texts.length];
      b.textContent = texts[(textIndexRef.current + 1) % texts.length];
    },
    [texts],
  );

  const doMorph = useCallback(() => {
    morphRef.current -= cooldownRef.current;
    cooldownRef.current = 0;
    let f = morphRef.current / MORPH_TIME;
    if (f > 1) {
      cooldownRef.current = COOLDOWN_TIME;
      f = 1;
    }
    setStyles(f);
    if (f === 1) textIndexRef.current++;
  }, [setStyles]);

  const doCooldown = useCallback(() => {
    morphRef.current = 0;
    const a = text1Ref.current;
    const b = text2Ref.current;
    if (a && b) {
      b.style.filter = "none";
      b.style.opacity = "100%";
      a.style.filter = "none";
      a.style.opacity = "0%";
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Reduced-motion / disabled: just paint the first string statically.
      if (text1Ref.current && text2Ref.current && texts.length > 0) {
        text1Ref.current.textContent = texts[0];
        text2Ref.current.textContent = "";
        text1Ref.current.style.opacity = "100%";
        text1Ref.current.style.filter = "none";
        text2Ref.current.style.opacity = "0%";
      }
      return;
    }

    let raf: number;
    timeRef.current = performance.now();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = (now - timeRef.current) / 1000;
      timeRef.current = now;
      cooldownRef.current -= dt;
      morphRef.current += dt;
      if (cooldownRef.current <= 0) doMorph();
      else doCooldown();
    };
    animate();
    return () => cancelAnimationFrame(raf);
  }, [doMorph, doCooldown, enabled, texts]);

  return { text1Ref, text2Ref };
}

export interface MorphingTextProps {
  texts: string[];
  className?: string;
}

function Texts({ texts, enabled }: { texts: string[]; enabled: boolean }) {
  const { text1Ref, text2Ref } = useMorphingText(texts, enabled);
  return (
    <>
      <span
        className="absolute inset-x-0 top-0 m-auto inline-block w-full"
        ref={text1Ref}
      />
      <span
        className="absolute inset-x-0 top-0 m-auto inline-block w-full"
        ref={text2Ref}
      />
    </>
  );
}

function SvgFilter() {
  return (
    <svg
      aria-hidden
      className="absolute h-0 w-0"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <filter id="shelftrace-morph-threshold">
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 255 -140"
          />
        </filter>
      </defs>
    </svg>
  );
}

export function MorphingText({ texts, className }: MorphingTextProps) {
  // Honor reduced motion at module level. SSR-safe: defaults to enabled,
  // gets corrected on first client paint.
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div
      className={clsx(
        "relative mx-auto h-16 w-full max-w-screen-md text-center font-sans text-[40pt] font-bold leading-none [filter:url(#shelftrace-morph-threshold)_blur(0.6px)] md:h-24 lg:text-[6rem]",
        className,
      )}
    >
      <Texts texts={texts} enabled={!reduced} />
      <SvgFilter />
    </div>
  );
}
