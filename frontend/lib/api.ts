import type {
  BatchDetail,
  BatchSummary,
  EngineeringTrace,
  IncidentExplanation,
  IncidentView,
  OperationsOverview,
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
  engineering: (externalId?: string) =>
    get<EngineeringTrace>(`/api/v1/engineering${externalId ? `?external_id=${externalId}` : ""}`),
  retry: (id: string) => post<IncidentView>(`/api/v1/incidents/${id}/retry`),
  rollback: (id: string) => post<IncidentView>(`/api/v1/incidents/${id}/rollback`),
  resolve: (id: string) => post<IncidentView>(`/api/v1/incidents/${id}/resolve`),
  storeTask: (id: string) => post<unknown>(`/api/v1/incidents/${id}/store-task`),
  reset: () => post<BatchSummary>(`/api/v1/demo/reset`),
};

export const DEMO_BATCH = "memorial-day-dallas-02";
