// SWP-2 — endpoint chương trình thí điểm thương mại (vỏ mỏng).
//
// Bất biến:
//  - Mọi thay đổi trạng thái/ghi dữ liệu đi qua RPC SECURITY DEFINER (server-authoritative).
//  - Không có policy INSERT/UPDATE trên bảng pilot ⇒ client không thể ghi trực tiếp.
//  - Chỉ metadata thương mại; không endpoint nào trả nội dung công việc của khách hàng.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminRead, assertAdminWrite } from "@/lib/api/admin-access.server";
import type { PilotMetrics, PilotPortfolio } from "@/domain/sell-work/pilot";

const CURRENCY = z.enum(["USD", "VND", "EUR"]);

export interface CommercialEventRow {
  id: string;
  event_type: string;
  work_unit_code: string | null;
  work_unit_version: number | null;
  payload: { from?: string; to?: string; reason?: string | null; signal?: string; price?: number; currency?: string; basis?: string; amount?: number } | null;
  occurred_at: string;
}

export interface PricingExperimentRow {
  id: string;
  work_unit_code: string;
  work_unit_version: number;
  pricing_basis: string;
  price: number;
  currency: string;
  included_volume: number | null;
  overage_price: number | null;
  proposed_at: string;
  customer_response: string;
  responded_at: string | null;
  notes: string | null;
}

export interface SupportRow {
  id: string;
  category: string;
  minutes: number | null;
  summary: string | null;
  occurred_at: string;
}

type Rpc = { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };

async function call<T>(supabase: unknown, name: string, args: unknown): Promise<T> {
  const res = await (supabase as Rpc).rpc(name, args);
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Danh mục pilot + phụ thuộc dịch vụ (chỉ quản trị nền tảng). */
export const getPilotPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ days: z.number().int().min(1).max(730).default(90) }).parse(i))
  .handler(async ({ data, context }): Promise<PilotPortfolio> => {
    await assertAdminRead(context);
    return call<PilotPortfolio>(context.supabase, "compute_sell_work_pilot_portfolio", {
      _from: new Date(Date.now() - data.days * 86_400_000).toISOString(),
      _to: new Date().toISOString(),
    });
  });

/** Chỉ số chi tiết của một pilot. */
export const getPilotMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ pilotId: z.string().uuid(), days: z.number().int().min(1).max(730).nullish() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<PilotMetrics> => {
    await assertAdminRead(context);
    return call<PilotMetrics>(context.supabase, "compute_sell_work_pilot_metrics", {
      _pilot_id: data.pilotId,
      _from: data.days ? new Date(Date.now() - data.days * 86_400_000).toISOString() : null,
      _to: new Date().toISOString(),
    });
  });

/** Sự kiện thương mại của một pilot (tách khỏi audit kỹ thuật). */
export const listPilotCommercialEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ pilotId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdminRead(context);
    const res = await context.supabase
      .from("sell_work_commercial_events")
      .select("id, event_type, work_unit_code, work_unit_version, payload, occurred_at")
      .eq("pilot_id", data.pilotId)
      .order("occurred_at", { ascending: false })
      .limit(200);
    return (res.data ?? []) as unknown as CommercialEventRow[];
  });

/** Thử nghiệm giá của một pilot (bằng chứng giá, KHÔNG phải hoá đơn). */
export const listPilotPricingExperiments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ pilotId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdminRead(context);
    const res = await context.supabase
      .from("sell_work_pricing_experiments")
      .select(
        "id, work_unit_code, work_unit_version, pricing_basis, price, currency, included_volume, overage_price, proposed_at, customer_response, responded_at, notes",
      )
      .eq("pilot_id", data.pilotId)
      .order("proposed_at", { ascending: false });
    return (res.data ?? []) as unknown as PricingExperimentRow[];
  });

/** Danh sách công hỗ trợ (đo phụ thuộc dịch vụ). */
export const listPilotSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ pilotId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdminRead(context);
    const res = await context.supabase
      .from("sell_work_pilot_support")
      .select("id, category, minutes, summary, occurred_at")
      .eq("pilot_id", data.pilotId)
      .order("occurred_at", { ascending: false })
      .limit(200);
    return (res.data ?? []) as unknown as SupportRow[];
  });

/* --------------------------------- Ghi dữ liệu --------------------------------- */

export const createPilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        customerSegment: z.string().max(120).nullish(),
        industry: z.string().max(120).nullish(),
        startDate: z.string().nullish(),
        targetEndDate: z.string().nullish(),
        commercialModel: z
          .enum(["PER_EXECUTION", "PER_ACCEPTED_OUTCOME", "MONTHLY_BUNDLE", "SUBSCRIPTION_INCLUDED", "CUSTOM"])
          .nullish(),
        notes: z.string().max(2000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ pilotId: string }> => {
    await assertAdminWrite(context);
    const id = await call<string>(context.supabase, "create_sell_work_pilot", {
      _tenant_id: data.tenantId,
      _customer_segment: data.customerSegment ?? null,
      _industry: data.industry ?? null,
      _start_date: data.startDate ?? null,
      _target_end_date: data.targetEndDate ?? null,
      _pilot_owner: context.userId,
      _success_criteria: {},
      _commercial_model: data.commercialModel ?? null,
      _notes: data.notes ?? null,
    });
    return { pilotId: id };
  });

export const upsertPilotProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        pilotId: z.string().uuid(),
        code: z.string().max(80),
        version: z.number().int().positive().default(1),
        expectedUserGroup: z.string().max(200).nullish(),
        expectedFrequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "AD_HOC"]).nullish(),
        targetProblem: z.string().max(500).nullish(),
        expectedDeliverable: z.string().max(500).nullish(),
        successCriteria: z.string().max(500).nullish(),
        measurableOutcome: z.string().max(500).nullish(),
        commercialHypothesis: z.string().max(500).nullish(),
        activate: z.boolean().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertAdminWrite(context);
    const id = await call<string>(context.supabase, "upsert_sell_work_pilot_product", {
      _pilot_id: data.pilotId,
      _code: data.code,
      _version: data.version,
      _expected_user_group: data.expectedUserGroup ?? null,
      _expected_frequency: data.expectedFrequency ?? null,
      _target_problem: data.targetProblem ?? null,
      _expected_deliverable: data.expectedDeliverable ?? null,
      _success_criteria: data.successCriteria ?? null,
      _measurable_outcome: data.measurableOutcome ?? null,
      _commercial_hypothesis: data.commercialHypothesis ?? null,
      _activate: data.activate,
    });
    return { id };
  });

export const setPilotStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        pilotId: z.string().uuid(),
        status: z.enum([
          "PROSPECT",
          "QUALIFIED",
          "ONBOARDING",
          "ACTIVE_PILOT",
          "VALUE_PROVEN",
          "PAID_PILOT",
          "REPEAT_USAGE",
          "EXPANSION_SIGNAL",
          "PAUSED",
          "LOST",
        ]),
        reason: z.string().max(200).nullish(),
        secondaryReason: z.string().max(200).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdminWrite(context);
    return call<{ pilotId: string; from: string; to: string }>(context.supabase, "set_sell_work_pilot_status", {
      _pilot_id: data.pilotId,
      _status: data.status,
      _reason: data.reason ?? null,
      _secondary_reason: data.secondaryReason ?? null,
    });
  });

export const setPilotWtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        pilotId: z.string().uuid(),
        signal: z.enum(["NO_SIGNAL", "INTERESTED", "WILL_PAY_AT_RIGHT_PRICE", "PAID_PILOT", "CONTRACTED"]),
        amount: z.number().positive().nullish(),
        currency: CURRENCY.nullish(),
        billingBasis: z.string().max(80).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdminWrite(context);
    await call(context.supabase, "set_sell_work_pilot_wtp", {
      _pilot_id: data.pilotId,
      _signal: data.signal,
      _amount: data.amount ?? null,
      _currency: data.currency ?? null,
      _billing_basis: data.billingBasis ?? null,
    });
    return { ok: true };
  });

/** Xác minh thí điểm trả phí — BẮT BUỘC có tham chiếu bằng chứng thật. */
export const verifyPaidPilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        pilotId: z.string().uuid(),
        evidenceReference: z.string().min(3).max(300),
        amount: z.number().positive(),
        currency: CURRENCY,
        revenueClass: z.enum(["PILOT_FEE", "SUBSCRIPTION", "WORK_PRODUCT_FEE", "SERVICES", "OTHER"]).default("PILOT_FEE"),
        revenueGroup: z.enum(["SOFTWARE", "SELL_WORK", "SERVICES"]).default("SELL_WORK"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdminWrite(context);
    await call(context.supabase, "verify_sell_work_paid_pilot", {
      _pilot_id: data.pilotId,
      _evidence_reference: data.evidenceReference,
      _amount: data.amount,
      _currency: data.currency,
      _revenue_class: data.revenueClass,
      _revenue_group: data.revenueGroup,
    });
    return { ok: true };
  });

export const recordPricingExperiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        pilotId: z.string().uuid(),
        code: z.string().max(80),
        version: z.number().int().positive().default(1),
        pricingBasis: z.enum([
          "PER_EXECUTION",
          "PER_ACCEPTED_OUTCOME",
          "MONTHLY_BUNDLE",
          "SUBSCRIPTION_INCLUDED",
          "CUSTOM",
        ]),
        price: z.number().positive(),
        currency: CURRENCY,
        includedVolume: z.number().int().positive().nullish(),
        overagePrice: z.number().positive().nullish(),
        notes: z.string().max(1000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertAdminWrite(context);
    const id = await call<string>(context.supabase, "record_sell_work_pricing_experiment", {
      _pilot_id: data.pilotId,
      _code: data.code,
      _version: data.version,
      _pricing_basis: data.pricingBasis,
      _price: data.price,
      _currency: data.currency,
      _included_volume: data.includedVolume ?? null,
      _overage_price: data.overagePrice ?? null,
      _notes: data.notes ?? null,
    });
    return { id };
  });

export const setPricingResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        experimentId: z.string().uuid(),
        response: z.enum(["ACCEPTED", "NEGOTIATING", "REJECTED", "NO_RESPONSE"]),
        notes: z.string().max(1000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdminWrite(context);
    await call(context.supabase, "set_sell_work_pricing_response", {
      _experiment_id: data.experimentId,
      _response: data.response,
      _notes: data.notes ?? null,
    });
    return { ok: true };
  });

export const recordPilotSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        pilotId: z.string().uuid(),
        category: z.enum(["PRODUCT_SUPPORT", "DATA_SETUP", "TRAINING", "BUG", "CUSTOM_CONFIG", "CUSTOM_ENGINEERING"]),
        minutes: z.number().int().min(0).max(100000).nullish(),
        summary: z.string().max(1000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertAdminWrite(context);
    const id = await call<string>(context.supabase, "record_sell_work_pilot_support", {
      _pilot_id: data.pilotId,
      _category: data.category,
      _minutes: data.minutes ?? null,
      _summary: data.summary ?? null,
    });
    return { id };
  });

/** Danh sách tổ chức để gắn pilot (chỉ tên + id, không nội dung công việc). */
export const listPilotEligibleTenants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminWrite(context);
    const res = await context.supabase
      .from("tenants")
      .select("id, name, slug")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    return (res.data ?? []) as unknown as { id: string; name: string; slug: string }[];
  });
