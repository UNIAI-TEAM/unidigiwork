/**
 * Domain SDK Enforcement Gate — Blueprint §25 + ADR-1D-001.
 *
 * Rule: every client-reachable file (src/routes, src/components, src/features,
 * src/hooks) that touches the four business domains — Tasks, Documents,
 * Meetings, Workflow — MUST go through `@/sdk/*` (which routes to server
 * functions via the resolved backend provider). It MUST NOT:
 *   1. Import the browser Supabase client to read/write domain tables directly.
 *   2. Declare inline mock/fake domain data (constants named MOCK_*, FAKE_*,
 *      DEMO_*_DATA, or `mock<Domain>*`).
 *
 * Known pre-existing violations are listed in KNOWN_DEBT with a tracking note.
 * New violations fail the gate. Remove entries from KNOWN_DEBT as debt is paid.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => relative(process.cwd(), f).replace(/\\/g, "/");

function isClientReachable(path: string): boolean {
  const r = rel(path);
  return (
    r.startsWith("src/routes/") ||
    r.startsWith("src/components/") ||
    r.startsWith("src/features/") ||
    r.startsWith("src/hooks/")
  );
}

// Server-side surfaces that MUST route domain mutations/reads through the
// domain RPCs (SECURITY DEFINER) — not raw `supabase.from(<domain_table>)`.
// ADR-1D-001 §2.6: command lifecycle owns quota, audit, outbox in one tx.
// Applies to `src/lib/api/**` (server functions) and `src/server/**`
// (server actions / route server handlers).
function isServerActionSurface(path: string): boolean {
  const r = rel(path);
  return r.startsWith("src/lib/api/") || r.startsWith("src/server/");
}

// Domain tables owned by the four business bounded contexts (ADR-1D-001 §1).
const DOMAIN_TABLES = [
  // Tasks
  "tasks",
  "task_assignments",
  "task_comments",
  "task_attachments",
  // Documents
  "documents",
  "document_versions",
  "document_permissions",
  // Meetings
  "meetings",
  "meeting_participants",
  "meeting_recordings",
  // Workflow
  "workflows",
  "workflow_runs",
  "workflow_steps",
  "workflow_step_runs",
];

/**
 * Pre-existing violations tracked as technical debt.
 * Every entry MUST reference a follow-up ticket / batch that will remove it.
 * Do NOT add new entries — refactor to `@/sdk/*` instead.
 */
const KNOWN_DEBT_DIRECT_SUPABASE: Record<string, string> = {
  // Refactor scheduled in Batch 1D-API (Documents domain).
  "src/routes/_authenticated/documents.tsx": "BATCH_1D_DOCS",
};

const KNOWN_DEBT_INLINE_MOCK: Record<string, string> = {};

/**
 * Server-side debt: files under src/lib/api or src/server that still hit
 * domain tables via the query builder instead of a domain RPC. Empty today
 * because Batch 1D-DB hasn't landed; keep it empty going forward.
 */
const KNOWN_DEBT_SERVER_DIRECT_SUPABASE: Record<string, string> = {};

describe("domain SDK enforcement gate", () => {
  it("client-reachable files do not read/write domain tables via supabase.from()", () => {
    const newViolations: string[] = [];
    const paidDebt: string[] = [];
    const seen = new Set<string>();

    const tablePattern = new RegExp(
      `supabase\\.from\\(\\s*['"\`](${DOMAIN_TABLES.join("|")})['"\`]\\s*\\)`,
    );

    for (const f of files) {
      if (!isClientReachable(f)) continue;
      const src = read(f);
      if (!tablePattern.test(src)) continue;
      const key = rel(f);
      seen.add(key);
      if (!(key in KNOWN_DEBT_DIRECT_SUPABASE)) newViolations.push(key);
    }

    for (const key of Object.keys(KNOWN_DEBT_DIRECT_SUPABASE)) {
      if (!seen.has(key)) paidDebt.push(key);
    }

    expect(newViolations, "new domain files bypassing @/sdk/*").toEqual([]);
    expect(
      paidDebt,
      "KNOWN_DEBT entries no longer violate — remove them from the allowlist",
    ).toEqual([]);
  });

  it("client-reachable files do not declare inline mock domain data", () => {
    const newViolations: string[] = [];
    const seen = new Set<string>();
    // const MOCK_TASKS = [...], let FAKE_DOCS = ..., const mockMeetings = ...
    const mockPattern =
      /\b(?:const|let|var)\s+(MOCK_[A-Z_]+|FAKE_[A-Z_]+|DEMO_[A-Z_]+_DATA|mock(?:Tasks?|Documents?|Docs?|Meetings?|Workflows?|WorkflowRuns?)[A-Za-z]*)\b/;

    for (const f of files) {
      if (!isClientReachable(f)) continue;
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      const src = read(f);
      if (!mockPattern.test(src)) continue;
      const key = rel(f);
      seen.add(key);
      if (!(key in KNOWN_DEBT_INLINE_MOCK)) newViolations.push(key);
    }

    expect(newViolations, "inline mock/fake domain data forbidden — call @/sdk/*").toEqual([]);
  });

  it("SDK barrel exposes each of the four business domains", () => {
    const barrel = read(join(SRC, "sdk/index.ts"));
    for (const domain of ["tasks", "documents", "meetings"]) {
      expect(barrel, `sdk/index.ts must re-export ${domain}`).toMatch(
        new RegExp(`from\\s+['"]\\.\\/${domain}['"]`),
      );
    }
    // Workflow SDK is scheduled for Batch 1D-API; add re-export when created.
  });

  it("server actions (src/lib/api, src/server) do not query domain tables outside a domain RPC", () => {
    const newViolations: string[] = [];
    const paidDebt: string[] = [];
    const seen = new Set<string>();

    // Matches supabase.from("<domain_table>") AND generic query builders
    // (from("<domain_table>"), .from(`<domain_table>`)) — any call that
    // targets a domain table by name outside the RPC seam.
    const tablePattern = new RegExp(
      `\\.from\\(\\s*['"\`](${DOMAIN_TABLES.join("|")})['"\`]\\s*\\)`,
    );

    for (const f of files) {
      if (!isServerActionSurface(f)) continue;
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      const src = read(f);
      if (!tablePattern.test(src)) continue;
      const key = rel(f);
      seen.add(key);
      if (!(key in KNOWN_DEBT_SERVER_DIRECT_SUPABASE)) newViolations.push(key);
    }

    for (const key of Object.keys(KNOWN_DEBT_SERVER_DIRECT_SUPABASE)) {
      if (!seen.has(key)) paidDebt.push(key);
    }

    expect(
      newViolations,
      "server actions must call domain RPCs (SECURITY DEFINER), not supabase.from(<domain_table>) — ADR-1D-001 §2.6",
    ).toEqual([]);
    expect(
      paidDebt,
      "KNOWN_DEBT_SERVER_DIRECT_SUPABASE entries no longer violate — remove them",
    ).toEqual([]);
  });
});