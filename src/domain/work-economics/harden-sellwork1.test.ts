// HARDEN-SELLWORK-1 — Regression: định danh model, an toàn đa tiền tệ, độ đầy đủ.
import { describe, expect, it } from "vitest";
import { isResolvableModelIdentity, parseModelIdentity } from "./model-identity";
import { toWorkProductEconomics } from "./pricing";

describe("parseModelIdentity", () => {
  it("tách provider từ chuỗi có tiền tố", () => {
    expect(parseModelIdentity("google/gemini-3-flash")).toEqual({
      provider: "google",
      model: "gemini-3-flash",
      raw: "google/gemini-3-flash",
    });
  });

  it("suy provider từ họ model khi không có tiền tố", () => {
    expect(parseModelIdentity("gpt-5.6-sol").provider).toBe("openai");
    expect(parseModelIdentity("claude-sonnet-4").provider).toBe("anthropic");
  });

  it("không đoán bừa provider lạ", () => {
    const id = parseModelIdentity("mystery-model-x");
    expect(id.provider).toBe("unknown");
    expect(isResolvableModelIdentity(id)).toBe(false);
  });

  it("chuỗi rỗng không tạo được định danh", () => {
    expect(parseModelIdentity(null).raw).toBe("");
  });
});

const base = { workUnitCode: "WU_TEST", workUnitVersion: 1 };

describe("toWorkProductEconomics — an toàn đa tiền tệ", () => {
  it("cohort trộn tiền tệ không được cộng gộp", () => {
    const r = toWorkProductEconomics({
      ...base,
      executions: 4,
      costedExecutions: 4,
      fullCostExecutions: 4,
      knownCostTotal: 12.5,
      aiComputeCostTotal: 10,
      humanCostTotal: 2.5,
      currencies: ["USD", "VND"],
    });
    expect(r.currencyMismatch).toBe(true);
    expect(r.knownExecutionCost).toBeNull();
    expect(r.knownCostPerExecution).toBeNull();
    expect(r.knownCostPerAcceptedWork).toBeNull();
    expect(r.completeness).toBe("INSUFFICIENT");
    expect(r.missingSignals).toContain("CURRENCY_MISMATCH");
    expect(r.currency).toBe("MIXED");
  });

  it("cohort một loại tiền vẫn tính bình thường", () => {
    const r = toWorkProductEconomics({
      ...base,
      executions: 2,
      acceptedExecutions: 2,
      costedExecutions: 2,
      fullCostExecutions: 2,
      knownCostTotal: 4,
      aiComputeCostTotal: 3,
      humanCostTotal: 1,
      currencies: ["USD"],
    });
    expect(r.currencyMismatch).toBe(false);
    expect(r.knownCostPerExecution).toBe(2);
    expect(r.completeness).toBe("FULL");
  });

  it("chi phí chưa đo là null, tuyệt đối không quy về 0", () => {
    const r = toWorkProductEconomics({ ...base, executions: 3, costedExecutions: 0, currencies: ["USD"] });
    expect(r.knownExecutionCost).toBeNull();
    expect(r.knownCostPerExecution).toBeNull();
    expect(r.completeness).toBe("INSUFFICIENT");
    expect(r.missingSignals).toContain("AI_COMPUTE");
  });
});
