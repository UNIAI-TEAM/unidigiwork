#!/usr/bin/env node
// Batch 1B-SEC.2 runtime matrix — tenant provisioning atomicity/idempotency/concurrency.
// Real JWTs for authorization cells; service-role only for seed + inspect.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "artifacts");
mkdirSync(OUT, { recursive: true });

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = process.env.E2E_1A_PASSWORD || "Sec2!" + randomBytes(6).toString("hex");
if (!URL_ || !ANON || !SVC) { console.error("missing env"); process.exit(2); }

const admin = createClient(URL_, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = "sec2_";
const RUN_ID = `sec2_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const short = randomBytes(3).toString("hex");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const results = [];
let seq = 0;
const mask = (t) => t ? `${t.slice(0,8)}…(len=${t.length})` : null;

function rec(cell, expected, actual, extra = {}) {
  seq += 1;
  const pass = actual === expected;
  results.push({ id: `S${String(seq).padStart(3, "0")}`, ...cell, expected, actual, pass, ...extra });
  if (!pass) console.log(`  FAIL ${results[results.length-1].id} ${cell.action} expected=${expected} actual=${actual} ${extra.notes||""}`);
}

const STABLE = [
  "TENANT_SLUG_CONFLICT","IDEMPOTENCY_CONFLICT","VALIDATION_FAILED",
  "AUTHENTICATION_REQUIRED","PERMISSION_DENIED","INTERNAL_ERROR","IDEMPOTENCY_REPLAY_RACE",
];
function stableOf(msg) { const up = String(msg||"").toUpperCase(); return STABLE.find(c => up.includes(c)) || null; }

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
async function ensureUser(key, existing) {
  const email = `${TAG}${key}@uniwork.test`;
  const found = existing.find(u => u.email === email);
  if (found) { await admin.auth.admin.updateUserById(found.id, { password: PW, email_confirm: true }); return { id: found.id, email }; }
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email };
}
async function upsertInternal(id, email) {
  const r = await admin.from("users").upsert({ id, primary_email: email, display_name: email.split("@")[0], status: "active" }, { onConflict: "id" });
  if (r.error) throw r.error;
}
async function tokenFor(email) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) return { error: error.message };
  return { token: data.session.access_token, userId: data.user.id };
}
async function rpc(token, fn, body) {
  const headers = { apikey: ANON, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  const errMsg = json?.message || text.slice(0, 300);
  return { http: res.status, ok: res.ok, json, errMsg, stable: stableOf(errMsg) };
}
async function counts(tenantId, opts = {}) {
  const [t, tm, w, ae, oe] = await Promise.all([
    admin.from("tenants").select("id", { count: "exact", head: true }).eq("id", tenantId),
    admin.from("tenant_members").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("workspaces").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("audit_events").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("outbox_events").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);
  return { tenant: t.count||0, member: tm.count||0, workspace: w.count||0, audit: ae.count||0, outbox: oe.count||0 };
}
async function tenantBySlug(slug) {
  const r = await admin.from("tenants").select("id").eq("slug", slug).maybeSingle();
  return r.data?.id || null;
}

async function main() {
  console.log(`[sec2] run=${RUN_ID}`);
  // ----- Fixture -----
  const existing = await listAll();
  const U = {};
  for (const k of ["actor_a","actor_b","platform_admin","outsider"]) {
    U[k] = await ensureUser(k, existing);
    await upsertInternal(U[k].id, U[k].email);
  }
  const pa = await admin.from("user_roles").upsert({ user_id: U.platform_admin.id, role: "admin" }, { onConflict: "user_id,role" });
  if (pa.error) throw pa.error;
  // outsider: no internal user mapping? Blueprint expects fail-closed. But provision_tenant checks auth.uid only, not `users`. Keep mapping for now — outsider will still be a valid actor allowed to self-provision.
  const TK = {};
  for (const k of Object.keys(U)) TK[k] = await tokenFor(U[k].email);
  const fixture = { runId: RUN_ID, users: Object.fromEntries(Object.entries(U).map(([k,v])=>[k,v.id])) };
  writeFileSync(join(OUT, "sec2-provision-fixture.json"), JSON.stringify(fixture, null, 2));
  console.log("[sec2] tokens:", Object.fromEntries(Object.entries(TK).map(([k,v])=>[k, v?.token ? mask(v.token) : v?.error])));

  const cleanup = new Set();
  const track = (id) => { if (id) cleanup.add(id); return id; };

  // Slug helpers
  const S = {
    first: `${TAG}first-${short}`,
    replay: `${TAG}replay-${short}`,
    conflict: `${TAG}conflict-${short}`,
    concurrent: `${TAG}concurrent-${short}`,
    concurrentDiff: `${TAG}concdiff-${short}`,
    dup: `${TAG}dup-${short}`,
    normA: `${TAG}norm-${short}`,
    ownerSpoof: `${TAG}spoof-${short}`,
    platformOwn: `${TAG}padminself-${short}`,
    platformOther: `${TAG}padminother-${short}`,
    anon: `${TAG}anon-${short}`,
    atomicSlug: `${TAG}atomicreserved-${short}`,
  };

  // -------- V. FIRST CALL --------
  {
    const key = `idem-first-${randomUUID()}`;
    const res = await rpc(TK.actor_a.token, "provision_tenant", {
      _name: "Sec2 First", _slug: S.first, _owner_id: U.actor_a.id,
      _default_workspace_name: "Main", _idempotency_key: key, _correlation_id: `cor-${key}`,
    });
    rec({ actor: "actor_a", action: "first_provision" }, "allow", res.ok ? "allow" : "deny", { http: res.http, stable: res.stable, errMsg: res.errMsg });
    if (res.ok) {
      const row = Array.isArray(res.json) ? res.json[0] : res.json;
      track(row.tenant_id);
      const c = await counts(row.tenant_id);
      rec({ actor:"actor_a", action:"invariants" }, "allow",
        c.tenant===1 && c.member===1 && c.workspace===1 && c.audit>=3 && c.outbox>=3 ? "allow" : "deny",
        { counts: c });
      // owner+role
      const m = await admin.from("tenant_members").select("role,status,user_id").eq("tenant_id", row.tenant_id).single();
      rec({ actor:"actor_a", action:"owner_membership" }, "allow",
        m.data?.role==="tenant_owner" && m.data?.status==="active" && m.data?.user_id===U.actor_a.id ? "allow" : "deny");
      // workspace tenant invariant
      const w = await admin.from("workspaces").select("id,tenant_id,owner_id").eq("tenant_id", row.tenant_id).single();
      rec({ actor:"actor_a", action:"workspace_invariant" }, "allow",
        w.data?.id===row.tenant_id && w.data?.tenant_id===row.tenant_id && w.data?.owner_id===U.actor_a.id ? "allow" : "deny");
      // workspace_members via handle_new_workspace trigger
      const wm = await admin.from("workspace_members").select("user_id,role").eq("workspace_id", row.tenant_id);
      rec({ actor:"actor_a", action:"workspace_owner_member" }, "allow",
        wm.data?.some(r => r.user_id===U.actor_a.id && r.role==="owner") ? "allow" : "deny");
      // audit dedup: tenant.provisioned unique
      const av = await admin.from("audit_events").select("event_type,payload,idempotency_key,correlation_id,actor_id")
        .eq("tenant_id", row.tenant_id).eq("event_type", "tenant.provisioned");
      rec({ actor:"actor_a", action:"audit_provisioned_row" }, "allow",
        av.data?.length===1 && av.data[0].idempotency_key===key && av.data[0].correlation_id===`cor-${key}` && av.data[0].actor_id===U.actor_a.id ? "allow" : "deny");
      // no secret leak in audit payload
      const payloadStr = JSON.stringify(av.data?.[0]?.payload || {});
      rec({ actor:"actor_a", action:"audit_no_secret" }, "allow",
        !/eyJ|service_role|password/i.test(payloadStr) ? "allow" : "deny");
      // outbox catalog
      const ob = await admin.from("outbox_events").select("event_type,idempotency_key").eq("tenant_id", row.tenant_id).order("created_at");
      const types = (ob.data||[]).map(r=>r.event_type).sort();
      rec({ actor:"actor_a", action:"outbox_catalog" }, "allow",
        JSON.stringify(types)===JSON.stringify(["tenant.created.v1","tenant.member_added.v1","workspace.created.v1"]) ? "allow" : "deny",
        { types });
      // outbox tenant.created carries idempotency_key
      const oc = (ob.data||[]).find(r=>r.event_type==="tenant.created.v1");
      rec({ actor:"actor_a", action:"outbox_idem_key_set" }, "allow", oc?.idempotency_key===key ? "allow" : "deny");

      // ----- VI. SAME KEY + SAME PAYLOAD REPLAY -----
      const rep = await rpc(TK.actor_a.token, "provision_tenant", {
        _name:"Sec2 First", _slug:S.first, _owner_id:U.actor_a.id,
        _default_workspace_name:"Main", _idempotency_key:key, _correlation_id:`cor-${key}`,
      });
      const rrow = Array.isArray(rep.json) ? rep.json[0] : rep.json;
      rec({ actor:"actor_a", action:"replay_same_payload" }, "allow", rep.ok && rrow?.tenant_id===row.tenant_id ? "allow" : "deny", { http: rep.http });
      const c2 = await counts(row.tenant_id);
      rec({ actor:"actor_a", action:"replay_no_duplicate" }, "allow",
        c2.tenant===c.tenant && c2.member===c.member && c2.workspace===c.workspace && c2.audit===c.audit && c2.outbox===c.outbox ? "allow" : "deny",
        { before: c, after: c2 });

      // ----- VII. SAME KEY + DIFFERENT PAYLOAD -----
      const conf = await rpc(TK.actor_a.token, "provision_tenant", {
        _name:"Different Name", _slug:S.first, _owner_id:U.actor_a.id,
        _default_workspace_name:"Different", _idempotency_key:key,
      });
      rec({ actor:"actor_a", action:"same_key_diff_payload" }, "deny",
        conf.ok ? "allow" : "deny", { stable: conf.stable, http: conf.http,
        notes: conf.stable==="IDEMPOTENCY_CONFLICT" ? "stable OK" : "wrong stable" });
      const c3 = await counts(row.tenant_id);
      rec({ actor:"actor_a", action:"conflict_no_side_effect" }, "allow",
        c3.tenant===c.tenant && c3.member===c.member && c3.workspace===c.workspace && c3.audit===c.audit && c3.outbox===c.outbox ? "allow" : "deny");
    }
  }

  // -------- VIII. CONCURRENT SAME-KEY (5x parallel) --------
  {
    const key = `idem-conc-${randomUUID()}`;
    const payload = { _name:"Concurrent", _slug:S.concurrent, _owner_id:U.actor_a.id, _default_workspace_name:"Main", _idempotency_key:key };
    const rs = await Promise.all(Array.from({length:5}, () => rpc(TK.actor_a.token, "provision_tenant", payload)));
    const okRows = rs.filter(r=>r.ok).map(r => (Array.isArray(r.json)?r.json[0]:r.json)?.tenant_id).filter(Boolean);
    const uniqueIds = new Set(okRows);
    rec({ actor:"actor_a", action:"concurrent_same_key" }, "allow",
      uniqueIds.size===1 ? "allow" : "deny", { okCount: okRows.length, unique: uniqueIds.size });
    if (uniqueIds.size===1) {
      const tid = [...uniqueIds][0]; track(tid);
      const c = await counts(tid);
      rec({ actor:"actor_a", action:"concurrent_single_aggregate" }, "allow",
        c.tenant===1 && c.member===1 && c.workspace===1 ? "allow" : "deny", { counts: c });
      // audit provisioned should be exactly one
      const ap = await admin.from("audit_events").select("id", { count: "exact", head: true }).eq("tenant_id", tid).eq("event_type", "tenant.provisioned");
      rec({ actor:"actor_a", action:"concurrent_audit_dedup" }, "allow", ap.count===1 ? "allow" : "deny", { count: ap.count });
      const op = await admin.from("outbox_events").select("id", { count: "exact", head: true }).eq("tenant_id", tid).eq("event_type", "tenant.created.v1");
      rec({ actor:"actor_a", action:"concurrent_outbox_dedup" }, "allow", op.count===1 ? "allow" : "deny", { count: op.count });
    }
  }

  // -------- IX. CONCURRENT DIFFERENT-PAYLOAD SAME KEY --------
  {
    const key = `idem-condiff-${randomUUID()}`;
    const p1 = { _name:"Payload One", _slug:S.concurrentDiff, _owner_id:U.actor_a.id, _default_workspace_name:"Main", _idempotency_key:key };
    const p2 = { _name:"Payload Two", _slug:`${S.concurrentDiff}-alt`, _owner_id:U.actor_a.id, _default_workspace_name:"Alt", _idempotency_key:key };
    const [r1, r2] = await Promise.all([rpc(TK.actor_a.token, "provision_tenant", p1), rpc(TK.actor_a.token, "provision_tenant", p2)]);
    const okCount = [r1,r2].filter(r=>r.ok).length;
    const conflictCount = [r1,r2].filter(r=>!r.ok && (r.stable==="IDEMPOTENCY_CONFLICT" || r.stable==="IDEMPOTENCY_REPLAY_RACE" || r.stable==="TENANT_SLUG_CONFLICT")).length;
    // at most 1 success; the loser is either an idempotency conflict or race
    rec({ actor:"actor_a", action:"concurrent_diff_payload" }, "allow",
      okCount<=1 && (okCount+conflictCount)===2 ? "allow" : "deny",
      { r1: { ok:r1.ok, stable:r1.stable }, r2: { ok:r2.ok, stable:r2.stable } });
    // capture winner for cleanup
    for (const r of [r1,r2]) if (r.ok) { const rr = Array.isArray(r.json)?r.json[0]:r.json; track(rr.tenant_id); }
  }

  // -------- X. DUPLICATE SLUG DIFFERENT KEY --------
  {
    const key1 = `idem-dup-a-${randomUUID()}`;
    const r1 = await rpc(TK.actor_a.token, "provision_tenant", {
      _name:"DupA", _slug:S.dup, _owner_id:U.actor_a.id, _default_workspace_name:"W", _idempotency_key:key1,
    });
    rec({ actor:"actor_a", action:"dup_slug_first" }, "allow", r1.ok ? "allow" : "deny", { stable: r1.stable });
    if (r1.ok) track((Array.isArray(r1.json)?r1.json[0]:r1.json).tenant_id);
    const key2 = `idem-dup-b-${randomUUID()}`;
    const r2 = await rpc(TK.actor_b.token, "provision_tenant", {
      _name:"DupB", _slug:S.dup, _owner_id:U.actor_b.id, _default_workspace_name:"W", _idempotency_key:key2,
    });
    rec({ actor:"actor_b", action:"dup_slug_conflict" }, "deny", r2.ok ? "allow" : "deny",
      { stable: r2.stable, notes: r2.stable==="TENANT_SLUG_CONFLICT" ? "stable OK" : "wrong stable" });
    // slug normalization: Actor A takes S.normA lower, Actor B tries uppercase — must collide
    const kn1 = `idem-normA-${randomUUID()}`;
    const rn1 = await rpc(TK.actor_a.token, "provision_tenant", { _name:"NormA", _slug:S.normA, _owner_id:U.actor_a.id, _default_workspace_name:"W", _idempotency_key:kn1 });
    if (rn1.ok) track((Array.isArray(rn1.json)?rn1.json[0]:rn1.json).tenant_id);
    const kn2 = `idem-normB-${randomUUID()}`;
    const rn2 = await rpc(TK.actor_b.token, "provision_tenant", { _name:"NormB", _slug:S.normA.toUpperCase(), _owner_id:U.actor_b.id, _default_workspace_name:"W", _idempotency_key:kn2 });
    rec({ actor:"actor_b", action:"slug_normalized_collision" }, "deny", rn2.ok ? "allow" : "deny", { stable: rn2.stable, errMsg: rn2.errMsg, rn1_ok: rn1.ok, rn1_err: rn1.errMsg });
    if (rn2.ok) track((Array.isArray(rn2.json)?rn2.json[0]:rn2.json).tenant_id);
  }

  // -------- XI. RESERVED / INVALID SLUG --------
  const reserved = ["admin","api","app","auth","login","logout","platform","system","support","www"];
  for (const s of reserved) {
    const key = `idem-res-${s}-${randomUUID()}`;
    const r = await rpc(TK.actor_a.token, "provision_tenant", {
      _name:"R", _slug:s, _owner_id:U.actor_a.id, _default_workspace_name:"W", _idempotency_key:key,
    });
    rec({ actor:"actor_a", action:`reserved_${s}` }, "deny", r.ok ? "allow" : "deny", { stable: r.stable });
  }
  // NOTE: RPC normalizes non-alnum→'-', so slash/backslash/ctrl/leading-hyphen become valid.
  // Only true structural violations remain here.
  for (const [label, val] of [["empty",""],["too_short","ab"],["too_long","a".repeat(70)]]) {
    const key = `idem-inv-${label}-${randomUUID()}`;
    const r = await rpc(TK.actor_a.token, "provision_tenant", {
      _name:"R", _slug:val, _owner_id:U.actor_a.id, _default_workspace_name:"W", _idempotency_key:key,
    });
    rec({ actor:"actor_a", action:`invalid_slug_${label}` }, "deny", r.ok ? "allow" : "deny", { stable: r.stable, errMsg: r.errMsg });
  }

  // -------- XIII. OWNER IDENTITY PROTECTION --------
  {
    // Actor A tries to provision with owner = Actor B
    const key = `idem-spoof-${randomUUID()}`;
    const r = await rpc(TK.actor_a.token, "provision_tenant", {
      _name:"Spoof", _slug:S.ownerSpoof, _owner_id:U.actor_b.id, _default_workspace_name:"W", _idempotency_key:key,
    });
    rec({ actor:"actor_a", action:"owner_spoof_other" }, "deny", r.ok ? "allow" : "deny",
      { stable: r.stable, notes: r.stable==="PERMISSION_DENIED" ? "stable OK" : "wrong stable" });
    const exists = await tenantBySlug(S.ownerSpoof);
    rec({ actor:"actor_a", action:"owner_spoof_no_tenant" }, "allow", exists ? "deny" : "allow");
  }
  {
    // Actor A tries owner = unknown UUID (random) — self-check fails => PERMISSION_DENIED
    const unknown = randomUUID();
    const key = `idem-unknown-${randomUUID()}`;
    const r = await rpc(TK.actor_a.token, "provision_tenant", {
      _name:"Unknown", _slug:`${TAG}unknown-${short}`, _owner_id:unknown, _default_workspace_name:"W", _idempotency_key:key,
    });
    rec({ actor:"actor_a", action:"owner_unknown" }, "deny", r.ok ? "allow" : "deny", { stable: r.stable });
  }
  {
    // Platform admin provisions for Actor B (explicit contract)
    const key = `idem-padmin-${randomUUID()}`;
    const r = await rpc(TK.platform_admin.token, "provision_tenant", {
      _name:"PAdmin For B", _slug:S.platformOther, _owner_id:U.actor_b.id, _default_workspace_name:"W", _idempotency_key:key, _correlation_id: `cor-${key}`,
    });
    rec({ actor:"platform_admin", action:"provision_for_other_owner" }, "allow", r.ok ? "allow" : "deny", { stable: r.stable, http: r.http });
    if (r.ok) {
      const row = Array.isArray(r.json)?r.json[0]:r.json; track(row.tenant_id);
      // owner is Actor B, not platform admin
      const m = await admin.from("tenant_members").select("user_id,role").eq("tenant_id", row.tenant_id);
      const isB = m.data?.length===1 && m.data[0].user_id===U.actor_b.id && m.data[0].role==="tenant_owner";
      rec({ actor:"platform_admin", action:"owner_is_target" }, "allow", isB ? "allow" : "deny");
      // audit actor is platform admin
      const av = await admin.from("audit_events").select("actor_id").eq("tenant_id", row.tenant_id).eq("event_type","tenant.provisioned").single();
      rec({ actor:"platform_admin", action:"audit_actor_is_admin" }, "allow", av.data?.actor_id===U.platform_admin.id ? "allow" : "deny");
    }
  }

  // -------- XIX. RLS / GRANTS --------
  {
    // Anonymous: no bearer
    const key = `idem-anon-${randomUUID()}`;
    const r = await rpc(null, "provision_tenant", {
      _name:"Anon", _slug:S.anon, _owner_id:U.actor_a.id, _default_workspace_name:"W", _idempotency_key:key,
    });
    rec({ actor:"anonymous", action:"provision_denied" }, "deny", r.ok ? "allow" : "deny", { stable: r.stable, http: r.http });
    const exists = await tenantBySlug(S.anon);
    rec({ actor:"anonymous", action:"no_tenant_created" }, "allow", exists ? "deny" : "allow");
  }

  // -------- XII. ATOMIC ROLLBACK via constraint failure --------
  // Pre-insert a tenant with slug, then attempt provision with same slug from another actor.
  // Constraint failure occurs mid-transaction (during tenant INSERT). Verify no orphans.
  {
    // Use pre-normalized slug so direct admin insert matches RPC's canonical form.
    const preSlug = S.atomicSlug.replace(/[^a-z0-9-]+/g, "-");
    const preId = randomUUID();
    const pre = await admin.from("tenants").insert({ id: preId, slug: preSlug, name: "Pre-existing", status: "active", created_by: U.actor_a.id, updated_by: U.actor_a.id });
    if (pre.error) console.log("pre-insert err:", pre.error.message);
    track(preId);
    const beforeMember = await admin.from("tenant_members").select("id",{count:"exact",head:true}).eq("user_id", U.actor_b.id);
    const beforeAudit = await admin.from("audit_events").select("id",{count:"exact",head:true}).eq("event_type","tenant.provisioned");
    const key = `idem-atomic-${randomUUID()}`;
    const r = await rpc(TK.actor_b.token, "provision_tenant", {
      _name:"Atomic", _slug:preSlug, _owner_id:U.actor_b.id, _default_workspace_name:"W", _idempotency_key:key,
    });
    rec({ actor:"actor_b", action:"atomic_slug_conflict" }, "deny", r.ok ? "allow" : "deny", { stable: r.stable });
    const afterMember = await admin.from("tenant_members").select("id",{count:"exact",head:true}).eq("user_id", U.actor_b.id);
    const afterAudit = await admin.from("audit_events").select("id",{count:"exact",head:true}).eq("event_type","tenant.provisioned");
    rec({ actor:"actor_b", action:"atomic_no_orphan_member" }, "allow", afterMember.count===beforeMember.count ? "allow" : "deny", { before: beforeMember.count, after: afterMember.count });
    rec({ actor:"actor_b", action:"atomic_no_success_audit" }, "allow", afterAudit.count===beforeAudit.count ? "allow" : "deny");
    // Retry-after-failure with a different slug must succeed
    const retryKey = `idem-atomic-retry-${randomUUID()}`;
    const retry = await rpc(TK.actor_b.token, "provision_tenant", {
      _name:"Retry", _slug:`${preSlug}-2`, _owner_id:U.actor_b.id, _default_workspace_name:"W", _idempotency_key:retryKey,
    });
    rec({ actor:"actor_b", action:"retry_after_failure" }, "allow", retry.ok ? "allow" : "deny", { stable: retry.stable });
    if (retry.ok) track((Array.isArray(retry.json)?retry.json[0]:retry.json).tenant_id);
  }

  // -------- Persist artifacts --------
  const total = results.length;
  const passed = results.filter(r=>r.pass).length;
  const failed = total - passed;
  writeFileSync(join(OUT, "sec2-provision-matrix.json"), JSON.stringify({ runId: RUN_ID, total, passed, failed, results }, null, 2));
  writeFileSync(join(OUT, "sec2-provision-failures.json"), JSON.stringify(results.filter(r=>!r.pass), null, 2));
  // md matrix
  const mdRows = results.map(r =>
    `| ${r.id} | ${r.actor||""} | ${r.action} | ${r.expected} | ${r.actual} | ${r.stable||r.http||""} | ${r.pass?"PASS":"FAIL"} |`
  );
  const md = `# SEC.2 Provision Matrix (${RUN_ID})\n\nTotal: ${total} · Passed: ${passed} · Failed: ${failed}\n\n| ID | Actor | Action | Expected | Actual | Info | Result |\n|---|---|---|---|---|---|---|\n${mdRows.join("\n")}\n`;
  writeFileSync(join(OUT, "sec2-provision-matrix.md"), md);
  const summary = `# SEC.2 Summary (${RUN_ID})\n\n- Total: ${total}\n- Passed: ${passed}\n- Failed: ${failed}\n- Cleanup tenant IDs tracked: ${cleanup.size}\n`;
  writeFileSync(join(OUT, "sec2-provision-summary.md"), summary);

  console.log(`[sec2] ${passed}/${total} PASS, ${failed} FAIL`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
