// AI ACTION LAYER V1 — contracts thuần (client-safe, không I/O, không SQL).
// Nguyên tắc bất biến: PROPOSE → PREVIEW → CONFIRM → EXECUTE.
// Model chỉ được ĐỀ XUẤT; mọi ghi dữ liệu đều cần người dùng xác nhận tường minh.
import { z } from "zod";

/* --------------------------- Allowlist V1 --------------------------- */

export const AI_ACTION_TYPES = [
  "CREATE_TASK",
  "UPDATE_TASK_FIELDS",
  "CREATE_MEETING",
  "CREATE_EMAIL_DRAFT",
] as const;
export type AiActionType = (typeof AI_ACTION_TYPES)[number];

/** Danh sách cấm tuyệt đối trong V1 — dùng cho test chính sách (§147). */
export const AI_PROHIBITED_ACTION_TYPES = [
  "SEND_EMAIL",
  "DELETE_TASK",
  "DELETE_DOCUMENT",
  "DELETE_MEETING",
  "DELETE_TENANT",
  "APPROVE_PAYMENT",
  "APPROVE_REQUEST",
  "REMOVE_MEMBER",
  "CHANGE_SECURITY",
  "CHANGE_ROLE",
  "ARCHIVE_TENANT",
  "BULK_UPDATE",
  "ADMIN_IMPERSONATE",
] as const;
export type AiProhibitedActionType = (typeof AI_PROHIBITED_ACTION_TYPES)[number];

export const AI_ACTION_RISKS = ["LOW", "MEDIUM", "HIGH", "PROHIBITED"] as const;
export type AiActionRisk = (typeof AI_ACTION_RISKS)[number];

export const AI_ACTION_STATES = [
  "PROPOSED",
  "PREVIEWED",
  "CONFIRMED",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type AiActionState = (typeof AI_ACTION_STATES)[number];

export const AI_ACTION_SOURCES = [
  "UNI_COPILOT",
  "MEETING_INTELLIGENCE",
  "EMAIL_INTELLIGENCE",
  "PROJECT_CONTEXT",
  "WORKFLOW_AGENT",
] as const;
export type AiActionSource = (typeof AI_ACTION_SOURCES)[number];

/** Hard invariant §3 — không bao giờ có agent tự trị trong V1. */
export const AI_AUTONOMOUS_EXECUTION = false as const;

/* ---------------------------- Payload schema ---------------------------- */

export const taskPriorityEnum = z.enum(["low", "normal", "high", "urgent"]);

export const CreateTaskActionSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10000).optional(),
  priority: taskPriorityEnum.default("normal"),
  dueAt: z.string().datetime().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});
export type CreateTaskActionPayload = z.infer<typeof CreateTaskActionSchema>;

export const UpdateTaskActionSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  priority: taskPriorityEnum.optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});
export type UpdateTaskActionPayload = z.infer<typeof UpdateTaskActionSchema>;

export const CreateMeetingActionSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  agenda: z.string().max(10000).optional(),
  participantIds: z.array(z.string().uuid()).max(50).default([]),
});
export type CreateMeetingActionPayload = z.infer<typeof CreateMeetingActionSchema>;

export const CreateEmailDraftActionSchema = z.object({
  to: z.array(z.string().email()).max(20).default([]),
  cc: z.array(z.string().email()).max(20).default([]),
  subject: z.string().max(500).default(""),
  body: z.string().max(100000).default(""),
});
export type CreateEmailDraftActionPayload = z.infer<typeof CreateEmailDraftActionSchema>;

export const ACTION_PAYLOAD_SCHEMAS = {
  CREATE_TASK: CreateTaskActionSchema,
  UPDATE_TASK_FIELDS: UpdateTaskActionSchema,
  CREATE_MEETING: CreateMeetingActionSchema,
  CREATE_EMAIL_DRAFT: CreateEmailDraftActionSchema,
} as const satisfies Record<AiActionType, z.ZodTypeAny>;

/* ----------------------------- Registry ----------------------------- */

export interface AiActionDefinition {
  type: AiActionType;
  label: string;
  risk: Exclude<AiActionRisk, "PROHIBITED">;
  /** Chính sách server, LLM KHÔNG thể ghi đè (§36/§37). */
  requiresUserConfirmation: true;
  /** Lệnh nghiệp vụ tin cậy được bọc lại — không có write path riêng cho AI. */
  domainCommand: string;
  schema: z.ZodTypeAny;
  targetType: "TASK" | null;
}

/** Static allowlist — không nạp tool động từ database (§122). */
export const AI_ACTION_TOOLS: Record<AiActionType, AiActionDefinition> = {
  CREATE_TASK: {
    type: "CREATE_TASK",
    label: "Tạo công việc",
    risk: "LOW",
    requiresUserConfirmation: true,
    domainCommand: "create_task",
    schema: CreateTaskActionSchema,
    targetType: null,
  },
  UPDATE_TASK_FIELDS: {
    type: "UPDATE_TASK_FIELDS",
    label: "Cập nhật công việc",
    risk: "MEDIUM",
    requiresUserConfirmation: true,
    domainCommand: "update_task",
    schema: UpdateTaskActionSchema,
    targetType: "TASK",
  },
  CREATE_MEETING: {
    type: "CREATE_MEETING",
    label: "Đặt lịch họp",
    risk: "MEDIUM",
    requiresUserConfirmation: true,
    domainCommand: "schedule_meeting",
    schema: CreateMeetingActionSchema,
    targetType: null,
  },
  CREATE_EMAIL_DRAFT: {
    type: "CREATE_EMAIL_DRAFT",
    label: "Soạn thư nháp",
    risk: "LOW",
    requiresUserConfirmation: true,
    domainCommand: "save_email_draft",
    schema: CreateEmailDraftActionSchema,
    targetType: null,
  },
};

export const isAllowedActionType = (t: string): t is AiActionType =>
  (AI_ACTION_TYPES as readonly string[]).includes(t);

export const isProhibitedActionType = (t: string): boolean =>
  (AI_PROHIBITED_ACTION_TYPES as readonly string[]).includes(t.toUpperCase());

/** Chuẩn hoá payload theo schema riêng của từng action (§41). Ném lỗi nếu sai. */
export function parseActionPayload(type: AiActionType, payload: unknown) {
  return ACTION_PAYLOAD_SCHEMAS[type].parse(payload);
}

/* --------------------------- Intent gate --------------------------- */

/** Động từ hành động tường minh (§95). Không có → chỉ tư vấn, không đề xuất ghi. */
const ACTION_VERB_HINTS: { type: AiActionType; re: RegExp }[] = [
  { type: "CREATE_EMAIL_DRAFT", re: /(soạn|soan)\s+(email|thư|thu|mail)|draft (an )?email|viết email|email follow[- ]?up/i },
  { type: "CREATE_MEETING", re: /(đặt lịch|dat lich|lên lịch|len lich|tạo (cuộc )?họp|tao hop|schedule (a )?meeting|book a meeting)/i },
  { type: "UPDATE_TASK_FIELDS", re: /(cập nhật|cap nhat|dời hạn|doi han|đổi hạn|gia hạn|đổi ưu tiên|đổi tiêu đề|update (the )?task|reschedule (the )?task)/i },
  { type: "CREATE_TASK", re: /(tạo|tao|thêm|them)\s+(task|công việc|cong viec|đầu việc)|create (a )?task|(giao|giao việc)\s+cho/i },
];

const SEND_INTENT = /(gửi|gui)\s+(email|thư|thu|mail)|send (the )?email/i;
const DELETE_INTENT = /(xoá|xóa|xoa|huỷ bỏ|delete|remove)\s+(task|công việc|tài liệu|document|user|thành viên)/i;

export type ActionIntent =
  | { kind: "NONE" }
  | { kind: "PROPOSE"; actionType: AiActionType }
  | { kind: "BLOCKED"; reason: "SEND_EMAIL" | "DELETE" };

/** Phân biệt "nên làm gì?" (tư vấn) với "tạo task cho việc này" (đề xuất ghi) — §94. */
export function detectActionIntent(query: string): ActionIntent {
  const q = query ?? "";
  if (SEND_INTENT.test(q)) return { kind: "BLOCKED", reason: "SEND_EMAIL" };
  if (DELETE_INTENT.test(q)) return { kind: "BLOCKED", reason: "DELETE" };
  for (const h of ACTION_VERB_HINTS) if (h.re.test(q)) return { kind: "PROPOSE", actionType: h.type };
  return { kind: "NONE" };
}

/* -------------------------- Wire contracts -------------------------- */

export interface ProposedAiActionSourceRef {
  sourceId: string;
  entityType: string;
  entityId: string;
  title: string;
  href: string;
}

export interface ProposedAiAction {
  actionId: string;
  actionType: AiActionType;
  risk: Exclude<AiActionRisk, "PROHIBITED">;
  source: AiActionSource;
  status: AiActionState;
  title: string;
  description: string | null;
  target: { entityType: string; entityId: string } | null;
  payload: Record<string, string | number | boolean | string[] | null | undefined>;
  /** Nhãn hiển thị đã giải nghĩa (người, dự án, hạn) để preview không lộ UUID. */
  preview: { label: string; value: string }[];
  ambiguities: { field: string; message: string; candidates: { id: string; label: string }[] }[];
  sourceRefs: ProposedAiActionSourceRef[];
  requiresConfirmation: true;
  expiresAt: string;
}

export interface AiActionExecutionResult {
  actionId: string;
  actionType: AiActionType;
  status: Extract<AiActionState, "SUCCEEDED" | "FAILED" | "EXPIRED" | "CANCELLED">;
  entityType?: string;
  entityId?: string;
  href?: string;
  message: string;
  errorCode?: string;
  /** Agent được gán tự động theo lĩnh vực công việc (nếu có). */
  assignedAgent?: {
    agentId: string;
    agentName: string;
    profileName: string | null;
    reason: string;
  } | null;
}

export const ACTION_ERROR_MESSAGE: Record<string, string> = {
  ACTION_STALE: "Dữ liệu đã thay đổi kể từ lúc UNI đề xuất. Vui lòng xem lại đề xuất mới.",
  ACTION_EXPIRED: "Đề xuất đã hết hạn. Hãy yêu cầu UNI đề xuất lại.",
  ACTION_NOT_FOUND: "Không tìm thấy đề xuất này.",
  ACTION_FORBIDDEN: "Bạn không có quyền thực hiện hành động này.",
  ACTION_AMBIGUOUS: "Còn thông tin chưa rõ, hãy chọn giá trị trước khi xác nhận.",
  ACTION_ALREADY_DONE: "Hành động này đã được thực hiện trước đó.",
  ACTION_TYPE_NOT_ALLOWED: "Hành động này không nằm trong danh sách được phép của UNI V1.",
};
