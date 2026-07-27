// SEC.5 regression rule (Blueprint §5.5, §25): server functions that resolve
// the current actor's tenant membership MUST filter by user_id explicitly.
// Tenant-scoped RLS alone does NOT restrict to the caller's own row, so
// .maybeSingle() on tenant_members can leak teammate rows or throw.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "src/lib/api/active-tenant.functions.ts");

describe("active-tenant.functions.ts — user_id filter regression (SEC.5)", () => {
  const src = readFileSync(FILE, "utf8");

  it("filters tenant_members by user_id in every query block", () => {
    // Every .from("tenant_members") occurrence must appear in a query chain
    // that also references .eq("user_id", userId) within the following 400
    // characters. This is deliberately conservative.
    const re = /\.from\("tenant_members"\)([\s\S]{0,400})/g;
    const matches = [...src.matchAll(re)];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m[1]).toMatch(/\.eq\("user_id",\s*userId\)/);
    }
  });
});
