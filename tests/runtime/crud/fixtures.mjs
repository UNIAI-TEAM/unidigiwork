// Shared fixture bootstrap for the CRUD reality runtime suite.
// Creates namespaced tenants/actors via service role; actors act with real JWTs.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export const TAG = "crud_e2e_";
const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOW = process.env.CRUD_E2E_ALLOW_URL;
const PW = process.env.CRUD_E2E_PASSWORD;

export function guardEnv() {
  const missing = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRUD_E2E_PASSWORD", "CRUD_E2E_ALLOW_URL"].filter((k) => !process.env[k]);
  if (missing.length) { console.error(`[crud] BLOCKED_BY_TRUSTED_RUNTIME missing env: ${missing.join(", ")}`); process.exit(3); }
  if (!URL.startsWith(ALLOW)) { console.error("[crud] refusing: CRUD_E2E_ALLOW_URL must prefix SUPABASE_URL"); process.exit(2); }
}

export const admin = () => createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

export async function actorClient(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { client: c, userId: data.user.id };
}

export async function ensureUser(a, email) {
  const { data } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = (data?.users ?? []).find((u) => u.email === email);
  if (found) { await a.auth.admin.updateUserById(found.id, { password: PW, email_confirm: true }); return found.id; }
  const { data: created, error } = await a.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  return created.user.id;
}

export async function bootstrap(runId) {
  const a = admin();
  const ids = { runId, users: {}, tenants: {}, workspaces: {}, records: [] };
  for (const key of ["owner_a", "member_a", "owner_b", "outsider"]) {
    ids.users[key] = await ensureUser(a, `${TAG}${runId}_${key}@example.com`);
  }
  for (const [tk, owner] of [["A", "owner_a"], ["B", "owner_b"]]) {
    const wsId = randomUUID();
    const { error } = await a.from("workspaces").insert({
      id: wsId, name: `${TAG}${runId}_ws_${tk}`, slug: `${TAG}${runId}-ws-${tk}`.toLowerCase(), owner_id: ids.users[owner],
    });
    if (error) throw new Error(`workspace ${tk}: ${error.message}`);
    ids.workspaces[tk] = wsId;
    ids.tenants[tk] = wsId; // workspace.id === tenant.id invariant (Batch 0B)
  }
  // member_a joins tenant A
  await a.from("tenant_members").insert({ tenant_id: ids.tenants.A, user_id: ids.users.member_a, role: "member", status: "active" });
  await a.from("workspace_members").insert({ workspace_id: ids.workspaces.A, user_id: ids.users.member_a, role: "member" });
  return ids;
}

export async function teardown(ids) {
  const a = admin();
  const tenantIds = Object.values(ids.tenants);
  for (const t of tenantIds) {
    try { await a.rpc("_test_purge_tenant", { _tenant_id: t }); } catch { /* fallback below */ }
  }
  const orphans = [];
  for (const t of tenantIds) {
    const { count } = await a.from("workspaces").select("id", { count: "exact", head: true }).eq("id", t);
    if (count) orphans.push(t);
  }
  for (const uid of Object.values(ids.users)) {
    const { error } = await a.auth.admin.deleteUser(uid);
    if (error) orphans.push(uid);
  }
  return orphans;
}
