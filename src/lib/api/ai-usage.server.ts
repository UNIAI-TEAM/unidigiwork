// HARDEN-SELLWORK-1 — Ghi telemetry sử dụng AI theo TỪNG LƯỢT GỌI MODEL (server-only).
//
// Bất biến:
//  - Tái dùng bảng canonical `ai_usage_events`, KHÔNG dựng hệ telemetry song song.
//  - Chỉ ghi tín hiệu vật lý (provider, model, token, thời điểm). Chi phí luôn được
//    DẪN XUẤT trong database từ usage + bảng giá theo phiên bản — không nhận chi phí
//    do client hay model cung cấp.
//  - Lỗi ghi telemetry không được làm hỏng công việc; nhưng phải để lại dấu vết log.
import { parseModelIdentity } from "@/domain/work-economics/model-identity";

export type AiUsagePurpose = "GENERATOR" | "EVALUATOR" | "PLANNER" | "OTHER";

export interface AiUsageEventInput {
  executionId: string;
  purpose: AiUsagePurpose;
  /** Chuỗi model đúng như runtime đã dùng. */
  model: string;
  inputTokens: number | null | undefined;
  outputTokens: number | null | undefined;
  durationMs?: number | null;
  /** EXACT khi provider trả số token; ESTIMATED khi phải suy từ độ dài. */
  precision?: "EXACT" | "ESTIMATED";
}

type Supa = { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: unknown }> };

/** Ghi một lượt gọi model. Trả về id sự kiện, hoặc null nếu không ghi được. */
export async function recordAiUsageEvent(supabase: unknown, i: AiUsageEventInput): Promise<string | null> {
  const identity = parseModelIdentity(i.model);
  if (!identity.raw) return null;
  try {
    const res = await (supabase as Supa).rpc("record_ai_usage_event", {
      _execution_id: i.executionId,
      _purpose: i.purpose,
      _model: identity.raw,
      _provider: identity.provider,
      _input_tokens: Math.max(0, Math.trunc(i.inputTokens ?? 0)),
      _output_tokens: Math.max(0, Math.trunc(i.outputTokens ?? 0)),
      _duration_ms: i.durationMs ?? null,
      _token_precision: i.precision ?? "EXACT",
    });
    if (res.error) {
      console.error("[ai-usage] ghi telemetry thất bại", { executionId: i.executionId, purpose: i.purpose });
      return null;
    }
    return typeof res.data === "string" ? res.data : null;
  } catch {
    console.error("[ai-usage] ngoại lệ khi ghi telemetry", { executionId: i.executionId, purpose: i.purpose });
    return null;
  }
}
