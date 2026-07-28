// Blueprint §18, §9 — Billing server functions.
// Trusted boundary around Postgres SECURITY DEFINER RPCs and RLS-scoped reads.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ChangeSubscriptionCommandSchema,
  type EntitlementSnapshotDto,
  type PlanDto,
  type SubscriptionDto,
} from "@/contracts/billing/plan";
import { ApiError, type StableErrorCode } from "@/contracts/errors";
import type { TenantId } from "@/contracts/common/ids";

function mapPgError(err: { message?: string } | null): never {
  const raw = (err?.message ?? "").toUpperCase();
  const known: StableErrorCode[] = [
    "AUTHENTICATION_REQUIRED",
    "PERMISSION_DENIED",
    "PLAN_NOT_FOUND",
    "PLAN_INVALID",
    "SUBSCRIPTION_NOT_FOUND",
    "SUBSCRIPTION_INVALID_TRANSITION",
    "ENTITLEMENT_DENIED",
    "QUOTA_EXCEEDED",
    "VERSION_CONFLICT",
    "VALIDATION_FAILED",
  ];
  const match = known.find((c) => raw.startsWith(c));
  throw new ApiError({
    code: match ?? "INTERNAL_ERROR",
    message: match ? match : "Billing operation failed.",
  });
}

const TenantInput = z.object({ tenantId: z.string().uuid() });

// ------------------------------------------------------------------
// Reads
// ------------------------------------------------------------------

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanDto[]> => {
    const { supabase } = context;
    const { data: plans, error } = await supabase
      .from("plans")
      .select("id, code, name, description, is_default, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new ApiError({ code: "INTERNAL_ERROR", message: "PLAN_LIST_FAILED" });

    const { data: pf, error: pfErr } = await supabase
      .from("plan_features")
      .select("plan_id, feature_key, enabled, quota_limit");
    if (pfErr) throw new ApiError({ code: "INTERNAL_ERROR", message: "PLAN_FEATURES_FAILED" });

    const byPlan = new Map<string, { featureKey: string; enabled: boolean; quotaLimit: number | null }[]>();
    for (const r of (pf ?? []) as Array<{
      plan_id: string;
      feature_key: string;
      enabled: boolean;
      quota_limit: number | null;
    }>) {
      const list = byPlan.get(r.plan_id) ?? [];
      list.push({ featureKey: r.feature_key, enabled: r.enabled, quotaLimit: r.quota_limit });
      byPlan.set(r.plan_id, list);
    }

    return ((plans ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      is_default: boolean;
      is_active: boolean;
      sort_order: number;
    }>).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      isDefault: p.is_default,
      isActive: p.is_active,
      sortOrder: p.sort_order,
      features: byPlan.get(p.id) ?? [],
    }));
  });

export const getActiveSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantInput.parse(d))
  .handler(async ({ data, context }): Promise<SubscriptionDto | null> => {
    const { supabase } = context;
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select(
        "id, tenant_id, plan_id, status, period_start, period_end, cancel_at, canceled_at, provider, row_version, created_at, updated_at, created_by, updated_by, plans:plan_id(code, name)",
      )
      .eq("tenant_id", data.tenantId)
      .neq("status", "canceled")
      .maybeSingle();
    if (error) throw new ApiError({ code: "INTERNAL_ERROR", message: "SUBSCRIPTION_READ_FAILED" });
    if (!sub) return null;
    const row = sub as unknown as {
      id: string;
      tenant_id: string;
      plan_id: string;
      status: SubscriptionDto["status"];
      period_start: string;
      period_end: string | null;
      cancel_at: string | null;
      canceled_at: string | null;
      provider: string;
      row_version: number;
      created_at: string;
      updated_at: string;
      created_by: string | null;
      updated_by: string | null;
      plans: { code: string; name: string } | null;
    };
    return {
      id: row.id,
      tenantId: row.tenant_id as TenantId,
      planId: row.plan_id,
      planCode: row.plans?.code ?? "",
      planName: row.plans?.name ?? "",
      status: row.status,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      cancelAt: row.cancel_at,
      canceledAt: row.canceled_at,
      provider: row.provider,
      rowVersion: row.row_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: (row.created_by as SubscriptionDto["createdBy"]) ?? null,
      updatedBy: (row.updated_by as SubscriptionDto["updatedBy"]) ?? null,
    };
  });

export const getEntitlementSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantInput.parse(d))
  .handler(async ({ data, context }): Promise<EntitlementSnapshotDto | null> => {
    const { supabase } = context;
    const { data: sub, error: sErr } = await supabase
      .from("subscriptions")
      .select("status, plans:plan_id(code, name)")
      .eq("tenant_id", data.tenantId)
      .neq("status", "canceled")
      .maybeSingle();
    if (sErr) throw new ApiError({ code: "INTERNAL_ERROR", message: "SUBSCRIPTION_READ_FAILED" });
    if (!sub) return null;
    const subRow = sub as unknown as {
      status: EntitlementSnapshotDto["subscriptionStatus"];
      plans: { code: string; name: string } | null;
    };

    const { data: ents, error: eErr } = await supabase
      .from("entitlements")
      .select("feature_key, enabled, quota_limit, features:feature_key(name, kind, unit, category, sort_order)")
      .eq("tenant_id", data.tenantId);
    if (eErr) throw new ApiError({ code: "INTERNAL_ERROR", message: "ENTITLEMENTS_READ_FAILED" });

    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const { data: counters, error: cErr } = await supabase
      .from("usage_counters")
      .select("meter_key, total, period_start")
      .eq("tenant_id", data.tenantId);
    if (cErr) throw new ApiError({ code: "INTERNAL_ERROR", message: "USAGE_READ_FAILED" });

    const usageByMeter = new Map<string, number>();
    for (const c of (counters ?? []) as Array<{ meter_key: string; total: number; period_start: string }>) {
      const cur = new Date(c.period_start);
      if (cur.getUTCFullYear() === new Date().getUTCFullYear() && cur.getUTCMonth() === new Date().getUTCMonth()) {
        usageByMeter.set(c.meter_key, (usageByMeter.get(c.meter_key) ?? 0) + Number(c.total ?? 0));
      }
    }

    const entRows = (ents ?? []) as Array<{
      feature_key: string;
      enabled: boolean;
      quota_limit: number | null;
      features: { name: string; kind: "flag" | "quota"; unit: string | null; category: string; sort_order: number } | null;
    }>;

    const list = entRows
      .map((r) => ({
        featureKey: r.feature_key,
        featureName: r.features?.name ?? r.feature_key,
        kind: (r.features?.kind ?? "flag") as "flag" | "quota",
        unit: r.features?.unit ?? null,
        category: r.features?.category ?? "general",
        enabled: r.enabled,
        quotaLimit: r.quota_limit,
        currentUsage: usageByMeter.get(r.feature_key) ?? 0,
      }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.featureName.localeCompare(b.featureName));

    return {
      tenantId: data.tenantId as TenantId,
      planCode: subRow.plans?.code ?? "",
      planName: subRow.plans?.name ?? "",
      subscriptionStatus: subRow.status,
      entitlements: list,
      periodStart,
      fetchedAt: new Date().toISOString(),
    };
  });

// ------------------------------------------------------------------
// Commands
// ------------------------------------------------------------------

export const changeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChangeSubscriptionCommandSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("change_subscription", {
      _tenant_id: data.tenantId,
      _plan_code: data.planCode,
      _idempotency_key: data.metadata.idempotencyKey,
      _correlation_id: data.metadata.correlationId ?? null,
      _expected_row_version: data.metadata.expectedRowVersion ?? null,
    });
    if (error) mapPgError(error);
    return { ok: true as const, subscriptionId: (row as { id?: string } | null)?.id ?? null };
  });