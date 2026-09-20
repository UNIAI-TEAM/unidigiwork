import { describe, expect, it } from "vitest";
import { documentFromRow, mergeMonotonicVersion, workProductFromRow, workProductVersionFromRow } from "./document-adapter";
import { isWorkProductBusinessType } from "./types";

describe("GO-3 Option B work product vs document adapters", () => {
  const wp = workProductFromRow({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    tenant_id: "22222222-2222-4222-8222-222222222222",
    workspace_id: "33333333-3333-4333-8333-333333333333",
    title: "ACME Enterprise Proposal",
    business_type: "PROPOSAL",
    status: "IN_REVIEW",
    current_version: 2,
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T01:00:00.000Z",
  });
  const doc = documentFromRow({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    tenant_id: wp.tenantId!,
    workspace_id: wp.workspaceId!,
    title: "ACME Proposal.docx",
    mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T01:00:00.000Z",
  });

  it("does not treat Document as Work Product identity", () => {
    expect(wp.sourceEntityType).toBe("WORK_PRODUCT");
    expect(doc.sourceEntityType).toBe("DOCUMENT");
    expect(wp.id).not.toBe(doc.id);
    expect(JSON.stringify(wp)).not.toMatch(/office_session|sessionToken|signedUrl|service_role|downloadUrl/i);
  });

  it("maps business versions separately from document versions", () => {
    const v = workProductVersionFromRow({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      work_product_id: wp.id,
      version: 3,
      summary: "Snapshot",
      ai_generated: false,
      created_at: "2026-09-14T02:00:00.000Z",
    });
    expect(v.workProductId).toBe(wp.id);
    expect(v.workProductId).not.toBe(doc.id);
    expect(v.versionNumber).toBe(3);
  });

  it("keeps latestVersion monotonic on out-of-order events", () => {
    expect(mergeMonotonicVersion(null, 5)).toBe(5);
    expect(mergeMonotonicVersion(5, 4)).toBe(5);
  });

  it("accepts live business types without inventing new tables", () => {
    expect(isWorkProductBusinessType("PROPOSAL")).toBe(true);
    expect(isWorkProductBusinessType("DOCUMENT")).toBe(true);
    expect(isWorkProductBusinessType("DATASET")).toBe(false);
  });
});
