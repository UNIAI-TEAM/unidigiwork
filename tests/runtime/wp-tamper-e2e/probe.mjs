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
      authorization: `Bearer ${token}`,
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
const errOf = (r) => {
  const b = r.body;
  const raw = (b && typeof b === "object" && (b.error ?? b)) || {};
  return typeof raw === "object" ? raw : {};
};
const badErr = errOf(badTemplate);
const badRaw = JSON.stringify(badTemplate.body ?? "");
rec("WPT-12A", "validator returns stable error code VALIDATION_FAILED",
  badErr.code === "VALIDATION_FAILED" ? "PASS" : "FAIL", { code: badErr.code, message: badErr.message });
rec("WPT-12B", "error body carries human message + allowed template codes",
  typeof badErr.message === "string" && badErr.message.length > 0 &&
  Array.isArray(badErr.details?.allowedTemplateCodes) &&
  badErr.details.allowedTemplateCodes.includes("SUMMARY_REPORT") &&
  (badErr.details?.fields ?? []).includes("templateCode") ? "PASS" : "FAIL",
  JSON.stringify(badErr.details)?.slice(0, 240));
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
const report = { run, at: new Date().toISOString(), base: BASE, tenant: TENANT, workspace: WS, task: TASK, pass, fail, results };
writeFileSync(`${OUT}/wp-tamper-e2e-${run}.json`, JSON.stringify(report, null, 2));
console.log(`\n=== ${fail === 0 ? "PASS" : "FAIL"} work-product tamper e2e: ${pass} passed, ${fail} failed → ${OUT}/wp-tamper-e2e-${run}.json`);
process.exit(fail === 0 ? 0 : 1);
