// WE-3 — Regression runtime: chi phí, phiên bản bảng giá, phân loại độ tin cậy.
//
// Guard bắt buộc (không được nới lỏng):
//  1. Thiếu chi phí KHÔNG BAO GIỜ được quy về 0.
//  2. Biên lợi nhuận trên chi phí thiếu phải bị hạ cấp PROVISIONAL / NOT_RELIABLE.
//  3. Chi phí lịch sử phải tái tạo được theo `rate_version` (hàm thuần, tất định).
//  4. Chi phí con người chỉ đến từ cấu hình tường minh, không suy từ wall time.
import { describe, expect, it } from "vitest";
import {
  aiComputeCost,
  priceForTargetMargin,
  recommendPricingModel,
  simulateMargin,
  toWorkProductEconomics,
  validatePricingPolicyInput,
  type AiModelCostRate,
  type WorkProductEconomicsRaw,
} from "./pricing";

const RATE_V1: Pick<AiModelCostRate, "input_token_rate" | "output_token_rate"> = {
  input_token_rate: 0.15,
  output_token_rate: 0.6,
};
const RATE_V2: Pick<AiModelCostRate, "input_token_rate" | "output_token_rate"> = {
  input_token_rate: 0.3,
  output_token_rate: 1.2,
};

function raw(over: Partial<WorkProductEconomicsRaw> = {}): WorkProductEconomicsRaw {
  return {
    workUnitCode: "WU_DEMO",
    workUnitVersion: 1,
    executions: 10,
    acceptedExecutions: 8,
    verifiedOutcomes: 7,
    changeRequests: 2,
    firstPassAccepted: 6,
    reviewedExecutions: 10,
    avgRevisions: 1.2,
    avgHumanApprovals: 0.5,
    avgHumanReviews: 1,
    slaEvaluated: 10,
    slaMet: 9,
    knownCostTotal: 2,
    aiComputeCostTotal: 1.5,
    humanCostTotal: 0.5,
    costedExecutions: 10,
    fullCostExecutions: 0,
    currency: "USD",
    ...over,
  };
}

describe("AI compute cost theo phiên bản bảng giá", () => {
  it("tất định và tái tạo được cho từng rate_version", () => {
    expect(aiComputeCost(1_000_000, 500_000, RATE_V1)).toBe(0.45);
    expect(aiComputeCost(1_000_000, 500_000, RATE_V2)).toBe(0.9);
    // Chạy lại cùng đầu vào phải ra cùng kết quả (không phụ thuộc thời điểm).
    expect(aiComputeCost(123_456, 7_890, RATE_V1)).toBe(aiComputeCost(123_456, 7_890, RATE_V1));
  });

  it("token bằng 0 cho chi phí 0, không phải UNKNOWN", () => {
    expect(aiComputeCost(0, 0, RATE_V1)).toBe(0);
  });
});

describe("Guard: thiếu chi phí không được quy về 0", () => {
  it("không có lượt chạy nào được tính chi phí -> cơ sở chi phí null", () => {
    const e = toWorkProductEconomics(raw({ costedExecutions: 0, knownCostTotal: 0, aiComputeCostTotal: null, humanCostTotal: null }));
    expect(e.knownExecutionCost).toBeNull();
    expect(e.knownCostPerExecution).toBeNull();
    expect(e.knownCostPerAcceptedWork).toBeNull();
    expect(e.completeness).toBe("INSUFFICIENT");
  });

  it("thiếu chi phí con người vẫn giữ nguyên trong missingSignals", () => {
    const e = toWorkProductEconomics(raw({ humanCostTotal: null }));
    expect(e.missingSignals).toContain("HUMAN_REVIEW");
    expect(e.completeness).toBe("PARTIAL");
  });
});

describe("Phân loại FULL / PROVISIONAL / NOT_RELIABLE", () => {
  const price = 5;

  it("chi phí đủ -> FULL", () => {
    const e = toWorkProductEconomics(raw({ fullCostExecutions: 10 }));
    expect(e.completeness).toBe("FULL");
    const s = simulateMargin({ economics: e, pricingModel: "PER_EXECUTION", commercialUnit: "EXECUTION", proposedPrice: price, currency: "USD" });
    expect(s.classification).toBe("FULL");
    expect(s.marginPercent).toBeCloseTo(96, 0);
  });

  it("chi phí một phần -> PROVISIONAL kèm cảnh báo", () => {
    const e = toWorkProductEconomics(raw());
    const s = simulateMargin({ economics: e, pricingModel: "PER_EXECUTION", commercialUnit: "EXECUTION", proposedPrice: price, currency: "USD" });
    expect(s.classification).toBe("PROVISIONAL");
    expect(s.warnings).toContain("INCOMPLETE_COST_BASE");
    expect(s.knownCostBasis).toBe(0.2);
  });

  it("không có cơ sở chi phí -> NOT_RELIABLE và không trả biên", () => {
    const e = toWorkProductEconomics(raw({ costedExecutions: 0, knownCostTotal: 0 }));
    const s = simulateMargin({ economics: e, pricingModel: "PER_EXECUTION", commercialUnit: "EXECUTION", proposedPrice: price, currency: "USD" });
    expect(s.classification).toBe("NOT_RELIABLE");
    expect(s.marginPercent).toBeNull();
    expect(s.warnings).toContain("NO_KNOWN_COST_BASIS");
  });

  it("giá không hợp lệ -> NOT_RELIABLE", () => {
    const e = toWorkProductEconomics(raw({ fullCostExecutions: 10 }));
    const s = simulateMargin({ economics: e, pricingModel: "PER_EXECUTION", commercialUnit: "EXECUTION", proposedPrice: 0, currency: "USD" });
    expect(s.classification).toBe("NOT_RELIABLE");
    expect(s.warnings).toContain("INVALID_PRICE");
  });

  it("cỡ mẫu nhỏ luôn được cảnh báo", () => {
    const e = toWorkProductEconomics(raw({ executions: 2, acceptedExecutions: 1, costedExecutions: 2, fullCostExecutions: 2 }));
    const s = simulateMargin({ economics: e, pricingModel: "PER_EXECUTION", commercialUnit: "EXECUTION", proposedPrice: price, currency: "USD" });
    expect(e.lowSampleSize).toBe(true);
    expect(s.warnings).toContain("LOW_SAMPLE_SIZE");
  });
});

describe("Giá theo biên mục tiêu", () => {
  it("chỉ khuyến nghị giá khi chi phí đầy đủ", () => {
    const full = toWorkProductEconomics(raw({ fullCostExecutions: 10 }));
    const r = priceForTargetMargin(full, 60, "EXECUTION");
    expect(r.reliable).toBe(true);
    expect(r.requiredPrice).toBeCloseTo(0.5, 6);

    const partial = toWorkProductEconomics(raw());
    const p = priceForTargetMargin(partial, 60, "EXECUTION");
    expect(p.reliable).toBe(false);
    expect(p.requiredPrice).toBeNull();
    expect(p.indicativeFloor).toBe(0.2);
  });
});

describe("Chỉ số đơn vị công việc", () => {
  it("tính đúng tỉ lệ đạt lần đầu, SLA, kết quả kiểm chứng", () => {
    const e = toWorkProductEconomics(raw());
    expect(e.firstPassAcceptanceRate).toBe(60);
    expect(e.slaAchievementRate).toBe(90);
    expect(e.verifiedOutcomeRate).toBe(70);
    expect(e.knownCostPerAcceptedWork).toBe(0.25);
  });

  it("không có lượt chạy -> mọi tỉ lệ là null, không phải 0", () => {
    const e = toWorkProductEconomics(raw({ executions: 0, acceptedExecutions: 0, reviewedExecutions: 0, slaEvaluated: 0, costedExecutions: 0, verifiedOutcomes: 0 }));
    expect(e.firstPassAcceptanceRate).toBeNull();
    expect(e.slaAchievementRate).toBeNull();
    expect(e.verifiedOutcomeRate).toBeNull();
    expect(e.missingSignals).toContain("NO_EXECUTIONS");
  });
});

describe("Chính sách giá", () => {
  it("chặn giá âm, tiền tệ lạ, gói thiếu số lượng", () => {
    expect(validatePricingPolicyInput({ pricingModel: "PER_EXECUTION", currency: "USD", unitPrice: -1, workUnitVersion: 1 })).toContain("INVALID_PRICE");
    expect(validatePricingPolicyInput({ pricingModel: "PER_EXECUTION", currency: "XYZ", unitPrice: 1, workUnitVersion: 1 })).toContain("UNSUPPORTED_CURRENCY");
    expect(validatePricingPolicyInput({ pricingModel: "BUNDLE", currency: "USD", bundleQuantity: 0, bundlePrice: 0, workUnitVersion: 1 })).toEqual(
      expect.arrayContaining(["INVALID_BUNDLE_QUANTITY", "INVALID_BUNDLE_PRICE"]),
    );
    expect(validatePricingPolicyInput({ pricingModel: "PER_ACCEPTED_OUTCOME", currency: "USD", unitPrice: 2, workUnitVersion: 1 })).toEqual([]);
  });

  it("gợi ý mô hình giá luôn chỉ mang tính tham khảo", () => {
    const e = toWorkProductEconomics(raw({ firstPassAccepted: 3 }));
    const c = recommendPricingModel(e);
    expect(c.advisoryOnly).toBe(true);
    expect(c.candidate).toBe("PER_ACCEPTED_OUTCOME");
  });
});
