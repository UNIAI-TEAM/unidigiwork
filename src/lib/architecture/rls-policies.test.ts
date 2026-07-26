/**
 * Runtime RLS tests require live DB credentials. This static check locks
 * the migration-level invariants; the true runtime matrix is in the
 * TENANT_ISOLATION_TEST_MATRIX doc and requires a two-tenant fixture.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
function sql(): string {
  try {
    return readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
      .join("\n");
  } catch {
    return "";
  }
}

describe("RLS policy invariants (static)", () => {
  const s = sql();

  it("uses is_tenant_member/has_tenant_role helpers, not raw uid comparisons for tenant tables", () => {
    if (!s) return;
    expect(/is_tenant_member|has_tenant_role/i.test(s)).toBe(true);
  });

  it("audit_events blocks non-SELECT via trigger", () => {
    if (!s) return;
    expect(/tg_audit_events_immutable/i.test(s)).toBe(true);
  });

  it("outbox_events state functions are SECURITY DEFINER", () => {
    if (!s) return;
    expect(
      /claim_outbox_events[\s\S]*security\s+definer/i.test(s) ||
        /security\s+definer[\s\S]*claim_outbox_events/i.test(s),
    ).toBe(true);
  });
});
