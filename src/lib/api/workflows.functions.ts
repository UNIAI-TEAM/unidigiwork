type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
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

export const retryWorkflowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      runId: z.string().uuid(),
      mode: z.enum(["all", "failed_step"]).default("all"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("retry_workflow_run", {
      _run_id: data.runId,
      _mode: data.mode,
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

export const simulateWorkflowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workflowId: z.string().uuid(),
      triggerSource: z.enum(["manual", "schedule", "event"]).default("manual"),
      payload: z.record(z.string(), z.unknown()).default({}),
      failStepKey: z.string().max(120).nullable().default(null),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("simulate_workflow_run", {
      _workflow_id: data.workflowId,
      _payload: data.payload as never,
      _trigger_source: data.triggerSource,
      _fail_step_key: data.failStepKey ?? undefined,
    });
    return ensureOk(res, "WORKFLOW_NOT_FOUND") as unknown as {
      workflow_status: string;
      trigger_source: string;
      run_status: string;
      step_count: number;
      warnings: string[];
      steps: {
        order: number; key: string; title: string; type: string;
        on_error: string; status: string; input: Json;
      }[];
    };
  });

// Batch 1F-PERM — Workflow permissions (workspace scope).
export const getMyWorkflowPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: perms, error } = await context.supabase.rpc("get_my_workflow_permissions", {
      _workspace_id: data.workspaceId,
    });
    if (error) mapPgError(error);
    return (perms ?? null) as unknown as {
      workspace_id: string;
      is_owner: boolean;
      can_edit: boolean;
      can_publish: boolean;
      can_run: boolean;
    } | null;
  });

export const listWorkflowPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("list_workflow_permissions", {
      _workspace_id: data.workspaceId,
    });
    if (error) mapPgError(error);
    const { data: canManage } = await context.supabase.rpc("can_manage_workflow_permissions", {
      _workspace_id: data.workspaceId,
    });
    return { canManage: !!canManage, members: rows ?? [] };
  });

export const setWorkflowPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workspaceId: z.string().uuid(),
      userId: z.string().uuid(),
      canEdit: z.boolean(),
      canPublish: z.boolean(),
      canRun: z.boolean(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("set_workflow_permission", {
      _workspace_id: data.workspaceId,
      _user_id: data.userId,
      _can_edit: data.canEdit,
      _can_publish: data.canPublish,
      _can_run: data.canRun,
    });
    return { id: ensureOk(res, "WORKSPACE_ACCESS_DENIED") };
  });

export const resetWorkflowPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ workspaceId: z.string().uuid(), userId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("reset_workflow_permission", {
      _workspace_id: data.workspaceId,
      _user_id: data.userId,
    });
    if (error) mapPgError(error);
    return { reset: !!ok };
  });

export const listWorkflowPermissionAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ workspaceId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("list_workflow_permission_audit", {
      _workspace_id: data.workspaceId,
      _limit: data.limit ?? 50,
    });
    if (error) mapPgError(error);
    return (rows ?? []) as unknown as {
      id: string;
      occurred_at: string;
      action: string;
      actor_id: string | null;
      actor_name: string | null;
      target_user_id: string | null;
      target_name: string | null;
      target_role: string | null;
      before_state: Record<string, boolean | string | null> | null;
      after_state: Record<string, boolean | string | null> | null;
    }[];
  });

// Batch 1F-PERM-ROLE — role/group based permissions.
// Batch 1F-PERM-DENY — nhật ký từ chối quyền.
export const logWorkflowDenial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workspaceId: z.string().uuid(),
      action: z.enum(["edit", "publish", "run"]),
      workflowId: z.string().uuid().nullable().optional(),
      errorCode: z.string().max(64).nullable().optional(),
      correlationId: z.string().max(128).nullable().optional(),
      source: z.enum(["client", "server"]).default("server"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("log_workflow_denial", {
      _workspace_id: data.workspaceId,
      _action: data.action,
      _workflow_id: data.workflowId ?? undefined,
      _error_code: data.errorCode ?? undefined,
      _correlation_id: data.correlationId ?? undefined,
      _source: data.source,
    });
    if (error) mapPgError(error);
    return { id: id as unknown as string | null };
  });

export const listWorkflowDenials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workspaceId: z.string().uuid(),
      action: z.enum(["edit", "publish", "run"]).nullable().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("list_workflow_denials", {
      _workspace_id: data.workspaceId,
      _action: data.action ?? undefined,
      _limit: data.limit ?? 50,
    });
    if (error) mapPgError(error);
    return (rows ?? []) as unknown as {
      id: string;
      occurred_at: string;
      action: "edit" | "publish" | "run";
      user_id: string;
      user_name: string | null;
      workflow_id: string | null;
      workflow_name: string | null;
      error_code: string | null;
      source: string;
      correlation_id: string | null;
    }[];
  });

export const listWorkflowRolePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("list_workflow_role_permissions", {
      _workspace_id: data.workspaceId,
    });
    if (error) mapPgError(error);
    return (rows ?? []) as unknown as {
      role: string;
      can_edit: boolean;
      can_publish: boolean;
      can_run: boolean;
      member_count: number;
      is_configured: boolean;
      updated_at: string | null;
    }[];
  });

const TENANT_ROLE = z.enum(["tenant_owner", "tenant_admin", "manager", "member", "guest"]);

export const setWorkflowRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workspaceId: z.string().uuid(),
      role: TENANT_ROLE,
      canEdit: z.boolean(),
      canPublish: z.boolean(),
      canRun: z.boolean(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("set_workflow_role_permission", {
      _workspace_id: data.workspaceId,
      _role: data.role,
      _can_edit: data.canEdit,
      _can_publish: data.canPublish,
      _can_run: data.canRun,
    });
    return { id: ensureOk(res, "WORKSPACE_ACCESS_DENIED") };
  });

export const resetWorkflowRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ workspaceId: z.string().uuid(), role: TENANT_ROLE }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("reset_workflow_role_permission", {
      _workspace_id: data.workspaceId,
      _role: data.role,
    });
    if (error) mapPgError(error);
    return { reset: !!ok };
  });

// Batch 1F-PERM-REQ — yêu cầu cấp quyền.
export const requestWorkflowAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workspaceId: z.string().uuid(),
      action: z.enum(["edit", "publish", "run"]),
      workflowId: z.string().uuid().nullable().optional(),
      message: z.string().max(500).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("request_workflow_access", {
      _workspace_id: data.workspaceId,
      _action: data.action,
      _workflow_id: data.workflowId ?? undefined,
      _message: data.message ?? undefined,
    });
    if (error) mapPgError(error);
    return { id: id as unknown as string | null };
  });

export const listWorkflowAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workspaceId: z.string().uuid(),
      status: z.enum(["pending", "approved", "rejected"]).nullable().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("list_workflow_access_requests", {
      _workspace_id: data.workspaceId,
      _status: data.status ?? undefined,
      _limit: data.limit ?? 50,
    });
    if (error) mapPgError(error);
    return (rows ?? []) as unknown as {
      id: string;
      created_at: string;
      action: "edit" | "publish" | "run";
      status: "pending" | "approved" | "rejected";
      requester_id: string;
      requester_name: string | null;
      workflow_id: string | null;
      workflow_name: string | null;
      message: string | null;
      reviewer_id: string | null;
      reviewer_name: string | null;
      reviewer_note: string | null;
      reviewed_at: string | null;
    }[];
  });

export const resolveWorkflowAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      requestId: z.string().uuid(),
      approve: z.boolean(),
      note: z.string().max(500).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("resolve_workflow_access_request", {
      _request_id: data.requestId,
      _approve: data.approve,
      _note: data.note ?? undefined,
    });
    if (error) mapPgError(error);
    return { ok: true };
  });

// Batch 1F-PERM — "Quyền hiệu lực của tôi": chi tiết từng thao tác + nguồn quyền.
export const explainMyWorkflowPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("explain_my_workflow_permissions", {
      _workspace_id: data.workspaceId,
    });
    if (error) mapPgError(error);
    return (res ?? null) as unknown as {
      workspace_id: string;
      workspace_name: string | null;
      is_owner: boolean;
      tenant_role: string | null;
      can_manage: boolean;
      permissions: {
        action: "edit" | "publish" | "run";
        allowed: boolean;
        source: "owner" | "user" | "role" | "default";
        detail: string | null;
      }[];
    } | null;
  });
