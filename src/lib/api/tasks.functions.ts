// Batch 1D-API — Tasks server functions.
// Thin wrappers over public.* RPCs. Business logic lives in Postgres RPCs
// (quota gate + outbox emit). Helpers imported from ./business.server.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { mapPgError, ensureOk } from "./business.server";

const taskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const taskStatusSchema = z.enum(["todo", "in_progress", "blocked", "done", "canceled"]);

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        status: taskStatusSchema.optional(),
        priority: taskPrioritySchema.optional(),
        tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.tags?.length) q = q.overlaps("tags", data.tags);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    return rows ?? [];
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        workspaceId: z.string().uuid(),
        title: z.string().min(1).max(500),
        description: z.string().max(10000).optional(),
        priority: taskPrioritySchema.default("normal"),
        dueAt: z.string().datetime().optional(),
        assigneeId: z.string().uuid().optional(),
        tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("create_task", {
      _workspace_id: data.workspaceId,
      _title: data.title,
      _description: data.description ?? undefined,
      _priority: data.priority,
      _due_at: data.dueAt ?? undefined,
      _assignee_id: data.assigneeId ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    const created = ensureOk(res, "TASK_NOT_FOUND");
    // Nhãn (tags) không thuộc RPC create_task → ghi bổ sung theo RLS của người dùng.
    const row = Array.isArray(created) ? (created as any[])[0] : (created as any);
    if (data.tags?.length && row?.id) {
      const tags = Array.from(new Set(data.tags.map((t) => t.trim()).filter(Boolean)));
      await context.supabase.rpc("set_task_tags", { _task_id: row.id, _tags: tags });
      if (row) row.tags = tags;
    }
    if (row?.id) {
      const { notifyAdminsOfNewTask } = await import("./task-notify.server");
      await notifyAdminsOfNewTask({
        taskId: row.id,
        workspaceId: data.workspaceId,
        title: data.title,
        actorId: context.userId,
      });
    }
    return created;
  });

/** Cập nhật nhãn cho một công việc (RLS áp dụng theo người dùng). */
export const setTaskTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        taskId: z.string().uuid(),
        tags: z.array(z.string().trim().min(1).max(40)).max(10),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const tags = Array.from(new Set(data.tags.map((t) => t.trim()).filter(Boolean)));
    const { error } = await context.supabase.rpc("set_task_tags", {
      _task_id: data.taskId,
      _tags: tags,
    });
    if (error) mapPgError(error);
    return { ok: true as const, tags };
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        taskId: z.string().uuid(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(10000).optional(),
        priority: taskPrioritySchema.optional(),
        dueAt: z.string().datetime().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("update_task", {
      _task_id: data.taskId,
      _title: data.title ?? undefined,
      _description: data.description ?? undefined,
      _priority: data.priority ?? undefined,
      _due_at: data.dueAt ?? undefined,
      _expected_row_version: data.expectedRowVersion ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "TASK_NOT_FOUND");
  });

/** Đặt hoặc xoá hạn chót của công việc; đồng bộ node TASK trong Work Graph. */
export const setTaskDueAt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        taskId: z.string().uuid(),
        dueAt: z.string().datetime().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("set_task_due_at", {
      _task_id: data.taskId,
      _due_at: data.dueAt as string | undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "TASK_NOT_FOUND");
  });

export const transitionTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        taskId: z.string().uuid(),
        toStatus: taskStatusSchema,
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("transition_task", {
      _task_id: data.taskId,
      _to_status: data.toStatus,
      _expected_row_version: data.expectedRowVersion ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "TASK_NOT_FOUND");
  });

export const assignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        taskId: z.string().uuid(),
        assigneeId: z.string().uuid(),
        role: z.string().max(50).default("assignee"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("assign_task", {
      _task_id: data.taskId,
      _assignee_id: data.assigneeId,
      _role: data.role,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "TASK_NOT_FOUND");
  });

export const commentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        taskId: z.string().uuid(),
        body: z.string().min(1).max(10000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("comment_task", {
      _task_id: data.taskId,
      _body: data.body,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "TASK_NOT_FOUND");
  });

export type TaskMessageRecipient = {
  id: string;
  name: string;
  email: string;
};

export type TaskMessagingPermissions = {
  canMessageTeam: boolean;
  canMessageSuperior: boolean;
  canAskUniAi: boolean;
};

export const getTaskMessagingPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<TaskMessagingPermissions> => {
    const { data: rows, error } = await context.supabase.rpc("get_task_messaging_permissions", {
      _task_id: data.taskId,
    });
    if (error) mapPgError(error, "TENANT_ACCESS_DENIED");
    const row = rows?.[0];
    return {
      canMessageTeam: Boolean(row?.can_message_team),
      canMessageSuperior: Boolean(row?.can_message_superior),
      canAskUniAi: Boolean(row?.can_ask_uni_ai),
    };
  });

/** Người đang được giao task, đã được tenant/RLS kiểm tra ở phía máy chủ. */
export const listTaskMessageRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<TaskMessageRecipient[]> => {
    const { data: people, error: peopleError } = await context.supabase.rpc(
      "list_task_message_recipients",
      { _task_id: data.taskId },
    );
    if (peopleError) mapPgError(peopleError, "TENANT_ACCESS_DENIED");

    return (
      (people ?? []) as Array<{
        id: string;
        display_name: string | null;
        primary_email: string | null;
      }>
    )
      .map((person) => ({
        id: person.id,
        name: person.display_name || person.primary_email || "—",
        email: person.primary_email ?? "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  });

export const listTaskSuperiorRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<TaskMessageRecipient[]> => {
    const { data: people, error } = await context.supabase.rpc("list_task_superior_recipients", {
      _task_id: data.taskId,
    });
    if (error) mapPgError(error, "TENANT_ACCESS_DENIED");
    return (
      (people ?? []) as Array<{
        id: string;
        display_name: string | null;
        primary_email: string | null;
      }>
    ).map((person) => ({
      id: person.id,
      name: person.display_name || person.primary_email || "—",
      email: person.primary_email ?? "",
    }));
  });

/** Lưu tin nhắn task và phát thông báo đích danh trong cùng giao dịch. */
export const sendTaskMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        taskId: z.string().uuid(),
        recipientId: z.string().uuid(),
        body: z.string().min(1).max(10000),
        source: z.enum(["TASK_CHAT", "PRIVATE_SUPERIOR"]).default("TASK_CHAT"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("comment_task_to_assignee", {
      _task_id: data.taskId,
      _recipient_id: data.recipientId,
      _body: data.body,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
      _source: data.source,
    });
    const comment = ensureOk(res, "TASK_NOT_FOUND") as { id: string };
    if (data.source === "PRIVATE_SUPERIOR") return comment;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return comment;

    const candidateResult = await context.supabase.rpc("list_task_classification_candidates", {
      _task_id: data.taskId,
      _limit: 20,
    });
    if (candidateResult.error) mapPgError(candidateResult.error);
    const allCandidates = (candidateResult.data ?? []) as Array<{ id: string; title: string }>;
    const candidates = allCandidates.filter((candidate) => candidate.id !== data.taskId);
    try {
      const { classifyTaskMessage } = await import("./task-message-classifier.server");
      const parent = allCandidates.find((candidate) => candidate.id === data.taskId);
      const classification = await classifyTaskMessage({
        body: data.body,
        parentTitle: parent?.title ?? "Công việc hiện tại",
        candidates,
        apiKey,
      });
      const applied = await (context.supabase as any).rpc("apply_task_message_classification", {
        _comment_id: comment.id,
        _label: classification.label,
        _confidence: classification.confidence,
        _task_title: classification.taskTitle,
        _related_task_id: classification.relatedTaskId,
        _model: classification.model,
        _classifier_version: classification.version,
        _idempotency_key: `${data.idempotencyKey}:classification`,
        _correlation_id: data.correlationId ?? null,
      });
      if (applied.error) mapPgError(applied.error);
      return { ...comment, classification: applied.data };
    } catch {
      const failed = await (context.supabase as any).rpc("apply_task_message_classification", {
        _comment_id: comment.id,
        _label: "FAILED",
        _confidence: 0,
        _task_title: null,
        _related_task_id: null,
        _model: "openai/gpt-6-astra",
        _classifier_version: "task-message-v1",
        _idempotency_key: `${data.idempotencyKey}:classification-failed`,
        _correlation_id: data.correlationId ?? null,
      });
      if (failed.error) mapPgError(failed.error);
      return { ...comment, classification: failed.data };
    }
  });

/** Đánh dấu đã đọc riêng các thông báo tin nhắn của task hiện tại. */
export const markTaskMessagesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("mark_task_message_notifications_read", {
      _task_id: data.taskId,
    });
    return ensureOk(res, "TASK_NOT_FOUND");
  });
// ---- Batch: Task detail (comments, attachments, subtasks, due reminders) ----

export const getTaskDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { withAuthorNames } = await import("./documents.server");
    const { data: task, error } = await context.supabase
      .from("tasks")
      .select("*")
      .eq("id", data.taskId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) mapPgError(error);
    if (!task) throw new Error("TASK_NOT_FOUND");

    const [comments, subtasks, attachments, assignees, parent] = await Promise.all([
      context.supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", data.taskId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("tasks")
        .select("*")
        .eq("parent_task_id", data.taskId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("task_attachments")
        .select("*")
        .eq("task_id", data.taskId)
        .order("created_at", { ascending: false }),
      context.supabase.from("task_assignees").select("*").eq("task_id", data.taskId),
      task.parent_task_id
        ? context.supabase
            .from("tasks")
            .select("id, title")
            .eq("id", task.parent_task_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const commentRows = await withAuthorNames(
      context.supabase,
      (comments.data ?? []) as Array<{ author_id: string | null }>,
    );

    return {
      task,
      parent: (parent as { data: { id: string; title: string } | null }).data,
      comments: commentRows,
      subtasks: subtasks.data ?? [],
      attachments: attachments.data ?? [],
      assignees: assignees.data ?? [],
    };
  });

export const createSubtask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        parentTaskId: z.string().uuid(),
        title: z.string().min(1).max(500),
        priority: taskPrioritySchema.default("normal"),
        dueAt: z.string().datetime().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("create_subtask", {
      _parent_task_id: data.parentTaskId,
      _title: data.title,
      _priority: data.priority,
      _due_at: data.dueAt ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "TASK_NOT_FOUND");
  });

export const addTaskAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        taskId: z.string().uuid(),
        fileName: z.string().min(1).max(300),
        storagePath: z.string().min(1).max(1000),
        mimeType: z.string().max(200).optional(),
        sizeBytes: z.number().int().nonnegative().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: task, error: taskErr } = await context.supabase
      .from("tasks")
      .select("id, tenant_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (taskErr) mapPgError(taskErr);
    if (!task) throw new Error("TASK_NOT_FOUND");
    const { data: row, error } = await context.supabase
      .from("task_attachments")
      .insert({
        task_id: data.taskId,
        tenant_id: task.tenant_id,
        file_name: data.fileName,
        storage_path: data.storagePath,
        mime_type: data.mimeType ?? null,
        size_bytes: data.sizeBytes ?? null,
        uploaded_by: context.userId,
      })
      .select("*")
      .single();
    if (error) mapPgError(error);
    return row;
  });

export const deleteTaskAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ attachmentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("task_attachments")
      .delete()
      .eq("id", data.attachmentId);
    if (error) mapPgError(error);
    return { ok: true };
  });

// ---- Mobile task detail: follow state ----

export const getTaskFollowState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const [mine, all] = await Promise.all([
      context.supabase
        .from("task_followers")
        .select("id")
        .eq("task_id", data.taskId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("task_followers")
        .select("id", { count: "exact", head: true })
        .eq("task_id", data.taskId),
    ]);
    return {
      following: Boolean(mine.data),
      followerCount: all.count ?? 0,
    };
  });

export const toggleTaskFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid(), follow: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: task, error } = await context.supabase
      .from("tasks")
      .select("id, tenant_id")
      .eq("id", data.taskId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) mapPgError(error);
    if (!task) throw new Error("TASK_NOT_FOUND");

    if (data.follow) {
      const { error: insErr } = await context.supabase.from("task_followers").insert({
        task_id: data.taskId,
        tenant_id: task.tenant_id,
        user_id: context.userId,
      });
      if (insErr && !/duplicate key/i.test(insErr.message)) mapPgError(insErr);
    } else {
      const { error: delErr } = await context.supabase
        .from("task_followers")
        .delete()
        .eq("task_id", data.taskId)
        .eq("user_id", context.userId);
      if (delErr) mapPgError(delErr);
    }
    return { following: data.follow };
  });

// ---- Tab "Tệp": liệt kê toàn bộ tệp đính kèm của công việc trong một workspace ----

export const listWorkspaceTaskAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("task_attachments")
      .select(
        "id, file_name, storage_path, mime_type, size_bytes, created_at, task_id, tasks!inner(id, title, workspace_id)",
      )
      .eq("tasks.workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) mapPgError(error);
    return (rows ?? []).map((r) => {
      const task = (r as unknown as { tasks: { id: string; title: string } }).tasks;
      return {
        id: r.id as string,
        fileName: r.file_name as string,
        storagePath: r.storage_path as string,
        mimeType: (r.mime_type as string | null) ?? null,
        sizeBytes: (r.size_bytes as number | null) ?? null,
        createdAt: r.created_at as string,
        taskId: task?.id ?? (r.task_id as string),
        taskTitle: task?.title ?? "",
      };
    });
  });
