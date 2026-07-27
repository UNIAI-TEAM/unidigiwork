#!/usr/bin/env node
// Batch 1A-R runtime matrix executor.
// Adapted to Batch 0B schema: workspace.id === tenant.id (CHECK constraint),
// creating a workspace triggers tenant + owner membership. Extra members are
// inserted directly into tenant_members. No LIKE-based teardown — exact IDs
// tracked in artifacts/fixture.json.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "artifacts");
mkdirSync(OUT, { recursive: true });

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = process.env.E2E_1A_PASSWORD;
const ALLOW = process.env.E2E_1A_ALLOW_URL;

function die(m) { console.error(`[batch-1a-r] ${m}`); process.exit(2); }
if (!URL || !ANON || !SVC || !PW) die("missing env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, E2E_1A_PASSWORD");
if (!ALLOW || !URL.startsWith(ALLOW)) die("refusing to run: E2E_1A_ALLOW_URL must prefix SUPABASE_URL");

const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const mask = (t) => t ? `${t.slice(0, 10)}…(len=${t.length})` : null;
const FIXTURE_TAG = "e2e_1a_";

// Identity list. Multi-tenant + inactive appended.
const IDENTITIES = [
  { key: "owner_a", tenant: "A", role: "tenant_owner" },
  { key: "admin_a", tenant: "A", role: "tenant_admin" },
  { key: "member_a", tenant: "A", role: "member" },
  { key: "guest_a", tenant: "A", role: "guest" },
  { key: "owner_b", tenant: "B", role: "tenant_owner" },
  { key: "admin_b", tenant: "B", role: "tenant_admin" },
  { key: "member_b", tenant: "B", role: "member" },
  { key: "guest_b", tenant: "B", role: "guest" },
  { key: "platform_admin", tenant: null, role: null, platformRole: "admin" },
  { key: "outsider", tenant: null, role: null },
  { key: "inactive_a", tenant: "A", role: "member", status: "suspended" },
  { key: "multi", tenant: "A", role: "member", extraTenant: "B", extraRole: "member" },
];

async function listAllUsers() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 200) break;
  }
  return out;
}

async function ensureUser(email, existing) {
  const found = existing.find((u) => u.email === email);
  if (found) {
    // Reset password so token generation works across runs with a fresh PW.
    await admin.auth.admin.updateUserById(found.id, { password: PW, email_confirm: true });
    return found;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  return data.user;
}

async function ensureUsersTableRow(userId, email) {
  const r = await admin.from("users").upsert({ id: userId, primary_email: email, display_name: email.split("@")[0], status: "active" }, { onConflict: "id" });
  if (r.error) throw new Error(`ensureUsersTableRow ${email}: ${r.error.message}`);
}

async function findWorkspaceByName(name) {
  const { data } = await admin.from("workspaces").select("id, tenant_id").eq("name", name).maybeSingle();
  return data;
}

// FINDING (Batch 0B): workspaces.tenant_id FK is NOT deferrable and the tenant-
// creation trigger fires AFTER the FK check, so `INSERT INTO workspaces` alone
// always fails. We work around it in the fixture by pre-creating the tenant
// row with the same id. This is a real production defect — flagged in the
// report; needs a corrective migration (see report §41).
async function ensureWorkspace(name, ownerId, slug) {
  const found = await findWorkspaceByName(name);
  if (found) return found;
  // Reuse an existing tenant row (may persist across runs because audit_events
  // are immutable and hold a FK to tenants). Otherwise create one.
  const { randomUUID } = await import("node:crypto");
  const existingTenant = await admin.from("tenants").select("id").eq("slug", slug).maybeSingle();
  let id = existingTenant.data?.id;
  if (!id) {
    id = randomUUID();
    const t = await admin.from("tenants").insert({
      id, slug, name, status: "active", created_by: ownerId, updated_by: ownerId,
    }).select("id").single();
    if (t.error) throw t.error;
  }
  const w = await admin.from("workspaces").insert({ id, name, owner_id: ownerId }).select("id, tenant_id").single();
  if (w.error) throw w.error;
  return w.data;
}

async function seed() {
  const log = (s) => console.log(`[seed] ${s}`);
  const existing = await listAllUsers();
  const users = {};
  log(`ensureUsers x${IDENTITIES.length}`);
  for (const id of IDENTITIES) {
    const email = `${FIXTURE_TAG}${id.key}@uniwork.test`;
    const u = await ensureUser(email, existing);
    await ensureUsersTableRow(u.id, email);
    users[id.key] = { id: u.id, email };
  }
  log("ensureWorkspace A");
  const wsA = await ensureWorkspace(`${FIXTURE_TAG}Workspace A`, users.owner_a.id, `${FIXTURE_TAG}a`);
  log("ensureWorkspace B");
  const wsB = await ensureWorkspace(`${FIXTURE_TAG}Workspace B`, users.owner_b.id, `${FIXTURE_TAG}b`);
  const tenants = {
    A: { id: wsA.tenant_id, workspaceId: wsA.id, ownerId: users.owner_a.id },
    B: { id: wsB.tenant_id, workspaceId: wsB.id, ownerId: users.owner_b.id },
  };

  log("extra tenant_members");
  for (const id of IDENTITIES.filter((i) => i.tenant && i.key !== "owner_a" && i.key !== "owner_b")) {
    const t = tenants[id.tenant];
    const r = await admin.from("tenant_members").upsert({
      tenant_id: t.id, user_id: users[id.key].id, role: id.role,
      status: id.status ?? "active", created_by: t.ownerId, updated_by: t.ownerId,
    }, { onConflict: "tenant_id,user_id" });
    if (r.error) throw new Error(`tenant_members ${id.key}: ${r.error.message}`);
  }
  log("multi-tenant B membership");
  const rMulti = await admin.from("tenant_members").upsert({
    tenant_id: tenants.B.id, user_id: users.multi.id, role: "member",
    status: "active", created_by: tenants.B.ownerId, updated_by: tenants.B.ownerId,
  }, { onConflict: "tenant_id,user_id" });
  if (rMulti.error) throw new Error(`multi B: ${rMulti.error.message}`);

  log("platform admin role");
  const rPa = await admin.from("user_roles").upsert({ user_id: users.platform_admin.id, role: "admin" }, { onConflict: "user_id,role" });
  if (rPa.error) throw new Error(`user_roles: ${rPa.error.message}`);

  log("resources");
  const resources = { A: {}, B: {} };
  for (const label of ["A", "B"]) {
    const t = tenants[label];
    log(`  ${label} document`);
    // document
    let { data: doc } = await admin.from("documents").select("id").eq("workspace_id", t.workspaceId).eq("title", `${FIXTURE_TAG}doc_${label}`).maybeSingle();
    if (!doc) {
      const r = await admin.from("documents").insert({ title: `${FIXTURE_TAG}doc_${label}`, workspace_id: t.workspaceId, updated_by: t.ownerId }).select("id").single();
      if (r.error) throw r.error; doc = r.data;
    }
    log(`  ${label} thread`);
    // thread
    let { data: thr } = await admin.from("email_threads").select("id").eq("workspace_id", t.workspaceId).eq("subject", `${FIXTURE_TAG}thread_${label}`).maybeSingle();
    if (!thr) {
      const r = await admin.from("email_threads").insert({ subject: `${FIXTURE_TAG}thread_${label}`, workspace_id: t.workspaceId, created_by: t.ownerId, updated_by: t.ownerId }).select("id").single();
      if (r.error) throw r.error; thr = r.data;
    }
    log(`  ${label} message`);
    // message
    let { data: msg } = await admin.from("email_messages").select("id").eq("thread_id", thr.id).eq("subject", `${FIXTURE_TAG}msg_${label}`).maybeSingle();
    if (!msg) {
      const r = await admin.from("email_messages").insert({ subject: `${FIXTURE_TAG}msg_${label}`, thread_id: thr.id, workspace_id: t.workspaceId, from_user_id: t.ownerId, sent_at: new Date().toISOString(), created_by: t.ownerId, updated_by: t.ownerId }).select("id").single();
      if (r.error) throw r.error; msg = r.data;
    }
    log(`  ${label} state`);
    // state
    const rSt = await admin.from("email_states").upsert({ message_id: msg.id, user_id: t.ownerId, is_read: false, updated_by: t.ownerId }, { onConflict: "message_id,user_id" });
    if (rSt.error) throw new Error(`email_states ${label}: ${rSt.error.message}`);
    log(`  ${label} notification`);
    // notification
    let { data: notif } = await admin.from("notifications").select("id").eq("user_id", t.ownerId).eq("title", `${FIXTURE_TAG}notif_${label}`).maybeSingle();
    if (!notif) {
      const r = await admin.from("notifications").insert({ title: `${FIXTURE_TAG}notif_${label}`, type: "system", workspace_id: t.workspaceId, user_id: t.ownerId, scope_type: "tenant", created_by: t.ownerId, updated_by: t.ownerId }).select("id").single();
      if (r.error) throw r.error; notif = r.data;
    }
    resources[label] = { docId: doc.id, threadId: thr.id, messageId: msg.id, notifId: notif.id };
  }
  return { tenants, users, resources };
}

async function tokenFor(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signin ${email}: ${error.message}`);
  return { token: data.session.access_token, userId: data.user.id };
}

function http(actorToken, method, path, body) {
  const headers = { apikey: ANON, "Content-Type": "application/json" };
  if (actorToken) headers.Authorization = `Bearer ${actorToken}`;
  if (method !== "GET" && method !== "DELETE") headers.Prefer = "return=representation";
  return fetch(`${URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function selectCell(token, table, filter, selectCols = "*") {
  const q = Object.entries(filter).map(([k, v]) => `${k}=eq.${v}`).join("&");
  const res = await http(token, "GET", `/rest/v1/${table}?${q}&select=${selectCols}&limit=5`);
  const rows = res.ok ? await res.json().catch(() => []) : [];
  return { http: res.status, rows: Array.isArray(rows) ? rows.length : 0, ok: res.ok };
}

async function insertCell(token, table, body) {
  const res = await http(token, "POST", `/rest/v1/${table}`, body);
  const txt = await res.text().catch(() => "");
  return { http: res.status, ok: res.ok, body: txt.slice(0, 200) };
}

async function updateCell(token, table, filter, patch) {
  const q = Object.entries(filter).map(([k, v]) => `${k}=eq.${v}`).join("&");
  const res = await http(token, "PATCH", `/rest/v1/${table}?${q}`, patch);
  const txt = await res.text().catch(() => "");
  return { http: res.status, ok: res.ok, body: txt.slice(0, 200) };
}

async function deleteCell(token, table, filter) {
  const q = Object.entries(filter).map(([k, v]) => `${k}=eq.${v}`).join("&");
  const res = await http(token, "DELETE", `/rest/v1/${table}?${q}`);
  const txt = await res.text().catch(() => "");
  return { http: res.status, ok: res.ok, body: txt.slice(0, 200) };
}

function record(results, cell, outcome, expected) {
  const actual = outcome.actual;
  const pass = actual === expected;
  results.push({ ...cell, expected, actual, http: outcome.http ?? null, notes: outcome.notes ?? null, pass });
}

async function runMatrix(ctx) {
  const { tenants, users, resources, tokens } = ctx;
  const results = [];

  const TENANT_TABLES = ["workspaces", "documents", "email_threads", "email_messages", "email_states", "notifications"];

  // Helper: is-there-any-row-for-tenant read
  async function readTenantTable(actorKey, table, tenantLabel, expected) {
    const token = actorKey === "anonymous" ? null : tokens[actorKey]?.token;
    let filter = table === "workspaces" ? { id: tenants[tenantLabel].workspaceId } : { tenant_id: tenants[tenantLabel].id };
    // email_states has no `id` column; select a real column
    const selectCols = table === "email_states" ? "message_id" : "*";
    const r = await selectCell(token, table, filter, selectCols);
    record(results, { actor: actorKey, action: "select", table, tenant: tenantLabel }, { actual: r.rows > 0 ? "allow" : "deny", http: r.http }, expected);
  }

  // 1. Anonymous: deny all
  for (const table of TENANT_TABLES) {
    for (const label of ["A", "B"]) await readTenantTable("anonymous", table, label, "deny");
  }
  // Anonymous insert audit/outbox
  for (const t of ["audit_events", "outbox_events"]) {
    const r = await insertCell(null, t, { action: "x", resource_type: "y", event_type: "x", aggregate_type: "y", aggregate_id: "z", idempotency_key: "e2e_1a_probe_" + t });
    record(results, { actor: "anonymous", action: "insert", table: t }, { actual: r.ok ? "allow" : "deny", http: r.http }, "deny");
  }

  // 2. Outsider: deny both tenants
  for (const table of TENANT_TABLES) {
    for (const label of ["A", "B"]) await readTenantTable("outsider", table, label, "deny");
  }

  // 3. Tenant A members: allow A, deny B. Notifications are per-user so only
  //    owner_a (who owns the fixture notification) can see it; others get 0
  //    rows but that's *by design* of `notifications_tenant_scope`
  //    (`user_id = auth.uid()`). Reflect that in expectations.
  for (const actor of ["owner_a", "admin_a", "member_a", "guest_a"]) {
    for (const table of TENANT_TABLES) {
      const perUser = table === "notifications" || table === "email_states";
      const expectA = perUser && actor !== "owner_a" ? "deny" : "allow";
      await readTenantTable(actor, table, "A", expectA);
      await readTenantTable(actor, table, "B", "deny");
    }
  }
  for (const actor of ["owner_b", "admin_b", "member_b", "guest_b"]) {
    for (const table of TENANT_TABLES) {
      const perUser = table === "notifications" || table === "email_states";
      const expectB = perUser && actor !== "owner_b" ? "deny" : "allow";
      await readTenantTable(actor, table, "B", expectB);
      await readTenantTable(actor, table, "A", "deny");
    }
  }

  // 5. Platform admin (no tenant_members row): deny tenant reads
  for (const table of TENANT_TABLES) {
    for (const label of ["A", "B"]) await readTenantTable("platform_admin", table, label, "deny");
  }

  // 6. Inactive member: deny both
  for (const table of TENANT_TABLES) {
    await readTenantTable("inactive_a", table, "A", "deny");
    await readTenantTable("inactive_a", table, "B", "deny");
  }

  // 7. Multi-tenant user (member of A and B active). notifications are
  //    per-user (multi doesn't own the fixture notifications).
  for (const table of TENANT_TABLES) {
    const perUser = table === "notifications" || table === "email_states";
    const exp = perUser ? "deny" : "allow";
    await readTenantTable("multi", table, "A", exp);
    await readTenantTable("multi", table, "B", exp);
  }

  // 8. Cross-tenant insert: member_a inserting document into workspace B
  {
    const r = await insertCell(tokens.member_a.token, "documents", { title: FIXTURE_TAG + "cross", workspace_id: tenants.B.workspaceId });
    record(results, { actor: "member_a", action: "insert", table: "documents", tenant: "B", notes: "cross-tenant insert" }, { actual: r.ok ? "allow" : "deny", http: r.http }, "deny");
  }
  // 8b. Body override tenant_id (should be filled by trigger, request-supplied tenant_id must be ignored/rejected)
  {
    const r = await insertCell(tokens.member_a.token, "documents", { title: FIXTURE_TAG + "override", workspace_id: tenants.A.workspaceId, tenant_id: tenants.B.id });
    // Expected: either 4xx (trigger override with mismatched fk) or 2xx but persisted tenant_id === A
    let persisted = null;
    if (r.ok) {
      const { data } = await admin.from("documents").select("tenant_id").eq("title", FIXTURE_TAG + "override").maybeSingle();
      persisted = data?.tenant_id;
    }
    // Expected: policy rejects (tenant_id=B in body fails is_tenant_member OR
    // workspace/tenant mismatch check). deny is the correct security outcome.
    let actual;
    if (!r.ok) actual = "deny";
    else if (persisted === tenants.A.id) actual = "allow_persisted_A";
    else actual = "leak_tenant_B";
    record(results, { actor: "member_a", action: "insert", table: "documents", tenant: "A", notes: "body override tenant_id=B" }, { actual, http: r.http }, "deny");
  }

  // 9. Cross-tenant update/delete: member_a on tenant B document
  {
    const u = await updateCell(tokens.member_a.token, "documents", { id: resources.B.docId }, { title: FIXTURE_TAG + "hacked" });
    // RLS filters silently → 200 with empty body. Treat 2xx-with-no-effect as deny.
    let effective = "deny";
    if (u.ok) {
      const { data } = await admin.from("documents").select("title").eq("id", resources.B.docId).single();
      if (data?.title === FIXTURE_TAG + "hacked") effective = "allow";
    }
    record(results, { actor: "member_a", action: "update", table: "documents", tenant: "B" }, { actual: effective, http: u.http }, "deny");

    const d = await deleteCell(tokens.member_a.token, "documents", { id: resources.B.docId });
    let stillExists = false;
    const { data } = await admin.from("documents").select("id").eq("id", resources.B.docId).maybeSingle();
    stillExists = !!data;
    record(results, { actor: "member_a", action: "delete", table: "documents", tenant: "B" }, { actual: stillExists ? "deny" : "allow", http: d.http }, "deny");
  }

  // 10. Audit / outbox writes: authenticated must NOT insert
  for (const actor of ["outsider", "member_a", "owner_a", "platform_admin"]) {
    const r1 = await insertCell(tokens[actor].token, "audit_events", { action: "probe", resource_type: "test", tenant_id: tenants.A.id });
    record(results, { actor, action: "insert", table: "audit_events" }, { actual: r1.ok ? "allow" : "deny", http: r1.http }, "deny");
    const r2 = await insertCell(tokens[actor].token, "outbox_events", { event_type: "x", aggregate_type: "y", aggregate_id: "z", idempotency_key: `${FIXTURE_TAG}${actor}_probe` });
    record(results, { actor, action: "insert", table: "outbox_events" }, { actual: r2.ok ? "allow" : "deny", http: r2.http }, "deny");
  }

  // 11. audit_events browser update/delete: must have zero effect. HTTP 200/204
  //     with 0 affected rows is acceptable (RLS-filtered no-op).
  {
    // seed one audit row so we have something to try to mutate
    const key = `${FIXTURE_TAG}audit_${Date.now()}`;
    await admin.from("audit_events").insert({ action: key, resource_type: "test", tenant_id: tenants.A.id });
    const u = await updateCell(tokens.owner_a.token, "audit_events", { action: key }, { action: "tamper" });
    // Verify no row was actually changed
    const { data: postU } = await admin.from("audit_events").select("action").eq("action", key).maybeSingle();
    const effU = postU ? "deny" : "allow";
    record(results, { actor: "owner_a", action: "update", table: "audit_events" }, { actual: effU, http: u.http }, "deny");
    const d = await deleteCell(tokens.owner_a.token, "audit_events", { action: key });
    const { data: postD } = await admin.from("audit_events").select("action").eq("action", key).maybeSingle();
    const effD = postD ? "deny" : "allow";
    record(results, { actor: "owner_a", action: "delete", table: "audit_events" }, { actual: effD, http: d.http }, "deny");
    // cleanup
    await admin.from("audit_events").delete().eq("action", key);
  }

  // 12. Outbox concurrent claim (server-side RPC, via service role for concurrency correctness)
  {
    // Single-winner invariant (SEC.6): the same event MUST NOT be claimed by
    // two workers. Use a unique aggregate_type namespace so we can isolate our
    // seeded events from any pre-existing backlog and evaluate the invariant
    // deterministically regardless of unrelated pending events.
    const runId = `${FIXTURE_TAG}claim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const aggregateType = runId; // unique per run
    const seeded = Array.from({ length: 20 }, (_, i) => ({
      event_type: "test.claim.v1",
      aggregate_type: aggregateType,
      aggregate_id: `${runId}_${i}`,
      idempotency_key: `${runId}_${i}`,
      tenant_id: tenants.A.id,
      status: "pending",
      // Sort ahead of any pre-existing backlog so ORDER BY available_at
      // in claim_outbox_events picks our namespace first — the invariant
      // (no id claimed twice) is what we are asserting.
      available_at: "1970-01-02T00:00:00Z",
    }));
    await admin.from("outbox_events").insert(seeded);
    // Large batch + high worker count guarantees contention on our namespace.
    const workers = ["w1", "w2", "w3", "w4", "w5"].map((w) => `${runId}_${w}`);
    const claims = await Promise.all(
      workers.map((w) => admin.rpc("claim_outbox_events", { _worker: w, _batch: 20, _lease_seconds: 30 })),
    );
    const claimedIds = claims.flatMap((c) => (c.data ?? []).filter((e) => e.aggregate_type === aggregateType).map((e) => e.id));
    const unique = new Set(claimedIds);
    const duplicate = claimedIds.length !== unique.size;
    const singleWinner = !duplicate && claimedIds.length > 0;
    record(
      results,
      { actor: "server", action: "rpc", table: "claim_outbox_events" },
      { actual: singleWinner ? "single-winner" : `duplicate=${duplicate} claimed=${claimedIds.length}/${seeded.length}` },
      "single-winner",
    );
    // Cleanup — release leases and mark processed by exact IDs (no wildcards).
    if (claimedIds.length > 0) {
      await admin
        .from("outbox_events")
        .update({ status: "processed", processed_at: new Date().toISOString(), lease_owner: null, lease_expires_at: null })
        .in("id", [...unique]);
    }
    await admin.from("outbox_events").delete().eq("aggregate_type", aggregateType);
  }

  return results;
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[batch-1a-r] host=${mask(URL)} started=${startedAt}`);
  const ctx = { ...(await seed()) };
  const tokens = {};
  for (const id of IDENTITIES) {
    const email = `${FIXTURE_TAG}${id.key}@uniwork.test`;
    tokens[id.key] = await tokenFor(email);
  }
  console.log("[batch-1a-r] tokens:", Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, mask(v.token)])));
  const fixture = {
    startedAt,
    tenants: { A: ctx.tenants.A, B: ctx.tenants.B },
    resources: ctx.resources,
    users: Object.fromEntries(Object.entries(ctx.users).map(([k, v]) => [k, v.id])),
  };
  writeFileSync(join(OUT, "fixture.json"), JSON.stringify(fixture, null, 2));
  const results = await runMatrix({ ...ctx, tokens });
  const failed = results.filter((r) => r.pass === false);
  writeFileSync(join(OUT, "matrix.json"), JSON.stringify(results, null, 2));
  writeFileSync(join(OUT, "failures.json"), JSON.stringify(failed, null, 2));
  writeFileSync(join(OUT, "run.json"), JSON.stringify({ startedAt, endedAt: new Date().toISOString(), host: URL.replace(/https?:\/\//, "").replace(/(.{6}).*/, "$1…"), total: results.length, passed: results.length - failed.length, failed: failed.length }, null, 2));
  const md = [
    "# Batch 1A-R matrix results", "",
    `Started: ${startedAt}`,
    `Total: ${results.length}. Passed: ${results.length - failed.length}. Failed: ${failed.length}.`, "",
    "| actor | action | table | tenant | expected | actual | http | pass | notes |",
    "|---|---|---|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.actor} | ${r.action} | ${r.table} | ${r.tenant ?? ""} | ${r.expected} | ${r.actual} | ${r.http ?? ""} | ${r.pass ? "✅" : "❌"} | ${r.notes ?? ""} |`),
  ].join("\n");
  writeFileSync(join(OUT, "matrix.md"), md);
  console.log(`[batch-1a-r] ${failed.length} FAIL / ${results.length} total → ${OUT}/matrix.md`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error("[batch-1a-r] FATAL", e?.message ?? e); console.error(e?.stack ?? ""); process.exit(2); });