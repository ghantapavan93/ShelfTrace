import type {
  BatchDetail,
  BatchLifecycle,
  BatchSummary,
  BulkImportPreviewResponse,
  CertificationReport,
  CpiIntegrity,
  EngineeringTrace,
  IncidentExplanation,
  IncidentView,
  MeasurementIntegrity,
  OperationsOverview,
  RegressionCase,
  Scenario,
  ScenarioExecuteResult,
  SourceDataset,
  SourceObservation,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ──────────────────────────────────────────────────────────────────────
// SSE frame dispatcher — shared by scenarioImportPreviewStream
// ──────────────────────────────────────────────────────────────────────
//
// One SSE frame looks like:
//    event: row
//    data: {"row_number": 1, ...}
//
// We parse the event name and the JSON payload, then route to the right
// callback. Unknown event types are silently ignored — forward-compatible
// in case the backend adds new event types later (e.g. "progress" for
// large catalogs).
function dispatchFrame(
  frame: string,
  callbacks: {
    onMeta?: (m: any) => void;
    onRow?: (r: any) => void;
    onError?: (m: string) => void;
    onDone?: (s: any) => void;
  },
) {
  let eventName = "message";
  let dataStr = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      // SSE allows multi-line data; we only send single-line JSON, so
      // concatenating with newlines is fine (json.dumps emits one line).
      dataStr += (dataStr ? "\n" : "") + line.slice(5).trim();
    }
  }
  if (!dataStr) return;
  let payload: any;
  try {
    payload = JSON.parse(dataStr);
  } catch {
    return; // malformed frame — skip rather than blow up the stream
  }
  switch (eventName) {
    case "meta":
      callbacks.onMeta?.(payload);
      break;
    case "row":
      callbacks.onRow?.(payload);
      break;
    case "error":
      callbacks.onError?.(payload?.message ?? "unknown error");
      break;
    case "done":
      callbacks.onDone?.(payload);
      break;
  }
}

/**
 * Build a `?a=1&b=2` query string from an object, skipping null/undefined/empty
 * values and URL-encoding each value. Returns "" when nothing is set, so it's
 * safe to append directly to a path.
 */
function qs(params: Record<string, string | number | undefined | null>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
}

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
  operations: (externalId?: string, scope?: "live" | "demo" | "all") => {
    // external_id is the escape hatch and bypasses the scope filter, so we
    // only forward scope on the implicit-default path. In Live work mode the
    // backend returns 404 when no live batch exists → clean-slate banner.
    const qs = externalId
      ? `?external_id=${externalId}`
      : scope
        ? `?scope=${scope}`
        : "";
    return get<OperationsOverview>(`/api/v1/operations${qs}`);
  },
  // Batch-level measurement-integrity rollup. Mirrors `operations`: external_id
  // is the escape hatch and bypasses scope; otherwise scope is forwarded and the
  // backend 404s in Live mode when no live batch exists.
  measurementIntegrity: (externalId?: string, scope?: "live" | "demo" | "all") => {
    const qs = externalId
      ? `?external_id=${externalId}`
      : scope
        ? `?scope=${scope}`
        : "";
    return get<MeasurementIntegrity>(`/api/v1/operations/measurement-integrity${qs}`);
  },
  batches: (scope?: "live" | "demo" | "all") =>
    get<BatchSummary[]>(`/api/v1/batches${scope ? `?scope=${scope}` : ""}`),
  batch: (externalId: string) => get<BatchDetail>(`/api/v1/batches/${externalId}`),
  batchAudit: (externalId: string) => get<unknown[]>(`/api/v1/batches/${externalId}/audit`),
  // Post-export lifecycle rollup for one batch: Exported → Published →
  // Verified → Measured. Mirrors the BatchDetail.lifecycle field; used as the
  // dedicated fetch when the detail payload omits it to stay lean.
  batchLifecycle: (externalId: string) =>
    get<BatchLifecycle>(`/api/v1/batches/${encodeURIComponent(externalId)}/lifecycle`),
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
  incidents: (scope?: "live" | "demo" | "all") =>
    get<IncidentView[]>(`/api/v1/incidents${scope ? `?scope=${scope}` : ""}`),
  incident: (id: string) => get<IncidentView>(`/api/v1/incidents/${id}`),
  explanation: (id: string) => get<IncidentExplanation>(`/api/v1/incidents/${id}/explanation`),
  incidentAudit: (id: string) =>
    get<import("./types").AuditEventView[]>(`/api/v1/incidents/${id}/audit`),
  markdowns: (externalId?: string, scope?: "live" | "demo" | "all") => {
    const params = new URLSearchParams();
    if (externalId) params.set("external_id", externalId);
    if (scope) params.set("scope", scope);
    const qs = params.toString();
    return get<import("./types").MarkdownsResponse>(
      `/api/v1/markdowns${qs ? `?${qs}` : ""}`,
    );
  },
  engineering: (opts?: { externalId?: string; runMode?: string }) => {
    const q = opts?.externalId
      ? `?external_id=${opts.externalId}`
      : opts?.runMode
        ? `?run_mode=${opts.runMode}`
        : "";
    return get<EngineeringTrace>(`/api/v1/engineering${q}`);
  },
  // Decision Receipt — the derived evidence chain for a single action. Two
  // entry points: by action id (batch matrix) and by incident id (incident
  // detail resolves to its action).
  receipt: (actionId: string) =>
    get<import("./types").DecisionReceiptView>(
      `/api/v1/actions/${encodeURIComponent(actionId)}/receipt`,
    ),
  incidentReceipt: (incidentId: string) =>
    get<import("./types").DecisionReceiptView>(
      `/api/v1/incidents/${encodeURIComponent(incidentId)}/receipt`,
    ),
  // Operator takes ownership of the incident (the human-in-the-loop gate).
  // First step of the recovery workflow; recovery actions auto-acknowledge if
  // the operator skips this, so an incident is never recovered un-owned.
  acknowledge: (id: string) => post<IncidentView>(`/api/v1/incidents/${id}/acknowledge`),
  retry: (id: string) => post<IncidentView>(`/api/v1/incidents/${id}/retry`),
  rollback: (id: string) => post<IncidentView>(`/api/v1/incidents/${id}/rollback`),
  resolve: (id: string) => post<IncidentView>(`/api/v1/incidents/${id}/resolve`),
  // Create a human field-verification task for the offending store. An
  // optional instruction overrides the backend's auto-generated default.
  storeTask: (id: string, instruction?: string) =>
    post<import("./types").StoreTaskView>(
      `/api/v1/incidents/${id}/store-task`,
      instruction ? { instruction } : undefined,
    ),
  // Mark the incident's open verification task DONE (the associate confirmed
  // the shelf). Re-reconciles server-side; 409 when no open task exists.
  completeStoreTask: (id: string) =>
    post<import("./types").StoreTaskView>(`/api/v1/incidents/${id}/complete-store-task`),

  // Override Memory / Regression Replay — durable knowledge captured from a
  // recovered incident, re-exercised through the shared certification engine.
  regressionCases: () => get<RegressionCase[]>(`/api/v1/regression-cases`),
  createRegressionCase: (incidentId: string) =>
    post<RegressionCase>(`/api/v1/incidents/${encodeURIComponent(incidentId)}/create-regression-case`),
  replayRegressionCase: (caseId: string) =>
    post<{
      case_id: string;
      status: string;
      healed: boolean;
      certification_run_id: string | null;
      check_id: string | null;
      redirect: string;
      detail: string;
    }>(`/api/v1/regression-cases/${encodeURIComponent(caseId)}/replay`),
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
  /**
   * Stream import-preview validation events from the server as they happen.
   *
   * The browser's built-in EventSource() only supports GET, but our CSV
   * payloads can be up to 1 MiB so we need POST — hence the hand-rolled
   * fetch + ReadableStream + SSE parser. Each backend event becomes one
   * callback invocation in order:
   *
   *   onMeta(meta)        — fires once at the start
   *   onRow(row)          — fires 0..n times as rows validate
   *   onError(message)    — fires 0..n times for payload-level problems
   *   onDone(summary)     — fires once at the very end
   *
   * Returns an AbortController so the caller can cancel the stream
   * mid-flight (e.g. user closes the upload panel).
   */
  scenarioImportPreviewStream: (
    format: "csv" | "tsv" | "json",
    content: string,
    callbacks: {
      onMeta?: (meta: {
        format: string;
        source_sha256: string;
        schema_version: string;
      }) => void;
      onRow?: (row: {
        row_number: number;
        valid: boolean;
        errors: string[];
        sku: string;
        product_name: string;
        previous_price: number;
        approved_price: number;
        reason: string;
        is_kvi: boolean;
        deadline_at: string | null;
      }) => void;
      onError?: (message: string) => void;
      onDone?: (summary: {
        total: number;
        valid: number;
        invalid: number;
        blank_rows_skipped: number;
      }) => void;
    },
  ): { abort: () => void; promise: Promise<void> } => {
    const controller = new AbortController();
    const promise = (async () => {
      const res = await fetch(`${BASE}/api/v1/scenarios/import/preview/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ format, content }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        throw new Error(`stream preview failed: ${res.status}`);
      }
      // SSE wire format: `event: <name>\ndata: <json>\n\n`, possibly chunked
      // across multiple reader yields. Buffer until we find the \n\n frame
      // separator, then dispatch.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Parse all complete frames currently in the buffer
        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex !== -1) {
          const frame = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          dispatchFrame(frame, callbacks);
          separatorIndex = buffer.indexOf("\n\n");
        }
      }
      // Flush any trailing frame that came in without a final \n\n.
      if (buffer.trim()) dispatchFrame(buffer, callbacks);
    })();
    return { abort: () => controller.abort(), promise };
  },
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
  pricingSkuHistory: (sku: string, storeId?: string, scope?: "live" | "demo" | "all") =>
    get<{
      sku: string;
      observations: Array<{
        date: string;
        store_id: string;
        price: number;
        units_sold: number;
        on_promotion: boolean;
      }>;
    }>(
      `/api/v1/pricing/sku/${encodeURIComponent(sku)}/history${qs({
        store_id: storeId,
        scope,
      })}`,
    ),

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
  graphEntity: (id: string, scope?: "live" | "demo" | "all") =>
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
    }>(`/api/v1/product-graph/entities/${encodeURIComponent(id)}${scope ? `?scope=${scope}` : ""}`),
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
  graphEntitySubstitutes: (entityId: string, scope?: "live" | "demo" | "all") =>
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
    }>(
      `/api/v1/product-graph/entities/${encodeURIComponent(entityId)}/substitutes${
        scope ? `?scope=${scope}` : ""
      }`,
    ),
  graphBulkMatch: (minScore = 0.7) =>
    post<{ matched_count: number; skipped_count: number; min_score: number }>(
      `/api/v1/product-graph/bulk-match?min_score=${minScore}`,
    ),
  graphBootstrapFromScenario: (
    actions: Array<{ sku: string; product_name: string; approved_price: number; category?: string }>,
    zoneId?: string,
    sourceRunId?: string,
  ) =>
    post<{
      bootstrapped_entities: number;
      skipped_already_linked: number;
      skipped_invalid_input: number;
      competitor_observations_created: number;
      note: string;
    }>(`/api/v1/product-graph/bootstrap-from-scenario`, {
      actions,
      zone_id: zoneId,
      // Forward the live run id so bootstrap rows are scoped to the user's
      // batch instead of the 'user:bootstrap-anonymous' fallback.
      source_run_id: sourceRunId,
    }),
  scenarioAutoEnrich: (
    actions: Array<{ sku: string; product_name: string; approved_price: number }>,
    storeIds: string[],
    zoneId?: string,
    sourceRunId?: string,
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
      source_run_id: sourceRunId,
    }),
  graphCompetitorPricesForSku: (sku: string, scope?: "live" | "demo" | "all") =>
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
    }>(
      `/api/v1/product-graph/sku/${encodeURIComponent(sku)}/competitor-prices${
        scope ? `?scope=${scope}` : ""
      }`,
    ),
  // CPI Integrity — for every entity feeding the competitor price index, was
  // its intended price actually verified at the register? Scope-aware so a
  // Live-mode surface never counts demo-seeded inputs.
  cpiIntegrity: (scope?: "live" | "demo" | "all") =>
    get<CpiIntegrity>(
      `/api/v1/product-graph/cpi-integrity${scope ? `?scope=${scope}` : ""}`,
    ),
  pricingWhatIfFit: (sku: string, storeId: string, scope?: "live" | "demo" | "all") =>
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
    }>(
      `/api/v1/pricing/sku/${encodeURIComponent(sku)}/what-if-fit${qs({
        store_id: storeId,
        scope,
      })}`,
    ),
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
  pricingSuggestForSku: (sku: string, storeId?: string, scope?: "live" | "demo" | "all") =>
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
    }>(
      `/api/v1/pricing/sku/${encodeURIComponent(sku)}/suggest${qs({
        store_id: storeId,
        scope,
      })}`,
    ),

  // Real Data Replay
  dataSources: () => get<SourceDataset[]>(`/api/v1/data-sources`),
  sourceObservations: () => get<SourceObservation[]>(`/api/v1/source-observations`),
  importUsdaFdc: () => post<SourceObservation>(`/api/v1/data-sources/import/usda-fdc`),
  importUsdaAms: () => post<SourceObservation>(`/api/v1/data-sources/import/usda-ams`),
  createScenarioFromObservation: (id: string, body: unknown) =>
    post<ScenarioExecuteResult>(`/api/v1/source-observations/${id}/create-scenario`, body),

  // Ask ShelfTrace — deterministic Q&A over the live operations state
  explain: (query: string, scope?: "live" | "demo" | "all") =>
    post<{
      answer: string;
      evidence_chips: string[];
      zone_status: Record<string, string>;
      measurement_gate: string;
    }>(`/api/v1/operations/explain${scope ? `?scope=${scope}` : ""}`, { query }),
};

export const DEMO_BATCH = "memorial-day-dallas-02";
