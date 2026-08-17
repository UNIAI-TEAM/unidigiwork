import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Các bảng thuộc phạm vi sao lưu "nhân sự AI", theo thứ tự phụ thuộc. */
export const AI_BACKUP_TABLES = [
  "ai_market_agents",
  "ai_market_skills",
  "ai_market_experiences",
  "ai_skills",
  "workflow_agents",
  "ai_employments",
  "ai_employment_events",
  "ai_agent_performance",
] as const;

export type AiBackupTable = (typeof AI_BACKUP_TABLES)[number];

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type Row = Record<string, JsonValue>;

async function assertAdmin(ctx: { supabase: unknown; userId: string }) {
  const sb = ctx.supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
        };
      };
    };
  };
  const { data } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

/** Xuất toàn bộ dữ liệu nhân sự AI thành 1 gói JSON để tải về ổ đĩa. Admin only. */
export const exportAiWorkforceBackup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tables: Record<string, Row[]> = {};
    for (const table of AI_BACKUP_TABLES) {
      const { data, error } = await supabaseAdmin.from(table).select("*").limit(5000);
      if (error) throw new Error(`${table}: ${error.message}`);
      tables[table] = (data ?? []) as Row[];
    }
    return {
      version: 1 as const,
      kind: "uniwork-ai-workforce" as const,
      exportedAt: new Date().toISOString(),
      counts: Object.fromEntries(
        Object.entries(tables).map(([k, v]) => [k, v.length]),
      ) as Record<string, number>,
      tables,
    };
  });

const restoreSchema = z.object({
  payload: z.object({
    version: z.number(),
    kind: z.string(),
    tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  }),
  mode: z.enum(["merge", "replace"]).default("merge"),
});

/** Khôi phục dữ liệu nhân sự AI từ gói JSON đã tải lên. Admin only. */
export const restoreAiWorkforceBackup = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => restoreSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await assertAdmin(context as never);
    if (data.payload.kind !== "uniwork-ai-workforce") {
      throw new Error("Tệp sao lưu không hợp lệ (sai định dạng gói).");
    }
    if (data.payload.version !== 1) {
      throw new Error(`Phiên bản gói không được hỗ trợ: ${data.payload.version}`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const restored: Record<string, number> = {};

    if (data.mode === "replace") {
      // Xóa theo thứ tự ngược để không vi phạm khóa ngoại.
      for (const table of [...AI_BACKUP_TABLES].reverse()) {
        const rows = data.payload.tables[table];
        if (!rows) continue;
        const { error } = await supabaseAdmin
          .from(table)
          .delete()
          .not("id", "is", null);
        if (error) throw new Error(`${table} (xóa): ${error.message}`);
      }
    }

    for (const table of AI_BACKUP_TABLES) {
      const rows = data.payload.tables[table];
      if (!rows || rows.length === 0) {
        restored[table] = 0;
        continue;
      }
      // Chèn theo lô để tránh payload quá lớn.
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await supabaseAdmin
          .from(table)
          .upsert(chunk as never, { onConflict: "id" });
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      restored[table] = rows.length;
    }

    return { ok: true as const, restored };
  });
