// ARCHITECTURE GATE — AI Task Execution V1: AI đề xuất, con người nghiệm thu.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AI_TERMINAL_STATUSES, canAiWriteStatus, isHumanOnlyStatus } from "@/domain/ai-tasks/contracts";

const fns = readFileSync("src/lib/api/ai-tasks.functions.ts", "utf8");
const srv = readFileSync("src/lib/api/ai-tasks.server.ts", "utf8");

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
    expect(fns).not.toMatch(/\.from\((?!"ai_task_executions"|"tasks"|"ai_workers")/);
    for (const rpc of ["assign_task_to_ai", "start_ai_task_execution", "finish_ai_task_execution", "request_ai_execution_changes", "accept_ai_task_execution"]) {
      expect(fns).toContain(rpc);
    }
  });

  it("prompt có phòng vệ prompt injection", () => {
    expect(srv).toMatch(/KHÔNG ĐÁNG TIN CẬY/);
  });
});
