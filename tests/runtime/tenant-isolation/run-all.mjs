#!/usr/bin/env node
// SEC.6 — Consolidated runtime regression runner.
// Chains: original 1A-R matrix, SEC.2 provisioning, SEC.3/4 invitations,
// SEC.5 active tenant, SEC.6 outbox stress. Fails non-zero if any suite
// returns non-zero. Never silently skips.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "artifacts");
mkdirSync(OUT, { recursive: true });

function must(name) { if (!process.env[name]) { console.error(`[sec6-run-all] missing env ${name}`); process.exit(2); } }
["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "E2E_1A_PASSWORD", "E2E_1A_ALLOW_URL"].forEach(must);
if (!process.env.SUPABASE_URL.startsWith(process.env.E2E_1A_ALLOW_URL)) {
  console.error("[sec6-run-all] E2E_1A_ALLOW_URL must prefix SUPABASE_URL"); process.exit(2);
}

function run(script) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const proc = spawn("node", [join(HERE, script)], { stdio: "inherit", env: process.env });
    proc.on("close", (code) => resolve({ script, code, ms: Date.now() - t0 }));
  });
}

const suites = [
  "runner.mjs",
  "sec2-provisioning.mjs",
  "sec3-invitations.mjs",
  "sec5-active-tenant.mjs",
  "sec6-outbox-stress.mjs",
];

const startedAt = new Date().toISOString();
const results = [];
for (const s of suites) {
  console.log(`\n[sec6-run-all] ▶ ${s}`);
  results.push(await run(s));
}
const endedAt = new Date().toISOString();
const failed = results.filter((r) => r.code !== 0);
const summary = { startedAt, endedAt, suites: results, failedCount: failed.length };
writeFileSync(join(OUT, "sec6-full-regression.json"), JSON.stringify(summary, null, 2));
const md = [
  "# SEC.6 Consolidated Runtime Regression", "",
  `Started: ${startedAt}`, `Ended:   ${endedAt}`, "",
  "| Suite | Exit | Duration (ms) |", "|---|---|---|",
  ...results.map((r) => `| ${r.script} | ${r.code} | ${r.ms} |`),
  "",
  failed.length === 0 ? "**PASS — all suites returned 0.**" : `**FAIL — ${failed.length} suite(s) non-zero.**`,
].join("\n");
writeFileSync(join(OUT, "sec6-full-regression.md"), md);
console.log(`\n[sec6-run-all] done fail=${failed.length}`);
process.exit(failed.length === 0 ? 0 : 1);