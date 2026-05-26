"use client";

/**
 * ScenarioActionHints — surfaces competitor prices (from scraper graph) and
 * pricing-engine recommendations (from the elasticity pipeline) next to each
 * action row in the Scenarios builder.
 *
 * Closes the loop:
 *   • Competitor Scraping  → populates competitor_price_observations
 *   • Knowledge Graph      → links scenario SKUs to canonical entities
 *   • Pricing Engine       → produces recommended_price per SKU·store
 *   • Scenarios Builder    → shows these alongside the user-entered approved_price
 *                            with one-click "Use" buttons
 *
 * Fetches happen lazily per SKU and cache via React state on the parent.
 */

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Globe, Brain, TrendingDown, TrendingUp, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

interface Props {
  sku: string;
  currentApprovedPrice: number;
  /** Bump this number after a bootstrap/seed action to force the hints to refetch
   *  even when the SKU itself hasn't changed. */
  refreshToken?: number;
  onUseCompetitor?: (price: number, source: string) => void;
  onUseRecommendation?: (price: number) => void;
}

type CompetitorObservation = {
  source_id: string;
  price: number;
  delta_pct: number | null;
};

type PricingRec = {
  recommended_price: number;
  change_pct: number;
  confidence: number;
  reasons: Array<{ code: string; message: string }>;
};

export function ScenarioActionHints({
  sku,
  currentApprovedPrice,
  refreshToken = 0,
  onUseCompetitor,
  onUseRecommendation,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [competitor, setCompetitor] = useState<CompetitorObservation | null>(null);
  const [recommendation, setRecommendation] = useState<PricingRec | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!sku || sku.trim() === "") {
      setCompetitor(null);
      setRecommendation(null);
      setFetched(false);
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([
      api.graphCompetitorPricesForSku(sku).catch(() => null),
      api.pricingSuggestForSku(sku).catch(() => null),
    ])
      .then(([competitorData, pricingData]) => {
        if (!alive) return;
        // Take the lowest competitor price as the "anchor"
        if (competitorData && competitorData.observations.length > 0) {
          const lowest = competitorData.observations.reduce((min, o) =>
            o.price < min.price ? o : min,
          );
          setCompetitor({
            source_id: lowest.source_id,
            price: lowest.price,
            delta_pct: lowest.delta_pct,
          });
        } else {
          setCompetitor(null);
        }
        if (pricingData && pricingData.recommendation) {
          setRecommendation({
            recommended_price: pricingData.recommendation.recommended_price,
            change_pct: pricingData.recommendation.change_pct,
            confidence: pricingData.recommendation.confidence,
            reasons: pricingData.recommendation.reasons,
          });
        } else {
          setRecommendation(null);
        }
        setFetched(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sku, refreshToken]);

  if (!sku || sku.trim() === "") return null;

  if (loading && !fetched) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking knowledge graph and pricing engine…
      </div>
    );
  }

  if (!competitor && !recommendation) {
    return (
      <div className="mt-2 text-[11px] text-slate-600">
        No competitor data or pricing recommendation for{" "}
        <span className="mono">{sku}</span>.{" "}
        <a href="/product-graph" className="text-violet-400 hover:underline">
          Seed graph
        </a>{" "}
        or{" "}
        <a href="/pricing" className="text-brand-400 hover:underline">
          run pricing engine
        </a>{" "}
        first.
      </div>
    );
  }

  const compMatch = competitor && Math.abs(competitor.price - currentApprovedPrice) < 0.005;
  const recMatch =
    recommendation &&
    Math.abs(recommendation.recommended_price - currentApprovedPrice) < 0.005;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
      {competitor && (
        <button
          type="button"
          onClick={() => onUseCompetitor?.(competitor.price, competitor.source_id)}
          disabled={compMatch || !onUseCompetitor}
          className={clsx(
            "group inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition",
            compMatch
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-emerald-500/20 bg-emerald-500/5 text-slate-300 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200",
          )}
          title={`Lowest competitor price from ${competitor.source_id}`}
        >
          <Globe className="h-3 w-3 text-emerald-400" />
          <span>
            Competitor: <span className="mono tabular-nums">{money(competitor.price)}</span>
          </span>
          <span className="text-[10px] text-slate-500">{competitor.source_id}</span>
          {compMatch ? (
            <Check className="h-3 w-3" />
          ) : (
            onUseCompetitor && (
              <span className="ml-0.5 hidden text-[10px] uppercase tracking-wider opacity-0 transition group-hover:inline group-hover:opacity-100">
                use
              </span>
            )
          )}
        </button>
      )}

      {recommendation && (
        <button
          type="button"
          onClick={() => onUseRecommendation?.(recommendation.recommended_price)}
          disabled={recMatch || !onUseRecommendation}
          className={clsx(
            "group inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition",
            recMatch
              ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
              : "border-violet-500/20 bg-violet-500/5 text-slate-300 hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-200",
          )}
          title={
            recommendation.reasons[0]?.message ||
            `Pricing engine recommendation · confidence ${(recommendation.confidence * 100).toFixed(0)}%`
          }
        >
          <Brain className="h-3 w-3 text-violet-400" />
          <span>
            Pricing rec:{" "}
            <span className="mono tabular-nums">
              {money(recommendation.recommended_price)}
            </span>
          </span>
          <span
            className={clsx(
              "flex items-center gap-0.5 text-[10px]",
              recommendation.change_pct > 0 ? "text-rose-300" : "text-emerald-300",
            )}
          >
            {recommendation.change_pct > 0 ? (
              <TrendingUp className="h-2.5 w-2.5" />
            ) : (
              <TrendingDown className="h-2.5 w-2.5" />
            )}
            {Math.abs(recommendation.change_pct).toFixed(1)}%
          </span>
          {recMatch ? (
            <Check className="h-3 w-3" />
          ) : (
            onUseRecommendation && (
              <span className="ml-0.5 hidden text-[10px] uppercase tracking-wider opacity-0 transition group-hover:inline group-hover:opacity-100">
                use
              </span>
            )
          )}
        </button>
      )}
    </div>
  );
}
