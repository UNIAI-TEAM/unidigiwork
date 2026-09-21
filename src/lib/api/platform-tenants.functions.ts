// Platform console — quản trị toàn bộ tổ chức trên hệ thống.
// Chỉ admin nền tảng (user_roles.admin) mới truy cập; mọi lệnh đi qua RPC tin cậy.
import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminRead, assertAdminWrite } from "./admin-access.server";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";

export interface PlatformTenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  maxUsers: number | null;
  members: number;
  workspaces: number;
  createdAt: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  isMember: boolean;
}

/** Danh sách toàn bộ tổ chức kèm số thành viên, workspace và chủ sở hữu. */
export const listPlatformTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformTenantRow[]> => {
    await assertAdminRead(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: tenants, error }, { data: members }, { data: workspaces }] = await Promise.all([
      supabaseAdmin
        .from("tenants")
        .select("id, name, slug, status, max_users, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("tenant_members").select("tenant_id, user_id, role, status"),
      supabaseAdmin.from("workspaces").select("id, tenant_id"),
    ]);
    if (error) throw new Error(error.message);

    const ownerIds = new Set<string>();
    for (const m of members ?? []) {
      if (m.role === "tenant_owner") ownerIds.add(m.user_id as string);
    }
    const { data: profiles } = ownerIds.size
      ? await supabaseAdmin
          .from("profiles")
          .select("id, display_name, email")
          .in("id", Array.from(ownerIds))
      : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
    const profileById = new Map(
      (profiles ?? []).map((p) => [
        p.id as string,
        { name: (p.display_name as string | null) ?? null, email: (p.email as string | null) ?? null },
      ]),
    );

    const memberCount = new Map<string, number>();
    const ownerOf = new Map<string, string>();
    const myTenants = new Set<string>();
    for (const m of members ?? []) {
      const tid = m.tenant_id as string;
      if (m.status === "active" || m.status === "invited") {
        memberCount.set(tid, (memberCount.get(tid) ?? 0) + 1);
      }
      if (m.role === "tenant_owner" && !ownerOf.has(tid)) ownerOf.set(tid, m.user_id as string);
      if (m.user_id === context.userId && m.status === "active") myTenants.add(tid);
    }
    const wsCount = new Map<string, number>();
    for (const w of workspaces ?? []) {
      const tid = w.tenant_id as string;
      wsCount.set(tid, (wsCount.get(tid) ?? 0) + 1);
    }

    return (tenants ?? []).map((t) => {
      const id = t.id as string;
      const owner = ownerOf.get(id);
      const prof = owner ? profileById.get(owner) : undefined;
      return {
        id,
        name: t.name as string,
        slug: t.slug as string,
        status: t.status as string,
        maxUsers: (t.max_users as number | null) ?? null,
        members: memberCount.get(id) ?? 0,
        workspaces: wsCount.get(id) ?? 0,
        createdAt: (t.created_at as string | null) ?? null,
        ownerName: prof?.name ?? null,
        ownerEmail: prof?.email ?? null,
        isMember: myTenants.has(id),
      };
    });
  });

/** Tạo tổ chức mới. Chủ sở hữu mặc định là người đang thao tác, hoặc theo email. */
export const createPlatformTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        slug: z.string().trim().min(3).max(63),
        ownerEmail: z.string().trim().email().optional().nullable(),
        workspaceName: z.string().trim().min(2).max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdminWrite(context as never);
    let ownerId = context.userId;
    if (data.ownerEmail) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", data.ownerEmail)
        .maybeSingle();
      if (!prof) throw new Error("OWNER_NOT_FOUND");
      ownerId = prof.id as string;
    }
    const { data: rows, error } = await context.supabase.rpc("provision_tenant", {
      _name: data.name,
      _slug: data.slug,
      _owner_id: ownerId,
      _default_workspace_name: data.workspaceName ?? "Không gian chính",
      _idempotency_key: crypto.randomUUID(),
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { tenantId: (row as { tenant_id: string }).tenant_id };
  });

/** Đổi trạng thái tổ chức: active | suspended | archived. */
export const setPlatformTenantStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        tenantId: z.string().uuid(),
        status: z.enum(["active", "suspended", "archived"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdminWrite(context as never);
    const { error } = await context.supabase.rpc("change_tenant_status", {
      _tenant_id: data.tenantId,
      _new_status: data.status,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Vào một tổ chức để quản trị hộ: cấp quyền tenant_admin (có audit) và đặt tổ chức đang hoạt động. */
export const enterTenantAsPlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ tenantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminWrite(context as never);
    const { error } = await context.supabase.rpc("platform_admin_join_tenant", {
      _tenant_id: data.tenantId,
    });
    if (error) throw new Error(error.message);
    setCookie(ACTIVE_TENANT_COOKIE, data.tenantId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true as const };
  });
