// WE-3 — endpoint kinh tế đơn vị & chính sách giá (nội bộ, RBAC).
//
// Bất biến:
//  - Client KHÔNG BAO GIỜ gửi được chi phí/token: mọi chi phí tính lại trong database.
//  - Chỉ admin được ghi bảng giá / chính sách giá; moderator chỉ đọc.
//  - Không có sự kiện thanh toán, hoá đơn, trừ credit nào ở lớp này.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminRead, assertAdminWrite } from "./admin-access.server";
import {
  simulateMargin,
  priceForTargetMargin,
  recommendPricingModel,
  toWorkProductEconomics,
  validatePricingPolicyInput,
  type AiModelCostRate,
  type MarginSimulation,
  type PricingModel,
  type WorkExecutionCostRow,
  type WorkPricingPolicy,
  type WorkProductEconomics,
  type WorkProductEconomicsRaw,
} from "@/domain/work-economics/pricing";

const CURRENCY = z.enum(["USD", "VND", "EUR"]);
const PRICING_MODEL = z.enum([
  "PER_EXECUTION",
  "PER_ACCEPTED_OUTCOME",
  "BUNDLE",
  "SUBSCRIPTION_INCLUDED",
  "CUSTOM",
]);

/* ------------------------------ Bảng giá model ------------------------------ */

export const listModelCostRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiModelCostRate[]> => {
    await assertAdminRead(context);
    const { data } = await context.supabase
      .from("ai_model_cost_rates")
      .select("*")
      .order("provider")
      .order("model")
      .order("rate_version", { ascending: false });
    return (data ?? []) as unknown as AiModelCostRate[];
  });

/** Tạo PHIÊN BẢN giá mới; không sửa đè lịch sử (chi phí cũ phải tái lập được). */
export const createModelCostRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        provider: z.string().min(1).max(80),
        model: z.string().min(1).max(160),
        inputTokenRate: z.number().min(0),
        outputTokenRate: z.number().min(0),
        currency: CURRENCY.default("USD"),
        source: z.string().min(3).max(300),
        status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
        effectiveFrom: z.string().datetime().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    await assertAdminWrite(context);
    const { data: prev } = await context.supabase
      .from("ai_model_cost_rates")
      .select("rate_version")
      .eq("provider", data.provider)
      .eq("model", data.model)
      .order("rate_version", { ascending: false })
      .limit(1);
    const nextVersion = ((prev?.[0] as { rate_version?: number } | undefined)?.rate_version ?? 0) + 1;
    const effectiveFrom = data.effectiveFrom ?? new Date().toISOString();

    if (data.status === "ACTIVE") {
      // Đóng hiệu lực bản đang dùng — lịch sử giữ nguyên, không ghi đè.
      await context.supabase
        .from("ai_model_cost_rates")
        .update({ effective_to: effectiveFrom, status: "RETIRED" })
        .eq("provider", data.provider)
        .eq("model", data.model)
        .eq("status", "ACTIVE")
        .is("effective_to", null);
    }

    const { error } = await context.supabase.from("ai_model_cost_rates").insert({
      provider: data.provider,
      model: data.model,
      rate_version: nextVersion,
      input_token_rate: data.inputTokenRate,
      output_token_rate: data.outputTokenRate,
      currency: data.currency,
      source: data.source,
      status: data.status,
      effective_from: effectiveFrom,
    } as never);
    return error ? { ok: false, error: error.message } : { ok: true };
  });

/* --------------------------- Chính sách chi phí người --------------------------- */

export const getHumanCostPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdminRead(context);
    const { data: rows } = await context.supabase
      .from("human_cost_policies")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("policy_version", { ascending: false });
    return rows ?? [];
  });

export const createHumanCostPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        currency: CURRENCY.default("USD"),
        reviewEventCost: z.number().min(0),
        approvalEventCost: z.number().min(0),
        changeRequestCost: z.number().min(0).default(0),
        status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    await assertAdminWrite(context);
    const { data: prev } = await context.supabase
      .from("human_cost_policies")
      .select("policy_version")
      .eq("tenant_id", data.tenantId)
      .order("policy_version", { ascending: false })
      .limit(1);
    const nextVersion = ((prev?.[0] as { policy_version?: number } | undefined)?.policy_version ?? 0) + 1;
    const now = new Date().toISOString();
    if (data.status === "ACTIVE") {
      await context.supabase
        .from("human_cost_policies")
        .update({ status: "RETIRED", effective_to: now })
        .eq("tenant_id", data.tenantId)
        .eq("status", "ACTIVE");
    }
    const { error } = await context.supabase.from("human_cost_policies").insert({
      tenant_id: data.tenantId,
      policy_version: nextVersion,
      currency: data.currency,
      review_event_cost: data.reviewEventCost,
      approval_event_cost: data.approvalEventCost,
      change_request_cost: data.changeRequestCost,
      status: data.status,
      effective_from: now,
    } as never);
    return error ? { ok: false, error: error.message } : { ok: true };
  });

/* ------------------------------ Kinh tế đơn vị ------------------------------ */

export const getWorkProductEconomics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        code: z.string().max(80),
        version: z.number().int().positive(),
        tenantId: z.string().uuid(),
        workspaceId: z.string().uuid().nullish(),
        days: z.number().int().min(1).max(365).default(90),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<WorkProductEconomics | null> => {
    await assertAdminRead(context);
    const res = await context.supabase.rpc("work_product_economics" as never, {
      _code: data.code,
      _version: data.version,
      _tenant_id: data.tenantId,
      _workspace_id: data.workspaceId ?? null,
      _from: new Date(Date.now() - data.days * 86_400_000).toISOString(),
      _to: new Date().toISOString(),
    } as never);
    if (res.error) return null;
    return toWorkProductEconomics(res.data as unknown as WorkProductEconomicsRaw);
  });

export const listExecutionCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ code: z.string().max(80), version: z.number().int().positive() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<WorkExecutionCostRow[]> => {
    await assertAdminRead(context);
    const { data: rows } = await context.supabase
      .from("work_execution_costs")
      .select("*")
      .eq("work_unit_code", data.code)
      .eq("work_unit_version", data.version)
      .order("computed_at", { ascending: false })
      .limit(100);
    return (rows ?? []) as unknown as WorkExecutionCostRow[];
  });

/** Tính lại chi phí (idempotent) cho toàn bộ lượt chạy của một sản phẩm công việc. */
export const recomputeWorkUnitEconomics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ code: z.string().max(80), version: z.number().int().positive() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ remetered: number; recomputed: number }> => {
    await assertAdminWrite(context);
    // 1) Số đo WE-1 được tính lại trước (nguồn duy nhất cho chi phí).
    const { data: execs } = await context.supabase
      .from("ai_task_executions")
      .select("id")
      .eq("work_unit_code", data.code)
      .eq("work_unit_version", data.version)
      .limit(500);
    let remetered = 0;
    for (const e of (execs ?? []) as { id: string }[]) {
      const r = await context.supabase.rpc("recompute_work_execution_metrics" as never, {
        _execution_id: e.id,
      } as never);
      if (!r.error) remetered += 1;
    }
    // 2) Chi phí WE-3 tính lại từ số đo (idempotent).
    const { data: rows } = await context.supabase
      .from("work_execution_metrics")
      .select("execution_id")
      .eq("work_unit_code", data.code)
      .eq("work_unit_version", data.version)
      .limit(500);
    let n = 0;
    for (const r of (rows ?? []) as { execution_id: string }[]) {
      const res = await context.supabase.rpc("recompute_work_execution_cost" as never, {
        _execution_id: r.execution_id,
      } as never);
      if (!res.error) n += 1;
    }
    return { remetered, recomputed: n };
  });


/* ------------------------------ Chính sách giá ------------------------------ */

export const listPricingPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkPricingPolicy[]> => {
    await assertAdminRead(context);
    const { data } = await context.supabase
      .from("work_pricing_policies")
      .select("*")
      .order("work_unit_code")
      .order("pricing_version", { ascending: false });
    return (data ?? []) as unknown as WorkPricingPolicy[];
  });

/** Tạo chính sách giá — mặc định DRAFT. Không tạo bất kỳ sự kiện thanh toán nào. */
export const createPricingPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        tenantId: z.string().uuid().nullish(),
        code: z.string().min(1).max(80),
        version: z.number().int().positive(),
        pricingModel: PRICING_MODEL,
        commercialUnit: z.enum(["EXECUTION", "ACCEPTED_OUTCOME"]).default("ACCEPTED_OUTCOME"),
        currency: CURRENCY.default("USD"),
        unitPrice: z.number().nullish(),
        bundleQuantity: z.number().int().nullish(),
        bundlePrice: z.number().nullish(),
        includedQuantity: z.number().int().min(0).nullish(),
        notes: z.string().max(500).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; errors?: string[]; error?: string }> => {
    await assertAdminWrite(context);
    const errors = validatePricingPolicyInput({
      pricingModel: data.pricingModel as PricingModel,
      currency: data.currency,
      unitPrice: data.unitPrice ?? null,
      bundleQuantity: data.bundleQuantity ?? null,
      bundlePrice: data.bundlePrice ?? null,
      workUnitVersion: data.version,
    });
    if (errors.length) return { ok: false, errors };

    const { data: prev } = await context.supabase
      .from("work_pricing_policies")
      .select("pricing_version")
      .eq("work_unit_code", data.code)
      .eq("work_unit_version", data.version)
      .order("pricing_version", { ascending: false })
      .limit(1);
    const nextVersion = ((prev?.[0] as { pricing_version?: number } | undefined)?.pricing_version ?? 0) + 1;

    const { error } = await context.supabase.from("work_pricing_policies").insert({
      tenant_id: data.tenantId ?? null,
      work_unit_code: data.code,
      work_unit_version: data.version,
      pricing_version: nextVersion,
      pricing_model: data.pricingModel,
      commercial_unit: data.commercialUnit,
      currency: data.currency,
      unit_price: data.unitPrice ?? null,
      bundle_quantity: data.bundleQuantity ?? null,
      bundle_price: data.bundlePrice ?? null,
      included_quantity: data.includedQuantity ?? null,
      status: "DRAFT", // WE-3 §XXVI: luôn DRAFT khi tạo
      notes: data.notes ?? null,
    } as never);
    return error ? { ok: false, error: error.message } : { ok: true };
  });

/** Đổi trạng thái chính sách giá (chỉ admin). Không phát sinh thanh toán. */
export const setPricingPolicyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["DRAFT", "ACTIVE", "RETIRED"]) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    await assertAdminWrite(context);
    const { error } = await context.supabase
      .from("work_pricing_policies")
      .update({ status: data.status, effective_to: data.status === "RETIRED" ? new Date().toISOString() : null })
      .eq("id", data.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  });

/* --------------------------- Mô phỏng biên lợi nhuận --------------------------- */

export const simulateWorkProductMargin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        code: z.string().max(80),
        version: z.number().int().positive(),
        tenantId: z.string().uuid(),
        workspaceId: z.string().uuid().nullish(),
        days: z.number().int().min(1).max(365).default(90),
        pricingModel: PRICING_MODEL.default("PER_ACCEPTED_OUTCOME"),
        commercialUnit: z.enum(["EXECUTION", "ACCEPTED_OUTCOME"]).default("ACCEPTED_OUTCOME"),
        proposedPrice: z.number(),
        currency: CURRENCY.default("USD"),
        targetMarginPercent: z.number().min(0).max(100).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdminRead(context);
    const res = await context.supabase.rpc("work_product_economics" as never, {
      _code: data.code,
      _version: data.version,
      _tenant_id: data.tenantId,
      _workspace_id: data.workspaceId ?? null,
      _from: new Date(Date.now() - data.days * 86_400_000).toISOString(),
      _to: new Date().toISOString(),
    } as never);
    if (res.error) return null;
    const economics = toWorkProductEconomics(res.data as unknown as WorkProductEconomicsRaw);
    const simulation: MarginSimulation = simulateMargin({
      economics,
      pricingModel: data.pricingModel as PricingModel,
      commercialUnit: data.commercialUnit,
      proposedPrice: data.proposedPrice,
      currency: data.currency,
    });
    const target =
      data.targetMarginPercent !== null && data.targetMarginPercent !== undefined
        ? priceForTargetMargin(economics, data.targetMarginPercent, data.commercialUnit)
        : null;
    return { economics, simulation, target, advisory: recommendPricingModel(economics) };
  });
