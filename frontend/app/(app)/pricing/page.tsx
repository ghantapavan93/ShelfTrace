"use client";

/**
 * /pricing — recommendations from the econometric pricing engine.
 *
 * The engine:
 *   1. Estimates price elasticity from 90 days of historical sales
 *      via OLS log-log regression (β = ∂log Q / ∂log P)
 *   2. Computes the unconstrained profit-max price p* = β·c / (β+1)
 *   3. Runs p* through the constraint chain (cost floor, KVI lock,
 *      perishable urgency, competitor ceiling, shock cap, inventory)
 *   4. Returns the constrained price with a full reasoning trail
 *
 * Every recommendation can be drilled into to see exactly which
 * constraints fired, what β was estimated, and what lifts are expected.
 * Recommendations can flow into the existing ShelfTrace execution loop
 * via the Scenarios builder — closing the pricing → execution circle.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Play,
  Database,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  Brain,
  RefreshCw,
  Info,
  ExternalLink,
  Activity,
  Download,
  Rocket,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { money } from "@/lib/format";
import { ListSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { useWorkMode } from "@/components/ModeProvider";
import { WhatIfSimulator } from "@/components/pricing/WhatIfSimulator";
import { KviWatchlist } from "@/components/pricing/KviWatchlist";
import { MarginTargetPanel } from "@/components/pricing/MarginTargetPanel";

type Recommendation = {
  id: string;
  sku: string;
  store_id: string;
  product_name: string;
  current_price: number;
  recommended_price: number;
  change_pct: number;
  expected_units_lift_pct: number;
  expected_revenue_lift: number;
  expected_profit_lift: number;
  confidence: number;
  elasticity_beta: number | null;
  elasticity_beta_se: number | null;
  elasticity_ci_low: number | null;
  elasticity_ci_high: number | null;
  elasticity_r2: number | null;
  elasticity_n: number | null;
  reasons: Array<{ code: string; message: string }>;
  applied_constraints: string[];
  matched_signals: string[];
  demand_multiplier: number;
  applied: boolean;
  applied_to_scenario_id: string | null;
  superseded_by: string | null;
  created_at: string;
};

const REASON_CODE_COLOR: Record<string, string> = {
  ELASTIC_OPTIMIZED: "text-emerald-300",
  INELASTIC_RAISED_TO_CEILING: "text-sky-300",
  KVI_MATCHED_COMPETITOR: "text-violet-300",
  PERISHABLE_MARKDOWN_FORCED: "text-amber-300",
  AT_COST_FLOOR: "text-rose-300",
  AT_COMPETITOR_CEILING: "text-rose-300",
  INVENTORY_CAPPED: "text-amber-300",
  RECENT_CHANGE_SUPPRESSED: "text-slate-400",
  INSUFFICIENT_HISTORY: "text-slate-400",
  NO_PRICE_VARIANCE: "text-slate-400",
  MISSING_COST: "text-slate-400",
  VEBLEN_FLAGGED: "text-rose-300",
  AT_COST_FLOOR_2: "text-rose-300",
  NO_CHANGE_NEEDED: "text-slate-500",
};

export default function PricingPage() {
  const [busy, setBusy] = useState<"seed" | "run" | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { toast } = useToast();
  const { mode, isHydrated } = useWorkMode();
  const isLiveWorkMode = isHydrated && mode === "live";

  // Send ?scope=live to the backend in Live mode so the result excludes
  // demo recommendations at the SQL layer, not just at render time.
  const recs = useLive<{ recommendations: Recommendation[] }>(
    () => api.pricingRecommendations(true, isLiveWorkMode ? "live" : undefined),
    [reloadKey, isLiveWorkMode],
  );
  const scenarios = useLive(() => api.scenarios(), [reloadKey]);

  const seedAndRun = useCallback(async () => {
    setBusy("seed");
    try {
      const seedResult = await api.pricingSeedHistory();
      await api.pricingSeedSignals().catch(() => null);
      setBusy("run");
      const runResult = await api.pricingRunEngine();
      toast.success(
        `Seeded ${seedResult.inserted} observations · ${runResult.scanned} SKU·stores scanned · ${runResult.recommended} actionable recommendations${runResult.superseded ? ` · ${runResult.superseded} prior recs superseded` : ""}.`,
      );
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(`Seed/Run failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [toast]);

  const applyRec = useCallback(async (recId: string) => {
    try {
      const result = await api.pricingApplyRecommendation(recId);
      toast.success(
        `Applied → scenario ${result.scenario_config_id}. Open /scenarios to run it through canary → reconciliation → expansion.`,
      );
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(`Apply failed: ${(e as Error).message}`);
    }
  }, [toast]);

  const runOnly = useCallback(async () => {
    setBusy("run");
    try {
      const result = await api.pricingRunEngine();
      toast.success(
        `Re-ran engine · scanned ${result.scanned} · ${result.recommended} actionable recommendations.`,
      );
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(`Run failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [toast]);

  const liveScenarioSkus = useMemo(() => {
    const skus = new Set<string>();
    for (const scenario of scenarios.data ?? []) {
      if (scenario.is_seeded) continue;
      for (const action of scenario.actions) {
        skus.add(action.sku);
      }
    }
    return skus;
  }, [scenarios.data]);

  const visibleRecommendations = useMemo(() => {
    const list = recs.data?.recommendations ?? [];
    if (!isLiveWorkMode) return list;
    return list.filter((rec) => liveScenarioSkus.has(rec.sku));
  }, [isLiveWorkMode, liveScenarioSkus, recs.data]);

  const totals = useMemo(() => {
    const list = visibleRecommendations;
    return {
      n: list.length,
      revenue: list.reduce((s, r) => s + r.expected_revenue_lift, 0),
      profit: list.reduce((s, r) => s + r.expected_profit_lift, 0),
      avgConfidence: list.length
        ? list.reduce((s, r) => s + r.confidence, 0) / list.length
        : 0,
    };
  }, [visibleRecommendations]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white"><span className="iris-text">Pricing</span> Engine</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Econometric price-elasticity estimation + constrained profit
            optimization. OLS log-log fit on 90 days of sales →
            closed-form p* = β·c/(β+1) → 6-stage constraint chain (cost
            floor · perishable urgency · KVI lock · competitor ceiling ·
            shock cap · inventory) → human-readable reasoning per
            recommendation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[.18em] text-emerald-200">
            <Brain className="h-3 w-3" /> Pure-Python OLS
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[.18em] text-violet-200">
            <ShieldCheck className="h-3 w-3" /> {TEST_COUNT} backend tests
          </span>
        </div>
      </div>

      {/* Honest framing */}
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[.04] px-4 py-3 text-sm text-amber-200">
        <span className="font-semibold">Scope note:</span> historical
        sales are 90 days of synthetic data generated by{" "}
        <code className="mono rounded bg-black/30 px-1 py-0.5 text-[11px]">
          app/pricing/seed.py
        </code>{" "}
        with deliberate elasticity patterns per product (milk ≈ -1.2,
        eggs ≈ -0.6, strawberries ≈ -2.1, OJ ≈ -1.4). The estimator and
        optimizer math is unchanged for real POS data — only the source
        of the history table changes. The math implementations
        (elasticity, optimizer, constraints) are tested against
        synthetic data with KNOWN β so the recovery error is provable.
      </div>

      {isLiveWorkMode && (
        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[.04] px-4 py-3 text-sm text-violet-200">
          <span className="font-semibold">Live scope:</span> recommendations are
          filtered to SKUs from non-demo scenarios. Demo margin rollups stay
          hidden here until historical sales and costs carry import/run provenance.
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.02] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={seedAndRun}
            disabled={busy !== null}
            className={clsx(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
              isLiveWorkMode && "hidden",
              busy === "seed"
                ? "cursor-wait bg-white/10 text-slate-400"
                : "bg-gradient-to-r from-brand to-brand-600 text-white shadow-glow-brand hover:brightness-110",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {busy === "seed" ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Seeding 90 days…
              </>
            ) : busy === "run" ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Running engine…
              </>
            ) : (
              <>
                <Database className="h-3.5 w-3.5" /> Seed + Run engine
              </>
            )}
          </button>
          <button
            type="button"
            onClick={runOnly}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" /> {isLiveWorkMode ? "Re-run for live SKUs" : "Re-run engine only"}
          </button>
        </div>
        <div className="text-[11px] text-slate-500">
          {isLiveWorkMode ? (
            <>
              Live mode uses uploaded scenario SKUs. Add data in{" "}
              <Link href="/scenarios" className="text-violet-300 underline">
                Scenarios
              </Link>
              .
            </>
          ) : (
            <>
              First time? Click <span className="text-slate-300">Seed + Run</span>.
            </>
          )}
        </div>
      </div>

      {/* feedback now flows through the global toast system */}

      {/* Summary tiles */}
      {recs.data && totals.n > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryTile label="Actionable" value={totals.n.toString()} tone="brand" />
          <SummaryTile
            label="Expected revenue lift"
            value={money(totals.revenue)}
            sub="per period"
            tone={totals.revenue >= 0 ? "verified" : "danger"}
          />
          <SummaryTile
            label="Expected profit lift"
            value={money(totals.profit)}
            sub="per period"
            tone={totals.profit >= 0 ? "verified" : "danger"}
          />
          <SummaryTile
            label="Avg confidence"
            value={`${(totals.avgConfidence * 100).toFixed(0)}%`}
            sub="across recs"
            tone="brand"
          />
        </div>
      )}

      {/* Margin target policy rollup */}
      <MarginTargetPanel reloadKey={reloadKey} liveScoped={isLiveWorkMode} />

      {/* KVI watchlist — traffic-driver alignment */}
      <KviWatchlist
        reloadKey={reloadKey}
        allowedSkus={isLiveWorkMode ? liveScenarioSkus : null}
        sourceLabel={isLiveWorkMode ? "uploaded SKUs only" : undefined}
      />

      {/* Recommendations table */}
      <section className="holo-card glow-iris rounded-2xl p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Recommendations
            {recs.data && (
              <span className="ml-2 font-normal text-slate-500">
                · {visibleRecommendations.length}
              </span>
            )}
          </h2>
          {recs.data && visibleRecommendations.length > 0 && (
            <a
              href={`${api.base}/api/v1/pricing/recommendations/export.csv${
                isLiveWorkMode ? "?scope=live" : ""
              }`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              title="Export current recommendations as CSV"
            >
              <Download className="h-3 w-3" /> Export CSV
            </a>
          )}
        </div>

        {!recs.data ? (
          <ListSkeleton rows={4} />
        ) : visibleRecommendations.length === 0 ? (
          <EmptyState onSeed={seedAndRun} liveMode={isLiveWorkMode} />
        ) : (
          <div className="space-y-2">
            {visibleRecommendations.map((r) => (
              <RecommendationRow
                key={r.id}
                rec={r}
                expanded={expanded === r.id}
                onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                onApply={() => applyRec(r.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Integration hint */}
      <div className="holo-card rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">
              Closing the loop: pricing → execution
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              In production these recommendations flow directly into the
              ShelfTrace{" "}
              <Link href="/scenarios" className="text-violet-300 underline">
                Scenarios Builder
              </Link>{" "}
              as approved batches → through the transactional outbox →
              POS/ESL/ecommerce adapters → canary verification → safe
              expansion. The pricing engine's <em>recommendation</em>{" "}
              becomes an "approved price" the moment a human (or rule)
              accepts it, and the execution-reliability layer takes over
              from there.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/scenarios"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              >
                Open Scenarios <ExternalLink className="h-3 w-3" />
              </Link>
              <Link
                href="/scrapers"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              >
                Competitor data feed <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "brand" | "verified" | "danger";
}) {
  const cls = {
    brand: "text-brand-400",
    verified: "text-verified",
    danger: "text-danger",
  }[tone];
  return (
    <div className="glass rounded-xl px-3 py-3">
      <div className={clsx("text-xl font-bold tabular-nums", cls)}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
      {sub && <div className="mono mt-0.5 text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

function RecommendationRow({
  rec,
  expanded,
  onToggle,
  onApply,
}: {
  rec: Recommendation;
  expanded: boolean;
  onToggle: () => void;
  onApply: () => void;
}) {
  const isIncrease = rec.recommended_price > rec.current_price;
  const Arrow = isIncrease ? TrendingUp : TrendingDown;
  const dollarChange = rec.recommended_price - rec.current_price;
  const [whatIfOpen, setWhatIfOpen] = useState(false);

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-xl border transition",
        expanded
          ? "border-brand/30 bg-brand/[.04]"
          : "border-white/10 bg-white/[.02]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[.03]"
      >
        <span
          className={clsx(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            isIncrease
              ? "bg-sky-500/15 text-sky-300"
              : "bg-emerald-500/15 text-emerald-300",
          )}
        >
          <Arrow className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-white">{rec.product_name}</span>
            <span className="mono rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] text-slate-400">
              {rec.sku} · store {rec.store_id}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-400">
              {money(rec.current_price)} →{" "}
              <span className="font-semibold text-white">
                {money(rec.recommended_price)}
              </span>
            </span>
            <span
              className={clsx(
                "mono",
                isIncrease ? "text-sky-300" : "text-emerald-300",
              )}
            >
              {isIncrease ? "+" : ""}
              {money(dollarChange)} ({rec.change_pct > 0 ? "+" : ""}
              {rec.change_pct}%)
            </span>
            {rec.expected_profit_lift !== 0 && (
              <span className="text-slate-500">
                expected profit{" "}
                <span className={rec.expected_profit_lift > 0 ? "text-verified" : "text-danger"}>
                  {rec.expected_profit_lift > 0 ? "+" : ""}
                  {money(rec.expected_profit_lift)}/period
                </span>
              </span>
            )}
            <ConfidencePill v={rec.confidence} />
          </div>
        </div>
        <ChevronDown
          className={clsx(
            "h-4 w-4 shrink-0 text-slate-500 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="border-t border-white/10 px-4 py-3 text-xs"
          >
            {/* Elasticity facts */}
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact
                label="Elasticity β"
                value={rec.elasticity_beta?.toFixed(2) ?? "—"}
                hint={
                  rec.elasticity_beta == null
                    ? "no fit"
                    : rec.elasticity_beta < -1
                      ? "elastic"
                      : rec.elasticity_beta < 0
                        ? "inelastic"
                        : "anomalous"
                }
              />
              <Fact
                label="95% CI on β"
                value={
                  rec.elasticity_ci_low != null && rec.elasticity_ci_high != null
                    ? `[${rec.elasticity_ci_low.toFixed(2)}, ${rec.elasticity_ci_high.toFixed(2)}]`
                    : "—"
                }
                hint={
                  rec.elasticity_beta_se != null
                    ? `SE ${rec.elasticity_beta_se.toFixed(3)}`
                    : undefined
                }
              />
              <Fact
                label="Fit R²"
                value={rec.elasticity_r2 != null ? rec.elasticity_r2.toFixed(2) : "—"}
                hint={`n = ${rec.elasticity_n ?? "—"}`}
              />
              <Fact
                label="Confidence"
                value={`${(rec.confidence * 100).toFixed(0)}%`}
              />
            </div>

            {/* External signals (if any) */}
            {rec.matched_signals && rec.matched_signals.length > 0 && (
              <div className="mb-3 rounded-lg border border-violet-500/25 bg-violet-500/[.05] px-3 py-2 text-[11px] text-violet-200">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  <span className="font-semibold">
                    External signals: {rec.matched_signals.join(", ")}
                  </span>
                  <span className="ml-auto mono">
                    demand × {rec.demand_multiplier.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Reasoning trail */}
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">
                <Activity className="h-3 w-3" /> Reasoning trail
              </div>
              <ul className="space-y-1.5">
                {rec.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={clsx(
                        "mono mt-0.5 shrink-0 rounded bg-black/30 px-1.5 py-0.5 text-[10px]",
                        REASON_CODE_COLOR[r.code] ?? "text-slate-400",
                      )}
                    >
                      {r.code}
                    </span>
                    <span className="text-slate-300">{r.message}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Constraints applied */}
            {rec.applied_constraints.length > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">
                  <ShieldCheck className="h-3 w-3" /> Constraints fired
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {rec.applied_constraints.map((c) => (
                    <span
                      key={c}
                      className="mono rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Expected lifts */}
            <div className="grid grid-cols-3 gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
              <Fact
                label="Units lift"
                value={`${rec.expected_units_lift_pct > 0 ? "+" : ""}${rec.expected_units_lift_pct}%`}
                tone={rec.expected_units_lift_pct >= 0 ? "verified" : "danger"}
              />
              <Fact
                label="Revenue lift"
                value={`${rec.expected_revenue_lift >= 0 ? "+" : ""}${money(rec.expected_revenue_lift)}`}
                tone={rec.expected_revenue_lift >= 0 ? "verified" : "danger"}
              />
              <Fact
                label="Profit lift"
                value={`${rec.expected_profit_lift >= 0 ? "+" : ""}${money(rec.expected_profit_lift)}`}
                tone={rec.expected_profit_lift >= 0 ? "verified" : "danger"}
              />
            </div>

            {/* Apply-to-ShelfTrace action — closes the pricing→execution loop */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/25 bg-brand/[.06] px-3 py-2.5">
              <div className="flex items-start gap-2 text-[11px] text-slate-300">
                <Rocket className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                <span>
                  Apply this recommendation to ShelfTrace — creates a
                  single-action scenario you can run through canary →
                  verification → expansion.
                </span>
              </div>
              {rec.applied ? (
                <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200">
                  <Check className="h-3 w-3" />
                  Applied → scenario {rec.applied_to_scenario_id?.slice(0, 12)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApply();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-600"
                >
                  <Rocket className="h-3 w-3" /> Apply to ShelfTrace
                </button>
              )}
            </div>

            {/* What-if interactive simulator — drag a price, watch units,
                revenue, profit and constraints update live without any
                additional API calls. */}
            <div className="mt-3">
              {!whatIfOpen ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setWhatIfOpen(true);
                  }}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/[.06] px-3 py-2 text-[11px] font-semibold text-violet-200 transition hover:bg-violet-500/[.12]"
                >
                  <Sparkles className="h-3 w-3 transition group-hover:rotate-12" />
                  Open interactive what-if simulator
                </button>
              ) : (
                <WhatIfSimulator
                  sku={rec.sku}
                  storeId={rec.store_id}
                  recommendedPrice={rec.recommended_price}
                  onClose={() => setWhatIfOpen(false)}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Fact({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "verified" | "danger";
}) {
  const valueCls =
    tone === "verified" ? "text-verified" : tone === "danger" ? "text-danger" : "text-white";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={clsx("mono mt-0.5 text-sm font-semibold tabular-nums", valueCls)}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

function ConfidencePill({ v }: { v: number }) {
  const pct = Math.round(v * 100);
  const tone =
    pct >= 75
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : pct >= 50
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-rose-500/30 bg-rose-500/10 text-rose-200";
  return (
    <span className={clsx("mono rounded-full border px-1.5 py-0.5 text-[10px]", tone)}>
      conf {pct}%
    </span>
  );
}

function EmptyState({
  onSeed,
  liveMode,
}: {
  onSeed: () => void;
  liveMode?: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[.02] px-6 py-8 text-center">
      <Brain className="mx-auto h-6 w-6 text-slate-500" />
      <p className="mt-2 text-sm text-slate-300">No recommendations yet</p>
      <p className="mt-1 text-xs text-slate-500">
        {liveMode ? (
          <>
            Import or build a scenario first, then re-run the engine to show only
            uploaded SKU recommendations.
          </>
        ) : (
          <>
            Click <span className="text-slate-300">Seed + Run engine</span> to
            generate 90 days of history and compute recommendations.
          </>
        )}
      </p>
      {liveMode ? (
        <Link
          href="/scenarios"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/15"
        >
          <Database className="h-3 w-3" /> Open Scenarios
        </Link>
      ) : (
        <button
          type="button"
          onClick={onSeed}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-400 hover:bg-brand/15"
        >
          <Database className="h-3 w-3" /> Seed + Run now
        </button>
      )}
    </div>
  );
}
