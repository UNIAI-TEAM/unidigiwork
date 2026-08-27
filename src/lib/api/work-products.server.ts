// WE-2 — Work Product Contract resolver & preflight (server-only).
//
// Bất biến:
//  - Hợp đồng LUÔN được phân giải từ database (public.work_units). Client không
//    gửi hợp đồng, không gửi phiên bản đã sửa, không gửi tiêu chí/ngưỡng/SLA.
//  - Preflight chạy dưới RLS của chính actor → uỷ quyền đầu vào không thể vòng qua.
//  - Fail closed: bất kỳ vấn đề nào cũng trả ready = false kèm mã lỗi ổn định.
import {
  canExecuteStatus,
  validateWorkProductInputs,
  type PreflightIssue,
  type WorkProductContract,
  type WorkProductPreflight,
} from "@/domain/work-products/contracts";

type Supa = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        c: string,
        v: unknown,
      ) => {
        eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
        order: (
          c: string,
          o: { ascending: boolean },
        ) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> } };
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
      };
    };
  };
  rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: unknown }>;
};

/** Bảng thực thể tra cứu bằng biến (không hard-code tên bảng nghiệp vụ trong câu lệnh). */
export async function loadTaskScope(
  supabase: Supa,
  taskId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from(ENTITY_TABLE_TASK)
    .select("id, tenant_id, workspace_id, ai_worker_id")
    .eq("id", taskId)
    .maybeSingle();
  return data ?? null;
}

const ENTITY_TABLE_TASK = "tasks";

const CONTRACT_COLUMNS =
  "code, version, label, description, objective, category, status, template_code, deliverable_type, expected_outcome_type, sla_machine_ms, contract_hash, input_contract, context_contract, executor_contract, action_contract, deliverable_contract, acceptance_contract, quality_contract, review_contract, sla_contract";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" ? (v as Record<string, never>) : {});
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function toWorkProductContract(row: Record<string, unknown>): WorkProductContract {
  const input = obj(row["input_contract"]);
  const ctx = obj(row["context_contract"]);
  const exec = obj(row["executor_contract"]);
  const act = obj(row["action_contract"]);
  const del = obj(row["deliverable_contract"]);
  const acc = obj(row["acceptance_contract"]);
  const q = obj(row["quality_contract"]);
  const rev = obj(row["review_contract"]);
  const sla = obj(row["sla_contract"]);
  return {
    code: String(row["code"]),
    version: Number(row["version"] ?? 1),
    label: String(row["label"] ?? row["code"]),
    description: (row["description"] as string | null) ?? null,
    objective: String(row["objective"] ?? ""),
    category: String(row["category"] ?? "WORK_INTELLIGENCE"),
    status: String(row["status"] ?? "DRAFT") as WorkProductContract["status"],
    templateCode: (row["template_code"] as string | null) ?? null,
    deliverableType: String(row["deliverable_type"] ?? "SUMMARY"),
    outcomeType: String(row["expected_outcome_type"] ?? "REPORT_ACCEPTED"),
    slaMachineMs: (row["sla_machine_ms"] as number | null) ?? null,
    contractHash: (row["contract_hash"] as string | null) ?? null,
    input: { required: arr(input["required"]), properties: obj(input["properties"]) },
    context: {
      allowedEntityTypes: arr(ctx["allowedEntityTypes"]),
      optionalEntityTypes: arr(ctx["optionalEntityTypes"]),
      maxSources: (ctx["maxSources"] as number | null) ?? null,
    },
    executor: {
      requiredRole: (exec["requiredRole"] as string | null) ?? null,
      requiredSkills: arr(exec["requiredSkills"]),
      pinnedWorkerId: (exec["pinnedWorkerId"] as string | null) ?? null,
    },
    action: { allowedActions: arr(act["allowedActions"]), maxAutonomy: String(act["maxAutonomy"] ?? "PROPOSE_ONLY") },
    deliverable: { type: del["type"] as string | undefined, requiredSections: arr(del["requiredSections"]) },
    acceptance: { mandatoryCriteria: arr(acc["mandatoryCriteria"]) },
    quality: {
      minimumQualityScore: Number(q["minimumQualityScore"] ?? 0),
      requiredDimensions: arr(q["requiredDimensions"]),
    },
    review: { policy: (rev["policy"] as WorkProductContract["review"]["policy"]) ?? "HUMAN_REVIEW_REQUIRED" },
    sla: {
      machineDurationMs: (sla["machineDurationMs"] as number | null) ?? (row["sla_machine_ms"] as number | null) ?? null,
      wallDurationMs: (sla["wallDurationMs"] as number | null) ?? null,
    },
  };
}

/** Phân giải hợp đồng theo mã + phiên bản (phiên bản null = bản ACTIVE mới nhất). */
export async function loadWorkProduct(
  supabase: Supa,
  code: string,
  version?: number | null,
): Promise<WorkProductContract | null> {
  const base = supabase.from("work_units").select(CONTRACT_COLUMNS).eq("code", code);
  const { data } = version
    ? await base.eq("version", version).maybeSingle()
    : await base.order("version", { ascending: false }).limit(1).maybeSingle();
  return data ? toWorkProductContract(data) : null;
}

/** Phân giải theo template bàn giao đang dùng bởi AI Task Execution hiện hữu. */
export async function loadWorkProductByTemplate(
  supabase: Supa,
  templateCode: string,
): Promise<WorkProductContract | null> {
  const { data } = await supabase
    .from("work_units")
    .select(CONTRACT_COLUMNS)
    .eq("template_code", templateCode)
    .eq("status", "ACTIVE")
    .maybeSingle();
  return data ? toWorkProductContract(data) : null;
}

/* ------------------------------ Uỷ quyền đầu vào ------------------------------ */

const ENTITY_TABLE: Record<string, string> = {
  PROJECT: "projects",
  TASK: "tasks",
  MEETING: "meetings",
  DOCUMENT: "documents",
};

/**
 * Kiểm quyền cho từng đầu vào dạng thực thể. Đọc bằng RLS của actor: nếu actor
 * không thấy hàng đó thì đây là đầu vào ngoài phạm vi → UNAUTHORIZED_INPUT.
 */
async function authorizeEntityInputs(
  supabase: Supa,
  contract: WorkProductContract,
  inputs: Record<string, string>,
  scope: { tenantId: string | null; workspaceId: string | null },
): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  for (const [key, value] of Object.entries(inputs)) {
    const prop = contract.input.properties[key];
    if (!prop || prop.type !== "uuid" || !prop.entityType) continue;
    const table = ENTITY_TABLE[prop.entityType];
    if (!table) {
      issues.push({ code: "INVALID_INPUT", field: key, message: `Loại thực thể "${prop.entityType}" không được hỗ trợ.` });
      continue;
    }
    const { data } = await supabase.from(table).select("id, tenant_id, workspace_id").eq("id", value).maybeSingle();
    if (!data) {
      issues.push({ code: "UNAUTHORIZED_INPUT", field: key, message: `Bạn không có quyền với dữ liệu đã chọn ở "${key}".` });
      continue;
    }
    if (scope.tenantId && data["tenant_id"] && String(data["tenant_id"]) !== scope.tenantId) {
      issues.push({ code: "UNAUTHORIZED_INPUT", field: key, message: `Dữ liệu "${key}" thuộc tổ chức khác.` });
      continue;
    }
    if (scope.workspaceId && data["workspace_id"] && String(data["workspace_id"]) !== scope.workspaceId) {
      issues.push({ code: "UNAUTHORIZED_INPUT", field: key, message: `Dữ liệu "${key}" nằm ngoài không gian làm việc của công việc này.` });
    }
  }
  return issues;
}

/* -------------------------- Điều kiện nhân sự AI -------------------------- */

export interface ExecutorCandidate {
  id: string;
  code?: string | null;
  role?: string | null;
  skills?: string[] | null;
  allowed_tools?: string[] | null;
  status?: string | null;
  tenant_id?: string | null;
}

/** Nhân sự AI có đủ điều kiện thực hiện hợp đồng này không (fail closed). */
export function checkExecutorEligibility(
  contract: WorkProductContract,
  worker: ExecutorCandidate | null,
  tenantId: string | null,
): PreflightIssue[] {
  if (!worker) {
    return [{ code: "NO_ELIGIBLE_EXECUTOR", message: "Công việc chưa được giao cho nhân sự AI nào." }];
  }
  const issues: PreflightIssue[] = [];
  if (String(worker.status ?? "").toUpperCase() !== "ACTIVE") {
    issues.push({ code: "NO_ELIGIBLE_EXECUTOR", message: "Nhân sự AI đang không hoạt động." });
  }
  if (tenantId && worker.tenant_id && String(worker.tenant_id) !== tenantId) {
    issues.push({ code: "NO_ELIGIBLE_EXECUTOR", message: "Nhân sự AI thuộc tổ chức khác." });
  }
  if (contract.executor.pinnedWorkerId && contract.executor.pinnedWorkerId !== worker.id) {
    issues.push({ code: "NO_ELIGIBLE_EXECUTOR", message: "Hợp đồng chỉ định một nhân sự AI khác." });
  }
  const required = contract.executor.requiredRole;
  if (required) {
    const matches =
      String(worker.code ?? "").toUpperCase() === required.toUpperCase() ||
      String(worker.role ?? "").toUpperCase() === required.toUpperCase();
    if (!matches) {
      issues.push({ code: "NO_ELIGIBLE_EXECUTOR", message: `Hợp đồng yêu cầu vai trò ${required}.` });
    }
  }
  const skills = new Set((worker.skills ?? []).map((s) => String(s).toUpperCase()));
  const missing = contract.executor.requiredSkills.filter((s) => !skills.has(s.toUpperCase()));
  if (missing.length) {
    issues.push({ code: "NO_ELIGIBLE_EXECUTOR", message: `Nhân sự AI thiếu kỹ năng: ${missing.join(", ")}.` });
  }
  return issues;
}

/* -------------------------------- Preflight ------------------------------- */

export interface PreflightInput {
  supabase: Supa;
  contract: WorkProductContract;
  rawInputs: Record<string, unknown>;
  worker: ExecutorCandidate | null;
  tenantId: string | null;
  workspaceId: string | null;
}

/** Cổng duy nhất trước khi bất kỳ lượt chạy AI nào bắt đầu. */
export async function validateWorkProductExecution(i: PreflightInput): Promise<WorkProductPreflight> {
  const issues: PreflightIssue[] = [];
  const c = i.contract;

  if (!canExecuteStatus(c.status)) {
    issues.push({ code: "WORK_PRODUCT_NOT_ACTIVE", message: `Sản phẩm đang ở trạng thái ${c.status}.` });
  }
  if (!Number.isInteger(c.version) || c.version < 1) {
    issues.push({ code: "INVALID_WORK_PRODUCT_VERSION", message: "Phiên bản hợp đồng không hợp lệ." });
  }
  if (!c.context.allowedEntityTypes.length) {
    issues.push({ code: "CONTEXT_POLICY_INVALID", message: "Hợp đồng chưa khai báo loại ngữ cảnh được phép." });
  }
  if (c.quality.minimumQualityScore < 0 || c.quality.minimumQualityScore > 100) {
    issues.push({ code: "QUALITY_POLICY_INVALID", message: "Ngưỡng chất lượng phải nằm trong 0..100." });
  }
  if (!c.outcomeType) {
    issues.push({ code: "OUTCOME_POLICY_INVALID", message: "Hợp đồng chưa khai báo kết quả nghiệm thu." });
  }

  const { inputs, issues: inputIssues } = validateWorkProductInputs(c.input, i.rawInputs);
  issues.push(...inputIssues);

  if (!inputIssues.some((x) => x.code === "MISSING_REQUIRED_INPUT")) {
    issues.push(...(await authorizeEntityInputs(i.supabase, c, inputs, { tenantId: i.tenantId, workspaceId: i.workspaceId })));
  }

  issues.push(...checkExecutorEligibility(c, i.worker, i.tenantId));

  return {
    ready: issues.length === 0,
    code: c.code,
    version: c.version,
    contractHash: c.contractHash,
    issues,
    inputs,
    executorWorkerId: i.worker?.id ?? null,
  };
}

/**
 * Ghi bản chụp hợp đồng bất biến vào lượt chạy (RPC tin cậy, chỉ ghi một lần).
 *
 * HARDEN-SELLWORK-1 — FAIL CLOSED: với sản phẩm công việc chuẩn hoá, KHÔNG được
 * phép chạy AI khi bản chụp hợp đồng chưa gắn thành công. Hàm này ném lỗi để
 * caller dừng trước mọi lời gọi AI Gateway.
 */
export async function bindWorkProductExecution(
  supabase: Supa,
  executionId: string,
  contract: WorkProductContract,
  inputs: Record<string, string>,
): Promise<{ bound: boolean; reason: string | null; contractHash: string | null }> {
  const res = await supabase.rpc("bind_work_product_execution", {
    _execution_id: executionId,
    _code: contract.code,
    _version: contract.version,
    _inputs: inputs,
  });
  if (res.error) throw new Error("WORK_PRODUCT_BIND_FAILED");
  const row = (res.data ?? null) as Record<string, unknown> | null;
  if (!row) throw new Error("WORK_PRODUCT_BIND_FAILED");
  const bound = row["bound"] === true;
  const reason = (row["reason"] as string | null) ?? null;
  // ALREADY_BOUND là hợp lệ (idempotent) MIỄN LÀ bản chụp trùng đúng phiên bản
  // hợp đồng đang chạy; mọi trường hợp khác là thất bại đóng.
  if (!bound) {
    if (reason !== "ALREADY_BOUND") throw new Error("WORK_PRODUCT_BIND_FAILED");
    if (String(row["workUnitCode"] ?? "") !== contract.code || Number(row["workUnitVersion"]) !== contract.version) {
      throw new Error("WORK_PRODUCT_CONTRACT_MISMATCH");
    }
  }
  return { bound, reason, contractHash: (row["contractHash"] as string | null) ?? null };
}
