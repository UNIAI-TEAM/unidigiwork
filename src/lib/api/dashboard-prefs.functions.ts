// Tuỳ chỉnh khối hiển thị trên Dashboard, lưu theo từng user (và tenant nếu có).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

export type DashboardSections = Record<string, boolean>;

const sectionsSchema = z.record(z.string().min(1).max(40), z.boolean());

function fail(err: { message?: string } | null, fallback: string): never {
  throw new ApiError({ code: "INTERNAL_ERROR", message: err?.message ?? fallback });
}

async function resolveTenantId(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return (data?.tenant_id as string | undefined) ?? null;
}

export const getDashboardPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ sections: DashboardSections | null }> => {
    const tenantId = await resolveTenantId(context.supabase, context.userId);
    let q = context.supabase
      .from("user_dashboard_prefs")
      .select("sections")
      .eq("user_id", context.userId);
    q = tenantId ? q.eq("tenant_id", tenantId) : q.is("tenant_id", null);
    const { data, error } = await q.maybeSingle();
    if (error) fail(error, "Không tải được tuỳ chỉnh bảng điều khiển");
    return { sections: (data?.sections as DashboardSections | undefined) ?? null };
  });

export const saveDashboardPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { sections: DashboardSections }) =>
    z.object({ sections: sectionsSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.supabase, context.userId);
    let sel = context.supabase
      .from("user_dashboard_prefs")
      .select("id")
      .eq("user_id", context.userId);
    sel = tenantId ? sel.eq("tenant_id", tenantId) : sel.is("tenant_id", null);
    const { data: existing } = await sel.maybeSingle();

    if (existing?.id) {
      const { error } = await context.supabase
        .from("user_dashboard_prefs")
        .update({ sections: data.sections })
        .eq("id", existing.id);
      if (error) fail(error, "Không lưu được tuỳ chỉnh");
    } else {
      const { error } = await context.supabase.from("user_dashboard_prefs").insert({
        user_id: context.userId,
        tenant_id: tenantId,
        sections: data.sections,
      });
      if (error) fail(error, "Không lưu được tuỳ chỉnh");
    }
    return { ok: true as const };
  });

export const resetDashboardPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await resolveTenantId(context.supabase, context.userId);
    let del = context.supabase
      .from("user_dashboard_prefs")
      .delete()
      .eq("user_id", context.userId);
    del = tenantId ? del.eq("tenant_id", tenantId) : del.is("tenant_id", null);
    const { error } = await del;
    if (error) fail(error, "Không đặt lại được tuỳ chỉnh");
    return { ok: true as const };
  });
