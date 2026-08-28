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
  /**
   * SWP-1 — Hướng dẫn riêng của sản phẩm công việc (adapter mỏng quanh WEE-1).
   * Chỉ SIẾT thêm hành vi; mọi ràng buộc an toàn toàn cục vẫn giữ nguyên.
   */
  productInstructions?: string;
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

  /* --------- SWP-1 — Ba sản phẩm công việc chủ lực (flagship) --------- */
  {
    code: "WPI_WEEKLY_INTELLIGENCE",
    label: "Thông tin dự án hằng tuần",
    deliverableType: "SUMMARY",
    outline: [
      "## 1. Tóm tắt điều hành",
      "## 2. Thay đổi trong tuần",
      "## 3. Tiến độ",
      "## 4. Rủi ro",
      "## 5. Điểm nghẽn",
      "## 6. Quyết định đang chờ",
      "## 7. Cam kết",
      "## 8. Cần chú ý",
      "## 9. Hành động đề xuất",
      "## 10. Bằng chứng / Nguồn",
    ].join("\n"),
    productInstructions: [
      "SẢN PHẨM: Thông tin dự án hằng tuần (WPI_V1) cho người phụ trách dự án.",
      "Viết ngắn, mật độ thông tin cao; tối đa 6 gạch đầu dòng mỗi mục; tuyệt đối không văn phong AI chung chung.",
      "Chỉ nêu thay đổi có bằng chứng trong kỳ báo cáo. Không có bằng chứng ⇒ ghi 'Không có dữ liệu trong kỳ'.",
      "Không bịa trạng thái, người phụ trách hay hạn chót. Mọi con số phải trích dẫn nguồn.",
      "Ở mục Điểm nghẽn, ghi rõ [SỰ KIỆN] hoặc [SUY LUẬN] trước mỗi mục.",
      "Ở mục Hành động đề xuất, mở đầu mỗi mục bằng [KHUYẾN NGHỊ]; đây không phải mệnh lệnh đã được duyệt.",
    ].join("\n"),
  },
  {
    code: "MTE_EXECUTION_PACKAGE",
    label: "Chuyển cuộc họp thành công việc",
    deliverableType: "PLAN",
    outline: [
      "## 1. Tóm tắt cuộc họp",
      "## 2. Quyết định",
      "## 3. Cam kết",
      "## 4. Đầu việc",
      "## 5. Câu hỏi chưa giải quyết",
      "## 6. Việc cần theo dõi",
      "## 7. Đề xuất hành động",
    ].join("\n"),
    productInstructions: [
      "SẢN PHẨM: Chuyển cuộc họp thành công việc (MTE_V1).",
      "Nếu ngữ cảnh KHÔNG có biên bản/ghi chú cuộc họp, KHÔNG được suy diễn nội dung họp: ghi rõ 'NGỮ CẢNH KHÔNG ĐỦ — thiếu biên bản' và dừng ở mức tóm tắt siêu dữ liệu.",
      "Mỗi quyết định và cam kết phải kèm trích dẫn nguồn; không có nguồn ⇒ không ghi.",
      "Mỗi đầu việc trình bày: tiêu đề · [ỨNG VIÊN phụ trách] · [ỨNG VIÊN hạn chót] · dự án/không gian làm việc · nguồn · mức tin cậy (CAO/TRUNG BÌNH/THẤP).",
      "Trường 'ỨNG VIÊN' là đề xuất chờ người xác nhận, không bao giờ là dữ kiện.",
      "Nếu ngữ cảnh đã có công việc trùng, ghi 'ĐÃ TỒN TẠI' và liên kết thay vì tạo đầu việc mới.",
      "Bạn chỉ được ĐỀ XUẤT hành động (CREATE_TASK, UPDATE_TASK_FIELDS, CREATE_MEETING, CREATE_EMAIL_DRAFT); mọi hành động đều chờ con người xác nhận.",
    ].join("\n"),
  },
  {
    code: "PRV_RECOVERY_PLAN",
    label: "Phục hồi dự án",
    deliverableType: "PLAN",
    outline: [
      "## 1. Tình hình hiện tại",
      "## 2. Bằng chứng",
      "## 3. Giả thuyết nguyên nhân gốc",
      "## 4. Vấn đề đã xác nhận",
      "## 5. Phụ thuộc",
      "## 6. Ưu tiên phục hồi",
      "## 7. Kế hoạch phục hồi",
      "## 8. Hành động đề xuất",
      "## 9. Rủi ro của kế hoạch",
      "## 10. Quyết định cần con người",
    ].join("\n"),
    productInstructions: [
      "SẢN PHẨM: Phục hồi dự án (PRV_V1) — sản phẩm rủi ro cao nhất, phải cực kỳ thận trọng.",
      "KHÔNG được kết luận dự án 'không khoẻ' chỉ vì nhận định của AI. Chỉ kết luận khi có tín hiệu xác định trong ngữ cảnh: công việc quá hạn, mốc bị chặn, hạn chót bị dời nhiều lần, phụ thuộc bị chặn, thiếu người phụ trách, việc ưu tiên cao không chuyển động, tần suất làm lại cao, quyết định chưa chốt chặn thực thi.",
      "Nếu không có tín hiệu nào, hãy nêu rõ: 'Không phát hiện tín hiệu trôi tiến độ trong phạm vi dữ liệu được phép' và KHÔNG đề xuất kế hoạch phục hồi.",
      "Gắn nhãn bắt buộc [SỰ KIỆN] / [SUY LUẬN] / [KHUYẾN NGHỊ] cho từng mục ở phần 3, 4, 6, 7, 8.",
      "Không bịa phụ thuộc. Mỗi phụ thuộc phải dẫn tới công việc/mốc có thật trong ngữ cảnh.",
      "Bạn chỉ được ĐỀ XUẤT CREATE_TASK và UPDATE_TASK_FIELDS; không có đường tự thực thi.",
    ].join("\n"),
  },
] as const;

export function templateByCode(code: string | null | undefined): DeliverableTemplate {
  return DELIVERABLE_TEMPLATES.find((t) => t.code === code) ?? DELIVERABLE_TEMPLATES[0]!;
}

/** SWP-1 — mã sản phẩm chủ lực ↔ mã mẫu bàn giao. */
export const SWP1_FLAGSHIP_TEMPLATE: Record<string, string> = {
  WPI_V1: "WPI_WEEKLY_INTELLIGENCE",
  MTE_V1: "MTE_EXECUTION_PACKAGE",
  PRV_V1: "PRV_RECOVERY_PLAN",
};



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
  /** WEE-1 — pipeline đang tạm dừng ở bước ACTION, cần bấm "Tiếp tục thực thi". */
  awaitingActionConfirmation?: boolean;
  /** WEE-1 — id các đề xuất đã sinh trong lượt chạy, dùng để tiếp tục pipeline. */
  proposedActionIds?: string[];
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
  /** WEE-3 — kết quả chất lượng do server tính (nguồn sự thật, không do model tự khai). */
  quality_status?: string | null;
  quality_score?: number | null;
  quality_passed?: boolean | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quality_assessment?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evidence_pack?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outcome?: Record<string, any> | null;
  accepted_with_warnings?: boolean | null;
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
