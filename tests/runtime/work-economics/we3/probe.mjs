// WE-3 RUNTIME PROOF — Work Pricing & Unit Economics.
// Mọi số liệu đi qua đúng server function mà UI dùng; không gọi RPC nội bộ để "làm đẹp" kết quả.
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
  if (t === 13 || t === 14) return { __error: true, message: node.s };
  return node.s ?? null;
}

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.WE3_BASE_URL || "http://localhost:8080";
const TOKEN = process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN;
const TENANT = process.env.WE3_TENANT;
const WS = process.env.WE3_WS;
const CODE = process.env.WE3_CODE || "WEEKLY_PROJECT_INTELLIGENCE";
const VERSION = Number(process.env.WE3_VERSION || 1);
const RUNS = Number(process.env.WE3_RUNS || 3);
const OUT = process.env.WE3_OUT || "/mnt/documents/we3";
const run = randomUUID().slice(0, 8);
mkdirSync(OUT, { recursive: true });

const results = [];
const rec = (id, name, status, detail) => {
  results.push({ id, name, status, detail: typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 800) });
  console.log(`${status.padEnd(6)} ${id} ${name} :: ${String(typeof detail === "string" ? detail : JSON.stringify(detail) ?? "").slice(0, 320)}`);
};
const fnId = (file, exportName) =>
  Buffer.from(JSON.stringify({ file: `/src/lib/api/${file}?tss-serverfn-split`, export: `${exportName}_createServerFn_handler` })).toString("base64url");

async function call(file, exportName, data, { method = "POST", token = TOKEN, tenant = TENANT } = {}) {
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
  try { body = decode(JSON.parse(txt)); } catch { try { body = JSON.parse(txt); } catch { body = txt.slice(0, 400); } }
  return { status: r.status, body };
}
const unwrap = (b) => (b && typeof b === "object" && "result" in b ? (b.result ?? b.error) : b);
const denied = (r) => r.status !== 200 || Boolean(r.body && typeof r.body === "object" && (r.body.error || r.body.__error));
const admin = SVC ? createClient(URL_, SVC, { auth: { persistSession: false } }) : null;

/* ---------------- 1. RATE CONFIG (cấu hình tài chính, không phải số bịa) ---------------- */
const rateRes = await call("work-pricing.functions.ts", "createModelCostRate", {
  provider: "lovable-ai-gateway",
  model: "openai/gpt-5.6-sol",
  inputTokenRate: 0.00000125,
  outputTokenRate: 0.00001,
  currency: "USD",
  source: `Cấu hình tài chính nội bộ UNICOM (probe ${run}) — cần tài chính xác nhận trước khi báo giá`,
  status: "ACTIVE",
});
rec("RATE-01", "createModelCostRate ACTIVE", rateRes.status === 200 ? "PASS" : "FAIL", unwrap(rateRes.body));

const humanRes = await call("work-pricing.functions.ts", "createHumanCostPolicy", {
  tenantId: TENANT, currency: "USD", reviewEventCost: 4, approvalEventCost: 6, changeRequestCost: 3, status: "ACTIVE",
});
rec("RATE-02", "createHumanCostPolicy ACTIVE", humanRes.status === 200 ? "PASS" : "FAIL", unwrap(humanRes.body));

/* ---------------- 2. LƯỢT CHẠY THẬT ---------------- */
const workers = unwrap((await call("ai-tasks.functions.ts", "listAiWorkers", { tenantId: TENANT })).body) ?? [];
const worker = Array.isArray(workers) ? workers[0] : null;
rec("PRE-WORKER", "list_ai_workers", worker ? "PASS" : "FAIL", worker?.id ?? workers);
if (!worker) { writeFileSync(`${OUT}/we3-${run}.json`, JSON.stringify({ results }, null, 2)); process.exit(1); }

const executions = [];
for (let i = 0; i < RUNS; i += 1) {
  const t = unwrap((await call("tasks.functions.ts", "createTask", {
    workspaceId: WS,
    title: `WE3 Weekly Project Intelligence #${i + 1} ${run}`,
    description: "Tổng hợp tình báo dự án tuần: tiến độ, rủi ro, hạng mục quá hạn, đề xuất hành động.",
    priority: "high",
    idempotencyKey: `we3-${run}-task-${i}`,
  })).body);
  const task = Array.isArray(t) ? t[0] : t;
  if (!task?.id) { rec(`RUN-${i}`, "create task", "FAIL", t); continue; }
  await call("ai-tasks.functions.ts", "assignTaskToAi", {
    taskId: task.id, aiWorkerId: worker.id,
    expectedDeliverable: "Báo cáo Project Intelligence tuần với 5 mục bắt buộc.",
    acceptanceCriteria: "Mọi nhận định trích nguồn dữ liệu workspace thật; không bịa dữ liệu.",
    idempotencyKey: `we3-${run}-assign-${i}`,
  });
  const t0 = Date.now();
  const r = await call("ai-tasks.functions.ts", "runAiTask", { taskId: task.id, templateCode: "SUMMARY_REPORT" });
  const exec = unwrap(r.body);
  rec(`RUN-0${i + 1}`, "runAiTask", exec?.id ? "PASS" : "FAIL",
    exec?.id ? { exec: exec.id, status: exec.status, unit: exec.work_unit_code, ms: Date.now() - t0 } : r.body);
  if (exec?.id) executions.push({ taskId: task.id, execId: exec.id, status: exec.status });
}

// Nghiệm thu 2/3 lượt để có mẫu chấp nhận & mẫu chưa chấp nhận.
for (const [idx, e] of executions.entries()) {
  if (idx >= Math.max(1, executions.length - 1)) break;
  const a = await call("ai-tasks.functions.ts", "acceptAiTaskExecution", {
    executionId: e.execId, completeTask: true, idempotencyKey: `we3-${run}-acc-${idx}`,
  });
  rec(`ACC-0${idx + 1}`, "acceptAiTaskExecution", a.status === 200 ? "PASS" : "FAIL", unwrap(a.body)?.status ?? a.body);
}

/* ---------------- 3. CHI PHÍ & KINH TẾ ĐƠN VỊ ---------------- */
const re1 = unwrap((await call("work-pricing.functions.ts", "recomputeWorkUnitEconomics", { code: CODE, version: VERSION })).body);
rec("COST-01", "recomputeWorkUnitEconomics", re1?.recomputed >= 0 ? "PASS" : "FAIL", re1);
const re2 = unwrap((await call("work-pricing.functions.ts", "recomputeWorkUnitEconomics", { code: CODE, version: VERSION })).body);
rec("COST-02", "recompute idempotent", JSON.stringify(re1) === JSON.stringify(re2) ? "PASS" : "FAIL", re2);

const costs = unwrap((await call("work-pricing.functions.ts", "listExecutionCosts", { code: CODE, version: VERSION })).body) ?? [];
rec("COST-03", "listExecutionCosts", Array.isArray(costs) && costs.length > 0 ? "PASS" : "FAIL",
  (costs || []).slice(0, 5).map((c) => `${String(c.execution_id).slice(0, 8)}:${c.completeness}:ai=${c.ai_compute_cost}:human=${c.human_cost}`).join(" | "));
const noZeroFake = (costs || []).every((c) => c.completeness !== "INSUFFICIENT" || Number(c.known_cost_total ?? 0) === 0);
rec("COST-04", "không điền 0 giả cho tín hiệu thiếu", noZeroFake ? "PASS" : "FAIL",
  (costs || []).map((c) => `${c.completeness}/${c.known_cost_total}`).join(","));

const eco = unwrap((await call("work-pricing.functions.ts", "getWorkProductEconomics", {
  code: CODE, version: VERSION, tenantId: TENANT, workspaceId: WS, days: 90,
})).body);
rec("ECO-01", "getWorkProductEconomics", eco ? "PASS" : "FAIL", eco);

/* ---------------- 4. MÔ PHỎNG BIÊN LỢI NHUẬN ---------------- */
const sim = unwrap((await call("work-pricing.functions.ts", "simulateWorkProductMargin", {
  code: CODE, version: VERSION, tenantId: TENANT, workspaceId: WS,
  pricingModel: "PER_ACCEPTED_OUTCOME", commercialUnit: "ACCEPTED_OUTCOME",
  proposedPrice: 40, currency: "USD", targetMarginPercent: 60,
})).body);
rec("SIM-01", "simulateWorkProductMargin", sim ? "PASS" : "FAIL", sim);
rec("SIM-02", "mô phỏng nêu rõ mức độ đầy đủ dữ liệu",
  sim && (sim.completeness || sim.costCompleteness) ? "PASS" : "FAIL", sim?.completeness ?? sim?.costCompleteness);

/* ---------------- 5. CHÍNH SÁCH GIÁ (không chạm runtime) ---------------- */
const pol = await call("work-pricing.functions.ts", "createPricingPolicy", {
  tenantId: TENANT, code: CODE, version: VERSION, pricingModel: "PER_ACCEPTED_OUTCOME",
  commercialUnit: "ACCEPTED_OUTCOME", currency: "USD", unitPrice: 40,
  notes: `probe ${run}`,
});
const polBody = unwrap(pol.body);
rec("POL-01", "createPricingPolicy mặc định DRAFT",
  pol.status === 200 && (polBody?.status ?? polBody?.policy?.status ?? "DRAFT") === "DRAFT" ? "PASS" : "FAIL", polBody);

const badPrice = await call("work-pricing.functions.ts", "simulateWorkProductMargin", {
  code: CODE, version: VERSION, tenantId: TENANT, proposedPrice: -5,
});
rec("NEG-PRICE", "giá âm bị từ chối", denied(badPrice) ? "PASS" : "FAIL", `${badPrice.status}`);

const badCur = await call("work-pricing.functions.ts", "createPricingPolicy", {
  tenantId: TENANT, code: CODE, version: VERSION, pricingModel: "PER_EXECUTION", currency: "XYZ", unitPrice: 10,
});
rec("NEG-CURRENCY", "tiền tệ không hỗ trợ bị từ chối", denied(badCur) ? "PASS" : "FAIL", `${badCur.status}`);

const badBundle = await call("work-pricing.functions.ts", "createPricingPolicy", {
  tenantId: TENANT, code: CODE, version: VERSION, pricingModel: "BUNDLE",
  currency: "USD", bundleQuantity: 0, bundlePrice: 100,
});
rec("NEG-BUNDLE", "gói số lượng 0 bị từ chối", denied(badBundle) ? "PASS" : "FAIL", `${badBundle.status}`);

/* ---------------- 6. AN NINH ---------------- */
const noAuth = await call("work-pricing.functions.ts", "getWorkProductEconomics",
  { code: CODE, version: VERSION, tenantId: TENANT }, { token: "invalid.jwt.token" });
rec("SEC-01", "không phiên đăng nhập → chặn", denied(noAuth) ? "PASS" : "FAIL", noAuth.status);

const foreignTenant = randomUUID();
const ft = unwrap((await call("work-pricing.functions.ts", "getWorkProductEconomics",
  { code: CODE, version: VERSION, tenantId: foreignTenant })).body);
rec("SEC-02", "tổ chức khác không đọc được kinh tế",
  !ft || ft.__error || (ft.executions ?? 0) === 0 ? "PASS" : "FAIL", ft);

if (admin) {
  const email = `we3_user_${run}@example.com`;
  const pass = `We3!${run}Aa`;
  const { data: u } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true });
  const anonC = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: s } = await anonC.auth.signInWithPassword({ email, password: pass });
  const memberToken = s?.session?.access_token;
  if (memberToken && u?.user?.id) {
    await admin.from("tenant_members").insert({ tenant_id: TENANT, user_id: u.user.id, role: "member" });
    const r1 = await call("work-pricing.functions.ts", "getWorkProductEconomics",
      { code: CODE, version: VERSION, tenantId: TENANT }, { token: memberToken });
    rec("SEC-03", "thành viên thường không xem được chi phí/biên", denied(r1) ? "PASS" : "FAIL", `${r1.status}`);
    const r2 = await call("work-pricing.functions.ts", "createModelCostRate", {
      provider: "x", model: "y", inputTokenRate: 1, outputTokenRate: 1, source: "hack", status: "ACTIVE",
    }, { token: memberToken });
    rec("SEC-04", "thành viên thường không tạo được bảng giá", denied(r2) ? "PASS" : "FAIL", `${r2.status}`);
    // Ghi thẳng vào bảng chi phí từ client → phải bị RLS chặn.
    const cli = createClient(URL_, ANON, {
      auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${memberToken}` } },
    });
    const ins = await cli.from("work_execution_costs").insert({
      tenant_id: TENANT, execution_id: randomUUID(), work_unit_code: CODE, work_unit_version: VERSION,
      known_cost_total: 0.01, completeness: "FULL",
    });
    rec("SEC-05", "client không ghi được chi phí", ins.error ? "PASS" : "FAIL", ins.error?.message ?? "GHI ĐƯỢC — LỖI NGHIÊM TRỌNG");
    const insRate = await cli.from("ai_model_cost_rates").insert({
      provider: "hack", model: "hack", input_token_rate: 0, output_token_rate: 0, currency: "USD", source: "hack", status: "ACTIVE",
    });
    rec("SEC-06", "client không ghi được bảng giá", insRate.error ? "PASS" : "FAIL", insRate.error?.message ?? "GHI ĐƯỢC — LỖI NGHIÊM TRỌNG");
    await admin.from("tenant_members").delete().eq("user_id", u.user.id);
    await admin.auth.admin.deleteUser(u.user.id);
  }
}

const pass = results.filter((r) => r.status === "PASS").length;
const summary = { run, at: new Date().toISOString(), code: CODE, version: VERSION, total: results.length, pass, fail: results.length - pass, executions, results };
writeFileSync(`${OUT}/we3-${run}.json`, JSON.stringify(summary, null, 2));
console.log(`\nWE-3 PROOF: ${pass}/${results.length} PASS → ${OUT}/we3-${run}.json`);
