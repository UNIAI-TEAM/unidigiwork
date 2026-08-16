import { describe, expect, it } from "vitest";
import {
  buildTranscriptChunks,
  mergeStageResults,
  shouldUseStagedSummary,
  transcriptChecksum,
  type StageResult,
  type TranscriptSegment,
} from "./contracts";

const seg = (i: number, len = 300): TranscriptSegment => ({
  id: `id-${i}`,
  speakerName: `Người ${i % 5}`,
  offsetSeconds: i * 12,
  content: `noi dung ${i} `.padEnd(len, "x"),
  source: "LIVE_CAPTION",
  createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
});

describe("staged summarization", () => {
  it("họp ngắn không kích hoạt chế độ chia giai đoạn", () => {
    expect(shouldUseStagedSummary(Array.from({ length: 10 }, (_, i) => seg(i)))).toBe(false);
  });

  it("họp 2–3 giờ kích hoạt chia giai đoạn và chia nhiều chunk", () => {
    const segments = Array.from({ length: 900 }, (_, i) => seg(i)); // ~2.5h phụ đề
    expect(shouldUseStagedSummary(segments)).toBe(true);
    const { chunks } = buildTranscriptChunks(segments);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.startOffsetSeconds).toBeLessThan(chunks[1]!.startOffsetSeconds);
  });

  it("sourceId toàn cục, duy nhất và liên tục giữa các chunk", () => {
    const segments = Array.from({ length: 500 }, (_, i) => seg(i));
    const { chunks, sources } = buildTranscriptChunks(segments);
    const ids = chunks.flatMap((c) => c.window.map((w) => w.sourceId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("T1");
    expect(sources).toHaveLength(ids.length);
    expect(sources.at(-1)!.sourceId).toBe(`T${ids.length}`);
  });

  it("giữ các chunk cuối khi vượt hạn mức", () => {
    const segments = Array.from({ length: 4000 }, (_, i) => seg(i));
    const { chunks, truncated } = buildTranscriptChunks(segments);
    expect(truncated).toBe(true);
    expect(chunks.at(-1)!.window.at(-1)!.id).toBe("id-3999");
  });

  it("merge tất định các stage: khử trùng lặp, giữ nguồn", () => {
    const stages: StageResult[] = [
      {
        chunkIndex: 1,
        chunkSummary: "Phần 2",
        highlights: ["B"],
        decisions: [{ title: "Chốt v2", detail: "", sourceIds: ["T40"] }],
        actionItems: [],
        risks: [{ title: "Thiếu nhân sự", sourceIds: ["T50"] }],
        openQuestions: [],
      },
      {
        chunkIndex: 0,
        chunkSummary: "Phần 1",
        highlights: ["A"],
        decisions: [{ title: "Chốt v2", detail: "", sourceIds: ["T5"] }],
        actionItems: [{ title: "Kiểm thử", owner: null, dueHint: null, sourceIds: ["T7"] }],
        risks: [],
        openQuestions: [{ question: "Ai duyệt?", sourceIds: ["T8"] }],
      },
    ];
    const merged = mergeStageResults(stages);
    expect(merged.summary).toBe("Phần 1\nPhần 2");
    expect(merged.decisions).toHaveLength(1);
    expect(merged.actionItems[0]!.sourceIds).toEqual(["T7"]);
    expect(merged.risks).toHaveLength(1);
    expect(merged.openQuestions).toHaveLength(1);
  });

  it("checksum tính trên toàn bộ transcript nên vẫn phát hiện stale khi có đoạn mới", () => {
    const segments = Array.from({ length: 300 }, (_, i) => seg(i));
    const before = transcriptChecksum(segments);
    const after = transcriptChecksum([...segments, seg(300)]);
    expect(after).not.toBe(before);
  });
});