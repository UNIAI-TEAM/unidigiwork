// WE-1 — Work Economics & Sell Work Metering: contracts client-safe (không I/O).
//
// Nguyên tắc trung thực:
//  - Chỉ đo tín hiệu ĐÃ ĐƯỢC GHI THẬT trong hệ thống. Không ước lượng, không suy diễn.
//  - Tín hiệu thiếu được liệt kê tường minh trong `missingSignals` và hạ `completeness`
//    xuống PARTIAL — không bao giờ điền 0 để "cho đẹp số".
//  - Metering là lớp QUAN SÁT: không thay đổi hành vi thực thi, không chặn pipeline.

export const WORK_METRICS_VERSION = "we1.metrics.v1";

/** Đơn vị công việc bán được (catalog toàn hệ thống, ánh xạ từ template bàn giao). */
export interface WorkUnitRow {
  code: string;
  version: number;
  template_code: string | null;
  label: string;
  objective: string;
  deliverable_type: string;
  expected_outcome_type: string;
  sla_machine_ms: number | null;
}

export const UNRESOLVED_WORK_UNIT = "UNRESOLVED";

/** Nguồn số liệu token — không được phép trộn ước lượng vào số thật. */
export const TOKEN_SOURCES = ["REAL", "PARTIAL", "MISSING"] as const;
export type TokenSource = (typeof TOKEN_SOURCES)[number];

export const TOKEN_SOURCE_LABEL: Record<TokenSource, string> = {
  REAL: "Đo thật (sinh + kiểm định)",
  PARTIAL: "Đo một phần",
  MISSING: "Chưa đo được",
};

export const METRIC_COMPLETENESS = ["COMPLETE", "PARTIAL"] as const;
export type MetricCompleteness = (typeof METRIC_COMPLETENESS)[number];

/** Các tín hiệu có thể thiếu; hiển thị nguyên văn cho người đọc số liệu. */
export const MISSING_SIGNAL_LABEL: Record<string, string> = {
  MACHINE_DURATION: "Thời gian máy (thiếu mốc bắt đầu/kết thúc)",
  WALL_DURATION: "Thời gian thực tế (lượt chạy chưa khép)",
  TOKENS: "Số token tiêu thụ",
  WORK_UNIT: "Đơn vị công việc (template chưa ánh xạ)",
  QUALITY: "Kết quả chấm chất lượng",
};

export interface WorkExecutionMetricsRow {
  id: string;
  tenant_id: string;
  workspace_id: string | null;
  execution_id: string;
  task_id: string;
  revision: number;
  ai_worker_id: string | null;

  work_unit_code: string;
  work_unit_version: number;
  work_unit_resolved: boolean;
  execution_status: string | null;

  machine_started_at: string | null;
  machine_completed_at: string | null;
  machine_duration_ms: number | null;
  wall_started_at: string | null;
  wall_completed_at: string | null;
  wall_duration_ms: number | null;
  queue_wait_ms: number | null;
  sla_machine_ms: number | null;
  sla_met: boolean | null;

  model_calls: number;
  generator_model: string | null;
  evaluator_model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  token_source: TokenSource;

  context_source_count: number | null;
  context_partial: boolean | null;

  step_total: number;
  step_failed: number;
  step_awaiting_confirmation: number;

  proposals_total: number;
  proposals_executed: number;
  proposals_rejected: number;

  human_confirmations: number;
  human_review_events: number;
  revision_count: number;

  quality_status: string | null;
  quality_score: number | null;
  quality_passed: boolean | null;

  outcome_type: string | null;
  outcome_verified: boolean | null;
  outcome_accepted: boolean | null;

  completeness: MetricCompleteness;
  missing_signals: string[];
  metrics_version: string;
  computed_at: string;
}

export interface WorkEconomicsSummary {
  metricsVersion: string;
  from: string;
  to: string;
  runs: number;
  completeRuns: number;
  acceptedRuns: number;
  verifiedOutcomes: number;
  qualityPassedRuns: number;
  humanInterventions: number;
  modelCalls: number;
  totalTokens: number;
  tokenSourceReal: number;
  machineMsP50: number | null;
  machineMsP95: number | null;
  wallMsP50: number | null;
  slaMetRuns: number;
  slaEvaluatedRuns: number;
}

/* ------------------------------ Chỉ số dẫn xuất ------------------------------ */

/** Tỉ lệ tin cậy: bao nhiêu phần trăm lượt chạy có đủ tín hiệu để đọc số. */
export function trustRatio(s: Pick<WorkEconomicsSummary, "runs" | "completeRuns">): number | null {
  if (!s.runs) return null;
  return Math.round((s.completeRuns / s.runs) * 100);
}

/** Tỉ lệ tự chủ: lượt chạy không cần con người can thiệp giữa chừng. */
export function autonomyRatio(rows: Pick<WorkExecutionMetricsRow, "human_confirmations">[]): number | null {
  if (!rows.length) return null;
  const clean = rows.filter((r) => r.human_confirmations === 0).length;
  return Math.round((clean / rows.length) * 100);
}

/** Tỉ lệ ra kết quả nghiệp vụ kiểm chứng được (không phải chỉ ra văn bản). */
export function outcomeYield(s: Pick<WorkEconomicsSummary, "runs" | "verifiedOutcomes">): number | null {
  if (!s.runs) return null;
  return Math.round((s.verifiedOutcomes / s.runs) * 100);
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} giây`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  if (m < 60) return `${m} phút ${rest} giây`;
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

/** Nhãn tiếng Việt cho danh sách tín hiệu thiếu. */
export function describeMissingSignals(codes: readonly string[]): string[] {
  return codes.map((c) => MISSING_SIGNAL_LABEL[c] ?? c);
}
