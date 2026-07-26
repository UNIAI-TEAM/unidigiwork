import { describe, it, expect } from "vitest";
import { resolveBackendProvider, assertJavaConfigured } from "@/sdk/core/provider";
import { resolveTaskApi } from "@/sdk/tasks";
import { requireTenantContext } from "@/platform/tenant-context";

describe("platform adapters fail-closed", () => {
  it("resolveBackendProvider defaults to lovable when unset", () => {
    expect(resolveBackendProvider()).toBe("lovable");
  });

  it("Java provider never silently falls back", () => {
    expect(() => assertJavaConfigured()).toThrow(/not configured/i);
  });

  it("Task API returns NOT_IMPLEMENTED, never a fake success", async () => {
    const api = resolveTaskApi();
    await expect(
      api.create({
        idempotencyKey: "k",
        workspaceId: "w" as never,
        title: "t",
      }),
    ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });

  it("requireTenantContext refuses to fabricate a tenant", async () => {
    await expect(requireTenantContext()).rejects.toThrow(/no resolver|not fabricate/i);
  });
});