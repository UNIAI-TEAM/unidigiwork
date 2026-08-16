// Kiểm tra tĩnh xử lý xung đột phiên bản (stale state).
import { readFileSync } from "node:fs";
const fns = readFileSync("src/lib/api/ai-actions.functions.ts", "utf8");
const srv = readFileSync("src/lib/api/ai-actions.server.ts", "utf8");
const fail = [];
const ok = (c, m) => (c ? console.log("PASS", m) : fail.push(m));
ok(fns.includes("expected_row_version"), "đề xuất lưu row_version tại thời điểm propose");
ok(fns.includes('ACTION_STALE'), "trả lỗi ACTION_STALE khi dữ liệu đã đổi");
ok(srv.includes("_expected_row_version: i.expectedRowVersion"), "row version được kiểm tra ở lệnh nghiệp vụ");
if (fail.length) { console.error("FAIL:", fail); process.exit(1); }
console.log("ACTION_CONCURRENCY_GREEN");
