#!/usr/bin/env node
// Delete all e2e_1a_* fixture rows + auth users. Safe re-run.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOW = process.env.E2E_1A_ALLOW_URL;
if (!URL || !SVC || !ALLOW || !URL.startsWith(ALLOW)) {
  console.error("[teardown] set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_1A_ALLOW_URL");
  process.exit(2);
}
const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

const TABLES = [
  ["notifications", "title"], ["email_states", null],
  ["email_messages", "subject"], ["email_threads", "subject"],
  ["documents", "title"], ["workspaces", "name"],
  ["tenant_members", null], ["tenants", "slug"],
];
for (const [t, col] of TABLES) {
  if (col) await admin.from(t).delete().like(col, "e2e_1a_%");
}
const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
for (const u of list.users) {
  if (u.email?.startsWith("e2e_1a_")) await admin.auth.admin.deleteUser(u.id);
}
console.log("[teardown] done");