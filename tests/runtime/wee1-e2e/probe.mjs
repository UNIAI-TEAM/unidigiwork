// WEE-1 RUNTIME E2E PROOF — real user JWT → real server functions → real AI Gateway.
// Không gọi RPC nội bộ để "giả lập thành công": mọi bước đi qua endpoint mà UI dùng.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { toJSONAsync } from "seroval";

// Bộ giải mã tối giản cho payload seroval mà server function trả về.
const SEROVAL_CONST = { 0: null, 1: undefined, 2: true, 3: false, 4: NaN, 5: Infinity, 6: -Infinity, 7: -0 };
function decode(node, refs = new Map()) {
  if (node == null || typeof node !== "object") return node;
  const t = node.t;
  if (t === 4) return refs.get(node.i);
  if (t === 1) return node.s;
  if (t === 0 || t === 3) return typeof node.s === "number" ? node.s : Number(node.s);
  if (t === 2) return SEROVAL_CONST[node.s] ?? null;
  if (t === 5) return node.s;
  if (t === 9) {
    const arr = [];
    if (node.i != null) refs.set(node.i, arr);
    for (const item of node.a ?? []) arr.push(item == null ? null : decode(item, refs));
    return arr;
  }
  if (t === 10 || t === 11 || t === 8) {
    const obj = {};
    if (node.i != null) refs.set(node.i, obj);
    const k = node.p?.k ?? [], v = node.p?.v ?? [];
    k.forEach((key, idx) => { obj[key] = decode(v[idx], refs); });
    if (node.f != null) obj.__wrapped = decode(node.f, refs);
    return obj;
  }
  if (t === 13 || t === 14) return { __error: true, message: node.s, ...(node.p ? decode({ t: 10, p: node.p }, refs) : {}) };
  return node.s ?? null;
}

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.WEE1_BASE_URL || "http://localhost:8080";
const TOKEN_MAIN = process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN;
const TENANT = process.env.WEE1_TENANT;
const WS = process.env.WEE1_WS;
const OUT = process.env.WEE1_OUT || "/mnt/documents/wee1";
const run = randomUUID().slice(0, 8);
mkdirSync(OUT, { recursive: true });

const results = [];
const rec = (id, name, status, detail) => {
  results.push({ id, name, status, detail: typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 600) });
  console.log(`${status.padEnd(6)} ${id} ${name} :: ${String(typeof detail === "string" ? detail : JSON.stringify(detail) ?? "").slice(0, 300)}`);
};

const fnId = (file, exportName) =>
  Buffer.from(JSON.stringify({ file: `/src/lib/api/${file}?tss-serverfn-split`, export: `${exportName}_createServerFn_handler` })).toString("base64url");

async function call(file, exportName, data, { method = "POST", token = TOKEN_MAIN, tenant = TENANT } = {}) {
  const t0 = Date.now();
  const id = fnId(file, exportName);
  const encoded = JSON.stringify(await toJSONAsync({ data }));
  const qs = method === "GET" ? `?payload=${encodeURIComponent(encoded)}` : "";
  const r = await fetch(`${BASE}/_serverFn/${id}${qs}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-tsr-serverFn": "true",
      cookie: tenant ? `uniwork_active_tenant=${tenant}` : "",
    },
    body: method === "GET" ? undefined : encoded,
  });
  const txt = await r.text();
  let body;
  try { body = decode(JSON.parse(txt)); } catch { try { body = JSON.parse(txt); } catch { body = txt.slice(0, 500); } }
  return { status: r.status, ms: Date.now() - t0, body };
}

const denied = (r) => r.status !== 200 || Boolean(r.body && typeof r.body === "object" && r.body.error);
const errMsg = (r) => JSON.stringify(r.body?.error ?? r.body)?.slice(0, 180);
const unwrap = (b) => (b && typeof b === "object" && "result" in b ? (b.result ?? b.error) : b);
const slug = (s) => s.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 30);
const admin = createClient(URL_, SVC, { auth: { persistSession: false } });

// ---------- 1. SEED REAL CONTEXT ----------
const seeded = {};
const nowIso = new Date().toISOString();
const past = new Date(Date.now() - 3 * 864e5).toISOString();

async function createTask(title, description, priority, dueAt) {
  const res = await call("tasks.functions.ts", "createTask", {
    workspaceId: WS, title, description, priority,
    ...(dueAt ? { dueAt } : {}),
    idempotencyKey: `wee1-${run}-${slug(title)}`,
  });
  const row = unwrap(res.body);
  const r = Array.isArray(row) ? row[0] : row;
  return { status: res.status, id: r?.id, raw: r ?? res.body };
}

const ctxTasks = [];
for (const spec of [
  ["Hoàn thiện tài liệu kiến trúc Q3", "Rà soát blueprint và cập nhật sơ đồ bounded context.", "high", past],
  ["Chuẩn hoá quy trình duyệt chi phí", "Xây dựng luồng duyệt 2 cấp cho chi phí vận hành.", "normal", null],
  ["Khắc phục lỗi đồng bộ email", "Đang bị chặn do chờ cấu hình domain.", "urgent", past],
]) {
  const t = await createTask(...spec);
  ctxTasks.push(t);
  rec("SEED-TASK", `create_task ${spec[0]}`, t.id ? "PASS" : "FAIL", `${t.status} ${JSON.stringify(t.raw)?.slice(0,300)}`);
}
// blocked item
if (ctxTasks[2]?.id) {
  const tr = await call("tasks.functions.ts", "transitionTask", {
    taskId: ctxTasks[2].id, toStatus: "blocked", idempotencyKey: `wee1-${run}-block`,
  });
  rec("SEED-BLOCK", "transition_task blocked", tr.status === 200 ? "PASS" : "FAIL", tr.status);
}
const doc = await call("documents.functions.ts", "createDocument", {
  workspaceId: WS, title: `Biên bản quyết định kiến trúc tuần ${run}`, folder: "Decisions",
  tags: ["decision", "architecture"], sizeBytes: 0, idempotencyKey: `wee1-${run}-doc`,
});
rec("SEED-DOC", "create_document", doc.status === 200 ? "PASS" : "FAIL", doc.status);
const meet = await call("meetings.functions.ts", "scheduleMeeting", {
  workspaceId: WS, title: `Weekly Project Sync ${run}`,
  startAt: new Date(Date.now() + 864e5).toISOString(), endAt: new Date(Date.now() + 864e5 + 36e5).toISOString(),
  agenda: "Rà soát tiến độ, rủi ro, hạng mục quá hạn.", timezone: "Asia/Ho_Chi_Minh",
  idempotencyKey: `wee1-${run}-meet`,
});
rec("SEED-MEET", "schedule_meeting", meet.status === 200 ? "PASS" : "FAIL", meet.status);

// ---------- 2. TEST TASK ----------
const main = await createTask(
  `Prepare Weekly Project Intelligence ${run}`,
  "Tổng hợp báo cáo tình báo dự án tuần: tiến độ, rủi ro, hạng mục quá hạn/bị chặn, quyết định và cuộc họp liên quan.",
  "high", null,
);
rec("TASK-01", "test task created", main.id ? "PASS" : "FAIL", main.id ?? main.raw);
if (!main.id) { writeFileSync(`${OUT}/wee1-e2e-${run}.json`, JSON.stringify({ results }, null, 2)); process.exit(1); }
seeded.taskId = main.id;

// ---------- 3. PRECONDITIONS ----------
const workers = await call("ai-tasks.functions.ts", "listAiWorkers", { tenantId: TENANT });
const workerList = unwrap(workers.body) ?? [];
const worker = Array.isArray(workerList) ? workerList[0] : null;
rec("PRE-WORKER", "list_ai_workers", worker ? "PASS" : "FAIL", worker ? { id: worker.id, name: worker.name, tools: worker.allowed_tools ?? worker.skills } : workers.body);
if (!worker) { writeFileSync(`${OUT}/wee1-e2e-${run}.json`, JSON.stringify({ results }, null, 2)); process.exit(1); }
seeded.aiWorkerId = worker.id;

const access = await call("ai-tasks.functions.ts", "getAiTaskAccess", { taskId: main.id }, { method: "GET" });
rec("PRE-ACCESS", "ai task access", unwrap(access.body)?.canManage ? "PASS" : "FAIL", unwrap(access.body));

const assign = await call("ai-tasks.functions.ts", "assignTaskToAi", {
  taskId: main.id, aiWorkerId: worker.id,
  expectedDeliverable: "Báo cáo Project Intelligence tuần: tóm tắt điều hành, tiến độ, rủi ro, hạng mục quá hạn/bị chặn, đề xuất hành động.",
  acceptanceCriteria: "Có đủ 5 mục; mỗi nhận định phải trích nguồn từ dữ liệu workspace thật; không bịa dữ liệu.",
  idempotencyKey: `wee1-${run}-assign`,
});
rec("PRE-ASSIGN", "assign_task_to_ai", assign.status === 200 ? "PASS" : "FAIL", assign.status === 200 ? "assigned" : assign.body);

// ---------- 4. RUN (real AI Gateway) ----------
const t0 = Date.now();
const runRes = await call("ai-tasks.functions.ts", "runAiTask", { taskId: main.id, templateCode: "SUMMARY_REPORT" });
const exec1 = unwrap(runRes.body);
rec("RUN-01", "runAiTask", runRes.status === 200 && exec1?.id ? "PASS" : "FAIL",
  runRes.status === 200 ? { id: exec1.id, status: exec1.status, revision: exec1.revision, ms: runRes.ms } : runRes.body);
if (!exec1?.id) { writeFileSync(`${OUT}/wee1-e2e-${run}.json`, JSON.stringify({ results }, null, 2)); process.exit(1); }
seeded.executionId = exec1.id;
seeded.runMs = Date.now() - t0;

const steps1 = unwrap((await call("ai-tasks.functions.ts", "listWorkExecutionSteps", { executionId: exec1.id }, { method: "GET" })).body) ?? [];
rec("STEP-01", "work_execution_steps order", Array.isArray(steps1) && steps1.length >= 5 ? "PASS" : "FAIL",
  (steps1 || []).map((s) => `${s.seq}:${s.kind}=${s.status}`).join(" | "));

const tl1 = unwrap((await call("ai-tasks.functions.ts", "exportWorkExecutionTimeline", { executionId: exec1.id }, { method: "GET" })).body);
writeFileSync(`${OUT}/wee1-timeline-rev1-${run}.json`, JSON.stringify(tl1, null, 2));
rec("EXPORT-01", "timeline export rev1", tl1?.timeline ? "PASS" : "FAIL", tl1?.golden?.fingerprint ?? "n/a");

// "hard reload" tương đương: đọc lại từ đầu bằng request mới, không cache
const reload1 = unwrap((await call("ai-tasks.functions.ts", "listAiTaskExecutions", { taskId: main.id }, { method: "GET" })).body) ?? [];
rec("RELOAD-01", "persist after run", reload1[0]?.status === exec1.status ? "PASS" : "FAIL", reload1[0]?.status);

// ---------- 5. NEGATIVE: AI/self-accept & forged ids ----------
const forged = randomUUID();
const forgedExec = await call("ai-tasks.functions.ts", "acceptAiTaskExecution", { executionId: forged, completeTask: false, idempotencyKey: `wee1-${run}-forge` });
rec("NEG-FORGED-EXEC", "accept forged execution_id", denied(forgedExec) ? "PASS" : "FAIL", `${forgedExec.status} ${errMsg(forgedExec)}`);
const forgedSteps = unwrap((await call("ai-tasks.functions.ts", "listWorkExecutionSteps", { executionId: forged }, { method: "GET" })).body);
rec("NEG-FORGED-STEP", "read forged execution steps", Array.isArray(forgedSteps) && forgedSteps.length === 0 ? "PASS" : "FAIL", JSON.stringify(forgedSteps)?.slice(0, 120));
const forgedTask = await call("ai-tasks.functions.ts", "runAiTask", { taskId: forged });
rec("NEG-FORGED-TASK", "run forged task_id", denied(forgedTask) ? "PASS" : "FAIL", `${forgedTask.status} ${errMsg(forgedTask)}`);
const anonRun = await call("ai-tasks.functions.ts", "runAiTask", { taskId: main.id }, { token: "invalid.jwt.token" });
rec("NEG-NOAUTH", "run without valid auth", denied(anonRun) ? "PASS" : "FAIL", `${anonRun.status} ${errMsg(anonRun)}`);

// foreign tenant user
const fEmail = `wee1_foreign_${run}@example.com`;
const fPass = `Wee1!${run}Aa`;
const { data: fu } = await admin.auth.admin.createUser({ email: fEmail, password: fPass, email_confirm: true });
const anonC = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: fs } = await anonC.auth.signInWithPassword({ email: fEmail, password: fPass });
const fToken = fs?.session?.access_token;
if (fToken) {
  await anonC.rpc("provision_tenant", { _name: `wee1f_${run}`, _slug: `wee1f-${run}`, _owner_id: fu.user.id, _default_workspace_name: "General", _idempotency_key: `wee1f-${run}` });
  const fExec = unwrap((await call("ai-tasks.functions.ts", "listAiTaskExecutions", { taskId: main.id }, { method: "GET", token: fToken, tenant: null })).body);
  rec("NEG-XTENANT-EXEC", "foreign tenant reads executions", Array.isArray(fExec) && fExec.length === 0 ? "PASS" : "FAIL", JSON.stringify(fExec)?.slice(0, 160));
  const fSteps = unwrap((await call("ai-tasks.functions.ts", "listWorkExecutionSteps", { executionId: exec1.id }, { method: "GET", token: fToken, tenant: null })).body);
  rec("NEG-XTENANT-STEP", "foreign tenant reads steps", Array.isArray(fSteps) && fSteps.length === 0 ? "PASS" : "FAIL", JSON.stringify(fSteps)?.slice(0, 160));
  const fAccept = await call("ai-tasks.functions.ts", "acceptAiTaskExecution", { executionId: exec1.id, completeTask: true, idempotencyKey: `wee1-${run}-fa` }, { token: fToken, tenant: null });
  rec("NEG-XTENANT-ACCEPT", "foreign tenant accepts", denied(fAccept) ? "PASS" : "FAIL", `${fAccept.status} ${errMsg(fAccept)}`);
  const fAccess = unwrap((await call("ai-tasks.functions.ts", "getAiTaskAccess", { taskId: main.id }, { method: "GET", token: fToken, tenant: null })).body);
  rec("NEG-XTENANT-ACCESS", "foreign tenant access flags", fAccess && !fAccess.canView ? "PASS" : "FAIL", fAccess);
  seeded.foreignUserId = fu.user.id;
}

// ---------- 6. REQUEST CHANGES → revision N+1 ----------
const rc = await call("ai-tasks.functions.ts", "requestAiTaskChanges", { executionId: exec1.id, feedback: "Bổ sung mục rủi ro theo mức độ và nêu rõ hạng mục quá hạn kèm chủ sở hữu." });
rec("REVIEW-CHANGES", "request_ai_execution_changes", rc.status === 200 ? "PASS" : "FAIL", unwrap(rc.body)?.status ?? rc.body);
const run2 = await call("ai-tasks.functions.ts", "runAiTask", { taskId: main.id, templateCode: "SUMMARY_REPORT" });
const exec2 = unwrap(run2.body);
rec("RUN-02", "revision N+1 execution", exec2?.id && exec2.id !== exec1.id ? "PASS" : "FAIL", exec2 ? { id: exec2.id, revision: exec2.revision, status: exec2.status } : run2.body);
if (exec2?.id) {
  seeded.execution2Id = exec2.id;
  const steps2 = unwrap((await call("ai-tasks.functions.ts", "listWorkExecutionSteps", { executionId: exec2.id }, { method: "GET" })).body) ?? [];
  rec("STEP-02", "rev2 steps", steps2.length >= 5 ? "PASS" : "FAIL", steps2.map((s) => `${s.seq}:${s.kind}=${s.status}`).join(" | "));
  const tl2 = unwrap((await call("ai-tasks.functions.ts", "exportWorkExecutionTimeline", { executionId: exec2.id }, { method: "GET" })).body);
  writeFileSync(`${OUT}/wee1-timeline-rev2-${run}.json`, JSON.stringify(tl2, null, 2));
}

// ---------- 7. ACCEPT (human) + idempotency ----------
const target = exec2?.id ?? exec1.id;
const acc1 = await call("ai-tasks.functions.ts", "acceptAiTaskExecution", { executionId: target, completeTask: true, idempotencyKey: `wee1-${run}-accept` });
rec("ACCEPT-01", "human accept", !denied(acc1) && unwrap(acc1.body)?.status === "ACCEPTED" ? "PASS" : "FAIL", unwrap(acc1.body)?.status ?? errMsg(acc1));
const acc2 = await call("ai-tasks.functions.ts", "acceptAiTaskExecution", { executionId: target, completeTask: true, idempotencyKey: `wee1-${run}-accept` });
rec("IDEMPOTENT-ACCEPT", "duplicate accept", !denied(acc2) && unwrap(acc2.body)?.status === "ACCEPTED" ? "PASS" : "FAIL", `${acc2.status} ${JSON.stringify(unwrap(acc2.body))?.slice(0, 160)}`);
const runAfterAccept = await call("ai-tasks.functions.ts", "runAiTask", { taskId: main.id });
rec("POST-ACCEPT-RUN", "run after accept", denied(runAfterAccept) ? "PASS" : "FAIL", JSON.stringify(unwrap(runAfterAccept.body))?.slice(0, 200));

const finalTask = await admin.from("tasks").select("status, ai_execution_status").eq("id", main.id).maybeSingle();
rec("TASK-FINAL", "task state after accept", finalTask.data?.status === "done" ? "PASS" : "FAIL", finalTask.data);

// ---------- 8. FAILURE TEST: gateway with invalid key ----------
try {
  const bad = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", "Lovable-API-Key": "invalid-key-for-failure-test", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: "openai/gpt-5.6-sol", input: "ping", stream: true }),
  });
  rec("FAIL-GATEWAY", "gateway rejects invalid key", bad.status === 401 || bad.status === 403 ? "PASS" : "WARN", bad.status);
} catch (e) { rec("FAIL-GATEWAY", "gateway invalid key", "WARN", String(e).slice(0, 120)); }

const finalExecs = unwrap((await call("ai-tasks.functions.ts", "listAiTaskExecutions", { taskId: main.id }, { method: "GET" })).body) ?? [];
writeFileSync(`${OUT}/wee1-e2e-${run}.json`, JSON.stringify({ run, seeded, results, executions: finalExecs }, null, 2));
console.log("\nRUN_ID", run, JSON.stringify(seeded));
