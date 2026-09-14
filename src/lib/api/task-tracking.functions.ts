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
      const progressPct =
        t.status === "done" ? 100 : Math.max(0, Math.min(100, t.progress_pct ?? 0));
      const prev = withPct[1]?.progressPct ?? null;
      const isAi = !!t.ai_worker_id || t.execution_mode === "AI";
      const overdue =
        !!t.due_at && t.due_at < nowIso && t.due_at >= from && !TERMINAL.has(t.status);
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

const MANUAL_PREFIX = "[Cập nhật thủ công]";

/** Quản trị viên tổ chức mới được cập nhật tiến độ trực tiếp trên trang theo dõi. */
async function requireTenantAdmin(
  supabase: Parameters<typeof resolveTenantId>[0],
  userId: string,
  workspaceId?: string | null,
): Promise<string> {
  const tenantId = await resolveTenantId(supabase, userId, workspaceId);
  if (!tenantId) throw new Error("WORKSPACE_NOT_FOUND");
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role, status")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = member?.status === "active" ? (member?.role as string | null) : null;
  if (role !== "tenant_owner" && role !== "tenant_admin") throw new Error("FORBIDDEN");
  return tenantId;
}

/** Trang theo dõi hỏi trước: người dùng hiện tại có quyền cập nhật tiến độ không. */
export const canManageTaskTracking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ workspaceId: z.string().uuid().nullable().optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<boolean> => {
    try {
      await requireTenantAdmin(context.supabase, context.userId, data.workspaceId);
      return true;
    } catch {
      return false;
    }
  });

/** Cập nhật tiến độ/trạng thái một việc, ghi nhật ký và làm mới mốc KPI ngay. */
export const updateTaskTrackingProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().nullable().optional(),
        taskId: z.string().uuid(),
        progressPct: z.number().int().min(0).max(100),
        status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
        note: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await requireTenantAdmin(context.supabase, context.userId, data.workspaceId);

    const { data: task } = await context.supabase
      .from("tasks")
      .select("id, title, status, progress_pct, completed_at")
      .eq("id", data.taskId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!task) throw new Error("TASK_NOT_FOUND");

    const nowIso = new Date().toISOString();
    const nextStatus = data.status ?? (data.progressPct >= 100 ? "done" : task.status);
    const patch: Record<string, unknown> = {
      progress_pct: data.progressPct,
      status: nextStatus,
      updated_by: context.userId,
      updated_at: nowIso,
    };
    if (nextStatus === "done") patch["completed_at"] = task.completed_at ?? nowIso;
    else patch["completed_at"] = null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tasks")
      .update(patch as never)
      .eq("id", data.taskId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(`UPDATE_FAILED: ${error.message}`);

    const prev = Math.max(0, Math.min(100, task.progress_pct ?? 0));
    const delta = data.progressPct - prev;
    const body = `${MANUAL_PREFIX} tiến độ ${data.progressPct}% (${
      delta === 0 ? "không đổi" : delta > 0 ? `+${delta}` : `${delta}`
    }), trạng thái ${nextStatus}.${data.note ? ` Ghi chú: ${data.note}` : ""}`.slice(0, 4000);
    await supabaseAdmin.from("task_comments").insert({
      task_id: data.taskId,
      tenant_id: tenantId,
      author_id: context.userId,
      body,
    } as never);

    // Làm mới KPI ngay sau khi đổi tiến độ để trang KPI phản ánh dữ liệu thật.
    let kpi: { score: number | null; overdue: number; completed: number } | null = null;
    try {
      const { loadCeoOverview } = await import("./ceo.server");
      const { recordKpiSnapshot } = await import("./kpi-snapshot.server");
      const ov = await loadCeoOverview(
        context.supabase,
        tenantId,
        "week",
        data.workspaceId ?? null,
      );
      const values = {
        score: ov.kpi.score,
        configured: ov.kpi.configured,
        totalTasks: ov.totals.tasks.current,
        completed: ov.totals.completed.current,
        overdue: ov.totals.overdue,
        aiSharePct: ov.split.aiSharePct,
      };
      await recordKpiSnapshot(supabaseAdmin, tenantId, "manual", values, {
        manualTaskId: data.taskId,
      });
      kpi = { score: values.score, overdue: values.overdue, completed: values.completed };
    } catch {
      // KPI là dữ liệu phụ trợ, không chặn cập nhật tiến độ
    }

    return { ok: true, progressPct: data.progressPct, status: nextStatus, kpi };
  });

// ===== BIỂU ĐỒ TIẾN ĐỘ TỪNG VIỆC THEO THÁNG =====
// Mốc tiến độ mỗi tháng lấy từ nhật ký (giao ban tự động + cập nhật thủ công),
// so sánh với mức tăng trong 7 ngày gần nhất để thấy việc nào kéo dài.

export type TaskMonthlyPoint = { month: string; label: string; pct: number | null };

export type TaskProgressMonthlyRow = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  overdue: boolean;
  currentPct: number;
  points: TaskMonthlyPoint[];
  /** Mức tăng trong 30 ngày và trong 7 ngày gần nhất */
  gain30d: number | null;
  gain7d: number | null;
  ageDays: number;
  /** Kéo dài: đã mở > 14 ngày, 30 ngày tăng < 10% và 7 ngày không tăng */
  stalled: boolean;
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const listTaskProgressMonthly = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().nullable().optional(),
        months: z.number().int().min(2).max(12).default(6),
        limit: z.number().int().min(1).max(40).default(12),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<TaskProgressMonthlyRow[]> => {
    const tenantId = await resolveTenantId(context.supabase, context.userId, data.workspaceId);
    if (!tenantId) return [];

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const { data: openData } = await context.supabase
      .from("tasks")
      .select("id, title, status, progress_pct, due_at, created_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .in("status", ["todo", "in_progress", "blocked"])
      .order("created_at", { ascending: true })
      .limit(data.limit);

    const tasks = (openData ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      progress_pct: number | null;
      due_at: string | null;
      created_at: string | null;
    }>;
    if (!tasks.length) return [];

    const { data: comments } = await context.supabase
      .from("task_comments")
      .select("task_id, body, created_at")
      .eq("tenant_id", tenantId)
      .in(
        "task_id",
        tasks.map((t) => t.id),
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(2000);

    // Danh sách mốc tiến độ theo thời gian cho từng việc.
    const series = new Map<string, Array<{ at: number; pct: number }>>();
    for (const c of (comments ?? []) as Array<{
      task_id: string;
      body: string | null;
      created_at: string;
    }>) {
      const m = /tiến độ (\d+)%/.exec(c.body ?? "");
      if (!m?.[1]) continue;
      const list = series.get(c.task_id) ?? [];
      list.push({ at: Date.parse(c.created_at), pct: Math.max(0, Math.min(100, Number(m[1]))) });
      series.set(c.task_id, list);
    }

    const pctAt = (taskId: string, cutoff: number): number | null => {
      const list = series.get(taskId);
      if (!list?.length) return null;
      let found: number | null = null;
      for (const p of list) {
        if (p.at <= cutoff) found = p.pct;
        else break;
      }
      return found;
    };

    // Các mốc cuối tháng gần nhất (tháng hiện tại dùng giá trị hiện tại).
    const monthEnds: Array<{ month: string; label: string; cutoff: number }> = [];
    for (let k = data.months - 1; k >= 0; k -= 1) {
      const d = new Date(
        Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - k, 1),
      );
      const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1;
      monthEnds.push({
        month: monthKey(d),
        label: `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`,
        cutoff: Math.min(end, now),
      });
    }

    const rows = tasks.map((t) => {
      const currentPct = Math.max(0, Math.min(100, t.progress_pct ?? 0));
      const points = monthEnds.map((m) => ({
        month: m.month,
        label: m.label,
        pct: m.cutoff >= now ? currentPct : pctAt(t.id, m.cutoff),
      }));
      const p30 = pctAt(t.id, now - MONTH_MS);
      const p7 = pctAt(t.id, now - 7 * 24 * 60 * 60 * 1000);
      const gain30d = p30 === null ? null : currentPct - p30;
      const gain7d = p7 === null ? null : currentPct - p7;
      const ageDays = t.created_at
        ? Math.max(0, Math.round((now - Date.parse(t.created_at)) / (24 * 60 * 60 * 1000)))
        : 0;
      const overdue = !!t.due_at && t.due_at < nowIso;
      const stalled = ageDays > 14 && (gain30d ?? 0) < 10 && (gain7d ?? 0) <= 0;
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        dueAt: t.due_at,
        overdue,
        currentPct,
        points,
        gain30d,
        gain7d,
        ageDays,
        stalled,
      } satisfies TaskProgressMonthlyRow;
    });

    // Việc kéo dài lên đầu, rồi theo tuổi việc giảm dần.
    rows.sort((a, b) => (a.stalled === b.stalled ? b.ageDays - a.ageDays : a.stalled ? -1 : 1));
    return rows;
  });
