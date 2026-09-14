// GIAO BAN TỰ ĐỘNG MỖI SÁNG — ghi nhận kết quả 24 giờ qua vào nhật ký công việc
// và làm mới KPI của Command Center mà không cần thao tác thủ công.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadCeoOverview } from "./ceo.server";

const ADMIN_ROLES = ["tenant_owner", "tenant_admin"];
const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // tối đa 1 lần / ngày
const MAX_TASKS_PER_TENANT = 30;
const AUTO_PREFIX = "[Giao ban tự động]";

export type DailyStandupResult = {
  tenants: number;
  recorded: number;
  skipped: number;
  notes: number;
  kpiRefreshed: number;
  errors: string[];
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  progress_pct: number | null;
  due_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });

export async function runDailyStandup(admin: any, limit = 20): Promise<DailyStandupResult> {
  const result: DailyStandupResult = {
    tenants: 0,
    recorded: 0,
    skipped: 0,
    notes: 0,
    kpiRefreshed: 0,
    errors: [],
  };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: settings } = await admin
    .from("ceo_kpi_settings")
    .select("tenant_id, auto_standup, auto_standup_at")
    .eq("auto_standup", true)
    .limit(limit);

  const rows = (settings ?? []) as { tenant_id: string; auto_standup_at: string | null }[];

  for (const row of rows) {
    result.tenants += 1;
    if (
      row.auto_standup_at &&
      Date.now() - new Date(row.auto_standup_at).getTime() < MIN_INTERVAL_MS
    ) {
      result.skipped += 1;
      continue;
    }

    // Ghi nhật ký dưới danh nghĩa một quản trị viên của chính tổ chức đó.
    const { data: member } = await admin
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", row.tenant_id)
      .eq("status", "active")
      .in("role", ADMIN_ROLES)
      .limit(1)
      .maybeSingle();
    const authorId = (member as { user_id?: string } | null)?.user_id;
    if (!authorId) {
      result.skipped += 1;
      continue;
    }

    try {
      const { data: taskData, error: taskErr } = await admin
        .from("tasks")
        .select("id, title, status, progress_pct, due_at, completed_at, updated_at")
        .eq("tenant_id", row.tenant_id)
        .is("deleted_at", null)
        .neq("status", "canceled")
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(MAX_TASKS_PER_TENANT);
      if (taskErr) throw new Error(taskErr.message);

      const tasks = (taskData ?? []) as TaskRow[];
      const nowMs = Date.now();

      // Không ghi trùng: bỏ qua công việc đã có ghi chú tự động trong 20 giờ qua.
      const recent = new Set<string>();
      if (tasks.length) {
        const { data: existing } = await admin
          .from("task_comments")
          .select("task_id, body, created_at")
          .eq("tenant_id", row.tenant_id)
          .in(
            "task_id",
            tasks.map((t) => t.id),
          )
          .is("deleted_at", null)
          .gte("created_at", new Date(nowMs - MIN_INTERVAL_MS).toISOString())
          .limit(500);
        for (const c of (existing ?? []) as { task_id: string; body: string }[]) {
          if (c.body?.startsWith(AUTO_PREFIX)) recent.add(c.task_id);
        }
      }

      const notes = tasks
        .filter((t) => !recent.has(t.id))
        .map((t) => {
          const overdue = Boolean(t.due_at && new Date(t.due_at).getTime() < nowMs);
          const parts: string[] = [];
          if (t.status === "done") parts.push("đã hoàn thành trong 24 giờ qua");
          else if (t.status === "blocked") parts.push("đang vướng mắc, cần tháo gỡ");
          else if (t.status === "in_progress")
            parts.push(`đang làm, tiến độ ${t.progress_pct ?? 0}%`);
          else parts.push("chưa bắt đầu");
          if (overdue && t.status !== "done") {
            parts.push(`quá hạn từ ${fmtDate(t.due_at as string)}`);
          }
          return {
            task_id: t.id,
            tenant_id: row.tenant_id,
            author_id: authorId,
            body: `${AUTO_PREFIX} ${parts.join("; ")}.`.slice(0, 4000),
          };
        });

      if (notes.length) {
        const { error: insErr } = await admin.from("task_comments").insert(notes);
        if (insErr) throw new Error(insErr.message);
        result.notes += notes.length;
      }

      const done = tasks.filter((t) => t.status === "done").length;
      const blocked = tasks.filter((t) => t.status === "blocked").length;
      const overdue = tasks.filter(
        (t) => t.due_at && new Date(t.due_at).getTime() < nowMs && t.status !== "done",
      ).length;

      const patch: Record<string, unknown> = {
        auto_standup_at: new Date().toISOString(),
        standup_snapshot: {
          window: "24h",
          tasksTouched: tasks.length,
          done,
          blocked,
          overdue,
          notes: notes.length,
        },
      };

      // Làm mới KPI ngay sau khi ghi nhận để Command Center hiển thị số liệu mới.
      try {
        const overview = await loadCeoOverview(admin, row.tenant_id, "week");
        patch["kpi_refreshed_at"] = new Date().toISOString();
        patch["kpi_snapshot"] = {
          score: overview.kpi.score ?? null,
          configured: overview.kpi.configured,
          totalTasks: overview.totals.tasks.current,
          completed: overview.totals.completed.current,
          overdue: overview.totals.overdue,
          aiSharePct: overview.split.aiSharePct,
        };
        result.kpiRefreshed += 1;
      } catch (e) {
        result.errors.push(
          `KPI ${row.tenant_id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200),
        );
      }

      await admin.from("ceo_kpi_settings").update(patch).eq("tenant_id", row.tenant_id);
      result.recorded += 1;
    } catch (e) {
      result.errors.push(
        `${row.tenant_id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200),
      );
    }
  }

  return result;
}
