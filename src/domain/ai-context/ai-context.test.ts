import { describe, expect, it } from "vitest";
import { parseQueryIntent } from "./query-intent";
import { AI_CONTEXT_POLICY, RELATIONSHIP_WEIGHTS, estimateTokens } from "./contracts";

describe("query intent (deterministic, no LLM)", () => {
  it("nhận diện time range tiếng Việt", () => {
    expect(parseQueryIntent("Tuần này có trao đổi gì?").timeRange?.label).toBe("tuần này");
    expect(parseQueryIntent("Việc hôm nay").timeRange?.label).toBe("hôm nay");
    expect(parseQueryIntent("Tình hình dự án").timeRange).toBeNull();
  });

  it("nhận diện entity hints VI/EN", () => {
    expect(parseQueryIntent("Tài liệu nào liên quan task này?").entityHints).toEqual(
      expect.arrayContaining(["TASK", "DOCUMENT"]),
    );
    expect(parseQueryIntent("recent meetings").entityHints).toContain("MEETING");
  });

  it("nhận diện ý định blockers và trao đổi", () => {
    expect(parseQueryIntent("Dự án này đang vướng gì?").wantsBlockers).toBe(true);
    expect(parseQueryIntent("Tuần này khách hàng trao đổi gì?").wantsCommunication).toBe(true);
    expect(parseQueryIntent("Có bao nhiêu task quá hạn?").wantsCounts).toBe(true);
  });
});

describe("context policy", () => {
  it("giới hạn cứng theo kiến trúc", () => {
    expect(AI_CONTEXT_POLICY.graphDepth).toBe(1);
    expect(AI_CONTEXT_POLICY.maxSourcesHard).toBeLessThanOrEqual(20);
    expect(AI_CONTEXT_POLICY.maxTokensHard).toBeLessThanOrEqual(12_000);
  });

  it("BLOCKS phải nặng hơn RELATED_TO", () => {
    expect(RELATIONSHIP_WEIGHTS.BLOCKS).toBeGreaterThan(RELATIONSHIP_WEIGHTS.RELATED_TO);
    expect(RELATIONSHIP_WEIGHTS.DEPENDS_ON).toBeGreaterThan(RELATIONSHIP_WEIGHTS.REFERENCES);
  });

  it("ước lượng token tăng theo độ dài", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});