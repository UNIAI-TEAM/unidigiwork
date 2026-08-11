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
    z.object({
      workspaceId: z.string().uuid(),
      status: taskStatusSchema.optional(),
      priority: taskPrioritySchema.optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("tasks").select("*")
      .eq("workspace_id", data.workspaceId).is("deleted_at", null)
      .order("updated_at", { ascending: false }).limit(data.limit);
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
    z.object({
      ...commandMetadataSchema.shape,
      workspaceId: z.string().uuid(),
      title: z.string().min(1).max(500),
      description: z.string().max(10000).optional(),
      priority: taskPrioritySchema.default("normal"),
      dueAt: z.string().datetime().optional(),
      assigneeId: z.string().uuid().optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    }).parse(i),
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
    return created;
  });

/** Cập nhật nhãn cho một công việc (RLS áp dụng theo người dùng). */
export const setTaskTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      taskId: z.string().uuid(),
      tags: z.array(z.string().trim().min(1).max(40)).max(10),
    }).parse(i),
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
    z.object({
      ...commandMetadataSchema.shape,
      taskId: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(10000).optional(),
      priority: taskPrioritySchema.optional(),
      dueAt: z.string().datetime().nullable().optional(),
    }).parse(i),
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

export const transitionTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      taskId: z.string().uuid(),
      toStatus: taskStatusSchema,
    }).parse(i),
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
    z.object({
      ...commandMetadataSchema.shape,
      taskId: z.string().uuid(),
      assigneeId: z.string().uuid(),
      role: z.string().max(50).default("assignee"),
    }).parse(i),
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
    z.object({
      ...commandMetadataSchema.shape,
      taskId: z.string().uuid(),
      body: z.string().min(1).max(10000),
    }).parse(i),
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
// ---- Batch: Task detail (comments, attachments, subtasks, due reminders) ----

export const getTaskDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { withAuthorNames } = await import("./documents.server");
    const { data: task, error } = await context.supabase
      .from("tasks").select("*").eq("id", data.taskId).is("deleted_at", null).maybeSingle();
    if (error) mapPgError(error);
    if (!task) throw new Error("TASK_NOT_FOUND");

    const [comments, subtasks, attachments, assignees, parent] = await Promise.all([
      context.supabase.from("task_comments").select("*")
        .eq("task_id", data.taskId).is("deleted_at", null)
        .order("created_at", { ascending: true }),
      context.supabase.from("tasks").select("*")
        .eq("parent_task_id", data.taskId).is("deleted_at", null)
        .order("created_at", { ascending: true }),
      context.supabase.from("task_attachments").select("*")
        .eq("task_id", data.taskId).order("created_at", { ascending: false }),
      context.supabase.from("task_assignees").select("*").eq("task_id", data.taskId),
      task.parent_task_id
        ? context.supabase.from("tasks").select("id, title").eq("id", task.parent_task_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const commentRows = await withAuthorNames(context.supabase, (comments.data ?? []) as Array<{ author_id: string | null }>);

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
    z.object({
      ...commandMetadataSchema.shape,
      parentTaskId: z.string().uuid(),
      title: z.string().min(1).max(500),
      priority: taskPrioritySchema.default("normal"),
      dueAt: z.string().datetime().optional(),
    }).parse(i),
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
    z.object({
      taskId: z.string().uuid(),
      fileName: z.string().min(1).max(300),
      storagePath: z.string().min(1).max(1000),
      mimeType: z.string().max(200).optional(),
      sizeBytes: z.number().int().nonnegative().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: task, error: taskErr } = await context.supabase
      .from("tasks").select("id, tenant_id").eq("id", data.taskId).maybeSingle();
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
      .select("*").single();
    if (error) mapPgError(error);
    return row;
  });

export const deleteTaskAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ attachmentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("task_attachments").delete().eq("id", data.attachmentId);
    if (error) mapPgError(error);
    return { ok: true };
  });
