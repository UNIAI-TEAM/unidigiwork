// WE-1 — endpoint tin cậy đọc số đo kinh tế công việc.
// Chỉ ĐỌC. Không có endpoint nào cho phép client ghi số đo.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  WorkEconomicsSummary,
  WorkExecutionMetricsRow,
} from "@/domain/work-economics/contracts";

/** Số đo của đúng một lượt chạy; null khi chưa đo được (lượt chạy chưa khép). */
export const getWorkExecutionMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ executionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<WorkExecutionMetricsRow | null> => {
    const res = await context.supabase
      .from("work_execution_metrics")
      .select("*")
      .eq("execution_id", data.executionId)
      .maybeSingle();
    if (res.error) return null;
    return (res.data ?? null) as unknown as WorkExecutionMetricsRow | null;
  });

/** Số đo của một công việc (mọi revision), mới nhất trước. */
export const listTaskWorkMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<WorkExecutionMetricsRow[]> => {
    const res = await context.supabase
      .from("work_execution_metrics")
      .select("*")
      .eq("task_id", data.taskId)
      .order("computed_at", { ascending: false })
      .limit(50);
    if (res.error) return [];
    return (res.data ?? []) as unknown as WorkExecutionMetricsRow[];
  });

/** Tổng hợp kinh tế công việc theo tổ chức (RPC tự kiểm tra thành viên tenant). */
export const getWorkEconomicsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        workspaceId: z.string().uuid().nullish(),
        days: z.number().int().min(1).max(365).default(30),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<WorkEconomicsSummary | null> => {
    const from = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const res = await context.supabase.rpc("work_economics_summary" as never, {
      _tenant_id: data.tenantId,
      _workspace_id: data.workspaceId ?? null,
      _from: from,
      _to: new Date().toISOString(),
    } as never);
    if (res.error) return null;
    return (res.data ?? null) as unknown as WorkEconomicsSummary | null;
  });
