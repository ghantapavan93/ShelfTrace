"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Database,
  ExternalLink,
  Download,
  Rocket,
  ShieldCheck,
  Sprout,
  Package,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import type { SourceObservation } from "@/lib/types";

const SOURCE_META: Record<
  string,
  { label: string; icon: React.ElementType; tone: string; description: string; cta: string }
> = {
  usda_fdc: {
    label: "USDA FoodData Central",
    icon: Package,
    tone: "border-sky-500/30 bg-sky-500/5",
    description: "Real branded grocery product identity and UPC/category information. CC0 public domain.",
    cta: "Import organic whole milk record",
  },
  usda_ams: {
    label: "USDA AMS Market News",
    icon: Sprout,
    tone: "border-emerald-500/30 bg-emerald-500/5",
    description:
      "Real advertised/auction produce-price observations from USDA Specialty Crops Market News.",
    cta: "Import strawberries observation",
  },
  open_prices: {
    label: "Open Prices",
    icon: Users,
    tone: "border-violet-500/30 bg-violet-500/5",
    description:
      "Crowdsourced product-price observations. Labeled clearly as community data, replay-only.",
    cta: "Coming soon",
  },
};

const input =
  "w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white outline-none focus:border-brand/50";
const label = "text-[11px] uppercase tracking-wide text-slate-500";

export default function DataReplayPage() {
  const router = useRouter();
  const [observations, setObservations] = useState<SourceObservation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SourceObservation | null>(null);
  // Scenario form
  const [mode, setMode] = useState<"live_rollout" | "certification">("live_rollout");
  const [stores, setStores] = useState("501,502");
  const [canary, setCanary] = useState("501");
  const [approved, setApproved] = useState<string>("");
  const [previous, setPrevious] = useState<string>("");
  const [eslBehavior, setEslBehavior] = useState<string>("default");

  async function refresh() {
    setObservations(await api.sourceObservations().catch(() => []));
  }
  useEffect(() => {
    refresh();
  }, []);

  async function importSource(kind: "usda_fdc" | "usda_ams") {
    setBusy(`import-${kind}`);
    setError(null);
    try {
      if (kind === "usda_fdc") await api.importUsdaFdc();
      else await api.importUsdaAms();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function selectObs(o: SourceObservation) {
    setSelected(o);
    setApproved(o.observed_price ? String(o.observed_price) : "");
    setPrevious("");
    setEslBehavior(o.observation_type === "advertised_price" ? "default" : "success");
  }

  async function runThroughShelfTrace() {
    if (!selected) return;
    setBusy("run");
    setError(null);
    const storeIds = stores.split(",").map((s) => s.trim()).filter(Boolean);
    const canaryIds = canary.split(",").map((s) => s.trim()).filter(Boolean);
    // Strawberry replay default keeps ESL=timeout_then_success via the backend default;
    // otherwise an explicit override is sent.
    const behaviors =
      eslBehavior === "default"
        ? undefined
        : eslBehavior === "success"
          ? []
          : [
              {
                store_id: canaryIds[0] || storeIds[0],
                sku: selected.normalized?.sku_hint ?? selected.gtin_upc ?? `obs-${selected.id}`,
                channel_type: "esl",
                behavior_type: eslBehavior,
              },
            ];
    const body = {
      mode,
      store_ids: storeIds,
      canary_store_ids: canaryIds,
      approved_price: approved ? Number(approved) : null,
      previous_price: previous ? Number(previous) : null,
      behaviors,
    };
    try {
      const res = await api.createScenarioFromObservation(selected.id, body);
      router.push(res.redirect);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const haveFdc = observations.some((o) => o.source.source_type === "usda_fdc");
  const haveAms = observations.some((o) => o.source.source_type === "usda_ams");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Real Data <span className="iris-text">Replay</span></h1>
        <p className="mt-1 text-slate-400">
          Import public grocery records, preserve source lineage, and test price execution safety through the same
          ShelfTrace reliability engine. Connectors stay simulated; ShelfTrace does not decide the optimal price.
        </p>
      </div>

      {/* Source cards */}
      <section className="grid gap-4 lg:grid-cols-3">
        {([
          { key: "usda_fdc", have: haveFdc, onImport: () => importSource("usda_fdc") },
          { key: "usda_ams", have: haveAms, onImport: () => importSource("usda_ams") },
          { key: "open_prices", have: false, onImport: undefined as undefined | (() => void) },
        ] as const).map((c) => {
          const m = SOURCE_META[c.key];
          const Icon = m.icon;
          return (
            <div key={c.key} className={clsx("holo-card rounded-2xl p-5", m.tone)}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-300">
                <Icon className="h-4 w-4" /> {m.label}
              </div>
              <p className="mt-3 text-sm text-slate-400">{m.description}</p>
              <button
                onClick={c.onImport}
                disabled={busy !== null || c.onImport === undefined}
                className="mt-4 flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-40"
              >
                <Download className={clsx("h-3.5 w-3.5", busy === `import-${c.key}` && "animate-pulse")} />
                {c.have ? "Re-import (idempotent)" : m.cta}
              </button>
            </div>
          );
        })}
      </section>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-2.5 text-sm text-rose-200">{error}</div>
      )}

      {/* Imported observations + create-scenario form */}
      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="holo-card rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">Imported observations</h2>
          <div className="space-y-2">
            {observations.length === 0 && (
              <div className="text-xs text-slate-500">No observations imported yet. Use a source card above.</div>
            )}
            {observations.map((o) => (
              <button
                key={o.id}
                onClick={() => selectObs(o)}
                className={clsx(
                  "w-full rounded-xl border px-4 py-3 text-left transition",
                  selected?.id === o.id
                    ? "border-brand/50 bg-brand/5"
                    : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                    {o.source.source_type.replace("_", " ")}
                  </span>
                  <span className="font-medium text-white">{o.product_name}</span>
                  {o.brand && <span className="text-xs text-slate-400">· {o.brand}</span>}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {o.observation_type === "advertised_price"
                    ? `Observed $${o.observed_price?.toFixed?.(2) ?? o.observed_price} · ${o.region ?? ""} · ${o.observation_date ?? ""}`
                    : `${o.gtin_upc ? "GTIN " + o.gtin_upc : ""}${o.category ? " · " + o.category : ""}`}
                </div>
                <div className="mt-1 truncate text-[10px] text-slate-600">
                  {o.source.source_name}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="holo-card iris-border glow-iris rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">Create execution scenario</h2>
          {!selected ? (
            <p className="text-xs text-slate-500">Select an observation to build a scenario from it.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-white/5 bg-black/30 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Source</div>
                <div className="mt-1 text-sm text-white">{selected.source.source_name}</div>
                <div className="mt-1 text-xs text-slate-400">{selected.source.attribution_text}</div>
                <a
                  href={selected.source.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-400 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> {selected.source.source_url}
                </a>
                <div className="mt-2 text-[10px] text-slate-500">{selected.source.license_or_usage_note}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className={label}>Mode</div>
                  <select className={input} value={mode} onChange={(e) => setMode(e.target.value as never)}>
                    <option value="live_rollout">Live Control Plane</option>
                    <option value="certification">Certification Lab</option>
                  </select>
                </div>
                <div>
                  <div className={label}>ESL behavior</div>
                  <select className={input} value={eslBehavior} onChange={(e) => setEslBehavior(e.target.value)}>
                    <option value="default">Default for source</option>
                    <option value="success">Success</option>
                    <option value="timeout_then_success">Timeout, then success</option>
                    <option value="timeout">Timeout</option>
                  </select>
                </div>
                <div>
                  <div className={label}>Stores</div>
                  <input className={input} value={stores} onChange={(e) => setStores(e.target.value)} />
                </div>
                <div>
                  <div className={label}>Canary stores</div>
                  <input className={input} value={canary} onChange={(e) => setCanary(e.target.value)} />
                </div>
                <div>
                  <div className={label}>Approved $ (required)</div>
                  <input
                    className={input}
                    type="number"
                    step="0.01"
                    value={approved}
                    onChange={(e) => setApproved(e.target.value)}
                    placeholder={selected.observed_price ? String(selected.observed_price) : "e.g. 5.99"}
                  />
                </div>
                <div>
                  <div className={label}>Previous $ (optional)</div>
                  <input
                    className={input}
                    type="number"
                    step="0.01"
                    value={previous}
                    onChange={(e) => setPrevious(e.target.value)}
                    placeholder="defaults to ~10% above approved"
                  />
                </div>
              </div>
              <button
                onClick={runThroughShelfTrace}
                disabled={busy !== null || !approved}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow-brand transition hover:brightness-110 disabled:opacity-50"
              >
                {mode === "certification" ? <ShieldCheck className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
                Run Through ShelfTrace
              </button>
              <p className="text-[10px] text-slate-500">
                Creates a scenario carrying this source observation&apos;s lineage and routes it through the same
                PostgreSQL outbox, Outbox Drain (inline), adapter, reconciliation and audit pipeline. You&apos;ll land on the
                generated incident or certification report.
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Database className="h-3.5 w-3.5 text-violet-300" />
        Public-source data only. ShelfTrace does not decide the optimal price; it tests whether an approved price
        safely reaches store systems.
      </div>
    </div>
  );
}
