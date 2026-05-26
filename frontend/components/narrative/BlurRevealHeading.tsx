"use client";

/**
 * BlurRevealHeading — premium typography motion for hero statements
 * and major section headers across the vision narrative pages.
 *
 * Borrows the blur-to-sharp language already in keynote
 * (VaporizeTextCycle / BlurTextAnimation) and exposes it as a single
 * deterministic word-level animation: each word fades + de-blurs in
 * sequence, with optional emphasis words that receive a stronger
 * scale / gradient / highlight at the end of the cascade.
 *
 * Honors prefers-reduced-motion — renders semantic markup with no
 * transforms, preserving page integrity for assistive tech.
 *
 * Usage:
 *   <BlurRevealHeading
 *     text="A price is not real until every system agrees."
 *     emphasis={["price", "real", "every system agrees"]}
 *     as="h1"
 *     size="hero"
 *   />
 */

import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { EASE } from "@/lib/motion";

type HeadingTag = "h1" | "h2" | "h3" | "p";
type Size = "hero" | "display" | "section" | "subhead";

interface Props {
  text: string;
  emphasis?: string[];
  as?: HeadingTag;
  size?: Size;
  /** Render emphasis with a gradient sweep. Defaults to true for hero/display. */
  emphasisGradient?: boolean;
  /** Cascade delay between words, in seconds. */
  stagger?: number;
  /** Initial delay before the first word starts. */
  delay?: number;
  className?: string;
  /** When true, animate on scroll-into-view instead of mount. */
  inView?: boolean;
}

const SIZE_CLASS: Record<Size, string> = {
  hero: "text-[clamp(48px,8vw,128px)] font-semibold leading-[0.95] tracking-[-0.03em]",
  display: "text-[clamp(36px,6vw,88px)] font-semibold leading-[1.0] tracking-[-0.03em]",
  section: "text-[clamp(30px,4.5vw,60px)] font-semibold leading-[1.05] tracking-[-0.02em]",
  subhead: "text-[clamp(22px,2.5vw,32px)] font-semibold leading-[1.15] tracking-[-0.01em]",
};

/** Split text into tokens that preserve original spacing, so layout never shifts. */
function tokenize(text: string): { word: string; trailing: string }[] {
  const parts: { word: string; trailing: string }[] = [];
  const regex = /(\S+)(\s*)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    parts.push({ word: m[1], trailing: m[2] || "" });
  }
  return parts;
}

/** Build a fast emphasis lookup that supports multi-word phrases. */
function buildEmphasisMatcher(text: string, emphasis: string[]): Set<number> {
  const matches = new Set<number>();
  if (emphasis.length === 0) return matches;
  const tokens = tokenize(text);
  const lowerWords = tokens.map((t) => t.word.replace(/[.,;:!?]+$/g, "").toLowerCase());
  emphasis.forEach((phrase) => {
    const phraseWords = phrase.toLowerCase().split(/\s+/);
    for (let i = 0; i <= lowerWords.length - phraseWords.length; i++) {
      let ok = true;
      for (let j = 0; j < phraseWords.length; j++) {
        if (lowerWords[i + j] !== phraseWords[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        for (let j = 0; j < phraseWords.length; j++) matches.add(i + j);
      }
    }
  });
  return matches;
}

export function BlurRevealHeading({
  text,
  emphasis = [],
  as = "h2",
  size = "section",
  emphasisGradient,
  stagger = 0.05,
  delay = 0,
  className,
  inView = false,
}: Props) {
  const reduced = useReducedMotion();
  const tokens = useMemo(() => tokenize(text), [text]);
  const emphasisIndexes = useMemo(() => buildEmphasisMatcher(text, emphasis), [text, emphasis]);
  const useGradient = emphasisGradient ?? (size === "hero" || size === "display");

  const Tag = as as React.ElementType;

  // Reduced motion: render plain markup (no transforms, no filters)
  if (reduced) {
    return (
      <Tag className={clsx(SIZE_CLASS[size], "text-white", className)}>
        {tokens.map((t, i) => (
          <span key={i}>
            {emphasisIndexes.has(i) && useGradient ? (
              <span className="bg-gradient-to-r from-orange-200 via-orange-300 to-rose-300 bg-clip-text text-transparent">
                {t.word}
              </span>
            ) : (
              t.word
            )}
            {t.trailing}
          </span>
        ))}
      </Tag>
    );
  }

  const motionProps = inView
    ? {
        initial: "hidden",
        whileInView: "visible",
        viewport: { once: true, margin: "-15%" },
      }
    : {
        initial: "hidden",
        animate: "visible",
      };

  return (
    <Tag className={clsx(SIZE_CLASS[size], "text-white", className)}>
      <motion.span
        {...motionProps}
        variants={{ hidden: {}, visible: {} }}
        className="inline"
        style={{ display: "inline" }}
      >
        {tokens.map((t, i) => {
          const isEmphasis = emphasisIndexes.has(i);
          return (
            <motion.span
              key={i}
              variants={{
                hidden: { opacity: 0, y: 14, filter: "blur(12px)" },
                visible: {
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: {
                    duration: 0.75,
                    ease: EASE.outQuart,
                    delay: delay + i * stagger,
                  },
                },
              }}
              className={clsx(
                "inline-block",
                isEmphasis && useGradient &&
                  "bg-gradient-to-r from-orange-200 via-orange-300 to-rose-300 bg-clip-text text-transparent",
              )}
              style={{ willChange: "filter, transform, opacity" }}
            >
              {t.word}
              {/* Trailing whitespace must live outside the gradient span so the
                  bg-clip-text doesn't bleed onto it. */}
              {t.trailing && <span className="text-white">{t.trailing}</span>}
            </motion.span>
          );
        })}
      </motion.span>
    </Tag>
  );
}
