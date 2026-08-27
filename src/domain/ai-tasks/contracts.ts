// AI TASK EXECUTION V1 — contracts client-safe (không I/O).
// Bất biến: AI chỉ tạo bản nháp (deliverable) và luôn dừng ở WAITING_REVIEW.
// Chỉ con người mới có thể ACCEPTED. Không có nhánh nào cho phép AI tự nghiệm thu.

export const AI_TASK_EXECUTION_STATUSES = [
  "QUEUED",
  "RUNNING",
  "WAITING_REVIEW",
  "CHANGES_REQUESTED",
  "ACCEPTED",
  "FAILED",
] as const;
export type AiTaskExecutionStatus = (typeof AI_TASK_EXECUTION_STATUSES)[number];

export const TASK_EXECUTION_MODES = ["HUMAN", "AI_ASSISTED"] as const;
export type TaskExecutionMode = (typeof TASK_EXECUTION_MODES)[number];

/** Trạng thái AI trên bản ghi task (thêm NOT_STARTED so với execution). */
export type TaskAiExecutionStatus = "NOT_STARTED" | AiTaskExecutionStatus;

/** Trạng thái mà AI được phép ghi khi kết thúc một lượt chạy. */
export const AI_TERMINAL_STATUSES = ["WAITING_REVIEW", "FAILED"] as const;
export type AiTerminalStatus = (typeof AI_TERMINAL_STATUSES)[number];

export function isHumanOnlyStatus(status: string): boolean {
  return status === "ACCEPTED" || status === "CHANGES_REQUESTED";
}
export function canAiWriteStatus(status: string): boolean {
  return (AI_TERMINAL_STATUSES as readonly string[]).includes(status);
}
export function isReviewable(status: string): boolean {
  return status === "WAITING_REVIEW";
}

/* ------------------------- Deliverable templates ------------------------- */

export interface DeliverableTemplate {
  code: string;
  label: string;
  deliverableType: "SUMMARY" | "ANALYSIS" | "PLAN" | "DRAFT";
  /** Hướng dẫn cấu trúc bản bàn giao — ghép vào prompt hệ thống. */
  outline: string;
}

export const DELIVERABLE_TEMPLATES: readonly DeliverableTemplate[] = [
  {
    code: "SUMMARY_REPORT",
    label: "Báo cáo tóm tắt",
    deliverableType: "SUMMARY",
    outline: "## Tóm tắt\n## Diễn biến chính\n## Việc cần làm tiếp theo",
  },
  {
    code: "ANALYSIS_REPORT",
    label: "Báo cáo phân tích & rủi ro",
    deliverableType: "ANALYSIS",
    outline: "## Bối cảnh\n## Phân tích\n## Rủi ro & tác động\n## Khuyến nghị",
  },
  {
    code: "MEETING_FOLLOW_UP",
    label: "Theo dõi sau cuộc họp",
    deliverableType: "PLAN",
    outline: "## Quyết định đã chốt\n## Việc cần làm (ai · khi nào)\n## Vấn đề còn mở",
  },
  {
    code: "RESEARCH_BRIEF",
    label: "Bản tổng hợp nghiên cứu",
    deliverableType: "DRAFT",
    outline: "## Câu hỏi nghiên cứu\n## Phát hiện chính\n## Khoảng trống dữ liệu\n## Đề xuất",
  },
] as const;

export function templateByCode(code: string | null | undefined): DeliverableTemplate {
  return DELIVERABLE_TEMPLATES.find((t) => t.code === code) ?? DELIVERABLE_TEMPLATES[0]!;
}

/* ------------------------------ Row shapes ------------------------------ */

export interface AiWorkerRow {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  role: string;
  skills: string[];
  allowed_tools: string[];
  permission_scope: string;
  status: string;
}

export interface AiExecutionEvidence {
  model?: string;
  contextRequestId?: string;
  sourceCount?: number;
  estimatedTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  assumptions?: string[];
  limitations?: string[];
  partialContext?: boolean;
  invalidCitations?: string[];
  durationMs?: number;
  /** WEE-1 — điểm tự kiểm theo tiêu chí nghiệm thu (0..100). */
  validationScore?: number;
  validationPassed?: boolean;
  /** WEE-1 — số đề xuất hành động đang chờ người dùng xác nhận. */
  proposedActionCount?: number;
}

export interface AiTaskExecutionRow {
  id: string;
  task_id: string;
  ai_worker_id: string;
  status: AiTaskExecutionStatus;
  revision: number;
  template_code: string | null;
  deliverable_type: string | null;
  deliverable_title: string | null;
  deliverable_content: string | null;
  source_refs: { sourceId: string; title: string; href: string; entityType: string }[];
  evidence: AiExecutionEvidence;
  change_request: string | null;
  error_code: string | null;
  started_at: string | null;
  completed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export const AI_EXECUTION_STATUS_LABEL: Record<TaskAiExecutionStatus, string> = {
  NOT_STARTED: "Chưa chạy",
  QUEUED: "Đang xếp hàng",
  RUNNING: "AI đang thực hiện",
  WAITING_REVIEW: "Chờ người duyệt",
  CHANGES_REQUESTED: "Yêu cầu chỉnh sửa",
  ACCEPTED: "Đã nghiệm thu",
  FAILED: "Thất bại",
};
