// Quản trị bảng giá: CRUD plans + plan_features + danh mục features. Admin only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: unknown; userId: string };

async function assertAdmin(ctx: Ctx) {
  const sb = ctx.supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
        };
      };
    };
  };
  const { data } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

export type AdminPlanFeature = {
  featureKey: string;
  enabled: boolean;
  quotaLimit: number | null;
};

export type AdminPlanDto = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  tagline: string | null;
  priceAmount: number | null;
  priceCurrency: string;
  billingPeriod: string;
  priceLabel: string | null;
  priceUnitLabel: string | null;
  ctaLabel: string | null;
  isActive: boolean;
  isFeatured: boolean;
  isDefault: boolean;
  sortOrder: number;
  features: AdminPlanFeature[];
};

export type AdminFeatureDto = {
  key: string;
  name: string;
  kind: string;
  unit: string | null;
  category: string;
  sortOrder: number;
};

export const listAdminPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ plans: AdminPlanDto[]; features: AdminFeatureDto[] }> => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: plans, error: pErr }, { data: pfs }, { data: features }] = await Promise.all([
      supabaseAdmin.from("plans").select("*").order("sort_order", { ascending: true }),
      supabaseAdmin.from("plan_features").select("plan_id, feature_key, enabled, quota_limit"),
      supabaseAdmin.from("features").select("key, name, kind, unit, category, sort_order").order("sort_order"),
    ]);
    if (pErr) throw new Error(pErr.message);

    const byPlan = new Map<string, AdminPlanFeature[]>();
    for (const pf of pfs ?? []) {
      const list = byPlan.get(pf.plan_id) ?? [];
      list.push({
        featureKey: pf.feature_key,
        enabled: Boolean(pf.enabled),
        quotaLimit: pf.quota_limit === null ? null : Number(pf.quota_limit),
      });
      byPlan.set(pf.plan_id, list);
    }

    return {
      plans: (plans ?? []).map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        tagline: p.tagline,
        priceAmount: p.price_amount === null ? null : Number(p.price_amount),
        priceCurrency: p.price_currency,
        billingPeriod: p.billing_period,
        priceLabel: p.price_label,
        priceUnitLabel: p.price_unit_label,
        ctaLabel: p.cta_label,
        isActive: p.is_active,
        isFeatured: p.is_featured,
        isDefault: p.is_default,
        sortOrder: p.sort_order,
        features: byPlan.get(p.id) ?? [],
      })),
      features: (features ?? []).map((f) => ({
        key: f.key,
        name: f.name,
        kind: f.kind,
        unit: f.unit,
        category: f.category,
        sortOrder: f.sort_order,
      })),
    };
  });

const planInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  priceAmount: z.number().nullable().optional(),
  priceCurrency: z.string().min(1).max(8).default("VND"),
  billingPeriod: z.string().min(1).max(32).default("monthly"),
  priceLabel: z.string().nullable().optional(),
  priceUnitLabel: z.string().nullable().optional(),
  ctaLabel: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => planInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      tagline: data.tagline ?? null,
      price_amount: data.priceAmount ?? null,
      price_currency: data.priceCurrency,
      billing_period: data.billingPeriod,
      price_label: data.priceLabel ?? null,
      price_unit_label: data.priceUnitLabel ?? null,
      cta_label: data.ctaLabel ?? null,
      is_active: data.isActive,
      is_featured: data.isFeatured,
      is_default: data.isDefault,
      sort_order: data.sortOrder,
      updated_at: new Date().toISOString(),
    };
    if (data.isDefault) {
      await supabaseAdmin
        .from("plans")
        .update({ is_default: false })
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    if (data.id) {
      const { error } = await supabaseAdmin.from("plans").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("plans")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("plan_id", data.id);
    if ((count ?? 0) > 0) {
      const { error } = await supabaseAdmin
        .from("plans")
        .update({ is_active: false, is_default: false })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { deleted: false, deactivated: true };
    }
    await supabaseAdmin.from("plan_features").delete().eq("plan_id", data.id);
    const { error } = await supabaseAdmin.from("plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { deleted: true, deactivated: false };
  });

export const upsertPlanFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        featureKey: z.string().min(1),
        enabled: z.boolean().default(true),
        quotaLimit: z.number().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("plan_features").upsert(
      {
        plan_id: data.planId,
        feature_key: data.featureKey,
        enabled: data.enabled,
        quota_limit: data.quotaLimit ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "plan_id,feature_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePlanFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ planId: z.string().uuid(), featureKey: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("plan_features")
      .delete()
      .eq("plan_id", data.planId)
      .eq("feature_key", data.featureKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
