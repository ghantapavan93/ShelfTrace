"use client";

/**
 * BatchPicker — switcher between all batches the backend knows about.
 *
 * Sits at the top of /operations so a reviewer can navigate between:
 *   • The auto-seeded Memorial Day demo batch
 *   • Any custom scenario they ran via /scenarios
 *   • Older runs that are still around
 *
 * Without this, /operations only shows the latest/highlighted batch
 * and there's no path back to compare runs. With this, the reviewer
 * sees their freshly-imported scenario lit up at the top of the list
 * and can swap to any earlier one in one click.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Check,
  CircleDot,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import { api, DEMO_BATCH } from "@/lib/api";
import { timeOf } from "@/lib/format";
import { useWorkMode } from "@/components/ModeProvider";
import type { BatchSummary } from "@/lib/types";

interface Props {
  /** External ID of the currently-viewed batch. */
  currentExternalId?: string;
  /** Optional callback when the user picks a batch. Defaults to URL push. */
  onPick?: (externalId: string) => void;
}

function statusBadge(status: string) {
  if (status === "blocked")
    return { Icon: ShieldAlert, color: "text-rose-300", bg: "bg-rose-500/15" };
  if (status === "completed" || status === "ready_for_expansion")
    return { Icon: ShieldCheck, color: "text-emerald-300", bg: "bg-emerald-500/15" };
  if (status === "expanding")
    return { Icon: CircleDot, color: "text-sky-300", bg: "bg-sky-500/15" };
  return { Icon: Clock, color: "text-amber-300", bg: "bg-amber-500/15" };
}

function isFreshRun(createdAt: string): boolean {
  const age = Date.now() - new Date(createdAt).getTime();
  return age >= 0 && age < 60_000; // < 60 seconds
}

export function BatchPicker({ currentExternalId, onPick }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, isHydrated } = useWorkMode();
  const [open, setOpen] = useState(false);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Load batches once on mount, refresh when re-opened
  useEffect(() => {
    let cancelled = false;
    api.batches()
      .then((bs) => {
        if (cancelled) return;
        // Sort: blocked + critical first, then newest first
        const sorted = [...bs].sort((a, b) => {
          const aBad = a.expansion_blocked ? -1 : 0;
          const bBad = b.expansion_blocked ? -1 : 0;
          if (aBad !== bBad) return aBad - bBad;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setBatches(sorted);
      })
      .catch(() => setBatches([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]); // refetch when reopening

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // In live mode, hide every demo-seeded batch: the Memorial Day showcase
  // AND certification-sandbox runs that the backend boots on first start.
  // Anything else (live-cfg_*, scenario-*, user-uploaded) is honest "your data".
  const visibleBatches =
    isHydrated && mode === "live"
      ? batches.filter(
          (b) =>
            b.external_id !== DEMO_BATCH &&
            !b.external_id.startsWith("certification-"),
        )
      : batches;

  // Resolve current batch (or fall back to first visible batch)
  const current =
    visibleBatches.find((b) => b.external_id === currentExternalId) ??
    visibleBatches[0];

  function pick(externalId: string) {
    setOpen(false);
    if (onPick) {
      onPick(externalId);
    } else {
      // Preserve any other query params, swap external_id
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set("external_id", externalId);
      router.push(`/operations?${params.toString()}`);
    }
  }

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-slate-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-slate-500" />
        Loading batches…
      </div>
    );
  }

  if (!current) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/[.04] px-3 py-2 text-xs text-violet-200">
        <CircleDot className="h-3.5 w-3.5" />
        No live batches yet
      </div>
    );
  }

  const fresh = isFreshRun(current.created_at);
  const currentBadge = statusBadge(current.status);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "group flex items-center gap-3 rounded-xl border bg-white/[.04] px-3 py-2 text-left transition hover:bg-white/[.08]",
          open
            ? "border-white/25 bg-white/[.08]"
            : "border-white/10 hover:border-white/20",
        )}
      >
        <span
          className={clsx(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            currentBadge.bg,
            currentBadge.color,
          )}
        >
          <currentBadge.Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-white">
              {current.name}
            </span>
            {fresh && (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-violet-200">
                <Sparkles className="h-2.5 w-2.5" /> just ran
              </span>
            )}
          </div>
          <div className="mono mt-0.5 text-[10px] text-slate-500">
            {current.zone} · {timeOf(current.created_at)} ·{" "}
            {current.total_actions} actions
          </div>
        </div>
        <ChevronDown
          className={clsx(
            "h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-50 mt-1.5 max-h-[460px] w-[420px] overflow-y-auto rounded-xl border border-white/10 bg-[#0b0e15] shadow-2xl"
          >
            <div className="sticky top-0 border-b border-white/10 bg-[#0b0e15]/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500 backdrop-blur">
              {visibleBatches.length} batch{visibleBatches.length === 1 ? "" : "es"} ·{" "}
              {isHydrated && mode === "live" ? "live uploads only" : "newest first"}
            </div>
            {visibleBatches.map((b) => {
              const isCurrent = b.external_id === current.external_id;
              const badge = statusBadge(b.status);
              const Icon = badge.Icon;
              const bFresh = isFreshRun(b.created_at);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => pick(b.external_id)}
                  className={clsx(
                    "flex w-full items-start gap-3 border-b border-white/5 px-3 py-2.5 text-left transition last:border-0",
                    isCurrent
                      ? "bg-white/[.06]"
                      : "hover:bg-white/[.04]",
                  )}
                >
                  <span
                    className={clsx(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      badge.bg,
                      badge.color,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-white">
                        {b.name}
                      </span>
                      {bFresh && (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-violet-500/30 bg-violet-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-violet-200">
                          <Sparkles className="h-2.5 w-2.5" /> new
                        </span>
                      )}
                    </div>
                    <div className="mono mt-0.5 truncate text-[10px] text-slate-500">
                      {b.zone} · {b.total_actions} actions ·{" "}
                      {b.critical_incidents > 0 && (
                        <span className="text-rose-300">
                          {b.critical_incidents} critical ·
                        </span>
                      )}{" "}
                      {b.verified_actions} verified
                    </div>
                    <div className="mono mt-0.5 text-[9px] text-slate-600">
                      {timeOf(b.created_at)} · {b.external_id}
                    </div>
                  </div>
                  {isCurrent && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-brand-400" />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
