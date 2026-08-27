// WE-2 — endpoint tin cậy cho Work Catalog (danh mục sản phẩm công việc).
// Chỉ ĐỌC hợp đồng và chạy preflight; không mở thêm đường ghi nghiệp vụ nào.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WorkProductContract, WorkProductPreflight } from "@/domain/work-products/contracts";
import {
  loadTaskScope,
  loadWorkProduct,
  toWorkProductContract,
  validateWorkProductExecution,
} from "./work-products.server";

const CONTRACT_COLUMNS =
  "code, version, label, description, objective, category, status, template_code, deliverable_type, expected_outcome_type, sla_machine_ms, contract_hash, input_contract, context_contract, executor_contract, action_contract, deliverable_contract, acceptance_contract, quality_contract, review_contract, sla_contract";

/** Danh mục sản phẩm công việc (hợp đồng thật, không phải nội dung tiếp thị). */
export const listWorkProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkProductContract[]> => {
    const { data } = await context.supabase
      .from("work_units")
      .select(CONTRACT_COLUMNS)
      .order("code", { ascending: true })
      .order("version", { ascending: false });
    return (data ?? []).map((r) => toWorkProductContract(r as Record<string, unknown>));
  });

export const getWorkProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ code: z.string().max(80), version: z.number().int().positive().optional() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<WorkProductContract | null> =>
    loadWorkProduct(context.supabase as never, data.code, data.version ?? null),
  );

/**
 * Preflight cho một công việc cụ thể: hợp đồng + đầu vào + uỷ quyền + nhân sự AI.
 * Client chỉ gửi INPUT; hợp đồng luôn đọc từ database.
 */
export const preflightWorkProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        code: z.string().max(80),
        version: z.number().int().positive().optional(),
        taskId: z.string().uuid().optional(),
        inputs: z.record(z.string(), z.string().max(500)).default({}),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<WorkProductPreflight> => {
    const contract = await loadWorkProduct(context.supabase as never, data.code, data.version ?? null);
    if (!contract) {
      return {
        ready: false,
        code: data.code,
        version: data.version ?? 0,
        contractHash: null,
        issues: [{ code: "WORK_PRODUCT_NOT_FOUND", message: "Không tìm thấy sản phẩm công việc." }],
        inputs: {},
        executorWorkerId: null,
      };
    }

    let tenantId: string | null = null;
    let workspaceId: string | null = null;
    let worker: Record<string, unknown> | null = null;

    if (data.taskId) {
      const task = await loadTaskScope(context.supabase as never, data.taskId);
      if (!task) {
        return {
          ready: false,
          code: contract.code,
          version: contract.version,
          contractHash: contract.contractHash,
          issues: [{ code: "UNAUTHORIZED_INPUT", field: "taskId", message: "Bạn không có quyền với công việc này." }],
          inputs: {},
          executorWorkerId: null,
        };
      }
      tenantId = (task.tenant_id as string | null) ?? null;
      workspaceId = (task.workspace_id as string | null) ?? null;
      if (task.ai_worker_id) {
        const { data: w } = await context.supabase
          .from("ai_workers")
          .select("id, code, role, skills, allowed_tools, status, tenant_id")
          .eq("id", String(task.ai_worker_id))
          .maybeSingle();
        worker = (w as Record<string, unknown> | null) ?? null;
      }
    } else if (contract.executor.requiredRole) {
      const { data: w } = await context.supabase
        .from("ai_workers")
        .select("id, code, role, skills, allowed_tools, status, tenant_id")
        .eq("code", contract.executor.requiredRole)
        .maybeSingle();
      worker = (w as Record<string, unknown> | null) ?? null;
    }

    return validateWorkProductExecution({
      supabase: context.supabase as never,
      contract,
      rawInputs: data.inputs,
      worker: worker as never,
      tenantId,
      workspaceId,
    });
  });

export interface WorkProductRollupRow {
  workUnitCode: string;
  workUnitVersion: number;
  runs: number;
  acceptedRuns: number;
  verifiedOutcomes: number;
  qualityPassedRuns: number;
  humanApprovals: number;
  revisions: number;
  machineMsP50: number | null;
  slaMetRuns: number;
  slaEvaluatedRuns: number;
}

/** Số liệu WE-1 gom theo từng sản phẩm công việc + phiên bản hợp đồng. */
export const getWorkProductRollup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<WorkProductRollupRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("work_product_summary" as never, {
      _tenant_id: data.tenantId,
    } as never);
    if (error) return [];
    return (rows ?? []) as WorkProductRollupRow[];
  });
