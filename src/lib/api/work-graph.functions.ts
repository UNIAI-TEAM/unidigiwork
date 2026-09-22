// Work Graph Foundation V1 — trusted API surface.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";
import { resolveWorkEntities, entityKey } from "./work-graph.server";
import { workEntityHref } from "@/domain/work-graph/route-resolver";
import {
  WORK_ENTITY_TYPES,
  WORK_RELATIONSHIP_CODES,
  isRelationshipAllowed,
} from "@/domain/work-graph/relationship-types";

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
            context.supabase
              .from("tasks")
              .select("id,title,status")
              .ilike("title", term)
              .is("deleted_at", null)
              .limit(data.limit)
              .then(({ data: rows }) => push("TASK", rows, "title", "status")),
          );
          break;
        case "WORKSPACE":
          jobs.push(
            context.supabase
              .from("workspaces")
              .select("id,name")
              .ilike("name", term)
              .limit(data.limit)
              .then(({ data: rows }) => push("WORKSPACE", rows, "name")),
          );
          break;
        case "MEETING":
          jobs.push(
            context.supabase
              .from("meetings")
              .select("id,title,start_at")
              .ilike("title", term)
              .limit(data.limit)
              .then(({ data: rows }) => push("MEETING", rows, "title", "start_at")),
          );
          break;
        case "DOCUMENT":
          jobs.push(
            context.supabase
              .from("documents")
              .select("id,title,folder")
              .ilike("title", term)
              .is("deleted_at", null)
              .limit(data.limit)
              .then(({ data: rows }) => push("DOCUMENT", rows, "title", "folder")),
          );
          break;
        case "EMAIL":
          jobs.push(
            context.supabase
              .from("email_threads")
              .select("id,subject")
              .ilike("subject", term)
              .is("deleted_at", null)
              .limit(data.limit)
              .then(({ data: rows }) => push("EMAIL", rows, "subject")),
          );
          break;
        case "CHAT_CHANNEL":
          jobs.push(
            context.supabase
              .from("chat_channels")
              .select("id,name")
              .ilike("name", term)
              .is("deleted_at", null)
              .limit(data.limit)
              .then(({ data: rows }) => push("CHAT_CHANNEL", rows, "name")),
          );
          break;
        case "WORK_PRODUCT":
          jobs.push(
            context.supabase
              .from("work_products")
              .select("id,title,status")
              .ilike("title", term)
              .is("deleted_at", null)
              .limit(data.limit)
              .then(({ data: rows }) => push("WORK_PRODUCT", rows, "title", "status")),
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
      data.type === "MEETING"
        ? "start_at"
        : data.type === "MEETING_ARTIFACT"
          ? "created_at"
          : "updated_at";

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
      title: (r.title as string) ?? ARTIFACT_LABEL[r.kind] ?? "(Không tiêu đề)",
      subtitle:
        data.type === "MEETING_ARTIFACT"
          ? (ARTIFACT_LABEL[r.kind] ?? r.kind ?? null)
          : data.type === "MEETING"
            ? r.start_at
              ? new Date(r.start_at).toLocaleString("vi-VN")
              : (r.status ?? null)
            : data.type === "TASK"
              ? (r.status ?? null)
              : null,
    }));
  });

/* ---------------- Trang Work Graph: bảng tổng hợp theo trạng thái ---------------- */

export type WorkGraphBoardItem = {
  type: "TASK" | "EXECUTION" | "WORK_PRODUCT";
  id: string;
  title: string;
  status: string | null;
  href: string;
  updatedAt: string | null;
  links: number;
  /** Tiến độ 0–100, suy ra từ bước thực thi thật hoặc trạng thái nguồn. */
  progress: number;
  /** Hạn hoàn thành (nếu nguồn có) — UI tính thời gian còn lại. */
  dueAt: string | null;
  completedSteps: number;
  totalSteps: number;
  ownerId: string | null;
  ownerName: string | null;
  /** Tổng bình luận nhóm và tin nhắn AI trong các hội thoại gắn task. */
  interactionCount: number;
  lastInteractionAt: string | null;
};

export type WorkGraphBoard = {
  items: WorkGraphBoardItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: { all: number; running: number; done: number; products: number };
};

export type WorkGraphAssignee = {
  id: string;
  name: string;
};

export const listWorkGraphAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkGraphAssignee[]> => {
    const tenantId = await currentTenantId(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("list_tenant_member_profiles", {
      _tenant_id: tenantId,
    });
    if (error) mapPgError(error, "TENANT_ACCESS_DENIED");
    return (
      (data ?? []) as Array<{
        id: string;
        display_name: string | null;
        primary_email: string | null;
      }>
    )
      .map((person) => ({
        id: person.id,
        name: person.display_name || person.primary_email || "—",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  });

/**
 * Bảng Work Graph của tổ chức: công việc, lượt thực thi và kết quả công việc
 * đã được chiếu vào graph. Truy vấn tenant-scoped phân trang ngay tại nguồn;
 * quyền RLS loại bỏ thực thể người gọi không được xem.
 */
export const listWorkGraphBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        tab: z.enum(["all", "running", "done", "products"]).default("all"),
        search: z.string().max(200).default(""),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(100).default(25),
        taskId: z.string().uuid().optional(),
        assigneeId: z.string().uuid().optional(),
        unassigned: z.boolean().default(false),
        dueFilter: z.enum(["all", "overdue", "due_soon", "scheduled", "none"]).default("all"),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<WorkGraphBoard> => {
    const empty: WorkGraphBoard = {
      items: [],
      total: 0,
      page: data.page,
      pageSize: data.pageSize,
      counts: { all: 0, running: 0, done: 0, products: 0 },
    };
    const tenantId = await currentTenantId(context.supabase, context.userId);
    const { data: payload, error } = await context.supabase.rpc("list_work_graph_board_page", {
      _tenant_id: tenantId,
      _tab: data.tab,
      _search: data.search || undefined,
      _assignee_id: data.assigneeId,
      _unassigned: data.unassigned,
      _due_filter: data.dueFilter,
      _task_id: data.taskId,
      _limit: data.pageSize,
      _offset: (data.page - 1) * data.pageSize,
    });
    if (error) mapPgError(error);
    const result = (payload ?? {}) as {
      items?: Array<{
        node_id: string;
        entity_type: WorkGraphBoardItem["type"];
        entity_id: string;
        title: string;
        status: string | null;
        updated_at: string | null;
        due_at: string | null;
        owner_id: string | null;
        progress: number;
        completed_steps: number;
        total_steps: number;
        links: number;
        interaction_count: number;
        last_interaction_at: string | null;
      }>;
      total?: number;
      counts?: { all?: number; running?: number; done?: number; products?: number };
    };
    const list = result.items ?? [];
    const counts = {
      all: Number(result.counts?.all ?? 0),
      running: Number(result.counts?.running ?? 0),
      done: Number(result.counts?.done ?? 0),
      products: Number(result.counts?.products ?? 0),
    };
    if (!list.length)
      return {
        ...empty,
        total: Number(result.total ?? 0),
        counts,
      };

    const ownerIds = Array.from(
      new Set(list.map((row) => row.owner_id).filter((id): id is string => Boolean(id))),
    );
    const { data: memberRows, error: memberError } = ownerIds.length
      ? await context.supabase.rpc("list_tenant_member_profiles", { _tenant_id: tenantId })
      : { data: [], error: null };
    if (memberError) mapPgError(memberError);
    const ownerNames = new Map(
      (
        (memberRows ?? []) as Array<{
          id: string;
          display_name: string | null;
          primary_email: string | null;
        }>
      ).map((person) => [person.id, person.display_name || person.primary_email || "—"]),
    );

    const items: WorkGraphBoardItem[] = list.map((row) => ({
      type: row.entity_type,
      id: row.entity_id,
      title: row.title,
      status: row.status,
      href: workEntityHref(row.entity_type, row.entity_id),
      updatedAt: row.updated_at,
      links: Number(row.links ?? 0),
      progress: Number(row.progress ?? 0),
      dueAt: row.due_at,
      completedSteps: Number(row.completed_steps ?? 0),
      totalSteps: Number(row.total_steps ?? 0),
      ownerId: row.owner_id,
      ownerName: row.owner_id ? (ownerNames.get(row.owner_id) ?? "—") : null,
      interactionCount: Number(row.interaction_count ?? 0),
      lastInteractionAt: row.last_interaction_at,
    }));

    return {
      items,
      total: Number(result.total ?? 0),
      page: data.page,
      pageSize: data.pageSize,
      counts,
    };
  });
