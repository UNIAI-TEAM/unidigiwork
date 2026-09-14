// THEO DÕI TỪNG VIỆC — chỉ đọc: lịch sử trạng thái/tiến độ từ nhật ký giao ban tự động
// và mức ảnh hưởng của từng việc lên KPI (quá hạn 7 ngày, hoàn thành, tỷ lệ AI).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantId } from "./ceo.server";

const AUTO_PREFIX = "[Giao ban tự động]";
const KPI_WINDOW_DAYS = 7;

export type TaskTrackingEntry = {
  at: string;
  body: string;
  progressPct: number | null;
  auto: boolean;
};

export type TaskTrackingRow = {
  id: string;
  title: string;
  status: string;
  progressPct: number;
  dueAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  isAi: boolean;
  /** Ảnh hưởng KPI trong kỳ 7 ngày */
  kpi: {
    countsOverdue: boolean;
    countsCompleted: boolean;
    countsAiShare: boolean;
    inWindow: boolean;
  };
  history: TaskTrackingEntry[];
  progressDelta: number | null;
};

type Task = {
  id: string;
  title: string;
  status: string;
  progress_pct: number | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  ai_worker_id: string | null;
  execution_mode: string | null;
};

const TERMINAL = new Set(["done", "canceled"]);

export const listTaskTracking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(60).default(30),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<TaskTrackingRow[]> => {
    const tenantId = await resolveTenantId(context.supabase, context.userId, data.workspaceId);
    if (!tenantId) return [];

    const now = Date.now();
    const from = new Date(now - KPI_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date(now).toISOString();

    const SELECT =
      "id, title, status, progress_pct, due_at, completed_at, created_at, updated_at, ai_worker_id, execution_mode";

    const [open, recent] = await Promise.all([
      context.supabase
        .from("tasks")
        .select(SELECT)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .in("status", ["todo", "in_progress", "blocked"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(data.limit),
      context.supabase
        .from("tasks")
        .select(SELECT)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .neq("status", "canceled")
        .gte("updated_at", from)
        .order("updated_at", { ascending: false })
        .limit(data.limit),
    ]);

    const byId = new Map<string, Task>();
    for (const t of [
      ...((open.data ?? []) as Task[]),
      ...((recent.data ?? []) as Task[]),
    ] as Task[]) {
      byId.set(t.id, t);
    }
    const tasks = [...byId.values()].slice(0, data.limit);
    if (!tasks.length) return [];

    // Lịch sử: lấy nhật ký (ưu tiên dòng tự động) của các việc đang theo dõi.
    const { data: comments } = await context.supabase
      .from("task_comments")
      .select("task_id, body, created_at")
      .eq("tenant_id", tenantId)
      .in(
        "task_id",
        tasks.map((t) => t.id),
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(600);

    const history = new Map<string, TaskTrackingEntry[]>();
    for (const c of (comments ?? []) as Array<{
      task_id: string;
      body: string | null;
      created_at: string;
    }>) {
      const body = c.body ?? "";
      const auto = body.startsWith(AUTO_PREFIX);
      const list = history.get(c.task_id) ?? [];
      if (list.length >= 10) continue;
      const m = /tiến độ (\d+)%/.exec(body);
      list.push({
        at: c.created_at,
        body: auto ? body.slice(AUTO_PREFIX.length).trim() : body,
        progressPct: m?.[1] !== undefined ? Number(m[1]) : null,
        auto,
      });
      history.set(c.task_id, list);
    }

    return tasks.map((t) => {
      const entries = history.get(t.id) ?? [];
      const withPct = entries.filter((e) => e.progressPct !== null);
      const progressPct = t.status === "done" ? 100 : Math.max(0, Math.min(100, t.progress_pct ?? 0));
      const prev = withPct[1]?.progressPct ?? null;
      const isAi = !!t.ai_worker_id || t.execution_mode === "AI";
      const overdue = !!t.due_at && t.due_at < nowIso && t.due_at >= from && !TERMINAL.has(t.status);
      const completedInWindow = !!t.completed_at && t.completed_at >= from;
      const createdInWindow = !!t.created_at && t.created_at >= from;

      return {
        id: t.id,
        title: t.title,
        status: t.status,
        progressPct,
        dueAt: t.due_at,
        completedAt: t.completed_at,
        updatedAt: t.updated_at,
        isAi,
        kpi: {
          countsOverdue: overdue,
          countsCompleted: completedInWindow,
          countsAiShare: isAi && createdInWindow,
          inWindow: createdInWindow,
        },
        history: entries,
        progressDelta: prev === null ? null : progressPct - prev,
      } satisfies TaskTrackingRow;
    });
  });
