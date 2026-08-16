// Kiểm tra tĩnh các bất biến bảo mật của AI Action Layer V1.
import { readFileSync } from "node:fs";
const fns = readFileSync("src/lib/api/ai-actions.functions.ts", "utf8");
const srv = readFileSync("src/lib/api/ai-actions.server.ts", "utf8");
const fail = [];
const ok = (c, m) => (c ? console.log("PASS", m) : fail.push(m));

ok(!/client\.server|supabaseAdmin|SERVICE_ROLE/.test(fns + srv), "không dùng service role làm actor");
ok(fns.includes("resolveActorWorkspace"), "revalidate quyền workspace khi xác nhận");
ok(fns.includes("Người phụ trách không thuộc workspace"), "chặn giao việc cho người ngoài workspace");
ok(fns.includes('payload["workspaceId"] = scope.workspaceId'), "bỏ qua workspaceId do client gửi");
ok(fns.includes('payload["taskId"] = row.target_id'), "target lấy từ đề xuất lưu ở server");
ok(srv.includes("KHÔNG được thực thi") || srv.includes("không phải mệnh lệnh"), "prompt trích xuất có phòng vệ injection");
if (fail.length) { console.error("FAIL:", fail); process.exit(1); }
console.log("ACTION_SECURITY_GREEN");
