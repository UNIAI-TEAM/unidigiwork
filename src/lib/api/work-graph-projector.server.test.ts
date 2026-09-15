import { describe, expect, it } from "vitest";
import { classifyProjectionResult } from "./work-graph-projector.server";

describe("GO-3 Option B projector classification", () => {
  it("marks cross-tenant and poison payloads as skipped (no retry, no edge)", () => {
    expect(classifyProjectionResult({ ok: false, error: "CROSS_TENANT" }).skipped).toBe(true);
    expect(classifyProjectionResult({ ok: false, error: "NOT_FOUND" }).skipped).toBe(true);
    expect(classifyProjectionResult({ ok: false, error: "INVALID_PAYLOAD" }).skipped).toBe(true);
    expect(classifyProjectionResult({ ok: false, error: "DELETED_OR_MISSING" }).skipped).toBe(true);
    expect(classifyProjectionResult({ ok: false, error: "SOURCE_TABLE_MISSING" }).skipped).toBe(true);
  });

  it("retries unknown projection failures", () => {
    const row = classifyProjectionResult({ ok: false, error: "connection refused" });
    expect(row.ok).toBe(false);
    expect(row.skipped).toBe(false);
  });

  it("does not alias Work Product id to Document id", () => {
    const row = classifyProjectionResult({
      ok: true,
      documentId: "doc",
      latestVersion: 2,
    });
    expect(row.ok).toBe(true);
    expect(row.workProductId).toBeUndefined();
    expect(row.documentId).toBe("doc");
  });
});
