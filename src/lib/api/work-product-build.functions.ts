// Build Work Product — sau khi AI hoàn thành một lượt làm việc, UniWork soạn
// kết quả công việc thật (báo cáo / đề xuất / bài trình bày / bảng tính) và ghi
// vào bảng nguồn `work_products`. Trigger GO-3 tự chiếu bản ghi này vào Work Graph.
//
// Bất biến:
//  - Chỉ AI soạn NỘI DUNG; việc ghi dữ liệu do server function này thực hiện sau
//    khi người dùng bấm tạo (PROPOSE → CONFIRM ở giao diện).
//  - Ngữ cảnh luôn đi qua AI Context Engine theo quyền của chính actor.
//  - Không suy diễn: chỉ liên kết provenance với thực thể người dùng đã đính kèm.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";
import { WORK_ENTITY_TYPES } from "@/domain/work-graph/relationship-types";

export const WORK_PRODUCT_BUILD_KINDS = [
  "REPORT",
  "PROPOSAL",
  "PRESENTATION",
  "SPREADSHEET",
] as const;
export type WorkProductBuildKind = (typeof WORK_PRODUCT_BUILD_KINDS)[number];

/** Loại nghiệp vụ tương ứng trong bảng nguồn. */
const BUSINESS_TYPE: Record<WorkProductBuildKind, string> = {
  REPORT: "REPORT",
  PROPOSAL: "PROPOSAL",
  PRESENTATION: "PRESENTATION",
  SPREADSHEET: "SPREADSHEET",
};

/** Khuôn đầu ra cho từng loại — AI chỉ được soạn theo đúng khuôn này. */
const KIND_SPEC: Record<WorkProductBuildKind, string> = {
  REPORT: [
    "Soạn một BÁO CÁO bằng Markdown với các mục: Tóm tắt điều hành, Bối cảnh,",
    "Kết quả chính (gạch đầu dòng, mỗi ý kèm [S#] của nguồn), Rủi ro/Vướng mắc,",
    "Khuyến nghị và Việc tiếp theo. Không thêm số liệu không có trong nguồn.",
  ].join(" "),
  PROPOSAL: [
    "Soạn một ĐỀ XUẤT bằng Markdown với các mục: Vấn đề, Giải pháp đề xuất,",
    "Phạm vi công việc, Lộ trình (bảng mốc thời gian nếu nguồn có ngày),",
    "Nguồn lực, Rủi ro và Đề nghị phê duyệt. Chỗ thiếu dữ kiện ghi rõ",
    "`[CẦN BỔ SUNG: ...]` thay vì bịa.",
  ].join(" "),
  PRESENTATION: [
    "Soạn một BÀI TRÌNH BÀY bằng Markdown, mỗi slide là một mục `## Slide N — Tiêu đề`",
    "gồm 3–5 gạch đầu dòng ngắn và dòng `Ghi chú trình bày:` ở cuối mỗi slide.",
    "Tối đa 10 slide, mở đầu bằng slide tiêu đề và kết bằng slide đề xuất hành động.",
  ].join(" "),
  SPREADSHEET: [
    "Soạn một BẢNG TÍNH bằng Markdown: mở đầu bằng 2–3 dòng mô tả cách dùng,",
    "sau đó là MỘT bảng Markdown duy nhất với hàng tiêu đề rõ ràng và mỗi dòng là",
    "một bản ghi có thật trong nguồn (kèm cột Nguồn ghi [S#]).",
    "Cuối cùng là mục `## Ghi chú` nêu ô nào còn thiếu dữ liệu.",
    "Tuyệt đối không tự tính tổng nếu nguồn không có số.",
  ].join(" "),
};

const entitySchema = z.object({
  type: z.enum(WORK_ENTITY_TYPES),
  id: z.string().uuid(),
});

export const buildWorkProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        kind: z.enum(WORK_PRODUCT_BUILD_KINDS),
        /** Yêu cầu gốc của người dùng / kết quả AI vừa hoàn thành. */
        brief: z.string().min(1).max(8000),
        title: z.string().min(1).max(300).optional(),
        workspaceId: z.string().uuid().nullable().optional(),
        /** Thực thể đã đính kèm ở composer — dùng làm ngữ cảnh và provenance. */
        sourceEntities: z.array(entitySchema).max(8).default([]),
        conversationId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { resolveTenantId } = await import("./work-deliverables.server");
    const { readActiveTenantCookie } = await import("./active-tenant.server");
    const activeTenant = readActiveTenantCookie();
    const tenantId = await resolveTenantId(
      context.supabase as never,
      context.userId,
      data.workspaceId ?? null,
      activeTenant,
    );

    // 1. Soạn nội dung qua AI Context Engine (ngữ cảnh theo quyền của actor).
    const { answerWithContext } = await import("./ai-consumer.server");
    const result = await answerWithContext(context.supabase, context.userId, activeTenant, {
      consumer: "MY_AI",
      query: data.brief,
      workspaceId: data.workspaceId ?? null,
      pinnedEntities: data.sourceEntities.length ? data.sourceEntities : null,
      systemRole: [
        "Bạn là chuyên viên soạn kết quả công việc của UNIWORK.",
        "Chỉ dùng dữ kiện có trong các nguồn được cung cấp; thiếu thì ghi rõ là chưa đủ dữ liệu.",
        "Trả về Markdown thuần, không thêm lời dẫn, không nhắc rằng bạn là AI.",
        "Viết bằng tiếng Việt, văn phong doanh nghiệp, ngắn gọn.",
      ].join(" "),
      promptSections: [
        `KHUÔN ĐẦU RA:\n${KIND_SPEC[data.kind]}`,
        `YÊU CẦU CÔNG VIỆC:\n${data.brief}`,
      ],
    });

    const content = (result.text ?? "").trim();
    if (!content) {
      throw new ApiError({ code: "INTERNAL_ERROR", message: "WORK_PRODUCT_CONTENT_EMPTY" });
    }

    // Tiêu đề: ưu tiên người dùng đặt, nếu không thì lấy heading đầu tiên của bản soạn.
    const heading = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /^#{1,3}\s+\S/.test(line));
    const title = (
      data.title ??
      heading?.replace(/^#{1,3}\s+/, "") ??
      data.brief.slice(0, 120)
    ).slice(0, 300);

    // 2. Ghi vào bảng nguồn — trigger Work Graph chiếu bản ghi này thành node WORK_PRODUCT.
    const { data: row, error } = await context.supabase
      .from("work_products")
      .insert({
        tenant_id: tenantId,
        workspace_id: data.workspaceId ?? null,
        title,
        description: data.brief.slice(0, 2000),
        business_type: BUSINESS_TYPE[data.kind],
        content,
        status: "DRAFT",
        ai_generated: true,
        owner_id: context.userId,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) mapPgError(error);
    const workProductId = row.id as string;

    // 3. Provenance: liên kết với thực thể actor đính kèm VÀ nguồn thật mà bản
    //    soạn đã trích dẫn (lịch họp, tài liệu, công việc) — không suy diễn.
    const LINKABLE = new Set(["TASK", "DOCUMENT", "MEETING", "MEETING_ARTIFACT"]);
    const linkedSources: Array<{ type: string; id: string }> = [];
    const seen = new Set<string>();

    const candidates: Array<{ type: string; id: string }> = [
      ...data.sourceEntities.map((e) => ({ type: e.type as string, id: e.id })),
      ...(result.citedSources ?? []).map((s) => ({
        type: s.entityType as string,
        id: s.entityId,
      })),
    ];

    for (const entity of candidates) {
      if (!LINKABLE.has(entity.type)) continue;
      const key = `${entity.type}:${entity.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { error: linkError } = await context.supabase.rpc("link_work_entities", {
        _source_type: "WORK_PRODUCT",
        _source_id: workProductId,
        _target_type: entity.type,
        _target_id: entity.id,
        _relationship: "REFERENCES",
      });
      if (!linkError) linkedSources.push({ type: entity.type, id: entity.id });
    }

    return {
      id: workProductId,
      title,
      kind: data.kind,
      href: `/work-products/${workProductId}`,
      citedSources: result.citedSources?.length ?? 0,
      linkedSources,
    };
  });
