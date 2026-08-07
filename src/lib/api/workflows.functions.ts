// Batch 1D-API — Workflows server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { mapPgError, ensureOk } from "./business.server";

const stepStatusSchema = z.enum(["pending", "running", "succeeded", "failed", "skipped"]);

export const listWorkflows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workspaceId: z.string().uuid(),
      status: z.enum(["draft", "published", "archived"]).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("workflows").select("*")
      .eq("workspace_id", data.workspaceId).is("deleted_at", null)
      .order("updated_at", { ascending: false }).limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    return rows ?? [];
  });

export const getWorkflowRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ runId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from("workflow_runs")
      .select(
        "id, workflow_id, status, started_at, ended_at, created_at, updated_at, correlation_id, triggered_by, workflow_version, context",
      )
      .eq("id", data.runId)
      .maybeSingle();
    if (error) mapPgError(error);
    if (!run) return null;

    const { data: steps, error: stepErr } = await context.supabase
      .from("workflow_steps")
      .select(
        "id, step_key, status, error, input, output, started_at, ended_at, created_at, updated_at",
      )
      .eq("run_id", data.runId)
      .order("created_at", { ascending: true });
    if (stepErr) mapPgError(stepErr);

    const { data: workflow } = await context.supabase
      .from("workflows")
      .select("id, name")
      .eq("id", run.workflow_id)
      .maybeSingle();

    return { run, steps: steps ?? [], workflow: workflow ?? null };
  });

export const createWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      workspaceId: z.string().uuid(),
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      definition: z.record(z.string(), z.unknown()),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("create_workflow", {
      _workspace_id: data.workspaceId,
      _name: data.name,
      _definition: data.definition as never,
      _description: data.description ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "WORKFLOW_NOT_FOUND");
  });

export const publishWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      workflowId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("publish_workflow", {
      _workflow_id: data.workflowId,
      _expected_row_version: data.expectedRowVersion ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "WORKFLOW_NOT_FOUND");
  });

export const startWorkflowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      workflowId: z.string().uuid(),
      context: z.record(z.string(), z.unknown()).default({}),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("start_workflow_run", {
      _workflow_id: data.workflowId,
      _context: data.context as never,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "WORKFLOW_NOT_FOUND");
  });

export const advanceWorkflowStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      runId: z.string().uuid(),
      stepKey: z.string().min(1).max(200),
      toStatus: stepStatusSchema,
      input: z.record(z.string(), z.unknown()).default({}),
      output: z.record(z.string(), z.unknown()).optional(),
      error: z.string().max(5000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("advance_workflow_step", {
      _run_id: data.runId,
      _step_key: data.stepKey,
      _to_status: data.toStatus,
      _input: data.input as never,
      _output: (data.output ?? undefined) as never,
      _error: data.error ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "WORKFLOW_RUN_NOT_FOUND");
  });

export const cancelWorkflowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      runId: z.string().uuid(),
      reason: z.string().max(1000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("cancel_workflow_run", {
      _run_id: data.runId,
      _reason: data.reason ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "WORKFLOW_RUN_NOT_FOUND");
  });
export const listWorkflowRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workflowIds: z.array(z.string().uuid()).min(1).max(100),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("workflow_runs")
      .select("id, workflow_id, status, started_at, ended_at, created_at, row_version")
      .in("workflow_id", data.workflowIds)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) mapPgError(error);
    return rows ?? [];
  });

export const repairWorkflowRunTimestamps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ runIds: z.array(z.string().uuid()).min(1).max(200) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "repair_workflow_run_timestamps",
      { _run_ids: data.runIds },
    );
    if (error) mapPgError(error);
    return { fixed: (rows ?? []).length };
  });

// Batch 1F — Workflow builder: edit definition + triggers/schedules.
export const getWorkflow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ workflowId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: wf, error } = await context.supabase
      .from("workflows").select("*").eq("id", data.workflowId).maybeSingle();
    if (error) mapPgError(error);
    if (!wf) return null;
    const { data: triggers } = await context.supabase
      .from("workflow_triggers").select("*")
      .eq("workflow_id", data.workflowId).order("created_at", { ascending: true });
    const { data: runs } = await context.supabase
      .from("workflow_runs")
      .select("id, status, started_at, ended_at, created_at, context")
      .eq("workflow_id", data.workflowId)
      .order("created_at", { ascending: false }).limit(20);
    return { workflow: wf, triggers: triggers ?? [], runs: runs ?? [] };
  });

export const updateWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      workflowId: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).optional(),
      definition: z.record(z.string(), z.unknown()).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("update_workflow", {
      _workflow_id: data.workflowId,
      _name: data.name ?? undefined,
      _description: data.description ?? undefined,
      _definition: (data.definition ?? undefined) as never,
      _expected_row_version: data.expectedRowVersion ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "WORKFLOW_NOT_FOUND");
  });

export const upsertWorkflowTrigger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workflowId: z.string().uuid(),
      triggerId: z.string().uuid().optional(),
      kind: z.enum(["schedule", "event"]),
      frequency: z.enum(["minutes", "hourly", "daily", "weekly"]).optional(),
      intervalMinutes: z.number().int().min(1).max(1440).optional(),
      atHour: z.number().int().min(0).max(23).optional(),
      atMinute: z.number().int().min(0).max(59).optional(),
      weekday: z.number().int().min(0).max(6).optional(),
      timezone: z.string().max(64).optional(),
      eventType: z.string().max(120).optional(),
      payload: z.record(z.string(), z.unknown()).default({}),
      isEnabled: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("upsert_workflow_trigger", {
      _workflow_id: data.workflowId,
      _kind: data.kind,
      _trigger_id: data.triggerId ?? undefined,
      _frequency: data.frequency ?? undefined,
      _interval_minutes: data.intervalMinutes ?? undefined,
      _at_hour: data.atHour ?? undefined,
      _at_minute: data.atMinute ?? undefined,
      _weekday: data.weekday ?? undefined,
      _timezone: data.timezone ?? undefined,
      _event_type: data.eventType ?? undefined,
      _payload: data.payload as never,
      _is_enabled: data.isEnabled,
    });
    return ensureOk(res, "WORKFLOW_NOT_FOUND");
  });

export const deleteWorkflowTrigger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ triggerId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("delete_workflow_trigger", {
      _trigger_id: data.triggerId,
    });
    if (error) mapPgError(error);
    return { deleted: !!ok };
  });

export const fireWorkflowEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workspaceId: z.string().uuid(),
      eventType: z.string().min(1).max(120),
      payload: z.record(z.string(), z.unknown()).default({}),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: count, error } = await context.supabase.rpc("fire_workflow_event", {
      _workspace_id: data.workspaceId,
      _event_type: data.eventType,
      _payload: data.payload as never,
    });
    if (error) mapPgError(error);
    return { started: count ?? 0 };
  });
