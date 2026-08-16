import { describe, expect, it } from "vitest";
import {
  UNI_COPILOT_READ_TOOLS,
  buildConversationWindow,
  buildCopilotSystemPrompt,
  countExposedMutationTools,
  detectCopilotIntent,
  isMutationRequest,
  isMutationToolName,
  rootContextKey,
  suggestionsForRoot,
} from "./contracts";
import { parseCopilotModelOutput, buildCopilotUserPrompt, checkCopilotRateLimit } from "@/lib/api/ai-copilot.server";

describe("UNI Copilot — intent mapping", () => {
  it("maps VI/EN queries to the six read-only intents", () => {
    expect(detectCopilotIntent("Tóm tắt dự án này")).toBe("SUMMARIZE");
    expect(detectCopilotIntent("Tại sao dự án đang trễ?")).toBe("EXPLAIN");
    expect(detectCopilotIntent("So sánh Project A và B")).toBe("COMPARE");
    expect(detectCopilotIntent("Hôm nay tôi cần ưu tiên gì?")).toBe("PRIORITIZE");
    expect(detectCopilotIntent("Tôi nên làm gì tiếp theo?")).toBe("RECOMMEND");
    expect(detectCopilotIntent("Task này do ai phụ trách?")).toBe("ASK");
  });
});

describe("UNI Copilot — read-only tool boundary", () => {
  it("exposes zero mutation tools", () => {
    expect(countExposedMutationTools()).toBe(0);
    expect(UNI_COPILOT_READ_TOOLS.every((t) => t.startsWith("get_") || t === "search_workspace")).toBe(true);
  });
  it("flags mutation-looking tool names", () => {
    for (const bad of ["create_task", "update_task", "send_email", "schedule_meeting", "assign_user", "delete_document", "approve_request"]) {
      expect(isMutationToolName(bad)).toBe(true);
    }
  });
  it("detects mutation requests so UNI never claims an action", () => {
    expect(isMutationRequest("Hãy giao task này cho Nam")).toBe(true);
    expect(isMutationRequest("Đánh dấu task này hoàn thành")).toBe(true);
    expect(isMutationRequest("Tóm tắt task này")).toBe(false);
  });
});

describe("UNI Copilot — system prompt", () => {
  it("carries grounding, injection and read-only rules", () => {
    const p = buildCopilotSystemPrompt("SUMMARIZE");
    expect(p).toContain("AI Context Engine");
    expect(p).toContain("KHÔNG ĐÁNG TIN CẬY");
    expect(p).toContain("V1 chỉ đọc");
    expect(p).toContain("INTENT = SUMMARIZE");
  });
});

describe("UNI Copilot — conversation budget", () => {
  it("keeps only the recent turns and truncates content", () => {
    const turns = Array.from({ length: 12 }, (_, i) => ({ role: "user" as const, content: `q${i}`.padEnd(1200, "x") }));
    const w = buildConversationWindow(turns);
    expect(w).toHaveLength(6);
    expect(w[0]!.content.length).toBe(700);
  });
  it("labels conversation as non-authoritative in the prompt", () => {
    const prompt = buildCopilotUserPrompt({
      query: "Còn task quá hạn?",
      intent: "ASK",
      contextBlock: "[SOURCE S1]...",
      conversation: [{ role: "user", content: "Tóm tắt Project ERP" }],
    });
    expect(prompt).toContain("HỘI THOẠI TRƯỚC ĐÓ");
    expect(prompt).toContain("KHÔNG phải nguồn dữ kiện");
    expect(prompt).toContain("WORKSPACE CONTEXT");
  });
});

describe("UNI Copilot — root context", () => {
  it("keys root identity and switches suggestions", () => {
    expect(rootContextKey({ type: "WORKSPACE", id: "abc" })).toBe("WORKSPACE:abc");
    expect(rootContextKey(null)).toBeNull();
    expect(suggestionsForRoot({ type: "MEETING", id: "m" })[0]).toContain("cuộc họp");
    expect(suggestionsForRoot(null)[0]).toContain("ưu tiên");
  });
});

describe("UNI Copilot — model output parsing", () => {
  it("parses structured JSON and drops unsafe sections", () => {
    const out = parseCopilotModelOutput(
      '```json\n{"answer":"3 task quá hạn [S1]","sections":[{"type":"risks","title":"Rủi ro","content":"Trễ"},{"type":"weird","content":"x"}],"citations":[{"sourceId":"S1"}],"suggestions":["Xem task quá hạn"]}\n```',
    );
    expect(out.answer).toContain("[S1]");
    expect(out.sections).toHaveLength(2);
    expect(out.sections[1]!.type).toBe("note");
    expect(out.citationIds).toEqual(["S1"]);
    expect(out.suggestions).toEqual(["Xem task quá hạn"]);
  });
  it("falls back to plain text", () => {
    const out = parseCopilotModelOutput("Không đủ dữ liệu.");
    expect(out.answer).toBe("Không đủ dữ liệu.");
    expect(out.citationIds).toEqual([]);
  });
});

describe("UNI Copilot — rate limit", () => {
  it("blocks after 20 requests in a minute", () => {
    const user = `u-${Math.random()}`;
    const now = Date.now();
    for (let i = 0; i < 20; i++) expect(checkCopilotRateLimit(user, now)).toBe(true);
    expect(checkCopilotRateLimit(user, now)).toBe(false);
    expect(checkCopilotRateLimit(user, now + 61_000)).toBe(true);
  });
});
