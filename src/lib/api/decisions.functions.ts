// Duyệt Quyết định — chỉ quyết định/liên kết đã người xác nhận mới lên sơ đồ công việc.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";

export type DecisionStatus = "CANDIDATE" | "CONFIRMED" | "REJECTED" | "SUPERSEDED";
export type DecisionLinkStatus = "CANDIDATE" | "CONFIRMED" | "REJECTED";

export interface DecisionRow {
  id: string;
  title: string;
  detail: string | null;
  status: DecisionStatus;
  origin: string;
  sourceType: string | null;
  sourceId: string | null;
  sourceRef: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  decidedAt: string | null;
  confirmedAt: string | null;
  updatedAt: string | null;
  linkCount: number;
  confirmedLinkCount: number;
}

export interface DecisionLinkRow {
  id: string;
  decisionId: string;
  sourceType: "MEETING_ARTIFACT" | "TASK" | "WORK_PRODUCT";
  sourceId: string;
  status: DecisionLinkStatus;
  title: string;
  subtitle: string | null;
  createdAt: string | null;
}

async function currentTenantId(supabase: any, userId: string): Promise<string> {
  const { resolveTenantId } = await import("./work-deliverables.server");
  const { readActiveTenantCookie } = await import("./active-tenant.server");
  return resolveTenantId(supabase, userId, null, readActiveTenantCookie());
}

/** Danh sách quyết định của tổ chức đang hoạt động. */
export const listDecisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        status: z.enum(["ALL", "CANDIDATE", "CONFIRMED", "REJECTED", "SUPERSEDED"]).default("CANDIDATE"),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<DecisionRow[]> => {
    const tenantId = await currentTenantId(context.supabase, context.userId);
    let q = context.supabase
      .from("decisions")
      .select(
        "id,title,detail,status,origin,source_type,source_id,source_ref,workspace_id,decided_at,confirmed_at,updated_at",
      )
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "ALL") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    const list = rows ?? [];
    if (!list.length) return [];

    const ids = list.map((r: any) => r.id);
    const wsIds = [...new Set(list.map((r: any) => r.workspace_id).filter(Boolean))] as string[];
    const [{ data: links }, { data: spaces }] = await Promise.all([
      context.supabase.from("decision_links").select("decision_id,status").in("decision_id", ids),
      wsIds.length
        ? context.supabase.from("workspaces").select("id,name").in("id", wsIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const wsById = new Map((spaces ?? []).map((w: any) => [w.id, w.name as string]));
    const counts = new Map<string, { all: number; confirmed: number }>();
    for (const l of links ?? []) {
      const c = counts.get(l.decision_id) ?? { all: 0, confirmed: 0 };
      c.all += 1;
      if (l.status === "CONFIRMED") c.confirmed += 1;
      counts.set(l.decision_id, c);
    }

    return list.map((r: any) => ({
      id: r.id,
      title: r.title ?? "Quyết định",
      detail: r.detail ?? null,
      status: r.status,
      origin: r.origin,
      sourceType: r.source_type ?? null,
      sourceId: r.source_id ?? null,
      sourceRef: r.source_ref ?? null,
      workspaceId: r.workspace_id ?? null,
      workspaceName: r.workspace_id ? (wsById.get(r.workspace_id) ?? null) : null,
      decidedAt: r.decided_at ?? null,
      confirmedAt: r.confirmed_at ?? null,
      updatedAt: r.updated_at ?? null,
      linkCount: counts.get(r.id)?.all ?? 0,
      confirmedLinkCount: counts.get(r.id)?.confirmed ?? 0,
    }));
  });

/** Các liên kết của một quyết định, kèm tên đối tượng nguồn. */
export const listDecisionLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ decisionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<DecisionLinkRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("decision_links")
      .select("id,decision_id,source_type,source_id,status,created_at")
      .eq("decision_id", data.decisionId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) mapPgError(error);
    const list = rows ?? [];
    if (!list.length) return [];

    const { resolveWorkEntities } = await import("./work-graph.server");
    const resolved = await resolveWorkEntities(
      context.supabase,
      list.map((l: any) => ({ type: l.source_type, id: l.source_id })),
    );
    return list.map((l: any) => {
      const r = resolved.get(`${l.source_type}:${l.source_id}`);
      return {
        id: l.id,
        decisionId: l.decision_id,
        sourceType: l.source_type,
        sourceId: l.source_id,
        status: l.status,
        title: r?.title ?? "Không truy cập được",
        subtitle: r?.subtitle ?? null,
        createdAt: l.created_at ?? null,
      };
    });
  });

function stringifySnapshot(raw: unknown): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out[k] = v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
    }
  }
  return out;
}

export interface DecisionRevisionRow {
  id: string;
  decisionId: string;
  decisionTitle: string;
  currentStatus: DecisionStatus;
  rowVersion: number;
  changeKind: "CREATED" | "UPDATED";
  changedFields: string[];
  snapshot: Record<string, string | null>;
  changedByName: string | null;
  changedAt: string;
  isCurrent: boolean;
}

/** Lịch sử phiên bản quyết định theo tổ chức (append-only, chỉ đọc). */
export const listDecisionRevisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        decisionId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(300).default(200),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<DecisionRevisionRow[]> => {
    const tenantId = await currentTenantId(context.supabase, context.userId);
    let q = context.supabase
      .from("decision_revisions")
      .select("id,decision_id,row_version,change_kind,changed_fields,snapshot,changed_by,changed_at")
      .eq("tenant_id", tenantId)
      .order("changed_at", { ascending: false })
      .limit(data.limit);
    if (data.decisionId) q = q.eq("decision_id", data.decisionId);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    const list = rows ?? [];
    if (!list.length) return [];

    const decisionIds = [...new Set(list.map((r: any) => r.decision_id))];
    const userIds = [...new Set(list.map((r: any) => r.changed_by).filter(Boolean))] as string[];
    const [{ data: decisions }, { data: people }] = await Promise.all([
      context.supabase.from("decisions").select("id,title,status,row_version").in("id", decisionIds),
      userIds.length
        ? context.supabase.from("profiles").select("id,display_name").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const dById = new Map((decisions ?? []).map((d: any) => [d.id, d]));
    const nameById = new Map((people ?? []).map((p: any) => [p.id, p.display_name as string]));

    return list.map((r: any) => {
      const d = dById.get(r.decision_id);
      return {
        id: r.id,
        decisionId: r.decision_id,
        decisionTitle: d?.title ?? "Quyết định",
        currentStatus: (d?.status ?? "CANDIDATE") as DecisionStatus,
        rowVersion: r.row_version,
        changeKind: r.change_kind,
        changedFields: r.changed_fields ?? [],
        snapshot: stringifySnapshot(r.snapshot),
        changedByName: r.changed_by ? (nameById.get(r.changed_by) ?? null) : null,
        changedAt: r.changed_at,
        isCurrent: d ? d.row_version === r.row_version : false,
      };
    });
  });


/** Xác nhận / từ chối một quyết định (RPC kiểm tra quyền theo tổ chức). */
export const setDecisionConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ decisionId: z.string().uuid(), confirm: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("confirm_decision", {
      _decision_id: data.decisionId,
      _confirm: data.confirm,
    });
    if (error) mapPgError(error);
    return row as { id: string; status: DecisionStatus };
  });

/** Xác nhận / từ chối một liên kết quyết định ↔ việc cần làm. */
export const setDecisionLinkConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ linkId: z.string().uuid(), confirm: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("confirm_decision_link", {
      _link_id: data.linkId,
      _confirm: data.confirm,
    });
    if (error) mapPgError(error);
    return row as { id: string; status: DecisionLinkStatus };
  });

/** Đánh dấu quyết định đã bị thay thế bởi một quyết định khác. */
export const supersedeDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ decisionId: z.string().uuid(), supersededBy: z.string().uuid().nullable().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("decisions")
      .update({
        status: "SUPERSEDED",
        superseded_by: data.supersededBy ?? null,
        updated_by: context.userId,
      })
      .eq("id", data.decisionId);
    if (error) mapPgError(error);
    return { ok: true };
  });

/** Tìm việc cần làm trong tổ chức để nối vào quyết định. */
export const searchTasksForDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ query: z.string().max(120).default("") }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const tenantId = await currentTenantId(context.supabase, context.userId);
    let q = context.supabase
      .from("tasks")
      .select("id,title,status,updated_at")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (data.query.trim()) q = q.ilike("title", `%${data.query.trim()}%`);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      title: (r.title as string) ?? "Công việc",
      status: (r.status as string) ?? null,
    }));
  });

/** Nối quyết định với một việc cần làm; mặc định ở trạng thái chờ xác nhận. */
export const linkDecisionToTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ decisionId: z.string().uuid(), taskId: z.string().uuid(), confirm: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: decision, error: dErr } = await context.supabase
      .from("decisions")
      .select("id,tenant_id")
      .eq("id", data.decisionId)
      .maybeSingle();
    if (dErr) mapPgError(dErr);
    if (!decision) mapPgError(new Error("RESOURCE_NOT_FOUND"), "RESOURCE_NOT_FOUND");

    const { data: existing } = await context.supabase
      .from("decision_links")
      .select("id")
      .eq("decision_id", data.decisionId)
      .eq("source_type", "TASK")
      .eq("source_id", data.taskId)
      .maybeSingle();

    let linkId = existing?.id as string | undefined;
    if (!linkId) {
      const { data: inserted, error } = await context.supabase
        .from("decision_links")
        .insert({
          tenant_id: (decision as any).tenant_id,
          decision_id: data.decisionId,
          source_type: "TASK",
          source_id: data.taskId,
          relationship: "REALIZED_AS",
          status: "CANDIDATE",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) mapPgError(error);
      linkId = inserted!.id as string;
    }

    if (data.confirm && linkId) {
      const { error } = await context.supabase.rpc("confirm_decision_link", {
        _link_id: linkId,
        _confirm: true,
      });
      if (error) mapPgError(error);
    }
    return { linkId };
  });

/** Tạo quyết định thủ công (luôn ở trạng thái chờ xác nhận — không tự lên sơ đồ). */
export const createDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        title: z.string().min(1).max(200),
        detail: z.string().max(4000).nullish(),
        workspaceId: z.string().uuid().nullish(),
        decidedAt: z.string().datetime().nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const tenantId = await currentTenantId(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("decisions")
      .insert({
        tenant_id: tenantId,
        workspace_id: data.workspaceId ?? null,
        title: data.title.trim(),
        detail: data.detail?.trim() || null,
        status: "CANDIDATE",
        origin: "MANUAL",
        source_type: "MANUAL",
        decided_at: data.decidedAt ?? new Date().toISOString(),
        decided_by: context.userId,
        created_by: context.userId,
        updated_by: context.userId,
        evidence: { enteredBy: context.userId, channel: "DECISION_REVIEW_UI" },
      })
      .select("id")
      .single();
    if (error) mapPgError(error);
    return { id: (row as any).id as string };
  });
