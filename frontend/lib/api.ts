import type {
  BatchDetail,
  BatchSummary,
  BulkImportPreviewResponse,
  CertificationReport,
  EngineeringTrace,
  IncidentExplanation,
  IncidentView,
  OperationsOverview,
  Scenario,
  ScenarioExecuteResult,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { detail?: string }).detail || `POST ${path} -> ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", cache: "no-store" });
  if (!res.ok && res.status !== 204) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { detail?: string }).detail || `DELETE ${path} -> ${res.status}`);
  }
}

export const api = {
  base: BASE,
  operations: (externalId?: string) =>
    get<OperationsOverview>(`/api/v1/operations${externalId ? `?external_id=${externalId}` : ""}`),
  batches: (scope?: "live" | "demo" | "all") =>
    get<BatchSummary[]>(`/api/v1/batches${scope ? `?scope=${scope}` : ""}`),
  batch: (externalId: string) => get<BatchDetail>(`/api/v1/batches/${externalId}`),
  batchAudit: (externalId: string) => get<unknown[]>(`/api/v1/batches/${externalId}/audit`),
  channelHistory: (externalId: string, actionId: string, channel: "pos" | "esl" | "ecommerce") =>
    get<{
      action: {
        id: string;
        sku: string;
        product_name: string;
        store_id: string;
        approved_price: number;
        prior_price: number;
        reason: string;
        decision: string;
      };
      channel: string;
      delivery: {
        id: string;
        status: string;
        attempts: number;
        created_at: string | null;
        updated_at: string | null;
      } | null;
      receipt: {
        id: string;
        status: string;
        expected_price: number;
        observed_price: number | null;
        received_at: string | null;
        raw_payload_json: Record<string, unknown>;
      } | null;
      audit_events: Array<{
        id: string;
        event: string;
        detail: string;
        actor: string;
        created_at: string | null;
      }>;
      note?: string;
    }>(`/api/v1/batches/${encodeURIComponent(externalId)}/actions/${encodeURIComponent(actionId)}/channels/${channel}/history`),
  expand: (externalId: string) => post<BatchSummary>(`/api/v1/batches/${externalId}/expand`),
  incidents: () => get<IncidentView[]>(`/api/v1/incidents`),
  incident: (id: string) => get<IncidentView>(`/api/v1/incidents/${id}`),
  explanation: (id: string) => get<IncidentExplanation>(`/api/v1/incidents/${id}/explanation`),
  incidentAudit: (id: string) =>
    get<import("./types").AuditEventView[]>(`/api/v1/incidents/${id}/audit`),
  markdowns: (externalId?: string) =>
    get<{ zone: string; markdowns: { action: import("./types").ActionView; markdown_deadline: string }[] }>(
      `/api/v1/markdowns${externalId ? `?external_id=${externalId}` : ""}`,
    ),
  engineering: (opts?: { externalId?: string; runMode?: string }) => {
    const q = opts?.externalId
      ? `?external_id=${opts.externalId}`
      : opts?.runMode
        ? `?run_mode=${opts.runMode}`
        : "";
    return get<EngineeringTrace>(`/api/v1/engineering${q}`);
  },
  retry: (id: string) => post<IncidentView>(`/api/v1/incidents/${id}/retry`),
  rollback: (id: string) => post<IncidentView>(`/api/v1/incidents/${id}/rollback`),
  resolve: (id: string) => post<IncidentView>(`/api/v1/incidents/${id}/resolve`),
  storeTask: (id: string) => post<unknown>(`/api/v1/incidents/${id}/store-task`),
  reset: () => post<BatchSummary>(`/api/v1/demo/reset`),
  systemStatus: () =>
    get<{ label: string; tone: "neutral" | "danger" | "warn" | "verified"; status: string | null }>(
      `/api/v1/system-status`,
    ),
  mode: () =>
    get<{
      mode: "demo" | "live";
      label: string;
      tone: "violet" | "rose";
      description: string;
      details: string;
    }>(`/api/v1/mode`),

  // Certification Lab
  certificationCurrent: () => get<CertificationReport>(`/api/v1/certification/current`),
  certificationReset: () => post<CertificationReport>(`/api/v1/certification/demo/reset`),
  certificationRerun: (runId: string) =>
    post<CertificationReport>(`/api/v1/certification/runs/${runId}/rerun-failed-checks`),

  // Connector Scenario Builder
  scenarios: () => get<Scenario[]>(`/api/v1/scenarios`),
  scenario: (id: string) => get<Scenario>(`/api/v1/scenarios/${id}`),
  createScenario: (body: unknown) => post<Scenario>(`/api/v1/scenarios`, body),
  executeScenario: (id: string, mode: string) =>
    post<ScenarioExecuteResult>(`/api/v1/scenarios/${id}/execute?mode=${mode}`),
  cloneScenario: (id: string) => post<Scenario>(`/api/v1/scenarios/${id}/clone`),
  deleteScenario: (id: string) => del(`/api/v1/scenarios/${id}`),
  scenarioImportPreview: (format: "csv" | "tsv" | "json", content: string) =>
    post<BulkImportPreviewResponse>(`/api/v1/scenarios/import/preview`, {
      format,
      content,
    }),
  scenariosLoadRealisticScale: (reload = false) =>
    post<{
      loaded: boolean;
      summary: {
        skus_in_catalog: number;
        kvi_skus?: number;
        perishable_skus?: number;
        categories_top_level?: number;
        categories_leaf?: number;
        stores?: number;
        history_days?: number;
        competitor_sources?: number;
        entities_created?: number;
        sku_links_created?: number;
        product_costs_created?: number;
        competitor_observations_created?: number;
        historical_sales_created?: number;
        skus_per_category?: Record<string, number>;
        existing_costs?: number;
        existing_entities?: number;
      };
      note: string;
    }>(`/api/v1/scenarios/load-realistic-scale${reload ? "?reload=true" : ""}`),

  // Competitor scraping
  scrapingSources: () =>
    get<{ sources: Array<{ source_id: string; name: string; description: string; start_url: string; max_pages: number }> }>(
      `/api/v1/scraping/sources`,
    ),
  scrapingRunTrigger: (sourceId: string) =>
    post<{
      source_id: string;
      pages_fetched: number;
      products_seen: number;
      products_inserted: number;
      products_updated: number;
      products_persisted: number;
      duration_ms: number;
      errors: string[];
    }>(`/api/v1/scraping/runs?source_id=${encodeURIComponent(sourceId)}`),
  scrapingRuns: () =>
    get<{
      runs: Array<{
        id: string;
        source_id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        duration_ms: number;
        pages_fetched: number;
        products_seen: number;
        products_inserted: number;
        products_updated: number;
        errors: string[];
      }>;
    }>(`/api/v1/scraping/runs`),
  // Pricing engine
  pricingSeedHistory: () => post<{ inserted: number; note: string }>(`/api/v1/pricing/seed-history`),
  pricingSeedSignals: () => post<{ inserted: number; note: string }>(`/api/v1/pricing/seed-signals`),
  pricingRunEngine: () =>
    post<{ scanned: number; recommended: number; skipped: number; persisted: number; superseded: number }>(
      `/api/v1/pricing/run`,
    ),
  pricingApplyRecommendation: (recId: string) =>
    post<{ recommendation_id: string; scenario_config_id: string; next_step: string }>(
      `/api/v1/pricing/recommendations/${encodeURIComponent(recId)}/apply`,
    ),
  pricingRecommendations: (onlyChanges = true, scope?: "live" | "demo" | "all") =>
    get<{
      total_returned: number;
      offset: number;
      limit: number;
      recommendations: Array<{
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
      }>;
    }>(
      `/api/v1/pricing/recommendations?only_changes=${onlyChanges}${scope ? `&scope=${scope}` : ""}`,
    ),
  pricingSkuHistory: (sku: string, storeId?: string) =>
    get<{
      sku: string;
      observations: Array<{
        date: string;
        store_id: string;
        price: number;
        units_sold: number;
        on_promotion: boolean;
      }>;
    }>(`/api/v1/pricing/sku/${encodeURIComponent(sku)}/history${storeId ? `?store_id=${storeId}` : ""}`),

  scrapingProducts: (params: { source_id?: string; q?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.source_id) qs.set("source_id", params.source_id);
    if (params.q) qs.set("q", params.q);
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    return get<{
      total_estimated: number;
      offset: number;
      limit: number;
      products: Array<{
        id: string;
        source_id: string;
        external_id: string;
        title: string;
        price: number;
        currency: string;
        category: string | null;
        availability: string | null;
        image_url: string | null;
        source_url: string | null;
        first_seen_at: string;
        last_seen_at: string;
        observation_count: number;
      }>;
    }>(`/api/v1/scraping/products${qs.toString() ? `?${qs.toString()}` : ""}`);
  },

  // ── Product Knowledge Graph ─────────────────────────────────────────
  graphEntities: (limit = 50, scope?: "live" | "demo" | "all") =>
    get<{
      total: number;
      entities: Array<{
        id: string;
        canonical_title: string;
        brand: string | null;
        manufacturer: string | null;
        upc: string | null;
        category_id: string | null;
        unit_size: string | null;
        attributes: Record<string, unknown>;
        match_confidence: number;
        is_manual: boolean;
        source_run_id?: string | null;
        linked_sku_count: number;
        competitor_observation_count: number;
        created_at: string;
      }>;
    }>(
      `/api/v1/product-graph/entities?limit=${limit}${scope ? `&scope=${scope}` : ""}`,
    ),
  graphEntity: (id: string) =>
    get<{
      entity: {
        id: string;
        canonical_title: string;
        brand: string | null;
        manufacturer: string | null;
        upc: string | null;
        category_id: string | null;
        unit_size: string | null;
        attributes: Record<string, unknown>;
        match_confidence: number;
        is_manual: boolean;
        created_at: string;
      };
      linked_skus: Array<{ sku: string; zone_id: string | null; linked_at: string }>;
      competitor_observations: Array<{
        source: string;
        price: number;
        currency: string;
        zone_id: string | null;
        store_id: string | null;
        observed_at: string;
        delta_pct: number | null;
      }>;
    }>(`/api/v1/product-graph/entities/${encodeURIComponent(id)}`),
  graphCategories: () =>
    get<{
      categories: Array<{
        id: string;
        name: string;
        description: string | null;
        children: Array<{ id: string; name: string; description: string | null; children: unknown[] }>;
      }>;
    }>(`/api/v1/product-graph/categories`),
  graphSeedDemo: () =>
    post<{
      seeded: boolean;
      categories?: number;
      entities?: number;
      sku_links?: number;
      competitor_products?: number;
      observations?: number;
      note: string;
    }>(`/api/v1/product-graph/seed-demo`),
  graphEntitySubstitutes: (entityId: string) =>
    get<{
      entity: {
        id: string;
        canonical_title: string;
        category_id: string | null;
        category_name: string | null;
      };
      substitutes: Array<{
        entity_id: string;
        canonical_title: string;
        category_id: string | null;
        category_name: string | null;
        estimated_cross_elasticity: number;
        confidence: number;
        kind: "substitute" | "weak_substitute" | "complement" | "weak_complement" | "unrelated";
        same_category: boolean;
      }>;
      note: string;
    }>(`/api/v1/product-graph/entities/${encodeURIComponent(entityId)}/substitutes`),
  graphBulkMatch: (minScore = 0.7) =>
    post<{ matched_count: number; skipped_count: number; min_score: number }>(
      `/api/v1/product-graph/bulk-match?min_score=${minScore}`,
    ),
  graphBootstrapFromScenario: (actions: Array<{ sku: string; product_name: string; approved_price: number; category?: string }>, zoneId?: string) =>
    post<{
      bootstrapped_entities: number;
      skipped_already_linked: number;
      skipped_invalid_input: number;
      competitor_observations_created: number;
      note: string;
    }>(`/api/v1/product-graph/bootstrap-from-scenario`, {
      actions,
      zone_id: zoneId,
    }),
  scenarioAutoEnrich: (
    actions: Array<{ sku: string; product_name: string; approved_price: number }>,
    storeIds: string[],
    zoneId?: string,
  ) =>
    post<{
      bootstrapped_entities: number;
      skipped_existing_entities: number;
      competitor_observations_created: number;
      product_costs_seeded: number;
      historical_sales_seeded: number;
      pricing_scanned: number;
      pricing_recommended: number;
      pricing_skipped: number;
      note: string;
    }>(`/api/v1/scenarios/auto-enrich`, {
      actions,
      store_ids: storeIds,
      zone_id: zoneId,
    }),
  graphCompetitorPricesForSku: (sku: string) =>
    get<{
      sku: string;
      entity_id: string | null;
      canonical_title?: string;
      observations: Array<{
        source_id: string;
        competitor_title: string;
        price: number;
        currency: string;
        delta_pct: number | null;
        observed_at: string;
      }>;
    }>(`/api/v1/product-graph/sku/${encodeURIComponent(sku)}/competitor-prices`),
  pricingWhatIfFit: (sku: string, storeId: string) =>
    get<{
      sku: string;
      store_id: string;
      product_name: string;
      current_price: number;
      prior_price: number;
      cost: number | null;
      competitor_price: number | null;
      competitor_source: string | null;
      is_kvi: boolean;
      is_perishable: boolean;
      days_to_deadline: number | null;
      elasticity: {
        beta: number;
        intercept: number;
        beta_se: number;
        beta_ci_low: number;
        beta_ci_high: number;
        r_squared: number;
        n_observations: number;
        sufficient_data: boolean;
        is_elastic: boolean;
        is_inelastic: boolean;
        is_statistically_significant: boolean;
        notes: string[];
      };
      observed_price_range: { min: number; max: number; mean: number };
      observations: Array<{ price: number; units: number; on_promotion: boolean }>;
    }>(`/api/v1/pricing/sku/${encodeURIComponent(sku)}/what-if-fit?store_id=${encodeURIComponent(storeId)}`),
  pricingMarginTargets: (scope?: "live" | "demo" | "all") =>
    get<{
      categories: Array<{
        policy: "kvi" | "perishable" | "standard";
        label: string;
        target_pct: number;
        current_pct: number | null;
        gap_pct: number | null;
        n_skus: number;
        n_with_cost: number;
        revenue_estimate: number;
        status: "above" | "at" | "near" | "below" | "no_data";
      }>;
      portfolio: {
        target_pct: number | null;
        current_pct: number | null;
        gap_pct: number | null;
        n_skus: number;
        revenue_estimate: number;
        status: "above" | "at" | "near" | "below" | "no_data";
      };
      bands: { at_pp: number; near_pp: number };
    }>(`/api/v1/pricing/margin-targets${scope ? `?scope=${scope}` : ""}`),
  pricingKviWatchlist: (scope?: "live" | "demo" | "all") =>
    get<{
      tolerance_pct: number;
      items: Array<{
        sku: string;
        store_id: string;
        product_name: string;
        current_price: number;
        prior_price: number | null;
        competitor_price: number | null;
        competitor_source: string | null;
        gap_dollar: number | null;
        gap_pct: number | null;
        abs_gap_pct: number | null;
        band: "within" | "above" | "below" | "no_competitor";
        recommendation: {
          id: string;
          recommended_price: number;
          change_pct: number;
          applied: boolean;
          applied_to_scenario_id: string | null;
        } | null;
      }>;
      summary: {
        total: number;
        within_band: number;
        above_band: number;
        below_band: number;
        max_abs_gap_pct: number;
      };
    }>(`/api/v1/pricing/kvi-watchlist${scope ? `?scope=${scope}` : ""}`),
  pricingSuggestForSku: (sku: string, storeId?: string) =>
    get<{
      sku: string;
      store_id: string | null;
      recommendation: {
        id: string;
        sku: string;
        store_id: string;
        product_name: string;
        current_price: number;
        recommended_price: number;
        change_pct: number;
        confidence: number;
        reasons: Array<{ code: string; message: string }>;
      } | null;
    }>(`/api/v1/pricing/sku/${encodeURIComponent(sku)}/suggest${storeId ? `?store_id=${storeId}` : ""}`),
};

export const DEMO_BATCH = "memorial-day-dallas-02";
