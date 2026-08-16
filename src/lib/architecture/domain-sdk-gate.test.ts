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
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");

// ---------------------------------------------------------------------------
// Debt manifest — externalized whitelist keyed by rule → file → ticket.
// Update `docs/architecture/ci/domain-sdk-debt.manifest.json` (not this file)
// when a refactor is accepted. Every ticket referenced in `waivers` must be
// declared under `tickets` so ownership stays traceable.
// ---------------------------------------------------------------------------
type DebtManifest = {
  tickets: Record<string, { title: string; owner: string; targetBatch: string }>;
  waivers: Record<string, Record<string, string>>;
};
const MANIFEST_PATH = join(process.cwd(), "docs/architecture/ci/domain-sdk-debt.manifest.json");
const MANIFEST: DebtManifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const waiver = (rule: string): Record<string, string> => MANIFEST.waivers[rule] ?? {};

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
// Non-source scan — configs, seeds, JSON/YAML fixtures anywhere in the repo.
// Scans the whole tree except vendor / build / test / migration / doc outputs.
// Extensions: .json .jsonc .yml .yaml .toml .js .cjs .mjs .sql (non-migration)
// ---------------------------------------------------------------------------
const NONSRC_EXT = /\.(json|jsonc|yml|yaml|toml|js|cjs|mjs)$/i;
const NONSRC_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".lovable",
  "tests",
  "src", // src covered by the other rules
  "supabase", // migrations own seeds legitimately (Blueprint §25)
]);
const NONSRC_SKIP_FILES = new Set<string>([
  "docs/architecture/ci/domain-sdk-debt.manifest.json", // the waiver list itself
  "package-lock.json",
  "bun.lockb",
  "bun.lock",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".prettierrc",
  "components.json",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "eslint.config.js",
]);

function walkNonSrc(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") && entry !== ".github") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (NONSRC_SKIP_DIRS.has(entry)) continue;
      walkNonSrc(full, out);
    } else if (NONSRC_EXT.test(entry)) {
      const r = relative(process.cwd(), full).replace(/\\/g, "/");
      if (NONSRC_SKIP_FILES.has(r)) continue;
      if (r.endsWith(".test.js") || r.endsWith(".test.mjs")) continue;
      out.push(full);
    }
  }
  return out;
}
const nonSrcFiles = walkNonSrc(process.cwd());

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
  const re = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
  );
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
  writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), hits: ALL_HITS }, null, 2),
  );

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
    for (const h of hits)
      md.push(`- \`${h.file}:${h.line}\` — \`${h.snippet.replace(/`/g, "\\`")}\``);
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
const KNOWN_DEBT_DIRECT_SUPABASE = waiver("client-supabase-from-domain");
const KNOWN_DEBT_INLINE_MOCK = waiver("inline-mock-name");
const KNOWN_DEBT_INLINE_FIXTURE = waiver("typed-inline-fixture");

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
const KNOWN_DEBT_SERVER_DIRECT_SUPABASE = waiver("server-supabase-from-domain");

describe("domain SDK enforcement gate", () => {
  it("non-source files (configs, seeds, JSON/YAML) do not carry mock domain data", () => {
    const newViolations: string[] = [];
    const seen = new Set<string>();

    // 1. Faker / mock libs referenced in package.json / config scripts.
    const libPattern = new RegExp(
      `(?:"|')(${FORBIDDEN_MOCK_LIBS.map((l) => l.replace(/[/@-]/g, "\\$&")).join("|")})(?:"|')`,
    );
    // 2. Fixture-named keys or vars with a domain noun — matches JSON keys
    //    ("mockTasks":), YAML keys (seed_documents:), and JS/TS assignments.
    const upperPrefix = FIXTURE_NAME_ROOTS.map((r) => r.toUpperCase()).join("|");
    const camelPrefix = FIXTURE_NAME_ROOTS.join("|");
    const nouns = DOMAIN_NOUNS.join("|");
    const upperNouns = DOMAIN_NOUNS.map((n) => n.replace(/\?/g, "").toUpperCase()).join("|");
    const fixturePattern = new RegExp(
      `["']?\\b(` +
        `(?:${upperPrefix})_[A-Z0-9_]*(?:${upperNouns})[A-Z0-9_]*` +
        `|(?:${camelPrefix})(?:${nouns})[A-Za-z0-9]*` +
        `|(?:${camelPrefix})_(?:${nouns.toLowerCase()})[A-Za-z0-9_]*` +
        `)\\b["']?\\s*[:=]`,
    );
    // 3. Direct supabase.from("<domain_table>") in scripts / seed JS.
    const tablePattern = new RegExp(
      `\\.from\\(\\s*['"\`](${DOMAIN_TABLES.join("|")})['"\`]\\s*\\)`,
    );

    const waived = waiver("nonsrc-mock-data");

    for (const f of nonSrcFiles) {
      const src = read(f);
      const key = rel(f);
      const hits = [
        ...scanLines(src, libPattern),
        ...scanLines(src, fixturePattern),
        ...scanLines(src, tablePattern),
      ].sort((a, b) => a.line - b.line);
      if (hits.length === 0) continue;
      seen.add(key);
      if (key in waived) continue;
      newViolations.push(...record("nonsrc-mock-data", key, hits));
    }

    const paidDebt = Object.keys(waived).filter((k) => !seen.has(k));
    expect(
      newViolations,
      "config/seed/JSON files must not carry mock domain data — move fixtures to *.test.ts or migrations",
    ).toEqual([]);
    expect(
      paidDebt,
      "nonsrc-mock-data waivers no longer violate — remove them from the manifest",
    ).toEqual([]);
  });

  it("debt manifest — every waived ticket is declared in tickets{}", () => {
    const declared = new Set(Object.keys(MANIFEST.tickets));
    const referenced = new Set<string>();
    for (const rule of Object.values(MANIFEST.waivers))
      for (const ticket of Object.values(rule)) referenced.add(ticket);
    const undeclared = [...referenced].filter((t) => !declared.has(t));
    expect(undeclared, "waivers reference tickets missing from tickets{}").toEqual([]);
  });

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
    expect(paidDebt, "KNOWN_DEBT_INLINE_FIXTURE entries no longer violate — remove them").toEqual(
      [],
    );
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
    const domainRef = new RegExp(`\\b(${[...DOMAIN_TABLES, ...DOMAIN_TYPES].join("|")})\\b`);
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
            ...record("fixture-tagged-comment", key, [{ line: i + 1, snippet: snippet(lines[i]) }]),
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

  // -------------------------------------------------------------------------
  // Security scope of the BATCH_1D_LIST_RPC waiver.
  // The read waiver only covers RLS-scoped SELECTs made with the actor's
  // client (`context.supabase`). Two things stay out of scope and are gated
  // separately so a waived file cannot silently grow a privileged path:
  //   1. Writes to domain tables outside a SECURITY DEFINER RPC.
  //   2. Any domain-table access through the service-role client, which
  //      bypasses RLS and tenant isolation.
  // -------------------------------------------------------------------------
  const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;

  function scanText(src: string, pattern: RegExp): { line: number; snippet: string }[] {
    const re = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
    );
    const out: { line: number; snippet: string }[] = [];
    const lines = src.split("\n");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const line = lineOf(src, m.index);
      out.push({ line, snippet: snippet(lines[line - 1] ?? m[0]) });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return out;
  }

  it("server actions do not write domain tables outside a SECURITY DEFINER RPC", () => {
    const allowed = waiver("server-domain-write-outside-rpc");
    const newViolations: string[] = [];
    const paidDebt: string[] = [];
    const seen = new Set<string>();

    const writePattern = new RegExp(
      `\\.from\\(\\s*['"\`](?:${DOMAIN_TABLES.join("|")})['"\`]\\s*\\)\\s*\\.\\s*(?:insert|update|upsert|delete)\\s*\\(`,
      "s",
    );

    for (const f of files) {
      if (!isServerActionSurface(f)) continue;
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      const key = rel(f);
      const hits = scanText(read(f), writePattern);
      if (hits.length === 0) continue;
      seen.add(key);
      if (key in allowed) continue;
      newViolations.push(...record("server-domain-write-outside-rpc", key, hits));
    }
    for (const key of Object.keys(allowed)) if (!seen.has(key)) paidDebt.push(key);

    expect(
      newViolations,
      "domain writes must go through a domain RPC — the BATCH_1D_LIST_RPC waiver covers read-only queries only (ADR-1D-001 §2.6)",
    ).toEqual([]);
    expect(
      paidDebt,
      "server-domain-write-outside-rpc waivers no longer violate — remove them from the manifest",
    ).toEqual([]);
  });

  it("service-role client never touches domain tables (RLS/tenant bypass)", () => {
    const allowed = waiver("server-admin-client-domain-table");
    const newViolations: string[] = [];
    const paidDebt: string[] = [];
    const seen = new Set<string>();

    const adminPattern = new RegExp(
      `supabaseAdmin\\s*\\.\\s*from\\(\\s*['"\`](?:${DOMAIN_TABLES.join("|")})['"\`]\\s*\\)`,
      "s",
    );

    for (const f of files) {
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      const key = rel(f);
      const hits = scanText(read(f), adminPattern);
      if (hits.length === 0) continue;
      seen.add(key);
      if (key in allowed) continue;
      newViolations.push(...record("server-admin-client-domain-table", key, hits));
    }
    for (const key of Object.keys(allowed)) if (!seen.has(key)) paidDebt.push(key);

    expect(
      newViolations,
      "service-role (supabaseAdmin) access to domain tables bypasses RLS and tenant isolation — use context.supabase or a domain RPC",
    ).toEqual([]);
    expect(
      paidDebt,
      "server-admin-client-domain-table waivers no longer violate — remove them from the manifest",
    ).toEqual([]);
  });
});
