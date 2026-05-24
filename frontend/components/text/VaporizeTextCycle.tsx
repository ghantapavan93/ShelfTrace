"use client";

/**
 * VaporizeTextCycle — canvas particle vaporization between text cycles.
 *
 * Adapted from the public 21st.dev snippet. Renders each text into a 2D
 * canvas, samples its pixels into particles, then "vaporizes" them in a
 * direction-aware wave between cycles.
 *
 * ShelfTrace adaptations:
 *  - Honors prefers-reduced-motion: renders a flat <h1>/<h2>/<p> with the
 *    first text and disables the canvas entirely. The SEO element remains
 *    so the underlying semantic markup is still indexable.
 *  - Cleans up RAF + ResizeObserver on unmount.
 *  - Bounded by useIsInView — animation pauses when scrolled off-screen.
 *
 * Used by /vision/keynote Hero to cycle the project thesis verbs.
 */

import {
  createElement,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export enum VaporizeTag {
  H1 = "h1",
  H2 = "h2",
  H3 = "h3",
  P = "p",
}

type Direction = "left-to-right" | "right-to-left";
type Alignment = "left" | "center" | "right";

interface FontSpec {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: number;
}

interface AnimationSpec {
  vaporizeDuration?: number;
  fadeInDuration?: number;
  waitDuration?: number;
}

export interface VaporizeTextCycleProps {
  texts: string[];
  font?: FontSpec;
  color?: string;
  spread?: number;
  density?: number;
  animation?: AnimationSpec;
  direction?: Direction;
  alignment?: Alignment;
  tag?: VaporizeTag;
  /** Outer wrapper className for sizing. Required: parent needs a height. */
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  originalX: number;
  originalY: number;
  color: string;
  opacity: number;
  originalAlpha: number;
  velocityX: number;
  velocityY: number;
  angle: number;
  speed: number;
  shouldFadeQuickly?: boolean;
}

interface TextBoundaries {
  left: number;
  right: number;
  width: number;
}

declare global {
  interface HTMLCanvasElement {
    textBoundaries?: TextBoundaries;
  }
}

function transformValue(
  input: number,
  inputRange: [number, number],
  outputRange: [number, number],
  clamp = false,
): number {
  const [a, b] = inputRange;
  const [c, d] = outputRange;
  const p = (input - a) / (b - a);
  let r = c + p * (d - c);
  if (clamp) {
    if (d > c) r = Math.min(Math.max(r, c), d);
    else r = Math.min(Math.max(r, d), c);
  }
  return r;
}

function useIsInView(ref: React.RefObject<HTMLElement>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { threshold: 0, rootMargin: "50px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

function calculateVaporizeSpread(fontSize: number): number {
  const pts: Array<{ size: number; spread: number }> = [
    { size: 20, spread: 0.2 },
    { size: 50, spread: 0.5 },
    { size: 100, spread: 1.5 },
  ];
  if (fontSize <= pts[0].size) return pts[0].spread;
  if (fontSize >= pts[pts.length - 1].size) return pts[pts.length - 1].spread;
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1].size < fontSize) i++;
  const p1 = pts[i];
  const p2 = pts[i + 1];
  return (
    p1.spread + ((fontSize - p1.size) * (p2.spread - p1.spread)) / (p2.size - p1.size)
  );
}

function parseColor(color: string): string {
  const rgba = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (rgba) {
    const [, r, g, b, a] = rgba;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const rgb = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgb) {
    const [, r, g, b] = rgb;
    return `rgba(${r}, ${g}, ${b}, 1)`;
  }
  return "rgba(255, 255, 255, 1)";
}

function createParticles(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
  textX: number,
  textY: number,
  font: string,
  color: string,
  alignment: Alignment,
) {
  const particles: Particle[] = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = alignment;
  ctx.textBaseline = "middle";
  ctx.imageSmoothingQuality = "high";
  ctx.imageSmoothingEnabled = true;

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  let textLeft: number;
  if (alignment === "center") textLeft = textX - textWidth / 2;
  else if (alignment === "left") textLeft = textX;
  else textLeft = textX - textWidth;

  const textBoundaries: TextBoundaries = {
    left: textLeft,
    right: textLeft + textWidth,
    width: textWidth,
  };

  ctx.fillText(text, textX, textY);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const baseDPR = 3;
  const cssW = parseInt(canvas.style.width || "1", 10) || 1;
  const currentDPR = canvas.width / cssW;
  const sampleRate = Math.max(1, Math.round(currentDPR / baseDPR));

  for (let y = 0; y < canvas.height; y += sampleRate) {
    for (let x = 0; x < canvas.width; x += sampleRate) {
      const idx = (y * canvas.width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > 0) {
        const originalAlpha = (alpha / 255) * (sampleRate / currentDPR);
        particles.push({
          x,
          y,
          originalX: x,
          originalY: y,
          color: `rgba(${data[idx]}, ${data[idx + 1]}, ${data[idx + 2]}, ${originalAlpha})`,
          opacity: originalAlpha,
          originalAlpha,
          velocityX: 0,
          velocityY: 0,
          angle: 0,
          speed: 0,
        });
      }
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return { particles, textBoundaries };
}

function updateParticles(
  particles: Particle[],
  vaporizeX: number,
  deltaTime: number,
  MULTIPLIED: number,
  VAPORIZE_DURATION: number,
  direction: Direction,
  density: number,
): boolean {
  let allVaporized = true;
  for (const p of particles) {
    const shouldVaporize =
      direction === "left-to-right"
        ? p.originalX <= vaporizeX
        : p.originalX >= vaporizeX;
    if (shouldVaporize) {
      if (p.speed === 0) {
        p.angle = Math.random() * Math.PI * 2;
        p.speed = (Math.random() * 1 + 0.5) * MULTIPLIED;
        p.velocityX = Math.cos(p.angle) * p.speed;
        p.velocityY = Math.sin(p.angle) * p.speed;
        p.shouldFadeQuickly = Math.random() > density;
      }
      if (p.shouldFadeQuickly) {
        p.opacity = Math.max(0, p.opacity - deltaTime);
      } else {
        const dx = p.originalX - p.x;
        const dy = p.originalY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const damp = Math.max(0.95, 1 - dist / (100 * MULTIPLIED));
        const randomSpread = MULTIPLIED * 3;
        const sx = (Math.random() - 0.5) * randomSpread;
        const sy = (Math.random() - 0.5) * randomSpread;
        p.velocityX = (p.velocityX + sx + dx * 0.002) * damp;
        p.velocityY = (p.velocityY + sy + dy * 0.002) * damp;
        const maxV = MULTIPLIED * 2;
        const curV = Math.sqrt(p.velocityX ** 2 + p.velocityY ** 2);
        if (curV > maxV) {
          const s = maxV / curV;
          p.velocityX *= s;
          p.velocityY *= s;
        }
        p.x += p.velocityX * deltaTime * 20;
        p.y += p.velocityY * deltaTime * 10;
        const baseFade = 0.25;
        const fadeRate = baseFade * (2000 / VAPORIZE_DURATION);
        p.opacity = Math.max(0, p.opacity - deltaTime * fadeRate);
      }
      if (p.opacity > 0.01) allVaporized = false;
    } else {
      allVaporized = false;
    }
  }
  return allVaporized;
}

function renderParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  dpr: number,
) {
  ctx.save();
  ctx.scale(dpr, dpr);
  for (const p of particles) {
    if (p.opacity > 0) {
      ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${p.opacity})`);
      ctx.fillRect(p.x / dpr, p.y / dpr, 1, 1);
    }
  }
  ctx.restore();
}

function resetParticles(particles: Particle[]) {
  for (const p of particles) {
    p.x = p.originalX;
    p.y = p.originalY;
    p.opacity = p.originalAlpha;
    p.speed = 0;
    p.velocityX = 0;
    p.velocityY = 0;
  }
}

const SeoElement = memo(
  ({ tag, texts }: { tag: VaporizeTag; texts: string[] }) => {
    const style = useMemo(
      () =>
        ({
          position: "absolute" as const,
          width: "0",
          height: "0",
          overflow: "hidden",
          userSelect: "none" as const,
          pointerEvents: "none" as const,
        }) as const,
      [],
    );
    const safeTag = Object.values(VaporizeTag).includes(tag) ? tag : "p";
    return createElement(safeTag, { style }, texts?.join(" · ") ?? "");
  },
);
SeoElement.displayName = "VaporizeSeoElement";

export function VaporizeTextCycle({
  texts,
  font = { fontFamily: "Inter, sans-serif", fontSize: "50px", fontWeight: 600 },
  color = "rgb(255, 255, 255)",
  spread = 5,
  density = 5,
  animation = { vaporizeDuration: 2, fadeInDuration: 1, waitDuration: 0.5 },
  direction = "left-to-right",
  alignment = "center",
  tag = VaporizeTag.P,
  className,
}: VaporizeTextCycleProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inView = useIsInView(wrapperRef);
  const particlesRef = useRef<Particle[]>([]);
  const lastFontRef = useRef<string | null>(null);
  const vaporizeProgressRef = useRef(0);
  const fadeOpacityRef = useRef(0);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [animState, setAnimState] = useState<
    "static" | "vaporizing" | "fadingIn" | "waiting"
  >("static");
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });
  const [reduced, setReduced] = useState(false);
  const transformedDensity = transformValue(density, [0, 10], [0.3, 1], true);

  // Reduced-motion detection (client only).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const globalDpr = useMemo(() => {
    if (typeof window !== "undefined") {
      return (window.devicePixelRatio || 1) * 1.5;
    }
    return 1;
  }, []);

  const animationDurations = useMemo(
    () => ({
      VAPORIZE_DURATION: (animation.vaporizeDuration ?? 2) * 1000,
      FADE_IN_DURATION: (animation.fadeInDuration ?? 1) * 1000,
      WAIT_DURATION: (animation.waitDuration ?? 0.5) * 1000,
    }),
    [animation.vaporizeDuration, animation.fadeInDuration, animation.waitDuration],
  );

  const fontConfig = useMemo(() => {
    const fs = parseInt(font.fontSize?.replace("px", "") || "50", 10);
    const sp = calculateVaporizeSpread(fs);
    return {
      fontSize: fs,
      MULTIPLIED: sp * spread,
    };
  }, [font.fontSize, spread]);

  const memoizedUpdateParticles = useCallback(
    (particles: Particle[], vaporizeX: number, dt: number) =>
      updateParticles(
        particles,
        vaporizeX,
        dt,
        fontConfig.MULTIPLIED,
        animationDurations.VAPORIZE_DURATION,
        direction,
        transformedDensity,
      ),
    [
      fontConfig.MULTIPLIED,
      animationDurations.VAPORIZE_DURATION,
      direction,
      transformedDensity,
    ],
  );

  const memoizedRenderParticles = useCallback(
    (ctx: CanvasRenderingContext2D, particles: Particle[]) =>
      renderParticles(ctx, particles, globalDpr),
    [globalDpr],
  );

  // Start cycle when in view (skipped under reduced-motion).
  useEffect(() => {
    if (reduced) return;
    if (inView) {
      const t = window.setTimeout(() => setAnimState("vaporizing"), 0);
      return () => window.clearTimeout(t);
    } else {
      setAnimState("static");
    }
  }, [inView, reduced]);

  // Main animation loop.
  useEffect(() => {
    if (!inView || reduced) return;
    let lastTime = performance.now();
    let frameId = 0;

    const animate = (currentTime: number) => {
      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !particlesRef.current.length) {
        frameId = requestAnimationFrame(animate);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      switch (animState) {
        case "static": {
          memoizedRenderParticles(ctx, particlesRef.current);
          break;
        }
        case "vaporizing": {
          vaporizeProgressRef.current +=
            (dt * 100) / (animationDurations.VAPORIZE_DURATION / 1000);
          const tb = canvas.textBoundaries;
          if (!tb) break;
          const p = Math.min(100, vaporizeProgressRef.current);
          const vaporizeX =
            direction === "left-to-right"
              ? tb.left + (tb.width * p) / 100
              : tb.right - (tb.width * p) / 100;
          const allVaporized = memoizedUpdateParticles(
            particlesRef.current,
            vaporizeX,
            dt,
          );
          memoizedRenderParticles(ctx, particlesRef.current);
          if (vaporizeProgressRef.current >= 100 && allVaporized) {
            setCurrentTextIndex((i) => (i + 1) % texts.length);
            setAnimState("fadingIn");
            fadeOpacityRef.current = 0;
          }
          break;
        }
        case "fadingIn": {
          fadeOpacityRef.current +=
            (dt * 1000) / animationDurations.FADE_IN_DURATION;
          ctx.save();
          ctx.scale(globalDpr, globalDpr);
          for (const particle of particlesRef.current) {
            particle.x = particle.originalX;
            particle.y = particle.originalY;
            const o = Math.min(fadeOpacityRef.current, 1) * particle.originalAlpha;
            ctx.fillStyle = particle.color.replace(/[\d.]+\)$/, `${o})`);
            ctx.fillRect(particle.x / globalDpr, particle.y / globalDpr, 1, 1);
          }
          ctx.restore();
          if (fadeOpacityRef.current >= 1) {
            setAnimState("waiting");
            window.setTimeout(() => {
              setAnimState("vaporizing");
              vaporizeProgressRef.current = 0;
              resetParticles(particlesRef.current);
            }, animationDurations.WAIT_DURATION);
          }
          break;
        }
        case "waiting": {
          memoizedRenderParticles(ctx, particlesRef.current);
          break;
        }
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [
    animState,
    inView,
    reduced,
    texts.length,
    direction,
    globalDpr,
    memoizedUpdateParticles,
    memoizedRenderParticles,
    animationDurations.FADE_IN_DURATION,
    animationDurations.WAIT_DURATION,
    animationDurations.VAPORIZE_DURATION,
  ]);

  // Render/sample particles on text or size change.
  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas || !wrapperSize.width || !wrapperSize.height) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.style.width = `${wrapperSize.width}px`;
    canvas.style.height = `${wrapperSize.height}px`;
    canvas.width = Math.floor(wrapperSize.width * globalDpr);
    canvas.height = Math.floor(wrapperSize.height * globalDpr);

    const fs = parseInt(font.fontSize?.replace("px", "") || "50", 10);
    const fontStr = `${font.fontWeight ?? 400} ${fs * globalDpr}px ${
      font.fontFamily ?? "sans-serif"
    }`;
    const parsedColor = parseColor(color);

    let textX: number;
    const textY = canvas.height / 2;
    const currentText = texts[currentTextIndex] || texts[0] || "";
    if (alignment === "center") textX = canvas.width / 2;
    else if (alignment === "left") textX = 0;
    else textX = canvas.width;

    const { particles, textBoundaries } = createParticles(
      ctx,
      canvas,
      currentText,
      textX,
      textY,
      fontStr,
      parsedColor,
      alignment,
    );
    particlesRef.current = particles;
    canvas.textBoundaries = textBoundaries;

    // Re-render once the requested font has loaded (catches FOUT).
    const currentFont = font.fontFamily || "sans-serif";
    if (currentFont !== lastFontRef.current) {
      lastFontRef.current = currentFont;
      const t = window.setTimeout(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const { particles: ps, textBoundaries: tb } = createParticles(
          ctx,
          canvas,
          currentText,
          textX,
          textY,
          fontStr,
          parsedColor,
          alignment,
        );
        particlesRef.current = ps;
        canvas.textBoundaries = tb;
      }, 1000);
      return () => window.clearTimeout(t);
    }
  }, [
    texts,
    font.fontSize,
    font.fontWeight,
    font.fontFamily,
    color,
    alignment,
    wrapperSize,
    currentTextIndex,
    globalDpr,
    reduced,
  ]);

  // Resize tracking.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setWrapperSize({ width, height });
      }
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setWrapperSize({ width: r.width, height: r.height });
    return () => ro.disconnect();
  }, []);

  // Reduced-motion fallback: render flat static text with the chosen font/colour.
  if (reduced) {
    return (
      <div ref={wrapperRef} className={className}>
        {createElement(
          tag,
          {
            style: {
              fontFamily: font.fontFamily,
              fontSize: font.fontSize,
              fontWeight: font.fontWeight,
              color,
              textAlign: alignment,
              margin: 0,
              lineHeight: 1,
            },
          },
          texts[0] ?? "",
        )}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
    >
      <canvas
        ref={canvasRef}
        style={{ minWidth: "30px", minHeight: "20px", pointerEvents: "none" }}
      />
      <SeoElement tag={tag} texts={texts} />
    </div>
  );
}
