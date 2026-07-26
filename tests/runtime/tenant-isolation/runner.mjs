#!/usr/bin/env node
// Batch 1A runtime matrix executor. See README.md.
// This runner is intentionally environment-driven: it will NOT execute
// without SUPABASE_SERVICE_ROLE_KEY and an explicit E2E_1A_ALLOW_URL guard.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMatrix, ACTORS } from "./matrix.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "artifacts");
mkdirSync(OUT, { recursive: true });

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = process.env.E2E_1A_PASSWORD;
const ALLOW = process.env.E2E_1A_ALLOW_URL;

function die(msg) { console.error(`[batch-1a] ${msg}`); process.exit(2); }
if (!URL || !ANON || !SVC || !PW) die("missing env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, E2E_1A_PASSWORD");
if (!ALLOW || !URL.startsWith(ALLOW)) die("refusing to run: set E2E_1A_ALLOW_URL to the expected project URL prefix (safety guard).");

const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

const IDENTITIES = [
  { key: "owner_a", tenant: "A", role: "tenant_owner" },
  { key: "admin_a", tenant: "A", role: "tenant_admin" },
  { key: "member_a", tenant: "A", role: "tenant_member" },
  { key: "guest_a", tenant: "A", role: "tenant_guest" },
  { key: "owner_b", tenant: "B", role: "tenant_owner" },
  { key: "admin_b", tenant: "B", role: "tenant_admin" },
  { key: "member_b", tenant: "B", role: "tenant_member" },
  { key: "guest_b", tenant: "B", role: "tenant_guest" },
  { key: "platform_admin", tenant: null, role: null, platformRole: "admin" },
  { key: "outsider", tenant: null, role: null },
];

async function ensureAuthUser(email) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = list.users.find((u) => u.email === email);
  if (found) return found;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  return data.user;
}

function mask(t) { return t ? `${t.slice(0, 10)}…(${t.length})` : null; }

async function seed() {
  const users = {};
  for (const id of IDENTITIES) {
    const email = `e2e_1a_${id.key}@uniwork.test`;
    users[id.key] = await ensureAuthUser(email);
  }
  // Tenants
  const tenants = {};
  for (const label of ["A", "B"]) {
    const owner = users[`owner_${label.toLowerCase()}`];
    const { data: existing } = await admin.from("tenants").select("id").eq("slug", `e2e_1a_${label.toLowerCase()}`).maybeSingle();
    let id = existing?.id;
    if (!id) {
      const ins = await admin.from("tenants").insert({
        slug: `e2e_1a_${label.toLowerCase()}`, name: `e2e_1a Tenant ${label}`,
        status: "active", created_by: owner.id, updated_by: owner.id,
      }).select("id").single();
      if (ins.error) throw ins.error;
      id = ins.data.id;
    }
    tenants[label] = { id, ownerId: owner.id };
  }
  // Memberships
  for (const id of IDENTITIES.filter((i) => i.tenant)) {
    const t = tenants[id.tenant];
    await admin.from("tenant_members").upsert({
      tenant_id: t.id, user_id: users[id.key].id, role: id.role,
      status: "active", created_by: t.ownerId, updated_by: t.ownerId,
    }, { onConflict: "tenant_id,user_id" });
  }
  // Platform admin
  await admin.from("user_roles").upsert({ user_id: users.platform_admin.id, role: "admin" });
  // Workspaces
  const workspaces = {};
  for (const label of ["A", "B"]) {
    const t = tenants[label];
    const { data } = await admin.from("workspaces").upsert({
      name: `e2e_1a Workspace ${label}`, owner_id: t.ownerId, tenant_id: t.id,
    }, { onConflict: "name" }).select("id").single();
    workspaces[label] = data.id;
  }
  // Resources (documents, threads, messages, states, notifications) — one per tenant
  for (const label of ["A", "B"]) {
    const t = tenants[label]; const ws = workspaces[label];
    await admin.from("documents").upsert({ title: `e2e_1a_doc_${label}`, tenant_id: t.id, workspace_id: ws, created_by: t.ownerId, updated_by: t.ownerId }, { onConflict: "title" });
    const thr = await admin.from("email_threads").upsert({ subject: `e2e_1a_thread_${label}`, tenant_id: t.id, workspace_id: ws, created_by: t.ownerId, updated_by: t.ownerId }, { onConflict: "subject" }).select("id").single();
    const msg = await admin.from("email_messages").upsert({ subject: `e2e_1a_msg_${label}`, thread_id: thr.data.id, tenant_id: t.id, sent_at: new Date().toISOString(), created_by: t.ownerId, updated_by: t.ownerId }, { onConflict: "subject" }).select("id").single();
    await admin.from("email_states").upsert({ message_id: msg.data.id, user_id: t.ownerId, tenant_id: t.id, is_read: false, created_by: t.ownerId, updated_by: t.ownerId }, { onConflict: "message_id,user_id" });
    await admin.from("notifications").upsert({ title: `e2e_1a_notif_${label}`, tenant_id: t.id, workspace_id: ws, user_id: t.ownerId, scope_type: "tenant", created_by: t.ownerId, updated_by: t.ownerId }, { onConflict: "title" });
  }
  return { tenants, workspaces, users };
}

async function tokenFor(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  return data.session.access_token;
}

async function runCell(cell, ctx) {
  const tenantRef = cell.tenant === "A" ? ctx.tenants.A : cell.tenant === "B" ? ctx.tenants.B : null;
  const token = cell.actor === "anonymous" ? null : ctx.tokens[cell.actor];
  const headers = { apikey: ANON, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = `${URL}/rest/v1/${cell.table}`;
  let res, body;
  if (cell.action === "select") {
    const q = tenantRef ? `?tenant_id=eq.${tenantRef.id}&select=id` : `?select=id&limit=1`;
    res = await fetch(base + q, { headers });
    body = await res.json().catch(() => null);
    const rows = Array.isArray(body) ? body.length : 0;
    const actual = res.ok && rows > 0 ? "allow" : "deny";
    return { ...cell, http: res.status, rows, actual, pass: actual === cell.expected };
  }
  if (cell.action === "insert") {
    res = await fetch(base, { method: "POST", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(cell.body ?? { name: "e2e_1a_probe" }) });
    body = await res.json().catch(() => null);
    const actual = res.ok ? "allow" : "deny";
    return { ...cell, http: res.status, actual, pass: actual === cell.expected };
  }
  // update/delete/rpc — expand as needed
  return { ...cell, actual: "skipped", pass: null, notes: "TODO: extend runner for update/delete/rpc" };
}

async function main() {
  console.log("[batch-1a] seeding fixture…");
  const ctx = await seed();
  const tokens = {};
  for (const id of IDENTITIES) tokens[id.key] = await tokenFor(`e2e_1a_${id.key}@uniwork.test`);
  console.log("[batch-1a] tokens:", Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, mask(v)])));
  const cells = buildMatrix({ tenantA: { id: ctx.tenants.A.id, workspaceId: ctx.workspaces.A }, tenantB: { id: ctx.tenants.B.id, workspaceId: ctx.workspaces.B } });
  const results = [];
  for (const cell of cells) results.push(await runCell(cell, { ...ctx, tokens }));
  writeFileSync(join(OUT, "matrix.results.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.pass === false);
  const md = [
    "# Batch 1A matrix results", "",
    `Total cells: ${results.length}. Passed: ${results.filter((r) => r.pass).length}. Failed: ${failed.length}.`, "",
    "| actor | action | table | tenant | expected | actual | http | pass |",
    "|---|---|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.actor} | ${r.action} | ${r.table} | ${r.tenant ?? ""} | ${r.expected} | ${r.actual} | ${r.http ?? ""} | ${r.pass === null ? "skip" : r.pass ? "✅" : "❌"} |`),
  ].join("\n");
  writeFileSync(join(OUT, "matrix.md"), md);
  console.log(`[batch-1a] wrote ${OUT}/matrix.md — ${failed.length} FAIL`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });