// Gate 8 + Gate 9 — hợp đồng kế hoạch thực thi phải fail-closed với output dị dạng.
import { describe, expect, it } from "vitest";
import { ACTION_INTENT_TYPES, parseExecutionPlan } from "./plan-schema";

describe("execution plan contract", () => {
  it("chấp nhận kế hoạch hợp lệ và suy ra needsAction từ actionIntent", () => {
    const r = parseExecutionPlan(
      JSON.stringify({
        objective: "Báo cáo tuần",
        riskLevel: "LOW",
        steps: [
          { order: 1, summary: "Thu thập dữ liệu", needsAction: false, actionIntent: null },
          {
            order: 2,
            summary: "Tạo việc theo dõi",
            needsAction: false,
            actionIntent: { actionType: "CREATE_TASK", objective: "Theo dõi rủi ro", targetType: "TASK", rationale: "" },
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.items[1]?.needsAction).toBe(true);
  });

  it("từ chối văn bản không phải JSON", () => {
    expect(parseExecutionPlan("xin chào").errorCode).toBe("PLAN_NOT_JSON");
    expect(parseExecutionPlan("{ steps: [").errorCode).toBe("PLAN_NOT_JSON");
  });

  it("từ chối kế hoạch sai schema", () => {
    expect(parseExecutionPlan(JSON.stringify({ steps: [] })).errorCode).toBe("PLAN_SCHEMA_INVALID");
    expect(parseExecutionPlan(JSON.stringify({ steps: [{ summary: 123 }] })).errorCode).toBe("PLAN_SCHEMA_INVALID");
  });

  it("từ chối actionType ngoài enum đóng — model không tự mở hành động mới", () => {
    const r = parseExecutionPlan(
      JSON.stringify({
        steps: [
          {
            order: 1,
            summary: "Xoá dự án",
            actionIntent: { actionType: "DELETE_PROJECT", objective: "x", targetType: "TASK", rationale: "" },
          },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    expect(ACTION_INTENT_TYPES).not.toContain("DELETE_PROJECT" as never);
  });

  it("bỏ qua payload database tự do model chèn thêm", () => {
    const r = parseExecutionPlan(
      JSON.stringify({
        steps: [
          {
            order: 1,
            summary: "Tạo việc",
            actionIntent: {
              actionType: "CREATE_TASK",
              objective: "abc",
              targetType: "TASK",
              rationale: "",
              sql: "delete from tasks",
              payload: { tenant_id: "*" },
            },
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.plan)).not.toContain("delete from tasks");
  });
});
