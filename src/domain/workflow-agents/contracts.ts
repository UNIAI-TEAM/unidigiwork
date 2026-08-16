// WORKFLOW & AGENT BUILDER V1 — contracts thuần (client-safe, không I/O).
// Bất biến: ĐIỀU KIỆN → AI ĐỀ XUẤT → NGƯỜI DUYỆT. Không bao giờ tự động thực thi.
import { z } from "zod";
import { AI_ACTION_TYPES, AI_ACTION_SOURCES, type AiActionType, type AiActionSource } from "@/domain/ai-actions/contracts";

/** Hard invariant: agent không có quyền ghi dữ liệu, chỉ sinh đề xuất chờ duyệt. */
export const AGENT_AUTONOMOUS_EXECUTION = false as const;

export const AGENT_TRIGGERS = [
  "TASK_OVERDUE",
  "TASK_UNASSIGNED",
  "TASK_HIGH_PRIORITY",
  "MEETING_ENDED",
  "MANUAL",
] as const;
export type AgentTrigger = (typeof AGENT_TRIGGERS)[number];

export const AGENT_TRIGGER_LABELS: Record<AgentTrigger, string> = {
  TASK_OVERDUE: "Công việc quá hạn",
  TASK_UNASSIGNED: "Công việc chưa có người phụ trách",
  TASK_HIGH_PRIORITY: "Công việc ưu tiên cao",
  MEETING_ENDED: "Cuộc họp vừa kết thúc",
  MANUAL: "Chạy thủ công",
};

export const AGENT_TRIGGER_ENTITY: Record<AgentTrigger, "TASK" | "MEETING"> = {
  TASK_OVERDUE: "TASK",
  TASK_UNASSIGNED: "TASK",
  TASK_HIGH_PRIORITY: "TASK",
  MEETING_ENDED: "MEETING",
  MANUAL: "TASK",
};

export const CONDITION_OPERATORS = ["eq", "neq", "contains", "gt", "lt", "is_empty", "is_not_empty"] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: "bằng",
  neq: "khác",
  contains: "chứa",
  gt: "lớn hơn",
  lt: "nhỏ hơn",
  is_empty: "trống",
  is_not_empty: "không trống",
};

export interface ConditionFieldDef {
  field: string;
  label: string;
  kind: "text" | "number" | "enum";
  options?: { value: string; label: string }[];
}

export const TASK_CONDITION_FIELDS: ConditionFieldDef[] = [
  {
    field: "status",
    label: "Trạng thái",
    kind: "enum",
    options: [
      { value: "todo", label: "Cần làm" },
      { value: "in_progress", label: "Đang làm" },
      { value: "blocked", label: "Bị chặn" },
      { value: "done", label: "Hoàn thành" },
      { value: "canceled", label: "Đã huỷ" },
    ],
  },
  {
    field: "priority",
    label: "Ưu tiên",
    kind: "enum",
    options: [
      { value: "low", label: "Thấp" },
      { value: "normal", label: "Bình thường" },
      { value: "high", label: "Cao" },
      { value: "urgent", label: "Khẩn cấp" },
    ],
  },
  { field: "title", label: "Tiêu đề", kind: "text" },
  { field: "overdueDays", label: "Số ngày quá hạn", kind: "number" },
  { field: "dueInDays", label: "Còn lại (ngày) đến hạn", kind: "number" },
  { field: "assigneeCount", label: "Số người phụ trách", kind: "number" },
];

export const MEETING_CONDITION_FIELDS: ConditionFieldDef[] = [
  { field: "title", label: "Tiêu đề", kind: "text" },
  { field: "endedHoursAgo", label: "Kết thúc cách đây (giờ)", kind: "number" },
  { field: "participantCount", label: "Số người tham dự", kind: "number" },
];

export const conditionFieldsFor = (trigger: AgentTrigger): ConditionFieldDef[] =>
  AGENT_TRIGGER_ENTITY[trigger] === "MEETING" ? MEETING_CONDITION_FIELDS : TASK_CONDITION_FIELDS;

export const AgentConditionSchema = z.object({
  field: z.string().min(1).max(60),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.string().max(200).default(""),
});
export type AgentCondition = z.infer<typeof AgentConditionSchema>;

export const AgentInputBaseSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  triggerType: z.enum(AGENT_TRIGGERS),
  conditions: z.array(AgentConditionSchema).max(10).default([]),
  actionType: z.enum(AI_ACTION_TYPES),
  allowedActionTypes: z.array(z.enum(AI_ACTION_TYPES)).min(1).default([...AI_ACTION_TYPES]),
  allowedSources: z.array(z.enum(AI_ACTION_SOURCES)).min(1).default(["WORKFLOW_AGENT"]),
  instruction: z.string().max(2000).default(""),
  enabled: z.boolean().default(true),
});
export const AgentInputSchema = AgentInputBaseSchema;
export type AgentInput = z.infer<typeof AgentInputSchema>;

export const AI_ACTION_SOURCE_LABELS: Record<AiActionSource, string> = {
  UNI_COPILOT: "UNI Copilot",
  MEETING_INTELLIGENCE: "Trí tuệ cuộc họp",
  EMAIL_INTELLIGENCE: "Trí tuệ email",
  PROJECT_CONTEXT: "Ngữ cảnh dự án",
  WORKFLOW_AGENT: "Agent quy trình",
};

/** Allowlist mặc định khi bản ghi cũ chưa có cấu hình. */
export const normalizeAllowedActionTypes = (v: unknown): AiActionType[] => {
  const list = Array.isArray(v) ? v.filter((x): x is AiActionType => (AI_ACTION_TYPES as readonly string[]).includes(String(x))) : [];
  return list.length ? list : [...AI_ACTION_TYPES];
};

export const normalizeAllowedSources = (v: unknown): AiActionSource[] => {
  const list = Array.isArray(v) ? v.filter((x): x is AiActionSource => (AI_ACTION_SOURCES as readonly string[]).includes(String(x))) : [];
  return list.length ? list : ["WORKFLOW_AGENT"];
};

/** Kiểm tra 1 đề xuất có được phép sinh ra từ agent này không. */
export function isAgentActionAllowed(
  agent: { allowed_action_types?: unknown; allowed_sources?: unknown },
  actionType: AiActionType,
  source: AiActionSource,
): boolean {
  return (
    normalizeAllowedActionTypes(agent.allowed_action_types).includes(actionType) &&
    normalizeAllowedSources(agent.allowed_sources).includes(source)
  );
}

export interface AgentCandidate {
  id: string;
  title: string;
  /** Các thuộc tính dùng cho điều kiện — chuẩn hoá sẵn ở server. */
  facts: Record<string, string | number | null>;
  summary: string;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Đánh giá 1 điều kiện đơn lẻ. So sánh số nếu cả hai vế là số, ngược lại so text. */
export function evaluateCondition(facts: Record<string, unknown>, c: AgentCondition): boolean {
  const raw = facts[c.field];
  const empty = raw === null || raw === undefined || raw === "" || raw === 0 && c.field.endsWith("Count");
  if (c.operator === "is_empty") return empty;
  if (c.operator === "is_not_empty") return !empty;

  const left = num(raw);
  const right = num(c.value);
  if (left !== null && right !== null) {
    switch (c.operator) {
      case "eq": return left === right;
      case "neq": return left !== right;
      case "gt": return left > right;
      case "lt": return left < right;
      case "contains": return String(raw).includes(c.value);
    }
  }
  const l = String(raw ?? "").toLowerCase();
  const r = String(c.value ?? "").toLowerCase();
  switch (c.operator) {
    case "eq": return l === r;
    case "neq": return l !== r;
    case "contains": return r.length > 0 && l.includes(r);
    case "gt": return l > r;
    case "lt": return l < r;
    default: return false;
  }
}

/** AND toàn bộ điều kiện. Không có điều kiện → khớp mọi ứng viên của trigger. */
export function evaluateConditions(facts: Record<string, unknown>, conditions: AgentCondition[]): boolean {
  return conditions.every((c) => evaluateCondition(facts, c));
}

export const describeCondition = (c: AgentCondition, fields: ConditionFieldDef[]): string => {
  const def = fields.find((f) => f.field === c.field);
  const label = def?.label ?? c.field;
  const value = def?.options?.find((o) => o.value === c.value)?.label ?? c.value;
  if (c.operator === "is_empty" || c.operator === "is_not_empty") return `${label} ${OPERATOR_LABELS[c.operator]}`;
  return `${label} ${OPERATOR_LABELS[c.operator]} ${value}`;
};

/** Ký tự điều khiển hội thoại trong dữ liệu người dùng → vô hiệu hoá trước khi ghép prompt. */
const sanitize = (s: string) =>
  s
    .replace(/(^|\n)\s*(system|assistant|user)\s*:/gi, "$1·")
    .replace(/ignore (all )?previous instructions/gi, "[đã loại bỏ]")
    .replace(/[`<>]/g, " ")
    .slice(0, 600);

/** Ghép câu yêu cầu gửi cho lớp AI Action. Agent chỉ được ĐỀ XUẤT. */
export function buildAgentQuery(
  agent: { instruction: string; actionType: AiActionType; triggerType: AgentTrigger },
  candidate: AgentCandidate,
): string {
  const verb: Record<AiActionType, string> = {
    CREATE_TASK: "Tạo công việc",
    UPDATE_TASK_FIELDS: "Cập nhật công việc",
    CREATE_MEETING: "Đặt lịch họp",
    CREATE_EMAIL_DRAFT: "Soạn thư nháp",
  };
  const instruction = sanitize(agent.instruction || "");
  const ctx = sanitize(candidate.summary || candidate.title);
  return `${verb[agent.actionType]}: ${instruction || AGENT_TRIGGER_LABELS[agent.triggerType]} — ngữ cảnh: ${ctx}`.slice(0, 480);
}