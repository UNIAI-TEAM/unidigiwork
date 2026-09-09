// Quản lý người dùng trong tổ chức + cấp quyền tài liệu hàng loạt. RLS applies.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { commandMetadataSchema } from "@/contracts/common/base";
import { mapPgError } from "./business.server";

const MANAGER_ROLES = ["tenant_owner", "tenant_admin"];

async function tenantOf(supabase: any, userId: string): Promise<{ tenantId: string; role: string }> {
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
  return { tenantId, role: (data?.role as string) ?? "member" };
}

export type AccessMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  isSelf: boolean;
  /** Số tài liệu đang được chia sẻ trực tiếp cho người này (còn hiệu lực). */
  activeGrants: number;
  viewGrants: number;
  editGrants: number;
};

/** Danh sách thành viên tổ chức kèm số quyền tài liệu đang có. */
export const listAccessMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ members: AccessMember[]; canManage: boolean; tenantId: string }> => {
    const { tenantId, role } = await tenantOf(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("tenant_members")
      .select("user_id, role, status")
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .limit(500);
    if (error) mapPgError(error);
    const list = (rows ?? []) as any[];
    const ids = list.map((r) => r.user_id as string);
    const names = new Map<string, { name: string; email: string }>();
    if (ids.length) {
      const { data: us } = await context.supabase
        .from("users")
        .select("id, display_name, primary_email")
        .in("id", ids);
      for (const u of (us ?? []) as any[])
        names.set(u.id as string, {
          name: (u.display_name as string) ?? (u.primary_email as string) ?? "—",
          email: (u.primary_email as string) ?? "",
        });
    }

    const nowISO = new Date().toISOString();
    const counts = new Map<string, { view: number; edit: number }>();
    if (ids.length) {
      const { data: shares } = await context.supabase
        .from("work_product_shares")
        .select("shared_with_user_id, permission, status, expires_at")
        .in("shared_with_user_id", ids)
        .eq("status", "ACTIVE")
        .or(`expires_at.is.null,expires_at.gt.${nowISO}`)
        .limit(5000);
      for (const s of (shares ?? []) as any[]) {
        const uid = s.shared_with_user_id as string;
        const c = counts.get(uid) ?? { view: 0, edit: 0 };
        if ((s.permission as string) === "EDIT") c.edit += 1;
        else c.view += 1;
        counts.set(uid, c);
      }
    }

    const members: AccessMember[] = list
      .map((r) => {
        const uid = r.user_id as string;
        const c = counts.get(uid) ?? { view: 0, edit: 0 };
        const n = names.get(uid);
        return {
          userId: uid,
          name: n?.name ?? "—",
          email: n?.email ?? "",
          role: (r.role as string) ?? "member",
          status: (r.status as string) ?? "active",
          isSelf: uid === context.userId,
          activeGrants: c.view + c.edit,
          viewGrants: c.view,
          editGrants: c.edit,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));

    return { members, canManage: MANAGER_ROLES.includes(role), tenantId };
  });

/** Tài liệu của tổ chức để chọn khi cấp quyền hàng loạt. */
export const listAccessDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ search: z.string().max(200).optional() }).parse(i ?? {}))
  .handler(async ({ data, context }): Promise<{ id: string; title: string; businessType: string }[]> => {
    let q = context.supabase
      .from("work_products")
      .select("id, title, business_type, updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.search?.trim()) q = q.ilike("title", `%${data.search.trim()}%`);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string,
      title: (r.title as string) ?? "—",
      businessType: (r.business_type as string) ?? "OTHER",
    }));
  });

const grantSchema = z.object({
  ...commandMetadataSchema.shape,
  userIds: z.array(z.string().uuid()).min(1).max(200),
  /** Bỏ trống = áp dụng cho toàn bộ tài liệu tổ chức mà người cấp nhìn thấy. */
  productIds: z.array(z.string().uuid()).max(200).optional(),
  allDocuments: z.boolean().default(false),
  permission: z.enum(["VIEW", "EDIT"]).default("VIEW"),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

async function resolveProductIds(supabase: any, input: z.infer<typeof grantSchema>): Promise<string[]> {
  if (input.allDocuments) {
    const { data, error } = await supabase
      .from("work_products")
      .select("id")
      .is("deleted_at", null)
      .limit(500);
    if (error) mapPgError(error);
    return ((data ?? []) as any[]).map((r) => r.id as string);
  }
  return input.productIds ?? [];
}

/** Cấp quyền xem/sửa hàng loạt cho nhiều người trên nhiều tài liệu. */
export const grantDocumentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => grantSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { role } = await tenantOf(context.supabase, context.userId);
    if (!MANAGER_ROLES.includes(role)) {
      throw new ApiError({ code: "PERMISSION_DENIED", message: "ACCESS_ADMIN_FORBIDDEN" });
    }
    const productIds = await resolveProductIds(context.supabase, data);
    if (!productIds.length) return { ok: true as const, granted: 0 };

    const rows = productIds.flatMap((pid) =>
      data.userIds.map((uid) => ({
        work_product_id: pid,
        workspace_id: null,
        shared_with_user_id: uid,
        permission: data.permission,
        status: "ACTIVE",
        expires_at: data.expiresAt ?? null,
        shared_by: context.userId,
      })),
    );
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await context.supabase
        .from("work_product_shares")
        .upsert(rows.slice(i, i + 500) as never, { onConflict: "work_product_id,shared_with_user_id" });
      if (error) mapPgError(error);
    }
    return { ok: true as const, granted: rows.length };
  });

/** Thu hồi toàn bộ quyền tài liệu trực tiếp của những người được chọn. */
export const revokeDocumentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        userIds: z.array(z.string().uuid()).min(1).max(200),
        productIds: z.array(z.string().uuid()).max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { role } = await tenantOf(context.supabase, context.userId);
    if (!MANAGER_ROLES.includes(role)) {
      throw new ApiError({ code: "PERMISSION_DENIED", message: "ACCESS_ADMIN_FORBIDDEN" });
    }
    let q = context.supabase.from("work_product_shares").delete().in("shared_with_user_id", data.userIds);
    if (data.productIds?.length) q = q.in("work_product_id", data.productIds);
    const { error } = await q;
    if (error) mapPgError(error);
    return { ok: true as const };
  });

export type MemberGrant = {
  id: string;
  productId: string;
  title: string;
  permission: "VIEW" | "EDIT";
  status: string;
  expiresAt: string | null;
};

/** Chi tiết các tài liệu đang chia sẻ trực tiếp cho một thành viên. */
export const listMemberGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<MemberGrant[]> => {
    const { data: rows, error } = await context.supabase
      .from("work_product_shares")
      .select("id, work_product_id, permission, status, expires_at")
      .eq("shared_with_user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) mapPgError(error);
    const list = (rows ?? []) as any[];
    const ids = Array.from(new Set(list.map((r) => r.work_product_id as string)));
    const titles = new Map<string, string>();
    if (ids.length) {
      const { data: wp } = await context.supabase.from("work_products").select("id, title").in("id", ids);
      for (const w of (wp ?? []) as any[]) titles.set(w.id as string, (w.title as string) ?? "—");
    }
    return list.map((r) => ({
      id: r.id as string,
      productId: r.work_product_id as string,
      title: titles.get(r.work_product_id as string) ?? "—",
      permission: ((r.permission as string) === "EDIT" ? "EDIT" : "VIEW") as "VIEW" | "EDIT",
      status: (r.status as string) ?? "ACTIVE",
      expiresAt: (r.expires_at as string) ?? null,
    }));
  });

/** Sửa hoặc thu hồi một quyền cụ thể (không cần chỉnh thủ công từng bản ghi). */
export const updateMemberGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        shareId: z.string().uuid(),
        action: z.enum(["SET_VIEW", "SET_EDIT", "REVOKE", "RESTORE", "DELETE"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { role } = await tenantOf(context.supabase, context.userId);
    if (!MANAGER_ROLES.includes(role)) {
      throw new ApiError({ code: "PERMISSION_DENIED", message: "ACCESS_ADMIN_FORBIDDEN" });
    }
    if (data.action === "DELETE") {
      const { error } = await context.supabase.from("work_product_shares").delete().eq("id", data.shareId);
      if (error) mapPgError(error);
      return { ok: true as const };
    }
    const patch =
      data.action === "SET_VIEW"
        ? { permission: "VIEW" }
        : data.action === "SET_EDIT"
          ? { permission: "EDIT" }
          : data.action === "REVOKE"
            ? { status: "REVOKED" }
            : { status: "ACTIVE" };
    const { error } = await context.supabase
      .from("work_product_shares")
      .update(patch as never)
      .eq("id", data.shareId);
    if (error) mapPgError(error);
    return { ok: true as const };
  });

/** Tạm ngưng / khôi phục / gỡ thành viên khỏi tổ chức. */
export const setAccessMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        userId: z.string().uuid(),
        status: z.enum(["active", "suspended", "removed"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, role } = await tenantOf(context.supabase, context.userId);
    if (!MANAGER_ROLES.includes(role)) {
      throw new ApiError({ code: "PERMISSION_DENIED", message: "ACCESS_ADMIN_FORBIDDEN" });
    }
    if (data.userId === context.userId) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "ACCESS_ADMIN_SELF_STATUS" });
    }
    const { error } = await context.supabase.rpc("change_tenant_member_status", {
      _tenant_id: tenantId,
      _user_id: data.userId,
      _new_status: data.status,
      _correlation_id: null,
    } as never);
    if (error) mapPgError(error);
    if (data.status === "removed") {
      await context.supabase.from("work_product_shares").delete().eq("shared_with_user_id", data.userId);
    }
    return { ok: true as const };
  });

/** Đổi vai trò thành viên trong tổ chức. */
export const setAccessMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        userId: z.string().uuid(),
        role: z.enum(["tenant_owner", "tenant_admin", "manager", "member", "guest"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, role } = await tenantOf(context.supabase, context.userId);
    if (!MANAGER_ROLES.includes(role)) {
      throw new ApiError({ code: "PERMISSION_DENIED", message: "ACCESS_ADMIN_FORBIDDEN" });
    }
    const { error } = await context.supabase.rpc("change_tenant_member_role", {
      _tenant_id: tenantId,
      _user_id: data.userId,
      _new_role: data.role,
      _correlation_id: null,
    } as never);
    if (error) mapPgError(error);
    return { ok: true as const };
  });
