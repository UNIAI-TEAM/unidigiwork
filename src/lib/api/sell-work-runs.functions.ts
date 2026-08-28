// SWP-1 — dữ liệu lượt chạy theo sản phẩm công việc (chỉ ĐỌC, theo RLS của actor).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface WorkProductRunRow {
  id: string;
  taskId: string;
  status: string;
  revision: number;
  qualityScore: number | null;
  qualityPassed: boolean | null;
  errorCode: string | null;
  cohortClass: string | null;
  workUnitCode: string | null;
  workUnitVersion: number | null;
  deliverableTitle: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** Lượt chạy gần đây của một sản phẩm công việc trong phạm vi người dùng thấy được. */
export const listWorkProductRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ code: z.string().max(80), limit: z.number().int().min(1).max(100).default(25) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<WorkProductRunRow[]> => {
    const res = await context.supabase
      .from("ai_task_executions")
      .select(
        "id, task_id, status, revision, quality_score, quality_passed, error_code, cohort_class, work_unit_code, work_unit_version, deliverable_title, started_at, completed_at, created_at",
      )
      .eq("work_unit_code", data.code)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (res.error) return [];
    return ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r["id"] as string,
      taskId: r["task_id"] as string,
      status: r["status"] as string,
      revision: (r["revision"] as number) ?? 0,
      qualityScore: (r["quality_score"] as number | null) ?? null,
      qualityPassed: (r["quality_passed"] as boolean | null) ?? null,
      errorCode: (r["error_code"] as string | null) ?? null,
      cohortClass: (r["cohort_class"] as string | null) ?? null,
      workUnitCode: (r["work_unit_code"] as string | null) ?? null,
      workUnitVersion: (r["work_unit_version"] as number | null) ?? null,
      deliverableTitle: (r["deliverable_title"] as string | null) ?? null,
      startedAt: (r["started_at"] as string | null) ?? null,
      completedAt: (r["completed_at"] as string | null) ?? null,
      createdAt: r["created_at"] as string,
    }));
  });
