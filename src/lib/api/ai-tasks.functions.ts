// AI TASK EXECUTION V1 — endpoint tin cậy cho vòng đời: giao việc → AI chạy → chờ duyệt → nghiệm thu.
// Mọi mutation đi qua RPC SECURITY DEFINER; AI không bao giờ tự nghiệm thu.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { DELIVERABLE_TEMPLATES, templateByCode, type AiTaskExecutionRow, type AiWorkerRow } from "@/domain/ai-tasks/contracts";
import {
  WORK_STEP_KINDS,
  STEP_CANCELED_CODE,
  canRetryStepInPlace,
  type WorkExecutionStepRow,
} from "@/domain/work-execution/contracts";
import {
  buildTimelineExport,
  buildTimelineGolden,
  type TimelineExportBundle,
  type TimelineGoldenBundle,
} from "@/domain/work-execution/timeline-export";
import { meterWorkExecution } from "./work-economics.server";
import { mapPgError } from "./business.server";


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

/** WEE-1 — xuất timeline.json + bản golden để đối chiếu hard reload / regression. */
export const exportWorkExecutionTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ executionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ timeline: TimelineExportBundle; golden: TimelineGoldenBundle }> => {
    const { data: exec, error } = await context.supabase
      .from("ai_task_executions" as never)
      .select("*")
      .eq("id", data.executionId)
      .maybeSingle();
    if (error) mapPgError(error, "AI_EXECUTION_NOT_FOUND");
    if (!exec) throw new ApiError({ code: "AI_EXECUTION_NOT_FOUND", message: "Không tìm thấy lượt thực thi." });
    const { data: steps } = await context.supabase
      .from("work_execution_steps" as never)
      .select("*")
      .eq("execution_id", data.executionId)
      .order("seq", { ascending: true });
    const timeline = buildTimelineExport({
      execution: exec as unknown as Record<string, unknown>,
      steps: (steps ?? []) as unknown as WorkExecutionStepRow[],
    });
    return { timeline, golden: buildTimelineGolden(timeline) };
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
  .inputValidator((i: unknown) => {
    const parsed = z
      .object({
        taskId: z.string().uuid(),
        // FAIL-CLOSED: chỉ chấp nhận mã mẫu có trong sổ đăng ký; mã lạ sẽ né được
        // hợp đồng sản phẩm công việc (không có contract ⇒ không ràng buộc).
        templateCode: z
          .enum(DELIVERABLE_TEMPLATES.map((t) => t.code) as [string, ...string[]])
          .optional(),
      })
      .safeParse(i);
    if (!parsed.success) {
      // Trả đúng hợp đồng lỗi ổn định thay vì ZodError thô (client chỉ đọc `code`).
      // Qua ranh giới RPC chỉ `message` sống sót, nên mã ổn định phải nằm ở đầu
      // message (đúng quy ước hiện hành: client so khớp bằng `code`, không parse văn bản).
      const fields = parsed.error.issues.map((iss) => iss.path.join(".")).filter(Boolean);
      throw new ApiError({
        code: "VALIDATION_FAILED",
        message: `VALIDATION_FAILED: ${fields.join(",") || "input"} | allowed=${DELIVERABLE_TEMPLATES.map((t) => t.code).join(",")}`,
        details: { fields, allowedTemplateCodes: DELIVERABLE_TEMPLATES.map((t) => t.code) },
      });
    }
    return parsed.data;
  })


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

    // 1. WE-2 PREFLIGHT — hợp đồng sản phẩm công việc phải hợp lệ TRƯỚC khi mở lượt chạy.
    const templateCode = data.templateCode ?? "SUMMARY_REPORT";
    const { loadWorkProductByTemplate, validateWorkProductExecution, bindWorkProductExecution } = await import(
      "./work-products.server"
    );
    const contract = await loadWorkProductByTemplate(context.supabase as never, templateCode);
    let preflightInputs: Record<string, string> = {};
    if (contract) {
      const preflight = await validateWorkProductExecution({
        supabase: context.supabase as never,
        contract,
        rawInputs: {
          ...(t["project_id"] ? { project_id: String(t["project_id"]) } : {}),
          ...(t["meeting_id"] ? { meeting_id: String(t["meeting_id"]) } : {}),
        },
        worker: w as never,
        tenantId: (t["tenant_id"] as string | null) ?? null,
        workspaceId: (t["workspace_id"] as string | null) ?? null,
      });
      if (!preflight.ready) {
        throw new ApiError({
          code: "WORK_PRODUCT_PREFLIGHT_FAILED",
          message: preflight.issues.map((x) => x.message).join(" "),
        });
      }
      preflightInputs = preflight.inputs;
    }

    // 2. Mở lượt chạy (RPC kiểm tra quyền tenant + workspace, ghi audit + outbox).
    const startRes = await context.supabase.rpc("start_ai_task_execution" as never, {
      _task_id: data.taskId,
      _template_code: templateCode,
    } as never);
    if (startRes.error) mapPgError(startRes.error, "AI_EXECUTION_NOT_FOUND");
    const exec = one<AiTaskExecutionRow>(startRes.data);

    // HARDEN-SELLWORK-1 — Gắn bản chụp hợp đồng bất biến TRƯỚC mọi lời gọi AI.
    // Sản phẩm công việc chuẩn hoá KHÔNG được chạy khi bản chụp chưa gắn được:
    // không GENERATE, không đề xuất hành động, không lượt chạy "giả hợp đồng".
    // Công việc AI cũ (không có hợp đồng) giữ nguyên đường chạy tương thích.
    if (contract) {
      try {
        await bindWorkProductExecution(context.supabase as never, exec.id, contract, preflightInputs);
      } catch (e) {
        const code = e instanceof Error && e.message === "WORK_PRODUCT_CONTRACT_MISMATCH"
          ? "WORK_PRODUCT_CONTRACT_MISMATCH"
          : "WORK_PRODUCT_BIND_FAILED";
        await context.supabase.rpc("finish_ai_task_execution" as never, {
          _execution_id: exec.id,
          _status: "FAILED",
          _error_code: code,
        } as never);
        throw new ApiError({
          code,
          message: "Không gắn được bản chụp hợp đồng sản phẩm công việc — lượt chạy đã dừng an toàn.",
        });
      }
    }

    // 2. Chạy pipeline WEE-1 (chỉ đọc, qua AI Context Engine với RLS của chính người dùng).
    const template = templateByCode(data.templateCode ?? exec.template_code);
    try {
      const { orchestrateWorkExecution } = await import("./work-execution.server");
      const run = await orchestrateWorkExecution({
        supabase: context.supabase as never,
        userId: context.userId,
        tenantId: String(t["tenant_id"] ?? ""),
        tenantHint: (await import("./active-tenant.server")).readActiveTenantCookie(),
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
        workerRow: w as unknown as Record<string, unknown>,
        projectId: (t["project_id"] as string | null) ?? null,
        revision: exec.revision,
        contract,
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
          awaitingActionConfirmation: run.paused,
          proposedActionIds: run.proposedActionIds,
        },
      } as never);
      if (finish.error) mapPgError(finish.error, "AI_EXECUTION_NOT_FOUND");
      await meterWorkExecution(context.supabase, exec.id);
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
      await meterWorkExecution(context.supabase, exec.id);
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

/**
 * WEE-3 — dựng lại ngữ cảnh chất lượng cho các đường chạy tiếp/thử lại.
 * Context Pack được dựng lại bằng RLS của chính actor để kiểm chứng trích dẫn;
 * nếu không dựng được, pack = null và bộ kiểm sẽ hạ điểm chiều bằng chứng.
 */
async function buildQualityContext(input: {
  supabase: unknown;
  userId: string;
  exec: AiTaskExecutionRow;
  brief: Record<string, unknown>;
  worker: AiWorkerRow | null;
  proposalIds: string[];
}) {
  const { buildAiContextPack } = await import("./ai-context.server");
  const { readActiveTenantCookie } = await import("./active-tenant.server");
  let pack = null as Awaited<ReturnType<typeof buildAiContextPack>> | null;
  try {
    pack = await buildAiContextPack(input.supabase as never, input.userId, readActiveTenantCookie(), {
      query: `${String(input.brief["title"] ?? "")} ${String(input.brief["expected_deliverable"] ?? "")}`.slice(0, 500),
      rootEntity: { type: "TASK", id: input.exec.task_id },
      workspaceId: (input.brief["workspace_id"] as string | null) ?? null,
    });
  } catch {
    pack = null;
  }
  return {
    tenantId: String(input.brief["tenant_id"] ?? ""),
    revision: input.exec.revision,
    workspaceId: (input.brief["workspace_id"] as string | null) ?? null,
    pack,
    plan: [],
    proposalIds: input.proposalIds,
    deliverableType: input.exec.deliverable_type,
    deliverableTitle: input.exec.deliverable_title,
    sourceRefs: input.exec.source_refs ?? [],
    aiWorkerId: input.worker?.id ?? null,
    aiWorkerName: input.worker?.name ?? null,
    generatorModel: input.exec.evidence?.model ?? null,
    generatorInputTokens: input.exec.evidence?.inputTokens ?? 0,
    generatorOutputTokens: input.exec.evidence?.outputTokens ?? 0,
    startedAt: input.exec.started_at,
  };
}

/**
 * WEE-1 — Tiếp tục lượt chạy đang tạm dừng ở bước ACTION.
 * Chỉ chạy được khi mọi đề xuất hành động đã được người dùng xác nhận hoặc huỷ;
 * hàm này KHÔNG thực thi đề xuất nào (việc đó thuộc AI Action Layer).
 */
export const resumeAiTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ executionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AiTaskExecutionRow> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new ApiError({ code: "AI_PROVIDER_UNAVAILABLE", message: "Nhân sự AI hiện chưa sẵn sàng." });
    }

    const { data: execRow, error: execErr } = await context.supabase
      .from("ai_task_executions" as never)
      .select("*")
      .eq("id", data.executionId)
      .maybeSingle();
    if (execErr) mapPgError(execErr, "AI_EXECUTION_NOT_FOUND");
    const exec = execRow as unknown as AiTaskExecutionRow | null;
    if (!exec) throw new ApiError({ code: "AI_EXECUTION_NOT_FOUND", message: "Không tìm thấy lượt chạy." });
    const actionIds = exec.evidence?.proposedActionIds ?? [];
    if (!exec.evidence?.awaitingActionConfirmation || actionIds.length === 0) {
      throw new ApiError({
        code: "AI_EXECUTION_NOT_PAUSED",
        message: "Lượt chạy này không đang tạm dừng chờ xác nhận đề xuất.",
      });
    }

    const briefRes = await context.supabase.rpc("get_ai_task_brief" as never, { _task_id: exec.task_id } as never);
    if (briefRes.error) mapPgError(briefRes.error, "TASK_NOT_FOUND");
    const t = (briefRes.data ?? null) as Record<string, unknown> | null;
    if (!t) throw new ApiError({ code: "TASK_NOT_FOUND", message: "Không tìm thấy công việc." });
    const w = (t["worker"] ?? null) as AiWorkerRow | null;

    const { resumeWorkExecutionAfterAction } = await import("./work-execution.server");
    const outcome = await resumeWorkExecutionAfterAction({
      supabase: context.supabase as never,
      executionId: exec.id,
      actionIds,
      deliverableContent: exec.deliverable_content ?? "",
      apiKey,
      spec: {
        taskId: exec.task_id,
        workspaceId: (t["workspace_id"] as string) ?? "",
        title: String(t["title"] ?? ""),
        description: (t["description"] as string | null) ?? null,
        expectedDeliverable: String(t["expected_deliverable"] ?? ""),
        acceptanceCriteria: String(t["acceptance_criteria"] ?? ""),
        workerName: w?.name ?? "AI",
        workerRole: w?.role ?? "",
        workerSkills: w?.skills ?? [],
        template: templateByCode(exec.template_code),
        changeRequest: exec.change_request,
      },
      quality: await buildQualityContext({
        supabase: context.supabase,
        userId: context.userId,
        exec,
        brief: t,
        worker: w,
        proposalIds: actionIds,
      }),
    });

    if (outcome.pendingActions > 0) {
      throw new ApiError({
        code: "AI_ACTIONS_PENDING",
        message: `Còn ${outcome.pendingActions} đề xuất chưa được xác nhận hoặc huỷ.`,
      });
    }

    const finish = await context.supabase.rpc("finish_ai_task_execution" as never, {
      _execution_id: exec.id,
      _status: "WAITING_REVIEW",
      _deliverable_type: exec.deliverable_type,
      _deliverable_title: exec.deliverable_title,
      _deliverable_content: exec.deliverable_content,
      _source_refs: exec.source_refs ?? [],
      _evidence: {
        ...exec.evidence,
        awaitingActionConfirmation: false,
        validationScore: outcome.validation.score,
        validationPassed: outcome.validation.passed,
        limitations: [
          ...(exec.evidence?.limitations ?? []).filter((l) => !l.startsWith("Đang chờ bạn xác nhận")),
          ...(outcome.validation.passed
            ? []
            : [`Tự chấm ${outcome.validation.score}/100 — có tiêu chí nghiệm thu chưa đạt.`]),
        ],
      },
    } as never);
    if (finish.error) mapPgError(finish.error, "AI_EXECUTION_NOT_FOUND");
    await meterWorkExecution(context.supabase, exec.id);

    await logAiTaskAudit({
      tenantId: (t["tenant_id"] as string | null) ?? null,
      actorId: context.userId,
      eventType: "ai_task.run_resumed",
      taskId: exec.task_id,
      payload: {
        execution_id: exec.id,
        resolved_actions: outcome.resolvedActions,
        validation_score: outcome.validation.score,
      },
    });
    return one<AiTaskExecutionRow>(finish.data);
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
    await meterWorkExecution(context.supabase, data.executionId);
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
    await meterWorkExecution(context.supabase, data.executionId);
    return one<AiTaskExecutionRow>(res.data);
  });

/* ------------------------- WEE-1: RETRY / CANCEL BƯỚC ------------------------- */

/** Chỉ chủ sở hữu việc, người tạo hoặc vai trò quản lý mới được retry/huỷ bước. */
async function assertCanManageTask(
  supabase: { from: (t: string) => never },
  userId: string,
  taskId: string,
): Promise<Record<string, unknown>> {
  const sb = supabase as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
        };
      };
    };
  };
  const { data: task } = await sb.from("tasks").select("id, tenant_id, workspace_id, human_owner_id, created_by").eq("id", taskId).maybeSingle();
  if (!task) throw new ApiError({ code: "TASK_NOT_FOUND", message: "Không tìm thấy công việc." });
  let ok = task["human_owner_id"] === userId || task["created_by"] === userId;
  if (!ok) {
    const { data: tm } = await sb
      .from("tenant_members")
      .select("role, status")
      .eq("tenant_id", String(task["tenant_id"] ?? ""))
      .eq("user_id", userId)
      .maybeSingle();
    if (tm && tm["status"] === "active" && MANAGER_ROLES.has(String(tm["role"]))) ok = true;
  }
  if (!ok && task["workspace_id"]) {
    const { data: wm } = await sb
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", String(task["workspace_id"]))
      .eq("user_id", userId)
      .maybeSingle();
    if (wm && MANAGER_ROLES.has(String(wm["role"]))) ok = true;
  }
  if (!ok) throw new ApiError({ code: "PERMISSION_DENIED", message: "Bạn không có quyền thao tác trên lượt chạy này." });
  return task;
}

async function loadFailedStep(
  supabase: { from: (t: string) => never },
  executionId: string,
  kind: string,
): Promise<WorkExecutionStepRow> {
  const sb = supabase as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
        };
      };
    };
  };
  const { data } = await sb.from("work_execution_steps").select("*").eq("execution_id", executionId).eq("kind", kind).maybeSingle();
  const step = data as WorkExecutionStepRow | null;
  if (!step) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy bước này." });
  if (step.status !== "FAILED") {
    throw new ApiError({ code: "AI_STEP_NOT_FAILED", message: "Chỉ có thể thử lại hoặc huỷ bước đang ở trạng thái Thất bại." });
  }
  return step;
}

async function loadExecution(
  supabase: { from: (t: string) => never },
  executionId: string,
): Promise<AiTaskExecutionRow> {
  const sb = supabase as never as {
    from: (t: string) => {
      select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } };
    };
  };
  const { data } = await sb.from("ai_task_executions").select("*").eq("id", executionId).maybeSingle();
  const exec = data as AiTaskExecutionRow | null;
  if (!exec) throw new ApiError({ code: "AI_EXECUTION_NOT_FOUND", message: "Không tìm thấy lượt chạy." });
  return exec;
}

/**
 * WEE-1 — Thử lại một bước đã FAILED, an toàn:
 *  - Chỉ các bước cuối (ACTION/VALIDATE/REVIEW) chạy lại tại chỗ trên đúng bản bàn giao đã có.
 *  - Các bước đầu (CONTEXT/PLAN/GENERATE) phải chạy lại bằng revision mới (nút "Chạy lại").
 *  - Không thực thi bất kỳ đề xuất hành động nào.
 */
export const retryWorkExecutionStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ executionId: z.string().uuid(), kind: z.enum(WORK_STEP_KINDS) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<AiTaskExecutionRow> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ApiError({ code: "AI_PROVIDER_UNAVAILABLE", message: "Nhân sự AI hiện chưa sẵn sàng." });

    const exec = await loadExecution(context.supabase as never, data.executionId);
    const task = await assertCanManageTask(context.supabase as never, context.userId, exec.task_id);
    await loadFailedStep(context.supabase as never, data.executionId, data.kind);

    if (!canRetryStepInPlace(data.kind)) {
      throw new ApiError({
        code: "AI_STEP_RETRY_NEEDS_NEW_REVISION",
        message: "Bước này cần chạy lại bằng một lượt mới để đảm bảo an toàn dữ liệu.",
      });
    }

    const briefRes = await context.supabase.rpc("get_ai_task_brief" as never, { _task_id: exec.task_id } as never);
    if (briefRes.error) mapPgError(briefRes.error, "TASK_NOT_FOUND");
    const t = (briefRes.data ?? {}) as Record<string, unknown>;
    const w = (t["worker"] ?? null) as AiWorkerRow | null;

    const { retryWorkExecutionStepInPlace } = await import("./work-execution.server");
    const retryQuality = await buildQualityContext({
      supabase: context.supabase,
      userId: context.userId,
      exec,
      brief: t,
      worker: w,
      proposalIds: exec.evidence?.proposedActionIds ?? [],
    });
    const retryResult = await retryWorkExecutionStepInPlace({
      quality: retryQuality,
      supabase: context.supabase as never,
      executionId: exec.id,
      kind: data.kind,
      deliverableContent: exec.deliverable_content ?? "",
      apiKey,
      spec: {
        taskId: exec.task_id,
        workspaceId: (t["workspace_id"] as string) ?? "",
        title: String(t["title"] ?? ""),
        description: (t["description"] as string | null) ?? null,
        expectedDeliverable: String(t["expected_deliverable"] ?? ""),
        acceptanceCriteria: String(t["acceptance_criteria"] ?? ""),
        workerName: w?.name ?? "AI",
        workerRole: w?.role ?? "",
        workerSkills: w?.skills ?? [],
        template: templateByCode(exec.template_code),
        changeRequest: exec.change_request,
      },
    });
    const validation = retryResult.validation;

    const finish = await context.supabase.rpc("finish_ai_task_execution" as never, {
      _execution_id: exec.id,
      _status: "WAITING_REVIEW",
      _deliverable_type: exec.deliverable_type,
      _deliverable_title: exec.deliverable_title,
      _deliverable_content: exec.deliverable_content,
      _source_refs: exec.source_refs ?? [],
      _evidence: {
        ...exec.evidence,
        awaitingActionConfirmation: false,
        validationScore: validation.score,
        validationPassed: validation.passed,
      },
    } as never);
    if (finish.error) mapPgError(finish.error, "AI_EXECUTION_NOT_FOUND");
    await meterWorkExecution(context.supabase, exec.id);

    await logAiTaskAudit({
      tenantId: (task["tenant_id"] as string | null) ?? null,
      actorId: context.userId,
      eventType: "ai_task.step_retried",
      taskId: exec.task_id,
      payload: { execution_id: exec.id, step_kind: data.kind, validation_score: validation.score },
    });
    return one<AiTaskExecutionRow>(finish.data);
  });

/** WEE-1 — Huỷ một bước đã FAILED: đánh dấu bỏ qua và đóng lượt chạy ở trạng thái FAILED. */
export const cancelWorkExecutionStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        executionId: z.string().uuid(),
        kind: z.enum(WORK_STEP_KINDS),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const exec = await loadExecution(context.supabase as never, data.executionId);
    const task = await assertCanManageTask(context.supabase as never, context.userId, exec.task_id);
    await loadFailedStep(context.supabase as never, data.executionId, data.kind);

    const { cancelWorkExecutionStepInPlace } = await import("./work-execution.server");
    await cancelWorkExecutionStepInPlace(context.supabase as never, exec.id, data.kind, data.reason ?? null);

    if (exec.status === "RUNNING" || exec.status === "QUEUED") {
      await context.supabase.rpc("finish_ai_task_execution" as never, {
        _execution_id: exec.id,
        _status: "FAILED",
        _error_code: STEP_CANCELED_CODE,
      } as never);
    }

    await logAiTaskAudit({
      tenantId: (task["tenant_id"] as string | null) ?? null,
      actorId: context.userId,
      eventType: "ai_task.step_canceled",
      taskId: exec.task_id,
      payload: { execution_id: exec.id, step_kind: data.kind, reason: data.reason ?? null },
    });
    return { ok: true as const };
  });
