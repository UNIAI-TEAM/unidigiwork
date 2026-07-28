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
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("tasks").select("*")
      .eq("workspace_id", data.workspaceId).is("deleted_at", null)
      .order("updated_at", { ascending: false }).limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
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
    return ensureOk(res, "TASK_NOT_FOUND");
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