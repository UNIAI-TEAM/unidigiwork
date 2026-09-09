// Universal Search V2 — server-only helpers (contract + mapping).
// The DB function public.search_universal is SECURITY INVOKER: RLS of the
// calling user is the single source of authorization truth.

export const SEARCH_ENTITY_TYPES = [
  "PROJECT",
  "TASK",
  "MEETING",
  "MEETING_ARTIFACT",
  "DOCUMENT",
  "WORK_PRODUCT",
  "EMAIL",
  "CHAT_CHANNEL",
  "PERSON",
] as const;
export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

/** Legacy/UI kind ids used by /search and ⌘K. */
export const SEARCH_KINDS = [
  "project",
  "task",
  "meeting",
  "artifact",
  "document",
  "workproduct",
  "email",
  "chat",
  "person",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

const KIND_BY_ENTITY: Record<SearchEntityType, SearchKind> = {
  PROJECT: "project",
  TASK: "task",
  MEETING: "meeting",
  MEETING_ARTIFACT: "artifact",
  DOCUMENT: "document",
  WORK_PRODUCT: "workproduct",
  EMAIL: "email",
  CHAT_CHANNEL: "chat",
  PERSON: "person",
};

const ENTITY_BY_KIND: Record<SearchKind, SearchEntityType> = {
  project: "PROJECT",
  task: "TASK",
  meeting: "MEETING",
  artifact: "MEETING_ARTIFACT",
  document: "DOCUMENT",
  workproduct: "WORK_PRODUCT",
  email: "EMAIL",
  chat: "CHAT_CHANNEL",
  person: "PERSON",
};

export const toEntityTypes = (kinds?: readonly SearchKind[]): string[] | undefined =>
  kinds && kinds.length ? kinds.map((k) => ENTITY_BY_KIND[k]) : undefined;

export const toKind = (entityType: string): SearchKind =>
  KIND_BY_ENTITY[entityType as SearchEntityType] ?? "document";

/** Single source of truth for deep links from a search hit. */
export function searchHref(entityType: string, id: string): string {
  switch (entityType as SearchEntityType) {
    case "PROJECT":
      return `/workspace/${id}`;
    case "TASK":
      return `/tasks/${id}`;
    case "MEETING":
      return `/meeting/${id}`;
    case "MEETING_ARTIFACT":
      // Provenance-safe fallback; mapRow builds the meeting-scoped link.
      return `/meeting?artifact=${id}`;
    case "DOCUMENT":
      return `/documents/${id}`;
    case "WORK_PRODUCT":
      return `/work-products/${id}`;
    case "EMAIL":
      return `/email/${id}`;
    case "CHAT_CHANNEL":
      return `/chat?channel=${id}`;
    case "PERSON":
      return `/people/${id}`;
    default:
      return "/home";
  }
}

export interface UniversalSearchItem {
  id: string;
  entityType: SearchEntityType;
  kind: SearchKind;
  title: string;
  subtitle: string;
  snippet: string;
  href: string;
  workspaceId: string | null;
  workspaceName: string | null;
  occurredAt: string | null;
  score: number;
  matchType: "EXACT" | "PREFIX" | "LEXICAL" | "FUZZY";
  /** Provenance: thực thể gốc sinh ra kết quả này (vd. artifact ← cuộc họp). */
  source: { type: SearchEntityType; id: string; title: string; href: string } | null;
}

export interface UniversalSearchResult {
  items: UniversalSearchItem[];
  total: number;
  counts: Record<SearchKind, number>;
  related: UniversalSearchItem[];
  nextOffset: number;
  hasMore: boolean;
  tookMs: number;
}

type Row = Record<string, unknown>;

export function mapRow(r: Row): UniversalSearchItem {
  const entityType = String(r["entity_type"]) as SearchEntityType;
  const id = String(r["entity_id"]);
  const parentType = (r["parent_type"] as string | null) ?? null;
  const parentId = (r["parent_id"] as string | null) ?? null;
  const source =
    parentType && parentId
      ? {
          type: parentType as SearchEntityType,
          id: parentId,
          title: String(r["parent_title"] ?? "Nguồn"),
          href: searchHref(parentType, parentId),
        }
      : null;
  const href =
    entityType === "MEETING_ARTIFACT" && parentId
      ? `/meeting/${parentId}?artifact=${id}`
      : searchHref(entityType, id);
  return {
    id,
    entityType,
    kind: toKind(entityType),
    title: String(r["title"] ?? "(Không tiêu đề)"),
    subtitle: String(r["subtitle"] ?? ""),
    snippet: String(r["snippet"] ?? ""),
    href,
    source,
    workspaceId: (r["workspace_id"] as string | null) ?? null,
    workspaceName: (r["workspace_name"] as string | null) ?? null,
    occurredAt: (r["updated_at"] as string | null) ?? null,
    score: Number(r["score"] ?? 0),
    matchType: (r["match_type"] as UniversalSearchItem["matchType"]) ?? "FUZZY",
  };
}

export const emptyCounts = (): Record<SearchKind, number> => ({
  project: 0,
  task: 0,
  meeting: 0,
  artifact: 0,
  document: 0,
  workproduct: 0,
  email: 0,
  chat: 0,
  person: 0,
});
