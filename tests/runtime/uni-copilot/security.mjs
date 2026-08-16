// UNI COPILOT V1 — static security assertions (chạy: node tests/runtime/uni-copilot/security.mjs)
// Kiểm chứng biên bảo mật của Copilot mà không cần gọi provider trả phí.
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");
const fn = read("src/lib/api/ai-copilot.functions.ts");
const server = read("src/lib/api/ai-copilot.server.ts");
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; };

check("auth middleware bắt buộc", fn.includes("requireSupabaseAuth"));
check("tenant boundary từ cookie tenant đang hoạt động", fn.includes("ACTIVE_TENANT_COOKIE"));
check("không dùng service role / admin client", !/supabaseAdmin|service_role|SERVICE_ROLE/.test(fn + server));
check("mọi dữ liệu qua AI Context Engine", fn.includes("buildAiContextPack"));
check("không query bảng nghiệp vụ trực tiếp", !/\.from\((?!"ai_context_metrics")/.test(fn));
check("rate limit theo user", fn.includes("checkCopilotRateLimit"));
check("citation validation", fn.includes("validateAnswerCitations") && fn.includes("usableSources"));
check("không log nội dung nguồn", !/console\.log\(.*excerpt/.test(fn));
process.exit(failed ? 1 : 0);
