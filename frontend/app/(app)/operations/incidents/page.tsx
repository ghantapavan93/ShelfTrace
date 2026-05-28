"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, AlertTriangle, Clock, ShieldCheck, Filter, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { api, DEMO_BATCH } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money, dateTimeOf } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import { ListSkeleton } from "@/components/Skeleton";
import { useWorkMode } from "@/components/ModeProvider";
import type { IncidentView } from "@/lib/types";

type Filter = "all" | "open" | "resolved" | "critical" | "warning";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "critical", label: "Critical" },
  { id: "warning", label: "Warnings" },
  { id: "resolved", label: "Resolved" },
];

export default function IncidentsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { mode, isHydrated } = useWorkMode();
  const isLiveWorkMode = isHydrated && mode === "live";
  // Pass scope=live to the backend so the source_run_id filter runs there
  // (not just the client-side denylist below) — keeps demo incidents off the
  // wire entirely and survives any future seeded batch id.
  const workScope = isLiveWorkMode ? "live" : undefined;
  const { data, error } = useLive<IncidentView[]>(
    () => api.incidents(workScope),
    [workScope],
  );

  // In Live mode, drop incidents that come from the seeded Memorial Day
  // batch, the Realistic Scale catalog, or certification sandbox runs —
  // same rule the BatchPicker uses. Mode-filter runs BEFORE the user's
  // status/severity filter so the visible counts reflect "only your data."
  const modeScoped = useMemo(() => {
    if (!data) return [];
    if (!isLiveWorkMode) return data;
    return data.filter(
      (i) =>
        i.batch_external_id !== DEMO_BATCH &&
        i.batch_external_id !== "realistic-scale-catalog" &&
        !i.batch_external_id.startsWith("certification-"),
    );
  }, [data, isLiveWorkMode]);

  const filtered = useMemo(() => {
    return modeScoped.filter((i) => {
      if (filter === "all") return true;
      if (filter === "open") return i.status === "open" || i.status === "retrying";
      if (filter === "resolved") return i.status === "resolved" || i.status === "rolled_back";
      if (filter === "critical") return i.severity === "critical";
      if (filter === "warning") return i.severity === "warning" || i.severity === "urgent";
      return true;
    });
  }, [modeScoped, filter]);

  // Group by batch external_id so user can see "MY scenario's incidents"
  const groupedByBatch = useMemo(() => {
    const groups = new Map<string, IncidentView[]>();
    filtered.forEach((i) => {
      const key = i.batch_external_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    });
    return Array.from(groups.entries());
  }, [filtered]);

  if (error)
    return (
      <div className="glass rounded-2xl p-6 text-slate-300">
        Could not load incidents.
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/operations"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-3 w-3" /> Back to command center
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">Incidents</h1>
          <p className="text-sm text-slate-400">
            Execution failures detected during canary verification.
          </p>
        </div>
        {data && data.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
              <Filter className="h-3 w-3 text-slate-500" />
              <span className="text-slate-500">Filter</span>
            </div>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={clsx(
                  "rounded-lg border px-2.5 py-1.5 transition",
                  filter === f.id
                    ? "border-brand/40 bg-brand/10 text-brand-400"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!data ? (
        <ListSkeleton rows={4} />
      ) : groupedByBatch.length === 0 ? (
        <EmptyState
          filter={filter}
          totalIncidents={data.length}
          modeScopedCount={modeScoped.length}
          isLiveWorkMode={isLiveWorkMode}
        />
      ) : (
        <div className="space-y-6">
          {groupedByBatch.map(([batchExternalId, incidents]) => (
            <div key={batchExternalId} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">
                  {incidents[0].zone} · {incidents.length} incident
                  {incidents.length === 1 ? "" : "s"}
                </div>
                <Link
                  href={`/operations?external_id=${batchExternalId}`}
                  className="mono inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
                >
                  {batchExternalId} <ArrowRight className="h-2.5 w-2.5" />
                </Link>
              </div>
              <div className="space-y-3">
                {incidents.map((i) => (
                  <IncidentCard key={i.id} incident={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentCard({ incident: i }: { incident: IncidentView }) {
  const resolved = i.status === "resolved" || i.status === "rolled_back";
  return (
    <Link
      href={`/operations/incidents/${i.id}`}
      className="glass flex items-center gap-4 rounded-2xl p-4 transition hover:bg-white/[0.06]"
    >
      <span
        className={clsx(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
          resolved
            ? "border-emerald-500/40 bg-emerald-500/10 text-verified"
            : i.severity === "critical"
              ? "border-rose-500/40 bg-rose-500/10 text-danger"
              : "border-amber-500/40 bg-amber-500/10 text-warn",
        )}
      >
        {resolved ? (
          <ShieldCheck className="h-5 w-5" />
        ) : i.severity === "critical" ? (
          <AlertTriangle className="h-5 w-5" />
        ) : (
          <Clock className="h-5 w-5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-white">{i.product_name}</span>
          <StatusPill value={i.status} />
        </div>
        <p className="truncate text-xs text-slate-400">{i.summary}</p>
      </div>
      <div className="hidden text-right text-xs text-slate-500 sm:block">
        <div>Store {i.store_id}</div>
        <div className="mono">
          {money(i.approved_price)}
          {i.observed_price != null && ` → ${money(i.observed_price)}`}
        </div>
        <div>{dateTimeOf(i.created_at)}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-500" />
    </Link>
  );
}

function EmptyState({
  filter,
  totalIncidents,
  modeScopedCount,
  isLiveWorkMode,
}: {
  filter: Filter;
  totalIncidents: number;
  modeScopedCount: number;
  isLiveWorkMode: boolean;
}) {
  // Live-mode-specific: incidents exist in the DB but they all came from
  // the seeded demo or certification runs. Tell the user that explicitly
  // so the empty list doesn't feel broken.
  if (isLiveWorkMode && modeScopedCount === 0 && totalIncidents > 0) {
    return (
      <div className="glass rounded-2xl border border-violet-500/25 bg-violet-500/[.04] p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-500/40 bg-violet-500/10 text-violet-200">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-white">
              No live incidents yet
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              {totalIncidents} demo/certification incident
              {totalIncidents === 1 ? " is" : "s are"} hidden in Live mode.
              Run a scenario with an intentional connector failure to see one
              fire on your data.
            </p>
          </div>
        </div>
        <Link
          href="/scenarios"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"
        >
          Open Scenarios &amp; pick a failure preset <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  // Differentiate "no incidents exist at all" vs "filter excludes everything"
  if (totalIncidents === 0) {
    return (
      <div className="glass rounded-2xl border border-emerald-500/25 p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-verified">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-white">
              No incidents — everything verified
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Every batch's actions confirmed across every channel. Nothing to investigate.
            </p>
          </div>
        </div>
        <Link
          href="/scenarios"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"
        >
          Run a custom scenario to see one fire <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6 text-sm text-slate-400">
      No incidents match the <span className="font-medium text-white">{filter}</span> filter.{" "}
      {totalIncidents} total exist — try a different filter above.
    </div>
  );
}
