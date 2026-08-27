// WE-2 — Work Catalog & Outcome Contract: contracts client-safe (không I/O).
//
// Nguyên tắc:
//  - Hợp đồng Sản phẩm Công việc là NGUỒN SỰ THẬT do server phân giải. Client chỉ
//    được cung cấp INPUT được phép; không được đổi phiên bản, tiêu chí, ngưỡng
//    chất lượng, SLA, outcome hay danh sách hành động.
//  - Mọi giao cắt chính sách là INTERSECT, không bao giờ UNION: hợp đồng sản phẩm
//    chỉ có thể làm CHẶT hơn chính sách nhân sự AI (WEE-2), không nới lỏng.
//  - Một phiên bản hợp đồng đã dùng để chạy việc là bất biến về ngữ nghĩa.

export const WORK_PRODUCT_CONTRACT_VERSION = "we2.contract.v1";

/* ------------------------------ Vòng đời ------------------------------ */

export const WORK_PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "RETIRED"] as const;
export type WorkProductStatus = (typeof WORK_PRODUCT_STATUSES)[number];

export const WORK_PRODUCT_STATUS_LABEL: Record<WorkProductStatus, string> = {
  DRAFT: "Bản nháp",
  ACTIVE: "Đang phục vụ",
  PAUSED: "Tạm dừng",
  RETIRED: "Ngừng cung cấp",
};

/** Chỉ ACTIVE mới được tạo lượt chạy mới. */
export function canExecuteStatus(status: string): boolean {
  return status === "ACTIVE";
}

/* ------------------------------ Hợp đồng ------------------------------ */

export type WorkProductInputType = "uuid" | "text" | "date_range";

export interface WorkProductInputProperty {
  type: WorkProductInputType;
  /** Với type = uuid: loại thực thể phải kiểm quyền truy cập trước khi chạy. */
  entityType?: "PROJECT" | "TASK" | "MEETING" | "DOCUMENT" | null;
}

export interface WorkProductInputContract {
  required: string[];
  properties: Record<string, WorkProductInputProperty>;
}

export interface WorkProductContextContract {
  allowedEntityTypes: string[];
  optionalEntityTypes: string[];
  maxSources: number | null;
}

export interface WorkProductExecutorContract {
  requiredRole: string | null;
  requiredSkills: string[];
  /** V1: cho phép chỉ định cứng một nhân sự AI khi tổ chức muốn kiểm soát tuyệt đối. */
  pinnedWorkerId?: string | null;
}

export interface WorkProductActionContract {
  allowedActions: string[];
  maxAutonomy: string;
}

export interface WorkProductDeliverableContract {
  type?: string;
  requiredSections: string[];
}

export interface WorkProductAcceptanceContract {
  mandatoryCriteria: string[];
}

export interface WorkProductQualityContract {
  minimumQualityScore: number;
  requiredDimensions: string[];
}

export interface WorkProductReviewContract {
  policy: "HUMAN_REVIEW_REQUIRED" | "HUMAN_REVIEW_REQUIRED_IF_WARNING";
}

export interface WorkProductSlaContract {
  machineDurationMs: number | null;
  wallDurationMs: number | null;
}

/** Dòng danh mục (public.work_units) đã được đọc dưới dạng hợp đồng. */
export interface WorkProductContract {
  code: string;
  version: number;
  label: string;
  description: string | null;
  objective: string;
  category: string;
  status: WorkProductStatus;
  templateCode: string | null;
  deliverableType: string;
  outcomeType: string;
  slaMachineMs: number | null;
  contractHash: string | null;
  input: WorkProductInputContract;
  context: WorkProductContextContract;
  executor: WorkProductExecutorContract;
  action: WorkProductActionContract;
  deliverable: WorkProductDeliverableContract;
  acceptance: WorkProductAcceptanceContract;
  quality: WorkProductQualityContract;
  review: WorkProductReviewContract;
  sla: WorkProductSlaContract;
}

/* --------------------------- Mã lỗi preflight --------------------------- */

export const WORK_PRODUCT_ERROR_CODES = [
  "WORK_PRODUCT_NOT_FOUND",
  "WORK_PRODUCT_NOT_ACTIVE",
  "INVALID_WORK_PRODUCT_VERSION",
  "MISSING_REQUIRED_INPUT",
  "INVALID_INPUT",
  "UNAUTHORIZED_INPUT",
  "NO_ELIGIBLE_EXECUTOR",
  "CONTEXT_POLICY_INVALID",
  "ACTION_POLICY_CONFLICT",
  "QUALITY_POLICY_INVALID",
  "OUTCOME_POLICY_INVALID",
  "WORK_PRODUCT_ACTION_NOT_ALLOWED",
  "WORK_PRODUCT_CONTRACT_IMMUTABLE",
] as const;
export type WorkProductErrorCode = (typeof WORK_PRODUCT_ERROR_CODES)[number];

export const WORK_PRODUCT_ERROR_LABEL: Record<WorkProductErrorCode, string> = {
  WORK_PRODUCT_NOT_FOUND: "Không tìm thấy sản phẩm công việc.",
  WORK_PRODUCT_NOT_ACTIVE: "Sản phẩm công việc hiện không nhận lượt chạy mới.",
  INVALID_WORK_PRODUCT_VERSION: "Phiên bản hợp đồng không hợp lệ.",
  MISSING_REQUIRED_INPUT: "Thiếu dữ liệu đầu vào bắt buộc.",
  INVALID_INPUT: "Dữ liệu đầu vào không đúng định dạng hợp đồng.",
  UNAUTHORIZED_INPUT: "Bạn không có quyền với dữ liệu đầu vào đã chọn.",
  NO_ELIGIBLE_EXECUTOR: "Không có nhân sự AI đủ điều kiện thực hiện việc này.",
  CONTEXT_POLICY_INVALID: "Chính sách ngữ cảnh của hợp đồng không hợp lệ.",
  ACTION_POLICY_CONFLICT: "Hành động được yêu cầu nằm ngoài hợp đồng.",
  QUALITY_POLICY_INVALID: "Ngưỡng chất lượng của hợp đồng không hợp lệ.",
  OUTCOME_POLICY_INVALID: "Kết quả nghiệm thu của hợp đồng không hợp lệ.",
  WORK_PRODUCT_ACTION_NOT_ALLOWED: "Hợp đồng sản phẩm không cho phép hành động này.",
  WORK_PRODUCT_CONTRACT_IMMUTABLE: "Phiên bản hợp đồng đã được sử dụng, không thể sửa ngữ nghĩa.",
};

export interface PreflightIssue {
  code: WorkProductErrorCode;
  field?: string | null;
  message: string;
}

export interface WorkProductPreflight {
  ready: boolean;
  code: string;
  version: number;
  contractHash: string | null;
  issues: PreflightIssue[];
  /** Input đã chuẩn hoá, chỉ chứa khoá được hợp đồng khai báo. */
  inputs: Record<string, string>;
  executorWorkerId: string | null;
}

/* --------------------------- Kiểm tra đầu vào --------------------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RANGE_RE = /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/;

/**
 * Bộ kiểm tối giản, có kiểm soát — KHÔNG phải JSON-Schema engine.
 * Trả về input đã lọc (bỏ mọi khoá không khai báo) và danh sách lỗi.
 */
export function validateWorkProductInputs(
  contract: WorkProductInputContract,
  raw: Record<string, unknown>,
): { inputs: Record<string, string>; issues: PreflightIssue[] } {
  const issues: PreflightIssue[] = [];
  const inputs: Record<string, string> = {};

  for (const [key, prop] of Object.entries(contract.properties ?? {})) {
    const value = raw[key];
    if (value === undefined || value === null || String(value).trim() === "") continue;
    const text = String(value).trim();
    if (prop.type === "uuid" && !UUID_RE.test(text)) {
      issues.push({ code: "INVALID_INPUT", field: key, message: `Trường "${key}" phải là mã định danh hợp lệ.` });
      continue;
    }
    if (prop.type === "date_range" && !DATE_RANGE_RE.test(text)) {
      issues.push({ code: "INVALID_INPUT", field: key, message: `Trường "${key}" phải có dạng YYYY-MM-DD..YYYY-MM-DD.` });
      continue;
    }
    if (prop.type === "text" && text.length > 500) {
      issues.push({ code: "INVALID_INPUT", field: key, message: `Trường "${key}" vượt quá 500 ký tự.` });
      continue;
    }
    inputs[key] = text;
  }

  for (const key of contract.required ?? []) {
    if (!inputs[key]) {
      issues.push({ code: "MISSING_REQUIRED_INPUT", field: key, message: `Thiếu dữ liệu bắt buộc "${key}".` });
    }
  }

  return { inputs, issues };
}

/* ------------------------ Giao cắt chính sách ------------------------ */

/** Hành động hiệu lực = hợp đồng ∩ nhân sự AI. Không bao giờ hợp nhất. */
export function effectiveAllowedActions(
  contractActions: readonly string[],
  workerTools: readonly string[] | null | undefined,
): string[] {
  if (!contractActions.length) return [];
  const tools = new Set(workerTools ?? []);
  return contractActions.filter((a) => tools.has(a));
}

const AUTONOMY_RANK: Record<string, number> = {
  PROPOSE_ONLY: 1,
  EXECUTE_WITH_APPROVAL: 2,
  EXECUTE_LOW_RISK: 3,
  EXECUTE_AUTONOMOUS: 4,
};

/** Tự chủ hiệu lực = mức HẠN CHẾ NHẤT giữa hợp đồng và nhân sự AI. */
export function effectiveAutonomy(contractMax: string, workerLevel: string | null | undefined): string {
  const a = AUTONOMY_RANK[contractMax] ?? 1;
  const b = AUTONOMY_RANK[workerLevel ?? "PROPOSE_ONLY"] ?? 1;
  return a <= b ? contractMax : (workerLevel as string);
}

/** Ngữ cảnh hiệu lực: hợp đồng chỉ được THU HẸP trần toàn cục. */
export function effectiveMaxSources(contractMax: number | null, globalHardLimit: number): number {
  if (!contractMax || contractMax <= 0) return globalHardLimit;
  return Math.min(contractMax, globalHardLimit);
}

/** Ngưỡng chất lượng hiệu lực: hợp đồng chỉ được NÂNG so với sàn hệ thống. */
export function effectiveQualityThreshold(contractMin: number | null | undefined, systemFloor: number): number {
  if (!contractMin || contractMin <= 0) return systemFloor;
  return Math.max(contractMin, systemFloor);
}

/** Tiêu chí bắt buộc của sản phẩm luôn được giữ; người dùng chỉ được THÊM. */
export function mergeAcceptanceCriteria(mandatory: readonly string[], userCriteria: string): string {
  const extra = userCriteria
    .split(/\r?\n|(?<=\.)\s+(?=[A-ZÀ-Ỹ])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set(mandatory.map((m) => m.toLowerCase()));
  const merged = [...mandatory, ...extra.filter((e) => !seen.has(e.toLowerCase()))];
  return merged.join("\n");
}

export function formatSla(ms: number | null | undefined): string {
  if (!ms) return "Chưa cam kết";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} giây` : `${Math.round(s / 60)} phút`;
}
