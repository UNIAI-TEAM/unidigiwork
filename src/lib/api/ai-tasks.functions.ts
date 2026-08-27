// AI TASK EXECUTION V1 — endpoint tin cậy cho vòng đời: giao việc → AI chạy → chờ duyệt → nghiệm thu.
// Mọi mutation đi qua RPC SECURITY DEFINER; AI không bao giờ tự nghiệm thu.
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { templateByCode, type AiTaskExecutionRow, type AiWorkerRow } from "@/domain/ai-tasks/contracts";
import { mapPgError } from "./business.server";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";

const one = <T,>(v: unknown): T => (Array.isArray(v) ? (v[0] as T) : (v as T));

export interface AiTaskAccess {
  canView: boolean;
  canManage: boolean;
  canReview: boolean;
  reason: "OK" | "DENIED";
}

const MANAGER_ROLES = new Set(["owner", "admin", "manager", "tenant_admin"]);

/** Ghi nhật ký truy cập panel AI EXECUTION (best-effort, không chặn nghiệp vụ). */
async function logAiTaskAudit(input: {
  tenantId: string | null;
  actorId: string;
  eventType: string;
  taskId: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_events").insert({
      tenant_id: input.tenantId,
      actor_id: input.actorId,
      actor_user_id: input.actorId,
      event_type: input.eventType,
      action: input.eventType,
      aggregate_type: "task",
      aggregate_id: input.taskId,
      resource_type: "ai_task_execution",
      resource_id: input.taskId,
      payload: { task_id: input.taskId, ...(input.payload ?? {}) },
      source: "app",
    });
  } catch {
    // audit không được phép làm hỏng thao tác chính
  }
}

/**
 * Quyền hiển thị panel AI EXECUTION.
 * canView dựa trên RLS (đọc được task = thuộc tổ chức/workspace).
 * canManage/canReview chỉ dành cho chủ sở hữu việc, người tạo, hoặc vai trò quản lý.
 */
export const getAiTaskAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AiTaskAccess> => {
    const denied: AiTaskAccess = { canView: false, canManage: false, canReview: false, reason: "DENIED" };
    const { data: task, error } = await context.supabase
      .from("tasks")
      .select("id, tenant_id, workspace_id, human_owner_id, created_by")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error || !task) {
      await logAiTaskAudit({
        tenantId: null,
        actorId: context.userId,
        eventType: "ai_task.access_denied",
        taskId: data.taskId,
        payload: { scope: "view", reason: error ? "rls_error" : "not_visible" },
      });
      return denied;
    }

    const uid = context.userId;
    let elevated = task.human_owner_id === uid || task.created_by === uid;

    if (!elevated) {
      const { data: tm } = await context.supabase
        .from("tenant_members")
        .select("role, status")
        .eq("tenant_id", task.tenant_id)
        .eq("user_id", uid)
        .maybeSingle();
      if (tm && tm.status === "active" && MANAGER_ROLES.has(String(tm.role))) elevated = true;
    }

    if (!elevated && task.workspace_id) {
      const { data: wm } = await context.supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", task.workspace_id)
        .eq("user_id", uid)
        .maybeSingle();
      if (wm && MANAGER_ROLES.has(String(wm.role))) elevated = true;
    }

    if (!elevated) {
      await logAiTaskAudit({
        tenantId: task.tenant_id,
        actorId: context.userId,
        eventType: "ai_task.access_readonly",
        taskId: data.taskId,
        payload: { scope: "manage", workspace_id: task.workspace_id },
      });
    }

    return { canView: true, canManage: elevated, canReview: elevated, reason: "OK" };
  });

/** Danh sách nhân sự AI của tổ chức (tự seed 3 hồ sơ mặc định nếu chưa có). */
export const listAiWorkers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AiWorkerRow[]> => {
    const res = await context.supabase.rpc("ensure_default_ai_workers" as never, {
      _tenant_id: data.tenantId,
    } as never);
    if (res.error) mapPgError(res.error, "AI_WORKER_NOT_FOUND");
    return (res.data ?? []) as unknown as AiWorkerRow[];
  });

/** Lịch sử các lượt AI thực thi của một công việc (bất biến, mỗi lần sửa là một revision mới). */
export const listAiTaskExecutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AiTaskExecutionRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("ai_task_executions" as never)
      .select("*")
      .eq("task_id", data.taskId)
      .order("revision", { ascending: false });
    if (error) mapPgError(error, "AI_EXECUTION_NOT_FOUND");
    return (rows ?? []) as unknown as AiTaskExecutionRow[];
  });

/** WEE-1 — timeline các bước của một lượt thực thi (chỉ đọc, RLS theo tổ chức). */
export const listWorkExecutionSteps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ executionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<WorkExecutionStepRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("work_execution_steps" as never)
      .select("*")
      .eq("execution_id", data.executionId)
      .order("seq", { ascending: true });
    if (error) return [];
    return (rows ?? []) as unknown as WorkExecutionStepRow[];
  });



/** Giao công việc cho nhân sự AI (bắt buộc có deliverable + tiêu chí nghiệm thu). */
export const assignTaskToAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        taskId: z.string().uuid(),
        aiWorkerId: z.string().uuid(),
        expectedDeliverable: z.string().trim().min(1).max(2000),
        acceptanceCriteria: z.string().trim().min(1).max(2000),
        idempotencyKey: z.string().min(8).max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; taskId: string; aiWorkerId: string }> => {
    const res = await context.supabase.rpc("assign_task_to_ai" as never, {
      _task_id: data.taskId,
      _ai_worker_id: data.aiWorkerId,
      _expected_deliverable: data.expectedDeliverable,
      _acceptance_criteria: data.acceptanceCriteria,
      _idempotency_key: data.idempotencyKey ?? `assign-ai:${data.taskId}:${data.aiWorkerId}`,
    } as never);
    if (res.error) mapPgError(res.error, "TASK_NOT_FOUND");
    return { ok: true as const, taskId: data.taskId, aiWorkerId: data.aiWorkerId };
  });

/** Bắt đầu một lượt AI thực thi và trả về bản nháp ở trạng thái CHỜ NGƯỜI DUYỆT. */
export const runAiTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        taskId: z.string().uuid(),
        templateCode: z.string().max(60).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<AiTaskExecutionRow> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new ApiError({ code: "AI_PROVIDER_UNAVAILABLE", message: "Nhân sự AI hiện chưa sẵn sàng." });
    }

    const briefRes = await context.supabase.rpc("get_ai_task_brief" as never, { _task_id: data.taskId } as never);
    if (briefRes.error) mapPgError(briefRes.error, "TASK_NOT_FOUND");
    const t = (briefRes.data ?? null) as Record<string, unknown> | null;
    if (!t) throw new ApiError({ code: "TASK_NOT_FOUND", message: "Không tìm thấy công việc." });
    const w = (t["worker"] ?? null) as AiWorkerRow | null;
    if (!w) throw new ApiError({ code: "AI_WORKER_NOT_ASSIGNED", message: "Công việc chưa được giao cho nhân sự AI." });
    if (!t["expected_deliverable"] || !t["acceptance_criteria"]) {
      throw new ApiError({ code: "AI_TASK_SPEC_REQUIRED", message: "Cần mô tả sản phẩm bàn giao và tiêu chí nghiệm thu." });
    }

    await logAiTaskAudit({
      tenantId: (t["tenant_id"] as string | null) ?? null,
      actorId: context.userId,
      eventType: "ai_task.run_requested",
      taskId: data.taskId,
      payload: {
        template_code: data.templateCode ?? "SUMMARY_REPORT",
        ai_worker_id: w.id,
        workspace_id: (t["workspace_id"] as string | null) ?? null,
      },
    });

    // 1. Mở lượt chạy (RPC kiểm tra quyền tenant + workspace, ghi audit + outbox).
    const startRes = await context.supabase.rpc("start_ai_task_execution" as never, {
      _task_id: data.taskId,
      _template_code: data.templateCode ?? "SUMMARY_REPORT",
    } as never);
    if (startRes.error) mapPgError(startRes.error, "AI_EXECUTION_NOT_FOUND");
    const exec = one<AiTaskExecutionRow>(startRes.data);

    // 2. Chạy pipeline WEE-1 (chỉ đọc, qua AI Context Engine với RLS của chính người dùng).
    const template = templateByCode(data.templateCode ?? exec.template_code);
    try {
      const { orchestrateWorkExecution } = await import("./work-execution.server");
      const run = await orchestrateWorkExecution({
        supabase: context.supabase as never,
        userId: context.userId,
        tenantId: String(t["tenant_id"] ?? ""),
        tenantHint: getCookie(ACTIVE_TENANT_COOKIE) ?? null,
        executionId: exec.id,
        apiKey,
        spec: {
          taskId: data.taskId,
          workspaceId: t["workspace_id"] as string,
          title: String(t["title"] ?? ""),
          description: (t["description"] as string | null) ?? null,
          expectedDeliverable: String(t["expected_deliverable"]),
          acceptanceCriteria: String(t["acceptance_criteria"]),
          workerName: w.name,
          workerRole: w.role,
          workerSkills: w.skills ?? [],
          template,
          changeRequest: exec.change_request,
        },
      });

      // 3. Kết thúc lượt chạy: LUÔN dừng ở WAITING_REVIEW — AI không thể tự nghiệm thu.
      const finish = await context.supabase.rpc("finish_ai_task_execution" as never, {
        _execution_id: exec.id,
        _status: "WAITING_REVIEW",
        _deliverable_type: run.deliverableType,
        _deliverable_title: run.deliverableTitle,
        _deliverable_content: run.deliverableContent,
        _source_refs: run.sourceRefs,
        _evidence: {
          ...run.evidence,
          validationScore: run.validation.score,
          validationPassed: run.validation.passed,
          proposedActionCount: run.proposedActionIds.length,
        },
      } as never);
      if (finish.error) mapPgError(finish.error, "AI_EXECUTION_NOT_FOUND");
      await logAiTaskAudit({
        tenantId: (t["tenant_id"] as string | null) ?? null,
        actorId: context.userId,
        eventType: "ai_task.run_completed",
        taskId: data.taskId,
        payload: {
          execution_id: exec.id,
          status: "WAITING_REVIEW",
          validation_score: run.validation.score,
          proposed_actions: run.proposedActionIds.length,
        },
      });
      return one<AiTaskExecutionRow>(finish.data);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "AI_PROVIDER_UNAVAILABLE";
      await context.supabase.rpc("finish_ai_task_execution" as never, {
        _execution_id: exec.id,
        _status: "FAILED",
        _error_code: code,
      } as never);
      await logAiTaskAudit({
        tenantId: (t["tenant_id"] as string | null) ?? null,
        actorId: context.userId,
        eventType: "ai_task.run_failed",
        taskId: data.taskId,
        payload: { execution_id: exec.id, error_code: code },
      });
      throw new ApiError({ code: "AI_PROVIDER_UNAVAILABLE", message: "Nhân sự AI không hoàn thành được lượt chạy này." });
    }
  });

/** Người duyệt yêu cầu chỉnh sửa — lượt sau sẽ là một revision mới. */
export const requestAiTaskChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ executionId: z.string().uuid(), feedback: z.string().trim().min(1).max(4000) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<AiTaskExecutionRow> => {
    const res = await context.supabase.rpc("request_ai_execution_changes" as never, {
      _execution_id: data.executionId,
      _feedback: data.feedback,
    } as never);
    if (res.error) mapPgError(res.error, "AI_EXECUTION_NOT_REVIEWABLE");
    return one<AiTaskExecutionRow>(res.data);
  });

/** Nghiệm thu — CHỈ con người có trách nhiệm; tuỳ chọn hoàn tất công việc. */
export const acceptAiTaskExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        executionId: z.string().uuid(),
        completeTask: z.boolean().default(true),
        idempotencyKey: z.string().min(8).max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<AiTaskExecutionRow> => {
    const res = await context.supabase.rpc("accept_ai_task_execution" as never, {
      _execution_id: data.executionId,
      _complete_task: data.completeTask,
      _idempotency_key: data.idempotencyKey ?? `accept-ai:${data.executionId}`,
    } as never);
    if (res.error) mapPgError(res.error, "AI_REVIEW_FORBIDDEN");
    return one<AiTaskExecutionRow>(res.data);
  });
