// Bảng giá công khai — đọc plans + plan_features + features bằng publishable key (RLS as anon).
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublicPlanFeature = {
  featureKey: string;
  name: string;
  kind: "flag" | "quota";
  unit: string | null;
  enabled: boolean;
  quotaLimit: number | null;
  sortOrder: number;
};

export type PublicPlanDto = {
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
  isFeatured: boolean;
  isDefault: boolean;
  sortOrder: number;
  features: PublicPlanFeature[];
};

export const listPublicPlans = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicPlanDto[]> => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const supabase = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
            h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const [{ data: plans }, { data: planFeatures }, { data: features }] = await Promise.all([
      supabase
        .from("plans")
        .select(
          "id, code, name, description, tagline, price_amount, price_currency, billing_period, price_label, price_unit_label, cta_label, is_featured, is_default, sort_order",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase.from("plan_features").select("plan_id, feature_key, enabled, quota_limit"),
      supabase.from("features").select("key, name, kind, unit, sort_order"),
    ]);

    const featureMeta = new Map(
      (features ?? []).map((f) => [
        f.key as string,
        f as { key: string; name: string; kind: string; unit: string | null; sort_order: number },
      ]),
    );

    const byPlan = new Map<string, PublicPlanFeature[]>();
    for (const pf of planFeatures ?? []) {
      const meta = featureMeta.get(pf.feature_key as string);
      const list = byPlan.get(pf.plan_id as string) ?? [];
      list.push({
        featureKey: pf.feature_key as string,
        name: meta?.name ?? (pf.feature_key as string),
        kind: (meta?.kind as "flag" | "quota") ?? "flag",
        unit: meta?.unit ?? null,
        enabled: Boolean(pf.enabled),
        quotaLimit: pf.quota_limit === null ? null : Number(pf.quota_limit),
        sortOrder: meta?.sort_order ?? 999,
      });
      byPlan.set(pf.plan_id as string, list);
    }

    return (plans ?? []).map((p) => ({
      id: p.id as string,
      code: p.code as string,
      name: p.name as string,
      description: (p.description as string | null) ?? null,
      tagline: (p.tagline as string | null) ?? null,
      priceAmount: p.price_amount === null ? null : Number(p.price_amount),
      priceCurrency: (p.price_currency as string) ?? "VND",
      billingPeriod: (p.billing_period as string) ?? "month",
      priceLabel: (p.price_label as string | null) ?? null,
      priceUnitLabel: (p.price_unit_label as string | null) ?? null,
      ctaLabel: (p.cta_label as string | null) ?? null,
      isFeatured: Boolean(p.is_featured),
      isDefault: Boolean(p.is_default),
      sortOrder: Number(p.sort_order ?? 0),
      features: (byPlan.get(p.id as string) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  },
);
