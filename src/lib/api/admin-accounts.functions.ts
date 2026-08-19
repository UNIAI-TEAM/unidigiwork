import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminRead, assertAdminWrite } from "./admin-access.server";

const LANGS = ["vi", "en", "my", "km", "lo"] as const;

/** Chi tiết một tài khoản: hồ sơ, vai trò, ngôn ngữ, tổ chức đang tham gia. */
export const getAccountDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminRead(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser, error } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (error) throw new Error(error.message);
    const u = authUser.user;
    const [{ data: profile }, { data: roles }, { data: prefs }, { data: memberships }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, email, display_name").eq("id", data.user_id).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id),
        supabaseAdmin.from("user_ui_prefs").select("lang, theme, tone").eq("user_id", data.user_id).maybeSingle(),
        supabaseAdmin
          .from("tenant_members")
          .select("tenant_id, role, status, tenants(name, slug, max_users)")
          .eq("user_id", data.user_id),
      ]);
    return {
      id: data.user_id,
      email: u?.email ?? profile?.email ?? "",
      display_name: profile?.display_name ?? null,
      created_at: u?.created_at ?? null,
      last_sign_in_at: u?.last_sign_in_at ?? null,
      email_confirmed: !!u?.email_confirmed_at,
      roles: (roles ?? []).map((r) => r.role as string),
      lang: (prefs?.lang as string) ?? "vi",
      theme: (prefs?.theme as string) ?? "dark",
      memberships: (memberships ?? []).map((m) => ({
        tenant_id: m.tenant_id as string,
        role: m.role as string,
        status: m.status as string,
        tenant_name: (m as never as { tenants?: { name?: string } }).tenants?.name ?? "—",
      })),
    };
  });

/** Đặt lại mật khẩu cho tài khoản. Chỉ admin. */
export const adminSetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdminWrite(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Xoá tài khoản. Không cho tự xoá chính mình. */
export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminWrite(context as never);
    if (data.user_id === context.userId) throw new Error("SELF_DELETE_FORBIDDEN");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Đổi ngôn ngữ giao diện của một tài khoản. */
export const adminSetUserLanguage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), lang: z.enum(LANGS) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdminWrite(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_ui_prefs")
      .upsert({ user_id: data.user_id, lang: data.lang }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Danh sách tổ chức kèm giới hạn tài khoản và số thành viên đang dùng. */
export const listTenantAccountLimits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminRead(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: tenants, error }, { data: members }] = await Promise.all([
      supabaseAdmin.from("tenants").select("id, name, slug, status, max_users").order("name"),
      supabaseAdmin.from("tenant_members").select("tenant_id, status"),
    ]);
    if (error) throw new Error(error.message);
    const used = new Map<string, number>();
    for (const m of members ?? []) {
      if (m.status !== "active" && m.status !== "invited") continue;
      used.set(m.tenant_id as string, (used.get(m.tenant_id as string) ?? 0) + 1);
    }
    return (tenants ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      slug: t.slug as string,
      status: t.status as string,
      max_users: (t.max_users as number | null) ?? null,
      used: used.get(t.id as string) ?? 0,
    }));
  });

/** Đặt giới hạn số tài khoản cho một tổ chức (null = không giới hạn). */
export const setTenantAccountLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ tenant_id: z.string().uuid(), max_users: z.number().int().min(1).max(100000).nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdminWrite(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tenants")
      .update({ max_users: data.max_users, updated_at: new Date().toISOString() })
      .eq("id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
