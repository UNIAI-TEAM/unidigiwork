// Kiểm tra tĩnh chính sách AI Action Layer V1 (không cần DB).
import { readFileSync } from "node:fs";
const src = readFileSync("src/domain/ai-actions/contracts.ts", "utf8");
const fns = readFileSync("src/lib/api/ai-actions.functions.ts", "utf8");
const srv = readFileSync("src/lib/api/ai-actions.server.ts", "utf8");
const fail = [];
const ok = (c, m) => (c ? console.log("PASS", m) : fail.push(m));

const allowed = ["CREATE_TASK", "UPDATE_TASK_FIELDS", "CREATE_MEETING", "CREATE_EMAIL_DRAFT"];
const registry = src.slice(src.indexOf("export const AI_ACTION_TOOLS"), src.indexOf("export const isAllowedActionType"));
ok(allowed.every((a) => registry.includes(`${a}: {`)), "registry chứa đủ 4 action được duyệt");
ok(registry.match(/requiresUserConfirmation: true/g)?.length === 4, "cả 4 action đều requiresUserConfirmation=true");
for (const bad of ["SEND_EMAIL", "DELETE_TASK", "DELETE_DOCUMENT", "CHANGE_ROLE", "ADMIN_"]) {
  ok(!registry.includes(`${bad}: {`), `registry không chứa ${bad}`);
}
ok(src.includes("AI_AUTONOMOUS_EXECUTION = false"), "autonomous execution = OFF");
ok(!/requiresUserConfirmation:\s*false/.test(src + fns + srv), "không nơi nào tắt xác nhận");
ok(/create_task|update_task|schedule_meeting/.test(srv), "executor dùng lệnh nghiệp vụ hiện có");
ok(!/from\("tasks"\)\s*\.insert|from\("meetings"\)\s*\.insert/.test(srv), "executor không insert thẳng bảng nghiệp vụ");
ok(fns.includes("requireSupabaseAuth"), "endpoint yêu cầu đăng nhập");
ok(fns.includes('row.user_id !== context.userId'), "đề xuất bị ràng buộc theo chủ sở hữu");
ok(fns.includes('tenantId !== row.tenant_id'), "chặn cross-tenant khi xác nhận");

if (fail.length) {
  console.error("FAIL:", fail);
  process.exit(1);
}
console.log("ACTION_POLICY_GREEN");
