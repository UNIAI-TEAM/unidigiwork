// Hồ sơ nhân sự AI — NGUỒN THẬT cấu hình cho agent đề xuất (không chỉ là bảng hiển thị).
// Mỗi hồ sơ khai báo: kỹ năng AI · trigger mặc định · hành động mặc định · persona đưa vào prompt.
// Allowlist hành động/nguồn của agent được suy ra từ kỹ năng của hồ sơ.
import type { AiActionType } from "@/domain/ai-actions/contracts";
import { deriveAllowedFromSkills, ensureDefaultSkill, normalizeSkills } from "@/domain/workflow-agents/skills";
import type { AgentTrigger } from "@/domain/workflow-agents/contracts";

export interface AiWorkerProfile {
  id: string;
  name: string;
  domain: string;
  mission: string;
  skills: readonly string[];
  responsibilities: readonly string[];
  availability: string;
  /** Persona ngắn gọn ghép vào câu yêu cầu gửi cho lớp AI Action. */
  persona: string;
  defaultTrigger: AgentTrigger;
  defaultActionType: AiActionType;
}

export const AI_WORKER_PROFILES: readonly AiWorkerProfile[] = [
  {
    id: "project",
    name: "AI Project Assistant",
    domain: "Quản lý dự án",
    mission: "Theo dõi tiến độ, phát hiện rủi ro trễ hạn và đề xuất việc cần làm sau mỗi cuộc họp.",
    skills: ["SUMMARIZE_WORK", "RISK_ANALYSIS", "PROPOSE_TASK", "PROPOSE_TASK_UPDATE"],
    responsibilities: ["Tóm tắt tình hình dự án hằng ngày", "Cảnh báo hạng mục nguy cơ trễ", "Đề xuất task theo dõi sau họp"],
    availability: "24/7 · theo không gian làm việc đã cấp quyền",
    persona: "Bạn là trợ lý quản trị dự án: ưu tiên tiến độ, rủi ro trễ hạn và trách nhiệm rõ ràng.",
    defaultTrigger: "TASK_OVERDUE",
    defaultActionType: "UPDATE_TASK_FIELDS",
  },
  {
    id: "research",
    name: "AI Research Analyst",
    domain: "Nghiên cứu & Phân tích",
    mission: "Tổng hợp tài liệu, biên bản họp và tri thức nội bộ thành kết luận có trích dẫn nguồn.",
    skills: ["SUMMARIZE_WORK", "MEETING_RECALL", "RISK_ANALYSIS", "PROPOSE_TASK"],
    responsibilities: ["Tra cứu tri thức nội bộ", "Tổng hợp bối cảnh trước quyết định", "Trả lời kèm nguồn"],
    availability: "24/7 · chỉ đọc",
    persona: "Bạn là chuyên viên phân tích: chỉ kết luận dựa trên nguồn đã trích dẫn, không suy đoán.",
    defaultTrigger: "MEETING_ENDED",
    defaultActionType: "CREATE_TASK",
  },
  {
    id: "sales",
    name: "AI Sales Assistant",
    domain: "Kinh doanh & CRM",
    mission: "Soạn thư theo dõi khách hàng và nhắc các cơ hội đang chững lại.",
    skills: ["SUMMARIZE_WORK", "DRAFT_EMAIL", "PROPOSE_TASK"],
    responsibilities: ["Soạn thư nháp cho khách hàng", "Nhắc cơ hội chưa phản hồi", "Đề xuất việc chăm sóc"],
    availability: "Giờ làm việc · cần duyệt trước khi gửi",
    persona: "Bạn là trợ lý kinh doanh: văn phong lịch sự, ngắn gọn, luôn có bước tiếp theo rõ ràng.",
    defaultTrigger: "TASK_HIGH_PRIORITY",
    defaultActionType: "CREATE_EMAIL_DRAFT",
  },
  {
    id: "data",
    name: "AI Data Analyst",
    domain: "Dữ liệu & BI",
    mission: "Phân tích khối lượng công việc và xếp ưu tiên dựa trên dữ liệu vận hành.",
    skills: ["RISK_ANALYSIS", "WORKLOAD_TRIAGE"],
    responsibilities: ["Chấm điểm rủi ro", "Xếp ưu tiên hàng đợi", "Gợi ý phân bổ nguồn lực"],
    availability: "24/7 · chỉ đọc & đề xuất",
    persona: "Bạn là chuyên viên dữ liệu: nêu con số cụ thể và lý do xếp ưu tiên.",
    defaultTrigger: "TASK_UNASSIGNED",
    defaultActionType: "UPDATE_TASK_FIELDS",
  },
  {
    id: "hr",
    name: "AI HR Assistant",
    domain: "Nhân sự",
    mission: "Hỗ trợ quy trình nội bộ, nhắc việc onboarding và soạn thông báo.",
    skills: ["SUMMARIZE_WORK", "DRAFT_EMAIL", "PROPOSE_TASK"],
    responsibilities: ["Nhắc mốc onboarding", "Soạn thông báo nội bộ", "Tổng hợp phản hồi nhân sự"],
    availability: "Giờ làm việc",
    persona: "Bạn là trợ lý nhân sự: giọng văn thân thiện, tuân thủ quy trình nội bộ.",
    defaultTrigger: "TASK_OVERDUE",
    defaultActionType: "CREATE_TASK",
  },
  {
    id: "support",
    name: "AI Customer Support",
    domain: "Hỗ trợ khách hàng",
    mission: "Phân loại yêu cầu, soạn phản hồi nháp và chuyển tiếp đúng người phụ trách.",
    skills: ["WORKLOAD_TRIAGE", "DRAFT_EMAIL", "PROPOSE_TASK_UPDATE"],
    responsibilities: ["Phân loại yêu cầu đến", "Soạn phản hồi nháp", "Đề xuất đổi người phụ trách"],
    availability: "24/7 · cần duyệt trước khi gửi",
    persona: "Bạn là nhân viên hỗ trợ: phản hồi nhanh, rõ ràng, nêu thời hạn xử lý.",
    defaultTrigger: "TASK_UNASSIGNED",
    defaultActionType: "UPDATE_TASK_FIELDS",
  },
  {
    id: "legal",
    name: "AI Legal Assistant",
    domain: "Pháp lý & Tuân thủ",
    mission: "Rà soát tài liệu, ghi nhận cam kết và nhắc mốc tuân thủ.",
    skills: ["SUMMARIZE_WORK", "MEETING_RECALL", "PROPOSE_MEETING"],
    responsibilities: ["Rà soát điều khoản trong tài liệu", "Ghi nhận cam kết từ cuộc họp", "Đề xuất họp rà soát"],
    availability: "Giờ làm việc · chỉ đọc & đề xuất",
    persona: "Bạn là trợ lý pháp lý: thận trọng, nêu rõ rủi ro và điều khoản liên quan.",
    defaultTrigger: "MEETING_ENDED",
    defaultActionType: "CREATE_MEETING",
  },
  {
    id: "content",
    name: "AI Content Specialist",
    domain: "Nội dung & Marketing",
    mission: "Chuyển kết luận công việc thành nội dung truyền thông và bản tin nội bộ.",
    skills: ["DRAFT_FOLLOW_UP", "DRAFT_EMAIL", "SUMMARIZE_WORK"],
    responsibilities: ["Soạn bản tin sau họp", "Viết nội dung nháp theo ngữ cảnh", "Chuẩn hoá thông điệp"],
    availability: "Giờ làm việc · nội dung nháp",
    persona: "Bạn là chuyên viên nội dung: viết mạch lạc, đúng thông điệp, luôn ở dạng nháp.",
    defaultTrigger: "MEETING_ENDED",
    defaultActionType: "CREATE_EMAIL_DRAFT",
  },
] as const;

export const AI_WORKER_PROFILE_MAP: Record<string, AiWorkerProfile> = Object.fromEntries(
  AI_WORKER_PROFILES.map((p) => [p.id, p]),
);

export const isWorkerProfileId = (v: unknown): v is string =>
  typeof v === "string" && !!AI_WORKER_PROFILE_MAP[v];

/** Kỹ năng của hồ sơ, đã chuẩn hoá theo danh mục kỹ năng. */
export const skillsForWorkerProfile = (profileId: string | null | undefined): string[] =>
  normalizeSkills(AI_WORKER_PROFILE_MAP[profileId ?? ""]?.skills ?? []);

/** Hành động hồ sơ được phép đề xuất (suy ra từ kỹ năng). */
export const actionTypesForWorkerProfile = (profileId: string | null | undefined): AiActionType[] =>
  deriveAllowedFromSkills(skillsForWorkerProfile(profileId)).actionTypes;

/** Cấu hình agent mặc định sinh từ hồ sơ — dùng khi tạo agent từ hồ sơ nhân sự AI. */
export function agentDefaultsFromWorkerProfile(profileId: string) {
  const profile = AI_WORKER_PROFILE_MAP[profileId];
  if (!profile) return null;
  const skills = ensureDefaultSkill(skillsForWorkerProfile(profileId));
  const allowed = deriveAllowedFromSkills(skills);
  const actionType = allowed.actionTypes.includes(profile.defaultActionType)
    ? profile.defaultActionType
    : allowed.actionTypes[0] ?? "CREATE_TASK";
  return {
    profile,
    name: profile.name,
    description: profile.mission,
    triggerType: profile.defaultTrigger,
    actionType,
    skills,
    allowedActionTypes: allowed.actionTypes.length ? allowed.actionTypes : [actionType],
    allowedSources: allowed.sources.length ? allowed.sources : (["WORKFLOW_AGENT"] as const).slice(),
    instruction: profile.mission,
  };
}
