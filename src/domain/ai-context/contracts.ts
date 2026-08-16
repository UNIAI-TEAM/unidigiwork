// AI CONTEXT ENGINE V1 — contracts, weights và giới hạn (client-safe, không I/O).
// Đây là nơi duy nhất định nghĩa hình dạng Context Request / Context Pack.
import type { WorkEntityType, WorkRelationshipCode } from "@/domain/work-graph/relationship-types";

export type AiContextEntityType = WorkEntityType;

export type AiRetrievalStrategy =
  | "ROOT_CONTEXT"
  | "SEARCH"
  | "GRAPH_EXPANSION"
  | "TIME_FILTERED"
  | "MIXED";

export interface AiContextRequest {
  query: string;
  rootEntity?: { type: AiContextEntityType; id: string } | null;
  workspaceId?: string | null;
  timeRange?: { from: string; to: string; label: string } | null;
  requestedEntityTypes?: AiContextEntityType[] | null;
  maxSources?: number;
  maxTokens?: number;
}

export interface ContextEntity {
  entityType: AiContextEntityType;
  entityId: string;
  title: string;
  summary?: string | null;
  excerpt?: string | null;
  relationshipToRoot?: WorkRelationshipCode | "ROOT" | "SEARCH_MATCH" | null;
  updatedAt?: string | null;
  href: string;
  sourceRank: number;
}

export interface ContextRelationship {
  from: { type: AiContextEntityType; id: string };
  to: { type: AiContextEntityType; id: string };
  relationship: WorkRelationshipCode;
  weight: number;
}

export interface ContextSource {
  sourceId: string;
  entityType: AiContextEntityType;
  entityId: string;
  title: string;
  href: string;
  excerpt: string;
  updatedAt: string | null;
}

export interface ContextFact {
  key: string;
  value: string | number;
  sourceIds: string[];
}

export interface AiContextPack {
  requestId: string;
  tenantId: string;
  root?: ContextEntity | null;
  entities: ContextEntity[];
  relationships: ContextRelationship[];
  sources: ContextSource[];
  facts: ContextFact[];
  ambiguity?: { candidates: { entityType: AiContextEntityType; entityId: string; title: string; href: string }[] } | null;
  retrieval: {
    strategy: AiRetrievalStrategy;
    query: string;
    resultCount: number;
    graphExpansionDepth: number;
    truncated: boolean;
    timeRange?: { from: string; to: string; label: string } | null;
    timings: Record<string, number>;
  };
  budget: { estimatedTokens: number; maxTokens: number };
  partial: boolean;
  failures: string[];
}

export interface AiGroundedResponse {
  answer: string;
  sources: ContextSource[];
  contextRequestId: string;
  partial: boolean;
  ambiguous: boolean;
  usage?: { inputTokens: number; outputTokens: number; model: string } | null;
}

/* ------------------------------ Policy ------------------------------ */

/** Hard server-side caps — client KHÔNG thể vượt qua. */
export const AI_CONTEXT_POLICY = {
  maxSourcesHard: 20,
  maxSourcesDefault: 20,
  maxTokensHard: 12_000,
  maxTokensDefault: 8_000,
  graphDepth: 1,
  searchCandidates: 30,
  graphCandidates: 30,
  excerptCharCap: 700,
  perTypeLimits: {
    TASK: 10,
    MEETING: 5,
    MEETING_ARTIFACT: 8,
    DOCUMENT: 5,
    EMAIL: 5,
    CHAT_CHANNEL: 5,
    PERSON: 5,
    WORKSPACE: 3,
    TENANT: 0,
  } as Record<AiContextEntityType, number>,
} as const;

/** Trọng số quan hệ deterministic (§28). */
export const RELATIONSHIP_WEIGHTS: Record<WorkRelationshipCode, number> = {
  BLOCKS: 1.0,
  DEPENDS_ON: 0.9,
  GENERATES: 0.85,
  BELONGS_TO: 0.8,
  ASSIGNED_TO: 0.7,
  FOLLOWS_UP: 0.65,
  DISCUSSES: 0.6,
  ATTACHED_TO: 0.6,
  REFERENCES: 0.55,
  PARTICIPATED_IN: 0.5,
  SHARED_IN: 0.45,
  RELATED_TO: 0.3,
};

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export type AiContextErrorCode =
  | "AI_CONTEXT_ROOT_NOT_FOUND"
  | "AI_CONTEXT_ROOT_FORBIDDEN"
  | "AI_CONTEXT_INSUFFICIENT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_RATE_LIMITED";