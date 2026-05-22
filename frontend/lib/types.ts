export type ChannelStatus = "verified" | "mismatch" | "timeout" | "pending";
export type Decision = "pending" | "verified" | "eligible" | "retry" | "blocked";

export interface ChannelView {
  channel: "pos" | "esl" | "ecommerce";
  status: ChannelStatus;
  expected_price: number;
  observed_price: number | null;
  attempts: number;
}

export interface ActionView {
  id: string;
  sku: string;
  product_name: string;
  store_id: string;
  approved_price: number;
  prior_price: number;
  reason: string;
  is_kvi: boolean;
  is_perishable: boolean;
  markdown_deadline: string | null;
  projected_impact: string | null;
  decision: Decision;
  channels: ChannelView[];
}

export interface BatchSummary {
  id: string;
  external_id: string;
  name: string;
  zone: string;
  status: string;
  approved_by: string;
  total_store_count: number;
  canary_store_ids: string[];
  expansion_store_ids: string[];
  expansion_blocked: boolean;
  block_reason: string | null;
  created_at: string;
  total_actions: number;
  canary_action_count: number;
  verified_actions: number;
  blocked_actions: number;
  retry_actions: number;
  critical_incidents: number;
  deadline_risks: number;
}

export interface BatchDetail extends BatchSummary {
  actions: ActionView[];
}

export interface IncidentView {
  id: string;
  batch_id: string;
  action_id: string;
  type: "price_mismatch" | "channel_timeout" | "deadline_risk";
  severity: "critical" | "urgent" | "warning";
  status: "open" | "retrying" | "resolved" | "rolled_back";
  summary: string;
  offending_channel: string | null;
  product_name: string;
  sku: string;
  store_id: string;
  approved_price: number;
  observed_price: number | null;
  created_at: string;
  resolved_at: string | null;
  channels: ChannelView[];
}

export interface IncidentExplanation {
  incident_id: string;
  what_happened: string;
  why_it_matters: string;
  recommended_next_actions: string[];
  channels: ChannelView[];
}

export interface AuditEventView {
  id: string;
  event: string;
  detail: string;
  actor: "system" | "automated" | "operator";
  created_at: string;
}

export interface OperationsOverview {
  batch: BatchSummary;
  critical_incident: IncidentView | null;
  deadline_risk: IncidentView | null;
  eligible_action: ActionView | null;
  recent_activity: AuditEventView[];
  rollout_progress: {
    verified: number;
    blocked: number;
    pending: number;
    total: number;
    verified_pct: number;
  };
}

export interface ConnectorProfile {
  id: string;
  name: string;
  retailer_name: string;
  pos_provider: string;
  esl_provider: string;
  ecommerce_provider: string;
  status: string;
  created_at: string;
}

export interface CertificationCheck {
  id: string;
  check_type: string;
  scenario_name: string;
  status: "passed" | "failed" | "recovered";
  evidence: Record<string, unknown>;
  created_at: string;
}

export interface CertificationReport {
  run_id: string;
  status: "running" | "failed_pending_remediation" | "passed";
  final_recommendation: string | null;
  started_at: string;
  completed_at: string | null;
  batch_external_id: string | null;
  connector: ConnectorProfile;
  checks: CertificationCheck[];
  summary: { total: number; passed: number; recovered: number; failed: number };
}

export interface ScenarioAction {
  id?: string;
  product_name: string;
  sku: string;
  previous_price: number;
  approved_price: number;
  reason: string;
  is_kvi: boolean;
  deadline_at: string | null;
}

export type BehaviorType =
  | "success"
  | "stale_price"
  | "timeout"
  | "timeout_then_success"
  | "duplicate_ack";

export interface ConnectorBehavior {
  id?: string;
  store_id: string;
  sku: string;
  channel_type: "pos" | "esl" | "ecommerce";
  behavior_type: BehaviorType;
  configured_observed_price: number | null;
  configured_delay_ms: number | null;
  retry_success_price: number | null;
}

export interface Scenario {
  id: string;
  name: string;
  run_mode: string;
  environment: string;
  zone_name: string;
  store_ids: string[];
  canary_store_ids: string[];
  is_seeded: boolean;
  created_at: string;
  actions: ScenarioAction[];
  behaviors: ConnectorBehavior[];
}

export interface ScenarioExecuteResult {
  mode: string;
  redirect: string;
  scenario_id: string;
  batch_external_id: string | null;
  run_id: string | null;
}

export interface EngineeringTrace {
  batch: BatchSummary;
  run_mode: string;
  environment: string;
  scenario_config_id: string | null;
  behavior_profiles: {
    store_id: string;
    sku: string;
    channel: string;
    behavior: string;
    configured_observed_price: number | null;
    retry_success_price: number | null;
  }[];
  incident_from_configured_behavior: boolean;
  shared_engine_statement: string;
  pipeline: { stage: string; status: string; detail: string }[];
  outbox_events: {
    id: string;
    event_type: string;
    aggregate_id: string;
    status: string;
    attempts: number;
    created_at: string;
  }[];
  raw_receipt: Record<string, unknown> | null;
  reconciliation_result: Record<string, unknown>;
  recent_incidents: IncidentView[];
  test_proof: { command: string; passed: number; duration_s: number; tests: string[] };
}
