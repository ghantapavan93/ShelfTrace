"use client";

import Link from "next/link";
import { ArrowRight, AlertTriangle, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money, dateTimeOf } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import type { IncidentView } from "@/lib/types";

export default function IncidentsPage() {
  const { data, error } = useLive<IncidentView[]>(() => api.incidents());

  if (error) return <div className="glass rounded-2xl p-6 text-slate-300">Could not load incidents.</div>;
  if (!data) return <div className="text-slate-400">Loading incidents…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Incidents</h1>
        <p className="text-sm text-slate-400">Execution failures detected during canary verification.</p>
      </div>
      <div className="space-y-3">
        {data.map((i) => (
          <Link
            key={i.id}
            href={`/operations/incidents/${i.id}`}
            className="glass flex items-center gap-4 rounded-2xl p-4 transition hover:bg-white/[0.06]"
          >
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
                i.severity === "critical"
                  ? "border-rose-500/40 bg-rose-500/10 text-danger"
                  : "border-amber-500/40 bg-amber-500/10 text-warn"
              }`}
            >
              {i.severity === "critical" ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{i.product_name}</span>
                <StatusPill value={i.status} />
              </div>
              <p className="truncate text-xs text-slate-400">{i.summary}</p>
            </div>
            <div className="hidden text-right text-xs text-slate-500 sm:block">
              <div>Store {i.store_id}</div>
              <div className="mono">
                {money(i.approved_price)} → {money(i.observed_price)}
              </div>
              <div>{dateTimeOf(i.created_at)}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-500" />
          </Link>
        ))}
        {data.length === 0 && <div className="glass rounded-2xl p-6 text-slate-400">No incidents. All clear.</div>}
      </div>
    </div>
  );
}
