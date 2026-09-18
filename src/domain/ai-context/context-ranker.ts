// AI CONTEXT ENGINE — Context Ranker (client-safe, thuần hàm, không I/O).
// ĐIỂM XẾP HẠNG DUY NHẤT của hệ thống: nhận GRAPH CONTEXT + SEMANTIC CONTEXT,
// hợp nhất, chấm điểm giải thích được và trả thứ tự ổn định.
// Mọi consumer (My AI, Executive, AI Workers) dùng module này — không consumer nào
// được tự tính rank riêng.
import type { WorkRelationshipCode } from "@/domain/work-graph/relationship-types";
import { RELATIONSHIP_WEIGHTS, type AiContextEntityType } from "./contracts";
import type { QueryIntent } from "./query-intent";
import { computeTemporalFreshness, type TemporalFreshness } from "./temporal-freshness";

export const CONTEXT_RANKER_VERSION = "ranker-v4-recency";

export type RankRelationship = WorkRelationshipCode | "ROOT" | "SEARCH_MATCH" | null;

/** Kênh ngữ cảnh mà ứng viên đến từ. */
export type ContextChannel = "GRAPH" | "SEMANTIC" | "BOTH";

/** Ứng viên đã chuẩn hoá — mọi consumer đưa về hình dạng này trước khi xếp hạng. */
export interface RankInput {
  type: AiContextEntityType;
  id: string;
  updatedAt: string | null;
  /** Điểm khớp từ khoá [0,1]. */
  lexical: number;
  relationship: RankRelationship;
  /** 0 = gốc, 1 = kề gốc trong graph, 2 = từ tìm kiếm. */
  graphDistance: 0 | 1 | 2;
  /** Ưu tiên theo ý định câu hỏi [0,1]. Bỏ trống thì ranker tự tính từ intent. */
  intentPriority?: number;
  channel?: ContextChannel;
  /**
   * Độ mới TƯƠNG ĐỐI trong chính tập ứng viên [0,1]; 1 = thực thể mới nhất.
   * Ranker tự tính, consumer không cần truyền.
   */
  recency?: number;
}

/** Ứng viên đến từ Work Graph (bounded traversal quanh root). */
export interface GraphContextCandidate extends Omit<RankInput, "lexical" | "channel"> {
  lexical?: number;
}

/** Ứng viên đến từ tìm kiếm ngữ nghĩa / từ khoá. */
export interface SemanticContextCandidate extends Omit<
  RankInput,
  "relationship" | "graphDistance" | "channel"
> {
  relationship?: RankRelationship;
  graphDistance?: 0 | 1 | 2;
}

export interface RankBreakdown {
  lexical: number;
  relationship: number;
  priority: number;
  proximity: number;
  freshness: number;
  /** Độ mới tương đối so với các ứng viên còn lại. */
  recency: number;
}

export interface RankedCandidate<T extends RankInput = RankInput> {
  candidate: T;
  channel: ContextChannel;
  score: number;
  breakdown: RankBreakdown;
  freshness: TemporalFreshness;
  rankerVersion: string;
}

/** Trọng số chuẩn hoá — tổng = 1. Đổi trọng số thì phải đổi CONTEXT_RANKER_VERSION. */
export const RANK_WEIGHTS = {
  lexical: 0.24,
  relationship: 0.17,
  priority: 0.17,
  proximity: 0.12,
  freshness: 0.16,
  recency: 0.14,
} as const;

/** Ưu tiên nền theo loại thực thể — nguồn duy nhất, không lặp ở tầng truy xuất. */
export const ENTITY_PRIORITY_BASE: Record<AiContextEntityType, number> = {
  TASK: 0.6,
  MEETING: 0.55,
  WORKSPACE: 0.5,
  EMAIL: 0.45,
  DOCUMENT: 0.45,
  CHAT_CHANNEL: 0.4,
  MEETING_ARTIFACT: 0.72,
  PERSON: 0.3,
  TENANT: 0,
  WORK_PRODUCT: 0.6,
  EXECUTION: 0.55,
  DECISION: 0.75,
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Ưu tiên theo ý định câu hỏi — deterministic, giải thích được. */
export function computeIntentPriority(
  candidate: Pick<RankInput, "type" | "relationship">,
  intent?: QueryIntent | null,
  rootType?: AiContextEntityType | null,
): number {
  let priority = ENTITY_PRIORITY_BASE[candidate.type] ?? 0.3;
  if (!intent) return clamp01(priority);
  if (
    intent.wantsBlockers &&
    (candidate.type === "TASK" ||
      candidate.relationship === "BLOCKS" ||
      candidate.relationship === "DEPENDS_ON")
  )
    priority += 0.2;
  if (
    intent.wantsCommunication &&
    (candidate.type === "EMAIL" ||
      candidate.type === "CHAT_CHANNEL" ||
      candidate.type === "MEETING")
  )
    priority += 0.2;
  if (intent.wantsLatestMeeting && candidate.type === "MEETING") priority += 0.25;
  if (
    candidate.type === "MEETING_ARTIFACT" &&
    (intent.wantsMeetingOutcome || rootType === "MEETING")
  )
    priority += 0.3;
  return clamp01(priority);
}

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
    priority: clamp01(candidate.intentPriority ?? ENTITY_PRIORITY_BASE[candidate.type] ?? 0.3),
    proximity: proximityScore(candidate.graphDistance),
    freshness: clamp01(freshness.decay),
    // Khi ranker không tính được thứ hạng tương đối (một ứng viên duy nhất),
    // dùng chính độ tươi tuyệt đối để không thưởng/phạt sai.
    recency: clamp01(candidate.recency ?? freshness.decay),
  };
  const score =
    breakdown.lexical * RANK_WEIGHTS.lexical +
    breakdown.relationship * RANK_WEIGHTS.relationship +
    breakdown.priority * RANK_WEIGHTS.priority +
    breakdown.proximity * RANK_WEIGHTS.proximity +
    breakdown.freshness * RANK_WEIGHTS.freshness +
    breakdown.recency * RANK_WEIGHTS.recency;

  return {
    candidate,
    channel: candidate.channel ?? "SEMANTIC",
    score: Number(score.toFixed(6)),
    breakdown,
    freshness,
    rankerVersion: CONTEXT_RANKER_VERSION,
  };
}

const byScore = <T extends RankInput>(a: RankedCandidate<T>, b: RankedCandidate<T>) => {
  if (b.score !== a.score) return b.score - a.score;
  const af = a.freshness.ageDays ?? Number.MAX_SAFE_INTEGER;
  const bf = b.freshness.ageDays ?? Number.MAX_SAFE_INTEGER;
  if (af !== bf) return af - bf;
  return a.candidate.id.localeCompare(b.candidate.id);
};

/**
 * Xếp hạng danh sách đã chuẩn hoá. Thứ tự ổn định: điểm giảm dần, hoà điểm thì
 * nguồn mới hơn đứng trước, cuối cùng theo id.
 */
/**
 * Gán độ mới TƯƠNG ĐỐI trong tập ứng viên: thực thể mới nhất = 1, cũ nhất = 0.
 * Đây là tín hiệu "ưu tiên thực thể mới nhất", độc lập với độ tươi tuyệt đối
 * (vốn phụ thuộc chu kỳ bán rã của từng loại). Ứng viên không có mốc thời gian
 * nhận 0.35 — không thưởng, không phạt nặng.
 */
function withRelativeRecency<T extends RankInput>(candidates: T[]): T[] {
  const times = candidates.map((c) => {
    const ts = c.updatedAt ? new Date(c.updatedAt).getTime() : Number.NaN;
    return Number.isNaN(ts) ? null : ts;
  });
  const known = times.filter((t): t is number => t !== null);
  if (known.length < 2) return candidates;
  const newest = Math.max(...known);
  const oldest = Math.min(...known);
  const span = newest - oldest;
  return candidates.map((c, i) => {
    if (c.recency !== undefined) return c;
    const t = times[i];
    if (t === null) return { ...c, recency: 0.35 };
    return { ...c, recency: span === 0 ? 1 : (t - oldest) / span };
  });
}

export function rankContextCandidates<T extends RankInput>(
  candidates: T[],
  now: Date = new Date(),
): RankedCandidate<T>[] {
  return withRelativeRecency(candidates)
    .map((c) => rankCandidate(c, now))
    .sort(byScore);
}

export interface UnifiedRankRequest<M = unknown> {
  /** Ứng viên từ Work Graph (bounded traversal, permission-filtered). */
  graph?: (GraphContextCandidate & { meta?: M })[];
  /** Ứng viên từ tìm kiếm ngữ nghĩa / từ khoá. */
  semantic?: (SemanticContextCandidate & { meta?: M })[];
  intent?: QueryIntent | null;
  rootType?: AiContextEntityType | null;
  now?: Date;
}

export type UnifiedCandidate<M = unknown> = RankInput & { meta?: M };

/**
 * HỢP NHẤT + XẾP HẠNG: đầu vào là hai luồng ngữ cảnh, đầu ra là một danh sách
 * duy nhất đã khử trùng lặp. Thực thể xuất hiện ở cả hai luồng được gộp tín hiệu
 * (lexical lấy max, quan hệ/khoảng cách lấy từ graph) và đánh dấu channel = BOTH.
 */
export function rankUnifiedContext<M = unknown>(
  request: UnifiedRankRequest<M>,
): RankedCandidate<UnifiedCandidate<M>>[] {
  const now = request.now ?? new Date();
  const merged = new Map<string, UnifiedCandidate<M>>();

  const add = (c: UnifiedCandidate<M>, channel: ContextChannel) => {
    const key = `${c.type}:${c.id}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...c, channel });
      return;
    }
    merged.set(key, {
      ...prev,
      ...c,
      lexical: Math.max(prev.lexical ?? 0, c.lexical ?? 0),
      relationship: channel === "GRAPH" ? c.relationship : (prev.relationship ?? c.relationship),
      graphDistance: (Math.min(prev.graphDistance ?? 2, c.graphDistance ?? 2) ?? 2) as 0 | 1 | 2,
      updatedAt: c.updatedAt ?? prev.updatedAt,
      meta: c.meta ?? prev.meta,
      channel: prev.channel === channel ? channel : "BOTH",
    });
  };

  for (const c of request.semantic ?? [])
    add(
      {
        ...c,
        relationship: c.relationship ?? "SEARCH_MATCH",
        graphDistance: c.graphDistance ?? 2,
        lexical: clamp01(c.lexical ?? 0),
      },
      "SEMANTIC",
    );
  for (const c of request.graph ?? []) add({ ...c, lexical: clamp01(c.lexical ?? 0) }, "GRAPH");

  const normalized = [...merged.values()].map((c) => ({
    ...c,
    intentPriority:
      c.intentPriority ??
      computeIntentPriority(c, request.intent ?? null, request.rootType ?? null),
  }));

  return withRelativeRecency(normalized)
    .map((c) => rankCandidate(c, now))
    .sort(byScore);
}
