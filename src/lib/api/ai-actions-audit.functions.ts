// AI ACTION LAYER V1 — Audit & Outbox console (admin, read-only).
// Hiển thị các đề xuất AI đã xác nhận/thực thi cùng audit trail và sự kiện outbox liên quan.
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";

export interface AiActionAuditRow {
  id: string;
  actionType: string;
  status: string;
  risk: string | null;
  source: string | null;
  title: string | null;
  userId: string;
  actorName: string;
  tenantId: string | null;
  workspaceId: string | null;
  entityType: string | null;
  entityId: string | null;
  href: string | null;
  errorCode: string | null;
  createdAt: string;
  confirmedAt: string | null;
  executedAt: string | null;
  auditCount: number;
  outboxCount: number;
}

export interface AiActionAuditDetail {
  action: AiActionAuditRow & { payload: unknown; message: string | null };
  auditEvents: Array<{
    id: string;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    source: string | null;
    correlationId: string | null;
    occurredAt: string;
  }>;
  outboxEvents: Array<{
    id: string;
    eventType: string;
    status: string;
    attemptCount: number;
    lastError: string | null;
    occurredAt: string;
    processedAt: string | null;
    deliveries: Array<{
      id: string;
      channel: string;
      target: string | null;
      status: string;
      httpStatus: number | null;
      error: string | null;
      createdAt: string | null;
    }>;
  }>;
}

const forbidden = () => new ApiError({ code: "PERMISSION_DENIED" as never, message: "Bạn không có quyền xem nhật ký này." });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string): Promise<void> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw forbidden();
}

const ListInput = z.object({
  status: z.enum(["all", "SUCCEEDED", "FAILED", "EXECUTING", "CANCELLED", "EXPIRED"]).default("all"),
  actionType: z.string().max(60).optional(),
  search: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).max(5000).default(0),
});

export const listAiActionAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListInput.parse(i ?? {}))
  .handler(async ({ data, context }): Promise<{ rows: AiActionAuditRow[]; total: number }> => {
    await assertAdmin(context.supabase, context.userId);
    const tenantId = getCookie(ACTIVE_TENANT_COOKIE) ?? null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("ai_action_proposals")
      .select("*", { count: "exact" })
      // Chỉ hiển thị đề xuất đã đi qua bước xác nhận của người dùng.
      .not("confirmed_at", "is", null);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.actionType) q = q.eq("action_type", data.actionType);
    if (data.search) q = q.ilike("title", `%${data.search}%`);

    const { data: rows, count, error } = await q
      .order("confirmed_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new ApiError({ code: "INTERNAL_ERROR" as never, message: "Không tải được nhật ký AI action." });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (rows ?? []) as any[];
    const entityIds = list.map((r) => (r.result?.entityId as string) ?? r.target_id).filter(Boolean) as string[];
    const userIds = [...new Set(list.map((r) => r.user_id as string))];

    const [{ data: profiles }, { data: audits }, { data: outbox }] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, display_name, email").in("id", userIds)
        : Promise.resolve({ data: [] as never[] }),
      entityIds.length
        ? supabaseAdmin.from("audit_events").select("resource_id").in("resource_id", entityIds)
        : Promise.resolve({ data: [] as never[] }),
      entityIds.length
        ? supabaseAdmin.from("outbox_events").select("aggregate_id").in("aggregate_id", entityIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameOf = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name || p.email || "Người dùng"]));
    const tally = (arr: unknown[] | null, key: string) => {
      const m = new Map<string, number>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (arr ?? []) as any[]) {
        const id = r[key] as string | null;
        if (id) m.set(id, (m.get(id) ?? 0) + 1);
      }
      return m;
    };
    const auditMap = tally(audits, "resource_id");
    const outboxMap = tally(outbox, "aggregate_id");

    return {
      total: count ?? list.length,
      rows: list.map((r) => {
        const entityId = (r.result?.entityId as string) ?? r.target_id ?? null;
        return {
          id: r.id,
          actionType: r.action_type,
          status: r.status,
          risk: r.risk ?? null,
          source: r.source ?? null,
          title: r.title ?? null,
          userId: r.user_id,
          actorName: nameOf.get(r.user_id) ?? "Người dùng",
          tenantId: r.tenant_id ?? null,
          workspaceId: r.workspace_id ?? null,
          entityType: (r.result?.entityType as string) ?? r.target_type ?? null,
          entityId,
          href: (r.result?.href as string) ?? null,
          errorCode: r.error_code ?? null,
          createdAt: r.created_at,
          confirmedAt: r.confirmed_at ?? null,
          executedAt: r.executed_at ?? null,
          auditCount: entityId ? (auditMap.get(entityId) ?? 0) : 0,
          outboxCount: entityId ? (outboxMap.get(entityId) ?? 0) : 0,
        };
      }),
    };
  });

export const getAiActionAuditDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ actionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AiActionAuditDetail> => {
    await assertAdmin(context.supabase, context.userId);
    const tenantId = getCookie(ACTIVE_TENANT_COOKIE) ?? null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin.from("ai_action_proposals").select("*").eq("id", data.actionId).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    if (!r) throw new ApiError({ code: "NOT_FOUND" as never, message: "Không tìm thấy hành động." });
    if (tenantId && r.tenant_id && r.tenant_id !== tenantId) throw forbidden();

    const entityId = (r.result?.entityId as string) ?? r.target_id ?? null;
    const [{ data: profile }, { data: audits }, { data: outbox }] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name, email").eq("id", r.user_id).maybeSingle(),
      entityId
        ? supabaseAdmin
            .from("audit_events")
            .select("id, action, event_type, resource_type, aggregate_type, resource_id, source, correlation_id, occurred_at, created_at")
            .eq("resource_id", entityId)
            .order("occurred_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as never[] }),
      entityId
        ? supabaseAdmin
            .from("outbox_events")
            .select("id, event_type, status, attempt_count, last_error, occurred_at, processed_at")
            .eq("aggregate_id", entityId)
            .order("occurred_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outboxRows = (outbox ?? []) as any[];
    const { data: deliveries } = outboxRows.length
      ? await supabaseAdmin
          .from("outbox_deliveries")
          .select("id, event_id, channel, target, status, http_status, error, created_at")
          .in("event_id", outboxRows.map((o) => o.id as string))
      : { data: [] as never[] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prof = profile as any;
    return {
      action: {
        id: r.id,
        actionType: r.action_type,
        status: r.status,
        risk: r.risk ?? null,
        source: r.source ?? null,
        title: r.title ?? null,
        userId: r.user_id,
        actorName: prof?.display_name || prof?.email || "Người dùng",
        tenantId: r.tenant_id ?? null,
        workspaceId: r.workspace_id ?? null,
        entityType: (r.result?.entityType as string) ?? r.target_type ?? null,
        entityId,
        href: (r.result?.href as string) ?? null,
        errorCode: r.error_code ?? null,
        createdAt: r.created_at,
        confirmedAt: r.confirmed_at ?? null,
        executedAt: r.executed_at ?? null,
        auditCount: (audits ?? []).length,
        outboxCount: outboxRows.length,
        payload: r.payload ?? null,
        message: (r.result?.message as string) ?? null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      auditEvents: ((audits ?? []) as any[]).map((a) => ({
        id: a.id,
        action: a.action ?? a.event_type ?? "unknown",
        resourceType: a.resource_type ?? a.aggregate_type ?? null,
        resourceId: a.resource_id ?? null,
        source: a.source ?? null,
        correlationId: a.correlation_id ?? null,
        occurredAt: a.occurred_at ?? a.created_at,
      })),
      outboxEvents: outboxRows.map((o) => ({
        id: o.id,
        eventType: o.event_type,
        status: o.status,
        attemptCount: o.attempt_count ?? 0,
        lastError: o.last_error ?? null,
        occurredAt: o.occurred_at,
        processedAt: o.processed_at ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        deliveries: ((deliveries ?? []) as any[])
          .filter((d) => d.event_id === o.id)
          .map((d) => ({
            id: d.id,
            channel: d.channel,
            target: d.target ?? null,
            status: d.status,
            httpStatus: d.http_status ?? null,
            error: d.error ?? null,
            createdAt: d.created_at ?? null,
          })),
      })),
    };
  });
