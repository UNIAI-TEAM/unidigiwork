// WEE-2 — AI Worker Runtime Governance (server-only).
// Phân giải chính sách thật từ database rồi gọi hàm quyết định thuần.
// Không có SQL ghi nghiệp vụ ở đây; chỉ đọc dưới RLS của chính actor.
import {
  DEFAULT_AUTONOMY_POLICY,
  evaluateAiWorkerActionPolicy,
  GOVERNANCE_SAFE_REASON,
  GOVERNED_TOOLS,
  isGovernedTool,
  RISK_POLICY_VERSION,
  AUTONOMY_POLICY_VERSION,
  type AiAutonomyLevel,
  type AiRiskLevel,
  type AiWorkerRuntimePolicy,
  type GovernanceActionRequest,
  type GovernanceEvaluation,
  type GovernanceExecutionScope,
  type GovernanceUserAuthority,
} from "@/domain/ai-governance/contracts";
import type { AiActionType } from "@/domain/ai-actions/contracts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Supa = any;

const OBJECT_TYPES = ["TASK", "MEETING", "EMAIL_DRAFT"] as const;
type ObjectType = (typeof OBJECT_TYPES)[number];

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).filter(Boolean) : [];

/** Chuyển một dòng ai_workers (hoặc khối worker trong brief) thành policy runtime. */
export function toWorkerRuntimePolicy(row: Record<string, unknown> | null): AiWorkerRuntimePolicy | null {
  if (!row || !row["id"]) return null;
  const rawAutonomy = (row["autonomy_policy"] ?? {}) as Record<string, unknown>;
  const autonomy = { ...DEFAULT_AUTONOMY_POLICY };
  for (const level of ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as AiRiskLevel[]) {
    const v = rawAutonomy[level];
    if (typeof v === "string") autonomy[level] = v as AiAutonomyLevel | "DENY";
  }
  const wsRaw = row["scope_workspace_ids"];
  const prRaw = row["scope_project_ids"];
  const objectTypes = asArray(row["scope_object_types"]).filter((t): t is ObjectType =>
    (OBJECT_TYPES as readonly string[]).includes(t),
  );
  return {
    workerId: String(row["id"]),
    workerName: String(row["name"] ?? "AI"),
    enabled: String(row["status"] ?? "ACTIVE") === "ACTIVE",
    // Chỉ giữ những tool có thật trong registry — năng lực đọc (AI_CONTEXT_ENGINE) bị loại.
    allowedTools: asArray(row["allowed_tools"]).filter(isGovernedTool) as AiActionType[],
    permissionScope: {
      tenantId: String(row["tenant_id"] ?? ""),
      workspaceIds: wsRaw == null ? null : asArray(wsRaw),
      projectIds: prRaw == null ? null : asArray(prRaw),
      objectTypes: objectTypes.length ? objectTypes : ["TASK"],
    },
    autonomy,
  };
}

/** Đọc chính sách worker trực tiếp từ DB (dùng lúc xác nhận — luôn lấy bản hiện tại). */
export async function loadWorkerRuntimePolicy(
  supabase: Supa,
  workerId: string,
): Promise<AiWorkerRuntimePolicy | null> {
  const { data } = await supabase
    .from("ai_workers")
    .select(
      "id, tenant_id, name, status, allowed_tools, scope_workspace_ids, scope_project_ids, scope_object_types, autonomy_policy",
    )
    .eq("id", workerId)
    .maybeSingle();
  return toWorkerRuntimePolicy(data ?? null);
}

/** Quyền thật của con người khởi tạo: các workspace họ đang là thành viên trong tenant. */
export async function loadUserAuthority(
  supabase: Supa,
  userId: string,
  tenantId: string,
): Promise<GovernanceUserAuthority> {
  const { data: member } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { userId, tenantId: "", workspaceIds: [] };

  const { data: ws } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(tenant_id)")
    .eq("user_id", userId);
  const workspaceIds = (ws ?? [])
    .filter((r: any) => (r.workspaces?.tenant_id ?? tenantId) === tenantId)
    .map((r: any) => String(r.workspace_id));
  return { userId, tenantId, workspaceIds };
}

export interface GovernanceCheckInput {
  supabase: Supa;
  worker: AiWorkerRuntimePolicy | null;
  userId: string;
  execution: GovernanceExecutionScope;
  request: GovernanceActionRequest;
  targetFacts?: { priority?: string | null; participantCount?: number };
}

/** Điểm vào duy nhất cho mọi quyết định governance ở runtime. */
export async function checkAiWorkerAction(i: GovernanceCheckInput): Promise<GovernanceEvaluation> {
  const emptyScope = {
    tenantId: i.execution.tenantId,
    workspaceIds: [] as string[],
    projectIds: null,
    objectTypes: [] as string[],
  };
  const basePolicy = {
    riskPolicyVersion: RISK_POLICY_VERSION,
    autonomyPolicyVersion: AUTONOMY_POLICY_VERSION,
    workerId: i.execution.workerId,
    allowedTools: [] as string[],
    autonomy: DEFAULT_AUTONOMY_POLICY,
    evaluatedAt: new Date().toISOString(),
  };

  if (!i.worker) {
    return {
      decision: "DENY",
      riskLevel: "CRITICAL",
      reasonCode: "WORKER_DISABLED",
      safeReason: GOVERNANCE_SAFE_REASON.WORKER_DISABLED,
      effectiveScope: emptyScope,
      policy: basePolicy,
    };
  }

  const user = await loadUserAuthority(i.supabase, i.userId, i.execution.tenantId);
  if (!user.tenantId) {
    return {
      decision: "DENY",
      riskLevel: "CRITICAL",
      reasonCode: "CROSS_TENANT",
      safeReason: GOVERNANCE_SAFE_REASON.CROSS_TENANT,
      effectiveScope: emptyScope,
      policy: { ...basePolicy, workerId: i.worker.workerId, allowedTools: i.worker.allowedTools },
    };
  }

  return evaluateAiWorkerActionPolicy({
    worker: i.worker,
    user,
    execution: i.execution,
    request: i.request,
    ...(i.targetFacts ? { targetFacts: i.targetFacts } : {}),
  });
}

/** Loại đối tượng mà một tool tác động — dùng khi dựng yêu cầu hành động. */
export const objectTypeForTool = (t: AiActionType) => GOVERNED_TOOLS[t].objectType;

/** Ghi vết quyết định governance vào audit hiện có (không tạo bus sự kiện mới). */
export async function logGovernanceDecision(input: {
  tenantId: string | null;
  actorId: string;
  executionId: string;
  taskId: string;
  actionType: string;
  evaluation: GovernanceEvaluation;
  phase: "PROPOSAL" | "CONFIRMATION";
  proposalId?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_events").insert({
      tenant_id: input.tenantId,
      actor_id: input.actorId,
      actor_user_id: input.actorId,
      event_type: "ai_worker.policy_evaluated",
      action: "ai_worker.policy_evaluated",
      aggregate_type: "task",
      aggregate_id: input.taskId,
      resource_type: "ai_worker_policy",
      resource_id: input.evaluation.policy.workerId ?? input.taskId,
      source: "app",
      payload: {
        task_id: input.taskId,
        phase: input.phase,
        execution_id: input.executionId,
        proposal_id: input.proposalId ?? null,
        action_type: input.actionType,
        decision: input.evaluation.decision,
        risk: input.evaluation.riskLevel,
        reason_code: input.evaluation.reasonCode,
        worker_id: input.evaluation.policy.workerId,
        risk_policy_version: input.evaluation.policy.riskPolicyVersion,
        autonomy_policy_version: input.evaluation.policy.autonomyPolicyVersion,
      },
    });
  } catch {
    // quan sát không được chặn thực thi
  }
}
