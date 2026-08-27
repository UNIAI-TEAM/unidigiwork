// WEE-1 — Work Execution Orchestrator: contracts client-safe (không I/O).
// Bất biến: orchestrator chỉ QUAN SÁT và ĐIỀU PHỐI. Nó không mở thêm bất kỳ
// đường ghi dữ liệu nghiệp vụ nào — bước ACTION chỉ tạo đề xuất chờ người xác nhận.

export const WORK_STEP_KINDS = [
  "CONTEXT",
  "PLAN",
  "GENERATE",
  "ACTION",
  "VALIDATE",
  "REVIEW",
] as const;
export type WorkStepKind = (typeof WORK_STEP_KINDS)[number];

export const WORK_STEP_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
  "AWAITING_CONFIRMATION",
] as const;
export type WorkStepStatus = (typeof WORK_STEP_STATUSES)[number];

/** Bước duy nhất được phép dừng ở trạng thái chờ người xác nhận. */
export const CONFIRMABLE_STEP_KIND: WorkStepKind = "ACTION";

export const WORK_STEP_LABEL: Record<WorkStepKind, string> = {
  CONTEXT: "Thu thập ngữ cảnh",
  PLAN: "Lập kế hoạch thực thi",
  GENERATE: "Soạn bản bàn giao",
  ACTION: "Đề xuất hành động",
  VALIDATE: "Tự kiểm theo tiêu chí nghiệm thu",
  REVIEW: "Chuyển người duyệt",
};

export const WORK_STEP_STATUS_LABEL: Record<WorkStepStatus, string> = {
  PENDING: "Chờ chạy",
  RUNNING: "Đang chạy",
  SUCCEEDED: "Hoàn tất",
  FAILED: "Thất bại",
  SKIPPED: "Bỏ qua",
  AWAITING_CONFIRMATION: "Chờ bạn xác nhận",
};

/** Thứ tự cố định của pipeline. Không nạp động từ database hay từ model. */
export const WORK_EXECUTION_PIPELINE: readonly WorkStepKind[] = [
  "CONTEXT",
  "PLAN",
  "GENERATE",
  "ACTION",
  "VALIDATE",
  "REVIEW",
] as const;

export interface WorkExecutionStepRow {
  id: string;
  execution_id: string;
  task_id: string;
  seq: number;
  kind: WorkStepKind;
  status: WorkStepStatus;
  title: string;
  detail: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output: Record<string, any>;
  error_code: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/** Kế hoạch do model đề xuất — chỉ mang tính mô tả, không điều khiển pipeline. */
export interface WorkPlanItem {
  order: number;
  summary: string;
  needsAction: boolean;
}

/** Kết quả tự kiểm: điểm 0..100 theo từng tiêu chí nghiệm thu. */
export interface WorkValidationResult {
  score: number;
  passed: boolean;
  checks: { criterion: string; met: boolean; note: string }[];
}

export function isTerminalStepStatus(status: string): boolean {
  return status === "SUCCEEDED" || status === "FAILED" || status === "SKIPPED";
}

/** Chỉ bước ACTION được phép dừng chờ xác nhận; mọi bước khác phải kết thúc. */
export function canAwaitConfirmation(kind: string): boolean {
  return kind === CONFIRMABLE_STEP_KIND;
}
