// PRODUCT REALITY AUDIT — runtime probe: real user JWT → real server functions.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_PUBLISHABLE_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.AUDIT_BASE_URL || "http://localhost:8080";
const PW = process.env.AUDIT_PASSWORD;
if (!PW) { console.error("missing AUDIT_PASSWORD"); process.exit(2); }
const admin = createClient(URL_, SVC, { auth: { persistSession: false } });
const run = randomUUID().slice(0, 8);
const results = [];
const rec = (id, domain, name, status, detail) => { results.push({ id, domain, name, status, detail }); console.log(`${status.padEnd(6)} ${id} ${name} :: ${String(detail ?? "").slice(0, 220)}`); };

const fnId = (file, exportName) => Buffer.from(JSON.stringify({ file: `/src/lib/api/${file}?tss-serverfn-split`, export: `${exportName}_createServerFn_handler` })).toString("base64url");
let TOKEN = null, TENANT = null;
async function call(file, exportName, data, method = "POST") {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/_serverFn/${fnId(file, exportName)}`, {
    method, headers: {
      "content-type": "application/json", authorization: `Bearer ${TOKEN}`,
      "x-tss-serialized": "true", cookie: TENANT ? `uniwork_active_tenant=${TENANT}` : "",
    },
    body: method === "GET" ? undefined : JSON.stringify({ data }),
  });
  const txt = await r.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt.slice(0, 400); }
  return { status: r.status, ms: Date.now() - t0, body };
}

async function ensureUser(email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const f = (data?.users ?? []).find((u) => u.email === email);
  if (f) { await admin.auth.admin.updateUserById(f.id, { password: PW, email_confirm: true }); return f.id; }
  const { data: c, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error; return c.user.id;
}

const email = `audit_${run}_owner@example.com`;
const uid = await ensureUser(email);
const anonC = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: sess, error: se } = await anonC.auth.signInWithPassword({ email, password: PW });
if (se) { console.error(se.message); process.exit(1); }
TOKEN = sess.session.access_token;
rec("AUTH-01", "identity", "sign_in_password", "PASS", `uid=${uid}`);

const { data: prov, error: pe } = await anonC.rpc("provision_tenant", {
  _name: `audit_${run}`, _slug: `audit-${run}`, _owner_id: uid,
  _default_workspace_name: `audit_${run}_ws`, _idempotency_key: `audit-${run}`,
});
if (pe) { rec("TEN-01", "identity", "provision_tenant", "FAIL", pe.message); process.exit(1); }
const prow = Array.isArray(prov) ? prov[0] : prov;
TENANT = prow.tenant_id; const WS = prow.workspace_id;
rec("TEN-01", "identity", "provision_tenant", "PASS", `tenant=${TENANT} ws=${WS}`);

// ---- seed real work via RPC (user JWT) ----
const { data: taskId, error: te } = await anonC.rpc("create_task", {
  _workspace_id: WS, _title: `Audit task ${run}`, _description: "Kiểm toán runtime: tổng hợp tiến độ dự án.",
  _priority: "high", _idempotency_key: `audit-task-${run}`,
});
te ? rec("TASK-C", "tasks", "create_task", "FAIL", te.message) : rec("TASK-C", "tasks", "create_task", "PASS", String(taskId));
const TASK = Array.isArray(taskId) ? taskId[0] : taskId;

// ---- server function probes ----
const probes = [
  ["HOME-01", "home", "home.functions.ts", "getHomeSummary", {}, "POST"],
  ["SRCH-01", "search", "search-universal.functions.ts", "searchUniversal", { query: "audit", limit: 10 }, "POST"],
  ["GRAPH-01", "work-graph", "work-graph.functions.ts", "getWorkContext", { entityType: "task", entityId: TASK }, "POST"],
  ["AICTX-01", "ai-context", "ai-context.functions.ts", "buildAiContext", { query: "Công việc nào đang trễ hạn?" }, "POST"],
  ["COP-01", "ai-copilot", "ai-copilot.functions.ts", "askUniCopilot", { query: "Tôi đang có bao nhiêu công việc chưa hoàn thành?" }, "POST"],
  ["AIW-01", "ai-workforce", "ai-tasks.functions.ts", "listAiWorkers", { workspaceId: WS }, "POST"],
  ["NOTI-01", "notifications", "notifications.functions.ts", "listNotifications", { limit: 10 }, "POST"],
  ["DASH-01", "dashboard", "dashboard.functions.ts", "getDashboardSummary", {}, "POST"],
];
for (const [id, domain, file, exp, data, method] of probes) {
  try {
    const r = await call(file, exp, data, method);
    const ok = r.status === 200;
    rec(id, domain, exp, ok ? "PASS" : "FAIL", `http=${r.status} ms=${r.ms} ${JSON.stringify(r.body).slice(0, 300)}`);
  } catch (e) { rec(id, domain, exp, "ERROR", String(e.message)); }
}
writeFileSync(new URL("./artifacts/probe.json", import.meta.url), JSON.stringify({ run, tenant: TENANT, workspace: WS, task: TASK, results }, null, 2));
console.log(`\nrun=${run} tenant=${TENANT} ws=${WS} task=${TASK}`);
