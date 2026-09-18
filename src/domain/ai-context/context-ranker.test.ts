import { describe, it, expect } from "vitest";
import { rankContextCandidates, RANK_WEIGHTS } from "./context-ranker";
import { computeTemporalFreshness, FRESHNESS_HALF_LIFE_DAYS } from "./temporal-freshness";

const now = new Date("2026-01-31T00:00:00.000Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe("temporal freshness", () => {
  it("giảm theo chu kỳ bán rã riêng của từng loại", () => {
    const chat = computeTemporalFreshness("CHAT_CHANNEL", daysAgo(10), now);
    const doc = computeTemporalFreshness("DOCUMENT", daysAgo(10), now);
    expect(chat.decay).toBeLessThan(doc.decay);
    expect(chat.halfLifeDays).toBe(FRESHNESS_HALF_LIFE_DAYS.CHAT_CHANNEL);
    expect(chat.level).toBe("aging");
    expect(doc.level).toBe("fresh");
  });

  it("không có mốc thời gian thì trả về unknown", () => {
    const f = computeTemporalFreshness("TASK", null, now);
    expect(f.level).toBe("unknown");
    expect(f.ageDays).toBeNull();
  });
});

describe("context ranker", () => {
  const base = {
    type: "TASK" as const,
    lexical: 0.5,
    relationship: "BELONGS_TO" as const,
    graphDistance: 1 as const,
    intentPriority: 0.6,
  };

  it("nguồn mới hơn xếp trên nguồn cũ khi các tín hiệu khác bằng nhau", () => {
    const ranked = rankContextCandidates(
      [
        { ...base, id: "old", updatedAt: daysAgo(90) },
        { ...base, id: "new", updatedAt: daysAgo(1) },
      ],
      now,
    );
    expect(ranked[0]!.candidate.id).toBe("new");
    expect(ranked[0]!.breakdown.freshness).toBeGreaterThan(ranked[1]!.breakdown.freshness);
  });

  it("trả về đầy đủ thành phần điểm và tổng trọng số bằng 1", () => {
    const total = Object.values(RANK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    const [r] = rankContextCandidates([{ ...base, id: "x", updatedAt: daysAgo(2) }], now);
    expect(Object.keys(r!.breakdown).sort()).toEqual([
      "freshness",
      "lexical",
      "priority",
      "proximity",
      "relationship",
    ]);
    expect(r!.score).toBeGreaterThan(0);
    expect(r!.score).toBeLessThanOrEqual(1);
  });
});

describe("unified ranker (graph + semantic)", () => {
  it("gộp cùng một thực thể ở hai luồng thành BOTH và giữ tín hiệu mạnh nhất", () => {
    const ranked = rankUnifiedContext({
      semantic: [{ type: "TASK", id: "t1", updatedAt: daysAgo(1), lexical: 0.9 }],
      graph: [
        {
          type: "TASK",
          id: "t1",
          updatedAt: daysAgo(1),
          relationship: "BELONGS_TO",
          graphDistance: 1,
        },
      ],
      now,
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.channel).toBe("BOTH");
    expect(ranked[0]!.breakdown.lexical).toBeCloseTo(0.9, 6);
    expect(ranked[0]!.breakdown.proximity).toBeGreaterThan(0.25);
  });

  it("tự tính ưu tiên theo ý định khi consumer không truyền", () => {
    const ranked = rankUnifiedContext({
      graph: [
        { type: "TASK", id: "a", updatedAt: daysAgo(1), relationship: "BELONGS_TO", graphDistance: 1 },
        { type: "PERSON", id: "b", updatedAt: daysAgo(1), relationship: "BELONGS_TO", graphDistance: 1 },
      ],
      intent: {
        entityHints: [],
        timeRange: null,
        wantsBlockers: true,
        wantsCommunication: false,
        wantsCounts: false,
        wantsLatestMeeting: false,
        wantsMeetingOutcome: false,
      },
      now,
    });
    expect(ranked[0]!.candidate.id).toBe("a");
    expect(ranked[0]!.breakdown.priority).toBeGreaterThan(ranked[1]!.breakdown.priority);
  });
});
