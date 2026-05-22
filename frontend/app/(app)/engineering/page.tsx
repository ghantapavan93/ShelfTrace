"use client";

import clsx from "clsx";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { api, DEMO_BATCH } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { timeOf } from "@/lib/format";
import type { EngineeringTrace } from "@/lib/types";

function Json({ value }: { value: unknown }) {
  return (
    <pre className="mono max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-slate-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function EngineeringPage() {
  const { data, error } = useLive<EngineeringTrace>(() => api.engineering(DEMO_BATCH));

  if (error) return <div className="glass rounded-2xl p-6 text-slate-300">Could not load engineering trace.</div>;
  if (!data) return <div className="text-slate-400">Loading trace…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Engineering Execution Trace</h1>
        <p className="text-sm text-slate-400">From approved batch to verified store rollout — the real pipeline.</p>
      </div>

      {/* Pipeline strip */}
      <div className="glass-strong rounded-2xl p-5">
        <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
          {data.pipeline.map((s, i) => (
            <div key={s.stage} className="flex items-center gap-2">
              <div
                className={clsx(
                  "min-w-[150px] rounded-xl border px-3 py-3",
                  s.status === "blocked"
                    ? "border-rose-500/40 bg-rose-500/5 shadow-glow-danger"
                    : "border-emerald-500/25 bg-emerald-500/5",
                )}
              >
                <div className="text-[11px] font-semibold text-white">{s.stage}</div>
                <div className="mono mt-1 text-[10px] text-slate-400">{s.detail}</div>
              </div>
              {i < data.pipeline.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Outbox */}
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Outbox Events ({data.outbox_events.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-white/5">
                  <th className="py-2 pr-2 font-medium">Type</th>
                  <th className="py-2 pr-2 font-medium">Status</th>
                  <th className="py-2 pr-2 font-medium">Att.</th>
                  <th className="py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.outbox_events.map((e) => (
                  <tr key={e.id} className="border-b border-white/5 last:border-0">
                    <td className="mono py-2 pr-2 text-slate-300">{e.event_type}</td>
                    <td className="py-2 pr-2">
                      <span
                        className={clsx(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          e.status === "processed"
                            ? "bg-emerald-500/10 text-verified"
                            : e.status === "retrying"
                              ? "bg-amber-500/10 text-warn"
                              : "bg-white/5 text-slate-400",
                        )}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-slate-400">{e.attempts}</td>
                    <td className="py-2 text-slate-500">{timeOf(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Test proof */}
        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">Test Proof</h3>
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-verified">PASSED</span>
          </div>
          <div className="mono rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed">
            <div className="text-slate-400">$ {data.test_proof.command}</div>
            {data.test_proof.tests.map((t) => (
              <div key={t} className="flex justify-between gap-2">
                <span className="truncate text-slate-300">{t}</span>
                <span className="text-verified">PASSED</span>
              </div>
            ))}
            <div className="mt-2 flex items-center gap-1.5 text-verified">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {data.test_proof.passed} passed in {data.test_proof.duration_s}s
            </div>
          </div>
        </div>

        {/* Raw receipt */}
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Raw Adapter Receipt</h3>
          <Json value={data.raw_receipt} />
        </div>

        {/* Reconciliation result */}
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Reconciliation Result</h3>
          <Json value={data.reconciliation_result} />
        </div>
      </div>
    </div>
  );
}
