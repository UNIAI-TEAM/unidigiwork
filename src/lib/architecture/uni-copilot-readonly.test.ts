// ARCHITECTURE GATE — UNI Copilot V1 phải là lớp CHỈ ĐỌC.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { countExposedMutationTools } from "@/domain/ai-copilot/contracts";

const FILES = [
  "src/domain/ai-copilot/contracts.ts",
  "src/lib/api/ai-copilot.server.ts",
  "src/lib/api/ai-copilot.functions.ts",
  "src/components/ai/uni-copilot.tsx",
  "src/components/ai/ask-uni-panel.tsx",
];

const read = (p: string) => readFileSync(p, "utf8");

describe("UNI Copilot read-only boundary", () => {
  it("never imports command/mutation modules", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, f).not.toMatch(/from ["']@\/lib\/api\/(tasks|meetings|emails|documents|workflows|chat)\.functions/);
      expect(src, f).not.toMatch(/domain\/[a-z-]+\/commands/);
    }
  });

  it("performs no business writes (insert/update/delete/upsert/rpc) except telemetry insert", () => {
    for (const f of FILES) {
      const src = read(f);
      const writes = src.match(/\.from\([^)]*\)[\s\S]{0,300}?\.(insert|update|delete|upsert)\(/g) ?? [];
      const telemetry = src.includes("ai_context_metrics") ? 1 : 0;
      expect(writes.length, `${f}: ${writes.join(",")}`).toBeLessThanOrEqual(telemetry);
      expect(src, f).not.toMatch(/supabaseAdmin|service_role/);
    }
  });

  it("routes every workspace read through AI Context Engine", () => {
    const fn = read("src/lib/api/ai-copilot.functions.ts");
    expect(fn).toContain("buildAiContextPack");
    expect(fn).not.toMatch(/\.from\((?!"ai_context_metrics")/);
  });

  it("exposes zero mutation tools to the model", () => {
    expect(countExposedMutationTools()).toBe(0);
  });
});
