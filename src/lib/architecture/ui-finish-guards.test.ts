// Batch 1B-UI-FINISH — static architecture guards for Workspaces/Audit tabs
// and AppTopbar tenant switcher integration.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Batch 1B-UI-FINISH guards", () => {
  it("workspace admin query key includes tenantId + filters", () => {
    const src = read("src/features/tenants/query-keys.ts");
    expect(src).toMatch(/adminWorkspaceKeys[\s\S]*tenantId[\s\S]*filters/);
  });

  it("audit query key includes tenantId + filters", () => {
    const src = read("src/features/tenants/query-keys.ts");
    expect(src).toMatch(/auditKeys[\s\S]*tenantId[\s\S]*filters/);
  });

  it("workspaces-admin server fn filters tenant_members by user_id and tenant_id + role check", () => {
    const src = read("src/lib/api/workspaces-admin.functions.ts");
    expect(src).toMatch(/\.from\("tenant_members"\)/);
    expect(src).toMatch(/\.eq\("user_id",\s*userId\)/);
    expect(src).toMatch(/\.eq\("tenant_id",\s*tenantId\)/);
    expect(src).toMatch(/PERMISSION_DENIED/);
  });

  it("audit server fn enforces admin/owner + tenant scope", () => {
    const src = read("src/lib/api/audit.functions.ts");
    expect(src).toMatch(/\.eq\("tenant_id",\s*data\.tenantId\)/);
    expect(src).toMatch(/tenant_owner/);
    expect(src).toMatch(/tenant_admin/);
  });

  it("audit server fn does not return raw before_state/after_state to the client", () => {
    const src = read("src/lib/api/audit.functions.ts");
    // DTO shape must not expose these fields.
    expect(src).not.toMatch(/beforeState|afterState|before_state:|after_state:/);
  });

  it("audit UI has no mutation server-fn imports (read-only)", () => {
    const src = read("src/routes/_authenticated/admin.tenant.tsx");
    // Extract AuditTab block heuristically and check for mutations.
    const idx = src.indexOf("function AuditTab");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx);
    expect(block).not.toMatch(/useMutation|\.mutate\(|mutateAsync/);
  });

  it("workspaces/audit UI does not import server-only supabase clients", () => {
    const admin = read("src/routes/_authenticated/admin.tenant.tsx");
    expect(admin).not.toMatch(/client\.server|SUPABASE_SERVICE_ROLE_KEY|supabaseAdmin/);
  });

  it("tenant switcher does not use localStorage for authorization", () => {
    const src = read("src/components/tenant-switcher.tsx");
    expect(src).not.toMatch(/localStorage/);
  });

  it("AppTopbar integrates TenantSwitcher via a single slot, not inline duplication", () => {
    const src = read("src/components/app-shell.tsx");
    expect(src).toMatch(/TenantSwitcherSlot/);
    // The switcher must be rendered through the shared abstraction, not
    // redeclared multiple times inside AppTopbar.
    const matches = src.match(/<TenantSwitcher\b/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it("_authenticated layout no longer renders a duplicate TenantSwitcher strip", () => {
    const src = read("src/routes/_authenticated/route.tsx");
    expect(src).not.toMatch(/TenantSwitcher/);
  });
});