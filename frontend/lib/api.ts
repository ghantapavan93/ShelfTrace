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
  batches: () => get<BatchSummary[]>(`/api/v1/batches`),
  batch: (externalId: string) => get<BatchDetail>(`/api/v1/batches/${externalId}`),
  batchAudit: (externalId: string) => get<unknown[]>(`/api/v1/batches/${externalId}/audit`),
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
  pricingRecommendations: (onlyChanges = true) =>
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
    }>(`/api/v1/pricing/recommendations?only_changes=${onlyChanges}`),
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
};

export const DEMO_BATCH = "memorial-day-dallas-02";
