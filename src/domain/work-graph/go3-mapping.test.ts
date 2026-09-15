import { describe, expect, it } from "vitest";
import {
  documentIsNotWorkProduct,
  isCrossTenant,
  isDocumentVersionGraphEvent,
  isSkippableGraphError,
  mapUserWorkProductLink,
  mergeMonotonicVersion,
  normalizeDocumentVersionPayload,
  taskDocumentLinkFabricatesWorkProduct,
} from "./go3-mapping";

describe("GO-3 Option B mapping", () => {
  it("keeps Work Product and Document identities distinct", () => {
    expect(documentIsNotWorkProduct("doc-1", "wp-1")).toBe(true);
    expect(documentIsNotWorkProduct("same", "same")).toBe(false);
  });

  it("maps live WP→DOCUMENT user links to REALIZED_AS", () => {
    expect(mapUserWorkProductLink({ sourceType: "WORK_PRODUCT", targetType: "DOCUMENT", relationship: "REFERENCES" })).toEqual({
      code: "REALIZED_AS",
      sourceType: "WORK_PRODUCT",
      targetType: "DOCUMENT",
    });
    expect(mapUserWorkProductLink({ sourceType: "DOCUMENT", targetType: "WORK_PRODUCT", relationship: "RELATED_TO" })).toEqual({
      code: "REALIZED_AS",
      sourceType: "WORK_PRODUCT",
      targetType: "DOCUMENT",
    });
  });

  it("maps live WP↔TASK/MEETING user links to PRODUCES", () => {
    expect(mapUserWorkProductLink({ sourceType: "WORK_PRODUCT", targetType: "TASK", relationship: "REFERENCES" })).toEqual({
      code: "PRODUCES",
      sourceType: "TASK",
      targetType: "WORK_PRODUCT",
    });
    expect(mapUserWorkProductLink({ sourceType: "MEETING", targetType: "WORK_PRODUCT", relationship: "RELATED_TO" })).toEqual({
      code: "PRODUCES",
      sourceType: "MEETING",
      targetType: "WORK_PRODUCT",
    });
  });

  it("does not convert Task→Document into a Work Product", () => {
    expect(mapUserWorkProductLink({ sourceType: "DOCUMENT", targetType: "TASK", relationship: "ATTACHED_TO" })).toBeNull();
    expect(mapUserWorkProductLink({ sourceType: "TASK", targetType: "DOCUMENT", relationship: "REFERENCES" })).toBeNull();
    expect(taskDocumentLinkFabricatesWorkProduct("ATTACHED_TO", "DOCUMENT", "TASK")).toBe(false);
  });

  it("does not convert meeting artifacts into work products", () => {
    expect(
      mapUserWorkProductLink({ sourceType: "WORK_PRODUCT", targetType: "MEETING_ARTIFACT", relationship: "REFERENCES" }),
    ).toBeNull();
  });

  it("keeps latestVersion monotonic on out-of-order events", () => {
    expect(mergeMonotonicVersion(null, 5)).toBe(5);
    expect(mergeMonotonicVersion(5, 4)).toBe(5);
    expect(mergeMonotonicVersion(5, 5)).toBe(5);
    expect(mergeMonotonicVersion(5, 6)).toBe(6);
  });

  it("denies cross-tenant edges", () => {
    expect(isCrossTenant("tenant-a", "tenant-b")).toBe(true);
    expect(isCrossTenant("tenant-a", "tenant-a")).toBe(false);
    expect(isCrossTenant(null, "tenant-a")).toBe(true);
  });

  it("does not rename live document version event aliases", () => {
    expect(isDocumentVersionGraphEvent("document.document.version_uploaded")).toBe(true);
    expect(isDocumentVersionGraphEvent("document.version.created")).toBe(true);
    expect(isDocumentVersionGraphEvent("work_product.work_product.upserted")).toBe(false);
    expect(normalizeDocumentVersionPayload({ documentId: "d1", versionNumber: 3 })).toMatchObject({
      document_id: "d1",
      version: 3,
    });
  });
});
