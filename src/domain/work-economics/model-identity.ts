// HARDEN-SELLWORK-1 — Chuẩn hoá định danh model (client-safe, không I/O).
//
// Bất biến: CHỈ MỘT nơi tách chuỗi model thành (provider, model). Không rải
// logic split("/") khắp các service — bảng giá được tra theo provider + model.

export interface AiModelIdentity {
  /** Nhà cung cấp đã chuẩn hoá, "unknown" khi không suy ra được. */
  provider: string;
  /** Tên model không kèm tiền tố nhà cung cấp. */
  model: string;
  /** Chuỗi gốc như runtime đã dùng — luôn được ghi vào telemetry. */
  raw: string;
}

const PREFIX_RULES: ReadonlyArray<[RegExp, string]> = [
  [/^gpt|^o1|^o3|^o4/i, "openai"],
  [/^gemini/i, "google"],
  [/^claude/i, "anthropic"],
  [/^grok/i, "xai"],
  [/^llama|^mistral/i, "meta"],
];

/** Tách "openai/gpt-5.6-sol" → { provider: "openai", model: "gpt-5.6-sol" }. */
export function parseModelIdentity(raw: string | null | undefined): AiModelIdentity {
  const value = (raw ?? "").trim();
  if (!value) return { provider: "unknown", model: "", raw: "" };
  const slash = value.indexOf("/");
  if (slash > 0) {
    return { provider: value.slice(0, slash).toLowerCase(), model: value.slice(slash + 1), raw: value };
  }
  const hit = PREFIX_RULES.find(([re]) => re.test(value));
  return { provider: hit ? hit[1] : "unknown", model: value, raw: value };
}

/** True khi định danh đủ tin cậy để tra bảng giá. */
export function isResolvableModelIdentity(id: AiModelIdentity): boolean {
  return id.provider !== "unknown" && id.model.length > 0;
}
