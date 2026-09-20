// Hồ sơ nhận diện tài liệu Word theo từng tổ chức.
// Cùng một tệp có thể được đọc hiểu và đề xuất khác nhau tùy tổ chức.

export type DocxRecognitionWeights = {
  title: number;
  heading: number;
  listItem: number;
  quote: number;
  caption: number;
  table: number;
};

// Trọng số hiệu chỉnh trên fixture Word thuần Việt có nhãn chuẩn
// (scripts/docx-weight-calibration.ts): 68.2% → 100.0% độ chính xác nhận diện.
export const DEFAULT_DOCX_WEIGHTS: DocxRecognitionWeights = {
  title: 0.8,
  heading: 0.8,
  listItem: 1.2,
  quote: 0.8,
  caption: 1,
  table: 1.2,
};

export type DocxRecognitionProfile = {
  weights: DocxRecognitionWeights;
  aiGuidance: string;
};

function clampWeight(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(3, Math.max(0, n));
}

export function normalizeProfileWeights(input: unknown): DocxRecognitionWeights {
  const raw = (input ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_DOCX_WEIGHTS };
  for (const key of Object.keys(DEFAULT_DOCX_WEIGHTS) as Array<keyof DocxRecognitionWeights>) {
    const v = clampWeight(raw[key]);
    if (v !== null) out[key] = v;
  }
  return out;
}

/** Đọc hồ sơ nhận diện của tổ chức bằng quyền của người gọi (RLS). */
export async function loadTenantDocxProfile(
  supabase: { from: (t: string) => any },
  tenantId: string,
): Promise<DocxRecognitionProfile> {
  const { data } = await supabase
    .from("work_docx_recognition_profiles")
    .select("weights, ai_guidance")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return {
    weights: normalizeProfileWeights(data?.weights),
    aiGuidance: String(data?.ai_guidance ?? "").slice(0, 2000),
  };
}

/** Đoạn hướng dẫn riêng của tổ chức, chèn vào system prompt của AI. */
export function tenantGuidanceBlock(guidance: string): string {
  const text = guidance.trim();
  if (!text) return "";
  return (
    " QUY ƯỚC RIÊNG CỦA TỔ CHỨC (ưu tiên tuân thủ, nhưng không được bịa dữ kiện): " +
    text.replace(/\s+/g, " ").slice(0, 1200)
  );
}
