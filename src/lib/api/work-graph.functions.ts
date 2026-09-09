// Work Graph Foundation V1 — trusted API surface.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";
import { resolveWorkEntities, entityKey } from "./work-graph.server";
import { WORK_ENTITY_TYPES, WORK_RELATIONSHIP_CODES, isRelationshipAllowed } from "@/domain/work-graph/relationship-types";

const entityTypeSchema = z.enum(WORK_ENTITY_TYPES);
const relationshipSchema = z.enum(WORK_RELATIONSHIP_CODES);

export const getWorkContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        entityType: entityTypeSchema,
        entityId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: raw, error } = await context.supabase.rpc("get_work_context", {
      _entity_type: data.entityType,
      _entity_id: data.entityId,
      _limit: data.limit,
    });
    if (error) mapPgError(error, "WORK_GRAPH_ENTITY_FORBIDDEN");

    const payload = (raw ?? {}) as {
      relationships?: {
        edgeId: string;
        type: string;
        direction: "IN" | "OUT";
        origin: string;
        entityType: string;
        entityId: string;
        createdAt: string;
      }[];
    };
    const rels = payload.relationships ?? [];
    // Batched, permission-aware resolution — anything invisible is dropped.
    const resolved = await resolveWorkEntities(
      context.supabase,
      rels.map((r) => ({ type: r.entityType, id: r.entityId })),
    );

    const items = rels
      .map((r) => {
        const target = resolved.get(entityKey(r.entityType, r.entityId));
        if (!target) return null;
        return {
          edgeId: r.edgeId,
          relationship: r.type,
          direction: r.direction,
          origin: r.origin,
          canUnlink: r.origin === "USER",
          entity: target,
          createdAt: r.createdAt,
        };
      })
      .filter(Boolean);

    return {
      entity: { type: data.entityType, id: data.entityId },
      relationships: items as NonNullable<(typeof items)[number]>[],
    };
  });

export const linkWorkEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        sourceType: entityTypeSchema,
        sourceId: z.string().uuid(),
        targetType: entityTypeSchema,
        targetId: z.string().uuid(),
        relationship: relationshipSchema,
      })
      .refine((v) => isRelationshipAllowed(v.relationship, v.sourceType, v.targetType, true), {
        message: "WORK_GRAPH_RELATION_INVALID",
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("link_work_entities", {
      _source_type: data.sourceType,
      _source_id: data.sourceId,
      _target_type: data.targetType,
      _target_id: data.targetId,
      _relationship: data.relationship,
      _metadata: {},
    });
    if (error) mapPgError(error, "WORK_GRAPH_RELATION_INVALID");
    return res as { edgeId: string; created: boolean };
  });

export const unlinkWorkEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ edgeId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("unlink_work_entities", {
      _edge_id: data.edgeId,
    });
    if (error) mapPgError(error, "WORK_GRAPH_EDGE_PROTECTED");
    return res as { deleted: boolean };
  });

/** Permission-aware, tenant-scoped picker search. Bounded per entity type. */
export const searchLinkableEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        query: z.string().min(2).max(120),
        types: z.array(entityTypeSchema).min(1).max(6),
        limit: z.number().int().min(1).max(20).default(10),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const term = `%${data.query.replace(/[%_]/g, "")}%`;
    const results: { type: string; id: string; title: string; subtitle: string | null }[] = [];

    const push = (type: string, rows: any[] | null, titleKey: string, subKey?: string) => {
      (rows ?? []).forEach((r) =>
        results.push({
          type,
          id: r.id,
          title: r[titleKey] ?? "(Không tiêu đề)",
          subtitle: subKey ? (r[subKey] ?? null) : null,
        }),
      );
    };

    const jobs: PromiseLike<void>[] = [];
    for (const t of data.types) {
      switch (t) {
        case "TASK":
          jobs.push(
            context.supabase.from("tasks").select("id,title,status").ilike("title", term)
              .is("deleted_at", null).limit(data.limit)
              .then(({ data: rows }) => push("TASK", rows, "title", "status")),
          );
          break;
        case "WORKSPACE":
          jobs.push(
            context.supabase.from("workspaces").select("id,name").ilike("name", term).limit(data.limit)
              .then(({ data: rows }) => push("WORKSPACE", rows, "name")),
          );
          break;
        case "MEETING":
          jobs.push(
            context.supabase.from("meetings").select("id,title,start_at").ilike("title", term).limit(data.limit)
              .then(({ data: rows }) => push("MEETING", rows, "title", "start_at")),
          );
          break;
        case "DOCUMENT":
          jobs.push(
            context.supabase.from("documents").select("id,title,folder").ilike("title", term)
              .is("deleted_at", null).limit(data.limit)
              .then(({ data: rows }) => push("DOCUMENT", rows, "title", "folder")),
          );
          break;
        case "EMAIL":
          jobs.push(
            context.supabase.from("email_threads").select("id,subject").ilike("subject", term)
              .is("deleted_at", null).limit(data.limit)
              .then(({ data: rows }) => push("EMAIL", rows, "subject")),
          );
          break;
        case "CHAT_CHANNEL":
          jobs.push(
            context.supabase.from("chat_channels").select("id,name").ilike("name", term)
              .is("deleted_at", null).limit(data.limit)
              .then(({ data: rows }) => push("CHAT_CHANNEL", rows, "name")),
          );
          break;
        default:
          break;
      }
    }
    await Promise.all(jobs);
    return results.slice(0, data.limit * data.types.length);
  });
/* ---------------- Bản đồ công việc của tổ chức: thống kê & dựng lại ---------------- */

async function currentTenantId(supabase: any, userId: string): Promise<string> {
  const { resolveTenantId } = await import("./work-deliverables.server");
  const { readActiveTenantCookie } = await import("./active-tenant.server");
  return resolveTenantId(supabase, userId, null, readActiveTenantCookie());
}

async function tenantRoleOf(supabase: any, tenantId: string, userId: string) {
  const { data } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return (data?.role as string) ?? null;
}

export type WorkGraphOverview = {
  tenantId: string;
  canRebuild: boolean;
  nodes: number;
  edges: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
};

/** Thống kê bản đồ công việc của tổ chức đang hoạt động. */
export const getWorkGraphOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkGraphOverview> => {
    const tenantId = await currentTenantId(context.supabase, context.userId);
    const [{ data, error }, role] = await Promise.all([
      context.supabase.rpc("tenant_work_graph_stats", { _tenant_id: tenantId }),
      tenantRoleOf(context.supabase, tenantId, context.userId),
    ]);
    if (error) mapPgError(error);
    const s = (data ?? {}) as any;
    return {
      tenantId,
      canRebuild: role === "tenant_owner" || role === "tenant_admin",
      nodes: Number(s.nodes ?? 0),
      edges: Number(s.edges ?? 0),
      nodesByType: (s.nodesByType ?? {}) as Record<string, number>,
      edgesByType: (s.edgesByType ?? {}) as Record<string, number>,
    };
  });

/** Dựng lại bản đồ công việc thật cho tổ chức hiện tại (chủ sở hữu/quản trị). */
export const rebuildWorkGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await currentTenantId(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("rebuild_tenant_work_graph", {
      _tenant_id: tenantId,
    });
    if (error) mapPgError(error);
    const s = (data ?? {}) as any;
    return {
      nodesAdded: Number(s.nodesAdded ?? 0),
      edgesAdded: Number(s.edgesAdded ?? 0),
      nodes: Number(s.nodesAfter ?? 0),
      edges: Number(s.edgesAfter ?? 0),
    };
  });

const ARTIFACT_LABEL: Record<string, string> = {
  SUMMARY: "Tóm tắt cuộc họp",
  DECISION: "Quyết định",
  ACTION_ITEM: "Việc cần làm",
  RISK: "Rủi ro",
  OPEN_QUESTION: "Câu hỏi mở",
  FOLLOW_UP: "Thư theo dõi",
};

export type WorkGraphTarget = {
  type: "TASK" | "MEETING" | "MEETING_ARTIFACT" | "DOCUMENT";
  id: string;
  title: string;
  subtitle: string | null;
};

/**
 * Duyệt nhanh công việc / cuộc họp / quyết định / tài liệu gần đây để liên kết.
 * Không bắt buộc từ khóa; RLS theo phiên người dùng đảm bảo đúng tổ chức.
 */
export const listWorkGraphTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        type: z.enum(["TASK", "MEETING", "MEETING_ARTIFACT", "DOCUMENT"]),
        q: z.string().max(120).default(""),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<WorkGraphTarget[]> => {
    const tenantId = await currentTenantId(context.supabase, context.userId);
    const term = data.q.trim();
    const like = `%${term.replace(/[%_]/g, "")}%`;

    const table =
      data.type === "TASK"
        ? "tasks"
        : data.type === "MEETING"
          ? "meetings"
          : data.type === "MEETING_ARTIFACT"
            ? "meeting_artifacts"
            : "documents";
    const columns =
      data.type === "TASK"
        ? "id, title, status, updated_at"
        : data.type === "MEETING"
          ? "id, title, status, start_at"
          : data.type === "MEETING_ARTIFACT"
            ? "id, title, kind, created_at"
            : "id, title, updated_at";
    const orderCol =
      data.type === "MEETING" ? "start_at" : data.type === "MEETING_ARTIFACT" ? "created_at" : "updated_at";

    let q = context.supabase
      .from(table)
      .select(columns)
      .eq("tenant_id", tenantId)
      .order(orderCol, { ascending: false })
      .limit(data.limit);
    if (term) q = q.ilike("title", like);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);

    return ((rows ?? []) as any[]).map((r) => ({
      type: data.type,
      id: r.id as string,
      title: (r.title as string) ?? (ARTIFACT_LABEL[r.kind] ?? "(Không tiêu đề)"),
      subtitle:
        data.type === "MEETING_ARTIFACT"
          ? (ARTIFACT_LABEL[r.kind] ?? r.kind ?? null)
          : data.type === "MEETING"
            ? (r.start_at ? new Date(r.start_at).toLocaleString("vi-VN") : (r.status ?? null))
            : data.type === "TASK"
              ? (r.status ?? null)
              : null,
    }));
  });
