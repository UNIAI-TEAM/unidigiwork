// SWP-1 — endpoint tin cậy cho cohort Sell Work.
//
// Bất biến:
//  - Chỉ số cohort LUÔN do RPC compute_work_product_cohort tính (server-authoritative).
//  - RPC tự kiểm tra quyền: phải là thành viên tổ chức, hoặc platform admin mới
//    được tổng hợp xuyên tổ chức. Client không thể tự chọn phạm vi rộng hơn quyền.
//  - Tín hiệu tự báo cáo (feedback) KHÔNG bao giờ trộn vào chỉ số hệ thống.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SWP1_FLAGSHIPS, type WorkProductCohort } from "@/domain/sell-work/cohort";

const WindowInput = z.object({
  tenantId: z.string().uuid().nullish(),
  days: z.number().int().min(1).max(365).default(90),
  includeSynthetic: z.boolean().default(false),
});

async function computeOne(
  supabase: { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: unknown }> },
  code: string,
  version: number | null,
  from: string,
  to: string,
  tenantId: string | null,
  includeSynthetic: boolean,
): Promise<WorkProductCohort | null> {
  const res = await supabase.rpc("compute_work_product_cohort", {
    _code: code,
    _version: version,
    _from: from,
    _to: to,
    _tenant_id: tenantId,
    _include_synthetic: includeSynthetic,
  });
  if (res.error || !res.data) return null;
  return res.data as WorkProductCohort;
}

/** Cohort của cả 3 sản phẩm chủ lực trong một cửa sổ thời gian. */
export const listFlagshipCohorts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => WindowInput.parse(i))
  .handler(async ({ data, context }): Promise<{ code: string; label: string; cohort: WorkProductCohort | null }[]> => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const out: { code: string; label: string; cohort: WorkProductCohort | null }[] = [];
    for (const f of SWP1_FLAGSHIPS) {
      out.push({
        code: f.code,
        label: f.label,
        cohort: await computeOne(
          context.supabase as never,
          f.code,
          f.version,
          from,
          to,
          data.tenantId ?? null,
          data.includeSynthetic,
        ),
      });
    }
    return out;
  });

/** Cohort của một sản phẩm + phiên bản cụ thể (so sánh phiên bản không ghi đè lịch sử). */
export const getWorkProductCohort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    WindowInput.extend({
      code: z.string().max(80),
      version: z.number().int().positive().nullish(),
    }).parse(i),
  )
  .handler(async ({ data, context }): Promise<WorkProductCohort | null> => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - data.days * 86_400_000).toISOString();
    return computeOne(
      context.supabase as never,
      data.code,
      data.version ?? null,
      from,
      to,
      data.tenantId ?? null,
      data.includeSynthetic,
    );
  });

/** Tín hiệu tự báo cáo của người dùng cho một lượt chạy (được gắn nhãn rõ ràng). */
export const submitWorkExecutionFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        executionId: z.string().uuid(),
        usefulness: z.enum(["USEFUL", "PARTIALLY_USEFUL", "NOT_USEFUL"]),
        wouldUseAgain: z.enum(["YES", "MAYBE", "NO"]),
        estimatedTimeSavedMinutes: z.number().int().min(0).max(10000).nullish(),
        comment: z.string().max(2000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    // Đọc phạm vi lượt chạy bằng RLS của chính actor: không thấy ⇒ không ghi được.
    const exec = await context.supabase
      .from("ai_task_executions")
      .select("id, tenant_id, work_unit_code, work_unit_version")
      .eq("id", data.executionId)
      .maybeSingle();
    const row = exec.data as Record<string, unknown> | null;
    if (!row) return { ok: false };

    const res = await context.supabase
      .from("work_execution_feedback")
      .upsert(
        {
          execution_id: data.executionId,
          tenant_id: row["tenant_id"] as string,
          work_unit_code: (row["work_unit_code"] as string | null) ?? null,
          work_unit_version: (row["work_unit_version"] as number | null) ?? null,
          usefulness: data.usefulness,
          would_use_again: data.wouldUseAgain,
          estimated_time_saved_minutes: data.estimatedTimeSavedMinutes ?? null,
          comment: data.comment ?? null,
          created_by: context.userId,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "execution_id,created_by" },
      );
    return { ok: !res.error };
  });
