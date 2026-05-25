"use client";

/**
 * ScenariosBulkPanel — high-volume import helpers for /scenarios.
 *
 * Two side-by-side helpers that let evaluators model their own catalog
 * at volume instead of typing rows one by one:
 *
 *  1. Paste-CSV products — parses sku, product_name, prior_price,
 *     approved_price (and optional reason) into the actions list.
 *  2. Behavior preset generator — given the current stores + canary +
 *     products, emits a meaningful behaviors list with one click:
 *       • All Success           — clean baseline, no incidents
 *       • Single Canary Mismatch — one POS stale_price on canary store
 *       • Stress Test Mix       — random failure spread (~40% failures)
 *       • POS Channel Storm     — every store's POS times out for SKU 1
 *       • Recovery Loop         — timeout_then_success across all canary
 *
 * Replaces, not appends, so the user can iterate cleanly.
 */

import { useState } from "react";
import {
  ClipboardPaste,
  Sparkles,
  CheckCircle2,
  CircleAlert,
  Zap,
  RotateCcw,
  Workflow,
  ShieldCheck,
} from "lucide-react";
import clsx from "clsx";
import type { BehaviorType, ConnectorBehavior, ScenarioAction } from "@/lib/types";

interface Props {
  storesCsv: string; // comma-separated store IDs from parent state
  canaryCsv: string; // comma-separated canary store IDs from parent state
  actions: ScenarioAction[]; // current products, used by behavior presets
  onImportProducts: (next: ScenarioAction[]) => void;
  onGenerateBehaviors: (next: ConnectorBehavior[]) => void;
}

const CSV_PLACEHOLDER = `sku,product_name,prior_price,approved_price,reason
milk-organic-1gal,Organic Whole Milk 1 Gal,5.99,4.99,Memorial Day promo
egg-cage-free-12,Cage-Free Eggs Dozen,4.19,3.49,KVI weekly
strawberry-1lb,Fresh Strawberries 1lb,4.99,2.99,Perishable markdown
oj-premium-64oz,Premium Orange Juice 64oz,6.49,5.49,Brand promo`;

const PRESETS: Array<{
  id: string;
  label: string;
  blurb: string;
  icon: React.ElementType;
  tone: string;
}> = [
  {
    id: "all-success",
    label: "All Success",
    blurb: "Every channel agrees. No incidents. Clean baseline.",
    icon: CheckCircle2,
    tone: "border-emerald-500/30 bg-emerald-500/[.06] text-emerald-200",
  },
  {
    id: "single-mismatch",
    label: "Single Canary Mismatch",
    blurb: "One POS stale_price on the first canary store + SKU.",
    icon: CircleAlert,
    tone: "border-rose-500/30 bg-rose-500/[.06] text-rose-200",
  },
  {
    id: "stress-mix",
    label: "Stress Test (40% failures)",
    blurb: "Random failure spread across every store × SKU × channel.",
    icon: Zap,
    tone: "border-amber-500/30 bg-amber-500/[.06] text-amber-200",
  },
  {
    id: "pos-storm",
    label: "POS Channel Storm",
    blurb: "Every store's POS times out for the first SKU.",
    icon: Workflow,
    tone: "border-violet-500/30 bg-violet-500/[.06] text-violet-200",
  },
  {
    id: "recovery-loop",
    label: "Recovery Loop",
    blurb: "timeout_then_success across all canary stores — proves retry path.",
    icon: RotateCcw,
    tone: "border-sky-500/30 bg-sky-500/[.06] text-sky-200",
  },
];

function parseCsv(raw: string): { rows: ScenarioAction[]; errors: string[] } {
  const errors: string[] = [];
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], errors: ["Paste at least one row."] };

  // Header detection — does the first row look like a header (non-numeric cols)?
  const first = lines[0].split(",").map((c) => c.trim());
  const looksLikeHeader = first.some((c) =>
    /sku|product|name|price|reason/i.test(c),
  );
  const dataStart = looksLikeHeader ? 1 : 0;
  const headerMap = looksLikeHeader
    ? first.map((c) => c.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
    : ["sku", "product_name", "prior_price", "approved_price", "reason"];

  const idx = (key: string) =>
    headerMap.findIndex((h) => h === key || h === key.replace(/_/g, ""));

  const skuI = Math.max(0, idx("sku"));
  const nameI = Math.max(1, idx("product_name"));
  const priorI = Math.max(2, idx("prior_price"));
  const approvedI = Math.max(3, idx("approved_price"));
  const reasonI = idx("reason");

  const rows: ScenarioAction[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length < 4) {
      errors.push(`Row ${i + 1}: needs at least 4 columns (got ${cells.length})`);
      continue;
    }
    const prior = Number(cells[priorI]);
    const approved = Number(cells[approvedI]);
    if (!Number.isFinite(prior) || !Number.isFinite(approved)) {
      errors.push(`Row ${i + 1}: prior/approved prices must be numbers`);
      continue;
    }
    rows.push({
      sku: cells[skuI]?.trim() || `sku-${i}`,
      product_name: cells[nameI]?.trim() || `Product ${i}`,
      previous_price: prior,
      approved_price: approved,
      reason:
        (reasonI >= 0 && cells[reasonI]?.trim()) || "Bulk imported",
      is_kvi: false,
      deadline_at: null,
    });
  }
  if (rows.length === 0 && errors.length === 0) {
    errors.push("No rows parsed.");
  }
  return { rows, errors };
}

// Tiny CSV splitter that respects double-quoted commas.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function splitIds(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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

  const channels: ConnectorBehavior["channel_type"][] = [
    "pos",
    "esl",
    "ecommerce",
  ];

  switch (presetId) {
    case "all-success":
      // Empty list means "everything succeeds" per the existing builder semantics.
      return [];

    case "single-mismatch": {
      const store = canary[0] || stores[0];
      const sku = skus[0];
      const action = actions.find((a) => a.sku === sku);
      const drift = action ? Number(action.approved_price) + 0.5 : null;
      return [
        {
          store_id: store,
          sku,
          channel_type: "pos",
          behavior_type: "stale_price",
          configured_observed_price: drift,
          configured_delay_ms: null,
          retry_success_price: action ? Number(action.approved_price) : null,
        },
      ];
    }

    case "stress-mix": {
      // ~40% of cells get a failure. Spread evenly across all 3 channels.
      const types: BehaviorType[] = [
        "stale_price",
        "timeout",
        "timeout_then_success",
      ];
      const out: ConnectorBehavior[] = [];
      let i = 0;
      for (const store of stores) {
        for (const sku of skus) {
          for (const ch of channels) {
            // deterministic-ish — every 5 of 12 cells fail (~42%)
            const failSlot = i % 12;
            if (failSlot < 5) {
              const t = types[failSlot % types.length];
              const action = actions.find((a) => a.sku === sku);
              out.push({
                store_id: store,
                sku,
                channel_type: ch,
                behavior_type: t,
                configured_observed_price:
                  t === "stale_price" && action
                    ? Number(action.approved_price) + 0.5
                    : null,
                configured_delay_ms: t === "timeout" ? 4000 : null,
                retry_success_price:
                  t === "timeout_then_success" && action
                    ? Number(action.approved_price)
                    : null,
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
        store_id: store,
        sku,
        channel_type: "pos" as const,
        behavior_type: "timeout" as BehaviorType,
        configured_observed_price: null,
        configured_delay_ms: 4500,
        retry_success_price: null,
      }));
    }

    case "recovery-loop": {
      const out: ConnectorBehavior[] = [];
      for (const store of canary) {
        for (const sku of skus) {
          const action = actions.find((a) => a.sku === sku);
          out.push({
            store_id: store,
            sku,
            channel_type: "pos",
            behavior_type: "timeout_then_success",
            configured_observed_price: null,
            configured_delay_ms: 1500,
            retry_success_price: action
              ? Number(action.approved_price)
              : null,
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
  const [csv, setCsv] = useState("");
  const [parseFeedback, setParseFeedback] = useState<{
    rows: number;
    errors: string[];
  } | null>(null);
  const [presetFeedback, setPresetFeedback] = useState<string | null>(null);

  function handleParse() {
    const { rows, errors } = parseCsv(csv);
    setParseFeedback({ rows: rows.length, errors });
    if (rows.length > 0) {
      onImportProducts(rows);
    }
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Bulk import
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            For evaluators with real data — paste a product CSV, then generate
            a behavior preset against your stores & canary. Replaces, not
            appends, so you can iterate cleanly.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[.18em] text-violet-200">
          <ShieldCheck className="h-3 w-3" /> No upload — pasted in-browser
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* ── Products CSV paste ───────────────────────────────────────── */}
        <div className="rounded-xl border border-white/5 bg-white/[.02] p-3.5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
            <ClipboardPaste className="h-3.5 w-3.5 text-brand-400" />
            Paste products as CSV
          </div>
          <p className="mb-2 text-[11px] text-slate-500">
            Header optional. Required columns:{" "}
            <code className="font-mono text-slate-400">
              sku, product_name, prior_price, approved_price
            </code>
            . Optional: <code className="font-mono text-slate-400">reason</code>.
          </p>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={CSV_PLACEHOLDER}
            spellCheck={false}
            className="mono h-44 w-full resize-y rounded-lg border border-white/10 bg-black/40 p-2.5 text-[11px] leading-relaxed text-slate-200 outline-none focus:border-brand/50"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setCsv(CSV_PLACEHOLDER)}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              Load sample
            </button>
            <button
              type="button"
              onClick={handleParse}
              disabled={csv.trim().length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Parse &amp; replace products
            </button>
          </div>
          {parseFeedback && (
            <div
              className={clsx(
                "mt-2 rounded-lg border px-2.5 py-1.5 text-[11px]",
                parseFeedback.errors.length > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
              )}
            >
              {parseFeedback.rows > 0 && (
                <div>
                  ✓ Imported {parseFeedback.rows} product
                  {parseFeedback.rows === 1 ? "" : "s"}.
                </div>
              )}
              {parseFeedback.errors.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {parseFeedback.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {parseFeedback.errors.length > 5 && (
                    <li>(+{parseFeedback.errors.length - 5} more)</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ── Behavior preset generator ──────────────────────────────── */}
        <div className="rounded-xl border border-white/5 bg-white/[.02] p-3.5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-violet-300" />
            Generate behaviors
          </div>
          <p className="mb-3 text-[11px] text-slate-500">
            Each preset reads your current{" "}
            <span className="text-slate-400">stores</span>,{" "}
            <span className="text-slate-400">canary</span>, and{" "}
            <span className="text-slate-400">products</span>, then emits a
            meaningful behaviors list.
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
                    "group flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition hover:brightness-125",
                    p.tone,
                  )}
                >
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{p.label}</div>
                    <div className="mt-0.5 text-[11px] opacity-70">
                      {p.blurb}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {presetFeedback && (
            <div className="mt-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-[11px] text-violet-200">
              {presetFeedback}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
