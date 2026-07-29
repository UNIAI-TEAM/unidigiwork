import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Check whether current user has admin role. Bootstraps first user as admin. */
export const getMyIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Fast path: check own admin role via RLS
    const { data: mine } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (mine) return { isAdmin: true, bootstrapped: false };

    // Bootstrap: if no admin exists at all, grant to current user.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: cErr } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) === 0) {
      const { error: iErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: context.userId, role: "admin" });
      if (iErr) throw new Error(iErr.message);
      return { isAdmin: true, bootstrapped: true };
    }
    return { isAdmin: false, bootstrapped: false };
  });

async function assertAdmin(ctx: { supabase: ReturnType<typeof Object.assign>; userId: string }) {
  const { data } = await (ctx.supabase as { from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } } } } })
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

/** List all users with profiles + roles. Admin only. */
export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authList, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    const ids = authList.users.map((u) => u.id);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, display_name").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const rolesMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesMap.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesMap.set(r.user_id, arr);
    }
    return authList.users.map((u) => ({
      id: u.id,
      email: u.email ?? profileMap.get(u.id)?.email ?? "",
      display_name: profileMap.get(u.id)?.display_name ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed: !!u.email_confirmed_at,
      roles: rolesMap.get(u.id) ?? [],
    }));
  });

const roleSchema = z.enum(["admin", "moderator", "user"]);

/** Grant a role to a user. Admin only. */
export const grantUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), role: roleSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Revoke a role. Admin only. Cannot revoke own last admin role. */
export const revokeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), role: roleSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.role === "admin" && data.user_id === context.userId) {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) throw new Error("Không thể thu hồi quản trị viên cuối cùng");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin rules ----------

export const listAdminRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("admin_rules")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const ruleInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  kind: z.enum(["notification", "label", "automation"]).default("notification"),
  condition: z.record(z.unknown()).default({}),
  action: z.record(z.unknown()).default({}),
  is_enabled: z.boolean().default(true),
});

export const upsertAdminRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ruleInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      name: data.name,
      description: data.description ?? null,
      kind: data.kind,
      condition: data.condition as never,
      action: data.action as never,
      is_enabled: data.is_enabled,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("admin_rules").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabaseAdmin.from("admin_rules").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const toggleAdminRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), is_enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("admin_rules")
      .update({ is_enabled: data.is_enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAdminRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Overview stats ----------

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, workspaces, docs, threads, rules, notifs] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("workspaces").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("documents").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("email_threads").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("admin_rules").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("notifications").select("*", { count: "exact", head: true }),
    ]);
    return {
      users: users.count ?? 0,
      workspaces: workspaces.count ?? 0,
      documents: docs.count ?? 0,
      email_threads: threads.count ?? 0,
      rules: rules.count ?? 0,
      notifications: notifs.count ?? 0,
    };
  });

// ---------- Quota observability (24h) ----------

export const listQuotaCheckEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        tenantId: z.string().uuid().optional(),
        meterKey: z.string().max(120).optional(),
        status: z.enum(["all", "pass", "fail"]).default("all"),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    let q = supabaseAdmin
      .from("quota_check_events")
      .select("id, tenant_id, meter_key, quota_limit, current_usage, requested_delta, allowed, reason, actor_id, correlation_id, occurred_at")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (data.tenantId) q = q.eq("tenant_id", data.tenantId);
    if (data.meterKey) q = q.eq("meter_key", data.meterKey);
    if (data.status === "pass") q = q.eq("allowed", true);
    if (data.status === "fail") q = q.eq("allowed", false);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getQuotaCheckMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    type MetricRow = {
      tenant_id: string;
      meter_key: string;
      total_checks: number;
      pass_count: number;
      fail_count: number;
      fail_exceeded: number;
      fail_disabled: number;
      fail_no_entitlement: number;
      last_check_at: string | null;
      last_fail_at: string | null;
    };
    const { data, error } = await (supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data: MetricRow[] | null; error: { message: string } | null }>;
        };
      };
    })
      .from("v_quota_check_metrics")
      .select("tenant_id, meter_key, total_checks, pass_count, fail_count, fail_exceeded, fail_disabled, fail_no_entitlement, last_check_at, last_fail_at")
      .order("total_checks", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as MetricRow[];
  });

// ---------- Quota alert rules & events ----------

type AnyClient = {
  from: (t: string) => {
    select: (c: string) => {
      order: (col: string, opts: { ascending: boolean }) => {
        limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      } & Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    insert: (v: unknown) => { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> } };
    update: (v: unknown) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    delete: () => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
  };
};

export type QuotaAlertRule = {
  id: string;
  tenant_id: string | null;
  meter_key: string | null;
  window_minutes: number;
  threshold_count: number;
  cooldown_minutes: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type QuotaAlertEvent = {
  id: string;
  tenant_id: string;
  meter_key: string;
  rule_id: string | null;
  window_start: string;
  window_end: string;
  exceeded_count: number;
  threshold_count: number;
  notified_user_ids: string[];
  correlation_id: string | null;
  created_at: string;
};

export const listQuotaAlertRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as AnyClient)
      .from("quota_alert_rules")
      .select("id, tenant_id, meter_key, window_minutes, threshold_count, cooldown_minutes, enabled, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as QuotaAlertRule[];
  });

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  meter_key: z.string().min(1).max(120).nullable().optional(),
  window_minutes: z.number().int().min(1).max(1440).default(5),
  threshold_count: z.number().int().min(1).max(10000).default(5),
  cooldown_minutes: z.number().int().min(1).max(1440).default(15),
  enabled: z.boolean().default(true),
});

export const upsertQuotaAlertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ruleSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as AnyClient;
    const payload = {
      tenant_id: data.tenant_id ?? null,
      meter_key: data.meter_key ?? null,
      window_minutes: data.window_minutes,
      threshold_count: data.threshold_count,
      cooldown_minutes: data.cooldown_minutes,
      enabled: data.enabled,
    };
    if (data.id) {
      const { error } = await client.from("quota_alert_rules").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await client.from("quota_alert_rules").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row?.id };
  });

export const deleteQuotaAlertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as unknown as AnyClient)
      .from("quota_alert_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listQuotaAlertEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as AnyClient)
      .from("quota_alert_events")
      .select("id, tenant_id, meter_key, rule_id, window_start, window_end, exceeded_count, threshold_count, notified_user_ids, correlation_id, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as QuotaAlertEvent[];
  });