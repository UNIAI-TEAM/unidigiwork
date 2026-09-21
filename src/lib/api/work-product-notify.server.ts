/**
 * Máy chủ: đưa góp ý trên kết quả công việc vào hộp thư trong ứng dụng của người liên quan.
 * Gồm góp ý mới, trạng thái đã xử lý, ý kiến duyệt và bản soạn lại (kèm liên kết so sánh phiên bản).
 * Thông báo không bao giờ được phép làm hỏng lệnh gốc.
 */

export type WorkProductFeedbackKind =
  | "COMMENT"
  | "COMMENT_RESOLVED"
  | "COMMENT_REOPENED"
  | "REVIEW_DECIDED"
  | "REVISED";

interface NotifyInput {
  workProductId: string;
  actorId: string;
  kind: WorkProductFeedbackKind;
  /** Nội dung góp ý / ý kiến duyệt (rút gọn khi hiển thị). */
  body?: string | null;
  /** Nhãn trạng thái hiển thị kèm, ví dụ "Đã xử lý". */
  status?: string | null;
  /** Người liên quan trực tiếp (tác giả góp ý, người duyệt…). */
  extraRecipients?: Array<string | null | undefined>;
  /** Có bản so sánh trước / sau thì đính kèm liên kết mở thẳng khung so sánh. */
  compare?: { before: number; after: number } | null;
}

function shorten(text: string | null | undefined, max = 160): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function titleFor(kind: WorkProductFeedbackKind): string {
  switch (kind) {
    case "COMMENT":
      return "Góp ý mới trên kết quả công việc";
    case "COMMENT_RESOLVED":
      return "Góp ý đã được xử lý";
    case "COMMENT_REOPENED":
      return "Góp ý được mở lại";
    case "REVIEW_DECIDED":
      return "Kết quả duyệt kết quả công việc";
    case "REVISED":
      return "Kết quả công việc đã soạn lại theo góp ý";
  }
}

export async function notifyWorkProductFeedback(
  input: NotifyInput,
): Promise<{ notified: number }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: product } = await supabaseAdmin
      .from("work_products")
      .select("id, tenant_id, title, owner_id, created_by, workspace_id")
      .eq("id", input.workProductId)
      .maybeSingle();
    if (!product?.tenant_id) return { notified: 0 };

    const { data: followers } = await supabaseAdmin
      .from("work_product_followers")
      .select("user_id")
      .eq("work_product_id", input.workProductId);

    const recipients = [
      ...new Set(
        [
          product.owner_id,
          product.created_by,
          ...((followers ?? []) as Array<{ user_id: string }>).map((f) => f.user_id),
          ...(input.extraRecipients ?? []),
        ].filter((id): id is string => Boolean(id) && id !== input.actorId),
      ),
    ];
    if (recipients.length === 0) return { notified: 0 };

    const compare = input.compare;
    const link = compare
      ? `/work-products/${input.workProductId}?tab=versions&compareBefore=${compare.before}&compareAfter=${compare.after}`
      : `/work-products/${input.workProductId}?tab=comments`;

    const parts = [
      String(product.title ?? "Kết quả công việc"),
      input.status ? `Trạng thái: ${input.status}` : "",
      shorten(input.body),
      compare ? `So sánh bản v${compare.before} → v${compare.after}` : "",
    ].filter(Boolean);

    await supabaseAdmin.from("notifications").insert(
      recipients.map((userId) => ({
        user_id: userId,
        tenant_id: product.tenant_id,
        workspace_id: product.workspace_id ?? null,
        type: "document",
        scope_type: "tenant",
        title: titleFor(input.kind),
        body: parts.join(" · "),
        link,
        meta: {
          workProductId: input.workProductId,
          kind: input.kind,
          status: input.status ?? null,
          compare: compare ?? null,
        },
      })) as never,
    );

    try {
      const { sendPushToUsers } = await import("./push-dispatch.server");
      await sendPushToUsers(recipients, {
        title: titleFor(input.kind),
        body: parts.join(" · "),
        url: link,
        tag: `wp-feedback-${input.workProductId}`,
      });
    } catch {
      // Thông báo đẩy là tuỳ chọn.
    }

    return { notified: recipients.length };
  } catch {
    return { notified: 0 };
  }
}
