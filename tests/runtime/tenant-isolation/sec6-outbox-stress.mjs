#!/usr/bin/env node
// SEC.6 — Outbox determinism stress harness.
// Verifies claim_outbox_events single-winner invariant, lease semantics,
// retry availability and processed/dead-letter no-reclaim, with N iterations
// per scenario. Uses a per-run unique aggregate_type namespace to isolate
// from any unrelated pending backlog (root cause of the earlier flake:
// batch=5 + ORDER BY available_at meant 179 pre-existing pending events
// crowded out the freshly seeded event, so both workers observed 0 for our
// key — misread as "no winner" when in fact the invariant held elsewhere).
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "artifacts");
mkdirSync(OUT, { recursive: true });

const URL = process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOW = process.env.E2E_1A_ALLOW_URL;
function die(m) { console.error(`[sec6-outbox] ${m}`); process.exit(2); }
if (!URL || !SVC) die("missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
if (!ALLOW || !URL.startsWith(ALLOW)) die("refusing to run: E2E_1A_ALLOW_URL must prefix SUPABASE_URL");

const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const ITER = Number(process.env.SEC6_ITER ?? 25);

function newRun(tag) {
  const rid = `sec6_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return { rid, aggregateType: rid };
}

async function seed(aggregateType, n, extra = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({
    event_type: "sec6.stress.v1",
    aggregate_type: aggregateType,
    aggregate_id: `${aggregateType}_${i}`,
    idempotency_key: `${aggregateType}_${i}`,
    tenant_id: null,
    status: "pending",
    ...extra,
  }));
  const { error } = await admin.from("outbox_events").insert(rows);
  if (error) throw error;
}

async function cleanup(aggregateType) {
  await admin.from("outbox_events").delete().eq("aggregate_type", aggregateType);
}

async function claim(worker, batch = 50, lease = 30) {
  const { data, error } = await admin.rpc("claim_outbox_events", { _worker: worker, _batch: batch, _lease_seconds: lease });
  if (error) throw error;
  return data ?? [];
}

function ownedByRun(rows, aggregateType) {
  return rows.filter((r) => r.aggregate_type === aggregateType).map((r) => r.id);
}

async function iterTwoWorkerSingle() {
  const { aggregateType } = newRun("2w1e");
  await seed(aggregateType, 1);
  const [a, b] = await Promise.all([claim("w_a_" + aggregateType), claim("w_b_" + aggregateType)]);
  const ids = [...ownedByRun(a, aggregateType), ...ownedByRun(b, aggregateType)];
  const ok = ids.length === 1;
  await cleanup(aggregateType);
  return { scenario: "two-worker-single", ok, detail: { claimed: ids.length } };
}

async function iterFiveWorkerSingle() {
  const { aggregateType } = newRun("5w1e");
  await seed(aggregateType, 1);
  const claims = await Promise.all(["a", "b", "c", "d", "e"].map((k) => claim(`w_${k}_${aggregateType}`)));
  const ids = claims.flatMap((c) => ownedByRun(c, aggregateType));
  const ok = ids.length === 1;
  await cleanup(aggregateType);
  return { scenario: "five-worker-single", ok, detail: { claimed: ids.length } };
}

async function iterMultiEvent() {
  const { aggregateType } = newRun("multi");
  await seed(aggregateType, 20);
  const claims = await Promise.all(["a", "b", "c", "d", "e"].map((k) => claim(`w_${k}_${aggregateType}`, 20)));
  const ids = claims.flatMap((c) => ownedByRun(c, aggregateType));
  const dup = ids.length !== new Set(ids).size;
  const ok = !dup && ids.length === 20;
  await cleanup(aggregateType);
  return { scenario: "multi-worker-multi-event", ok, detail: { total: ids.length, unique: new Set(ids).size } };
}

async function iterActiveLease() {
  const { aggregateType } = newRun("lease");
  await seed(aggregateType, 1);
  const first = await claim(`owner_${aggregateType}`, 50, 60);
  const owned = ownedByRun(first, aggregateType);
  const second = await claim(`other_${aggregateType}`, 50, 60);
  const stolen = ownedByRun(second, aggregateType);
  const ok = owned.length === 1 && stolen.length === 0;
  await cleanup(aggregateType);
  return { scenario: "active-lease", ok, detail: { owned: owned.length, stolen: stolen.length } };
}

async function iterExpiredLease() {
  const { aggregateType } = newRun("expired");
  await seed(aggregateType, 1, { lease_owner: `stale_${aggregateType}`, lease_expires_at: new Date(Date.now() - 60_000).toISOString(), status: "processing" });
  const reclaim = await claim(`w_${aggregateType}`);
  const owned = ownedByRun(reclaim, aggregateType);
  const ok = owned.length === 1;
  await cleanup(aggregateType);
  return { scenario: "expired-lease", ok, detail: { reclaimed: owned.length } };
}

async function iterProcessed() {
  const { aggregateType } = newRun("done");
  await seed(aggregateType, 1, { status: "processed", processed_at: new Date().toISOString() });
  const c = await claim(`w_${aggregateType}`);
  const owned = ownedByRun(c, aggregateType);
  const ok = owned.length === 0;
  await cleanup(aggregateType);
  return { scenario: "processed-not-reclaimed", ok, detail: { claimed: owned.length } };
}

async function iterRetryAvailability() {
  const { aggregateType } = newRun("retry");
  await seed(aggregateType, 1, { status: "retry", available_at: new Date(Date.now() + 60_000).toISOString() });
  const early = await claim(`w_${aggregateType}`);
  const okEarly = ownedByRun(early, aggregateType).length === 0;
  await cleanup(aggregateType);
  return { scenario: "retry-availability", ok: okEarly, detail: { earlyClaimed: !okEarly } };
}

async function main() {
  const startedAt = new Date().toISOString();
  const scenarios = {
    "two-worker-single": iterTwoWorkerSingle,
    "five-worker-single": iterFiveWorkerSingle,
    "multi-worker-multi-event": iterMultiEvent,
    "active-lease": iterActiveLease,
    "expired-lease": iterExpiredLease,
    "processed-not-reclaimed": iterProcessed,
    "retry-availability": iterRetryAvailability,
  };
  const results = [];
  for (const [name, fn] of Object.entries(scenarios)) {
    let pass = 0, fail = 0, details = [];
    for (let i = 0; i < ITER; i++) {
      try {
        const r = await fn();
        if (r.ok) pass++; else { fail++; details.push({ i, ...r.detail }); }
      } catch (e) {
        fail++; details.push({ i, error: String(e?.message ?? e) });
      }
    }
    results.push({ scenario: name, iterations: ITER, pass, fail, failures: details });
    console.log(`[sec6-outbox] ${name}: ${pass}/${ITER}`);
  }
  const totalFail = results.reduce((a, r) => a + r.fail, 0);
  const artifact = { startedAt, endedAt: new Date().toISOString(), iterations: ITER, results, totalFail };
  writeFileSync(join(OUT, "sec6-outbox-stress.json"), JSON.stringify(artifact, null, 2));
  console.log(`[sec6-outbox] done fail=${totalFail}`);
  process.exit(totalFail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });