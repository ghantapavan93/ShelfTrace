"use client";

import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, CircleDot, Sparkles } from "lucide-react";

import { Pill } from "./Shell";
import {
  ChannelAgreementPanel,
  FilmGrain,
  MagneticLink,
  MilkGlyph,
  Particles,
  PHOTOS,
  ProductCard,
} from "./cinematic";
import { EASE, PRESET, SPRING } from "@/lib/motion";
import ScrollExpandMedia from "./ScrollExpandMedia";

/* ────────────────────────────────────────────────────────────────────────────
   /vision/begin — the cinematic singular intro.
   Uses the scroll-hijacking ScrollExpandMedia hero. Scroll grows the image
   from a small frame to fullscreen; once expanded, the welcome reveal
   below points at all five polished Vision pages.
   ──────────────────────────────────────────────────────────────────────────── */

function WelcomeReveal() {
  return (
    <div className="mx-auto max-w-[1200px]">
      {/* Two-column intro: product card + 3-channel signal */}
      <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Pill tone="orange">You just entered the rollout</Pill>
          <h2 className="mt-5 text-[clamp(30px,4.5vw,56px)] font-semibold leading-[1.04] tracking-[-0.02em] text-white">
            Approved at $5.99.
            <br />
            <span className="bg-gradient-to-r from-orange-300 via-rose-300 to-violet-300 bg-clip-text text-transparent">
              Verified across every channel.
            </span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
            The image you just scrolled open is the moment a single approved price
            becomes the price every shopper actually pays. The rest of this site
            is how that happens in real code — outbox · canary containment ·
            audit-verified recovery · 47 PostgreSQL-backed tests.
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={SPRING.gentle}
          className="flex flex-col items-center gap-4"
        >
          <ProductCard
            name="Organic Whole Milk"
            units="1 GAL"
            price="$5.99"
            glyph={<MilkGlyph />}
            tone="primary"
            size="lg"
            badge={{ label: "canonical", tone: "primary" }}
          />
          <ChannelAgreementPanel
            channels={[
              { name: "POS", status: "ok" },
              { name: "ESL", status: "ok" },
              { name: "WEB", status: "ok" },
            ]}
          />
        </motion.div>
      </div>

      {/* Five-CTA bridge into the polished pages */}
      <div className="mt-16 rounded-3xl border border-white/10 bg-gradient-to-br from-orange-500/[.05] via-transparent to-violet-500/[.05] p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Pill tone="sky">Pick a way in</Pill>
            <h3 className="mt-4 text-[clamp(22px,2.5vw,34px)] font-semibold leading-snug tracking-[-0.01em] text-white">
              Five surfaces, one engine.
            </h3>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[.22em] text-emerald-300">
            <CircleDot className="h-2 w-2 animate-pulse" />
            all live
          </span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              href: "/vision/keynote",
              label: "Keynote",
              body: "The evidence-first cinematic story · 10 chapters.",
            },
            {
              href: "/vision/showcase",
              label: "Showcase",
              body: "Photographic marketing twin · same proof, lush visuals.",
            },
            {
              href: "/vision/principle",
              label: "Principle",
              body: "A guide, not an agent. Why humans stay in control.",
            },
            {
              href: "/vision/connect",
              label: "Connect",
              body: "Live demo · click and see the real backend respond.",
            },
            {
              href: "/vision/futures",
              label: "Futures",
              body: "Seven future capabilities · product imagination.",
            },
            {
              href: "/operations",
              label: "Working Platform",
              body: "The shipped control plane · live operations now.",
            },
          ].map((c, i) => (
            <motion.div
              key={c.href}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: EASE.outQuart }}
            >
              <MagneticLink href={c.href} variant="ghost">
                <div className="flex flex-col items-start gap-1 text-left">
                  <span className="text-sm font-semibold text-white">{c.label}</span>
                  <span className="text-[11px] text-white/55">{c.body}</span>
                </div>
                <ArrowUpRight className="ml-auto h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </MagneticLink>
            </motion.div>
          ))}
        </div>
        <p className="mt-6 text-center text-[11px] uppercase tracking-[.22em] text-white/35">
          ShelfTrace · independent execution-reliability prototype
        </p>
      </div>

      {/* Single secondary CTA */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <MagneticLink href="/vision/keynote" variant="primary">
          Start with the Keynote{" "}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </MagneticLink>
        <MagneticLink href="/engineering" variant="quiet">
          Or jump straight to the Engineering Proof{" "}
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </MagneticLink>
      </div>
    </div>
  );
}

/* ─────────────────────────────────── PAGE ─────────────────────────────────── */

export default function BeginPage() {
  return (
    <div className="relative bg-[#04070b]">
      <FilmGrain id="begin" />
      {/* ambient particles drifting in dark space (visible above and after expansion) */}
      <div className="pointer-events-none fixed inset-0 z-[5] overflow-hidden">
        <Particles count={16} color="rgba(254,215,170,.4)" />
      </div>
      <ScrollExpandMedia
        mediaType="image"
        mediaSrc={PHOTOS.scan}
        bgImageSrc={PHOTOS.cold}
        title="Approved Verified"
        date="Memorial Day · Dallas Zone 2"
        scrollToExpand="Scroll to enter the rollout"
      >
        <WelcomeReveal />
      </ScrollExpandMedia>
    </div>
  );
}
