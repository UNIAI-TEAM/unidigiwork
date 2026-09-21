// ORCHESTRATION LAYER — người dùng giao mục tiêu, hệ thống tự chọn Human/Agent.
// Thuần logic, không I/O: dùng được cả client lẫn server và test được.
// Nguyên tắc bất biến: AI không tự ghi dữ liệu; mọi hành động vẫn đi qua
// PROPOSE → PREVIEW → CONFIRM → EXECUTE của AI Action Layer.
import { detectActionIntent, type AiActionType } from "@/domain/ai-actions/contracts";
import { inferWorkerProfileForTask } from "@/domain/ai-workforce/routing";

/** Ai sẽ thực hiện: nhân sự AI theo lĩnh vực, hoặc con người khi không đủ căn cứ. */
export interface OrchestrationExecutor {
  kind: "AI" | "HUMAN";
  /** Tên hồ sơ nhân sự AI khi kind = "AI". */
  profileId?: string;
  profileName?: string;
  /** Từ khoá lĩnh vực đã khớp — dùng để giải thích lựa chọn cho người dùng. */
  matched: string[];
}

export type OrchestrationRoute =
  | { mode: "BLOCKED"; reason: "SEND_EMAIL" | "DELETE" }
  | { mode: "ACTION"; actionType: AiActionType; executor: OrchestrationExecutor }
  | { mode: "ANSWER" };

/**
 * Định tuyến một yêu cầu tự nhiên của người dùng:
 * - Câu hỏi/hiện trạng → ANSWER (Context Engine trả lời).
 * - Lệnh tạo/cập nhật hợp lệ → ACTION kèm người/agent thực hiện do hệ thống tự chọn.
 * - Ý định bị cấm (gửi email, xoá) → BLOCKED.
 */
export function routeRequest(text: string): OrchestrationRoute {
  const intent = detectActionIntent(text);
  if (intent.kind === "BLOCKED") return { mode: "BLOCKED", reason: intent.reason };
  if (intent.kind !== "PROPOSE") return { mode: "ANSWER" };
  return {
    mode: "ACTION",
    actionType: intent.actionType,
    executor: pickExecutor(text),
  };
}

/** Chọn nhân sự thực hiện theo lĩnh vực công việc; không khớp lĩnh vực → con người. */
export function pickExecutor(text: string): OrchestrationExecutor {
  const match = inferWorkerProfileForTask({ title: text });
  if (!match) return { kind: "HUMAN", matched: [] };
  return {
    kind: "AI",
    profileId: match.profileId,
    profileName: match.profileName,
    matched: match.matched,
  };
}

/** Trạng thái lượt thực thi AI cần người quan sát hoặc can thiệp. */
const OBSERVABLE = new Set(["QUEUED", "RUNNING", "WAITING_REVIEW", "CHANGES_REQUESTED", "FAILED"]);

/**
 * Execution chỉ được hiển thị khi có giá trị quan sát: đang chạy, chờ duyệt,
 * bị yêu cầu chỉnh sửa hoặc lỗi. Đã nghiệm thu/chưa bắt đầu thì ẩn.
 */
export function shouldObserveExecution(status: string | null | undefined): boolean {
  return Boolean(status && OBSERVABLE.has(status));
}

const PIPELINE_LENGTH = 6;

/** Tiến độ thô theo số bước đã hoàn tất của pipeline thực thi (0–100). */
export function executionProgress(
  steps: readonly { status: string }[],
  executionStatus?: string | null,
): number {
  if (executionStatus === "ACCEPTED") return 100;
  if (!steps.length) return 0;
  const done = steps.filter((s) => s.status === "SUCCEEDED" || s.status === "SKIPPED").length;
  return Math.min(99, Math.round((done / Math.max(PIPELINE_LENGTH, steps.length)) * 100));
}
