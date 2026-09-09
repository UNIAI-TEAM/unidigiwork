// Kết quả công việc (Work Products) — server functions.
// Mọi thay đổi trạng thái đi qua đây; giao diện không ghi trực tiếp vào bảng.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";

export const BUSINESS_TYPES = [
  "PROPOSAL",
  "REPORT",
  "ANALYSIS",
  "CONTRACT",
  "PLAN",
  "PRESENTATION",
  "MEMO",
  "DOCUMENT",
  "OTHER",
] as const;

export const WP_STATUSES = ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "FINAL", "ARCHIVED"] as const;

const contextTypeSchema = z.enum(["WORKSPACE", "MEETING", "TASK", "DOCUMENT", "EMAIL"]);

const provenanceSchema = z.array(
  z.object({
    type: z.string().max(40),
    id: z.string().max(80),
    title: z.string().max(300),
    stamp: z.string().max(80).nullable().optional(),
  }),
).max(50);

export type WorkDeliverableRow = {
  id: string;
  title: string;
  description: string | null;
  business_type: string;
  status: string;
  content: string;
  workspace_id: string | null;
  owner_id: string | null;
  created_by: string | null;
  ai_generated: boolean;
  current_version: number;
  primary_context_type: string | null;
  primary_context_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ reads */

export const listWorkDeliverables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().nullable().optional(),
        status: z.enum(WP_STATUSES).nullable().optional(),
        businessType: z.enum(BUSINESS_TYPES).nullable().optional(),
        search: z.string().max(200).optional(),
        mine: z.boolean().default(false),
        limit: z.number().int().min(1).max(200).default(60),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("work_products")
      .select(
        "id, title, description, business_type, status, workspace_id, owner_id, created_by, ai_generated, current_version, primary_context_type, primary_context_id, tags, created_at, updated_at",
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.workspaceId) q = q.eq("workspace_id", data.workspaceId);
    if (data.status) q = q.eq("status", data.status);
    if (data.businessType) q = q.eq("business_type", data.businessType);
    if (data.mine) q = q.eq("owner_id", context.userId);
    if (data.search?.trim()) q = q.ilike("title", `%${data.search.trim()}%`);

    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    const list = rows ?? [];

    const wsIds = [...new Set(list.map((r: any) => r.workspace_id).filter(Boolean))];
    const ownerIds = [...new Set(list.map((r: any) => r.owner_id).filter(Boolean))];
    const [ws, profiles] = await Promise.all([
      wsIds.length ? context.supabase.from("workspaces").select("id, name").in("id", wsIds) : Promise.resolve({ data: [] }),
      ownerIds.length ? context.supabase.from("profiles").select("id, display_name, email").in("id", ownerIds) : Promise.resolve({ data: [] }),
    ]);
    const wmap = new Map(((ws.data ?? []) as any[]).map((w) => [w.id, w.name]));
    const pmap = new Map(((profiles.data ?? []) as any[]).map((p) => [p.id, p.display_name ?? p.email]));

    return list.map((r: any) => ({
      ...r,
      workspaceName: r.workspace_id ? (wmap.get(r.workspace_id) ?? null) : null,
      ownerName: r.owner_id ? (pmap.get(r.owner_id) ?? null) : null,
    }));
  });

export const getWorkDeliverable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: product, error } = await context.supabase
      .from("work_products")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) mapPgError(error);
    if (!product) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    const [versions, comments, reviews, artifacts, workspace] = await Promise.all([
      context.supabase
        .from("work_product_versions")
        .select("id, version, title, summary, provenance, ai_generated, author_id, created_at")
        .eq("work_product_id", data.id)
        .order("version", { ascending: false })
        .limit(50),
      context.supabase
        .from("work_product_comments")
        .select("id, body, author_id, parent_id, resolved_at, created_at")
        .eq("work_product_id", data.id)
        .order("created_at", { ascending: true })
        .limit(200),
      context.supabase
        .from("work_product_reviews")
        .select("id, reviewer_id, requested_by, status, due_at, decision_note, decided_at, version, created_at")
        .eq("work_product_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("work_product_artifacts")
        .select("id, format, role, storage_ref, mime_type, size_bytes, version, generated_by, created_at")
        .eq("work_product_id", data.id)
        .order("created_at", { ascending: false }),
      product.workspace_id
        ? context.supabase.from("workspaces").select("id, name").eq("id", product.workspace_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const people = [
      ...new Set(
        [
          product.owner_id,
          ...(comments.data ?? []).map((c: any) => c.author_id),
          ...(reviews.data ?? []).map((r: any) => r.reviewer_id),
          ...(versions.data ?? []).map((v: any) => v.author_id),
        ].filter(Boolean),
      ),
    ];
    const { data: profiles } = people.length
      ? await context.supabase.from("profiles").select("id, display_name, email").in("id", people)
      : { data: [] as any[] };
    const pmap = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p.display_name ?? p.email ?? p.id]));

    return {
      product: product as WorkDeliverableRow,
      canEdit: product.owner_id === context.userId || product.created_by === context.userId,
      workspace: (workspace as any)?.data ?? null,
      versions: (versions.data ?? []).map((v: any) => ({ ...v, authorName: pmap.get(v.author_id) ?? null })),
      comments: (comments.data ?? []).map((c: any) => ({ ...c, authorName: pmap.get(c.author_id) ?? null })),
      reviews: (reviews.data ?? []).map((r: any) => ({ ...r, reviewerName: pmap.get(r.reviewer_id) ?? null })),
      artifacts: artifacts.data ?? [],
      ownerName: product.owner_id ? (pmap.get(product.owner_id) ?? null) : null,
    };
  });

/** Nguồn ngữ cảnh AI khả dụng — người dùng bật/tắt từng nguồn trong panel phải. */
export const listWorkDeliverableContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: product } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, workspace_id")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!product) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });
    const { collectContextSources } = await import("./work-deliverables.server");
    return collectContextSources(context.supabase as never, product as never);
  });

/* --------------------------------------------------------------- mutations */

export const createWorkDeliverable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        title: z.string().min(1).max(300),
        businessType: z.enum(BUSINESS_TYPES).default("DOCUMENT"),
        description: z.string().max(2000).optional(),
        workspaceId: z.string().uuid().nullable().optional(),
        primaryContextType: contextTypeSchema.nullable().optional(),
        primaryContextId: z.string().uuid().nullable().optional(),
        useTemplate: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { resolveTenantId, templateFor } = await import("./work-deliverables.server");
    const { readActiveTenantCookie } = await import("./active-tenant.server");
    const tenantId = await resolveTenantId(
      context.supabase as never,
      context.userId,
      data.workspaceId ?? null,
      readActiveTenantCookie(),
    );

    const { data: row, error } = await context.supabase
      .from("work_products")
      .insert({
        tenant_id: tenantId,
        workspace_id: data.workspaceId ?? null,
        title: data.title,
        description: data.description ?? null,
        business_type: data.businessType,
        content: data.useTemplate ? templateFor(data.businessType, data.title) : "",
        owner_id: context.userId,
        created_by: context.userId,
        primary_context_type: data.primaryContextType ?? null,
        primary_context_id: data.primaryContextId ?? null,
      })
      .select("id")
      .single();
    if (error) mapPgError(error);

    // Liên kết ngữ cảnh chính vào Work Graph (best-effort, không chặn tạo mới).
    if (data.primaryContextType && data.primaryContextId && data.primaryContextType !== "WORKSPACE") {
      await context.supabase.rpc("link_work_entities", {
        _source_type: "WORK_PRODUCT",
        _source_id: row.id,
        _target_type: data.primaryContextType,
        _target_id: data.primaryContextId,
        _relationship: "REFERENCES",
      });
    }
    return { id: row.id as string };
  });

export const updateWorkDeliverable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(2000).nullable().optional(),
        content: z.string().max(500000).optional(),
        tags: z.array(z.string().max(50)).max(30).optional(),
        businessType: z.enum(BUSINESS_TYPES).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      title?: string;
      description?: string | null;
      content?: string;
      tags?: string[];
      business_type?: string;
    } = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.content !== undefined) patch.content = data.content;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.businessType !== undefined) patch.business_type = data.businessType;
    if (!Object.keys(patch).length) return { saved: false };

    const { error } = await context.supabase.from("work_products").update(patch).eq("id", data.id);
    if (error) mapPgError(error);
    return { saved: true };
  });

export const changeWorkDeliverableStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ ...commandMetadataSchema.shape, id: z.string().uuid(), status: z.enum(WP_STATUSES) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("work_products").update({ status: data.status }).eq("id", data.id);
    if (error) mapPgError(error);
    return { status: data.status };
  });

export const deleteWorkDeliverable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ...commandMetadataSchema.shape, id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("work_products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) mapPgError(error);
    return { deleted: true };
  });

/** Ghi một phiên bản, kèm ảnh chụp nguồn gốc (provenance) tại thời điểm đó. */
export const saveWorkDeliverableVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        summary: z.string().max(500).optional(),
        aiGenerated: z.boolean().default(false),
        provenance: provenanceSchema.default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: product } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, title, content, current_version")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!product) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    const { data: artifacts } = await context.supabase
      .from("work_product_artifacts")
      .select("id, format, role, storage_ref, mime_type, size_bytes")
      .eq("work_product_id", data.id);

    const nextVersion = (product.current_version ?? 0) + 1;
    const stampedAt = new Date().toISOString();
    const { error } = await context.supabase.from("work_product_versions").insert({
      tenant_id: product.tenant_id,
      work_product_id: data.id,
      version: nextVersion,
      title: product.title,
      content: product.content ?? "",
      summary: data.summary ?? null,
      artifacts_snapshot: artifacts ?? [],
      provenance: data.provenance.map((p) => ({ ...p, capturedAt: stampedAt })),
      ai_generated: data.aiGenerated,
      author_id: context.userId,
    });
    if (error) mapPgError(error);

    await context.supabase.from("work_products").update({ current_version: nextVersion }).eq("id", data.id);
    return { version: nextVersion };
  });

export const restoreWorkDeliverableVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ ...commandMetadataSchema.shape, id: z.string().uuid(), version: z.number().int().positive() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: v } = await context.supabase
      .from("work_product_versions")
      .select("content, title")
      .eq("work_product_id", data.id)
      .eq("version", data.version)
      .maybeSingle();
    if (!v) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "VERSION_NOT_FOUND" });
    const { error } = await context.supabase
      .from("work_products")
      .update({ content: v.content, title: v.title ?? undefined })
      .eq("id", data.id);
    if (error) mapPgError(error);
    return { restored: data.version };
  });

export const getWorkDeliverableVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), version: z.number().int().positive() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: v, error } = await context.supabase
      .from("work_product_versions")
      .select("version, title, content, summary, provenance, ai_generated, created_at")
      .eq("work_product_id", data.id)
      .eq("version", data.version)
      .maybeSingle();
    if (error) mapPgError(error);
    return v ?? null;
  });

export const commentWorkDeliverable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        body: z.string().min(1).max(4000),
        parentId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: product } = await context.supabase
      .from("work_products")
      .select("tenant_id")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!product) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });
    const { error } = await context.supabase.from("work_product_comments").insert({
      tenant_id: product.tenant_id,
      work_product_id: data.id,
      parent_id: data.parentId ?? null,
      body: data.body,
      author_id: context.userId,
    });
    if (error) mapPgError(error);
    return { added: true };
  });

export const resolveWorkDeliverableComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ ...commandMetadataSchema.shape, commentId: z.string().uuid(), resolved: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("work_product_comments")
      .update({
        resolved_at: data.resolved ? new Date().toISOString() : null,
        resolved_by: data.resolved ? context.userId : null,
      })
      .eq("id", data.commentId);
    if (error) mapPgError(error);
    return { resolved: data.resolved };
  });

export const requestWorkDeliverableReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        reviewerId: z.string().uuid(),
        dueAt: z.string().datetime().nullable().optional(),
        note: z.string().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: product } = await context.supabase
      .from("work_products")
      .select("tenant_id, current_version")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!product) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    const { data: review, error } = await context.supabase
      .from("work_product_reviews")
      .insert({
        tenant_id: product.tenant_id,
        work_product_id: data.id,
        reviewer_id: data.reviewerId,
        requested_by: context.userId,
        version: product.current_version ?? 0,
        due_at: data.dueAt ?? null,
        decision_note: data.note ?? null,
      })
      .select("id")
      .single();
    if (error) mapPgError(error);

    await context.supabase.from("work_products").update({ status: "IN_REVIEW" }).eq("id", data.id);
    return { reviewId: review.id as string };
  });

export const decideWorkDeliverableReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        reviewId: z.string().uuid(),
        decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "CANCELED"]),
        note: z.string().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: review, error } = await context.supabase
      .from("work_product_reviews")
      .update({
        status: data.decision,
        decision_note: data.note ?? null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.reviewId)
      .select("work_product_id")
      .maybeSingle();
    if (error) mapPgError(error);
    if (!review) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "REVIEW_NOT_FOUND" });

    if (data.decision !== "CANCELED") {
      await context.supabase
        .from("work_products")
        .update({ status: data.decision === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED" })
        .eq("id", review.work_product_id);
    }
    return { decision: data.decision };
  });

/* ------------------------------------------------------------- work graph */

export const linkWorkDeliverable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        targetType: z.enum(["DOCUMENT", "TASK", "MEETING", "MEETING_ARTIFACT", "EMAIL", "WORK_PRODUCT"]),
        targetId: z.string().uuid(),
        relationship: z.enum(["REFERENCES", "RELATED_TO"]).default("REFERENCES"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("link_work_entities", {
      _source_type: "WORK_PRODUCT",
      _source_id: data.id,
      _target_type: data.targetType,
      _target_id: data.targetId,
      _relationship: data.relationship,
    });
    if (res.error) mapPgError(res.error);
    return { linked: true };
  });

export const listWorkDeliverableLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: node } = await context.supabase
      .from("work_nodes")
      .select("id")
      .eq("entity_type", "WORK_PRODUCT")
      .eq("entity_id", data.id)
      .maybeSingle();
    if (!node) return [];
    const { data: edges } = await context.supabase
      .from("work_edges")
      .select("id, relationship_type, origin, source_node_id, target_node_id")
      .or(`source_node_id.eq.${node.id},target_node_id.eq.${node.id}`)
      .limit(100);
    const otherIds = [
      ...new Set((edges ?? []).map((e: any) => (e.source_node_id === node.id ? e.target_node_id : e.source_node_id))),
    ];
    if (!otherIds.length) return [];
    const { data: nodes } = await context.supabase
      .from("work_nodes")
      .select("id, entity_type, entity_id")
      .in("id", otherIds);
    const nmap = new Map(((nodes ?? []) as any[]).map((n) => [n.id, n]));
    return (edges ?? []).map((e: any) => {
      const other = nmap.get(e.source_node_id === node.id ? e.target_node_id : e.source_node_id);
      return {
        edgeId: e.id as string,
        relationship: e.relationship_type as string,
        origin: e.origin as string,
        entityType: (other?.entity_type ?? "UNKNOWN") as string,
        entityId: (other?.entity_id ?? "") as string,
      };
    });
  });

/* -------------------------------------------------------------------- AI */

export const runWorkDeliverableAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["ASK", "IMPROVE", "SHORTEN", "EXPAND", "REWRITE", "TRANSLATE", "DRAFT", "NEXT_STEPS"]),
        selection: z.string().max(20000).optional(),
        instruction: z.string().max(2000).optional(),
        locale: z.string().max(8).default("vi"),
        sources: z
          .array(z.object({ type: z.string().max(40), id: z.string().max(80), title: z.string().max(300), snippet: z.string().max(1200), stamp: z.string().max(80).nullable().optional() }))
          .max(20)
          .default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ApiError({ code: "INTERNAL_ERROR", message: "AI_UNAVAILABLE" });

    const { data: product } = await context.supabase
      .from("work_products")
      .select("id, title, business_type, content")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!product) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    const { streamText } = await import("ai");
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");

    const contextBlock = data.sources.length
      ? data.sources.map((s) => `- [${s.type}] ${s.title}${s.stamp ? ` (cập nhật ${s.stamp})` : ""}: ${s.snippet}`).join("\n")
      : "(người dùng không bật nguồn ngữ cảnh nào)";

    const actionText: Record<string, string> = {
      ASK: "Trả lời câu hỏi của người dùng dựa trên nội dung và ngữ cảnh.",
      IMPROVE: "Viết lại đoạn được chọn cho rõ ràng, chuyên nghiệp hơn. Chỉ trả về đoạn đã sửa.",
      SHORTEN: "Rút gọn đoạn được chọn, giữ nguyên ý chính. Chỉ trả về đoạn đã sửa.",
      EXPAND: "Mở rộng đoạn được chọn với chi tiết hợp lý. Chỉ trả về đoạn đã sửa.",
      REWRITE: "Viết lại đoạn được chọn theo yêu cầu của người dùng. Chỉ trả về đoạn đã sửa.",
      TRANSLATE: "Dịch đoạn được chọn sang ngôn ngữ người dùng yêu cầu. Chỉ trả về bản dịch.",
      DRAFT: "Soạn bản nháp cho mục người dùng yêu cầu, bám sát ngữ cảnh đã bật.",
      NEXT_STEPS: "Đề xuất tối đa 5 việc/quyết định/cuộc họp tiếp theo, mỗi dòng một mục ngắn gọn.",
    };

    const result = streamText({
      model: createLovableResponsesProvider(apiKey).responses("openai/gpt-5.6-sol"),
      system:
        "Bạn là trợ lý soạn thảo kết quả công việc trong UNIWORK. " +
        "Chỉ dùng dữ kiện có trong nội dung và các nguồn ngữ cảnh được cung cấp; không bịa số liệu, tên khách hàng hay cam kết. " +
        `Trả lời bằng ngôn ngữ locale ${data.locale}. Không thêm lời dẫn, chỉ trả nội dung.`,
      messages: [
        {
          role: "user",
          content:
            `Loại kết quả: ${product.business_type}\nTiêu đề: ${product.title}\n\n` +
            `NGUỒN NGỮ CẢNH ĐANG BẬT:\n${contextBlock}\n\n` +
            `NỘI DUNG HIỆN TẠI:\n${String(product.content ?? "").slice(0, 12000)}\n\n` +
            (data.selection ? `ĐOẠN ĐƯỢC CHỌN:\n${data.selection}\n\n` : "") +
            (data.instruction ? `YÊU CẦU: ${data.instruction}\n\n` : "") +
            `NHIỆM VỤ: ${actionText[data.action]}`,
        },
      ],
      providerOptions: { lovable: { max_completion_tokens: 1500 } },
    });

    const output = (await result.text).trim();
    return {
      output,
      usedSources: data.sources.map((s) => ({ type: s.type, id: s.id, title: s.title, stamp: s.stamp ?? null })),
    };
  });

/** Người có thể được chọn làm người xem xét: thành viên đang hoạt động của tổ chức. */
export const listWorkDeliverableReviewers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: product } = await context.supabase
      .from("work_products")
      .select("tenant_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!product) return [];
    const { data: members } = await context.supabase
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", product.tenant_id)
      .eq("status", "active")
      .limit(200);
    const others = (members ?? []).map((m: any) => m.user_id).filter((id: string) => id !== context.userId);
    // Tổ chức chỉ có một thành viên: cho phép tự duyệt để luồng phê duyệt không bị chặn.
    const ids = others.length ? others : [context.userId];
    const { data: profiles } = await context.supabase.from("profiles").select("id, display_name, email").in("id", ids);
    return ((profiles ?? []) as any[]).map((p) => ({
      id: p.id as string,
      name: (p.display_name ?? p.email ?? p.id) as string,
      self: (p.id as string) === context.userId,
    }));
  });

/* --------------------------------------------------- báo cáo tuần (7 ngày) */

export type WeeklyReportRow = {
  businessType: string;
  created: number;
  approved: number;
  versions: number;
  /** Đang ở trạng thái chờ duyệt tại thời điểm xem (không giới hạn 7 ngày). */
  inReview: number;
  /** Đang ở trạng thái đã duyệt tại thời điểm xem (không giới hạn 7 ngày). */
  approvedNow: number;
};

export type WeeklyReport = {
  from: string;
  to: string;
  rows: WeeklyReportRow[];
  totals: WeeklyReportRow;
};

export const getWorkDeliverableWeeklyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().nullable().optional(),
        days: z.number().int().min(1).max(90).default(7),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<WeeklyReport> => {
    const to = new Date();
    const from = new Date(to.getTime() - data.days * 86400_000);
    const fromISO = from.toISOString();
    const toISO = to.toISOString();

    let scope = context.supabase
      .from("work_products")
      .select("id, business_type, status, created_at")
      .is("deleted_at", null)
      .limit(2000);
    if (data.workspaceId) scope = scope.eq("workspace_id", data.workspaceId);
    const { data: products, error } = await scope;
    if (error) mapPgError(error);

    const typeById = new Map<string, string>();
    for (const p of (products ?? []) as any[]) typeById.set(p.id as string, (p.business_type as string) ?? "OTHER");
    const ids = [...typeById.keys()];

    const [versionsRes, reviewsRes] = await Promise.all([
      ids.length
        ? context.supabase
            .from("work_product_versions")
            .select("work_product_id, created_at")
            .in("work_product_id", ids)
            .gte("created_at", fromISO)
            .lte("created_at", toISO)
            .limit(5000)
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? context.supabase
            .from("work_product_reviews")
            .select("work_product_id, status, decided_at")
            .in("work_product_id", ids)
            .eq("status", "APPROVED")
            .gte("decided_at", fromISO)
            .lte("decided_at", toISO)
            .limit(5000)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const acc = new Map<string, WeeklyReportRow>();
    const bump = (type: string, key: "created" | "approved" | "versions" | "inReview" | "approvedNow") => {
      const row = acc.get(type) ?? { businessType: type, created: 0, approved: 0, versions: 0, inReview: 0, approvedNow: 0 };
      row[key] += 1;
      acc.set(type, row);
    };

    for (const p of (products ?? []) as any[]) {
      const type = p.business_type ?? "OTHER";
      if (p.created_at >= fromISO && p.created_at <= toISO) bump(type, "created");
      if (p.status === "IN_REVIEW") bump(type, "inReview");
      if (p.status === "APPROVED") bump(type, "approvedNow");
    }
    for (const v of ((versionsRes as any).data ?? []) as any[]) {
      bump(typeById.get(v.work_product_id) ?? "OTHER", "versions");
    }
    for (const r of ((reviewsRes as any).data ?? []) as any[]) {
      bump(typeById.get(r.work_product_id) ?? "OTHER", "approved");
    }

    const order = BUSINESS_TYPES as readonly string[];
    const rows = [...acc.values()].sort((a, b) => order.indexOf(a.businessType) - order.indexOf(b.businessType));
    const totals = rows.reduce<WeeklyReportRow>(
      (t, r) => ({
        businessType: "TOTAL",
        created: t.created + r.created,
        approved: t.approved + r.approved,
        versions: t.versions + r.versions,
        inReview: t.inReview + r.inReview,
        approvedNow: t.approvedNow + r.approvedNow,
      }),
      { businessType: "TOTAL", created: 0, approved: 0, versions: 0, inReview: 0, approvedNow: 0 },
    );

    return { from: fromISO, to: toISO, rows, totals };
  });

/* ---------------------------------------- bản thể hiện Office (Phase 2) */

const WP_BUCKET = "work-products";

/**
 * Kết xuất Kết quả công việc thành DOCX/XLSX/PPTX/PDF.
 * Nội dung luôn lấy từ phiên bản đã lưu trong database (không nhận nội dung từ giao diện),
 * nên bản thể hiện luôn khớp phiên bản và audit truy vết được.
 */
export const exportWorkDeliverableArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        format: z.enum(["DOCX", "XLSX", "PPTX", "PDF"]),
        version: z.number().int().positive().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: product, error: pErr } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, title, content, business_type, current_version, workspace_id")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (pErr) mapPgError(pErr);
    if (!product) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    // Nếu chỉ định phiên bản cũ, lấy đúng nội dung bất biến của phiên bản đó.
    let title = (product.title as string) ?? "";
    let content = (product.content as string) ?? "";
    let version = (product.current_version as number) ?? 1;
    let provenance: Array<{ type: string; id: string; title: string; stamp?: string | null }> = [];

    const wanted = data.version ?? version;
    const { data: snap } = await context.supabase
      .from("work_product_versions")
      .select("version, title, content, provenance")
      .eq("work_product_id", data.id)
      .eq("version", wanted)
      .maybeSingle();
    if (snap) {
      version = snap.version as number;
      title = (snap.title as string) ?? title;
      content = (snap.content as string) ?? content;
      provenance = Array.isArray(snap.provenance) ? (snap.provenance as any[]) : [];
    } else if (data.version && data.version !== product.current_version) {
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_VERSION_NOT_FOUND" });
    }

    const { renderOfficeArtifact } = await import("./office-engine.server");
    const { officeFileName } = await import("@/domain/work-products/office-engine");

    let rendered;
    try {
      rendered = await renderOfficeArtifact({
        format: data.format,
        title: title || "Kết quả công việc",
        content,
        businessType: (product.business_type as string) ?? "DOCUMENT",
        version,
        workProductId: data.id,
        provenance,
      });
    } catch (e) {
      throw new ApiError({
        code: "INTERNAL_ERROR",
        message: `OFFICE_RENDER_FAILED: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }

    const fileName = officeFileName(title || "work-product", version, data.format);
    const objectKey = `${product.tenant_id}/${data.id}/v${version}/${Date.now()}-${fileName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from(WP_BUCKET)
      .upload(objectKey, rendered.bytes, { contentType: rendered.mimeType, upsert: false });
    if (upErr) throw new ApiError({ code: "INTERNAL_ERROR", message: `ARTIFACT_UPLOAD_FAILED: ${upErr.message}` });

    // Ghi qua client của người dùng để RLS xác nhận quyền chỉnh sửa.
    const { data: artifact, error: insErr } = await context.supabase
      .from("work_product_artifacts")
      .insert({
        tenant_id: product.tenant_id,
        work_product_id: data.id,
        format: data.format,
        role: "EXPORT",
        storage_ref: objectKey,
        mime_type: rendered.mimeType,
        size_bytes: rendered.bytes.byteLength,
        version,
        generated_by: "SYSTEM",
        created_by: context.userId,
      })
      .select("id, format, role, storage_ref, mime_type, size_bytes, version, generated_by, created_at")
      .single();
    if (insErr) {
      await supabaseAdmin.storage.from(WP_BUCKET).remove([objectKey]);
      mapPgError(insErr);
    }

    return { artifact, engine: rendered.engine, fallbackReason: rendered.fallbackReason ?? null };
  });

/** Link tải tạm thời cho một bản thể hiện (kiểm tra quyền xem qua RLS trước). */
export const getWorkDeliverableArtifactUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ artifactId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: artifact, error } = await context.supabase
      .from("work_product_artifacts")
      .select("id, storage_ref, mime_type")
      .eq("id", data.artifactId)
      .maybeSingle();
    if (error) mapPgError(error);
    if (!artifact?.storage_ref) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "ARTIFACT_NOT_FOUND" });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(WP_BUCKET)
      .createSignedUrl(artifact.storage_ref as string, 300);
    if (sErr || !signed?.signedUrl) {
      throw new ApiError({ code: "INTERNAL_ERROR", message: "ARTIFACT_URL_FAILED" });
    }
    return { url: signed.signedUrl };
  });

/* ------------------------------------------- cài đặt quyền theo tổ chức */

export const WP_SCOPES = ["TENANT", "WORKSPACE", "OWNER"] as const;

export type WorkProductAccessPolicy = {
  tenantId: string;
  viewScope: (typeof WP_SCOPES)[number];
  editScope: (typeof WP_SCOPES)[number];
  adminOverride: boolean;
  canManage: boolean;
  updatedAt: string | null;
};

async function currentTenantId(supabase: any, userId: string): Promise<string> {
  const { resolveTenantId } = await import("./work-deliverables.server");
  const { readActiveTenantCookie } = await import("./active-tenant.server");
  return resolveTenantId(supabase, userId, null, readActiveTenantCookie());
}

async function tenantRoleOf(supabase: any, tenantId: string, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return (data?.role as string) ?? null;
}

export const getWorkProductAccessPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkProductAccessPolicy> => {
    const tenantId = await currentTenantId(context.supabase, context.userId);
    const [{ data: row, error }, role] = await Promise.all([
      context.supabase
        .from("work_product_access_policies")
        .select("view_scope, edit_scope, admin_override, updated_at")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      tenantRoleOf(context.supabase, tenantId, context.userId),
    ]);
    if (error) mapPgError(error);
    return {
      tenantId,
      viewScope: ((row?.view_scope as any) ?? "TENANT") as WorkProductAccessPolicy["viewScope"],
      editScope: ((row?.edit_scope as any) ?? "OWNER") as WorkProductAccessPolicy["editScope"],
      adminOverride: (row?.admin_override as boolean) ?? true,
      canManage: role === "tenant_owner" || role === "tenant_admin",
      updatedAt: (row?.updated_at as string) ?? null,
    };
  });

export const updateWorkProductAccessPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        viewScope: z.enum(WP_SCOPES),
        editScope: z.enum(WP_SCOPES),
        adminOverride: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await currentTenantId(context.supabase, context.userId);
    const role = await tenantRoleOf(context.supabase, tenantId, context.userId);
    if (role !== "tenant_owner" && role !== "tenant_admin") {
      throw new ApiError({ code: "PERMISSION_DENIED", message: "WORK_PRODUCT_POLICY_FORBIDDEN" });
    }
    const { error } = await context.supabase.from("work_product_access_policies").upsert(
      {
        tenant_id: tenantId,
        view_scope: data.viewScope,
        edit_scope: data.editScope,
        admin_override: data.adminOverride,
        updated_by: context.userId,
      },
      { onConflict: "tenant_id" },
    );
    if (error) mapPgError(error);
    return { ok: true as const };
  });
