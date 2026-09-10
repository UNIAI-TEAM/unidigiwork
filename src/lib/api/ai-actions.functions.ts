// AI ACTION LAYER V1 — endpoint: propose / confirm / cancel / list.
// Mọi ghi dữ liệu chỉ xảy ra trong confirmAiAction, sau xác nhận tường minh của người dùng.
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import {
  ACTION_ERROR_MESSAGE,
  AI_ACTION_SOURCES,
  AI_ACTION_TOOLS,
  AI_ACTION_TYPES,
  detectActionIntent,
  isAllowedActionType,
  type AiActionExecutionResult,
  type AiActionType,
  type ProposedAiAction,
} from "@/domain/ai-actions/contracts";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";

const fail = (code: string, message?: string) =>
  new ApiError({
    code: code as never,
    message: message ?? ACTION_ERROR_MESSAGE[code] ?? "Không thể thực hiện hành động.",
  });

const ProposeSchema = z.object({
  query: z.string().min(2).max(500),
  actionType: z.enum(AI_ACTION_TYPES).nullish(),
  source: z.enum(AI_ACTION_SOURCES).default("UNI_COPILOT"),
  workspaceId: z.string().uuid().nullish(),
  targetTaskId: z.string().uuid().nullish(),
  rootEntity: z.object({ type: z.string().max(40), id: z.string().uuid() }).nullish(),
  sourceRefs: z
    .array(
      z.object({
        sourceId: z.string().max(20),
        entityType: z.string().max(40),
        entityId: z.string().uuid(),
        title: z.string().max(300),
        href: z.string().max(300),
      }),
    )
    .max(10)
    .optional(),
});

export const proposeAiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ProposeSchema.parse(i))
  .handler(async ({ data, context }): Promise<ProposedAiAction> => {
    const {
      resolveActorWorkspace,
      listWorkspacePeople,
      matchPeople,
      resolveDueDate,
      extractActionFields,
      buildPreviewRows,
    } = await import("./ai-actions.server");

    const intent = detectActionIntent(data.query);
    if (intent.kind === "BLOCKED") {
      throw fail(
        "ACTION_TYPE_NOT_ALLOWED",
        intent.reason === "SEND_EMAIL"
          ? "UNI V1 chỉ tạo được thư nháp, chưa được phép gửi email. Bạn hãy mở nháp và tự gửi."
          : "UNI V1 không được phép xoá dữ liệu.",
      );
    }
    const actionType: AiActionType | null =
      (data.actionType as AiActionType | null | undefined) ??
      (intent.kind === "PROPOSE" ? intent.actionType : null);
    if (!actionType || !isAllowedActionType(actionType)) {
      throw fail(
        "ACTION_TYPE_NOT_ALLOWED",
        "Hãy nêu rõ hành động: tạo công việc, cập nhật công việc, đặt lịch họp hoặc soạn thư nháp.",
      );
    }

    const tenantId = getCookie(ACTIVE_TENANT_COOKIE) ?? null;
    const scope = await resolveActorWorkspace(context as never, tenantId, data.workspaceId ?? null);

    // Hồ sơ kỹ năng AI quyết định AI được đề xuất gì. Nếu tổ chức có khai báo kỹ năng
    // cho loại hành động này mà tất cả đều đang tắt → không cho đề xuất.
    {
      const { data: skillRows } = await context.supabase
        .from("ai_skills")
        .select("name, enabled, action_types")
        .is("deleted_at", null)
        .contains("action_types", [actionType]);
      const rows = skillRows ?? [];
      if (rows.length > 0 && !rows.some((r) => r.enabled === true)) {
        throw fail(
          "ACTION_TYPE_NOT_ALLOWED",
          `Kỹ năng "${rows[0]?.name ?? actionType}" đang tắt trong Hồ sơ kỹ năng AI nên AI không được đề xuất hành động này.`,
        );
      }
    }

    // Ngữ cảnh grounding (best-effort, chỉ đọc).
    let contextBlock = "";
    let sourceRefs = data.sourceRefs ?? [];
    if (data.rootEntity) {
      try {
        const { buildAiContextPack, renderContextForModel } = await import("./ai-context.server");
        const pack = await buildAiContextPack(context.supabase, context.userId, tenantId, {
          query: data.query,
          rootEntity: data.rootEntity as never,
          workspaceId: scope.workspaceId,
        });
        contextBlock = renderContextForModel(pack).slice(0, 6000);
        if (sourceRefs.length === 0) {
          sourceRefs = (pack.sources ?? []).slice(0, 5).map((s: any) => ({
            sourceId: s.sourceId,
            entityType: s.entityType,
            entityId: s.entityId,
            title: s.title,
            href: s.href,
          }));
        }
      } catch {
        contextBlock = "";
      }
    }

    const { fields } = await extractActionFields(actionType, data.query, contextBlock);
    const people = await listWorkspacePeople(context as never, scope.workspaceId);
    const wsRow = await context.supabase
      .from("workspaces")
      .select("name")
      .eq("id", scope.workspaceId)
      .maybeSingle();

    const ambiguities: ProposedAiAction["ambiguities"] = [];
    let assigneeId: string | null = null;
    let assigneeLabel: string | null = null;
    if (fields.assigneeName) {
      const hits = matchPeople(people, fields.assigneeName);
      if (hits.length === 1) {
        assigneeId = hits[0]!.id;
        assigneeLabel = hits[0]!.label;
      } else if (hits.length > 1) {
        ambiguities.push({
          field: "assigneeId",
          message: `Có ${hits.length} người khớp "${fields.assigneeName}". Hãy chọn một người.`,
          candidates: hits,
        });
      } else {
        ambiguities.push({
          field: "assigneeId",
          message: `Không tìm thấy "${fields.assigneeName}" trong workspace. Hãy chọn người phụ trách.`,
          candidates: people.slice(0, 20).map((p) => ({ id: p.id, label: p.label })),
        });
      }
    }

    const dueAt = resolveDueDate(fields.dueText ?? data.query);
    const now = new Date();
    let payload: Record<string, unknown>;
    let targetType: string | null = null;
    let targetId: string | null = null;
    let expectedRowVersion: number | null = null;
    let participantLabels: string[] = [];

    if (actionType === "CREATE_TASK") {
      payload = {
        workspaceId: scope.workspaceId,
        title: (fields.title ?? "").slice(0, 500) || data.query.slice(0, 200),
        description: fields.description,
        priority: fields.priority ?? "normal",
        dueAt,
        assigneeId,
      };
    } else if (actionType === "UPDATE_TASK_FIELDS") {
      const taskId =
        data.targetTaskId ?? (data.rootEntity?.type === "TASK" ? data.rootEntity.id : null);
      if (!taskId) throw fail("ACTION_NOT_FOUND", "Hãy mở công việc cần cập nhật rồi yêu cầu UNI.");
      const { readTaskTarget } = await import("./ai-actions.server");
      const task = await readTaskTarget(context as never, taskId);
      if (!task) throw fail("ACTION_NOT_FOUND");
      targetType = "TASK";
      targetId = task.id;
      expectedRowVersion = task.rowVersion;
      payload = {
        taskId: task.id,
        title: fields.title && fields.title !== task.title ? fields.title : undefined,
        priority: fields.priority,
        dueAt,
        assigneeId,
      };
    } else if (actionType === "CREATE_MEETING") {
      const startAt = dueAt ?? null;
      if (!startAt) {
        ambiguities.push({
          field: "startAt",
          message: "Chưa rõ thời điểm họp. Hãy chọn ngày giờ bắt đầu.",
          candidates: [],
        });
      }
      const duration = fields.durationMinutes ?? 60;
      const end = startAt
        ? new Date(new Date(startAt).getTime() + duration * 60_000).toISOString()
        : null;
      const participantIds: string[] = [];
      for (const name of fields.participantNames ?? []) {
        const hits = matchPeople(people, name);
        if (hits.length === 1) {
          participantIds.push(hits[0]!.id);
          participantLabels.push(hits[0]!.label);
        } else if (hits.length > 1) {
          ambiguities.push({
            field: "participantIds",
            message: `Có ${hits.length} người khớp "${name}". Hãy chọn.`,
            candidates: hits,
          });
        }
      }
      payload = {
        workspaceId: scope.workspaceId,
        title: (fields.title ?? "Cuộc họp").slice(0, 500),
        startAt: startAt ?? new Date(now.getTime() + 3600_000).toISOString(),
        endAt: end ?? new Date(now.getTime() + 2 * 3600_000).toISOString(),
        agenda: fields.description,
        participantIds,
      };
    } else {
      const emails = (fields.recipients ?? []).filter((r) => /.+@.+\..+/.test(r));
      payload = {
        to: emails,
        cc: [],
        subject: (fields.subject ?? fields.title ?? "").slice(0, 300),
        body: fields.body ?? fields.description ?? "",
      };
      if (emails.length === 0) {
        ambiguities.push({
          field: "to",
          message: "Chưa rõ người nhận. Hãy nhập email trước khi xác nhận.",
          candidates: people
            .slice(0, 20)
            .map((p) => ({ id: p.email, label: `${p.label} · ${p.email}` })),
        });
      }
    }

    const def = AI_ACTION_TOOLS[actionType];
    const { data: row, error } = await context.supabase
      .from("ai_action_proposals")
      .insert({
        tenant_id: scope.tenantId,
        user_id: context.userId,
        workspace_id: scope.workspaceId,
        action_type: actionType,
        risk: def.risk,
        source: data.source,
        title: def.label,
        description: data.query.slice(0, 500),
        payload: payload as never,
        target_type: targetType,
        target_id: targetId,
        source_refs: sourceRefs,
        status: "PROPOSED",
        expected_row_version: expectedRowVersion,
      })
      .select("id, status, expires_at")
      .single();
    if (error) throw fail("ACTION_FORBIDDEN", error.message);

    return {
      actionId: row.id as string,
      actionType,
      risk: def.risk,
      source: data.source,
      status: "PROPOSED",
      title: def.label,
      description: data.query.slice(0, 500),
      target: targetType && targetId ? { entityType: targetType, entityId: targetId } : null,
      payload: payload as never,
      preview: buildPreviewRows(actionType, payload as never, {
        assignee: assigneeLabel,
        workspace: (wsRow.data as any)?.name ?? null,
        participants: participantLabels,
      }),
      ambiguities,
      sourceRefs,
      requiresConfirmation: true,
      expiresAt: row.expires_at as string,
    };
  });

/* ------------------------------ Confirm ------------------------------ */

const ConfirmSchema = z.object({
  actionId: z.string().uuid(),
  /** Chỉnh sửa trước khi xác nhận — server luôn revalidate, không tin ID từ client. */
  edits: z
    .object({
      title: z.string().max(500).optional(),
      description: z.string().max(10000).optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      dueAt: z.string().datetime().nullable().optional(),
      assigneeId: z.string().uuid().nullable().optional(),
      startAt: z.string().datetime().optional(),
      endAt: z.string().datetime().optional(),
      participantIds: z.array(z.string().uuid()).max(50).optional(),
      to: z.array(z.string().email()).max(20).optional(),
      cc: z.array(z.string().email()).max(20).optional(),
      subject: z.string().max(500).optional(),
      body: z.string().max(100000).optional(),
    })
    .optional(),
});

export const confirmAiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ConfirmSchema.parse(i))
  .handler(async ({ data, context }): Promise<AiActionExecutionResult> => {
    const { resolveActorWorkspace, executorFor } = await import("./ai-actions.server");
    const sb = context.supabase;

    const { data: row } = await sb
      .from("ai_action_proposals")
      .select("*")
      .eq("id", data.actionId)
      .maybeSingle();
    if (!row || row.user_id !== context.userId) throw fail("ACTION_NOT_FOUND");

    // Replay: cùng actionId đã chạy xong → trả kết quả cũ, không tạo bản ghi mới (§47).
    if (row.status === "SUCCEEDED" && row.result)
      return row.result as unknown as AiActionExecutionResult;
    if (row.status === "CANCELLED") throw fail("ACTION_NOT_FOUND", "Đề xuất đã bị huỷ.");
    if (row.status === "EXECUTING")
      throw fail("ACTION_ALREADY_DONE", "Hành động đang được thực hiện.");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await sb.from("ai_action_proposals").update({ status: "EXPIRED" }).eq("id", row.id);
      throw fail("ACTION_EXPIRED");
    }
    if (!isAllowedActionType(row.action_type)) throw fail("ACTION_TYPE_NOT_ALLOWED");

    const tenantId = getCookie(ACTIVE_TENANT_COOKIE) ?? null;
    if (tenantId && tenantId !== row.tenant_id) throw fail("ACTION_FORBIDDEN");
    // Revalidate quyền tại thời điểm thực thi (§52) — quyền có thể đã bị thu hồi.
    const scope = await resolveActorWorkspace(context as never, row.tenant_id, row.workspace_id);

    const stored = (row.payload ?? {}) as Record<string, unknown>;
    const edits = data.edits ?? {};
    const payload: Record<string, unknown> = { ...stored };
    for (const [k, v] of Object.entries(edits)) if (v !== undefined) payload[k] = v;
    // Server-authoritative: client không được đổi workspace/target (§88).
    if ("workspaceId" in stored) payload["workspaceId"] = scope.workspaceId;
    if (row.target_type === "TASK" && row.target_id) payload["taskId"] = row.target_id;

    // Người phụ trách/người dự phải là thành viên workspace.
    const memberIds = new Set<string>();
    const need = [payload["assigneeId"], ...((payload["participantIds"] as string[]) ?? [])].filter(
      Boolean,
    ) as string[];
    if (need.length) {
      const { data: mem } = await sb
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", scope.workspaceId)
        .in("user_id", need);
      (mem ?? []).forEach((m: any) => memberIds.add(m.user_id));
      if (payload["assigneeId"] && !memberIds.has(payload["assigneeId"] as string))
        throw fail("ACTION_FORBIDDEN", "Người phụ trách không thuộc workspace này.");
      payload["participantIds"] = ((payload["participantIds"] as string[]) ?? []).filter((id) =>
        memberIds.has(id),
      );
    }

    // Kiểm tra trạng thái cũ của target (row version) trước khi ghi.
    if (row.target_type === "TASK" && row.target_id) {
      const { readTaskTarget } = await import("./ai-actions.server");
      const task = await readTaskTarget(context as never, row.target_id);
      if (!task) throw fail("ACTION_NOT_FOUND", "Công việc không còn tồn tại.");
      if (row.expected_row_version != null && task.rowVersion !== row.expected_row_version) {
        await sb
          .from("ai_action_proposals")
          .update({ status: "FAILED", error_code: "ACTION_STALE" })
          .eq("id", row.id);
        throw fail("ACTION_STALE");
      }
    }

    // WEE-2: đề xuất do nhân sự AI sinh ra phải qua lại cổng governance ở thời
    // điểm xác nhận — quyền/chính sách có thể đã đổi kể từ lúc đề xuất.
    if (row.ai_worker_id) {
      const {
        loadWorkerRuntimePolicy,
        checkAiWorkerAction,
        logGovernanceDecision,
        objectTypeForTool,
      } = await import("./ai-governance.server");
      const worker = await loadWorkerRuntimePolicy(sb, row.ai_worker_id as string);
      const verdict = await checkAiWorkerAction({
        supabase: sb,
        worker,
        userId: context.userId,
        execution: {
          executionId: (row.execution_id as string | null) ?? String(row.id),
          tenantId: row.tenant_id as string,
          workspaceId: scope.workspaceId,
          rootTaskId: (row.target_id as string | null) ?? String(row.id),
          projectId: null,
          initiatingUserId: context.userId,
          workerId: (row.ai_worker_id as string) ?? "",
        },
        request: {
          actionType: row.action_type as string,
          target: {
            tenantId: row.tenant_id as string,
            workspaceId: scope.workspaceId,
            projectId: null,
            objectType: objectTypeForTool(row.action_type as AiActionType),
          },
          payload,
        },
      });
      await logGovernanceDecision({
        tenantId: row.tenant_id as string,
        actorId: context.userId,
        executionId: (row.execution_id as string | null) ?? String(row.id),
        taskId: (row.target_id as string | null) ?? String(row.id),
        actionType: row.action_type as string,
        evaluation: verdict,
        phase: "CONFIRMATION",
        proposalId: row.id as string,
      });
      if (verdict.decision === "DENY") {
        await sb
          .from("ai_action_proposals")
          .update({
            status: "FAILED",
            error_code: "ACTION_FORBIDDEN",
            governance: verdict as never,
          })
          .eq("id", row.id);
        throw fail("ACTION_FORBIDDEN", verdict.safeReason);
      }
    }

    // Khoá trạng thái: chỉ một lượt xác nhận thắng (chống double-click §46).
    const { data: locked } = await sb
      .from("ai_action_proposals")
      .update({
        status: "EXECUTING",
        confirmed_at: new Date().toISOString(),
        payload: payload as never,
      })
      .eq("id", row.id)
      .in("status", ["PROPOSED", "PREVIEWED", "FAILED"])
      .select("id")
      .maybeSingle();
    if (!locked) {
      const { data: again } = await sb
        .from("ai_action_proposals")
        .select("status, result")
        .eq("id", row.id)
        .maybeSingle();
      if (again?.status === "SUCCEEDED" && again.result)
        return again.result as unknown as AiActionExecutionResult;
      throw fail("ACTION_ALREADY_DONE");
    }

    try {
      const exec = executorFor(row.action_type);
      const result = await exec({
        ctx: context as never,
        scope,
        payload,
        idempotencyKey: row.idempotency_key as string,
        expectedRowVersion: row.expected_row_version ?? null,
      });
      const final: AiActionExecutionResult = { ...result, actionId: row.id as string };
      // Gán agent tự động theo lĩnh vực công việc — không cần người dùng chọn tay.
      if (row.action_type === "CREATE_TASK" && result.status === "SUCCEEDED") {
        const { autoAssignAgentForTask } = await import("./ai-agent-routing.server");
        const assigned = await autoAssignAgentForTask({
          supabase: sb,
          userId: context.userId,
          tenantId: row.tenant_id as string,
          workspaceId: scope.workspaceId,
          proposalId: row.id as string,
          actionType: row.action_type as string,
          task: {
            title: (payload["title"] as string) ?? null,
            description: (payload["description"] as string) ?? null,
          },
        });
        if (assigned) {
          final.assignedAgent = {
            agentId: assigned.agentId,
            agentName: assigned.agentName,
            profileName: assigned.profileName,
            reason: assigned.reason,
          };
          final.message = `${final.message} · Đã gán agent "${assigned.agentName}"`;
        }
      }

      // Sau khi thực thi thành công: tự động cập nhật tiến độ công việc liên quan
      // (todo → in_progress) và ghi nhật ký vào bình luận công việc. Không bao giờ
      // ghi đè trạng thái done/canceled/blocked, và lỗi ở đây không làm hỏng hành động.
      if (result.status === "SUCCEEDED") {
        const relatedTaskId =
          row.target_type === "TASK" && row.target_id
            ? (row.target_id as string)
            : result.entityType === "TASK" && result.entityId
              ? (result.entityId as string)
              : null;

        if (relatedTaskId) {
          try {
            const { data: task } = await sb
              .from("tasks")
              .select("id, status, row_version")
              .eq("id", relatedTaskId)
              .is("deleted_at", null)
              .maybeSingle();
            if (task) {
              if (task.status === "todo") {
                const { error: trErr } = await sb.rpc("transition_task", {
                  _task_id: task.id,
                  _to_status: "in_progress",
                  _expected_row_version: task.row_version ?? undefined,
                  _idempotency_key: `${row.idempotency_key}-progress`,
                });
                if (!trErr) final.message = `${final.message} · Tiến độ cập nhật: Đang làm`;
              }
              await sb.rpc("comment_task", {
                _task_id: task.id,
                _body: `🤖 AI đã thực hiện sau khi bạn duyệt: ${final.message}`,
                _idempotency_key: `${row.idempotency_key}-comment`,
              });
            }
          } catch {
            // bỏ qua: cập nhật tiến độ là phụ trợ, không chặn kết quả chính
          }
        }
      }

      await sb
        .from("ai_action_proposals")
        .update({
          status: "SUCCEEDED",
          executed_at: new Date().toISOString(),
          result: final as never,
        })
        .eq("id", row.id);
      return final;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "UNKNOWN";
      const code = msg === "ACTION_STALE" ? "ACTION_STALE" : "ACTION_FAILED";
      await sb
        .from("ai_action_proposals")
        .update({ status: "FAILED", error_code: code })
        .eq("id", row.id);
      if (code === "ACTION_STALE") throw fail("ACTION_STALE");
      throw new ApiError({
        code: "ACTION_FAILED" as never,
        message: "Không thể thực hiện hành động này. Hãy kiểm tra quyền hoặc thử lại.",
      });
    }
  });

export const cancelAiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ actionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_action_proposals")
      .update({ status: "CANCELLED" })
      .eq("id", data.actionId)
      .eq("user_id", context.userId)
      .in("status", ["PROPOSED", "PREVIEWED"]);
    if (error) throw fail("ACTION_NOT_FOUND");
    return { ok: true as const };
  });

export interface RefreshedAiActionPreview {
  actionId: string;
  preview: { label: string; value: string }[];
  /** Những gì đã đổi ở dữ liệu đích kể từ lúc UNI đề xuất. */
  targetChanges: { label: string; before: string; after: string }[];
  refreshedAt: string;
  status: "PROPOSED";
}

/** ACTION_STALE → dựng lại preview theo dữ liệu đích mới nhất, người dùng phải xem lại rồi xác nhận lại. */
export const refreshAiActionProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ actionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<RefreshedAiActionPreview> => {
    const sb = context.supabase;
    const { data: row } = await sb
      .from("ai_action_proposals")
      .select("*")
      .eq("id", data.actionId)
      .maybeSingle();
    if (!row || row.user_id !== context.userId) throw fail("ACTION_NOT_FOUND");
    if (row.status === "SUCCEEDED") throw fail("ACTION_ALREADY_DONE");
    if (row.status === "CANCELLED") throw fail("ACTION_NOT_FOUND", "Đề xuất đã bị huỷ.");
    if (new Date(row.expires_at).getTime() < Date.now()) throw fail("ACTION_EXPIRED");

    const { buildPreviewRows, readTaskTarget } = await import("./ai-actions.server");
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const targetChanges: RefreshedAiActionPreview["targetChanges"] = [];
    let expectedRowVersion: number | null = row.expected_row_version ?? null;

    if (row.target_type === "TASK" && row.target_id) {
      const task = await readTaskTarget(context as never, row.target_id);
      if (!task) throw fail("ACTION_NOT_FOUND", "Công việc không còn tồn tại.");
      if (expectedRowVersion != null && task.rowVersion !== expectedRowVersion) {
        targetChanges.push({
          label: "Phiên bản dữ liệu",
          before: `v${expectedRowVersion}`,
          after: `v${task.rowVersion ?? "?"}`,
        });
        targetChanges.push({ label: "Công việc đích", before: "—", after: task.title });
      }
      expectedRowVersion = task.rowVersion;
    }

    const refreshedAt = new Date().toISOString();
    await sb
      .from("ai_action_proposals")
      .update({ status: "PROPOSED", error_code: null, expected_row_version: expectedRowVersion })
      .eq("id", row.id)
      .eq("user_id", context.userId);

    return {
      actionId: row.id as string,
      preview: buildPreviewRows(row.action_type as never, payload as never, {}),
      targetChanges,
      refreshedAt,
      status: "PROPOSED",
    };
  });

export const listAiActionProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).default(10) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("ai_action_proposals")
      .select("id, action_type, status, title, description, result, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return rows ?? [];
  });
