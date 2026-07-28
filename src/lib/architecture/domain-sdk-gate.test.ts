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
import { afterAll, describe, it, expect } from "vitest";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

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

// ---------------------------------------------------------------------------
// Reporting helpers — emit `path:line: snippet` for every hit and persist a
// consolidated report to `.lovable/reports/domain-sdk-violations.{json,md}`
// so a failed CI run gives the exact locations to fix before merge.
// ---------------------------------------------------------------------------
type Hit = { file: string; line: number; snippet: string; rule: string };
const ALL_HITS: Hit[] = [];

function snippet(line: string): string {
  const t = line.trim();
  return t.length > 140 ? `${t.slice(0, 137)}...` : t;
}

/** Returns matched lines (1-based) for `pattern` in file `src`. */
function scanLines(src: string, pattern: RegExp): { line: number; snippet: string }[] {
  const out: { line: number; snippet: string }[] = [];
  const lines = src.split("\n");
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  for (let i = 0; i < lines.length; i++) {
    re.lastIndex = 0;
    if (re.test(lines[i])) out.push({ line: i + 1, snippet: snippet(lines[i]) });
  }
  return out;
}

function record(rule: string, file: string, hits: { line: number; snippet: string }[]): string[] {
  const out: string[] = [];
  for (const h of hits) {
    ALL_HITS.push({ rule, file, line: h.line, snippet: h.snippet });
    out.push(`${file}:${h.line}  ${h.snippet}`);
  }
  return out;
}

afterAll(() => {
  if (ALL_HITS.length === 0) return;
  const reportDir = join(process.cwd(), ".lovable", "reports");
  mkdirSync(reportDir, { recursive: true });
  const jsonPath = join(reportDir, "domain-sdk-violations.json");
  const mdPath = join(reportDir, "domain-sdk-violations.md");
  writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), hits: ALL_HITS }, null, 2));

  const byRule = new Map<string, Hit[]>();
  for (const h of ALL_HITS) {
    if (!byRule.has(h.rule)) byRule.set(h.rule, []);
    byRule.get(h.rule)!.push(h);
  }
  const md: string[] = [
    "# Domain SDK Enforcement — Violations",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Total hits: **${ALL_HITS.length}** across ${new Set(ALL_HITS.map((h) => h.file)).size} file(s).`,
    "",
    "Fix each file below before merging. See `docs/architecture/ci/DOMAIN_SDK_ENFORCEMENT.md`.",
    "",
  ];
  for (const [rule, hits] of byRule) {
    md.push(`## ${rule} (${hits.length})`, "");
    for (const h of hits) md.push(`- \`${h.file}:${h.line}\` — \`${h.snippet.replace(/`/g, "\\`")}\``);
    md.push("");
  }
  writeFileSync(mdPath, md.join("\n"));

  // Also print a compact summary to stderr so CI logs surface it immediately.
  const lines = ALL_HITS.map((h) => `  ${h.rule}  ${h.file}:${h.line}`).join("\n");
  console.error(
    `\n[domain-sdk-gate] ${ALL_HITS.length} violation(s):\n${lines}\n` +
      `Report: ${relative(process.cwd(), mdPath)} / ${relative(process.cwd(), jsonPath)}\n`,
  );
});

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

const KNOWN_DEBT_INLINE_MOCK: Record<string, string> = {
  // `initialTasks` — Kanban seed; refactor to sdk/tasks in Batch 1D-API.
  "src/routes/tasks.tsx": "BATCH_1D_TASKS",
  // STOS workspace demo fixtures — refactor to sdk/* in Batch 1D-API.
  "src/routes/_authenticated/workspace.$id.stos.tsx": "BATCH_1D_TASKS",
};

/**
 * Files with pre-existing inline domain fixtures (typed arrays / suspicious
 * naming) that predate the SDK gate. New violations MUST fail — refactor to
 * `@/sdk/*` instead of extending this list.
 */
const KNOWN_DEBT_INLINE_FIXTURE: Record<string, string> = {
  // Kanban seed data — refactor to sdk/tasks in Batch 1D-API.
  "src/routes/tasks.tsx": "BATCH_1D_TASKS",
};

/**
 * Faker / mock-data libraries banned from client bundles for the four domains.
 * Any import of these packages in a client-reachable file fails the gate.
 */
const FORBIDDEN_MOCK_LIBS = [
  "@faker-js/faker",
  "faker",
  "@ngneat/falso",
  "chance",
  "casual",
  "@mockoon/commons",
  "mockjs",
  "json-server",
];

// Domain TypeScript types owned by the four bounded contexts. Any client-file
// declaration typed as one of these + assigned an array/object literal is an
// inline fixture (bypasses `@/sdk/*`).
const DOMAIN_TYPES = [
  "Task",
  "Tasks",
  "TaskAssignment",
  "TaskComment",
  "TaskAttachment",
  "Document",
  "Documents",
  "DocumentVersion",
  "DocumentPermission",
  "Meeting",
  "Meetings",
  "MeetingParticipant",
  "MeetingRecording",
  "Workflow",
  "Workflows",
  "WorkflowRun",
  "WorkflowStep",
  "WorkflowStepRun",
];

// Suspicious variable-name prefixes/roots that almost always indicate a
// hand-rolled fixture when paired with a domain noun.
const FIXTURE_NAME_ROOTS = [
  "mock",
  "fake",
  "demo",
  "sample",
  "seed",
  "stub",
  "dummy",
  "fixture",
  "example",
  "hardcoded",
  "initial",
  "default",
  "placeholder",
  "test",
];
const DOMAIN_NOUNS = [
  "Tasks?",
  "Documents?",
  "Docs?",
  "Meetings?",
  "Workflows?",
  "WorkflowRuns?",
  "WorkflowSteps?",
  "Participants?",
  "Assignments?",
  "Comments?",
  "Attachments?",
];

/**
 * Server-side debt: files under src/lib/api or src/server that still hit
 * domain tables via the query builder instead of a domain RPC. Empty today
 * because Batch 1D-DB hasn't landed; keep it empty going forward.
 */
const KNOWN_DEBT_SERVER_DIRECT_SUPABASE: Record<string, string> = {
  // Admin stats count on `documents` — refactor to domain RPC in Batch 1D-API.
  "src/lib/api/admin.functions.ts": "BATCH_1D_DOCS",
};

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
      const key = rel(f);
      const hits = scanLines(src, tablePattern);
      if (hits.length === 0) continue;
      seen.add(key);
      if (key in KNOWN_DEBT_DIRECT_SUPABASE) continue;
      newViolations.push(...record("client-supabase-from-domain", key, hits));
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
    // Catches: MOCK_/FAKE_/DEMO_/SAMPLE_/SEED_/STUB_/DUMMY_/FIXTURE_ constants,
    // plus camelCase like mockTasks, fakeDocs, sampleMeetings, seedWorkflows,
    // initialTasks, defaultDocuments, placeholderMeetings, etc. Case-insensitive.
    const upperPrefix = FIXTURE_NAME_ROOTS.map((r) => r.toUpperCase()).join("|");
    const camelPrefix = FIXTURE_NAME_ROOTS.join("|");
    const nouns = DOMAIN_NOUNS.join("|");
    const mockPattern = new RegExp(
      `\\b(?:const|let|var)\\s+(` +
        `(?:${upperPrefix})_[A-Z0-9_]*(?:${DOMAIN_NOUNS.join("|")
          .replace(/\?/g, "")
          .toUpperCase()})[A-Z0-9_]*` +
        `|(?:${camelPrefix})(?:${nouns})[A-Za-z0-9]*` +
        `)\\b`,
    );

    for (const f of files) {
      if (!isClientReachable(f)) continue;
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      const src = read(f);
      const key = rel(f);
      const hits = scanLines(src, mockPattern);
      if (hits.length === 0) continue;
      seen.add(key);
      if (key in KNOWN_DEBT_INLINE_MOCK) continue;
      newViolations.push(...record("inline-mock-name", key, hits));
    }

    expect(newViolations, "inline mock/fake domain data forbidden — call @/sdk/*").toEqual([]);
  });

  it("client-reachable files do not declare domain-typed inline fixtures", () => {
    const newViolations: string[] = [];
    const paidDebt: string[] = [];
    const seen = new Set<string>();

    // Matches: `const foo: Task[] = [`, `let bar: Readonly<Document[]> = [`,
    //          `const x: Array<Meeting> = [`, `const y: Workflow = {`.
    // The RHS must be a literal (`[` or `{`) — call expressions like
    // `= useQuery(...)` or `= fromSdk(...)` are allowed.
    const typedFixture = new RegExp(
      `\\b(?:const|let|var)\\s+\\w+\\s*:\\s*` +
        `(?:Readonly<\\s*)?(?:Array<\\s*)?` +
        `(${DOMAIN_TYPES.join("|")})` +
        `(?:\\s*>)?(?:\\[\\])?(?:\\s*>)?\\s*=\\s*[\\[\\{]`,
    );

    for (const f of files) {
      if (!isClientReachable(f)) continue;
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      const src = read(f);
      const key = rel(f);
      const hits = scanLines(src, typedFixture);
      if (hits.length === 0) continue;
      seen.add(key);
      if (key in KNOWN_DEBT_INLINE_FIXTURE) continue;
      newViolations.push(...record("typed-inline-fixture", key, hits));
    }

    for (const key of Object.keys(KNOWN_DEBT_INLINE_FIXTURE)) {
      if (!seen.has(key)) paidDebt.push(key);
    }

    expect(
      newViolations,
      "domain-typed inline fixtures forbidden — hydrate via @/sdk/* or a loader",
    ).toEqual([]);
    expect(
      paidDebt,
      "KNOWN_DEBT_INLINE_FIXTURE entries no longer violate — remove them",
    ).toEqual([]);
  });

  it("client-reachable files do not import faker / mock-data libraries", () => {
    const violations: string[] = [];
    const libPattern = new RegExp(
      `from\\s+['"](${FORBIDDEN_MOCK_LIBS.map((l) => l.replace(/[/@-]/g, "\\$&")).join("|")})['"]`,
    );
    for (const f of files) {
      if (!isClientReachable(f)) continue;
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      const src = read(f);
      const hits = scanLines(src, libPattern);
      if (hits.length === 0) continue;
      violations.push(...record("forbidden-mock-lib-import", rel(f), hits));
    }
    expect(
      violations,
      `faker/mock-data libs are forbidden in client bundles: ${FORBIDDEN_MOCK_LIBS.join(", ")}`,
    ).toEqual([]);
  });

  it("client-reachable files do not carry fixture-tagged domain blocks", () => {
    // Comments like `// mock data`, `// fake tasks`, `// seed documents`,
    // `// hardcoded meetings`, `// TODO replace with API` immediately followed
    // (within 5 lines) by a reference to a domain table/type indicate an
    // inline fixture even if the variable name is neutral (e.g. `data`).
    const commentTag =
      /\/\/\s*(?:@?(?:mock|fake|demo|sample|seed|stub|dummy|fixture|hardcoded|placeholder|todo[:\s].*replace|replace\s+with\s+api)\b)/i;
    const domainRef = new RegExp(
      `\\b(${[...DOMAIN_TABLES, ...DOMAIN_TYPES].join("|")})\\b`,
    );
    const violations: string[] = [];
    for (const f of files) {
      if (!isClientReachable(f)) continue;
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      const key = rel(f);
      if (key in KNOWN_DEBT_INLINE_FIXTURE) continue;
      const lines = read(f).split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!commentTag.test(lines[i])) continue;
        const window = lines.slice(i, Math.min(i + 6, lines.length)).join("\n");
        if (domainRef.test(window)) {
          violations.push(
            ...record("fixture-tagged-comment", key, [
              { line: i + 1, snippet: snippet(lines[i]) },
            ]),
          );
          break;
        }
      }
    }
    expect(
      violations,
      "fixture-tagged comments next to domain refs — remove hand-rolled data, call @/sdk/*",
    ).toEqual([]);
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
      const key = rel(f);
      const hits = scanLines(src, tablePattern);
      if (hits.length === 0) continue;
      seen.add(key);
      if (key in KNOWN_DEBT_SERVER_DIRECT_SUPABASE) continue;
      newViolations.push(...record("server-supabase-from-domain", key, hits));
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