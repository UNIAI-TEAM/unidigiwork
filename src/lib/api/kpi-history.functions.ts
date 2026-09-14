// LỊCH SỬ KPI — chỉ đọc, phạm vi theo tổ chức của người dùng.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantId } from "./ceo.server";

export type KpiHistoryRow = {
  id: string;
  capturedAt: string;
  source: string;
  score: number | null;
  configured: boolean;
  totalTasks: number;
  completed: number;
  overdue: number;
  aiSharePct: number | null;
};

export const listKpiHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(90).default(30),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<KpiHistoryRow[]> => {
    const tenantId = await resolveTenantId(context.supabase, context.userId, data.workspaceId);
    if (!tenantId) return [];

    const { data: rows } = await context.supabase
      .from("ceo_kpi_snapshots")
      .select("id, captured_at, source, score, configured, total_tasks, completed, overdue, ai_share_pct")
      .eq("tenant_id", tenantId)
      .order("captured_at", { ascending: false })
      .limit(data.limit);

    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r["id"]),
      capturedAt: String(r["captured_at"]),
      source: String(r["source"] ?? "manual"),
      score: r["score"] === null || r["score"] === undefined ? null : Number(r["score"]),
      configured: Boolean(r["configured"]),
      totalTasks: Number(r["total_tasks"] ?? 0),
      completed: Number(r["completed"] ?? 0),
      overdue: Number(r["overdue"] ?? 0),
      aiSharePct:
        r["ai_share_pct"] === null || r["ai_share_pct"] === undefined
          ? null
          : Number(r["ai_share_pct"]),
    }));
  });
