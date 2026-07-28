#!/usr/bin/env node
/**
 * Local CLI runner for the Domain SDK Enforcement Gate.
 *
 *   bun run gate:domain-sdk            # run + print table
 *   bun run gate:domain-sdk --open     # also open each violating file at line
 *   bun run gate:domain-sdk --rule=inline-mock-name
 *   bun run gate:domain-sdk --json     # raw JSON
 *
 * Reads .lovable/reports/domain-sdk-violations.json produced by the vitest gate.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { platform } from "node:os";

const ROOT = process.cwd();
const REPORT = join(ROOT, ".lovable/reports/domain-sdk-violations.json");
const args = new Set(process.argv.slice(2));
const flag = (name) => [...args].some((a) => a === name || a.startsWith(name + "="));
const value = (name) => {
  const hit = [...args].find((a) => a.startsWith(name + "="));
  return hit ? hit.slice(name.length + 1) : undefined;
};

const OPEN = flag("--open");
const JSON_ONLY = flag("--json");
const RULE_FILTER = value("--rule");
const EDITOR = process.env.EDITOR || (platform() === "darwin" ? "open" : platform() === "win32" ? "code" : "xdg-open");

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", magenta: "\x1b[35m",
};
const paint = process.stdout.isTTY ? (col, s) => `${col}${s}${c.reset}` : (_c, s) => s;

console.log(paint(c.cyan, "▶ Running domain-sdk gate (vitest)..."));
const run = spawnSync("bun", ["run", "test:domain-sdk"], { stdio: JSON_ONLY ? "ignore" : "inherit" });

if (!existsSync(REPORT)) {
  if (run.status === 0) {
    console.log(paint(c.green, "\n✔ Domain SDK gate PASS — no violations.\n"));
    process.exit(0);
  }
  console.error(paint(c.red, `\n✗ Gate failed but no report at ${relative(ROOT, REPORT)}. See vitest output above.\n`));
  process.exit(run.status ?? 1);
}

const report = JSON.parse(readFileSync(REPORT, "utf8"));
let hits = report.hits ?? [];
if (RULE_FILTER) hits = hits.filter((h) => h.rule === RULE_FILTER);

if (JSON_ONLY) {
  process.stdout.write(JSON.stringify({ ...report, hits }, null, 2) + "\n");
  process.exit(hits.length ? 1 : 0);
}

if (hits.length === 0) {
  console.log(paint(c.green, "\n✔ No violations matching filter.\n"));
  process.exit(0);
}

// Group by rule → table
const byRule = new Map();
for (const h of hits) {
  if (!byRule.has(h.rule)) byRule.set(h.rule, []);
  byRule.get(h.rule).push(h);
}

const files = new Set(hits.map((h) => h.file));
console.log(
  paint(c.red, `\n✗ Domain SDK gate FAIL — ${hits.length} violation(s) across ${files.size} file(s)`),
);
console.log(paint(c.dim, `  Report: ${relative(ROOT, REPORT)}\n`));

const RULE_COLORS = {
  "client-supabase-from-domain": c.red,
  "server-supabase-from-domain": c.red,
  "inline-mock-name": c.yellow,
  "typed-inline-fixture": c.yellow,
  "forbidden-mock-lib-import": c.magenta,
  "fixture-tagged-comment": c.yellow,
};

for (const [rule, list] of byRule) {
  const col = RULE_COLORS[rule] ?? c.yellow;
  console.log(paint(c.bold, paint(col, `── ${rule}  (${list.length})`)));
  // Compute widths
  const rows = list.map((h) => ({
    loc: `${h.file}:${h.line}`,
    snippet: h.snippet.length > 100 ? h.snippet.slice(0, 97) + "..." : h.snippet,
  }));
  const locW = Math.min(80, Math.max(...rows.map((r) => r.loc.length)));
  for (const r of rows) {
    const loc = r.loc.padEnd(locW);
    console.log(`  ${paint(c.cyan, loc)}  ${paint(c.dim, r.snippet)}`);
  }
  console.log();
}

if (OPEN) {
  const unique = new Map();
  for (const h of hits) if (!unique.has(h.file)) unique.set(h.file, h.line);
  console.log(paint(c.cyan, `▶ Opening ${unique.size} file(s) with ${EDITOR}...`));
  for (const [file, line] of unique) {
    // Format editor args: VS Code / cursor / windsurf accept -g file:line
    const target = /code|cursor|windsurf/.test(EDITOR) ? ["-g", `${file}:${line}`] : [file];
    spawnSync(EDITOR, target, { stdio: "ignore" });
  }
}

console.log(paint(c.dim, "Tip: --open to jump to each hit · --rule=<name> to filter · --json for raw output"));
process.exit(1);