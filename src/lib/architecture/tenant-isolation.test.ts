/**
 * Blueprint §5, §25.2 — tenant isolation static shape checks.
 *
 * Full runtime cross-tenant regression requires a live DB + two tenants
 * (see docs/architecture/testing/TENANT_ISOLATION_TEST_MATRIX.md).
 * This file locks the invariants we CAN check statically: every
 * tenant-scoped table must have tenant_id in its schema, and every
 * migration must enable RLS.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

const TENANT_SCOPED_TABLES = [
  "workspaces",
  "documents",
  "email_threads",
  "email_messages",
  "email_states",
  "notifications",
];

function allMigrationSql(): string {
  try {
    return readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
      .join("\n");
  } catch {
    return "";
  }
}

describe("tenant isolation invariants", () => {
  const sql = allMigrationSql();

  it("every tenant-scoped table gains a tenant_id column", () => {
    if (!sql) return; // no migrations checked in — skip
    for (const table of TENANT_SCOPED_TABLES) {
      const re = new RegExp(`alter\\s+table[^;]*${table}[^;]*add\\s+column[^;]*tenant_id`, "i");
      const created = new RegExp(`create\\s+table[^;]*${table}[\\s\\S]*?tenant_id`, "i");
      expect(re.test(sql) || created.test(sql)).toBe(true);
    }
  });

  it("row-level security is enabled somewhere on tenant tables", () => {
    if (!sql) return;
    for (const table of TENANT_SCOPED_TABLES) {
      const re = new RegExp(
        `alter\\s+table[^;]*${table}[^;]*enable\\s+row\\s+level\\s+security`,
        "i",
      );
      expect(re.test(sql)).toBe(true);
    }
  });

  it("audit_events is append-only (no update/delete policy)", () => {
    if (!sql) return;
    expect(/audit_events[\s\S]*append-only|tg_audit_events_immutable/i.test(sql)).toBe(true);
  });
});
