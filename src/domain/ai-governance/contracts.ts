// WEE-2 — AI WORKER RUNTIME GOVERNANCE: contracts thuần (client-safe, không I/O).
//
// Bất biến:
//  - Fail closed. Không có nhánh "allow all".
//  - Không có tool registry thứ hai: mọi tool ở đây PHẢI là một action type của
//    AI Action Layer V1 (src/domain/ai-actions/contracts.ts).
//  - Model/nội dung ngữ cảnh KHÔNG bao giờ được sửa policy: policy chỉ đến từ
//    database (worker) + quyền của người khởi tạo + phạm vi lượt thực thi.
//  - AUTO_EXECUTE tồn tại trong enum nhưng bị khoá cứng cho mọi thay đổi nghiệp vụ.
import { AI_ACTION_TYPES, type AiActionType } from "@/domain/ai-actions/contracts";

/** Phiên bản luật rủi ro — ghi vào bằng chứng governance để tái dựng quyết định. */
export const RISK_POLICY_VERSION = "wee2.risk.v1";
export const AUTONOMY_POLICY_VERSION = "wee2.autonomy.v1";

/* ------------------------------- Risk model ------------------------------ */

export const AI_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type AiRiskLevel = (typeof AI_RISK_LEVELS)[number];

export const RISK_ORDER: Record<AiRiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export const AI_AUTONOMY_LEVELS = ["SUGGEST", "PREPARE", "EXECUTE_WITH_APPROVAL", "AUTO_EXECUTE"] as const;
export type AiAutonomyLevel = (typeof AI_AUTONOMY_LEVELS)[number];

/** WEE-2: không bật AUTO_EXECUTE cho bất kỳ thay đổi nghiệp vụ nào. */
export const AUTO_EXECUTE_ENABLED = false as const;

/* ------------------------------ Tool registry ---------------------------- */

export interface GovernedToolDefinition {
  /** Trùng đúng action type của AI Action Layer — không đặt tên mới. */
  toolId: AiActionType;
  baseRisk: AiRiskLevel;
  /** Loại đối tượng nghiệp vụ bị tác động (dùng cho permission scope). */
  objectType: "TASK" | "MEETING" | "EMAIL_DRAFT";
  mutating: boolean;
}

export const GOVERNED_TOOLS: Record<AiActionType, GovernedToolDefinition> = {
  CREATE_TASK: { toolId: "CREATE_TASK", baseRisk: "MEDIUM", objectType: "TASK", mutating: true },
  UPDATE_TASK_FIELDS: { toolId: "UPDATE_TASK_FIELDS", baseRisk: "MEDIUM", objectType: "TASK", mutating: true },
  CREATE_MEETING: { toolId: "CREATE_MEETING", baseRisk: "MEDIUM", objectType: "MEETING", mutating: true },
  CREATE_EMAIL_DRAFT: { toolId: "CREATE_EMAIL_DRAFT", baseRisk: "LOW", objectType: "EMAIL_DRAFT", mutating: true },
};

/** Năng lực chỉ-đọc do Context Engine đảm nhiệm; KHÔNG phải tool ghi. */
export const READ_ONLY_CAPABILITY = "AI_CONTEXT_ENGINE" as const;

export const isGovernedTool = (t: string): t is AiActionType =>
  (AI_ACTION_TYPES as readonly string[]).includes(t);

/* ------------------------------ Reason codes ----------------------------- */

export const GOVERNANCE_REASON_CODES = [
  "OK",
  "WORKER_DISABLED",
  "TOOL_NOT_ALLOWED",
  "ACTION_TYPE_UNKNOWN",
  "OUTSIDE_WORKER_SCOPE",
  "OUTSIDE_USER_SCOPE",
  "OUTSIDE_EXECUTION_SCOPE",
  "CROSS_TENANT",
  "RISK_NOT_ALLOWED",
  "AUTONOMY_NOT_ALLOWED",
  "TARGET_NOT_FOUND",
  "STALE_PERMISSION",
  "APPROVAL_REQUIRED",
  "OBJECT_TYPE_NOT_ALLOWED",
] as const;
export type GovernanceReasonCode = (typeof GOVERNANCE_REASON_CODES)[number];

/** Thông điệp an toàn cho người dùng — không lộ chi tiết nội bộ. */
export const GOVERNANCE_SAFE_REASON: Record<GovernanceReasonCode, string> = {
  OK: "Hành động nằm trong phạm vi được phép.",
  WORKER_DISABLED: "Nhân sự AI này đang bị tạm dừng.",
  TOOL_NOT_ALLOWED: "Nhân sự AI này không được cấp quyền thực hiện loại hành động đó.",
  ACTION_TYPE_UNKNOWN: "Loại hành động không được hỗ trợ.",
  OUTSIDE_WORKER_SCOPE: "Đối tượng nằm ngoài phạm vi làm việc của nhân sự AI.",
  OUTSIDE_USER_SCOPE: "Bạn không có quyền trên đối tượng này.",
  OUTSIDE_EXECUTION_SCOPE: "Đối tượng nằm ngoài phạm vi của lượt thực thi này.",
  CROSS_TENANT: "Không thể thao tác sang tổ chức khác.",
  RISK_NOT_ALLOWED: "Mức rủi ro của hành động vượt quá chính sách hiện tại.",
  AUTONOMY_NOT_ALLOWED: "Chính sách tự chủ không cho phép thực hiện hành động này.",
  TARGET_NOT_FOUND: "Không tìm thấy đối tượng cần thao tác.",
  STALE_PERMISSION: "Quyền đã thay đổi kể từ lúc đề xuất được tạo.",
  APPROVAL_REQUIRED: "Hành động cần bạn xác nhận trước khi thực hiện.",
  OBJECT_TYPE_NOT_ALLOWED: "Nhân sự AI không được cấp quyền trên loại đối tượng này.",
};

/* ------------------------------ Policy shape ----------------------------- */

export interface AiWorkerPermissionScope {
  tenantId: string;
  /** null = kế thừa phạm vi của người khởi tạo (ACTOR_DELEGATED). [] = không có. */
  workspaceIds: string[] | null;
  projectIds: string[] | null;
  objectTypes: GovernedToolDefinition["objectType"][];
}

export type AiWorkerAutonomyPolicy = Record<AiRiskLevel, AiAutonomyLevel | "DENY">;

export const DEFAULT_AUTONOMY_POLICY: AiWorkerAutonomyPolicy = {
  LOW: "PREPARE",
  MEDIUM: "EXECUTE_WITH_APPROVAL",
  HIGH: "EXECUTE_WITH_APPROVAL",
  CRITICAL: "DENY",
};

export interface AiWorkerRuntimePolicy {
  workerId: string;
  workerName: string;
  enabled: boolean;
  allowedTools: AiActionType[];
  permissionScope: AiWorkerPermissionScope;
  autonomy: AiWorkerAutonomyPolicy;
}

/* ---------------------------- Evaluation input --------------------------- */

export interface GovernanceUserAuthority {
  userId: string;
  tenantId: string;
  /** Workspace mà chính con người khởi tạo có quyền ghi. */
  workspaceIds: string[];
}

export interface GovernanceExecutionScope {
  executionId: string;
  tenantId: string;
  workspaceId: string;
  rootTaskId: string;
  projectId: string | null;
  initiatingUserId: string;
  workerId: string;
}

export interface GovernanceActionRequest {
  actionType: string;
  target: {
    tenantId: string;
    workspaceId: string;
    projectId: string | null;
    objectType: GovernedToolDefinition["objectType"];
    /** Chỉ có với hành động cập nhật. */
    objectId?: string | null;
    exists?: boolean;
  };
  payload: Record<string, unknown>;
}

export const GOVERNANCE_DECISIONS = [
  "ALLOW_SUGGEST",
  "ALLOW_PREPARE",
  "REQUIRE_APPROVAL",
  "ALLOW_AUTO",
  "DENY",
] as const;
export type GovernanceDecision = (typeof GOVERNANCE_DECISIONS)[number];

export interface GovernanceEvaluation {
  decision: GovernanceDecision;
  riskLevel: AiRiskLevel;
  reasonCode: GovernanceReasonCode;
  safeReason: string;
  effectiveScope: {
    tenantId: string;
    workspaceIds: string[];
    projectIds: string[] | null;
    objectTypes: string[];
  };
  policy: {
    riskPolicyVersion: string;
    autonomyPolicyVersion: string;
    workerId: string;
    allowedTools: string[];
    autonomy: AiWorkerAutonomyPolicy;
    evaluatedAt: string;
  };
}

/* ------------------------------- Risk rules ------------------------------ */

/**
 * Rủi ro do SERVER quyết định từ loại hành động + đối tượng + hiệu ứng.
 * Không có rules engine tổng quát, không nhận rủi ro do model đề xuất.
 */
export function resolveRiskLevel(
  actionType: AiActionType,
  payload: Record<string, unknown>,
  targetFacts: { priority?: string | null; participantCount?: number } = {},
): AiRiskLevel {
  const base = GOVERNED_TOOLS[actionType].baseRisk;
  if (actionType === "UPDATE_TASK_FIELDS") {
    const critical = targetFacts.priority === "urgent" || targetFacts.priority === "high";
    const changesOwnership = payload["assigneeId"] !== undefined && payload["assigneeId"] !== null;
    const changesDeadline = payload["dueAt"] !== undefined;
    if (critical && (changesOwnership || changesDeadline)) return "HIGH";
  }
  if (actionType === "CREATE_MEETING" && (targetFacts.participantCount ?? 0) > 15) return "HIGH";
  return base;
}

/* -------------------------- Decision (pure core) ------------------------- */

const intersect = (a: string[], b: string[]) => a.filter((x) => b.includes(x));

function deny(
  reasonCode: GovernanceReasonCode,
  riskLevel: AiRiskLevel,
  policy: GovernanceEvaluation["policy"],
  effectiveScope: GovernanceEvaluation["effectiveScope"],
): GovernanceEvaluation {
  return {
    decision: "DENY",
    riskLevel,
    reasonCode,
    safeReason: GOVERNANCE_SAFE_REASON[reasonCode],
    effectiveScope,
    policy,
  };
}

/**
 * Hàm quyết định governance duy nhất. Thuần tuý: mọi dữ kiện đã được server
 * phân giải trước (worker từ DB, quyền người dùng từ RLS, phạm vi lượt chạy).
 */
export function evaluateAiWorkerActionPolicy(input: {
  worker: AiWorkerRuntimePolicy;
  user: GovernanceUserAuthority;
  execution: GovernanceExecutionScope;
  request: GovernanceActionRequest;
  targetFacts?: { priority?: string | null; participantCount?: number };
  now?: Date;
}): GovernanceEvaluation {
  const { worker, user, execution, request } = input;
  const evaluatedAt = (input.now ?? new Date()).toISOString();

  const policy: GovernanceEvaluation["policy"] = {
    riskPolicyVersion: RISK_POLICY_VERSION,
    autonomyPolicyVersion: AUTONOMY_POLICY_VERSION,
    workerId: worker.workerId,
    allowedTools: worker.allowedTools,
    autonomy: worker.autonomy,
    evaluatedAt,
  };

  // Phạm vi hiệu lực = GIAO của ba phạm vi. Không bao giờ hợp.
  const workerWorkspaces = worker.permissionScope.workspaceIds;
  const workspaceIds = intersect(
    intersect(workerWorkspaces ?? user.workspaceIds, user.workspaceIds),
    [execution.workspaceId],
  );
  const projectIds =
    worker.permissionScope.projectIds === null
      ? execution.projectId
        ? [execution.projectId]
        : null
      : intersect(worker.permissionScope.projectIds, execution.projectId ? [execution.projectId] : []);

  const effectiveScope: GovernanceEvaluation["effectiveScope"] = {
    tenantId: execution.tenantId,
    workspaceIds,
    projectIds,
    objectTypes: worker.permissionScope.objectTypes,
  };

  // 1. Worker phải đang bật.
  if (!worker.enabled) return deny("WORKER_DISABLED", "LOW", policy, effectiveScope);

  // 2. Tool phải tồn tại trong registry (fail closed cho tool lạ).
  if (!isGovernedTool(request.actionType))
    return deny("ACTION_TYPE_UNKNOWN", "CRITICAL", policy, effectiveScope);
  const tool = GOVERNED_TOOLS[request.actionType];

  // 3. Tool phải nằm trong allowed_tools của worker.
  if (!worker.allowedTools.includes(tool.toolId))
    return deny("TOOL_NOT_ALLOWED", tool.baseRisk, policy, effectiveScope);

  // 4. Cùng tổ chức trên cả bốn trục.
  if (
    worker.permissionScope.tenantId !== execution.tenantId ||
    user.tenantId !== execution.tenantId ||
    request.target.tenantId !== execution.tenantId
  )
    return deny("CROSS_TENANT", tool.baseRisk, policy, effectiveScope);

  // 5. Người khởi tạo phải là người của lượt chạy và có quyền trên workspace đích.
  if (execution.initiatingUserId !== user.userId)
    return deny("STALE_PERMISSION", tool.baseRisk, policy, effectiveScope);
  if (!user.workspaceIds.includes(request.target.workspaceId))
    return deny("OUTSIDE_USER_SCOPE", tool.baseRisk, policy, effectiveScope);

  // 6. Phạm vi worker.
  if (workerWorkspaces !== null && !workerWorkspaces.includes(request.target.workspaceId))
    return deny("OUTSIDE_WORKER_SCOPE", tool.baseRisk, policy, effectiveScope);
  if (
    worker.permissionScope.projectIds !== null &&
    !(request.target.projectId && worker.permissionScope.projectIds.includes(request.target.projectId))
  )
    return deny("OUTSIDE_WORKER_SCOPE", tool.baseRisk, policy, effectiveScope);
  if (!worker.permissionScope.objectTypes.includes(tool.objectType))
    return deny("OBJECT_TYPE_NOT_ALLOWED", tool.baseRisk, policy, effectiveScope);

  // 7. Phạm vi lượt thực thi.
  if (request.target.workspaceId !== execution.workspaceId)
    return deny("OUTSIDE_EXECUTION_SCOPE", tool.baseRisk, policy, effectiveScope);
  if (execution.projectId && request.target.projectId && request.target.projectId !== execution.projectId)
    return deny("OUTSIDE_EXECUTION_SCOPE", tool.baseRisk, policy, effectiveScope);
  if (request.target.exists === false)
    return deny("TARGET_NOT_FOUND", tool.baseRisk, policy, effectiveScope);

  // 8. Rủi ro do server quyết định.
  const riskLevel = resolveRiskLevel(tool.toolId, request.payload, input.targetFacts ?? {});

  // 9. Tự chủ theo rủi ro.
  const autonomy = worker.autonomy[riskLevel] ?? "DENY";
  if (autonomy === "DENY") return deny("RISK_NOT_ALLOWED", riskLevel, policy, effectiveScope);

  if (autonomy === "SUGGEST")
    return { decision: "ALLOW_SUGGEST", riskLevel, reasonCode: "OK", safeReason: GOVERNANCE_SAFE_REASON.OK, effectiveScope, policy };
  if (autonomy === "PREPARE")
    return { decision: "ALLOW_PREPARE", riskLevel, reasonCode: "OK", safeReason: GOVERNANCE_SAFE_REASON.OK, effectiveScope, policy };
  if (autonomy === "AUTO_EXECUTE" && !AUTO_EXECUTE_ENABLED) {
    // Enum hỗ trợ, runtime khoá: hạ xuống cần xác nhận, không bao giờ tự chạy.
    return {
      decision: "REQUIRE_APPROVAL",
      riskLevel,
      reasonCode: "APPROVAL_REQUIRED",
      safeReason: GOVERNANCE_SAFE_REASON.APPROVAL_REQUIRED,
      effectiveScope,
      policy,
    };
  }
  if (autonomy === "AUTO_EXECUTE")
    return { decision: "ALLOW_AUTO", riskLevel, reasonCode: "OK", safeReason: GOVERNANCE_SAFE_REASON.OK, effectiveScope, policy };

  return {
    decision: "REQUIRE_APPROVAL",
    riskLevel,
    reasonCode: "APPROVAL_REQUIRED",
    safeReason: GOVERNANCE_SAFE_REASON.APPROVAL_REQUIRED,
    effectiveScope,
    policy,
  };
}

/** Nhãn hiển thị mức rủi ro (UI). */
export const RISK_LABEL: Record<AiRiskLevel, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Nghiêm trọng",
};
