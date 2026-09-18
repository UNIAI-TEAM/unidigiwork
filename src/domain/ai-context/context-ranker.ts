// AI CONTEXT ENGINE — Context Ranker (client-safe, thuần hàm, không I/O).
// Tách khỏi tầng truy xuất: nhận candidate đã có tín hiệu, trả điểm + giải thích.
// Có version để so sánh chất lượng ranking giữa các lần thay đổi trọng số.
import type { WorkRelationshipCode } from "@/domain/work-graph/relationship-types";
import { RELATIONSHIP_WEIGHTS, type AiContextEntityType } from "./contracts";
import { computeTemporalFreshness, type TemporalFreshness } from "./temporal-freshness";

export const CONTEXT_RANKER_VERSION = "ranker-v2-freshness";

export type RankRelationship = WorkRelationshipCode | "ROOT" | "SEARCH_MATCH" | null;

export interface RankInput {
  type: AiContextEntityType;
  id: string;
  updatedAt: string | null;
  /** Điểm khớp từ khoá [0,1]. */
  lexical: number;
  relationship: RankRelationship;
  /** 0 = gốc, 1 = kề gốc trong graph, 2 = từ tìm kiếm. */
  graphDistance: 0 | 1 | 2;
  /** Điểm ưu tiên theo ý định câu hỏi [0,1] — do tầng truy xuất tính. */
  intentPriority: number;
}

export interface RankBreakdown {
  lexical: number;
  relationship: number;
  priority: number;
  proximity: number;
  freshness: number;
}

export interface RankedCandidate<T extends RankInput = RankInput> {
  candidate: T;
  score: number;
  breakdown: RankBreakdown;
  freshness: TemporalFreshness;
  rankerVersion: string;
}

/** Trọng số chuẩn hoá — tổng = 1. Đổi trọng số thì phải đổi CONTEXT_RANKER_VERSION. */
export const RANK_WEIGHTS = {
  lexical: 0.28,
  relationship: 0.2,
  priority: 0.2,
  proximity: 0.14,
  freshness: 0.18,
} as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function relationshipScore(rel: RankRelationship): number {
  if (rel === "ROOT") return 1;
  if (rel === "SEARCH_MATCH" || !rel) return 0.25;
  return RELATIONSHIP_WEIGHTS[rel as WorkRelationshipCode] ?? 0.25;
}

function proximityScore(distance: 0 | 1 | 2): number {
  if (distance === 0) return 1;
  return distance === 1 ? 0.7 : 0.25;
}

/** Xếp hạng một candidate và trả về đầy đủ thành phần điểm (giải thích được). */
export function rankCandidate<T extends RankInput>(
  candidate: T,
  now: Date = new Date(),
): RankedCandidate<T> {
  const freshness = computeTemporalFreshness(candidate.type, candidate.updatedAt, now);
  const breakdown: RankBreakdown = {
    lexical: clamp01(candidate.lexical),
    relationship: clamp01(relationshipScore(candidate.relationship)),
    priority: clamp01(candidate.intentPriority),
    proximity: proximityScore(candidate.graphDistance),
    freshness: clamp01(freshness.decay),
  };
  const score =
    breakdown.lexical * RANK_WEIGHTS.lexical +
    breakdown.relationship * RANK_WEIGHTS.relationship +
    breakdown.priority * RANK_WEIGHTS.priority +
    breakdown.proximity * RANK_WEIGHTS.proximity +
    breakdown.freshness * RANK_WEIGHTS.freshness;

  return {
    candidate,
    score: Number(score.toFixed(6)),
    breakdown,
    freshness,
    rankerVersion: CONTEXT_RANKER_VERSION,
  };
}

/**
 * Xếp hạng cả danh sách. Thứ tự ổn định: điểm giảm dần, hoà điểm thì nguồn mới hơn
 * đứng trước, cuối cùng theo id để kết quả không đổi giữa các lần chạy.
 */
export function rankContextCandidates<T extends RankInput>(
  candidates: T[],
  now: Date = new Date(),
): RankedCandidate<T>[] {
  return candidates
    .map((c) => rankCandidate(c, now))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const af = a.freshness.ageDays ?? Number.MAX_SAFE_INTEGER;
      const bf = b.freshness.ageDays ?? Number.MAX_SAFE_INTEGER;
      if (af !== bf) return af - bf;
      return a.candidate.id.localeCompare(b.candidate.id);
    });
}
