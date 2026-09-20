/**
 * GO-3 Option B — semantic mapping only.
 * Work Product identity is work_products.id. Document identity is documents.id.
 * These are never the same graph entity type.
 */

export const WORK_PRODUCT_USER_LINK_CODES = ["REFERENCES", "RELATED_TO"] as const;

export type Go3SystemProjection =
  | { code: "REALIZED_AS"; sourceType: "WORK_PRODUCT"; targetType: "DOCUMENT" }
  | { code: "PRODUCES"; sourceType: "TASK" | "MEETING"; targetType: "WORK_PRODUCT" };

const USER_LINKS = new Set<string>(WORK_PRODUCT_USER_LINK_CODES);

export function documentIsNotWorkProduct(documentId: string, workProductId: string): boolean {
  return documentId !== workProductId;
}

export function mergeMonotonicVersion(existing: number | null | undefined, incoming: number): number {
  const cur = typeof existing === "number" && Number.isFinite(existing) ? existing : 0;
  const next = typeof incoming === "number" && Number.isFinite(incoming) ? incoming : 0;
  return next > cur ? next : cur;
}

export function isCrossTenant(sourceTenantId: string | null | undefined, targetTenantId: string | null | undefined): boolean {
  if (!sourceTenantId || !targetTenantId) return true;
  return sourceTenantId !== targetTenantId;
}

/** Live WP editor links TASK / DOCUMENT / MEETING with REFERENCES or RELATED_TO. */
export function mapUserWorkProductLink(args: {
  sourceType: string;
  targetType: string;
  relationship: string;
}): Go3SystemProjection | null {
  if (!USER_LINKS.has(args.relationship)) return null;
  const a = args.sourceType;
  const b = args.targetType;
  if ((a === "WORK_PRODUCT" && b === "DOCUMENT") || (a === "DOCUMENT" && b === "WORK_PRODUCT")) {
    return { code: "REALIZED_AS", sourceType: "WORK_PRODUCT", targetType: "DOCUMENT" };
  }
  if ((a === "WORK_PRODUCT" && b === "TASK") || (a === "TASK" && b === "WORK_PRODUCT")) {
    return { code: "PRODUCES", sourceType: "TASK", targetType: "WORK_PRODUCT" };
  }
  if ((a === "WORK_PRODUCT" && b === "MEETING") || (a === "MEETING" && b === "WORK_PRODUCT")) {
    return { code: "PRODUCES", sourceType: "MEETING", targetType: "WORK_PRODUCT" };
  }
  return null;
}

/** Task→Document attach/reference is not Task→Work Product. */
export function taskDocumentLinkFabricatesWorkProduct(relationship: string, sourceType: string, targetType: string): boolean {
  void relationship;
  void sourceType;
  void targetType;
  return false;
}

export const GO3_GRAPH_SKIPPABLE_ERRORS = [
  "CROSS_TENANT",
  "NOT_FOUND",
  "INVALID_PAYLOAD",
  "DELETED_OR_MISSING",
  "SOURCE_TABLE_MISSING",
] as const;

export function isSkippableGraphError(error: string | null | undefined): boolean {
  return !!error && (GO3_GRAPH_SKIPPABLE_ERRORS as readonly string[]).includes(error);
}

export const GO3_OUTBOX_EVENTS = {
  documentVersionUploaded: "document.document.version_uploaded",
  /** Live outbox alias; do not rename. Same DOCUMENT latestVersion projector. */
  documentVersionCreated: "document.version.created",
  workProductUpserted: "work_product.work_product.upserted",
  workProductVersionCreated: "work_product.work_product.version_created",
} as const;

export const GO3_DOCUMENT_VERSION_EVENTS = [
  GO3_OUTBOX_EVENTS.documentVersionUploaded,
  GO3_OUTBOX_EVENTS.documentVersionCreated,
] as const;

export function isDocumentVersionGraphEvent(eventType: string): boolean {
  return (GO3_DOCUMENT_VERSION_EVENTS as readonly string[]).includes(eventType);
}

export function isWorkProductGraphEvent(eventType: string): boolean {
  return (
    eventType === GO3_OUTBOX_EVENTS.workProductUpserted ||
    eventType === GO3_OUTBOX_EVENTS.workProductVersionCreated
  );
}

export function normalizeDocumentVersionPayload(
  payload: Record<string, unknown> | null,
): Record<string, unknown> {
  const p = payload ?? {};
  const documentId = [p.document_id, p.documentId, p.id].find((v) => typeof v === "string" && v.length > 0);
  const version = [p.version, p.versionNumber, p.current_version].find(
    (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== ""),
  );
  return {
    ...p,
    document_id: documentId ?? p.document_id,
    version: version ?? p.version,
  };
}
