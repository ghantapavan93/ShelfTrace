"use client";

/**
 * SubstitutesPanel — products that compete with or complement the entity.
 *
 * Reads from the cannibalization heuristic: each candidate entity in the
 * same (or adjacent) category gets a cross-elasticity estimate derived
 * from co-movement in their price histories. Positive cross-elasticity
 * means raising A's price lifts B's demand (substitute), negative means
 * the inverse (complement, often co-purchased).
 *
 * This is the lens the pricing engine needs to avoid silently
 * cannibalizing demand: a +10% on Tropicana should not be approved
 * blind to whether the store-brand OJ next to it will absorb the
 * volume. The panel surfaces those relationships explicitly.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import {
  ArrowLeftRight,
  Link2,
  CircleHelp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { EASE } from "@/lib/motion";

type Data = Awaited<ReturnType<typeof api.graphEntitySubstitutes>>;
type Row = Data["substitutes"][number];

const KIND_META: Record<
  Row["kind"],
  { label: string; tone: "rose" | "emerald" | "amber" | "slate"; description: string }
> = {
  substitute: {
    label: "Substitute",
    tone: "rose",
    description: "Raising this entity's price tends to lift the substitute's demand.",
  },
  weak_substitute: {
    label: "Weak substitute",
    tone: "amber",
    description: "Mild positive co-movement — watch but not load-bearing.",
  },
  complement: {
    label: "Complement",
    tone: "emerald",
    description: "Often purchased together — raising one tends to pull the other's volume down with it.",
  },
  weak_complement: {
    label: "Weak complement",
    tone: "amber",
    description: "Mild negative co-movement — suggestive but low confidence.",
  },
  unrelated: {
    label: "Unrelated",
    tone: "slate",
    description: "Cross-elasticity near zero — no actionable relationship.",
  },
};

export function SubstitutesPanel({ entityId }: { entityId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    api
      .graphEntitySubstitutes(entityId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [entityId]);

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[.04] p-4 text-xs text-rose-200">
        Could not load substitutes: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
        <div className="mt-3 h-16 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  const subs = data.substitutes;
  const strong = subs.filter((s) => s.kind === "substitute" || s.kind === "complement");
  const visible = expanded ? subs : subs.slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE.outQuart }}
      className="rounded-2xl border border-rose-500/20 bg-rose-500/[.025] p-5"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-rose-300">
            <ArrowLeftRight className="h-3 w-3" /> Substitutes &amp; complements
          </div>
          <p className="mt-1 max-w-xl text-[11px] text-slate-400">
            Cross-elasticity estimates from price-history co-movement. A pricing
            move on this entity will ripple through these neighbours.
          </p>
        </div>
        {subs.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 text-[10px] text-slate-400">
            <span className="mono">
              {strong.length}{" "}
              <span className="text-slate-500">strong</span>
            </span>
            <span className="text-slate-700">·</span>
            <span className="mono">
              {subs.length} <span className="text-slate-500">total</span>
            </span>
          </div>
        )}
      </div>

      {subs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-white/[.01] px-3 py-4 text-center text-[11px] text-slate-500">
          No related entities detected. Seed more price history across products
          in this category for cross-elasticity to surface.
        </div>
      ) : (
        <>
          <ul className="space-y-1.5">
            {visible.map((s) => (
              <SubRow key={s.entity_id} row={s} />
            ))}
          </ul>
          {subs.length > 4 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-200"
            >
              {expanded ? (
                <>
                  Show top 4 <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  Show {subs.length - 4} more <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          )}
        </>
      )}

      <div className="mt-3 flex items-start gap-1.5 border-t border-white/5 pt-3 text-[10px] text-slate-500">
        <CircleHelp className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{data.note}</span>
      </div>
    </motion.div>
  );
}

function SubRow({ row }: { row: Row }) {
  const meta = KIND_META[row.kind];
  const xelast = row.estimated_cross_elasticity;
  const magnitude = Math.min(Math.abs(xelast) / 0.5, 1); // normalize to [0, 1] for the bar

  const tone = {
    rose: "border-rose-500/30 bg-rose-500/[.05]",
    emerald: "border-emerald-500/30 bg-emerald-500/[.05]",
    amber: "border-amber-500/30 bg-amber-500/[.04]",
    slate: "border-white/10 bg-white/[.015]",
  }[meta.tone];

  const labelTone = {
    rose: "text-rose-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    slate: "text-slate-400",
  }[meta.tone];

  const barTone = {
    rose: "bg-rose-400/70",
    emerald: "bg-emerald-400/70",
    amber: "bg-amber-400/70",
    slate: "bg-slate-400/40",
  }[meta.tone];

  return (
    <li
      className={clsx(
        "group rounded-lg border px-3 py-2 transition",
        tone,
      )}
    >
      <div className="flex items-center gap-3">
        <Link2 className={clsx("h-3.5 w-3.5 shrink-0", labelTone)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="truncate text-[12px] font-medium text-white">
              {row.canonical_title}
            </span>
            {row.category_name && (
              <span className="text-[10px] text-slate-500">
                {row.category_name}
                {row.same_category && (
                  <span className="ml-1 text-slate-600">(same cat.)</span>
                )}
              </span>
            )}
          </div>

          {/* Cross-elasticity bar — visualizes magnitude, signed */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="relative h-1 w-32 overflow-hidden rounded-full bg-white/[.04]">
              <div
                className={clsx(
                  "absolute top-0 h-full rounded-full",
                  barTone,
                )}
                style={{
                  // Centered at 50%, extending left or right by magnitude
                  width: `${magnitude * 50}%`,
                  left: xelast >= 0 ? "50%" : `${50 - magnitude * 50}%`,
                }}
              />
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
            </div>
            <span className={clsx("mono text-[10px] tabular-nums", labelTone)}>
              ε = {xelast > 0 ? "+" : ""}
              {xelast.toFixed(2)}
            </span>
            <span className={clsx("text-[9px] uppercase tracking-wider", labelTone)}>
              {meta.label}
            </span>
            <span className="mono text-[9px] text-slate-500">
              conf {Math.round(row.confidence * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Reveal-on-hover explanation, keeps default state quiet */}
      <AnimatePresence>
        {row.kind === "substitute" || row.kind === "complement" ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="mt-1 hidden text-[10px] text-slate-500 group-hover:block"
          >
            {meta.description}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}
