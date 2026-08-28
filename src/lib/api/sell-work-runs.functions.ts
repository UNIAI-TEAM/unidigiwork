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

export interface RunnableTaskRow {
  id: string;
  title: string;
  status: string;
  aiExecutionStatus: string | null;
  workspaceId: string;
}

/** Công việc đã gán nhân sự AI mà người dùng có thể khởi chạy sản phẩm công việc. */
export const listRunnableAiTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ workspaceId: z.string().uuid().nullish(), limit: z.number().int().min(1).max(50).default(25) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<RunnableTaskRow[]> => {
    let q = context.supabase
      .from("tasks")
      .select("id, title, status, ai_execution_status, workspace_id")
      .not("ai_worker_id", "is", null)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.workspaceId) q = q.eq("workspace_id", data.workspaceId);
    const res = await q;
    if (res.error) return [];
    return ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r["id"] as string,
      title: (r["title"] as string) ?? "",
      status: (r["status"] as string) ?? "",
      aiExecutionStatus: (r["ai_execution_status"] as string | null) ?? null,
      workspaceId: r["workspace_id"] as string,
    }));
  });
