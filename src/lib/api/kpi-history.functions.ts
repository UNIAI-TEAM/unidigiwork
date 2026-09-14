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
  proposalsCreated: number | null;
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
      .select(
        "id, captured_at, source, score, configured, total_tasks, completed, overdue, ai_share_pct, payload",
      )
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
      proposalsCreated: (() => {
        const p = r["payload"] as Record<string, unknown> | null;
        const v = p?.["proposalsCreated"];
        return v === null || v === undefined ? null : Number(v);
      })(),
    }));
  });

// ===== Gộp mốc KPI theo tháng — xem xu hướng và so sánh với mốc hiện tại =====

export type KpiMonthlyRow = {
  month: string; // YYYY-MM
  label: string; // "MM/YYYY"
  snapshots: number;
  avgScore: number | null;
  avgCompleted: number;
  avgOverdue: number;
  avgAiSharePct: number | null;
  proposalsCreated: number;
};

export const listKpiMonthly = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().nullable().optional(),
        months: z.number().int().min(1).max(12).default(6),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<KpiMonthlyRow[]> => {
    const tenantId = await resolveTenantId(context.supabase, context.userId, data.workspaceId);
    if (!tenantId) return [];

    // Lấy tối đa ~1 năm mốc, gộp theo tháng rồi cắt còn `months` tháng gần nhất.
    const { data: rows } = await context.supabase
      .from("ceo_kpi_snapshots")
      .select("captured_at, score, completed, overdue, ai_share_pct, payload")
      .eq("tenant_id", tenantId)
      .order("captured_at", { ascending: false })
      .limit(365);

    const groups = new Map<
      string,
      {
        scores: number[];
        completed: number[];
        overdue: number[];
        ai: number[];
        proposals: number;
      }
    >();
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      const iso = String(r["captured_at"]);
      const month = iso.slice(0, 7); // YYYY-MM
      let g = groups.get(month);
      if (!g) {
        g = { scores: [], completed: [], overdue: [], ai: [], proposals: 0 };
        groups.set(month, g);
      }
      if (r["score"] !== null && r["score"] !== undefined) g.scores.push(Number(r["score"]));
      g.completed.push(Number(r["completed"] ?? 0));
      g.overdue.push(Number(r["overdue"] ?? 0));
      if (r["ai_share_pct"] !== null && r["ai_share_pct"] !== undefined)
        g.ai.push(Number(r["ai_share_pct"]));
      const p = r["payload"] as Record<string, unknown> | null;
      if (p?.["proposalsCreated"] !== null && p?.["proposalsCreated"] !== undefined)
        g.proposals += Number(p["proposalsCreated"]);
    }

    const avg = (a: number[]) =>
      a.length === 0 ? null : Math.round(a.reduce((s, v) => s + v, 0) / a.length);

    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-data.months)
      .map(([month, g]) => {
        const [y, m] = month.split("-");
        return {
          month,
          label: `${m}/${y}`,
          snapshots: g.completed.length,
          avgScore: avg(g.scores),
          avgCompleted: Math.round(avg(g.completed) ?? 0),
          avgOverdue: Math.round(avg(g.overdue) ?? 0),
          avgAiSharePct: avg(g.ai),
          proposalsCreated: g.proposals,
        };
      });
  });
