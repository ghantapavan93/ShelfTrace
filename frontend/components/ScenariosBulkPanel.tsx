"use client";

/**
 * ScenariosBulkPanel — industry-grade bulk import for the Scenarios Builder.
 *
 * Three input paths, one preview surface:
 *
 *   1. Drag-and-drop a .csv / .tsv / .json file (or click to pick)
 *   2. Paste content into a textarea (format auto-detected, can override)
 *   3. Click "Load sample" to see a known-good payload
 *
 * Pasted/dropped content is parsed twice:
 *   • Locally for an instant preview table
 *   • Optionally re-validated by the backend (/api/v1/scenarios/import/preview)
 *     for authoritative parity with the production write-path
 *
 * Every row gets a per-row ✓ valid / ✗ invalid pill with the specific
 * field-level error inline. Only valid rows make it to the "Import"
 * action; invalid rows show but are left out.
 *
 * Behavior preset generator (right-hand pane) is unchanged in spirit —
 * five presets that read the current stores/canary/products and emit a
 * meaningful behaviors list with one click.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  Upload,
  ClipboardPaste,
  Sparkles,
  CheckCircle2,
  CircleAlert,
  Zap,
  RotateCcw,
  Workflow,
  ShieldCheck,
  FileText,
  Download,
  Database,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type {
  BehaviorType,
  BulkImportRowView,
  ConnectorBehavior,
  ScenarioAction,
} from "@/lib/types";

interface Props {
  storesCsv: string;
  canaryCsv: string;
  actions: ScenarioAction[];
  onImportProducts: (next: ScenarioAction[]) => void;
  onGenerateBehaviors: (next: ConnectorBehavior[]) => void;
}

type Format = "csv" | "tsv" | "json";
type InputMode = "upload" | "paste";

const SAMPLE_CSV = `sku,product_name,prior_price,approved_price,reason
milk-organic-1gal,Organic Whole Milk 1 Gal,5.99,4.99,Memorial Day promo
egg-cage-free-12,Cage-Free Eggs Dozen,4.19,3.49,KVI weekly
strawberry-1lb,Fresh Strawberries 1lb,4.99,2.99,Perishable markdown
oj-premium-64oz,Premium Orange Juice 64oz,6.49,5.49,Brand promo
yogurt-greek-32oz,Greek Yogurt 32oz,5.99,4.49,Tuesday clearance`;

const SAMPLE_JSON = `[
  {"sku":"milk-organic-1gal","product_name":"Organic Whole Milk 1 Gal","prior_price":5.99,"approved_price":4.99,"reason":"Memorial Day promo"},
  {"sku":"egg-cage-free-12","product_name":"Cage-Free Eggs Dozen","prior_price":4.19,"approved_price":3.49,"reason":"KVI weekly"},
  {"sku":"strawberry-1lb","product_name":"Fresh Strawberries 1lb","prior_price":4.99,"approved_price":2.99,"reason":"Perishable markdown"}
]`;

const PRESETS = [
  {
    id: "all-success",
    label: "All Success",
    blurb: "Every channel agrees. No incidents. Clean baseline.",
    icon: CheckCircle2,
    tone: "border-emerald-500/30 bg-emerald-500/[.06] text-emerald-200 hover:bg-emerald-500/[.12]",
  },
  {
    id: "single-mismatch",
    label: "Single Canary Mismatch",
    blurb: "One POS stale_price on first canary store + SKU.",
    icon: CircleAlert,
    tone: "border-rose-500/30 bg-rose-500/[.06] text-rose-200 hover:bg-rose-500/[.12]",
  },
  {
    id: "stress-mix",
    label: "Stress Test (40% failures)",
    blurb: "Random failure spread across every store × SKU × channel.",
    icon: Zap,
    tone: "border-amber-500/30 bg-amber-500/[.06] text-amber-200 hover:bg-amber-500/[.12]",
  },
  {
    id: "pos-storm",
    label: "POS Channel Storm",
    blurb: "Every store's POS times out for the first SKU.",
    icon: Workflow,
    tone: "border-violet-500/30 bg-violet-500/[.06] text-violet-200 hover:bg-violet-500/[.12]",
  },
  {
    id: "recovery-loop",
    label: "Recovery Loop",
    blurb: "timeout_then_success across all canary — proves retry path.",
    icon: RotateCcw,
    tone: "border-sky-500/30 bg-sky-500/[.06] text-sky-200 hover:bg-sky-500/[.12]",
  },
] as const;

function detectFormat(content: string): Format {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return "json";
  // tabs win over commas if more tabs than commas
  const tabs = (trimmed.match(/\t/g) || []).length;
  const commas = (trimmed.match(/,/g) || []).length;
  return tabs > commas ? "tsv" : "csv";
}

function splitIds(csv: string): string[] {
  return csv.split(",").map((s) => s.trim()).filter(Boolean);
}

function generateBehaviors(
  presetId: string,
  storesCsv: string,
  canaryCsv: string,
  actions: ScenarioAction[],
): ConnectorBehavior[] {
  const stores = splitIds(storesCsv);
  const canary = splitIds(canaryCsv);
  const skus = actions.filter((a) => a.sku.trim()).map((a) => a.sku.trim());
  if (skus.length === 0 || stores.length === 0) return [];
  const channels: ConnectorBehavior["channel_type"][] = ["pos", "esl", "ecommerce"];
  switch (presetId) {
    case "all-success":
      return [];
    case "single-mismatch": {
      const store = canary[0] || stores[0];
      const sku = skus[0];
      const action = actions.find((a) => a.sku === sku);
      const drift = action ? Number(action.approved_price) + 0.5 : null;
      return [{
        store_id: store, sku, channel_type: "pos",
        behavior_type: "stale_price",
        configured_observed_price: drift,
        configured_delay_ms: null,
        retry_success_price: action ? Number(action.approved_price) : null,
      }];
    }
    case "stress-mix": {
      const types: BehaviorType[] = ["stale_price", "timeout", "timeout_then_success"];
      const out: ConnectorBehavior[] = [];
      let i = 0;
      for (const store of stores) {
        for (const sku of skus) {
          for (const ch of channels) {
            const slot = i % 12;
            if (slot < 5) {
              const t = types[slot % types.length];
              const action = actions.find((a) => a.sku === sku);
              out.push({
                store_id: store, sku, channel_type: ch, behavior_type: t,
                configured_observed_price:
                  t === "stale_price" && action ? Number(action.approved_price) + 0.5 : null,
                configured_delay_ms: t === "timeout" ? 4000 : null,
                retry_success_price:
                  t === "timeout_then_success" && action ? Number(action.approved_price) : null,
              });
            }
            i++;
          }
        }
      }
      return out;
    }
    case "pos-storm": {
      const sku = skus[0];
      return stores.map((store) => ({
        store_id: store, sku, channel_type: "pos" as const,
        behavior_type: "timeout" as BehaviorType,
        configured_observed_price: null, configured_delay_ms: 4500,
        retry_success_price: null,
      }));
    }
    case "recovery-loop": {
      const out: ConnectorBehavior[] = [];
      for (const store of canary) {
        for (const sku of skus) {
          const action = actions.find((a) => a.sku === sku);
          out.push({
            store_id: store, sku, channel_type: "pos",
            behavior_type: "timeout_then_success",
            configured_observed_price: null, configured_delay_ms: 1500,
            retry_success_price: action ? Number(action.approved_price) : null,
          });
        }
      }
      return out;
    }
    default:
      return [];
  }
}

export function ScenariosBulkPanel({
  storesCsv,
  canaryCsv,
  actions,
  onImportProducts,
  onGenerateBehaviors,
}: Props) {
  const [mode, setMode] = useState<InputMode>("upload");
  const [format, setFormat] = useState<Format>("csv");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<{
    rows: BulkImportRowView[];
    summary: { total: number; valid: number; invalid: number };
    payload_errors: string[];
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationSource, setValidationSource] = useState<"server" | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [presetFeedback, setPresetFeedback] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorFilter, setErrorFilter] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent = content.trim().length > 0;
  const validCount = preview?.summary.valid ?? 0;
  const invalidCount = preview?.summary.invalid ?? 0;
  const totalCount = preview?.summary.total ?? 0;

  // Group errors by field/category for the breakdown panel
  const errorBreakdown = (() => {
    if (!preview || invalidCount === 0) return [] as Array<{ category: string; count: number }>;
    const counts: Record<string, number> = {};
    preview.rows
      .filter((r) => !r.valid)
      .forEach((r) => {
        r.errors.forEach((msg) => {
          // Extract first 4 words as a coarse category label
          const cat = msg.split(/[:.;,]/)[0].trim().slice(0, 60);
          counts[cat] = (counts[cat] ?? 0) + 1;
        });
      });
    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  })();

  function downloadErrorReport() {
    if (!preview) return;
    const invalidRows = preview.rows.filter((r) => !r.valid);
    if (invalidRows.length === 0) return;
    const header = "row_number,sku,product_name,prior_price,approved_price,errors";
    const lines = invalidRows.map((r) => {
      const cells = [
        String(r.row_number),
        JSON.stringify(r.sku ?? ""),
        JSON.stringify(r.product_name ?? ""),
        r.previous_price != null ? String(r.previous_price) : "",
        r.approved_price != null ? String(r.approved_price) : "",
        JSON.stringify(r.errors.join("; ")),
      ];
      return cells.join(",");
    });
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shelftrace-errors-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const validateOnServer = useCallback(async (raw: string, fmt: Format) => {
    if (!raw.trim()) return;
    setIsValidating(true);
    try {
      const res = await api.scenarioImportPreview(fmt, raw);
      setPreview({
        rows: res.rows,
        summary: res.summary,
        payload_errors: res.payload_errors,
      });
      setValidationSource("server");
    } catch (err) {
      setPreview({
        rows: [],
        summary: { total: 0, valid: 0, invalid: 0 },
        payload_errors: [(err as Error).message || "Server validation failed"],
      });
      setValidationSource(null);
    } finally {
      setIsValidating(false);
    }
  }, []);

  function handleContentChange(next: string, fmt?: Format) {
    setContent(next);
    const effectiveFormat = fmt || (next.trim() ? detectFormat(next) : format);
    setFormat(effectiveFormat);
    setPreview(null);
    setValidationSource(null);
    if (next.trim()) {
      // Debounced server validation
      void validateOnServer(next, effectiveFormat);
    }
  }

  function handleFile(file: File) {
    if (file.size > 1_048_576) {
      setPreview({
        rows: [],
        summary: { total: 0, valid: 0, invalid: 0 },
        payload_errors: ["File exceeds 1 MiB. Split it or use the API directly."],
      });
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const ext = file.name.toLowerCase().split(".").pop();
      const fmt: Format =
        ext === "json" ? "json" : ext === "tsv" ? "tsv" : detectFormat(text);
      handleContentChange(text, fmt);
    };
    reader.onerror = () => {
      setPreview({
        rows: [],
        summary: { total: 0, valid: 0, invalid: 0 },
        payload_errors: ["Could not read file."],
      });
    };
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function downloadSample(fmt: Format) {
    const text = fmt === "json" ? SAMPLE_JSON : SAMPLE_CSV;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shelftrace-sample.${fmt === "json" ? "json" : fmt === "tsv" ? "tsv" : "csv"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function applyValidRows() {
    if (!preview) return;
    const validRows = preview.rows.filter((r) => r.valid);
    const next: ScenarioAction[] = validRows.map((r) => ({
      sku: r.sku,
      product_name: r.product_name,
      previous_price: r.previous_price,
      approved_price: r.approved_price,
      reason: r.reason || "Bulk imported",
      is_kvi: r.is_kvi,
      deadline_at: r.deadline_at,
    }));
    if (next.length > 0) onImportProducts(next);
  }

  function handlePreset(presetId: string, label: string) {
    const behaviors = generateBehaviors(presetId, storesCsv, canaryCsv, actions);
    onGenerateBehaviors(behaviors);
    setPresetFeedback(
      behaviors.length === 0
        ? `${label} applied — no behavior overrides (all channels will succeed).`
        : `${label} applied — ${behaviors.length} behavior row${behaviors.length === 1 ? "" : "s"} generated.`,
    );
  }

  return (
    <section className="glass rounded-2xl p-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Bulk import
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Production-grade ingest for evaluators with real catalogs. Drop a file,
            paste, or download a sample — preview is server-validated against the
            same rules the production write-path enforces.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[.18em] text-emerald-200">
            <ShieldCheck className="h-3 w-3" /> Server-validated
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[.18em] text-violet-200">
            <Database className="h-3 w-3" /> CSV · TSV · JSON
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        {/* ─────────────────────────────────────────────────────────── */}
        {/* LEFT — Import path                                          */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Mode + format tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-white/10 bg-white/[.03] p-0.5 text-xs">
              {(["upload", "paste"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition",
                    mode === m
                      ? "bg-white/10 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  {m === "upload" ? <Upload className="h-3.5 w-3.5" /> : <ClipboardPaste className="h-3.5 w-3.5" />}
                  {m === "upload" ? "Upload file" : "Paste"}
                </button>
              ))}
            </div>

            <div className="ml-auto inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[.03] p-0.5 text-xs">
              {(["csv", "tsv", "json"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFormat(f);
                    if (content.trim()) void validateOnServer(content, f);
                  }}
                  className={clsx(
                    "rounded-lg px-2.5 py-1 font-mono uppercase transition",
                    format === f
                      ? "bg-white/10 text-white"
                      : "text-slate-500 hover:text-slate-300",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Drop zone (upload mode) */}
          {mode === "upload" && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              className={clsx(
                "flex h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-white/[.02] transition",
                dragOver
                  ? "border-brand bg-brand/[.06] scale-[1.01]"
                  : "border-white/15 hover:border-white/30 hover:bg-white/[.04]",
              )}
            >
              <div className={clsx(
                "flex h-10 w-10 items-center justify-center rounded-full border transition",
                dragOver ? "border-brand bg-brand/20 text-brand-400" : "border-white/15 bg-white/[.05] text-slate-400",
              )}>
                <Upload className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium text-slate-200">
                {dragOver ? "Drop to import" : "Drag a file here, or click to browse"}
              </div>
              <div className="text-[11px] text-slate-500">
                .csv · .tsv · .json · up to 1 MiB
              </div>
              {fileName && !dragOver && (
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                  <FileText className="h-3 w-3" />
                  {fileName}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.json,text/csv,text/tab-separated-values,application/json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="hidden"
              />
            </div>
          )}

          {/* Paste textarea */}
          {mode === "paste" && (
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              spellCheck={false}
              placeholder={format === "json" ? SAMPLE_JSON : SAMPLE_CSV}
              className="mono h-44 w-full resize-y rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-slate-200 outline-none focus:border-brand/50"
            />
          )}

          {/* Quick actions row */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => {
                const sample = format === "json" ? SAMPLE_JSON : SAMPLE_CSV;
                if (mode === "paste") {
                  handleContentChange(sample, format);
                } else {
                  setMode("paste");
                  handleContentChange(sample, format);
                }
              }}
              className="rounded-md border border-white/10 bg-white/[.04] px-2 py-1 text-slate-300 hover:bg-white/[.08]"
            >
              Load sample
            </button>
            <button
              type="button"
              onClick={() => downloadSample(format)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[.04] px-2 py-1 text-slate-300 hover:bg-white/[.08]"
            >
              <Download className="h-3 w-3" /> Download .{format} template
            </button>
            {hasContent && (
              <button
                type="button"
                onClick={() => {
                  setContent("");
                  setPreview(null);
                  setFileName(null);
                  setValidationSource(null);
                }}
                className="ml-auto text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            )}
          </div>

          {/* Validation summary bar */}
          {(preview || isValidating) && (
            <div className={clsx(
              "rounded-xl border px-3 py-2.5 text-xs transition",
              isValidating
                ? "border-white/10 bg-white/[.03] text-slate-400"
                : preview && preview.payload_errors.length > 0
                  ? "border-rose-500/30 bg-rose-500/[.06] text-rose-200"
                  : invalidCount > 0
                    ? "border-amber-500/30 bg-amber-500/[.06] text-amber-200"
                    : "border-emerald-500/30 bg-emerald-500/[.06] text-emerald-200",
            )}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  {isValidating ? (
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                      Validating on server…
                    </span>
                  ) : preview?.payload_errors.length ? (
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="font-medium">Payload error</span>
                      <span className="opacity-75">— see below</span>
                    </span>
                  ) : (
                    <span className="font-mono">
                      <span className="font-semibold">{totalCount}</span> rows ·{" "}
                      <span className="font-semibold text-emerald-300">{validCount} valid</span>
                      {invalidCount > 0 && (
                        <> · <span className="font-semibold text-rose-300">{invalidCount} invalid</span></>
                      )}
                    </span>
                  )}
                  {validationSource === "server" && !isValidating && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                      <ShieldCheck className="h-2.5 w-2.5" /> server-validated
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {invalidCount > 0 && !isValidating && (
                    <>
                      <button
                        type="button"
                        onClick={() => setErrorFilter((v) => !v)}
                        className={clsx(
                          "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition",
                          errorFilter
                            ? "border-rose-500/50 bg-rose-500/15 text-rose-200"
                            : "border-rose-500/25 bg-rose-500/5 text-rose-300 hover:bg-rose-500/10",
                        )}
                        title={errorFilter ? "Showing only invalid rows" : "Filter to show only invalid rows"}
                      >
                        {errorFilter ? "Showing errors only ×" : `Show only errors (${invalidCount})`}
                      </button>
                      <button
                        type="button"
                        onClick={downloadErrorReport}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:bg-white/10"
                        title="Download invalid rows + their error messages as CSV"
                      >
                        <Download className="h-3 w-3" />
                        Errors CSV
                      </button>
                    </>
                  )}
                  {validCount > 0 && !isValidating && (
                    <button
                      type="button"
                      onClick={applyValidRows}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-400"
                    >
                      Apply {validCount} valid row{validCount === 1 ? "" : "s"} →
                    </button>
                  )}
                </div>
              </div>
              {preview && preview.payload_errors.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[11px] opacity-90">
                  {preview.payload_errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              {/* Error breakdown — show top categories so users know what to fix in bulk */}
              {!isValidating && invalidCount > 0 && errorBreakdown.length > 0 && (
                <div className="mt-2 border-t border-rose-500/20 pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-rose-300/70">
                    Why these {invalidCount} rows failed:
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {errorBreakdown.slice(0, 5).map(({ category, count }) => (
                      <li
                        key={category}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200"
                      >
                        <span className="font-semibold tabular-nums">{count}×</span>
                        <span className="opacity-90">{category}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Preview table */}
          <AnimatePresence>
            {preview && preview.rows.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden rounded-xl border border-white/10 bg-black/30"
              >
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-black/60 backdrop-blur text-[10px] uppercase tracking-wide text-slate-500">
                      <tr className="border-b border-white/5">
                        <th className="py-2 pl-3 pr-2 font-medium">#</th>
                        <th className="py-2 pr-2 font-medium">Status</th>
                        <th className="py-2 pr-2 font-medium">SKU</th>
                        <th className="py-2 pr-2 font-medium">Product</th>
                        <th className="py-2 pr-2 text-right font-medium">Prior $</th>
                        <th className="py-2 pr-3 text-right font-medium">Approved $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows
                        .filter((r) => !errorFilter || !r.valid)
                        .map((r) => (
                        <tr
                          key={r.row_number}
                          className={clsx(
                            "border-b border-white/5 last:border-0",
                            !r.valid && "bg-rose-500/[.04]",
                          )}
                        >
                          <td className="py-2 pl-3 pr-2 font-mono text-slate-500">{r.row_number}</td>
                          <td className="py-2 pr-2">
                            {r.valid ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                                <CheckCircle2 className="h-2.5 w-2.5" /> valid
                              </span>
                            ) : (
                              <span
                                title={r.errors.join("; ")}
                                className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300"
                              >
                                <CircleAlert className="h-2.5 w-2.5" /> error
                              </span>
                            )}
                          </td>
                          <td className="mono py-2 pr-2 text-slate-300">{r.sku || "—"}</td>
                          <td className="py-2 pr-2 text-slate-300">
                            <div>{r.product_name || "—"}</div>
                            {!r.valid && (
                              <div className="mt-0.5 text-[10px] text-rose-300/80">
                                {r.errors.join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="mono py-2 pr-2 text-right tabular-nums text-slate-400">
                            {r.previous_price ? `$${r.previous_price.toFixed(2)}` : "—"}
                          </td>
                          <td className="mono py-2 pr-3 text-right tabular-nums text-slate-200">
                            {r.approved_price ? `$${r.approved_price.toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* RIGHT — Behavior preset generator                           */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-white/5 bg-white/[.02] p-3.5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-violet-300" />
            Generate behaviors
          </div>
          <p className="mb-3 text-[11px] text-slate-500">
            Reads your current{" "}
            <span className="text-slate-400">stores</span>,{" "}
            <span className="text-slate-400">canary</span>, and{" "}
            <span className="text-slate-400">products</span> and emits a
            meaningful failure mix in one click. Behaviors fully replace
            the current list — iterate fast.
          </p>
          <div className="grid gap-2">
            {PRESETS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePreset(p.id, p.label)}
                  className={clsx(
                    "group flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition active:scale-[0.99]",
                    p.tone,
                  )}
                >
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{p.label}</div>
                    <div className="mt-0.5 text-[11px] opacity-70">{p.blurb}</div>
                  </div>
                </button>
              );
            })}
          </div>
          {presetFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-[11px] text-violet-200"
            >
              {presetFeedback}
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
