// REVISE WORK PRODUCT — AI soạn lại kết quả công việc dựa trên GÓP Ý ĐÃ XỬ LÝ
// (bình luận đã đánh dấu xử lý + ý kiến duyệt đã ra quyết định) trên chính bản đó.
//
// Bất biến:
//  - Chỉ đọc phản hồi có thật theo quyền của actor (RLS). Không có góp ý → không soạn lại.
//  - Bản trước KHÔNG bị ghi đè: chụp thành một phiên bản, bản mới là phiên bản kế tiếp,
//    nhờ đó giao diện so sánh được "trước" và "sau".
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";

interface FeedbackItem {
  kind: "REVIEW" | "COMMENT";
  at: string;
  status?: string;
  text: string;
}

export const reviseWorkProductFromFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        instruction: z.string().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: product, error: pErr } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, title, content, business_type, current_version")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (pErr) mapPgError(pErr);
    if (!product)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    // 1. Góp ý ĐÃ XỬ LÝ trên chính bản này.
    const [comments, reviews] = await Promise.all([
      context.supabase
        .from("work_product_comments")
        .select("body, created_at, resolved_at")
        .eq("work_product_id", data.id)
        .not("resolved_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(40),
      context.supabase
        .from("work_product_reviews")
        .select("status, decision_note, decided_at")
        .eq("work_product_id", data.id)
        .not("decided_at", "is", null)
        .not("decision_note", "is", null)
        .order("decided_at", { ascending: false })
        .limit(40),
    ]);

    const items: FeedbackItem[] = [];
    for (const r of (reviews.data ?? []) as Array<Record<string, string | null>>) {
      const text = (r["decision_note"] ?? "").trim();
      if (!text) continue;
      items.push({
        kind: "REVIEW",
        at: r["decided_at"] ?? "",
        status: r["status"] ?? undefined,
        text: text.slice(0, 800),
      });
    }
    for (const c of (comments.data ?? []) as Array<Record<string, string | null>>) {
      const text = (c["body"] ?? "").trim();
      if (!text) continue;
      items.push({
        kind: "COMMENT",
        at: c["resolved_at"] ?? c["created_at"] ?? "",
        text: text.slice(0, 800),
      });
    }
    if (items.length === 0)
      throw new ApiError({ code: "VALIDATION_FAILED", message: "NO_PROCESSED_FEEDBACK" });

    const beforeContent = String(product.content ?? "");
    if (!beforeContent.trim())
      throw new ApiError({ code: "VALIDATION_FAILED", message: "WORK_PRODUCT_CONTENT_EMPTY" });

    // 2. Bài học chung của tổ chức cho loại kết quả này (vòng học sẵn có).
    const { loadWorkProductGuidance } = await import("./work-product-learning.server");
    const learned = await loadWorkProductGuidance(
      context.supabase as never,
      product.tenant_id as string,
      String(product.business_type ?? ""),
    ).catch(() => ({ guidance: "", sampleCount: 0, refreshed: false }));

    // 3. AI soạn lại toàn văn.
    const { callAiConsumer } = await import("./ai-consumer.server");
    const call = await callAiConsumer({
      consumer: "MY_AI",
      reasoningEffortOverride: "medium",
      system: [
        "Bạn là chuyên viên soạn kết quả công việc của UNIWORK.",
        "Nhiệm vụ: soạn lại TOÀN VĂN bản kết quả sao cho đáp ứng đúng các góp ý đã được xử lý.",
        "Chỉ dùng dữ kiện đã có trong bản hiện tại và trong góp ý; không bịa số liệu, tên người hay cam kết mới.",
        "Giữ nguyên các dữ kiện không bị góp ý đề cập.",
        "Trả về Markdown thuần bằng tiếng Việt, không lời dẫn, không nhắc rằng bạn là AI.",
      ].join(" "),
      prompt: [
        `LOẠI KẾT QUẢ: ${product.business_type}`,
        `TIÊU ĐỀ: ${product.title}`,
        "",
        "GÓP Ý ĐÃ XỬ LÝ (mới → cũ) — BẮT BUỘC ĐÁP ỨNG:",
        ...items.map(
          (i, idx) =>
            `${idx + 1}. [${i.kind}${i.status ? `/${i.status}` : ""}] ${i.text.replace(/\s+/g, " ")}`,
        ),
        ...(learned.guidance ? ["", "QUY TẮC CHUNG CỦA TỔ CHỨC:", learned.guidance] : []),
        ...(data.instruction ? ["", `YÊU CẦU THÊM: ${data.instruction}`] : []),
        "",
        "BẢN HIỆN TẠI:",
        beforeContent.slice(0, 20000),
        "",
        "Trả về bản đã soạn lại, đầy đủ, thay thế cho bản hiện tại.",
      ].join("\n"),
    });

    const afterContent = (call.text ?? "").trim();
    if (!afterContent)
      throw new ApiError({ code: "INTERNAL_ERROR", message: "WORK_PRODUCT_CONTENT_EMPTY" });

    // 4. Chụp bản TRƯỚC thành phiên bản, rồi ghi bản SAU thành phiên bản kế tiếp.
    const beforeVersion = (product.current_version ?? 0) + 1;
    const afterVersion = beforeVersion + 1;
    const base = {
      tenant_id: product.tenant_id,
      work_product_id: data.id,
      author_id: context.userId,
    };
    const { error: insErr } = await context.supabase.from("work_product_versions").insert([
      {
        ...base,
        version: beforeVersion,
        title: product.title,
        content: beforeContent,
        summary: `Bản trước khi soạn lại theo ${items.length} góp ý đã xử lý`,
        ai_generated: false,
      },
      {
        ...base,
        version: afterVersion,
        title: product.title,
        content: afterContent,
        summary: `Bản soạn lại theo ${items.length} góp ý đã xử lý`,
        ai_generated: true,
      },
    ]);
    if (insErr) mapPgError(insErr);

    const { error: upErr } = await context.supabase
      .from("work_products")
      .update({ content: afterContent, current_version: afterVersion })
      .eq("id", data.id);
    if (upErr) mapPgError(upErr);

    return {
      beforeVersion,
      afterVersion,
      feedbackCount: items.length,
      tenantGuidanceUsed: learned.sampleCount,
    };
  });
