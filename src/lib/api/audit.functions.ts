// Blueprint §11, §17 — Tenant audit read (append-only, redacted).
// Batch 1B-UI-FINISH: admin-only listing of audit events for the tenant admin console.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { z } from "zod";

export interface TenantAuditEventDto {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  actorId: string | null;
  occurredAt: string;
  source: string | null;
  correlationId: string | null;
  summary: string | null;
}

const Input = z.object({
  tenantId: z.string().uuid(),
  action: z.string().max(120).optional(),
  resourceType: z.string().max(120).optional(),
  actorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().int().min(1).max(500).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(25),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertTenantAdmin(supabase: any, tenantId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
  const role = (data as { role?: string } | null)?.role;
  if (!role) throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
  if (role !== "tenant_owner" && role !== "tenant_admin") {
    throw new ApiError({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED" });
  }
}

export const listTenantAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<{ rows: TenantAuditEventDto[]; total: number }> => {
    const { supabase, userId } = context;
    await assertTenantAdmin(supabase, data.tenantId, userId);

    let q = supabase
      .from("audit_events")
      .select(
        "id, action, event_type, resource_type, aggregate_type, resource_id, aggregate_id, actor_user_id, actor_id, occurred_at, created_at, source, correlation_id, payload",
        { count: "exact" },
      )
      .eq("tenant_id", data.tenantId);

    if (data.action) q = q.eq("action", data.action);
    if (data.resourceType) q = q.eq("resource_type", data.resourceType);
    if (data.actorId) q = q.or(`actor_user_id.eq.${data.actorId},actor_id.eq.${data.actorId}`);
    if (data.from) q = q.gte("occurred_at", data.from);
    if (data.to) q = q.lte("occurred_at", data.to);

    q = q.order("occurred_at", { ascending: false, nullsFirst: false });

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new ApiError({ code: "INTERNAL_ERROR", message: "AUDIT_LIST_FAILED" });

    const list = (rows ?? []) as Array<{
      id: string;
      action: string | null;
      event_type: string | null;
      resource_type: string | null;
      aggregate_type: string | null;
      resource_id: string | null;
      aggregate_id: string | null;
      actor_user_id: string | null;
      actor_id: string | null;
      occurred_at: string | null;
      created_at: string;
      source: string | null;
      correlation_id: string | null;
      payload: unknown;
    }>;

    return {
      rows: list.map((r) => {
        const payload = (r.payload ?? null) as { summary?: string } | null;
        return {
          id: r.id,
          action: r.action ?? r.event_type ?? "unknown",
          resourceType: r.resource_type ?? r.aggregate_type ?? null,
          resourceId: r.resource_id ?? r.aggregate_id ?? null,
          actorId: r.actor_user_id ?? r.actor_id ?? null,
          occurredAt: r.occurred_at ?? r.created_at,
          source: r.source ?? null,
          correlationId: r.correlation_id ?? null,
          // Redaction: expose only a short summary. Never surface raw before/after JSON.
          summary: typeof payload?.summary === "string" ? payload.summary.slice(0, 240) : null,
        };
      }),
      total: count ?? list.length,
    };
  });