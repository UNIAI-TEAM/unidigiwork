import { describe, expect, it } from "vitest";
import {
  AUTO_EXECUTE_ENABLED,
  DEFAULT_AUTONOMY_POLICY,
  evaluateAiWorkerActionPolicy,
  GOVERNED_TOOLS,
  resolveRiskLevel,
  type AiWorkerRuntimePolicy,
  type GovernanceActionRequest,
  type GovernanceExecutionScope,
} from "./contracts";
import { AI_ACTION_TYPES } from "@/domain/ai-actions/contracts";

const TENANT = "11111111-1111-1111-1111-111111111111";
const WS = "22222222-2222-2222-2222-222222222222";
const OTHER_WS = "33333333-3333-3333-3333-333333333333";
const USER = "44444444-4444-4444-4444-444444444444";

const worker = (over: Partial<AiWorkerRuntimePolicy> = {}): AiWorkerRuntimePolicy => ({
  workerId: "w1",
  workerName: "AI Project Analyst",
  enabled: true,
  allowedTools: ["CREATE_TASK"],
  permissionScope: { tenantId: TENANT, workspaceIds: null, projectIds: null, objectTypes: ["TASK"] },
  autonomy: DEFAULT_AUTONOMY_POLICY,
  ...over,
});

const execution: GovernanceExecutionScope = {
  executionId: "e1",
  tenantId: TENANT,
  workspaceId: WS,
  rootTaskId: "t1",
  projectId: null,
  initiatingUserId: USER,
  workerId: "w1",
};

const request = (over: Partial<GovernanceActionRequest["target"]> = {}, actionType = "CREATE_TASK"): GovernanceActionRequest => ({
  actionType,
  target: { tenantId: TENANT, workspaceId: WS, projectId: null, objectType: "TASK", ...over },
  payload: { title: "Việc mới" },
});

const user = { userId: USER, tenantId: TENANT, workspaceIds: [WS] };

describe("WEE-2 governance", () => {
  it("registry chỉ chứa tool có thật trong AI Action Layer", () => {
    expect(Object.keys(GOVERNED_TOOLS).sort()).toEqual([...AI_ACTION_TYPES].sort());
  });

  it("không bao giờ tự thực thi thay đổi nghiệp vụ", () => {
    expect(AUTO_EXECUTE_ENABLED).toBe(false);
    const r = evaluateAiWorkerActionPolicy({
      worker: worker({ autonomy: { ...DEFAULT_AUTONOMY_POLICY, MEDIUM: "AUTO_EXECUTE" } }),
      user,
      execution,
      request: request(),
    });
    expect(r.decision).toBe("REQUIRE_APPROVAL");
  });

  it("chặn tool ngoài allowed_tools", () => {
    const r = evaluateAiWorkerActionPolicy({
      worker: worker({ allowedTools: [] }),
      user,
      execution,
      request: request(),
    });
    expect(r.decision).toBe("DENY");
    expect(r.reasonCode).toBe("TOOL_NOT_ALLOWED");
  });

  it("chặn tool lạ (fail closed)", () => {
    const r = evaluateAiWorkerActionPolicy({ worker: worker(), user, execution, request: request({}, "SEND_EMAIL") });
    expect(r.reasonCode).toBe("ACTION_TYPE_UNKNOWN");
  });

  it("chặn ngoài phạm vi workspace của worker", () => {
    const r = evaluateAiWorkerActionPolicy({
      worker: worker({ permissionScope: { tenantId: TENANT, workspaceIds: [OTHER_WS], projectIds: null, objectTypes: ["TASK"] } }),
      user: { ...user, workspaceIds: [WS, OTHER_WS] },
      execution,
      request: request(),
    });
    expect(r.reasonCode).toBe("OUTSIDE_WORKER_SCOPE");
  });

  it("chặn khi con người không còn quyền trên workspace", () => {
    const r = evaluateAiWorkerActionPolicy({ worker: worker(), user: { ...user, workspaceIds: [] }, execution, request: request() });
    expect(r.reasonCode).toBe("OUTSIDE_USER_SCOPE");
  });

  it("chặn cross-tenant", () => {
    const r = evaluateAiWorkerActionPolicy({
      worker: worker(),
      user,
      execution,
      request: request({ tenantId: "99999999-9999-9999-9999-999999999999" }),
    });
    expect(r.reasonCode).toBe("CROSS_TENANT");
  });

  it("chặn worker bị tạm dừng", () => {
    const r = evaluateAiWorkerActionPolicy({ worker: worker({ enabled: false }), user, execution, request: request() });
    expect(r.reasonCode).toBe("WORKER_DISABLED");
  });

  it("rủi ro do server quyết định, không do payload tự khai", () => {
    expect(resolveRiskLevel("UPDATE_TASK_FIELDS", { dueAt: "2026-01-01T00:00:00Z" }, { priority: "urgent" })).toBe("HIGH");
    expect(resolveRiskLevel("CREATE_EMAIL_DRAFT", { risk: "LOW" })).toBe("LOW");
  });

  it("CRITICAL luôn bị từ chối theo chính sách mặc định", () => {
    const r = evaluateAiWorkerActionPolicy({
      worker: worker({ autonomy: { ...DEFAULT_AUTONOMY_POLICY, MEDIUM: "DENY" } }),
      user,
      execution,
      request: request(),
    });
    expect(r.decision).toBe("DENY");
    expect(r.reasonCode).toBe("RISK_NOT_ALLOWED");
  });

  it("cho phép trong phạm vi và ghi đủ bằng chứng chính sách", () => {
    const r = evaluateAiWorkerActionPolicy({ worker: worker(), user, execution, request: request() });
    expect(r.decision).toBe("REQUIRE_APPROVAL");
    expect(r.policy.riskPolicyVersion).toBe("wee2.risk.v1");
    expect(r.effectiveScope.workspaceIds).toEqual([WS]);
  });
});
