"use client";

/**
 * TierLadder — good-better-best laddering for a single canonical entity.
 *
 * For one product (Tropicana NFC 52oz, say), the same item is offered at
 * different price tiers across sources — store-brand at $4.99, mainstream
 * at $6.49, premium private-label at $9.99. Leon Zhang calls this
 * "good-better-best laddering" and the strategic move is: where do we
 * sit, and does the gap between rungs tell us if we're under-pricing
 * a value tier or over-pricing a premium one?
 *
 * The ladder takes every observed source for this entity (ours +
 * competitors) and sorts them ascending by price, drawing the rungs at
 * percentile positions. The cheapest rung gets the "Good" label, the
 * priciest "Best", and middle rungs become "Better". When only two
 * rungs exist the ladder degenerates to "Value / Premium".
 */

import { useMemo } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { Ruler, TrendingUp } from "lucide-react";
import { EASE } from "@/lib/motion";
import { money } from "@/lib/format";

interface Rung {
  label: string;          // "Tropicana NFC ours" / "Whole Foods" / etc.
  source: string;         // "ours" or competitor source_id
  price: number;
  isOurs: boolean;
}

interface Props {
  entityTitle: string;
  linkedSkus: Array<{ sku: string; current_price?: number | null }>;
  competitorObservations: Array<{
    source: string;
    source_id?: string | null;
    competitor_title?: string | null;
    price: number;
  }>;
}

export function TierLadder({ entityTitle, linkedSkus, competitorObservations }: Props) {
  const rungs: Rung[] = useMemo(() => {
    const out: Rung[] = [];
    // Our linked SKUs with a known retail price
    for (const sku of linkedSkus) {
      if (sku.current_price && sku.current_price > 0) {
        out.push({
          label: `Ours · ${sku.sku}`,
          source: "ours",
          price: sku.current_price,
          isOurs: true,
        });
      }
    }
    // Dedupe competitor sources to the cheapest observation per source
    const cheapestPerSource = new Map<string, { price: number; label: string; sourceId: string }>();
    for (const obs of competitorObservations) {
      const key = obs.source_id ?? obs.source;
      const prev = cheapestPerSource.get(key);
      if (!prev || obs.price < prev.price) {
        cheapestPerSource.set(key, {
          price: obs.price,
          label: obs.source_id ?? obs.source,
          sourceId: key,
        });
      }
    }
    for (const v of cheapestPerSource.values()) {
      out.push({
        label: v.label,
        source: v.sourceId,
        price: v.price,
        isOurs: false,
      });
    }
    return out.sort((a, b) => a.price - b.price);
  }, [linkedSkus, competitorObservations]);

  if (rungs.length < 2) {
    return null;
  }

  const minPrice = rungs[0].price;
  const maxPrice = rungs[rungs.length - 1].price;
  const spread = maxPrice - minPrice;
  const spreadPct = minPrice > 0 ? (spread / minPrice) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE.outQuart }}
      className="rounded-2xl border border-amber-500/20 bg-amber-500/[.025] p-5"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-amber-300">
            <Ruler className="h-3 w-3" /> Good · Better · Best ladder
          </div>
          <p className="mt-1 max-w-xl text-[11px] text-slate-400">
            The same canonical product at every price tier we see in the
            market. The spread tells you where to position — anchor low to
            drive traffic, anchor high to subsidize KVI margin.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] text-slate-400">
          <span>
            spread{" "}
            <span className="mono font-semibold text-white">{money(spread)}</span>
            <span className="ml-1 text-slate-500">
              ({spreadPct.toFixed(0)}%)
            </span>
          </span>
          <span className="text-[9px] text-slate-500">
            {rungs.length} tiers · {money(minPrice)}–{money(maxPrice)}
          </span>
        </div>
      </div>

      {/* The ladder itself — a horizontal axis with marks for each rung */}
      <div className="relative mt-5 px-2 pt-12 pb-10">
        {/* Axis */}
        <div className="relative h-px w-full bg-white/[.08]">
          {rungs.map((r, i) => {
            const pct = spread === 0 ? 50 : ((r.price - minPrice) / spread) * 100;
            const role = roleForRung(i, rungs.length);
            return (
              <RungMarker
                key={`${r.source}-${i}`}
                rung={r}
                pct={pct}
                role={role}
                stagger={i * 0.06}
              />
            );
          })}
        </div>

        {/* Axis labels */}
        <div className="mt-3 flex justify-between text-[9px] font-mono text-slate-600">
          <span>{money(minPrice)}</span>
          <span>{money(maxPrice)}</span>
        </div>
      </div>

      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
        <TrendingUp className="h-3 w-3" />
        <span>
          {entityTitle} priced across {rungs.length} tier{rungs.length === 1 ? "" : "s"}.
          {rungs.some((r) => r.isOurs) ? " Our position highlighted in orange." : ""}
        </span>
      </div>
    </motion.div>
  );
}

function RungMarker({
  rung,
  pct,
  role,
  stagger,
}: {
  rung: Rung;
  pct: number;
  role: "good" | "better" | "best";
  stagger: number;
}) {
  const roleStyle = {
    good: {
      label: "Good",
      text: "text-emerald-300",
      border: "border-emerald-400/50",
      dot: "bg-emerald-400",
    },
    better: {
      label: "Better",
      text: "text-amber-300",
      border: "border-amber-400/50",
      dot: "bg-amber-400",
    },
    best: {
      label: "Best",
      text: "text-violet-300",
      border: "border-violet-400/50",
      dot: "bg-violet-400",
    },
  }[role];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: stagger, ease: EASE.outQuart }}
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${pct}%` }}
    >
      {/* Stem upward to the label */}
      <div className="absolute left-1/2 top-0 h-10 w-px -translate-x-1/2 -translate-y-full bg-white/10" />

      {/* Top label group */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ top: "-3.25rem" }}>
        <div
          className={clsx(
            "whitespace-nowrap rounded-md border bg-[#0a0e18]/85 px-2 py-1 text-center backdrop-blur",
            roleStyle.border,
            rung.isOurs && "ring-2 ring-orange-400/60",
          )}
        >
          <div
            className={clsx(
              "text-[8px] font-semibold uppercase tracking-[.22em]",
              roleStyle.text,
            )}
          >
            {roleStyle.label}
            {rung.isOurs && <span className="ml-1 text-orange-300">· ours</span>}
          </div>
          <div className="mono mt-0.5 text-[11px] font-semibold text-white tabular-nums">
            {money(rung.price)}
          </div>
        </div>
      </div>

      {/* The rung dot */}
      <div
        className={clsx(
          "h-3 w-3 rounded-full ring-4 ring-[#0a0e18]",
          rung.isOurs ? "bg-orange-400" : roleStyle.dot,
        )}
      />

      {/* Bottom source label */}
      <div
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
        style={{ top: "1.25rem" }}
      >
        <div
          className={clsx(
            "mono text-[9px] truncate max-w-[8rem]",
            rung.isOurs ? "text-orange-300 font-semibold" : "text-slate-500",
          )}
          title={rung.label}
        >
          {rung.label}
        </div>
      </div>
    </motion.div>
  );
}

function roleForRung(index: number, total: number): "good" | "better" | "best" {
  if (total === 2) return index === 0 ? "good" : "best";
  if (index === 0) return "good";
  if (index === total - 1) return "best";
  return "better";
}
