"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, Tag, ScanLine, Globe, CheckCircle2, AlertCircle, AlertTriangle, FlaskConical, ArrowRight } from "lucide-react";
import { api, DEMO_BATCH } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money, timeOf } from "@/lib/format";
import { ListSkeleton } from "@/components/Skeleton";
import { useWorkMode } from "@/components/ModeProvider";
import type { ActionView, ChannelView } from "@/lib/types";

const CH = {
  pos: { Icon: ScanLine, name: "POS" },
  esl: { Icon: Tag, name: "ESL Shelf" },
  ecommerce: { Icon: Globe, name: "Ecommerce" },
} as const;

function ChannelChip({ c }: { c: ChannelView }) {
  const { Icon, name } = CH[c.channel];
  const ok = c.status === "verified";
  return (
    <div
      className={clsx(
        "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
        ok ? "border-emerald-500/30 text-verified" : "border-amber-500/40 text-warn",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {name}
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Urgency classification — single source of truth for color + label
// ────────────────────────────────────────────────────────────────────────
type Urgency = "calm" | "watch" | "act" | "overdue";

interface UrgencyState {
  level: Urgency;
  msRemaining: number;
  display: string;
}

const HOUR = 60 * 60 * 1000;

function classify(deadlineIso: string, now: number): UrgencyState {
  const ms = new Date(deadlineIso).getTime() - now;
  if (ms <= 0) {
    const late = Math.abs(ms);
    return { level: "overdue", msRemaining: ms, display: `OVERDUE · ${formatDuration(late)} late` };
  }
  let level: Urgency;
  if (ms < 2 * HOUR) level = "act";
  else if (ms < 6 * HOUR) level = "watch";
  else level = "calm";
  return { level, msRemaining: ms, display: `${formatDuration(ms)} left` };
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

// ────────────────────────────────────────────────────────────────────────
// CountdownBadge — re-ticks at a rate matched to urgency
// > 6h:    every 60 s  (no need to flicker the seconds when it's overnight)
// 2-6h:    every 30 s
// < 2h:    every 1 s   (drama)
// overdue: every 5 s
// ────────────────────────────────────────────────────────────────────────
function CountdownBadge({ deadlineIso }: { deadlineIso: string }) {
  const reduced = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number;
    const tick = () => {
      if (cancelled) return;
      const current = Date.now();
      setNow(current);
      const state = classify(deadlineIso, current);
      const ms =
        state.level === "act" ? 1000
        : state.level === "watch" ? 30_000
        : state.level === "overdue" ? 5_000
        : 60_000;
      timeoutId = window.setTimeout(tick, ms);
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [deadlineIso]);

  const state = useMemo(() => classify(deadlineIso, now), [deadlineIso, now]);

  const styles: Record<Urgency, { wrapper: string; iconWrapper: string }> = {
    calm: {
      wrapper: "border-emerald-500/30 bg-emerald-500/[.06] text-emerald-200",
      iconWrapper: "text-emerald-300",
    },
    watch: {
      wrapper: "border-amber-500/35 bg-amber-500/[.07] text-amber-200",
      iconWrapper: "text-amber-300",
    },
    act: {
      wrapper: "border-rose-500/45 bg-rose-500/[.08] text-rose-100",
      iconWrapper: "text-rose-300",
    },
    overdue: {
      wrapper: "border-rose-500/60 bg-rose-500/15 text-rose-100",
      iconWrapper: "text-rose-200",
    },
  };

  const { wrapper, iconWrapper } = styles[state.level];
  const shouldPulse = !reduced && (state.level === "act" || state.level === "overdue");

  return (
    <motion.div
      animate={
        shouldPulse
          ? { boxShadow: [
              "0 0 0 0 rgba(244,63,94,0)",
              "0 0 0 6px rgba(244,63,94,.18)",
              "0 0 0 0 rgba(244,63,94,0)",
            ] }
          : undefined
      }
      transition={shouldPulse ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : undefined}
      className={clsx(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors",
        wrapper,
      )}
    >
      {state.level === "overdue" ? (
        <AlertTriangle className={clsx("h-3.5 w-3.5", iconWrapper)} />
      ) : (
        <Clock className={clsx("h-3.5 w-3.5", iconWrapper)} />
      )}
      <span className="mono">{state.display}</span>
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────
export default function MarkdownsPage() {
  const { mode, isHydrated } = useWorkMode();
  const isLiveWorkMode = isHydrated && mode === "live";
  // In Live mode the markdowns query is demo-bound and would either
  // surface seeded strawberry data or 404; short-circuit before we even
  // try the fetch so the page never flashes an error state.
  const { data, error } = useLive(() => api.markdowns(DEMO_BATCH), [isLiveWorkMode]);

  // Sort by deadline ascending — most urgent floats to the top
  const sortedMarkdowns = useMemo(() => {
    if (!data) return [];
    return [...data.markdowns].sort((a, b) => {
      const da = new Date(a.markdown_deadline).getTime();
      const db = new Date(b.markdown_deadline).getTime();
      return da - db;
    });
  }, [data]);

  // Live mode: show clean-slate notice BEFORE any loading/error states.
  // The underlying batch query is hard-bound to the seeded demo, so even
  // a successful fetch would leak demo SLA data into Live mode.
  if (isLiveWorkMode) {
    return (
      <div className="space-y-5">
        <div className="glass-strong rounded-3xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[.04] via-ink-900 to-black p-7 sm:p-10">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
              <FlaskConical className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-violet-300">
                Live mode clean slate
              </div>
              <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                Perishable markdowns are demo-scoped today.
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-400">
                The markdown reliability SLA page is currently bound to the seeded
                Memorial Day demo batch (strawberries). Once uploaded batches expose
                their own perishable deadlines through the markdowns endpoint, this
                surface will show your live batch instead. Switch to Demo mode to
                inspect the strawberry SLA timeline, or open the live batch directly
                from /operations.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/operations"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110"
                >
                  Back to live operations
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/scenarios"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[.04] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Upload a perishable scenario
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error)
    return (
      <div className="glass rounded-2xl p-6 text-slate-300">
        Could not load markdowns.
        <div className="mt-1 text-xs text-slate-500">{error}</div>
      </div>
    );
  if (!data)
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-white/5" />
        <ListSkeleton rows={3} />
      </div>
    );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Perishable Markdowns</h1>
        <p className="text-sm text-slate-400">
          Markdown reliability for {data.zone}. Shelf labels must reflect markdowns before the sell-through deadline.
          Items are sorted with the most urgent on top.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sortedMarkdowns.map(({ action, markdown_deadline }: { action: ActionView; markdown_deadline: string }) => {
          const eslOk = action.channels.find((c) => c.channel === "esl")?.status === "verified";
          const urgency = classify(markdown_deadline, Date.now()).level;
          const borderTone =
            urgency === "overdue" || urgency === "act"
              ? "border-rose-500/40"
              : urgency === "watch"
                ? "border-amber-500/35"
                : eslOk
                  ? "border-emerald-500/25"
                  : "border-white/10";

          return (
            <div key={action.id} className={clsx("glass rounded-2xl p-5 border", borderTone)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">{action.product_name}</h3>
                  <p className="text-xs text-slate-400">
                    Store {action.store_id} · markdown to {money(action.approved_price)} from{" "}
                    {money(action.prior_price)}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[.18em] text-slate-500">
                    deadline · {timeOf(markdown_deadline)}
                  </p>
                </div>
                <CountdownBadge deadlineIso={markdown_deadline} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {action.channels.map((c) => (
                  <ChannelChip key={c.channel} c={c} />
                ))}
              </div>

              {!eslOk && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                  Shelf label has not acknowledged the markdown. It may not be visible to in-store shoppers before the
                  deadline. Retry the ESL update or assign an associate.
                </div>
              )}
            </div>
          );
        })}
        {sortedMarkdowns.length === 0 && (
          <div className="glass rounded-2xl p-6 text-slate-400">No perishable markdowns in this batch.</div>
        )}
      </div>
    </div>
  );
}
