import { describe, expect, it } from "vitest";
import {
  buildTranscriptWindow,
  formatOffset,
  parseMeetingSummaryOutput,
  renderTranscriptForModel,
  toSummarySources,
  type TranscriptSegment,
} from "./contracts";

const seg = (i: number, content = `nội dung ${i}`): TranscriptSegment => ({
  id: `id-${i}`,
  speakerName: `Người ${i}`,
  offsetSeconds: i * 10,
  content,
  source: "LIVE_CAPTION",
  createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
});

describe("meeting intelligence contracts", () => {
  it("format offset thành hh:mm:ss", () => {
    expect(formatOffset(0)).toBe("00:00:00");
    expect(formatOffset(3725)).toBe("01:02:05");
  });

  it("gán sourceId ổn định và giữ đoạn cuối khi vượt hạn mức", () => {
    const segments = Array.from({ length: 500 }, (_, i) => seg(i));
    const { window, truncated } = buildTranscriptWindow(segments);
    expect(truncated).toBe(true);
    expect(window[0]?.sourceId).toBe("T1");
    expect(window.at(-1)?.id).toBe("id-499");
  });

  it("render transcript kèm sourceId và timestamp", () => {
    const { window } = buildTranscriptWindow([seg(1)]);
    expect(renderTranscriptForModel(window)).toContain("[T1] 00:00:10 Người 1: nội dung 1");
  });

  it("loại bỏ citation bịa, giữ citation hợp lệ", () => {
    const { window } = buildTranscriptWindow([seg(1), seg(2)]);
    const sources = toSummarySources(window);
    const parsed = parseMeetingSummaryOutput(
      JSON.stringify({
        summary: "Tóm tắt",
        highlights: ["a"],
        decisions: [{ title: "Chốt A", detail: "d", sourceIds: ["T1", "T99"] }],
        actionItems: [{ title: "Làm B", owner: "Nam", dueHint: null, sourceIds: ["T404"] }],
      }),
      sources.map((s) => s.sourceId),
    );
    expect(parsed.decisions[0]?.sourceIds).toEqual(["T1"]);
    // Grounding bắt buộc: item không còn nguồn hợp lệ bị loại bỏ hoàn toàn.
    expect(parsed.actionItems).toEqual([]);
    expect(parsed.highlights).toEqual(["a"]);
  });

  it("chịu được output không phải JSON", () => {
    const parsed = parseMeetingSummaryOutput("không phải json", ["T1"]);
    expect(parsed.summary).toBe("không phải json");
    expect(parsed.decisions).toEqual([]);
  });
});