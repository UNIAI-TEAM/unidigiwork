// WORK PRODUCT TAMPER — RUNTIME E2E PROOF
// Mọi kịch bản tamper đều đi qua API THẬT (HTTP /_serverFn + PostgREST) với JWT thật,
// để chứng minh fail-closed từ request đến response. Không gọi hàm nội bộ.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { toJSONAsync } from "seroval";

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
const BASE = process.env.WPT_BASE_URL || "http://localhost:8080";
const TOKEN_MAIN = process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN;
const TENANT = process.env.WPT_TENANT;
const WS = process.env.WPT_WS;
const TASK = process.env.WPT_TASK; // task đã gán nhân sự AI
const OUT = process.env.WPT_OUT || "/mnt/documents/wp-tamper";
const run = randomUUID().slice(0, 8);
mkdirSync(OUT, { recursive: true });

const results = [];
const rec = (id, name, status, detail) => {
  results.push({ id, name, status, detail: typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 600) });
  console.log(`${status.padEnd(6)} ${id} ${name} :: ${String(typeof detail === "string" ? detail : JSON.stringify(detail) ?? "").slice(0, 240)}`);
};

const fnId = (file, exportName) =>
  Buffer.from(JSON.stringify({ file: `/src/lib/api/${file}?tss-serverfn-split`, export: `${exportName}_createServerFn_handler` })).toString("base64url");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Lỗi hạ tầng (dev-server đang biên dịch lại) KHÔNG được tính là "bị chặn":
// nếu không phân biệt, một 500 hạ tầng sẽ làm test âm tính giả xanh.
const isInfra = (b) => typeof b === "string" && (b.includes("<!doctype") || b.includes("Invalid server function ID"));

async function callOnce(file, exportName, data, { method = "POST", token = TOKEN_MAIN, tenant = TENANT } = {}) {
  const encoded = JSON.stringify(await toJSONAsync({ data }));
  const qs = method === "GET" ? `?payload=${encodeURIComponent(encoded)}` : "";
  const r = await fetch(`${BASE}/_serverFn/${fnId(file, exportName)}${qs}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-tsr-serverFn": "true",
      cookie: tenant ? `uniwork_active_tenant=${tenant}` : "",
    },
    body: method === "GET" ? undefined : encoded,
  });
  const txt = await r.text();
  let body;
  try { body = decode(JSON.parse(txt)); } catch { try { body = JSON.parse(txt); } catch { body = txt.slice(0, 400); } }
  return { status: r.status, body };
}

async function call(file, exportName, data, opts) {
  let last;
  for (let i = 0; i < 5; i += 1) {
    last = await callOnce(file, exportName, data, opts);
    if (!isInfra(last.body)) return last;
    await sleep(800); // module đang được biên dịch lần đầu — thử lại
  }
  return { ...last, infra: true };
}

const unwrap = (b) => (b && typeof b === "object" && "result" in b ? (b.result ?? b.error) : b);
const denied = (r) =>
  !r.infra && !isInfra(r.body) &&
  (r.status !== 200 || Boolean(r.body && typeof r.body === "object" && (r.body.error || r.body.message)));
const errMsg = (r) => JSON.stringify(r.body?.error ?? r.body?.message ?? r.body)?.slice(0, 200);
const codes = (pf) => (pf?.issues ?? []).map((i) => i.code).join(",");

const admin = createClient(URL_, SVC, { auth: { persistSession: false } });

// ---------- Warmup: nạp module client để dev-server đăng ký ID server function ----------
for (const f of ["work-products.functions.ts", "ai-tasks.functions.ts"]) {
  const r = await fetch(`${BASE}/src/lib/api/${f}`);
  rec("WPT-WARM", `register server fn ids ${f}`, r.ok ? "PASS" : "FAIL", r.status);
}

// ---------- Warmup: buộc dev-server biên dịch các module server-fn trước khi đo ----------
for (const [f, e, m] of [
  ["work-products.functions.ts", "listWorkProducts", "GET"],
  ["ai-tasks.functions.ts", "listAiWorkers", "POST"],
]) {
  const w = await call(f, e, m === "GET" ? undefined : { tenantId: TENANT }, { method: m });
  rec("WPT-WARM", `warmup ${e}`, w.infra ? "FAIL" : "PASS", w.status);
}


// ---------- 0. Ảnh chụp hợp đồng trước khi tamper ----------
const before = (await admin.from("work_units").select("code, version, status, contract_hash").order("code")).data ?? [];
rec("WPT-00", "contract snapshot loaded", before.length > 0 ? "PASS" : "FAIL", before.map((r) => `${r.code}@${r.version}`).join(" | "));
const CODE = "WEEKLY_PROJECT_INTELLIGENCE";
const contractBefore = before.find((r) => r.code === CODE);

// ---------- 1. Baseline: hợp đồng hợp lệ phải đọc được ----------
const base = await call("work-products.functions.ts", "getWorkProduct", { code: CODE }, { method: "GET" });
const baseContract = unwrap(base.body);
rec("WPT-01", "baseline getWorkProduct", base.status === 200 && baseContract?.contractHash ? "PASS" : "FAIL",
  baseContract ? { code: baseContract.code, version: baseContract.version, status: baseContract.status } : base.body);

const basePre = unwrap((await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: {} })).body);
rec("WPT-02", "baseline preflight", basePre ? "PASS" : "FAIL", { ready: basePre?.ready, issues: codes(basePre) });

// ---------- 2. TAMPER: mã hợp đồng giả ----------
const fakeCode = await call("work-products.functions.ts", "preflightWorkProduct", { code: `${CODE}_HACKED`, taskId: TASK, inputs: {} });
const fakePre = unwrap(fakeCode.body);
rec("WPT-03", "tamper contract code", fakePre && fakePre.ready === false && codes(fakePre).includes("WORK_PRODUCT_NOT_FOUND") ? "PASS" : "FAIL",
  { ready: fakePre?.ready, issues: codes(fakePre) });

// ---------- 3. TAMPER: phiên bản hợp đồng không tồn tại ----------
const badVer = unwrap((await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, version: 999, taskId: TASK, inputs: {} })).body);
rec("WPT-04", "tamper contract version", badVer?.ready === false ? "PASS" : "FAIL", { ready: badVer?.ready, issues: codes(badVer) });

const badVerGet = unwrap((await call("work-products.functions.ts", "getWorkProduct", { code: CODE, version: 999 }, { method: "GET" })).body);
rec("WPT-05", "read non-existent version", badVerGet === null || badVerGet === undefined ? "PASS" : "FAIL", badVerGet);

// ---------- 4. TAMPER: đầu vào entity giả mạo / lệch tenant ----------
const forgedProject = randomUUID();
const forgedInput = unwrap((await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: { project_id: forgedProject } })).body);
rec("WPT-06", "forged entity input id", forgedInput?.ready === false ? "PASS" : "FAIL", { ready: forgedInput?.ready, issues: codes(forgedInput) });

const badUuid = await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: { project_id: "not-a-uuid" } });
const badUuidPre = unwrap(badUuid.body);
rec("WPT-07", "malformed uuid input", denied(badUuid) || badUuidPre?.ready === false ? "PASS" : "FAIL",
  badUuidPre ? { ready: badUuidPre.ready, issues: codes(badUuidPre) } : errMsg(badUuid));

const oversize = await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: { focus_area: "x".repeat(2000) } });
rec("WPT-08", "oversized input rejected at edge", denied(oversize) || unwrap(oversize.body)?.ready === false ? "PASS" : "FAIL", `${oversize.status} ${errMsg(oversize)}`);

// ---------- 5. TAMPER: taskId không thuộc quyền / giả mạo ----------
const forgedTask = unwrap((await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: randomUUID(), inputs: {} })).body);
rec("WPT-09", "forged taskId scope", forgedTask?.ready === false && codes(forgedTask).includes("UNAUTHORIZED_INPUT") ? "PASS" : "FAIL",
  { ready: forgedTask?.ready, issues: codes(forgedTask) });

// ---------- 6. TAMPER: không xác thực ----------
const noAuth = await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: {} }, { token: "invalid.jwt.token" });
rec("WPT-10", "preflight without valid auth", denied(noAuth) ? "PASS" : "FAIL", `${noAuth.status} ${errMsg(noAuth)}`);
const noAuthRun = await call("ai-tasks.functions.ts", "runAiTask", { taskId: TASK, templateCode: "SUMMARY_REPORT" }, { token: "invalid.jwt.token" });
rec("WPT-11", "runAiTask without valid auth", denied(noAuthRun) ? "PASS" : "FAIL", `${noAuthRun.status} ${errMsg(noAuthRun)}`);

// ---------- 7. TAMPER: template không có hợp đồng → fail-closed, KHÔNG chạy AI ----------
const tamperStartedAt = new Date().toISOString();
const execBefore = (await admin.from("ai_task_executions").select("id", { count: "exact", head: true }).eq("task_id", TASK)).count ?? 0;
const badTemplate = await call("ai-tasks.functions.ts", "runAiTask", { taskId: TASK, templateCode: "TEMPLATE_KHONG_TON_TAI" });
const execAfter = (await admin.from("ai_task_executions").select("id", { count: "exact", head: true }).eq("task_id", TASK)).count ?? 0;
rec("WPT-12", "unknown template fail-closed", denied(badTemplate) ? "PASS" : "FAIL", `${badTemplate.status} ${errMsg(badTemplate)}`);
rec("WPT-13", "no execution row created on tamper", execAfter <= execBefore ? "PASS" : "FAIL", `before=${execBefore} after=${execAfter}`);

// ---------- 7b. Hợp đồng lỗi của validator: mã ổn định + không rò rỉ nội bộ ----------
// Qua ranh giới RPC, hợp đồng lỗi hiển thị dưới dạng message có tiền tố mã ổn định.
const errText = (r) => {
  const flat = JSON.stringify(r.body ?? "");
  const m = /"s":"([^"]*)"/.exec(flat.replace(/\\"/g, "'"));
  return m ? m[1] : flat;
};
const errOf = (r) => {
  const txt = errText(r);
  const code = /^([A-Z_]+)(:|$)/.exec(txt)?.[1] ?? null;
  return { code, message: txt, raw: JSON.stringify(r.body ?? "") };
};
const badErr = errOf(badTemplate);
const badRaw = badErr.raw;
rec("WPT-12A", "validator returns stable error code VALIDATION_FAILED",
  badErr.code === "VALIDATION_FAILED" ? "PASS" : "FAIL", { code: badErr.code, message: badErr.message });
rec("WPT-12B", "error body names offending field + allowed template codes",
  badErr.message.includes("templateCode") && badErr.message.includes("allowed=") &&
  badErr.message.includes("SUMMARY_REPORT") ? "PASS" : "FAIL", badErr.message.slice(0, 240));
rec("WPT-12C", "error body leaks no stack/internals",
  !/(ZodError|Seroval|node_modules|\bat \/|\.ts:\d+)/.test(badRaw) ? "PASS" : "FAIL", badRaw.slice(0, 200));

// Các biến thể sai kiểu đều phải cùng một hợp đồng lỗi
for (const [i, bad] of [123, null, "", { code: "SUMMARY_REPORT" }, "summary_report"].entries()) {
  const r = await call("ai-tasks.functions.ts", "runAiTask", { taskId: TASK, templateCode: bad });
  const e = errOf(r);
  rec(`WPT-12D${i + 1}`, `invalid templateCode variant ${JSON.stringify(bad)}`,
    denied(r) && e.code === "VALIDATION_FAILED" ? "PASS" : "FAIL", `${r.status} ${errMsg(r)}`);
}

// taskId sai định dạng cũng dùng chung hợp đồng lỗi
const badTask = await call("ai-tasks.functions.ts", "runAiTask", { taskId: "not-a-uuid", templateCode: "SUMMARY_REPORT" });
rec("WPT-12E", "invalid taskId maps to VALIDATION_FAILED",
  denied(badTask) && errOf(badTask).code === "VALIDATION_FAILED" ? "PASS" : "FAIL", `${badTask.status} ${errMsg(badTask)}`);

// Không có lượt chạy nào và không có lời gọi model nào phát sinh từ các yêu cầu bị chặn
const execAfterAll = (await admin.from("ai_task_executions").select("id", { count: "exact", head: true }).eq("task_id", TASK)).count ?? 0;
rec("WPT-12F", "no execution created by any invalid-template request",
  execAfterAll <= execBefore ? "PASS" : "FAIL", `before=${execBefore} after=${execAfterAll}`);
const { count: usageAfter } = await admin
  .from("ai_usage_events")
  .select("id", { count: "exact", head: true })
  .gte("created_at", tamperStartedAt);
rec("WPT-12G", "no AI model call recorded while validator blocked",
  (usageAfter ?? 0) === 0 ? "PASS" : "FAIL", `usage_events_since_start=${usageAfter ?? 0}`);

// ---------- 8. TAMPER: gọi thẳng RPC ràng buộc hợp đồng bằng JWT người dùng ----------
async function rest(path, init) {
  const r = await fetch(`${URL_}${path}`, {
    ...init,
    headers: { apikey: ANON, authorization: `Bearer ${TOKEN_MAIN}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return { status: r.status, body: (await r.text()).slice(0, 300) };
}
const rpcBind = await rest("/rest/v1/rpc/bind_work_product_execution", {
  method: "POST",
  body: JSON.stringify({ _execution_id: randomUUID(), _code: CODE, _version: 1, _inputs: {} }),
});
rec("WPT-14", "direct bind RPC as user", rpcBind.status >= 400 ? "PASS" : "FAIL", `${rpcBind.status} ${rpcBind.body}`);

// ---------- 9. TAMPER: ghi đè hợp đồng qua Data API ----------
const patch = await rest(`/rest/v1/work_units?code=eq.${CODE}&version=eq.1`, {
  method: "PATCH",
  headers: { prefer: "return=representation" },
  body: JSON.stringify({ quality_contract: { minimumQualityScore: 0 }, status: "ACTIVE" }),
});
rec("WPT-15", "PATCH work_units as user", patch.status >= 400 || patch.body === "[]" ? "PASS" : "FAIL", `${patch.status} ${patch.body}`);
const insert = await rest("/rest/v1/work_units", {
  method: "POST",
  body: JSON.stringify({ code: `HACK_${run}`, version: 1, label: "hack", status: "ACTIVE", template_code: "SUMMARY_REPORT" }),
});
rec("WPT-16", "INSERT work_units as user", insert.status >= 400 ? "PASS" : "FAIL", `${insert.status} ${insert.body}`);
const del = await rest(`/rest/v1/work_units?code=eq.${CODE}`, { method: "DELETE", headers: { prefer: "return=representation" } });
rec("WPT-17", "DELETE work_units as user", del.status >= 400 || del.body === "[]" ? "PASS" : "FAIL", `${del.status} ${del.body}`);

let FOREIGN_TENANT = null;
let FOREIGN_WS = null;
let FOREIGN_TOKEN = null;
const noLeak = (r) => denied(r) || (Array.isArray(unwrap(r.body)) && unwrap(r.body).length === 0);

// ---------- 10. TAMPER: người dùng tenant khác ----------
const fEmail = `wpt_foreign_${run}@example.com`;
const fPass = `Wpt!${run}Aa`;
const { data: fu } = await admin.auth.admin.createUser({ email: fEmail, password: fPass, email_confirm: true });
const anonC = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: fs } = await anonC.auth.signInWithPassword({ email: fEmail, password: fPass });
const fToken = fs?.session?.access_token;
if (fToken) {
  const prov = await anonC.rpc("provision_tenant", { _name: `wpt_${run}`, _slug: `wpt-${run}`, _owner_id: fu.user.id, _default_workspace_name: "General", _idempotency_key: `wpt-${run}` });
  FOREIGN_TENANT = (prov?.data && (prov.data.tenant_id ?? prov.data?.[0]?.tenant_id)) ?? null;
  if (!FOREIGN_TENANT) {
    const { data: t } = await admin.from("tenants").select("id").eq("slug", `wpt-${run}`).maybeSingle();
    FOREIGN_TENANT = t?.id ?? null;
  }
  if (FOREIGN_TENANT) {
    const { data: w } = await admin.from("workspaces").select("id").eq("tenant_id", FOREIGN_TENANT).limit(1).maybeSingle();
    FOREIGN_WS = w?.id ?? null;
  }
  FOREIGN_TOKEN = fToken;
  const fPre = unwrap((await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: {} }, { token: fToken, tenant: null })).body);
  rec("WPT-18", "foreign tenant preflight on our task", fPre?.ready === false && codes(fPre).includes("UNAUTHORIZED_INPUT") ? "PASS" : "FAIL",
    { ready: fPre?.ready, issues: codes(fPre) });
  const fRun = await call("ai-tasks.functions.ts", "runAiTask", { taskId: TASK, templateCode: "SUMMARY_REPORT" }, { token: fToken, tenant: null });
  rec("WPT-19", "foreign tenant runAiTask", denied(fRun) ? "PASS" : "FAIL", `${fRun.status} ${errMsg(fRun)}`);
  const fRoll = unwrap((await call("work-products.functions.ts", "getWorkProductRollup", { tenantId: TENANT }, { method: "GET", token: fToken, tenant: null })).body);
  const leaked = Array.isArray(fRoll) ? fRoll.filter((r) => (r.runs ?? 0) > 0) : [];
  rec("WPT-20", "foreign tenant rollup leakage", leaked.length === 0 ? "PASS" : "FAIL", JSON.stringify(fRoll)?.slice(0, 200));
}


// ---------- 10b. TAMPER tenantId/workspaceId trong request (token hợp lệ của ta) ----------
const randTenant = randomUUID();
const rollRand = await call("work-products.functions.ts", "getWorkProductRollup", { tenantId: randTenant }, { method: "GET" });
rec("WPT-23", "rollup with random tenantId", noLeak(rollRand) ? "PASS" : "FAIL", `${rollRand.status} ${errMsg(rollRand)}`);

const workersRand = await call("ai-tasks.functions.ts", "listAiWorkers", { tenantId: randTenant });
rec("WPT-24", "listAiWorkers with random tenantId", noLeak(workersRand) ? "PASS" : "FAIL", `${workersRand.status} ${errMsg(workersRand)}`);

if (FOREIGN_TENANT) {
  const rollF = await call("work-products.functions.ts", "getWorkProductRollup", { tenantId: FOREIGN_TENANT }, { method: "GET" });
  rec("WPT-25", "rollup with foreign tenantId", noLeak(rollF) ? "PASS" : "FAIL", `${rollF.status} ${errMsg(rollF)}`);

  const wBefore = (await admin.from("ai_workers").select("id", { count: "exact", head: true }).eq("tenant_id", FOREIGN_TENANT)).count ?? 0;
  const workersF = await call("ai-tasks.functions.ts", "listAiWorkers", { tenantId: FOREIGN_TENANT });
  const wAfter = (await admin.from("ai_workers").select("id", { count: "exact", head: true }).eq("tenant_id", FOREIGN_TENANT)).count ?? 0;
  rec("WPT-26", "listAiWorkers with foreign tenantId", noLeak(workersF) ? "PASS" : "FAIL", `${workersF.status} ${errMsg(workersF)}`);
  rec("WPT-27", "no ai_workers seeded into foreign tenant", wAfter <= wBefore ? "PASS" : "FAIL", `before=${wBefore} after=${wAfter}`);

  // Cookie tenant giả không được nâng quyền / không đổi ngữ cảnh hợp đồng
  const spoof = unwrap((await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: {} }, { tenant: FOREIGN_TENANT })).body);
  rec("WPT-28", "spoofed active-tenant cookie does not change contract scope",
    spoof?.contractHash === basePre?.contractHash && spoof?.ready === basePre?.ready ? "PASS" : "FAIL",
    { ready: spoof?.ready, hash: spoof?.contractHash?.slice(0, 16) });

  const accSpoof = unwrap((await call("ai-tasks.functions.ts", "getAiTaskAccess", { taskId: TASK }, { method: "GET", tenant: FOREIGN_TENANT })).body);
  rec("WPT-29", "spoofed cookie does not escalate task access", accSpoof && accSpoof.canView === true ? "PASS" : "FAIL", accSpoof);
}

if (FOREIGN_TOKEN) {
  const wOurs = await call("ai-tasks.functions.ts", "listAiWorkers", { tenantId: TENANT }, { token: FOREIGN_TOKEN, tenant: null });
  rec("WPT-30", "foreign token + our tenantId listAiWorkers", noLeak(wOurs) ? "PASS" : "FAIL", `${wOurs.status} ${errMsg(wOurs)}`);

  const wSpoofCookie = await call("ai-tasks.functions.ts", "listAiWorkers", { tenantId: TENANT }, { token: FOREIGN_TOKEN, tenant: TENANT });
  rec("WPT-31", "foreign token + our tenant cookie listAiWorkers", noLeak(wSpoofCookie) ? "PASS" : "FAIL", `${wSpoofCookie.status} ${errMsg(wSpoofCookie)}`);

  const accF = unwrap((await call("ai-tasks.functions.ts", "getAiTaskAccess", { taskId: TASK }, { method: "GET", token: FOREIGN_TOKEN, tenant: TENANT })).body);
  rec("WPT-32", "foreign token cannot view our task access", accF?.canView === false ? "PASS" : "FAIL", accF);

  const execF = await call("ai-tasks.functions.ts", "listAiTaskExecutions", { taskId: TASK }, { method: "GET", token: FOREIGN_TOKEN, tenant: TENANT });
  rec("WPT-33", "foreign token cannot list our executions", noLeak(execF) ? "PASS" : "FAIL", `${execF.status} ${errMsg(execF)}`);

  const { data: anyExec } = await admin.from("ai_task_executions").select("id").eq("task_id", TASK).limit(1).maybeSingle();
  if (anyExec?.id) {
    const stepsF = await call("ai-tasks.functions.ts", "listWorkExecutionSteps", { executionId: anyExec.id }, { method: "GET", token: FOREIGN_TOKEN, tenant: TENANT });
    rec("WPT-34", "foreign token cannot read our execution steps", noLeak(stepsF) ? "PASS" : "FAIL", `${stepsF.status} ${errMsg(stepsF)}`);
    const tlF = await call("ai-tasks.functions.ts", "exportWorkExecutionTimeline", { executionId: anyExec.id }, { method: "GET", token: FOREIGN_TOKEN, tenant: TENANT });
    const tlBody = unwrap(tlF.body);
    rec("WPT-35", "foreign token cannot export our timeline",
      denied(tlF) || !tlBody || (Array.isArray(tlBody?.steps) && tlBody.steps.length === 0) ? "PASS" : "FAIL", `${tlF.status} ${errMsg(tlF)}`);
  }

  if (FOREIGN_WS) {
    const crossWs = unwrap((await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: { project_id: FOREIGN_WS } })).body);
    rec("WPT-36", "foreign workspace id as input rejected", crossWs?.ready === false ? "PASS" : "FAIL", { ready: crossWs?.ready, issues: codes(crossWs) });
  }
}


// ---------- 10c. JWT hết hạn / chữ ký sai / thiếu quyền → fail-closed, không mồi dữ liệu ----------
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const reclaim = (token, patch) => {
  const [h, p] = token.split(".");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  return `${h}.${b64u({ ...payload, ...patch })}.${"x".repeat(43)}`;
};
const noPrime = (r) => {
  const flat = JSON.stringify(r.body ?? "");
  return !flat.includes("contractHash") && !flat.includes(CODE) && !flat.includes("qualityContract");
};

const expired = reclaim(TOKEN_MAIN, { exp: Math.floor(Date.now() / 1000) - 3600 });
const expPre = await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: {} }, { token: expired });
rec("WPT-37", "expired JWT blocked on preflight", denied(expPre) && noPrime(expPre) ? "PASS" : "FAIL", `${expPre.status} ${errMsg(expPre)}`);

const expGet = await call("work-products.functions.ts", "getWorkProduct", { code: CODE }, { method: "GET", token: expired });
rec("WPT-38", "expired JWT cannot read contract", denied(expGet) && noPrime(expGet) ? "PASS" : "FAIL", `${expGet.status} ${errMsg(expGet)}`);

const expRoll = await call("work-products.functions.ts", "getWorkProductRollup", { tenantId: TENANT }, { method: "GET", token: expired });
rec("WPT-39", "expired JWT cannot read rollup", noLeak(expRoll) ? "PASS" : "FAIL", `${expRoll.status} ${errMsg(expRoll)}`);

const expRun = await call("ai-tasks.functions.ts", "runAiTask", { taskId: TASK, templateCode: "SUMMARY_REPORT" }, { token: expired });
rec("WPT-40", "expired JWT cannot start AI run", denied(expRun) ? "PASS" : "FAIL", `${expRun.status} ${errMsg(expRun)}`);

const roleEscalated = reclaim(TOKEN_MAIN, { role: "service_role" });
const escRoll = await call("work-products.functions.ts", "getWorkProductRollup", { tenantId: TENANT }, { method: "GET", token: roleEscalated });
rec("WPT-41", "forged service_role claim rejected", noLeak(escRoll) ? "PASS" : "FAIL", `${escRoll.status} ${errMsg(escRoll)}`);

if (FOREIGN_TOKEN) {
  const impersonated = reclaim(FOREIGN_TOKEN, { sub: JSON.parse(Buffer.from(TOKEN_MAIN.split(".")[1], "base64url").toString("utf8")).sub });
  const impPre = await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: {} }, { token: impersonated });
  rec("WPT-42", "forged sub (impersonation) rejected", denied(impPre) && noPrime(impPre) ? "PASS" : "FAIL", `${impPre.status} ${errMsg(impPre)}`);
}

const anonBearer = await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: {} }, { token: ANON });
rec("WPT-43", "anon/publishable key as bearer rejected", denied(anonBearer) && noPrime(anonBearer) ? "PASS" : "FAIL", `${anonBearer.status} ${errMsg(anonBearer)}`);

const noHeader = await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: {} }, { token: null });
rec("WPT-44", "missing Authorization header rejected", denied(noHeader) && noPrime(noHeader) ? "PASS" : "FAIL", `${noHeader.status} ${errMsg(noHeader)}`);

// Token của tài khoản đã bị xoá: chữ ký còn hợp lệ nhưng danh tính không còn ⇒ không được rò rỉ gì
const dEmail = `wpt_deleted_${run}@example.com`;
const dPass = `Wpt!${run}Dd`;
const { data: du } = await admin.auth.admin.createUser({ email: dEmail, password: dPass, email_confirm: true });
const anonD = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: ds } = await anonD.auth.signInWithPassword({ email: dEmail, password: dPass });
const dToken = ds?.session?.access_token;
if (dToken && du?.user?.id) {
  await admin.auth.admin.deleteUser(du.user.id);
  const delPre = await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: {} }, { token: dToken, tenant: TENANT });
  const delPreBody = unwrap(delPre.body);
  rec("WPT-45", "deleted-user token cannot preflight our task",
    denied(delPre) || delPreBody?.ready === false ? "PASS" : "FAIL", `${delPre.status} ${errMsg(delPre)}`);
  const delRoll = await call("work-products.functions.ts", "getWorkProductRollup", { tenantId: TENANT }, { method: "GET", token: dToken, tenant: TENANT });
  rec("WPT-46", "deleted-user token cannot read rollup", noLeak(delRoll) ? "PASS" : "FAIL", `${delRoll.status} ${errMsg(delRoll)}`);
}

// Thiếu quyền: thành viên hợp lệ của tổ chức nhưng không có vai trò quản lý / không ở workspace
const mEmail = `wpt_member_${run}@example.com`;
const mPass = `Wpt!${run}Mm`;
const { data: mu } = await admin.auth.admin.createUser({ email: mEmail, password: mPass, email_confirm: true });
const anonM = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: ms } = await anonM.auth.signInWithPassword({ email: mEmail, password: mPass });
const mToken = ms?.session?.access_token;
if (mToken && mu?.user?.id) {
  await admin.from("tenant_members").insert({ tenant_id: TENANT, user_id: mu.user.id, role: "member", status: "active" });
  const acc = unwrap((await call("ai-tasks.functions.ts", "getAiTaskAccess", { taskId: TASK }, { method: "GET", token: mToken, tenant: TENANT })).body);
  rec("WPT-47", "tenant member without manager role cannot manage task",
    acc && acc.canManage === false && acc.canReview === false ? "PASS" : "FAIL", acc);
  const mRun = await call("ai-tasks.functions.ts", "runAiTask", { taskId: TASK, templateCode: "SUMMARY_REPORT" }, { token: mToken, tenant: TENANT });
  rec("WPT-48", "tenant member without permission cannot start AI run", denied(mRun) ? "PASS" : "FAIL", `${mRun.status} ${errMsg(mRun)}`);
  const mExecBefore = execAfterAll;
  const mExecAfter = (await admin.from("ai_task_executions").select("id", { count: "exact", head: true }).eq("task_id", TASK)).count ?? 0;
  rec("WPT-49", "no execution created by under-privileged caller", mExecAfter <= mExecBefore ? "PASS" : "FAIL", `before=${mExecBefore} after=${mExecAfter}`);
  await admin.from("tenant_members").delete().eq("tenant_id", TENANT).eq("user_id", mu.user.id);
  await admin.auth.admin.deleteUser(mu.user.id);
}


// ---------- 10d. Response luôn khớp schema hợp đồng, kể cả khi dữ liệu DB dị dạng ----------
const WP_ERROR_CODES = new Set([
  "WORK_PRODUCT_NOT_FOUND", "WORK_PRODUCT_NOT_ACTIVE", "INVALID_WORK_PRODUCT_VERSION",
  "MISSING_REQUIRED_INPUT", "INVALID_INPUT", "UNAUTHORIZED_INPUT", "NO_ELIGIBLE_EXECUTOR",
  "CONTEXT_POLICY_INVALID", "ACTION_POLICY_CONFLICT", "QUALITY_POLICY_INVALID",
  "OUTCOME_POLICY_INVALID", "WORK_PRODUCT_ACTION_NOT_ALLOWED", "WORK_PRODUCT_CONTRACT_IMMUTABLE",
]);
const isStr = (v) => typeof v === "string";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const strArr = (v) => Array.isArray(v) && v.every(isStr);
const nullable = (f) => (v) => v === null || f(v);
const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Trả về danh sách vi phạm schema (rỗng = hợp lệ). Fail-closed: undefined luôn là vi phạm. */
function checkContractSchema(c, path = "contract") {
  const bad = [];
  const need = (k, ok) => { if (!ok(c?.[k])) bad.push(`${path}.${k}=${JSON.stringify(c?.[k])}`); };
  if (!plain(c)) return [`${path} không phải object`];
  need("code", isStr); need("version", isNum); need("label", isStr);
  need("description", nullable(isStr)); need("objective", isStr); need("category", isStr);
  need("status", (v) => ["DRAFT", "ACTIVE", "PAUSED", "RETIRED"].includes(v));
  need("templateCode", nullable(isStr)); need("deliverableType", isStr); need("outcomeType", isStr);
  need("slaMachineMs", nullable(isNum)); need("contractHash", nullable(isStr));
  const sub = (k, fn) => { if (!plain(c?.[k])) bad.push(`${path}.${k} thiếu`); else fn(c[k], `${path}.${k}`); };
  sub("input", (v, pp) => { if (!strArr(v.required)) bad.push(`${pp}.required`); if (!plain(v.properties)) bad.push(`${pp}.properties`); });
  sub("context", (v, pp) => { if (!strArr(v.allowedEntityTypes)) bad.push(`${pp}.allowedEntityTypes`); if (!strArr(v.optionalEntityTypes)) bad.push(`${pp}.optionalEntityTypes`); if (!nullable(isNum)(v.maxSources)) bad.push(`${pp}.maxSources`); });
  sub("executor", (v, pp) => { if (!nullable(isStr)(v.requiredRole)) bad.push(`${pp}.requiredRole`); if (!strArr(v.requiredSkills)) bad.push(`${pp}.requiredSkills`); });
  sub("action", (v, pp) => { if (!strArr(v.allowedActions)) bad.push(`${pp}.allowedActions`); if (!isStr(v.maxAutonomy)) bad.push(`${pp}.maxAutonomy`); });
  sub("deliverable", (v, pp) => { if (!strArr(v.requiredSections)) bad.push(`${pp}.requiredSections`); });
  sub("acceptance", (v, pp) => { if (!strArr(v.mandatoryCriteria)) bad.push(`${pp}.mandatoryCriteria`); });
  sub("quality", (v, pp) => { if (!isNum(v.minimumQualityScore)) bad.push(`${pp}.minimumQualityScore`); if (!strArr(v.requiredDimensions)) bad.push(`${pp}.requiredDimensions`); });
  sub("review", (v, pp) => { if (!["HUMAN_REVIEW_REQUIRED", "HUMAN_REVIEW_REQUIRED_IF_WARNING"].includes(v.policy)) bad.push(`${pp}.policy`); });
  sub("sla", (v, pp) => { if (!nullable(isNum)(v.machineDurationMs)) bad.push(`${pp}.machineDurationMs`); if (!nullable(isNum)(v.wallDurationMs)) bad.push(`${pp}.wallDurationMs`); });
  return bad;
}

function checkPreflightSchema(p) {
  const bad = [];
  if (!plain(p)) return ["preflight không phải object"];
  if (typeof p.ready !== "boolean") bad.push(`ready=${JSON.stringify(p.ready)}`);
  if (!isStr(p.code)) bad.push("code");
  if (!isNum(p.version)) bad.push("version");
  if (!nullable(isStr)(p.contractHash)) bad.push("contractHash");
  if (!plain(p.inputs)) bad.push("inputs");
  if (!nullable(isStr)(p.executorWorkerId)) bad.push("executorWorkerId");
  if (!Array.isArray(p.issues)) bad.push("issues");
  else for (const it of p.issues) {
    if (!plain(it) || !isStr(it.message)) bad.push(`issue=${JSON.stringify(it)}`);
    else if (!WP_ERROR_CODES.has(it.code)) bad.push(`issue.code lạ: ${it.code}`);
    else if (it.field !== undefined && !nullable(isStr)(it.field)) bad.push("issue.field");
  }
  if (p.ready === false && p.issues?.length === 0) bad.push("ready=false nhưng không có issue (không fail-closed)");
  return bad;
}

rec("WPT-50", "healthy contract khớp schema", checkContractSchema(baseContract).length === 0 ? "PASS" : "FAIL", checkContractSchema(baseContract));
rec("WPT-51", "healthy preflight khớp schema", checkPreflightSchema(basePre).length === 0 ? "PASS" : "FAIL", checkPreflightSchema(basePre));
rec("WPT-52", "preflight bị từ chối vẫn khớp schema", checkPreflightSchema(forgedTask).length === 0 ? "PASS" : "FAIL", checkPreflightSchema(forgedTask));
rec("WPT-53", "preflight mã không tồn tại vẫn khớp schema", checkPreflightSchema(fakePre).length === 0 ? "PASS" : "FAIL", checkPreflightSchema(fakePre));

const rollup = unwrap((await call("work-products.functions.ts", "getWorkProductRollup", { tenantId: TENANT }, { method: "GET" })).body);
const rollupBad = !Array.isArray(rollup)
  ? ["rollup không phải mảng"]
  : rollup.flatMap((r, i) => [
      isStr(r?.workUnitCode) ? null : `[${i}].workUnitCode`,
      isNum(r?.workUnitVersion) ? null : `[${i}].workUnitVersion`,
      ["runs", "acceptedRuns", "verifiedOutcomes", "qualityPassedRuns", "humanApprovals", "revisions", "slaMetRuns", "slaEvaluatedRuns"]
        .find((k) => !isNum(r?.[k])) ?? null,
      nullable(isNum)(r?.machineMsP50) ? null : `[${i}].machineMsP50`,
    ].filter(Boolean));
rec("WPT-54", "rollup rows khớp schema số liệu", rollupBad.length === 0 ? "PASS" : "FAIL", rollupBad.slice(0, 5));

// Chèn dữ liệu DỊ DẠNG trực tiếp vào DB (mô phỏng PostgREST trả về row hỏng/thiếu trường)
const MAL = `WPT_MALFORMED_${run.toUpperCase()}`;
const RETIRED = `WPT_RETIRED_${run.toUpperCase()}`;
const malformedRow = {
  code: MAL, version: 1, label: "Malformed probe", objective: "",
  deliverable_type: "SUMMARY", expected_outcome_type: "", status: "ACTIVE",
  contract_hash: null, template_code: null,
  input_contract: "not-an-object",
  context_contract: { allowedEntityTypes: "TASK", optionalEntityTypes: 5, maxSources: "many" },
  executor_contract: [1, 2, 3],
  action_contract: { allowedActions: { a: 1 }, maxAutonomy: 42 },
  deliverable_contract: { requiredSections: "A,B" },
  acceptance_contract: 12345,
  quality_contract: { minimumQualityScore: "high", requiredDimensions: null },
  review_contract: { policy: "NO_REVIEW_AT_ALL" },
  sla_contract: { machineDurationMs: "fast", wallDurationMs: [] },
};
const { error: malErr } = await admin.from("work_units").insert(malformedRow);
const { error: retErr } = await admin.from("work_units").insert({
  code: RETIRED, version: 1, label: "Retired probe", objective: "obj",
  deliverable_type: "SUMMARY", expected_outcome_type: "REPORT", status: "RETIRED", contract_hash: "deadbeef",
});
if (malErr || retErr) {
  rec("WPT-55", "chèn được dữ liệu dị dạng để kiểm thử", "FAIL", `${malErr?.message ?? ""} ${retErr?.message ?? ""}`);
} else {
  const malGet = unwrap((await call("work-products.functions.ts", "getWorkProduct", { code: MAL }, { method: "GET" })).body);
  const malGetBad = checkContractSchema(malGet, "malformed");
  rec("WPT-55", "row dị dạng vẫn được chuẩn hoá đúng schema", malGetBad.length === 0 ? "PASS" : "FAIL", malGetBad.slice(0, 6));

  const malPre = unwrap((await call("work-products.functions.ts", "preflightWorkProduct", { code: MAL, taskId: TASK, inputs: {} })).body);
  const malPreBad = checkPreflightSchema(malPre);
  rec("WPT-56", "preflight trên row dị dạng khớp schema", malPreBad.length === 0 ? "PASS" : "FAIL", malPreBad.slice(0, 6));
  rec("WPT-57", "preflight trên row dị dạng fail-closed (ready=false)",
    malPre?.ready === false ? "PASS" : "FAIL", { ready: malPre?.ready, issues: (malPre?.issues ?? []).map((i) => i.code) });

  const retPre = unwrap((await call("work-products.functions.ts", "preflightWorkProduct", { code: RETIRED, taskId: TASK, inputs: {} })).body);
  rec("WPT-58", "hợp đồng RETIRED bị chặn bằng mã lỗi ổn định",
    retPre?.ready === false && (retPre.issues ?? []).some((i) => i.code === "WORK_PRODUCT_NOT_ACTIVE") && checkPreflightSchema(retPre).length === 0
      ? "PASS" : "FAIL", (retPre?.issues ?? []).map((i) => i.code));

  const listAll = unwrap((await call("work-products.functions.ts", "listWorkProducts", {}, { method: "GET" })).body);
  const listBad = Array.isArray(listAll)
    ? listAll.flatMap((c, i) => checkContractSchema(c, `list[${i}]`))
    : ["list không phải mảng"];
  rec("WPT-59", "toàn bộ danh mục (gồm row dị dạng) khớp schema", listBad.length === 0 ? "PASS" : "FAIL", listBad.slice(0, 6));
  rec("WPT-60", "row dị dạng có mặt trong danh mục nhưng không phá response",
    Array.isArray(listAll) && listAll.some((c) => c.code === MAL) ? "PASS" : "FAIL", `n=${Array.isArray(listAll) ? listAll.length : "?"}`);

  const malRun = await call("ai-tasks.functions.ts", "runAiTask", { taskId: TASK, templateCode: MAL }, {});
  rec("WPT-61", "không thể chạy AI bằng hợp đồng dị dạng", denied(malRun) ? "PASS" : "FAIL", `${malRun.status} ${errMsg(malRun)}`);

  const execNow = (await admin.from("ai_task_executions").select("id", { count: "exact", head: true }).eq("task_id", TASK)).count ?? 0;
  rec("WPT-62", "không tạo execution nào từ hợp đồng dị dạng", execNow <= execAfterAll ? "PASS" : "FAIL", `before=${execAfterAll} after=${execNow}`);

  await admin.from("work_units").delete().in("code", [MAL, RETIRED]);
}

// ---------- 11. Hợp đồng phải bất biến sau toàn bộ tamper ----------
const after = (await admin.from("work_units").select("code, version, status, contract_hash").order("code")).data ?? [];
const same = JSON.stringify(before) === JSON.stringify(after);
rec("WPT-21", "contract snapshot unchanged", same ? "PASS" : "FAIL", same ? contractBefore?.contract_hash?.slice(0, 24) ?? "n/a" : JSON.stringify(after)?.slice(0, 300));

// ---------- 12. Hệ thống vẫn hoạt động sau tamper (không fail-open, không hỏng) ----------
const post = unwrap((await call("work-products.functions.ts", "preflightWorkProduct", { code: CODE, taskId: TASK, inputs: {} })).body);
rec("WPT-22", "healthy path still works after tamper", post?.contractHash === basePre?.contractHash ? "PASS" : "FAIL",
  { ready: post?.ready, hash: post?.contractHash?.slice(0, 16) });

const pass = results.filter((r) => r.status === "PASS").length;
const fail = results.length - pass;

// Nhóm kịch bản tamper (theo dải mã WPT-xx) để tóm tắt PASS/FAIL cho người đọc.
const GROUPS = [
  { key: "CONTRACT_TAMPER", label: "Giả mạo hợp đồng & phiên bản", from: 1, to: 9 },
  { key: "AUTHZ_INPUT", label: "Uỷ quyền đầu vào & template", from: 10, to: 22 },
  { key: "TENANT_ISOLATION", label: "Cô lập tenant / workspace", from: 23, to: 36 },
  { key: "IDENTITY_JWT", label: "JWT hết hạn, giả mạo & thiếu quyền", from: 37, to: 49 },
  { key: "SCHEMA_FAILCLOSED", label: "Khớp schema & dữ liệu DB dị dạng", from: 50, to: 99 },
];
const groupOf = (id) => {
  const n = Number((id.match(/WPT-(\d+)/) ?? [])[1] ?? 0);
  return GROUPS.find((g) => n >= g.from && n <= g.to) ?? { key: "OTHER", label: "Khác" };
};
for (const r of results) {
  const g = groupOf(r.id);
  r.group = g.key;
  r.groupLabel = g.label;
}
const groups = [...GROUPS, { key: "OTHER", label: "Khác" }]
  .map((g) => {
    const rows = results.filter((r) => r.group === g.key);
    return {
      key: g.key,
      label: g.label,
      total: rows.length,
      pass: rows.filter((r) => r.status === "PASS").length,
      fail: rows.filter((r) => r.status !== "PASS").length,
      rows,
    };
  })
  .filter((g) => g.total > 0);

const verdict = fail === 0 ? "PASS" : "FAIL";
const report = {
  run, at: new Date().toISOString(), base: BASE, tenant: TENANT, workspace: WS, task: TASK,
  verdict, total: results.length, pass, fail,
  groups: groups.map(({ rows: _rows, ...g }) => g),
  results,
};

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>UNIWORK — Work Product Tamper E2E — ${esc(run)}</title>
<style>
:root{--bg:#f7f8fa;--card:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--pass:#047857;--passbg:#ecfdf5;--fail:#b91c1c;--failbg:#fef2f2;--brand:#1d4ed8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:40px 24px 64px}
h1{font-size:24px;margin:0 0 4px;letter-spacing:-.01em}p.sub{color:var(--muted);margin:0 0 24px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:28px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.card .k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.card .v{font-size:22px;font-weight:650;margin-top:4px}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;font-size:12px}
.b-pass{background:var(--passbg);color:var(--pass)}.b-fail{background:var(--failbg);color:var(--fail)}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:16px;overflow:hidden}
section>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line)}
section>header h2{font-size:15px;margin:0;font-weight:650}
table{width:100%;border-collapse:collapse}
td,th{padding:10px 18px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:600}
tr:last-child td{border-bottom:0}
td.id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--brand);white-space:nowrap}
td.detail{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--muted);word-break:break-word;max-width:420px}
footer{color:var(--muted);font-size:12px;margin-top:24px}
</style></head><body><div class="wrap">
<h1>Work Product Tamper — Runtime E2E</h1>
<p class="sub">Run <code>${esc(run)}</code> · ${esc(report.at)} · ${esc(BASE)}</p>
<div class="cards">
  <div class="card"><div class="k">Kết luận</div><div class="v"><span class="badge ${fail === 0 ? "b-pass" : "b-fail"}">${verdict}</span></div></div>
  <div class="card"><div class="k">Tổng kịch bản</div><div class="v">${results.length}</div></div>
  <div class="card"><div class="k">Đạt</div><div class="v" style="color:var(--pass)">${pass}</div></div>
  <div class="card"><div class="k">Lỗi</div><div class="v" style="color:${fail ? "var(--fail)" : "var(--muted)"}">${fail}</div></div>
</div>
${groups.map((g) => `<section>
  <header><h2>${esc(g.label)}</h2><span class="badge ${g.fail === 0 ? "b-pass" : "b-fail"}">${g.pass}/${g.total} đạt</span></header>
  <table><thead><tr><th>Mã</th><th>Kịch bản</th><th>Kết quả</th><th>Chi tiết</th></tr></thead><tbody>
  ${g.rows.map((r) => `<tr><td class="id">${esc(r.id)}</td><td>${esc(r.name)}</td>
    <td><span class="badge ${r.status === "PASS" ? "b-pass" : "b-fail"}">${esc(r.status)}</span></td>
    <td class="detail">${esc(r.detail)}</td></tr>`).join("")}
  </tbody></table></section>`).join("")}
<footer>Tenant ${esc(TENANT)} · Workspace ${esc(WS)} · Task ${esc(TASK)}</footer>
</div></body></html>`;

const jsonPath = `${OUT}/wp-tamper-e2e-${run}.json`;
const htmlPath = `${OUT}/wp-tamper-e2e-${run}.html`;
writeFileSync(jsonPath, JSON.stringify(report, null, 2));
writeFileSync(htmlPath, html);
// Bản "latest" để mở nhanh mà không cần tra mã run.
writeFileSync(`${OUT}/wp-tamper-e2e-latest.json`, JSON.stringify(report, null, 2));
writeFileSync(`${OUT}/wp-tamper-e2e-latest.html`, html);

console.log("\n--- Tóm tắt theo nhóm kịch bản tamper ---");
for (const g of groups) console.log(`${g.fail === 0 ? "PASS" : "FAIL"}  ${g.label.padEnd(38)} ${g.pass}/${g.total}`);
console.log(`\n=== ${verdict} work-product tamper e2e: ${pass} passed, ${fail} failed`);
console.log(`JSON → ${jsonPath}\nHTML → ${htmlPath}\nLatest → ${OUT}/wp-tamper-e2e-latest.html`);
process.exit(fail === 0 ? 0 : 1);
