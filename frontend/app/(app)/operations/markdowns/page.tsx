"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion, useReducedMotion } from "framer-motion";
import {
  Clock,
  Tag,
  ScanLine,
  Globe,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FlaskConical,
  ArrowRight,
  ShieldCheck,
  Gauge,
  RotateCcw,
  ClipboardList,
  ShieldOff,
} from "lucide-react";
import { api, DEMO_BATCH } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money, timeOf } from "@/lib/format";
import { ListSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useWorkMode } from "@/components/ModeProvider";
import type {
  ChannelView,
  IncidentView,
  MarkdownItem,
  MarkdownsResponse,
  SlaStatus,
} from "@/lib/types";

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
// SLA status — the canonical compliance signal, computed server-side and
// mirrored here for color/label. Distinct from the time-only countdown badge.
// ────────────────────────────────────────────────────────────────────────
const SLA_META: Record<
  SlaStatus,
  { label: string; chip: string; dot: string; Icon: typeof CheckCircle2 }
> = {
  met: {
    label: "SLA met",
    chip: "border-emerald-500/30 bg-emerald-500/[.07] text-emerald-200",
    dot: "bg-emerald-400",
    Icon: ShieldCheck,
  },
  pending: {
    label: "Awaiting ack",
    chip: "border-sky-500/30 bg-sky-500/[.07] text-sky-200",
    dot: "bg-sky-400",
    Icon: Clock,
  },
  at_risk: {
    label: "At risk",
    chip: "border-amber-500/35 bg-amber-500/[.08] text-amber-200",
    dot: "bg-amber-400",
    Icon: AlertCircle,
  },
  breached: {
    label: "SLA breached",
    chip: "border-rose-500/50 bg-rose-500/[.10] text-rose-100",
    dot: "bg-rose-400",
    Icon: AlertTriangle,
  },
};

function SlaPill({ status }: { status: SlaStatus }) {
  const m = SLA_META[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        m.chip,
      )}
    >
      <m.Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Urgency classification — single source of truth for the countdown badge
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
// SLA compliance header — the aggregate reliability read for the batch
// ────────────────────────────────────────────────────────────────────────
const SEGMENTS: Array<{ key: keyof SegCounts; tone: string; label: string }> = [
  { key: "met", tone: "bg-emerald-400", label: "Met" },
  { key: "at_risk", tone: "bg-amber-400", label: "At risk" },
  { key: "breached", tone: "bg-rose-400", label: "Breached" },
  { key: "pending", tone: "bg-sky-400", label: "Pending" },
];

interface SegCounts {
  met: number;
  at_risk: number;
  breached: number;
  pending: number;
}

function ComplianceHeader({ data }: { data: MarkdownsResponse }) {
  const reduced = useReducedMotion();
  const s = data.summary;
  const pct = s.compliance_pct;
  const tone =
    pct >= 100 ? "text-verified"
    : s.breached > 0 ? "text-danger"
    : s.at_risk > 0 ? "text-warn"
    : "text-sky-300";

  return (
    <section className="glass-strong rounded-3xl border border-white/10 p-6">
      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        {/* Compliance dial */}
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[.03]">
            <Gauge className={clsx("h-6 w-6", tone)} />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">
              Shelf-label SLA compliance
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className={clsx("text-4xl font-bold tabular-nums", tone)}>{pct}%</span>
              <span className="text-sm text-slate-400">
                {s.met} of {s.total} shelf{s.total === 1 ? "" : "ves"} updated
              </span>
            </div>
          </div>
        </div>

        {/* Stacked bar + breakdown */}
        <div className="min-w-0">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[.06]">
            {SEGMENTS.map(({ key, tone }) => {
              const v = s[key];
              if (!v) return null;
              const w = (v / Math.max(1, s.total)) * 100;
              return (
                <motion.div
                  key={key}
                  className={tone}
                  initial={reduced ? false : { width: 0 }}
                  animate={{ width: `${w}%` }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {SEGMENTS.map(({ key, tone, label }) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className={clsx("h-2 w-2 rounded-full", tone)} />
                {label}
                <span className="tabular-nums font-medium text-slate-200">{s[key]}</span>
              </div>
            ))}
          </div>
          {s.soonest_unmet_deadline && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              Most urgent unmet shelf label —
              <CountdownBadge deadlineIso={s.soonest_unmet_deadline} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────
export default function MarkdownsPage() {
  const { mode, isHydrated } = useWorkMode();
  const isLiveWorkMode = isHydrated && mode === "live";
  // Live mode resolves the most recent user-uploaded batch via scope=live
  // (empty SLA payload when there's none); Demo mode opens the seeded batch
  // by its explicit id (the documented escape hatch).
  const { data, error, reload } = useLive<MarkdownsResponse>(
    () => (isLiveWorkMode ? api.markdowns(undefined, "live") : api.markdowns(DEMO_BATCH)),
    [isLiveWorkMode],
  );

  // The markdown SLA payload carries the ActionView but NOT an incident id —
  // recovery (retry ESL / assign associate) lives on the incident, keyed by
  // action_id. We pull the in-scope incident list once and index the
  // deadline-risk incidents by their action so each at-risk row can wire its
  // advisory to a real recovery target. When no incident exists for an action
  // yet, the advisory degrades to a deep-link rather than a dead button.
  const workScope = isLiveWorkMode ? "live" : undefined;
  const { data: incidents, reload: reloadIncidents } = useLive<IncidentView[]>(
    () => api.incidents(workScope),
    [workScope],
  );

  const incidentByActionId = useMemo(() => {
    const map = new Map<string, IncidentView>();
    if (!incidents) return map;
    for (const inc of incidents) {
      if (inc.type !== "deadline_risk") continue;
      // Prefer an open/retrying incident; only fall back to a resolved one
      // if nothing actionable exists for the same action.
      const existing = map.get(inc.action_id);
      const incActionable = inc.status === "open" || inc.status === "retrying";
      const existingActionable =
        existing && (existing.status === "open" || existing.status === "retrying");
      if (!existing || (incActionable && !existingActionable)) {
        map.set(inc.action_id, inc);
      }
    }
    return map;
  }, [incidents]);

  const refreshAll = useCallback(async () => {
    await Promise.all([reload(), reloadIncidents()]);
  }, [reload, reloadIncidents]);

  const sorted = useMemo(() => {
    if (!data) return [] as MarkdownItem[];
    return [...data.markdowns].sort(
      (a, b) =>
        new Date(a.markdown_deadline).getTime() - new Date(b.markdown_deadline).getTime(),
    );
  }, [data]);

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

  // Empty SLA scope — no perishable markdowns in the active scope.
  if (data.summary.total === 0) {
    return (
      <div className="space-y-5">
        <Header zone={data.zone} />
        {isLiveWorkMode ? (
          <div className="glass-strong rounded-3xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[.04] via-ink-900 to-black p-7 sm:p-10">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
                <FlaskConical className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[.22em] text-violet-300">
                  No perishable markdowns in Live mode
                </div>
                <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                  Upload a batch with perishable deadlines to track its SLA here.
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-slate-400">
                  This surface tracks every perishable markdown in your most recent live batch
                  and reports whether each shelf label acknowledged the markdown before its
                  sell-through deadline. Switch to Demo mode to watch the Memorial Day strawberry
                  SLA, or run a scenario that includes a markdown deadline.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href="/scenarios"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110"
                  >
                    Build a perishable scenario
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/operations"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[.04] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    Back to live operations
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl border border-emerald-500/25 p-8">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-verified">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-white">No perishable markdowns</h3>
                <p className="mt-1 text-sm text-slate-400">
                  This batch has no items with a sell-through deadline to track.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Header zone={data.zone} />
      <ComplianceHeader data={data} />

      <div className="grid gap-4 md:grid-cols-2">
        {sorted.map((m) => {
          const { action, markdown_deadline, sla_status } = m;
          const borderTone =
            sla_status === "breached"
              ? "border-rose-500/40"
              : sla_status === "at_risk"
                ? "border-amber-500/35"
                : sla_status === "met"
                  ? "border-emerald-500/25"
                  : "border-white/10";

          return (
            <div key={action.id} className={clsx("glass rounded-2xl p-5 border", borderTone)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
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

              <div className="mt-3 flex items-center gap-2">
                <SlaPill status={sla_status} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {action.channels.map((c) => (
                  <ChannelChip key={c.channel} c={c} />
                ))}
              </div>

              {!m.esl_verified && (
                <DeadlineActions
                  item={m}
                  incident={incidentByActionId.get(action.id) ?? null}
                  onActed={refreshAll}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Header({ zone }: { zone: string | null }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Perishable Deadline Desk</h1>
      <p className="mt-1 text-sm text-white/65">
        Protect markdown visibility before fresh inventory misses its sell-through window.
      </p>
      <p className="mt-1 text-sm text-slate-400">
        {zone ? `Markdown reliability for ${zone}. ` : ""}
        Each perishable markdown must reach its shelf label before the sell-through deadline.
        Sorted with the most urgent on top.
      </p>
      <div className="mt-3 inline-flex items-start gap-2 rounded-xl border border-violet-500/25 bg-violet-500/[.05] px-3 py-2 text-xs text-violet-200">
        <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
        <span>
          Sell-through results remain quarantined until shelf visibility is verified
          before the deadline.
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// DeadlineActions — the actionable advisory. Replaces the old static text
// block with real recovery affordances:
//   • Retry ESL Update / Assign Associate Verification → fire the matching
//     deadline-risk incident's recovery endpoints when we can resolve one by
//     action_id; otherwise degrade to a deep-link into the incident surface
//     rather than render a dead button.
//   • Measurement attribution status → NOT a button. The sell-through
//     measurement is genuinely quarantined while the shelf label is unverified;
//     we surface that real gate state honestly instead of a fake "pause" control.
// ────────────────────────────────────────────────────────────────────────
function DeadlineActions({
  item,
  incident,
  onActed,
}: {
  item: MarkdownItem;
  incident: IncidentView | null;
  onActed: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"retry" | "task" | null>(null);
  const breached = item.sla_status === "breached";
  // Only an open/retrying incident is actionable; a resolved one means
  // recovery already ran — fall back to the read-only deep link.
  const actionable =
    incident && (incident.status === "open" || incident.status === "retrying");

  async function run(kind: "retry" | "task") {
    if (!incident) return;
    setBusy(kind);
    try {
      if (kind === "retry") await api.retry(incident.id);
      else await api.storeTask(incident.id);
      await onActed();
      toast.success(
        kind === "retry"
          ? "ESL retry sent — re-checking shelf-label acknowledgement."
          : "Store verification task created for an associate.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={clsx(
        "mt-4 rounded-xl border px-3 py-3 text-xs",
        breached
          ? "border-rose-500/30 bg-rose-500/5 text-rose-200"
          : "border-amber-500/30 bg-amber-500/5 text-amber-200",
      )}
    >
      <p className="leading-relaxed">
        {breached
          ? "Deadline passed and the shelf label still has not acknowledged the markdown — in-store shoppers may not have seen the lower price in time."
          : "Shelf label has not acknowledged the markdown yet. It may not be visible to in-store shoppers before the deadline."}
      </p>

      {/* Recovery actions — real endpoints when an incident exists, deep-link
          otherwise. Never a dead button. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actionable ? (
          <>
            <button
              onClick={() => run("retry")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[.06] px-2.5 py-1.5 font-medium text-white transition hover:bg-white/[.12] active:scale-[0.98] disabled:opacity-40"
            >
              <RotateCcw className={clsx("h-3.5 w-3.5", busy === "retry" && "animate-spin")} />
              Retry ESL Update
            </button>
            <button
              onClick={() => run("task")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[.06] px-2.5 py-1.5 font-medium text-white transition hover:bg-white/[.12] active:scale-[0.98] disabled:opacity-40"
            >
              <ClipboardList className={clsx("h-3.5 w-3.5", busy === "task" && "animate-spin")} />
              Assign Associate Verification
            </button>
            <Link
              href={`/operations/incidents/${incident.id}`}
              className="inline-flex items-center gap-1 text-[11px] underline-offset-2 hover:underline"
            >
              Open incident <ArrowRight className="h-3 w-3" />
            </Link>
          </>
        ) : incident ? (
          // Incident exists but is already resolved/rolled back — link to the
          // preserved record rather than offer a no-op recovery button.
          <Link
            href={`/operations/incidents/${incident.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[.06] px-2.5 py-1.5 font-medium text-white transition hover:bg-white/[.12] active:scale-[0.98]"
          >
            View recovered incident <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          // No incident has fired for this action yet — send the operator to
          // the incident surface to retry the ESL or assign an associate.
          <Link
            href="/operations/incidents"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[.06] px-2.5 py-1.5 font-medium text-white transition hover:bg-white/[.12] active:scale-[0.98]"
          >
            Retry ESL or assign an associate <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Measurement attribution — honest gate state, not a control. While the
          shelf label is unverified the sell-through measurement is excluded. */}
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-violet-500/25 bg-violet-500/[.06] px-2.5 py-1.5 text-violet-200">
        <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
        <span>
          <span className="font-semibold">Measurement attribution quarantined.</span>{" "}
          Sell-through results stay excluded until the shelf label is verified — the gate
          lifts automatically once ESL acknowledges the markdown.
        </span>
      </div>
    </div>
  );
}
