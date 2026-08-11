#!/usr/bin/env node
// UNIWORK — FULL CRUD REALITY RUNTIME RUNNER
// Actors use real JWTs; verification reads use service role only.
// Exits non-zero when any required CRUD cell fails.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { guardEnv, bootstrap, teardown } from "./fixtures.mjs";
import { run as runTask } from "./task.crud.mjs";
import { run as runDoc } from "./document.crud.mjs";
import { run as runWs } from "./workspace.crud.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "artifacts");
mkdirSync(OUT, { recursive: true });

guardEnv();
const runId = randomUUID().slice(0, 8);
const startedAt = new Date().toISOString();
let ids = null;
let cells = [];
let orphans = [];
let bootError = null;

try {
  ids = await bootstrap(runId);
  for (const [name, fn] of [["workspace", runWs], ["task", runTask], ["document", runDoc]]) {
    try {
      const res = await fn(ids);
      cells.push(...res);
      console.log(`[crud] ${name}: ${res.length} cells`);
    } catch (err) {
      cells.push({ id: `${name.toUpperCase()}-SUITE`, entity: name, op: "SUITE", status: "BLOCKED_RUNTIME", error: String(err?.message ?? err) });
      console.error(`[crud] ${name} suite error:`, err?.message ?? err);
    }
  }
} catch (err) {
  bootError = String(err?.message ?? err);
  console.error("[crud] bootstrap failed:", bootError);
} finally {
  if (ids) {
    try { orphans = await teardown(ids); } catch (err) { orphans.push(`teardown_error:${err?.message}`); }
  }
}

const failed = cells.filter((c) => c.status.startsWith("FAIL") || c.status === "BLOCKED_RUNTIME");
const summary = {
  runId, startedAt, finishedAt: new Date().toISOString(), bootError,
  total: cells.length, passed: cells.length - failed.length, failed: failed.length,
  teardownOrphans: orphans, byStatus: cells.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {}),
};
writeFileSync(join(OUT, "crud-summary.json"), JSON.stringify({ summary, cells }, null, 2));
writeFileSync(join(OUT, "crud-failures.json"), JSON.stringify(failed, null, 2));
writeFileSync(join(OUT, "crud-summary.md"),
  `# CRUD runtime summary\n\nRun: ${runId} · ${startedAt}\n\n| Cell | Entity | Operation | Status |\n|---|---|---|---|\n` +
  cells.map((c) => `| ${c.id} | ${c.entity} | ${c.op} | ${c.status} |`).join("\n") +
  `\n\nTotal ${summary.total} · PASS ${summary.passed} · FAIL ${summary.failed}\nTeardown orphans: ${orphans.length ? orphans.join(", ") : "none"}\n`);

console.log(JSON.stringify(summary, null, 2));
process.exit(bootError || failed.length || orphans.length ? 1 : 0);
