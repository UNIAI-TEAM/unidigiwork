// Kiểm tra tĩnh cơ chế chống trùng & replay.
import { readFileSync } from "node:fs";
const fns = readFileSync("src/lib/api/ai-actions.functions.ts", "utf8");
const srv = readFileSync("src/lib/api/ai-actions.server.ts", "utf8");
const fail = [];
const ok = (c, m) => (c ? console.log("PASS", m) : fail.push(m));
ok(fns.includes('row.status === "SUCCEEDED" && row.result'), "replay trả kết quả cũ");
ok(fns.includes('.in("status", ["PROPOSED", "PREVIEWED", "FAILED"])'), "khoá trạng thái chống double-confirm");
ok(srv.includes("_idempotency_key: i.idempotencyKey"), "idempotency key truyền xuống lệnh nghiệp vụ");
if (fail.length) { console.error("FAIL:", fail); process.exit(1); }
console.log("ACTION_IDEMPOTENCY_GREEN");
