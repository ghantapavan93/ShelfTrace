"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
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

type Mode = "live_rollout" | "certification";

export default function EngineeringPage() {
  const [mode, setMode] = useState<Mode>("live_rollout");

  // Honor ?mode=certification deep link from the Certification Lab.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("mode=certification")) {
      setMode("certification");
    }
  }, []);

  const { data, error } = useLive<EngineeringTrace>(() => api.engineering({ runMode: mode }), [mode]);

  if (error) return <div className="glass rounded-2xl p-6 text-slate-300">Could not load engineering trace.</div>;
  if (!data) return <div className="text-slate-400">Loading trace…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Engineering Execution Trace</h1>
          <p className="text-sm text-slate-400">From approved batch to verified store rollout — the real pipeline.</p>
        </div>
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 text-xs">
          {(["certification", "live_rollout"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx(
                "rounded-lg px-3 py-1.5 font-medium transition",
                mode === m ? "bg-brand text-white" : "text-slate-300 hover:text-white",
              )}
            >
              {m === "certification" ? "Certification Run" : "Live Rollout"}
            </button>
          ))}
        </div>
      </div>

      {/* Shared-engine statement (real run context) */}
      <div className="glass rounded-2xl border border-violet-500/20 p-4">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-300">
          One shared reliability engine · viewing <span className="text-white">{data.run_mode}</span> ({data.environment})
          {data.scenario_config_id && (
            <span className="mono rounded bg-white/5 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-slate-400">
              scenario {data.scenario_config_id}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-slate-300">{data.shared_engine_statement}</p>
      </div>

      {/* Source lineage: only present when the scenario was created from a real public-data record */}
      {data.source_lineage && (
        <div className="glass rounded-2xl border border-sky-500/25 p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest text-sky-300">
            Source lineage · public-data replay
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Source</div>
              <div className="text-white">{data.source_lineage.source.source_name}</div>
              <a
                href={data.source_lineage.source.source_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="mono text-[11px] text-brand-400 hover:underline"
              >
                {data.source_lineage.source.source_url}
              </a>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Record</div>
              <div className="mono text-slate-200">{data.source_lineage.external_record_id}</div>
              <div className="text-xs text-slate-400">
                {data.source_lineage.product_name}
                {data.source_lineage.brand && ` · ${data.source_lineage.brand}`}
                {data.source_lineage.gtin_upc && ` · GTIN ${data.source_lineage.gtin_upc}`}
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-3 text-xs text-slate-400 sm:grid-cols-3">
            <div>
              <span className="text-slate-500">Observation type:</span> {data.source_lineage.observation_type}
            </div>
            {data.source_lineage.observed_price != null && (
              <div>
                <span className="text-slate-500">Observed:</span> ${data.source_lineage.observed_price}
              </div>
            )}
            {data.source_lineage.observation_date && (
              <div>
                <span className="text-slate-500">Date:</span> {data.source_lineage.observation_date}
              </div>
            )}
            {data.source_lineage.region && (
              <div>
                <span className="text-slate-500">Region:</span> {data.source_lineage.region}
              </div>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            {data.source_lineage.source.attribution_text}
          </p>
          <p className="mt-1 text-[10px] italic text-slate-600">
            {data.source_lineage.source.license_or_usage_note}
          </p>
        </div>
      )}

      {/* Connector behavior profiles applied for this run */}
      <div className="glass rounded-2xl p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Connector Behavior Profiles Applied</h3>
          {data.incident_from_configured_behavior && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-warn">
              Incident created from configured behavior
            </span>
          )}
        </div>
        {data.behavior_profiles.length === 0 ? (
          <p className="text-xs text-slate-500">No behavior overrides — every channel configured to succeed.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-white/5">
                  <th className="py-2 pr-3 font-medium">Store</th>
                  <th className="py-2 pr-3 font-medium">SKU</th>
                  <th className="py-2 pr-3 font-medium">Channel</th>
                  <th className="py-2 pr-3 font-medium">Behavior</th>
                  <th className="py-2 pr-3 font-medium">Observed $</th>
                  <th className="py-2 pr-3 font-medium">Retry $</th>
                  <th className="py-2 font-medium">Delay ms</th>
                </tr>
              </thead>
              <tbody>
                {data.behavior_profiles.map((b, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="py-2 pr-3 text-slate-300">{b.store_id}</td>
                    <td className="mono py-2 pr-3 text-slate-300">{b.sku}</td>
                    <td className="py-2 pr-3 text-slate-300">{b.channel.toUpperCase()}</td>
                    <td className="py-2 pr-3 text-warn">{b.behavior}</td>
                    <td className="py-2 pr-3 text-slate-400">{b.configured_observed_price ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-400">{b.retry_success_price ?? "—"}</td>
                    <td className="py-2 text-slate-400">{b.configured_delay_ms ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
