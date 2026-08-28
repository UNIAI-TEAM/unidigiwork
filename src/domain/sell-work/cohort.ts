// SWP-1 — Cohort model cho Sell Work (client-safe, không I/O).
//
// Bất biến:
//  - Mọi chỉ số cohort do SERVER tính (RPC compute_work_product_cohort).
//    UI KHÔNG được tự tính rồi lưu như nguồn sự thật.
//  - Cohort luôn gắn với MÃ SẢN PHẨM + PHIÊN BẢN + CỬA SỔ THỜI GIAN.
//  - Trạng thái cohort chỉ phản ánh CỠ MẪU, không phải thành công thương mại.

export const SWP1_FLAGSHIPS = [
  { code: "WPI_V1", version: 1, label: "Thông tin dự án hằng tuần", maturity: "UNDERSTAND" },
  { code: "MTE_V1", version: 1, label: "Chuyển cuộc họp thành công việc", maturity: "TRANSFORM" },
  { code: "PRV_V1", version: 1, label: "Phục hồi dự án", maturity: "ACT" },
] as const;

export type FlagshipCode = (typeof SWP1_FLAGSHIPS)[number]["code"];

/* ------------------------------ Trạng thái ------------------------------ */

export const COHORT_STATUSES = ["INSUFFICIENT", "EARLY", "PROVISIONAL", "PROVEN"] as const;
export type CohortStatus = (typeof COHORT_STATUSES)[number];

export const COHORT_STATUS_LABEL: Record<CohortStatus, string> = {
  INSUFFICIENT: "Chưa đủ mẫu",
  EARLY: "Giai đoạn đầu",
  PROVISIONAL: "Tạm đủ mẫu",
  PROVEN: "Đủ mẫu",
};

/** Ngưỡng cỡ mẫu — phải khớp với RPC (nguồn sự thật là server). */
export const COHORT_THRESHOLDS = { EARLY: 5, PROVISIONAL: 20, PROVEN: 50 } as const;

export function cohortStatusFromCount(n: number): CohortStatus {
  if (n >= COHORT_THRESHOLDS.PROVEN) return "PROVEN";
  if (n >= COHORT_THRESHOLDS.PROVISIONAL) return "PROVISIONAL";
  if (n >= COHORT_THRESHOLDS.EARLY) return "EARLY";
  return "INSUFFICIENT";
}

export const DATA_COMPLETENESS = ["FULL", "PARTIAL", "INSUFFICIENT"] as const;
export type DataCompleteness = (typeof DATA_COMPLETENESS)[number];

export const COMPLETENESS_LABEL: Record<DataCompleteness, string> = {
  FULL: "Đầy đủ",
  PARTIAL: "Một phần",
  INSUFFICIENT: "Không đủ",
};

export const MISSING_SIGNAL_LABEL: Record<string, string> = {
  ECONOMICS_MISSING: "Thiếu dữ liệu chi phí",
  QUALITY_MISSING: "Thiếu điểm chất lượng",
  OUTCOME_MISSING: "Thiếu xác minh kết quả",
  REVIEW_MISSING: "Thiếu dữ liệu duyệt",
  TELEMETRY_MISSING: "Thiếu telemetry",
};

/* --------------------------- Phân loại thất bại --------------------------- */

export const FAILURE_TAXONOMY = [
  "INPUT_INVALID",
  "CONTEXT_INSUFFICIENT",
  "PERMISSION_DENIED",
  "CONTRACT_BIND_FAILED",
  "AI_PROVIDER_FAILED",
  "ACTION_POLICY_BLOCKED",
  "QUALITY_GATE_FAILED",
  "HUMAN_REJECTED",
  "OUTCOME_NOT_VERIFIED",
  "SYSTEM_ERROR",
  "OTHER_KNOWN",
] as const;
export type FailureClass = (typeof FAILURE_TAXONOMY)[number];

export const FAILURE_LABEL: Record<FailureClass, string> = {
  INPUT_INVALID: "Đầu vào không hợp lệ",
  CONTEXT_INSUFFICIENT: "Ngữ cảnh không đủ",
  PERMISSION_DENIED: "Không đủ quyền",
  CONTRACT_BIND_FAILED: "Không gắn được hợp đồng",
  AI_PROVIDER_FAILED: "Nhà cung cấp AI lỗi",
  ACTION_POLICY_BLOCKED: "Chính sách hành động chặn",
  QUALITY_GATE_FAILED: "Không đạt cổng chất lượng",
  HUMAN_REJECTED: "Người duyệt từ chối",
  OUTCOME_NOT_VERIFIED: "Kết quả chưa xác minh được",
  SYSTEM_ERROR: "Lỗi hệ thống",
  OTHER_KNOWN: "Khác (đã biết)",
};

/** Ánh xạ tất định mã lỗi runtime → nhóm thất bại. Không dùng văn bản tự do. */
export function classifyFailure(errorCode: string | null | undefined): FailureClass {
  const c = String(errorCode ?? "").toUpperCase();
  if (!c) return "OTHER_KNOWN";
  if (c.startsWith("VALIDATION_FAILED") || c === "AI_TASK_SPEC_REQUIRED" || c === "MISSING_REQUIRED_INPUT" || c === "INVALID_INPUT")
    return "INPUT_INVALID";
  if (c === "CONTEXT_INSUFFICIENT" || c === "AI_CONTEXT_EMPTY") return "CONTEXT_INSUFFICIENT";
  if (c === "UNAUTHORIZED_INPUT" || c === "TENANT_ACCESS_DENIED" || c === "PERMISSION_DENIED" || c === "FORBIDDEN")
    return "PERMISSION_DENIED";
  if (c === "WORK_PRODUCT_BIND_FAILED" || c === "WORK_PRODUCT_CONTRACT_MISMATCH" || c === "WORK_PRODUCT_PREFLIGHT_FAILED")
    return "CONTRACT_BIND_FAILED";
  if (c === "AI_PROVIDER_UNAVAILABLE" || c === "AI_PROVIDER_FAILED") return "AI_PROVIDER_FAILED";
  if (c === "ACTION_POLICY_BLOCKED" || c === "WORK_PRODUCT_ACTION_NOT_ALLOWED" || c === "AI_ACTION_NOT_ALLOWED")
    return "ACTION_POLICY_BLOCKED";
  if (c === "QUALITY_GATE_FAILED") return "QUALITY_GATE_FAILED";
  if (c === "HUMAN_REJECTED") return "HUMAN_REJECTED";
  if (c === "OUTCOME_NOT_VERIFIED") return "OUTCOME_NOT_VERIFIED";
  if ((FAILURE_TAXONOMY as readonly string[]).includes(c)) return c as FailureClass;
  return "SYSTEM_ERROR";
}

/* ------------------------------ Kết quả RPC ------------------------------ */

export interface CohortQualityBands {
  b90_100: number;
  b80_89: number;
  b70_79: number;
  belowThreshold: number;
  missing: number;
}

export interface WorkProductCohort {
  code: string;
  version: number | null;
  windowFrom: string;
  windowTo: string;
  tenantScope: "PLATFORM" | "TENANT";
  includeSynthetic: boolean;
  qualityThreshold: number;
  tenantCount: number;
  totalExecutions: number;
  completedExecutions: number;
  acceptedExecutions: number;
  failedExecutions: number;
  firstPassAccepted: number;
  firstPassAcceptanceRate: number | null;
  finalAcceptanceRate: number | null;
  averageQualityScore: number | null;
  medianQualityScore: number | null;
  qualityBands: CohortQualityBands;
  averageRevisions: number | null;
  executionsWithRevision: number;
  revisionRate: number | null;
  averageHumanInterventions: number | null;
  averageMachineDurationMs: number | null;
  averageWallDurationMs: number | null;
  slaPassRate: number | null;
  slaKnownCount: number;
  verifiedOutcomeRate: number | null;
  verifiedOutcomeKnownCount: number;
  currency: string | null;
  currencyMismatch: boolean;
  knownCostPerExecution: number | null;
  knownCostPerAcceptedWork: number | null;
  costKnownCount: number;
  costFullCount: number;
  economicsCompleteness: DataCompleteness;
  dataCompleteness: DataCompleteness;
  missingSignals: string[];
  cohortStatus: CohortStatus;
  failureTaxonomy: Record<string, number>;
  exclusions: Record<string, number>;
  computedAt: string;
}

/** Nhãn hiển thị cho số liệu chưa đủ dữ liệu — không bao giờ hiển thị 0 giả. */
export function metricLabel(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined) return "Không đủ dữ liệu";
  return `${value}${suffix}`;
}

/* --------------------------- Tín hiệu tự báo cáo --------------------------- */

export const USEFULNESS_OPTIONS = ["USEFUL", "PARTIALLY_USEFUL", "NOT_USEFUL"] as const;
export type Usefulness = (typeof USEFULNESS_OPTIONS)[number];
export const USEFULNESS_LABEL: Record<Usefulness, string> = {
  USEFUL: "Hữu ích",
  PARTIALLY_USEFUL: "Hữu ích một phần",
  NOT_USEFUL: "Không hữu ích",
};

export const WOULD_USE_AGAIN_OPTIONS = ["YES", "MAYBE", "NO"] as const;
export type WouldUseAgain = (typeof WOULD_USE_AGAIN_OPTIONS)[number];
export const WOULD_USE_AGAIN_LABEL: Record<WouldUseAgain, string> = {
  YES: "Có",
  MAYBE: "Có thể",
  NO: "Không",
};
