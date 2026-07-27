#!/usr/bin/env node
// Batch 1B-SEC.3 runtime matrix — invitation lifecycle.
// Uses REAL JWTs per actor (no service-role impersonation for matrix cells).
// Admin client is only used for fixture seeding / effect verification.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "artifacts");
mkdirSync(OUT, { recursive: true });

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = process.env.E2E_1A_PASSWORD || "Sec3!" + randomBytes(6).toString("hex");
const ALLOW = process.env.E2E_1A_ALLOW_URL;

function die(m) { console.error(`[sec3] ${m}`); process.exit(2); }
if (!URL_ || !ANON || !SVC) die("missing SUPABASE_URL / PUBLISHABLE / SERVICE key");
if (ALLOW && !URL_.startsWith(ALLOW)) die("refusing: E2E_1A_ALLOW_URL must prefix SUPABASE_URL");

const admin = createClient(URL_, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

// SEC.4: server-boundary simulation for rejection audit sink.
// The TanStack server function invokes `record_tenant_invitation_rejection`
// via service-role after receiving a stable rejection from accept_tenant_invitation.
// The test mimics that trusted-boundary hop so DB-level guarantees are verified.
async function serverRecordRejection({ invitationId, actorId, reasonCode, correlationId = null }) {
  const { error } = await admin.rpc("record_tenant_invitation_rejection", {
    _invitation_id: invitationId,
    _actor_id: actorId,
    _reason_code: reasonCode,
    _correlation_id: correlationId,
  });
  return { ok: !error, error: error?.message };
}

// SEC.4: unconfirm an auth.users email via the guarded test-only RPC.
// The RPC restricts mutations to sec3_ fixture accounts and is service-role-only.
async function unconfirmAuthUser(userId) {
  const { data, error } = await admin.rpc("_test_unconfirm_auth_email", { _user_id: userId });
  if (error) return { ok: false, reason: error.message };
  return { ok: data === true };
}
const TAG = "sec3_";
const RUN_ID = `sec3_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const mask = (t) => t ? `${t.slice(0, 8)}…(len=${t.length})` : null;
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const results = [];
let cellSeq = 0;

function rec(cell, expected, actual, extra = {}) {
  cellSeq += 1;
  const pass = actual === expected;
  results.push({ id: `C${String(cellSeq).padStart(3, "0")}`, ...cell, expected, actual, pass, ...extra });
  if (!pass) console.log(`  FAIL C${cellSeq} ${cell.action} expected=${expected} actual=${actual} ${extra.notes || ""}`);
}

// ---------- Fixture ----------
async function listAll() {
  const out = [];
  for (let p = 1; p <= 20; p++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: p, perPage: 200 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 200) break;
  }
  return out;
}

async function ensureUser(key, existing, { confirm = true } = {}) {
  const email = `${TAG}${key}@uniwork.test`;
  const found = existing.find((u) => u.email === email);
  if (found) {
    await admin.auth.admin.updateUserById(found.id, { password: PW, email_confirm: confirm });
    return { id: found.id, email };
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: confirm });
  if (error) throw new Error(`createUser ${key}: ${error.message}`);
  return { id: data.user.id, email };
}

async function upsertInternalUser(id, email) {
  const r = await admin.from("users").upsert({ id, primary_email: email, display_name: email.split("@")[0], status: "active" }, { onConflict: "id" });
  if (r.error) throw new Error(`users upsert: ${r.error.message}`);
}

async function ensureTenant(slug, name, ownerId) {
  const existing = await admin.from("tenants").select("id").eq("slug", slug).maybeSingle();
  let id = existing.data?.id;
  if (!id) {
    id = randomUUID();
    const t = await admin.from("tenants").insert({ id, slug, name, status: "active", created_by: ownerId, updated_by: ownerId }).select("id").single();
    if (t.error) throw new Error(`tenant ${slug}: ${t.error.message}`);
  }
  const w = await admin.from("workspaces").select("id").eq("id", id).maybeSingle();
  if (!w.data) {
    const wi = await admin.from("workspaces").insert({ id, name, owner_id: ownerId }).select("id").single();
    if (wi.error) throw new Error(`workspace ${slug}: ${wi.error.message}`);
  }
  return id;
}

async function ensureMember(tenantId, userId, role, status = "active") {
  const r = await admin.from("tenant_members").upsert(
    { tenant_id: tenantId, user_id: userId, role, status, created_by: userId, updated_by: userId },
    { onConflict: "tenant_id,user_id" }
  );
  if (r.error) throw new Error(`member ${role}: ${r.error.message}`);
}

async function tokenFor(email) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) return { error: error.message };
  return { token: data.session.access_token, userId: data.user.id };
}

// ---------- HTTP RPC ----------
async function rpc(token, fn, body) {
  const headers = { apikey: ANON, "Content-Type": "application/json", Prefer: "return=representation" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  const errMsg = json?.message || text.slice(0, 200);
  const stable = extractStable(errMsg);
  return { http: res.status, ok: res.ok, json, errMsg, stable };
}

const STABLE = [
  "TENANT_INVITATION_NOT_FOUND","TENANT_INVITATION_EXPIRED","TENANT_INVITATION_REVOKED",
  "TENANT_INVITATION_ALREADY_ACCEPTED","TENANT_INVITATION_EMAIL_MISMATCH",
  "TENANT_ROLE_CHANGE_FORBIDDEN","TENANT_LAST_OWNER_PROTECTED","TENANT_MEMBERSHIP_NOT_FOUND",
  "PERMISSION_DENIED","AUTHENTICATION_REQUIRED","VALIDATION_FAILED",
];
function extractStable(msg) {
  const up = String(msg || "").toUpperCase();
  return STABLE.find((c) => up.includes(c)) || null;
}

// ---------- Seed ----------
async function seed() {
  console.log("[sec3] seed users");
  const existing = await listAll();
  const U = {};
  const spec = [
    ["owner_a"], ["admin_a"], ["member_a"], ["guest_a"],
    ["owner_b"], ["admin_b"], ["member_b"], ["guest_b"],
    ["outsider"], ["platform_admin"],
    ["correct_email"], ["wrong_email"],
    ["unconfirmed", { confirm: false }],
    ["existing_active"], ["suspended_a"], ["removed_a"],
    ["concurrent"], ["cross_tenant"],
  ];
  for (const [k, opts] of spec) {
    U[k] = await ensureUser(k, existing, opts || {});
    await upsertInternalUser(U[k].id, U[k].email);
  }

  console.log("[sec3] tenants");
  const tA = await ensureTenant(`${TAG}a`, `${TAG}Tenant A`, U.owner_a.id);
  const tB = await ensureTenant(`${TAG}b`, `${TAG}Tenant B`, U.owner_b.id);

  console.log("[sec3] memberships");
  await ensureMember(tA, U.owner_a.id, "tenant_owner");
  await ensureMember(tA, U.admin_a.id, "tenant_admin");
  await ensureMember(tA, U.member_a.id, "member");
  await ensureMember(tA, U.guest_a.id, "guest");
  await ensureMember(tA, U.existing_active.id, "member", "active");
  await ensureMember(tA, U.suspended_a.id, "member", "suspended");
  // "removed" = no membership row
  await ensureMember(tB, U.owner_b.id, "tenant_owner");
  await ensureMember(tB, U.admin_b.id, "tenant_admin");
  await ensureMember(tB, U.member_b.id, "member");
  await ensureMember(tB, U.guest_b.id, "guest");
  const pa = await admin.from("user_roles").upsert({ user_id: U.platform_admin.id, role: "admin" }, { onConflict: "user_id,role" });
  if (pa.error) throw pa.error;

  return { U, tA, tB };
}

// ---------- Invitation helpers ----------
function mkToken() { return randomBytes(24).toString("hex"); }

async function seedInvitationDirect({ tenantId, email, role = "member", ttlMs = 60000, status = "pending", invitedBy }) {
  const token = mkToken();
  const hash = sha256(token);
  const now = Date.now();
  const expires = new Date(now + ttlMs).toISOString();
  const row = {
    id: randomUUID(), tenant_id: tenantId, email: email.toLowerCase(), role,
    status, token_hash: hash, expires_at: expires, invited_by: invitedBy,
  };
  const r = await admin.from("tenant_invitations").insert(row).select().single();
  if (r.error) throw new Error(`seedInv: ${r.error.message}`);
  return { id: row.id, token, hash };
}

// ---------- Matrix ----------
async function run() {
  const { U, tA, tB } = await seed();
  console.log("[sec3] tokens");
  const TK = {};
  for (const k of Object.keys(U)) {
    if (k === "unconfirmed") continue; // handle after re-flip
    const r = await tokenFor(U[k].email);
    TK[k] = r;
  }
  // Unconfirmed strategy: sign in while confirmed, then flip email_confirmed_at to null.
  await admin.auth.admin.updateUserById(U.unconfirmed.id, { email_confirm: true });
  TK.unconfirmed = await tokenFor(U.unconfirmed.email);
  // SEC.4: null out email_confirmed_at via guarded test RPC so RPC guard fires.
  const unc = await unconfirmAuthUser(U.unconfirmed.id);
  if (!unc.ok) console.log("  warn: unconfirm via SQL failed:", unc.reason);

  console.log("[sec3] token masks:", Object.fromEntries(Object.entries(TK).map(([k, v]) => [k, v?.token ? mask(v.token) : v?.error])));

  // ---------- IV. CREATE invitation permission matrix ----------
  async function createInv(actor, tenantId, role, email = `${TAG}inv_${randomBytes(3).toString("hex")}@uniwork.test`) {
    const token = mkToken();
    const res = await rpc(TK[actor]?.token, "create_tenant_invitation", {
      _tenant_id: tenantId, _email: email, _role: role,
      _token_hash: sha256(token), _expires_at: new Date(Date.now() + 60000).toISOString(),
    });
    return { res, token, email };
  }

  // Owner A creates A: allow
  {
    const { res, token } = await createInv("owner_a", tA, "member");
    rec({ actor: "owner_a", action: "create", tenant: "A", role: "member" }, "allow",
      res.ok ? "allow" : "deny", { http: res.http, stable: res.stable, tokenMask: mask(token) });
    // token plaintext one-time / hash-storage verification
    if (res.ok && res.json?.id) {
      const row = await admin.from("tenant_invitations").select("token_hash,email").eq("id", res.json.id).single();
      const hashOnly = row.data?.token_hash && row.data.token_hash.length === 64 && !row.data.token_hash.includes(token);
      rec({ actor: "owner_a", action: "token_hash_only", tenant: "A" }, "allow", hashOnly ? "allow" : "deny",
        { notes: "DB stores sha256 hash only" });
      // response should not contain plaintext token
      const bodyStr = JSON.stringify(res.json);
      rec({ actor: "owner_a", action: "rpc_no_plaintext_token", tenant: "A" }, "allow",
        bodyStr.includes(token) ? "deny" : "allow");
    }
  }
  // Owner A creating for Tenant B: deny (not owner/admin of B)
  {
    const { res } = await createInv("owner_a", tB, "member");
    rec({ actor: "owner_a", action: "create", tenant: "B", role: "member" }, "deny",
      res.ok ? "allow" : "deny", { http: res.http, stable: res.stable });
  }
  // Owner A creating tenant_owner role: forbidden
  {
    const { res } = await createInv("owner_a", tA, "tenant_owner");
    rec({ actor: "owner_a", action: "create", tenant: "A", role: "tenant_owner" }, "deny",
      res.ok ? "allow" : "deny", { http: res.http, stable: res.stable });
  }
  // Admin A: allow member; deny tenant_owner
  {
    const a = await createInv("admin_a", tA, "member");
    rec({ actor: "admin_a", action: "create", tenant: "A", role: "member" }, "allow", a.res.ok ? "allow" : "deny",
      { http: a.res.http, stable: a.res.stable });
    const b = await createInv("admin_a", tA, "tenant_owner");
    rec({ actor: "admin_a", action: "create", tenant: "A", role: "tenant_owner" }, "deny", b.res.ok ? "allow" : "deny",
      { http: b.res.http, stable: b.res.stable });
  }
  // Member/Guest/Outsider/OwnerB (cross): deny
  for (const actor of ["member_a", "guest_a", "outsider", "owner_b"]) {
    const { res } = await createInv(actor, tA, "member");
    rec({ actor, action: "create", tenant: "A", role: "member" }, "deny", res.ok ? "allow" : "deny",
      { http: res.http, stable: res.stable });
  }
  // Platform admin: no implicit bypass expected
  {
    const { res } = await createInv("platform_admin", tA, "member");
    rec({ actor: "platform_admin", action: "create", tenant: "A", role: "member" }, "deny",
      res.ok ? "allow" : "deny", { http: res.http, stable: res.stable,
        notes: "no explicit trusted platform op contract for invitation creation" });
  }

  // ---------- Invitation listing redaction ----------
  {
    const listRes = await fetch(`${URL_}/rest/v1/tenant_invitations?tenant_id=eq.${tA}&select=*`, {
      headers: { apikey: ANON, Authorization: `Bearer ${TK.owner_a.token}` },
    });
    const rows = listRes.ok ? await listRes.json() : [];
    const leaksHash = rows.some((r) => "token_hash" in r);
    rec({ actor: "owner_a", action: "list_invitations_redaction", tenant: "A" }, "allow",
      leaksHash ? "deny" : "allow",
      { notes: leaksHash ? "token_hash present in list response" : "token_hash exposed only via RLS column policy" });
  }

  // ---------- ACCEPT lifecycle ----------
  // 1. Correct email
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.correct_email.email, role: "member", invitedBy: U.owner_a.id });
    const res = await rpc(TK.correct_email.token, "accept_tenant_invitation", { _token_hash: inv.hash });
    const okAccept = res.ok;
    rec({ actor: "correct_email", action: "accept", tenant: "A", invState: "pending" }, "allow",
      okAccept ? "allow" : "deny", { http: res.http, stable: res.stable });
    if (okAccept) {
      // Verify membership + status
      const m = await admin.from("tenant_members").select("*").eq("tenant_id", tA).eq("user_id", U.correct_email.id).single();
      rec({ actor: "correct_email", action: "membership_created", tenant: "A" }, "allow",
        m.data && m.data.role === "member" && m.data.status === "active" ? "allow" : "deny");
      // Cross-tenant leak
      const mB = await admin.from("tenant_members").select("id").eq("tenant_id", tB).eq("user_id", U.correct_email.id).maybeSingle();
      rec({ actor: "correct_email", action: "no_cross_tenant_membership" }, "allow", mB.data ? "deny" : "allow");
    }
    // Replay
    const replay = await rpc(TK.correct_email.token, "accept_tenant_invitation", { _token_hash: inv.hash });
    rec({ actor: "correct_email", action: "accept_replay_same", tenant: "A", invState: "accepted" }, "deny",
      replay.ok ? "allow" : "deny", { http: replay.http, stable: replay.stable,
        notes: replay.stable === "TENANT_INVITATION_ALREADY_ACCEPTED" ? "stable code correct" : "wrong stable" });
    // Different-actor replay
    const other = await rpc(TK.wrong_email.token, "accept_tenant_invitation", { _token_hash: inv.hash });
    rec({ actor: "wrong_email", action: "accept_replay_other", tenant: "A", invState: "accepted" }, "deny",
      other.ok ? "allow" : "deny", { http: other.http, stable: other.stable });
  }

  // 2. Wrong email
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.correct_email.email, role: "member", invitedBy: U.owner_a.id });
    const before = await admin
      .from("audit_events")
      .select("id")
      .eq("aggregate_id", inv.id)
      .eq("event_type", "tenant.invitation_rejected");
    const res = await rpc(TK.wrong_email.token, "accept_tenant_invitation", { _token_hash: inv.hash });
    rec({ actor: "wrong_email", action: "accept", tenant: "A", invState: "pending" }, "deny",
      res.ok ? "allow" : "deny", { http: res.http, stable: res.stable,
        notes: res.stable === "TENANT_INVITATION_EMAIL_MISMATCH" ? "stable OK" : "wrong stable" });
    // SEC.4: simulate server-boundary rejection audit sink hop.
    const sink1 = await serverRecordRejection({
      invitationId: inv.id,
      actorId: U.wrong_email.id,
      reasonCode: "TENANT_INVITATION_EMAIL_MISMATCH",
    });
    // Idempotent replay — must not create a second audit row.
    const sink2 = await serverRecordRejection({
      invitationId: inv.id,
      actorId: U.wrong_email.id,
      reasonCode: "TENANT_INVITATION_EMAIL_MISMATCH",
    });
    // Membership must NOT exist
    const m = await admin.from("tenant_members").select("id").eq("tenant_id", tA).eq("user_id", U.wrong_email.id).maybeSingle();
    rec({ actor: "wrong_email", action: "no_membership_after_mismatch" }, "allow", m.data ? "deny" : "allow");
    // Invitation still pending
    const inv2 = await admin.from("tenant_invitations").select("status,accepted_by").eq("id", inv.id).single();
    rec({ actor: "wrong_email", action: "invitation_unchanged" }, "allow",
      inv2.data?.status === "pending" && inv2.data?.accepted_by === null ? "allow" : "deny");
    // Rejected audit written by trusted sink, idempotent, no email leak.
    const after = await admin
      .from("audit_events")
      .select("payload, actor_id, idempotency_key")
      .eq("aggregate_id", inv.id)
      .eq("event_type", "tenant.invitation_rejected");
    const rows = after.data || [];
    const added = rows.length - (before.data?.length || 0);
    const gotAudit = added === 1 && sink1.ok && sink2.ok;
    rec({ actor: "wrong_email", action: "rejected_audit_written" }, "allow", gotAudit ? "allow" : "deny",
      { notes: `sink1=${sink1.ok} sink2=${sink2.ok} added=${added}` });
    if (gotAudit) {
      const lastPayload = JSON.stringify(rows[rows.length - 1].payload);
      const leaks = lastPayload.includes(U.wrong_email.email) || lastPayload.includes(U.correct_email.email);
      rec({ actor: "wrong_email", action: "audit_no_email_leak" }, "allow", leaks ? "deny" : "allow");
    }
    // Sink must be inaccessible to authenticated callers.
    const denied = await rpc(TK.wrong_email.token, "record_tenant_invitation_rejection", {
      _invitation_id: inv.id, _actor_id: U.wrong_email.id, _reason_code: "TENANT_INVITATION_EMAIL_MISMATCH",
    });
    rec({ actor: "wrong_email", action: "rejection_sink_not_public" }, "deny",
      denied.ok ? "allow" : "deny", { http: denied.http, notes: "record_tenant_invitation_rejection revoked from authenticated" });
  }

  // 3. Unconfirmed email — flip email_confirmed_at to null via SQL if reachable
  {
    // SEC.4: source of truth is the guarded RPC's return value.
    const unconfirmed = unc.ok;
    if (!unconfirmed) {
      rec({ actor: "unconfirmed", action: "unconfirm_setup" }, "allow", "environmental",
        { notes: unc.reason || "guarded unconfirm RPC did not report success" });
    } else {
      rec({ actor: "unconfirmed", action: "unconfirm_setup" }, "allow", "allow",
        { notes: "email_confirmed_at nulled via guarded _test_unconfirm_auth_email RPC" });
    }
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.unconfirmed.email, role: "member", invitedBy: U.owner_a.id });
    if (TK.unconfirmed?.token) {
      const res = await rpc(TK.unconfirmed.token, "accept_tenant_invitation", { _token_hash: inv.hash });
      const expected = unconfirmed ? "deny" : "allow-or-deny";
      const actual = res.ok ? "allow" : "deny";
      rec({ actor: "unconfirmed", action: "accept", tenant: "A", invState: "pending" },
        unconfirmed ? "deny" : actual, actual,
        { http: res.http, stable: res.stable, notes: `unconfirmed=${unconfirmed}` });
      if (unconfirmed) {
        const m = await admin.from("tenant_members").select("id").eq("tenant_id", tA).eq("user_id", U.unconfirmed.id).maybeSingle();
        rec({ actor: "unconfirmed", action: "no_membership_after_unconfirmed" }, "allow", m.data ? "deny" : "allow");
      }
    } else {
      rec({ actor: "unconfirmed", action: "signin" }, "allow", "environmental",
        { notes: TK.unconfirmed?.error || "no token" });
    }
  }

  // 4. Expired
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.correct_email.email, role: "member", ttlMs: -1000, invitedBy: U.owner_a.id });
    const res = await rpc(TK.correct_email.token, "accept_tenant_invitation", { _token_hash: inv.hash });
    rec({ actor: "correct_email", action: "accept", tenant: "A", invState: "expired" }, "deny",
      res.ok ? "allow" : "deny", { http: res.http, stable: res.stable });
  }

  // 5. Revoked
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.correct_email.email, role: "member", invitedBy: U.owner_a.id });
    await admin.from("tenant_invitations").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", inv.id);
    const res = await rpc(TK.correct_email.token, "accept_tenant_invitation", { _token_hash: inv.hash });
    rec({ actor: "correct_email", action: "accept", tenant: "A", invState: "revoked" }, "deny",
      res.ok ? "allow" : "deny", { http: res.http, stable: res.stable });
  }

  // 6. Concurrent accept
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.concurrent.email, role: "member", invitedBy: U.owner_a.id });
    const [r1, r2] = await Promise.all([
      rpc(TK.concurrent.token, "accept_tenant_invitation", { _token_hash: inv.hash }),
      rpc(TK.concurrent.token, "accept_tenant_invitation", { _token_hash: inv.hash }),
    ]);
    const okCount = [r1, r2].filter((r) => r.ok).length;
    const deniedStable = [r1, r2].find((r) => !r.ok)?.stable;
    // Membership count
    const m = await admin.from("tenant_members").select("id").eq("tenant_id", tA).eq("user_id", U.concurrent.id);
    rec({ actor: "concurrent", action: "concurrent_accept_single_membership" }, "allow",
      (m.data?.length || 0) === 1 ? "allow" : "deny",
      { notes: `ok=${okCount} deniedStable=${deniedStable} members=${m.data?.length}` });
    // At most one success accepted-audit event (via_invitation)
    const aud = await admin.from("audit_events").select("id").eq("aggregate_id", inv.id).eq("event_type", "tenant.member_added");
    rec({ actor: "concurrent", action: "concurrent_no_duplicate_success_audit" }, "allow",
      (aud.data?.length || 0) <= 1 ? "allow" : "deny", { notes: `success_audit_count=${aud.data?.length}` });
  }

  // 7. Existing active member
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.existing_active.email, role: "guest", invitedBy: U.owner_a.id });
    const res = await rpc(TK.existing_active.token, "accept_tenant_invitation", { _token_hash: inv.hash });
    const m = await admin.from("tenant_members").select("*").eq("tenant_id", tA).eq("user_id", U.existing_active.id);
    // Contract: idempotent; single membership row, role may be updated to invitation role.
    rec({ actor: "existing_active", action: "accept_existing_member_single_row" }, "allow",
      (m.data?.length || 0) === 1 ? "allow" : "deny",
      { http: res.http, stable: res.stable, notes: `role_after=${m.data?.[0]?.role}` });
  }

  // 8. Suspended member — DEFECT check: current RPC ON CONFLICT reactivates.
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.suspended_a.email, role: "member", invitedBy: U.owner_a.id });
    const res = await rpc(TK.suspended_a.token, "accept_tenant_invitation", { _token_hash: inv.hash });
    const m = await admin.from("tenant_members").select("status").eq("tenant_id", tA).eq("user_id", U.suspended_a.id).single();
    const reactivated = m.data?.status === "active";
    rec({ actor: "suspended_a", action: "accept_suspended_no_bypass" }, "deny",
      reactivated ? "allow" : "deny",
      { http: res.http, stable: res.stable,
        notes: reactivated ? "DEFECT: invitation acceptance silently reactivated suspended member" : "kept suspended" });
  }

  // 9. Removed member (no prior row)
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.removed_a.email, role: "member", invitedBy: U.owner_a.id });
    const res = await rpc(TK.removed_a.token, "accept_tenant_invitation", { _token_hash: inv.hash });
    const m = await admin.from("tenant_members").select("id,status").eq("tenant_id", tA).eq("user_id", U.removed_a.id);
    rec({ actor: "removed_a", action: "accept_removed_becomes_member" }, "allow",
      res.ok && m.data?.length === 1 ? "allow" : "deny", { http: res.http, stable: res.stable });
  }

  // ---------- Role allowlist (create) ----------
  for (const badRole of ["platform_admin", "workspace_admin", "unknown_role", ""]) {
    const token = mkToken();
    const res = await rpc(TK.owner_a.token, "create_tenant_invitation", {
      _tenant_id: tA, _email: `${TAG}bad_${badRole || "empty"}@uniwork.test`, _role: badRole,
      _token_hash: sha256(token), _expires_at: new Date(Date.now() + 60000).toISOString(),
    });
    rec({ actor: "owner_a", action: "create_role_allowlist", tenant: "A", role: badRole || "(empty)" },
      "deny", res.ok ? "allow" : "deny", { http: res.http, stable: res.stable });
  }

  // ---------- REVOKE matrix ----------
  async function seedPending() {
    return seedInvitationDirect({ tenantId: tA, email: `${TAG}rvk_${randomBytes(3).toString("hex")}@uniwork.test`, role: "member", invitedBy: U.owner_a.id });
  }
  {
    const inv = await seedPending();
    const res = await rpc(TK.owner_a.token, "revoke_tenant_invitation", { _invitation_id: inv.id });
    rec({ actor: "owner_a", action: "revoke", tenant: "A" }, "allow", res.ok ? "allow" : "deny", { http: res.http, stable: res.stable });
  }
  {
    const inv = await seedPending();
    const res = await rpc(TK.admin_a.token, "revoke_tenant_invitation", { _invitation_id: inv.id });
    rec({ actor: "admin_a", action: "revoke", tenant: "A" }, "allow", res.ok ? "allow" : "deny", { http: res.http, stable: res.stable });
  }
  for (const actor of ["member_a", "guest_a", "outsider", "owner_b"]) {
    const inv = await seedPending();
    const res = await rpc(TK[actor].token, "revoke_tenant_invitation", { _invitation_id: inv.id });
    rec({ actor, action: "revoke", tenant: "A" }, "deny", res.ok ? "allow" : "deny", { http: res.http, stable: res.stable });
  }
  // Revoke already-accepted
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.correct_email.email, role: "member", invitedBy: U.owner_a.id });
    await admin.from("tenant_invitations").update({ status: "accepted", accepted_by: U.correct_email.id, accepted_at: new Date().toISOString() }).eq("id", inv.id);
    const res = await rpc(TK.owner_a.token, "revoke_tenant_invitation", { _invitation_id: inv.id });
    rec({ actor: "owner_a", action: "revoke_accepted", tenant: "A" }, "deny", res.ok ? "allow" : "deny", { http: res.http, stable: res.stable });
  }
  // Repeated revoke
  {
    const inv = await seedPending();
    const r1 = await rpc(TK.owner_a.token, "revoke_tenant_invitation", { _invitation_id: inv.id });
    const r2 = await rpc(TK.owner_a.token, "revoke_tenant_invitation", { _invitation_id: inv.id });
    rec({ actor: "owner_a", action: "revoke_repeat", tenant: "A" }, "deny",
      r2.ok ? "allow" : "deny", { http: r2.http, stable: r2.stable, notes: `first=${r1.ok}` });
  }

  // ---------- Cross-tenant protection ----------
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.cross_tenant.email, role: "member", invitedBy: U.owner_a.id });
    // Owner B revoke A: deny
    const rB = await rpc(TK.owner_b.token, "revoke_tenant_invitation", { _invitation_id: inv.id });
    rec({ actor: "owner_b", action: "cross_tenant_revoke", tenant: "A" }, "deny",
      rB.ok ? "allow" : "deny", { http: rB.http, stable: rB.stable });
    // Accept token A: should only create A membership, not B
    const acc = await rpc(TK.cross_tenant.token, "accept_tenant_invitation", { _token_hash: inv.hash });
    const mA = await admin.from("tenant_members").select("id").eq("tenant_id", tA).eq("user_id", U.cross_tenant.id).maybeSingle();
    const mB = await admin.from("tenant_members").select("id").eq("tenant_id", tB).eq("user_id", U.cross_tenant.id).maybeSingle();
    rec({ actor: "cross_tenant", action: "cross_tenant_scoped_membership" }, "allow",
      acc.ok && mA.data && !mB.data ? "allow" : "deny",
      { notes: `A=${!!mA.data} B=${!!mB.data}` });
    // User B listing A invitations must not see this row
    const list = await fetch(`${URL_}/rest/v1/tenant_invitations?tenant_id=eq.${tA}&select=id`, {
      headers: { apikey: ANON, Authorization: `Bearer ${TK.member_b.token}` },
    });
    const rows = list.ok ? await list.json() : [];
    rec({ actor: "member_b", action: "cross_tenant_list_invitations", tenant: "A" }, "deny",
      rows.length > 0 ? "allow" : "deny", { notes: `rows=${rows.length}` });
  }

  // ---------- Outbox redaction ----------
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: `${TAG}outbox@uniwork.test`, role: "member", invitedBy: U.owner_a.id });
    // Create via RPC path so outbox row is emitted with proper payload
    const token = mkToken();
    const res = await rpc(TK.owner_a.token, "create_tenant_invitation", {
      _tenant_id: tA, _email: `${TAG}outbox_rpc@uniwork.test`, _role: "member",
      _token_hash: sha256(token), _expires_at: new Date(Date.now() + 60000).toISOString(),
    });
    if (res.ok) {
      const ob = await admin.from("outbox_events").select("payload,event_type").eq("aggregate_id", res.json.id);
      const payloadStr = JSON.stringify(ob.data || []);
      const leaks = payloadStr.includes(token) || payloadStr.includes(sha256(token));
      rec({ actor: "system", action: "outbox_no_token" }, "allow", leaks ? "deny" : "allow",
        { notes: `events=${ob.data?.length}` });
    }
    void inv;
  }

  // ---------- Anonymous ----------
  {
    const inv = await seedInvitationDirect({ tenantId: tA, email: U.correct_email.email, role: "member", invitedBy: U.owner_a.id });
    const res = await rpc(null, "accept_tenant_invitation", { _token_hash: inv.hash });
    rec({ actor: "anonymous", action: "accept", tenant: "A", invState: "pending" }, "deny",
      res.ok ? "allow" : "deny", { http: res.http, stable: res.stable });
  }

  // ---------- Write artifacts ----------
  const fixture = {
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    tenants: { A: tA, B: tB },
    users: Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.id])),
  };
  writeFileSync(join(OUT, "sec3-invitation-fixture.json"), JSON.stringify(fixture, null, 2));
  writeFileSync(join(OUT, "sec3-invitation-matrix.json"), JSON.stringify(results, null, 2));
  writeFileSync(join(OUT, "sec3-invitation-failures.json"), JSON.stringify(results.filter((r) => !r.pass), null, 2));
  const md = [
    `# SEC.3 Invitation Lifecycle Runtime Matrix`, ``,
    `Run: ${RUN_ID}`,
    `Total: ${results.length}. Passed: ${results.filter((r) => r.pass).length}. Failed: ${results.filter((r) => !r.pass).length}.`, ``,
    `| Cell | Actor | Tenant | Action | InvState | Expected | Actual | HTTP | Stable | Pass | Notes |`,
    `|---|---|---|---|---|---|---|---|---|---|---|`,
    ...results.map((r) => `| ${r.id} | ${r.actor} | ${r.tenant ?? ""} | ${r.action} | ${r.invState ?? ""} | ${r.expected} | ${r.actual} | ${r.http ?? ""} | ${r.stable ?? ""} | ${r.pass ? "✅" : "❌"} | ${(r.notes || "").replace(/\|/g, "/")} |`),
  ].join("\n");
  writeFileSync(join(OUT, "sec3-invitation-matrix.md"), md);
  console.log(`[sec3] ${results.filter((r) => !r.pass).length} FAIL / ${results.length}`);
}

// ---------- Teardown ----------
async function teardown(fixturePath) {
  if (!existsSync(fixturePath)) return;
  const fx = JSON.parse((await import("node:fs")).readFileSync(fixturePath, "utf-8"));
  // Best-effort: remove invitations we created for the tenants
  await admin.from("tenant_invitations").delete().in("tenant_id", [fx.tenants.A, fx.tenants.B]);
  // NOTE: audit_events immutable; tenants kept for FK safety across runs.
  console.log("[sec3] teardown: invitations deleted");
}

const args = process.argv.slice(2);
if (args.includes("--teardown")) {
  teardown(join(OUT, "sec3-invitation-fixture.json")).catch((e) => { console.error(e); process.exit(2); });
} else {
  run().then(async () => {
    // Always attempt teardown of transient invitation rows.
    await teardown(join(OUT, "sec3-invitation-fixture.json")).catch(() => {});
    const fails = results.filter((r) => !r.pass).length;
    process.exit(fails ? 1 : 0);
  }).catch((e) => { console.error("[sec3] FATAL", e?.message ?? e); console.error(e?.stack ?? ""); process.exit(2); });
}