import { describe, expect, it } from "vitest";
import {
  autonomyRatio,
  describeMissingSignals,
  formatDurationMs,
  outcomeYield,
  trustRatio,
  WORK_METRICS_VERSION,
} from "./contracts";

describe("WE-1 work economics contracts", () => {
  it("phiên bản số đo cố định", () => {
    expect(WORK_METRICS_VERSION).toBe("we1.metrics.v1");
  });

  it("không bịa tỉ lệ khi chưa có dữ liệu", () => {
    expect(trustRatio({ runs: 0, completeRuns: 0 })).toBeNull();
    expect(autonomyRatio([])).toBeNull();
    expect(outcomeYield({ runs: 0, verifiedOutcomes: 0 })).toBeNull();
  });

  it("tính tỉ lệ tin cậy và tự chủ theo số thật", () => {
    expect(trustRatio({ runs: 4, completeRuns: 3 })).toBe(75);
    expect(autonomyRatio([{ human_confirmations: 0 }, { human_confirmations: 2 }])).toBe(50);
    expect(outcomeYield({ runs: 5, verifiedOutcomes: 1 })).toBe(20);
  });

  it("hiển thị '—' khi không có thời lượng thay vì 0", () => {
    expect(formatDurationMs(null)).toBe("—");
    expect(formatDurationMs(undefined)).toBe("—");
    expect(formatDurationMs(950)).toBe("950 ms");
    expect(formatDurationMs(90_000)).toBe("1 phút 30 giây");
  });

  it("dịch tín hiệu thiếu và giữ nguyên mã lạ", () => {
    expect(describeMissingSignals(["TOKENS", "XYZ"])).toEqual([
      "Số token tiêu thụ",
      "XYZ",
    ]);
  });
});
