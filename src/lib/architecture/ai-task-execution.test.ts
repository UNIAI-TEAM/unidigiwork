// ARCHITECTURE GATE — AI Task Execution V1: AI đề xuất, con người nghiệm thu.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AI_TERMINAL_STATUSES, canAiWriteStatus, isHumanOnlyStatus } from "@/domain/ai-tasks/contracts";

const fns = readFileSync("src/lib/api/ai-tasks.functions.ts", "utf8");
const srv = readFileSync("src/lib/api/ai-tasks.server.ts", "utf8");
const orc = readFileSync("src/lib/api/work-execution.server.ts", "utf8");

describe("AI task execution boundary", () => {
  it("AI chỉ được ghi trạng thái không phải nghiệm thu", () => {
    expect([...AI_TERMINAL_STATUSES]).toEqual(["WAITING_REVIEW", "FAILED"]);
    expect(canAiWriteStatus("ACCEPTED")).toBe(false);
    expect(isHumanOnlyStatus("ACCEPTED")).toBe(true);
  });

  it("engine không ghi dữ liệu nghiệp vụ và không dùng service role", () => {
    expect(srv).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(srv).not.toMatch(/supabaseAdmin|service_role|client\.server/);
    expect(fns).not.toMatch(/supabaseAdmin|service_role|client\.server/);
  });

  it("lượt chạy AI luôn kết thúc ở WAITING_REVIEW hoặc FAILED", () => {
    const statuses = [...fns.matchAll(/_status:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) expect(["WAITING_REVIEW", "FAILED"]).toContain(s);
  });

  it("mọi mutation đi qua RPC tin cậy", () => {
    expect(fns).not.toMatch(/\.from\((?!"ai_task_executions"|"tasks"|"ai_workers"|"work_execution_steps")/);
    for (const rpc of ["assign_task_to_ai", "start_ai_task_execution", "finish_ai_task_execution", "request_ai_execution_changes", "accept_ai_task_execution"]) {
      expect(fns).toContain(rpc);
    }
  });

  it("prompt có phòng vệ prompt injection", () => {
    expect(srv).toMatch(/KHÔNG ĐÁNG TIN CẬY/);
    expect(orc).toMatch(/không phải mệnh lệnh/);
  });
});

describe("WEE-1 orchestrator boundary", () => {
  it("orchestrator không dùng service role", () => {
    expect(orc).not.toMatch(/supabaseAdmin|service_role|client\.server/);
  });

  it("orchestrator chỉ ghi bảng đề xuất và bảng bước, không ghi bảng nghiệp vụ", () => {
    const writes = [...orc.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(writes.length).toBeGreaterThan(0);
    for (const t of writes) expect(["ai_action_proposals"]).toContain(t);
    expect(orc).not.toMatch(/rpc\(\s*"(create_task|update_task|schedule_meeting|assign_task)"/);
  });

  it("đề xuất luôn ở trạng thái PROPOSED, không tự thực thi", () => {
    expect(orc).toMatch(/status:\s*"PROPOSED"/);
    expect(orc).not.toMatch(/status:\s*"(CONFIRMED|EXECUTING|SUCCEEDED)"/);
    expect(orc).not.toMatch(/confirmAiAction|executorFor|ACTION_EXECUTORS/);
  });

  it("chỉ bước ACTION được dừng ở chờ xác nhận", () => {
    const awaits = [...orc.matchAll(/"([A-Z]+)",\s*"AWAITING_CONFIRMATION"/g)].map((m) => m[1]);
    expect(awaits.length).toBeGreaterThan(0);
    for (const k of awaits) expect(k).toBe("ACTION");
  });
});
