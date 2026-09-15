import type { SupabaseClient } from "@supabase/supabase-js";

export type LinkExecutionWorkProductResult = {
  linked: boolean;
  idempotent: boolean;
  id: string;
  executionId: string;
  workProductId: string;
  role: "CREATED" | "CONTRIBUTED" | string;
};

/**
 * Trusted link: Execution → Work Product.
 * Does not create a Work Product. Does not bind work_units.
 */
export async function linkExecutionToWorkProduct(
  supabase: SupabaseClient,
  executionId: string,
  workProductId: string,
  opts: { idempotencyKey?: string | null; correlationId?: string | null } = {},
): Promise<LinkExecutionWorkProductResult> {
  const { data, error } = await supabase.rpc(
    "link_execution_work_product" as never,
    {
      _execution_id: executionId,
      _work_product_id: workProductId,
      _idempotency_key: opts.idempotencyKey ?? null,
      _correlation_id: opts.correlationId ?? null,
    } as never,
  );
  if (error) throw new Error(error.message || "EXECUTION_WORK_PRODUCT_LINK_FAILED");
  const row = (data ?? null) as Record<string, unknown> | null;
  if (!row || row.linked !== true) throw new Error("EXECUTION_WORK_PRODUCT_LINK_FAILED");
  return {
    linked: true,
    idempotent: row.idempotent === true,
    id: String(row.id ?? ""),
    executionId: String(row.executionId ?? executionId),
    workProductId: String(row.workProductId ?? workProductId),
    role: String(row.role ?? "CREATED"),
  };
}

export async function startHumanTaskExecution(
  supabase: SupabaseClient,
  taskId: string,
  opts: { idempotencyKey?: string | null; correlationId?: string | null } = {},
): Promise<{ id: string; executor_type: string; ai_worker_id: string | null }> {
  const { data, error } = await supabase.rpc(
    "start_human_task_execution" as never,
    {
      _task_id: taskId,
      _idempotency_key: opts.idempotencyKey ?? null,
      _correlation_id: opts.correlationId ?? null,
    } as never,
  );
  if (error) throw new Error(error.message || "HUMAN_EXECUTION_START_FAILED");
  const row = data as { id: string; executor_type?: string; ai_worker_id?: string | null } | null;
  if (!row?.id) throw new Error("HUMAN_EXECUTION_START_FAILED");
  return {
    id: row.id,
    executor_type: row.executor_type ?? "HUMAN",
    ai_worker_id: row.ai_worker_id ?? null,
  };
}
