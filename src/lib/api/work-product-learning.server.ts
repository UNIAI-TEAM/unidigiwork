// AI LEARNING LOOP V1 — UniWork học từ GÓP Ý và QUYẾT ĐỊNH DUYỆT thật của người
// dùng để các lần soạn kết quả công việc sau tốt hơn.
//
// Bất biến:
//  - Chỉ đọc phản hồi có thật (work_product_comments / work_product_reviews) theo
//    quyền của chính actor (RLS). Không suy diễn khi chưa có phản hồi.
//  - Bài học được chắt lọc rồi lưu cache theo (tenant, loại kết quả); chỉ soạn lại
//    khi tập phản hồi thay đổi (fingerprint).
//  - Ghi cache qua RPC tenant-guarded, không dùng service role.
import { createHash } from "node:crypto";

type Db = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** Số phản hồi tối đa đưa vào một lần chắt lọc. */
const MAX_FEEDBACK = 30;
/** Cửa sổ thời gian lấy phản hồi (ngày). */
const WINDOW_DAYS = 120;

export interface WorkProductFeedbackItem {
  kind: "REVIEW" | "COMMENT";
  at: string;
  status?: string;
  text: string;
}

/** Thu thập phản hồi thật trên các kết quả cùng loại trong tổ chức. */
export async function collectWorkProductFeedback(
  supabase: Db,
  tenantId: string,
  businessType: string,
): Promise<WorkProductFeedbackItem[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

  const { data: products } = await supabase
    .from("work_products")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("business_type", businessType)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);

  const ids = ((products ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (!ids.length) return [];

  const [reviews, comments] = await Promise.all([
    supabase
      .from("work_product_reviews")
      .select("status, decision_note, decided_at, updated_at")
      .in("work_product_id", ids)
      .not("decision_note", "is", null)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(MAX_FEEDBACK),
    supabase
      .from("work_product_comments")
      .select("body, created_at")
      .in("work_product_id", ids)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_FEEDBACK),
  ]);

  const items: WorkProductFeedbackItem[] = [];
  for (const r of (reviews.data ?? []) as Array<Record<string, string | null>>) {
    const text = (r["decision_note"] ?? "").trim();
    if (!text) continue;
    items.push({
      kind: "REVIEW",
      at: r["decided_at"] ?? r["updated_at"] ?? "",
      status: r["status"] ?? undefined,
      text: text.slice(0, 600),
    });
  }
  for (const c of (comments.data ?? []) as Array<Record<string, string | null>>) {
    const text = (c["body"] ?? "").trim();
    if (!text) continue;
    items.push({ kind: "COMMENT", at: c["created_at"] ?? "", text: text.slice(0, 600) });
  }

  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, MAX_FEEDBACK);
}

function fingerprintOf(items: WorkProductFeedbackItem[]): string {
  const h = createHash("sha256");
  for (const i of items) h.update(`${i.kind}|${i.at}|${i.status ?? ""}|${i.text}\n`);
  return h.digest("hex");
}

/**
 * Trả về "bài học" đã chắt lọc cho loại kết quả này — soạn lại bằng AI chỉ khi
 * tập phản hồi thay đổi so với lần trước.
 */
export async function loadWorkProductGuidance(
  supabase: Db,
  tenantId: string,
  businessType: string,
): Promise<{ guidance: string; sampleCount: number; refreshed: boolean }> {
  const items = await collectWorkProductFeedback(supabase, tenantId, businessType);
  if (!items.length) return { guidance: "", sampleCount: 0, refreshed: false };

  const fingerprint = fingerprintOf(items);

  const { data: cached } = await supabase
    .from("work_product_ai_guidance")
    .select("guidance, feedback_fingerprint, sample_count")
    .eq("tenant_id", tenantId)
    .eq("business_type", businessType)
    .maybeSingle();

  const cachedRow = cached as {
    guidance?: string;
    feedback_fingerprint?: string;
    sample_count?: number;
  } | null;

  if (cachedRow?.feedback_fingerprint === fingerprint && (cachedRow.guidance ?? "").trim()) {
    return {
      guidance: cachedRow.guidance as string,
      sampleCount: cachedRow.sample_count ?? items.length,
      refreshed: false,
    };
  }

  // Chắt lọc phản hồi thành quy tắc áp dụng được.
  let guidance = "";
  try {
    const { callAiConsumer } = await import("./ai-consumer.server");
    const call = await callAiConsumer({
      consumer: "MY_AI",
      system: [
        "Bạn là biên tập viên chất lượng của UNIWORK.",
        "Nhiệm vụ: đọc góp ý và quyết định duyệt thật của người dùng trên các bản",
        "kết quả công việc trước, rồi rút ra quy tắc soạn thảo cho lần sau.",
        "Chỉ rút ra điều có căn cứ trong phản hồi; không bịa tiêu chuẩn.",
      ].join(" "),
      prompt: [
        `LOẠI KẾT QUẢ: ${businessType}`,
        "PHẢN HỒI THẬT (mới → cũ):",
        ...items.map(
          (i, idx) =>
            `${idx + 1}. [${i.kind}${i.status ? `/${i.status}` : ""}] ${i.text.replace(/\s+/g, " ")}`,
        ),
        "",
        "Trả về tối đa 8 gạch đầu dòng tiếng Việt, mỗi dòng là một quy tắc mệnh lệnh",
        "ngắn (bắt đầu bằng động từ), ưu tiên lỗi bị yêu cầu chỉnh sửa nhiều nhất.",
        "Không mở đầu, không kết luận, không nhắc rằng bạn là AI.",
      ].join("\n"),
      reasoningEffortOverride: "low",
    });
    guidance = (call.text ?? "").trim().slice(0, 4000);
  } catch {
    // Học hỏi không bao giờ được làm hỏng việc soạn kết quả.
    return {
      guidance: (cachedRow?.guidance ?? "").trim(),
      sampleCount: cachedRow?.sample_count ?? 0,
      refreshed: false,
    };
  }

  if (!guidance) return { guidance: "", sampleCount: items.length, refreshed: false };

  await supabase.rpc("upsert_work_product_ai_guidance", {
    _tenant_id: tenantId,
    _business_type: businessType,
    _guidance: guidance,
    _fingerprint: fingerprint,
    _sample_count: items.length,
  });

  return { guidance, sampleCount: items.length, refreshed: true };
}
