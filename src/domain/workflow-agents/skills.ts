// Kỹ năng AI (AI Skill) — đơn vị năng lực có thể bật/tắt cho từng agent.
// Mỗi kỹ năng khai báo: loại · nguồn dữ liệu được đọc · loại AI Action được phép ĐỀ XUẤT.
// Allowlist của agent được SUY RA từ tập kỹ năng đã chọn (không cấu hình allowlist thủ công nữa).
import { AI_ACTION_TYPES, AI_ACTION_SOURCES, type AiActionType, type AiActionSource } from "@/domain/ai-actions/contracts";

export const AI_SKILL_KINDS = ["RETRIEVAL", "ANALYSIS", "GENERATION", "ACTION"] as const;
export type AiSkillKind = (typeof AI_SKILL_KINDS)[number];

export const AI_SKILL_KIND_LABELS: Record<AiSkillKind, string> = {
  RETRIEVAL: "Tra cứu",
  ANALYSIS: "Phân tích",
  GENERATION: "Soạn thảo",
  ACTION: "Đề xuất hành động",
};

export const AI_SKILL_KIND_HINTS: Record<AiSkillKind, string> = {
  RETRIEVAL: "Chỉ đọc dữ liệu và trả lời kèm trích dẫn nguồn.",
  ANALYSIS: "Đọc nhiều nguồn, suy luận và chấm điểm — không thay đổi dữ liệu.",
  GENERATION: "Tạo nội dung nháp, chưa gửi đi.",
  ACTION: "Đề xuất thay đổi dữ liệu, luôn cần người xác nhận trước khi thực thi.",
};

export interface AiSkillDef {
  id: string;
  name: string;
  kind: AiSkillKind;
  description: string;
  example: string;
  /** Loại AI Action mà kỹ năng cho phép agent đề xuất. Rỗng = chỉ đọc. */
  actionTypes: readonly AiActionType[];
  /** Nguồn ngữ cảnh kỹ năng được phép sử dụng. */
  sources: readonly AiActionSource[];
}

export const AI_SKILLS: readonly AiSkillDef[] = [
  {
    id: "SUMMARIZE_WORK",
    name: "Tóm tắt ngữ cảnh công việc",
    kind: "RETRIEVAL",
    description: "Đọc task, tài liệu và cuộc họp liên quan để tóm tắt tình hình.",
    example: 'Tóm tắt tình trạng công việc "Triển khai UAT" trong 7 ngày qua.',
    actionTypes: [],
    sources: ["PROJECT_CONTEXT", "WORKFLOW_AGENT"],
  },
  {
    id: "MEETING_RECALL",
    name: "Tra cứu nội dung cuộc họp",
    kind: "RETRIEVAL",
    description: "Trả lời dựa trên biên bản, quyết định và action item đã grounding.",
    example: "Cuộc họp hôm qua đã chốt quyết định nào về ngân sách?",
    actionTypes: [],
    sources: ["MEETING_INTELLIGENCE", "WORKFLOW_AGENT"],
  },
  {
    id: "RISK_ANALYSIS",
    name: "Phân tích rủi ro tiến độ",
    kind: "ANALYSIS",
    description: "Đánh giá nguy cơ trễ hạn dựa trên trạng thái, deadline và người phụ trách.",
    example: "Chỉ ra 5 công việc có nguy cơ trễ hạn cao nhất tuần này.",
    actionTypes: [],
    sources: ["PROJECT_CONTEXT", "WORKFLOW_AGENT"],
  },
  {
    id: "WORKLOAD_TRIAGE",
    name: "Phân loại & xếp ưu tiên",
    kind: "ANALYSIS",
    description: "Nhóm và xếp hạng công việc theo mức độ khẩn cấp, đề xuất người phụ trách.",
    example: "Xếp thứ tự xử lý cho các task chưa có người nhận.",
    actionTypes: ["UPDATE_TASK_FIELDS"],
    sources: ["PROJECT_CONTEXT", "WORKFLOW_AGENT"],
  },
  {
    id: "DRAFT_EMAIL",
    name: "Soạn thư nháp",
    kind: "GENERATION",
    description: "Viết thư trả lời hoặc thư nhắc dựa trên ngữ cảnh, để bạn duyệt trước khi gửi.",
    example: "Soạn thư nhắc khách hàng phản hồi báo giá.",
    actionTypes: ["CREATE_EMAIL_DRAFT"],
    sources: ["EMAIL_INTELLIGENCE", "WORKFLOW_AGENT"],
  },
  {
    id: "DRAFT_FOLLOW_UP",
    name: "Soạn nội dung theo dõi sau họp",
    kind: "GENERATION",
    description: "Chuyển kết luận cuộc họp thành nội dung theo dõi có trích dẫn nguồn.",
    example: "Soạn tóm tắt và việc cần làm sau cuộc họp sprint review.",
    actionTypes: ["CREATE_EMAIL_DRAFT"],
    sources: ["MEETING_INTELLIGENCE", "WORKFLOW_AGENT"],
  },
  {
    id: "PROPOSE_TASK",
    name: "Đề xuất tạo công việc",
    kind: "ACTION",
    description: "Sinh đề xuất tạo task mới kèm tiêu đề, người phụ trách và hạn.",
    example: "Tạo task theo dõi cho mỗi action item chưa có chủ.",
    actionTypes: ["CREATE_TASK"],
    sources: ["PROJECT_CONTEXT", "MEETING_INTELLIGENCE", "WORKFLOW_AGENT"],
  },
  {
    id: "PROPOSE_TASK_UPDATE",
    name: "Đề xuất cập nhật công việc",
    kind: "ACTION",
    description: "Đề xuất đổi trạng thái, ưu tiên, hạn hoặc người phụ trách của task.",
    example: "Đề xuất dời hạn các task quá hạn quá 7 ngày.",
    actionTypes: ["UPDATE_TASK_FIELDS"],
    sources: ["PROJECT_CONTEXT", "WORKFLOW_AGENT"],
  },
  {
    id: "PROPOSE_MEETING",
    name: "Đề xuất đặt lịch họp",
    kind: "ACTION",
    description: "Sinh đề xuất cuộc họp follow-up với thành phần và thời lượng gợi ý.",
    example: "Đặt lịch họp rà soát cho các hạng mục bị chặn.",
    actionTypes: ["CREATE_MEETING"],
    sources: ["MEETING_INTELLIGENCE", "PROJECT_CONTEXT", "WORKFLOW_AGENT"],
  },
] as const;

export const AI_SKILL_MAP: Record<string, AiSkillDef> = Object.fromEntries(AI_SKILLS.map((s) => [s.id, s]));

export const skillsByKind = (kind: AiSkillKind): AiSkillDef[] => AI_SKILLS.filter((s) => s.kind === kind);

/** Chỉ giữ id kỹ năng hợp lệ, theo thứ tự catalogue. */
export const normalizeSkills = (v: unknown): string[] => {
  const set = new Set(Array.isArray(v) ? v.map((x) => String(x)) : []);
  return AI_SKILLS.filter((s) => set.has(s.id)).map((s) => s.id);
};

/** Allowlist suy ra từ kỹ năng. Không có kỹ năng nào → không cho phép hành động nào. */
export function deriveAllowedFromSkills(skillIds: readonly string[]): {
  actionTypes: AiActionType[];
  sources: AiActionSource[];
} {
  const defs = normalizeSkills(skillIds).map((id) => AI_SKILL_MAP[id]!);
  const types = new Set<AiActionType>();
  const sources = new Set<AiActionSource>();
  for (const d of defs) {
    d.actionTypes.forEach((t) => types.add(t));
    d.sources.forEach((s) => sources.add(s));
  }
  return {
    actionTypes: AI_ACTION_TYPES.filter((t) => types.has(t)),
    sources: AI_ACTION_SOURCES.filter((s) => sources.has(s)),
  };
}

/** Kỹ năng nào cấp quyền cho một loại action — dùng để giải thích trong UI/lỗi. */
export const skillsGranting = (actionType: AiActionType): AiSkillDef[] =>
  AI_SKILLS.filter((s) => s.actionTypes.includes(actionType));
