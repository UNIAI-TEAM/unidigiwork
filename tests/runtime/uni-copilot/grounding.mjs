// UNI COPILOT V1 — grounding assertions trên system prompt & fallback.
import { readFileSync } from "node:fs";
const contracts = readFileSync("src/domain/ai-copilot/contracts.ts", "utf8");
const fn = readFileSync("src/lib/api/ai-copilot.functions.ts", "utf8");
let failed = 0;
const check = (n, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${n}`); if (!ok) failed++; };
check("cấm bịa dữ liệu workspace", contracts.includes("Không bịa dữ liệu workspace"));
check("phân biệt dữ kiện / nhận định", contracts.includes("Phân biệt dữ kiện và nhận định"));
check("no-result fallback", fn.includes("chưa tìm thấy dữ liệu UniWork đủ để trả lời"));
check("partial context được báo cho người dùng", readFileSync("src/components/ai/uni-copilot.tsx", "utf8").includes("chưa truy xuất được"));
check("ambiguity không tự chọn", fn.includes("ambiguity"));
process.exit(failed ? 1 : 0);
