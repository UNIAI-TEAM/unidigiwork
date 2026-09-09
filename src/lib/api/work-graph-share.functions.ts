// Quản lý liên kết chia sẻ bản đồ công việc (chỉ chủ sở hữu / quản trị tổ chức).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";

async function tenantContext(supabase: any, userId: string) {
  const { resolveTenantId } = await import("./work-deliverables.server");
  const { readActiveTenantCookie } = await import("./active-tenant.server");
  const tenantId = await resolveTenantId(supabase, userId, null, readActiveTenantCookie());
  const { data } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  const role = (data?.role as string) ?? null;
  return { tenantId, role, canManage: role === "tenant_owner" || role === "tenant_admin" };
}

export type WorkGraphShareRow = {
  id: string;
  label: string;
  includeTasks: boolean;
  includeDocuments: boolean;
  expiresAt: string;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  active: boolean;
};

function toRow(r: any): WorkGraphShareRow {
  const expired = new Date(r.expires_at).getTime() < Date.now();
  return {
    id: r.id,
    label: r.label,
    includeTasks: r.include_tasks,
    includeDocuments: r.include_documents,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    viewCount: r.view_count ?? 0,
    lastViewedAt: r.last_viewed_at,
    createdAt: r.created_at,
    active: !r.revoked_at && !expired,
  };
}

export const listWorkGraphShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId, canManage } = await tenantContext(context.supabase, context.userId);
    if (!canManage) return { canManage: false, shares: [] as WorkGraphShareRow[] };
    const { data, error } = await context.supabase
      .from("work_graph_public_shares")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) mapPgError(error);
    return { canManage: true, shares: ((data ?? []) as any[]).map(toRow) };
  });

/** Tạo liên kết xem công khai; mã liên kết chỉ hiển thị một lần. */
export const createWorkGraphShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        label: z.string().trim().min(1).max(120).default("Bản đồ công việc"),
        days: z.number().int().min(1).max(90).default(7),
        includeTasks: z.boolean().default(true),
        includeDocuments: z.boolean().default(true),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, canManage } = await tenantContext(context.supabase, context.userId);
    if (!canManage) throw new Error("WORK_GRAPH_SHARE_FORBIDDEN");
    const { generateShareToken, hashShareToken } = await import("./work-graph-share.server");
    const token = generateShareToken();
    const tokenHash = await hashShareToken(token);
    const expiresAt = new Date(Date.now() + data.days * 86400000).toISOString();
    const { data: row, error } = await context.supabase
      .from("work_graph_public_shares")
      .insert({
        tenant_id: tenantId,
        label: data.label,
        token_hash: tokenHash,
        include_tasks: data.includeTasks,
        include_documents: data.includeDocuments,
        expires_at: expiresAt,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) mapPgError(error);
    return { share: toRow(row), token, path: `/share/work-graph/${token}` };
  });

export const revokeWorkGraphShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId, canManage } = await tenantContext(context.supabase, context.userId);
    if (!canManage) throw new Error("WORK_GRAPH_SHARE_FORBIDDEN");
    const { error } = await context.supabase
      .from("work_graph_public_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) mapPgError(error);
    return { ok: true };
  });

export const deleteWorkGraphShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { tenantId, canManage } = await tenantContext(context.supabase, context.userId);
    if (!canManage) throw new Error("WORK_GRAPH_SHARE_FORBIDDEN");
    const { error } = await context.supabase
      .from("work_graph_public_shares")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) mapPgError(error);
    return { ok: true };
  });
