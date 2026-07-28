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
      _definition: data.definition,
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
      _context: data.context,
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
      _input: data.input,
      _output: data.output ?? undefined,
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