import { describe, expect, it } from "vitest";
import { validateAnswerCitations, isSafeInternalHref } from "./citations";
import type { ContextSource } from "./contracts";

const src = (id: string, href: string): ContextSource => ({
  sourceId: id,
  entityType: "TASK",
  entityId: id,
  title: `Task ${id}`,
  href,
  excerpt: "",
  updatedAt: null,
});

describe("validateAnswerCitations", () => {
  const sources = [src("S1", "/tasks/1"), src("S2", "/tasks/2")];

  it("giữ citation hợp lệ và gắn đúng href", () => {
    const r = validateAnswerCitations("Việc A đang trễ [S1].", sources);
    expect(r.citedSources.map((s) => s.href)).toEqual(["/tasks/1"]);
    expect(r.segments.find((s) => s.type === "citation")?.source?.href).toBe("/tasks/1");
  });

  it("gỡ citation ID bịa", () => {
    const r = validateAnswerCitations("Có rủi ro [S9] nhưng ổn [S2].", sources);
    expect(r.answer).not.toContain("S9");
    expect(r.invalidIds).toContain("S9");
    expect(r.citedSources).toHaveLength(1);
  });

  it("loại nguồn có href không an toàn", () => {
    const r = validateAnswerCitations("Xem [S3].", [...sources, src("S3", "https://evil.com")]);
    expect(r.citedSources).toHaveLength(0);
    expect(r.invalidIds).toContain("S3");
  });

  it("hỗ trợ nhiều ID trong một token", () => {
    const r = validateAnswerCitations("Tổng hợp [S1, S2]", sources);
    expect(r.citedSources).toHaveLength(2);
  });

  it("isSafeInternalHref chặn scheme ngoài", () => {
    expect(isSafeInternalHref("/tasks/1")).toBe(true);
    expect(isSafeInternalHref("//evil.com")).toBe(false);
    expect(isSafeInternalHref("javascript:alert(1)")).toBe(false);
  });
});
