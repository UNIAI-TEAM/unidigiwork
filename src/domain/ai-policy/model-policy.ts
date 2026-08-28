/**
 * AI MODEL POLICY REGISTRY (Gate 12 — Investor Tech Hardening).
 *
 * Nguồn duy nhất khai báo model cho từng NHIỆM VỤ (capability), thay cho việc
 * rải chuỗi model literal khắp các module server. Client-safe: chỉ hằng số,
 * không I/O, không secret. Provider secret luôn nằm ở biến môi trường server.
 *
 * Bất biến:
 *  - Không đọc model string tuỳ ý từ database hay từ input người dùng.
 *  - Override chỉ được phép qua `resolveAiModel(capability, override)` với
 *    override nằm trong allowlist của chính capability đó.
 */

export const AI_CAPABILITIES = [
  "WORK_EXECUTION_PLANNING",
  "WORK_EXECUTION_GENERATION",
  "WORK_EXECUTION_EVALUATION",
  "COPILOT",
  "CONTEXT_EXTRACTION",
  "MEETING_INTELLIGENCE",
  "MEETING_TRANSCRIPTION",
] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

export interface AiModelPolicy {
  /** Nhà cung cấp logic — hiện tại luôn đi qua Lovable AI Gateway. */
  provider: "lovable-ai-gateway";
  /** Model id chính thức gửi tới gateway. */
  model: string;
  /** Danh sách model được phép override cho capability này. */
  allowed: readonly string[];
  /** Ghi chú vì sao chọn model này (dùng cho tài liệu due diligence). */
  rationale: string;
}

const FLAGSHIP = "openai/gpt-5.6-sol";
const FAST = "google/gemini-3-flash";
const TRANSCRIBE = "openai/gpt-4o-transcribe";

export const AI_MODEL_POLICY: Record<AiCapability, AiModelPolicy> = {
  WORK_EXECUTION_PLANNING: {
    provider: "lovable-ai-gateway",
    model: FLAGSHIP,
    allowed: [FLAGSHIP],
    rationale: "Lập kế hoạch cần suy luận nhiều bước và bám hợp đồng JSON nghiêm ngặt.",
  },
  WORK_EXECUTION_GENERATION: {
    provider: "lovable-ai-gateway",
    model: FLAGSHIP,
    allowed: [FLAGSHIP],
    rationale: "Bản bàn giao là đầu ra bán được, ưu tiên chất lượng hơn chi phí.",
  },
  WORK_EXECUTION_EVALUATION: {
    provider: "lovable-ai-gateway",
    model: FLAGSHIP,
    allowed: [FLAGSHIP],
    rationale: "Tự kiểm phải độc lập và ổn định để điểm chất lượng có thể đối chiếu.",
  },
  COPILOT: {
    provider: "lovable-ai-gateway",
    model: FLAGSHIP,
    allowed: [FLAGSHIP],
    rationale: "Trả lời có trích dẫn trên ngữ cảnh đã lọc quyền.",
  },
  CONTEXT_EXTRACTION: {
    provider: "lovable-ai-gateway",
    model: FAST,
    allowed: [FAST, FLAGSHIP],
    rationale: "Trích xuất/rút gọn khối lượng lớn, ưu tiên độ trễ và chi phí.",
  },
  MEETING_INTELLIGENCE: {
    provider: "lovable-ai-gateway",
    model: FLAGSHIP,
    allowed: [FLAGSHIP, FAST],
    rationale: "Map-reduce tóm tắt biên bản họp dài.",
  },
  MEETING_TRANSCRIPTION: {
    provider: "lovable-ai-gateway",
    model: TRANSCRIBE,
    allowed: [TRANSCRIBE],
    rationale: "Speech-to-text chuyên dụng.",
  },
};

/**
 * Trả về model cho một capability. Override chỉ được chấp nhận khi nằm trong
 * allowlist — mọi giá trị khác bị bỏ qua (fail closed về mặc định), không throw
 * để một cấu hình sai không làm gãy lượt chạy nghiệp vụ.
 */
export function resolveAiModel(capability: AiCapability, override?: string | null): AiModelPolicy {
  const policy = AI_MODEL_POLICY[capability];
  if (override && policy.allowed.includes(override)) {
    return { ...policy, model: override };
  }
  return policy;
}
