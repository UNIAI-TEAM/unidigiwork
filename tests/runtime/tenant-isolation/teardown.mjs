#!/usr/bin/env node
// Batch 1A-R teardown. Prefers exact IDs from artifacts/fixture.json.
// Falls back to prefix-based cleanup ONLY for e2e_1a_ named rows.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOW = process.env.E2E_1A_ALLOW_URL;
if (!URL || !SVC || !ALLOW || !URL.startsWith(ALLOW)) {
  console.error("[teardown] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / E2E_1A_ALLOW_URL");
  process.exit(2);
}
const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const P = "e2e_1a_";

const fpath = join(HERE, "artifacts", "fixture.json");
let fx = null;
if (existsSync(fpath)) fx = JSON.parse(readFileSync(fpath, "utf8"));

// Delete leaf resources by ID first (respect FK order)
if (fx) {
  for (const label of ["A", "B"]) {
    const r = fx.resources?.[label] ?? {};
    if (r.messageId) await admin.from("email_states").delete().eq("message_id", r.messageId);
    if (r.messageId) await admin.from("email_messages").delete().eq("id", r.messageId);
    if (r.threadId) await admin.from("email_threads").delete().eq("id", r.threadId);
    if (r.docId) await admin.from("documents").delete().eq("id", r.docId);
    if (r.notifId) await admin.from("notifications").delete().eq("id", r.notifId);
  }
}
// Prefix cleanup for any probe rows created during matrix (limited to fixture-tagged names)
await admin.from("documents").delete().like("title", `${P}%`);
await admin.from("email_messages").delete().like("subject", `${P}%`);
await admin.from("email_threads").delete().like("subject", `${P}%`);
await admin.from("notifications").delete().like("title", `${P}%`);
await admin.from("outbox_events").delete().like("idempotency_key", `${P}%`);

// Workspaces (which cascade delete workspace_members). Tenant rows cascade tenant_members.
if (fx) {
  for (const label of ["A", "B"]) {
    const wsId = fx.tenants?.[label]?.workspaceId;
    if (wsId) {
      await admin.from("workspaces").delete().eq("id", wsId);
      // tenant.id == workspace.id via CHECK — delete tenant too
      await admin.from("tenants").delete().eq("id", wsId);
    }
  }
}
await admin.from("workspaces").delete().like("name", `${P}%`);

// Auth users
const emails = new Set();
for (let page = 1; page <= 10; page++) {
  const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (!data?.users?.length) break;
  for (const u of data.users) if (u.email?.startsWith(P)) emails.add(u.id);
  if (data.users.length < 200) break;
}
for (const id of emails) {
  try { await admin.auth.admin.deleteUser(id); } catch (e) { console.warn("[teardown] user", id, e?.message); }
}
console.log(`[teardown] deleted ${emails.size} auth users, cleaned fixture.`);