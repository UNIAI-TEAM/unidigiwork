// GIAO BAN TỰ ĐỘNG MỖI SÁNG — ghi nhận kết quả 24 giờ qua vào nhật ký công việc
// và làm mới KPI của Command Center mà không cần thao tác thủ công.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadCeoOverview } from "./ceo.server";
import { recordKpiSnapshot } from "./kpi-snapshot.server";

const ADMIN_ROLES = ["tenant_owner", "tenant_admin"];
const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // tối đa 1 lần / ngày
const MAX_TASKS_PER_TENANT = 30;
const AUTO_PREFIX = "[Giao ban tự động]";

export type DailyStandupResult = {
  tenants: number;
  recorded: number;
  skipped: number;
  notes: number;
  meetings: number;
  kpiRefreshed: number;
  errors: string[];
};

// Buổi giao ban mặc định: 08:30–09:00 giờ Việt Nam mỗi ngày.
const MEETING_TZ = "Asia/Ho_Chi_Minh";
const MEETING_TITLE = "Giao ban hằng ngày";
const MEETING_LOCATION = "Phòng họp trực tuyến UniWork";
const MEETING_START_HOUR_VN = 8;
const MEETING_START_MINUTE_VN = 30;
const MEETING_MINUTES = 30;
const MAX_MEETING_PARTICIPANTS = 100;

/** Mốc bắt đầu buổi giao ban của ngày hiện tại theo giờ Việt Nam (trả về UTC). */
function todayStandupStart(now = new Date()): Date {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const startUtcMs = Date.UTC(
    vn.getUTCFullYear(),
    vn.getUTCMonth(),
    vn.getUTCDate(),
    MEETING_START_HOUR_VN - 7,
    MEETING_START_MINUTE_VN,
    0,
    0,
  );
  return new Date(startUtcMs);
}

/** Tạo buổi giao ban trên lịch họp nếu hôm nay chưa có. Idempotent theo ngày. */
async function ensureDailyStandupMeeting(
  admin: any,
  tenantId: string,
  hostId: string,
): Promise<"created" | "exists" | "no_workspace"> {
  const start = todayStandupStart();
  const end = new Date(start.getTime() + MEETING_MINUTES * 60 * 1000);
  const dayStart = new Date(start.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const dayEnd = new Date(start.getTime() + 12 * 60 * 60 * 1000).toISOString();

  const { data: existing } = await admin
    .from("meetings")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("title", MEETING_TITLE)
    .is("deleted_at", null)
    .gte("start_at", dayStart)
    .lt("start_at", dayEnd)
    .limit(1)
    .maybeSingle();
  if (existing) return "exists";

  const { data: ws } = await admin
    .from("workspaces")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const workspaceId = (ws as { id?: string } | null)?.id;
  if (!workspaceId) return "no_workspace";

  const { data: created, error: insErr } = await admin
    .from("meetings")
    .insert({
      tenant_id: tenantId,
      workspace_id: workspaceId,
      title: MEETING_TITLE,
      agenda:
        "Điểm lại kết quả 24 giờ qua, việc quá hạn và vướng mắc. Nhật ký từng việc đã được hệ thống ghi tự động.",
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      timezone: MEETING_TZ,
      location: MEETING_LOCATION,
      status: "scheduled",
      created_by: hostId,
    })
    .select("id")
    .maybeSingle();
  if (insErr) throw new Error(insErr.message);
  const meetingId = (created as { id?: string } | null)?.id;
  if (!meetingId) throw new Error("MEETING_INSERT_FAILED");

  const { data: members } = await admin
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .limit(MAX_MEETING_PARTICIPANTS);
  const ids = new Set<string>([hostId]);
  for (const m of (members ?? []) as { user_id: string }[]) ids.add(m.user_id);

  await admin.from("meeting_participants").insert(
    [...ids].map((userId) => ({
      meeting_id: meetingId,
      user_id: userId,
      role: userId === hostId ? "host" : "attendee",
      rsvp: "pending",
    })),
  );

  return "created";
}

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
    meetings: 0,
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
      const SELECT = "id, title, status, progress_pct, due_at, completed_at, updated_at";

      // 1) Việc đang mở trong bảng giao ban (sắp đến hạn trước) — ghi nhận kết quả từng việc.
      const { data: boardData, error: boardErr } = await admin
        .from("tasks")
        .select(SELECT)
        .eq("tenant_id", row.tenant_id)
        .is("deleted_at", null)
        .in("status", ["todo", "in_progress", "blocked"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(MAX_TASKS_PER_TENANT);
      if (boardErr) throw new Error(boardErr.message);

      // 2) Việc vừa thay đổi trong 24 giờ qua (kể cả đã hoàn thành).
      const { data: taskData, error: taskErr } = await admin
        .from("tasks")
        .select(SELECT)
        .eq("tenant_id", row.tenant_id)
        .is("deleted_at", null)
        .neq("status", "canceled")
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(MAX_TASKS_PER_TENANT);
      if (taskErr) throw new Error(taskErr.message);

      const byId = new Map<string, TaskRow>();
      for (const t of [...((boardData ?? []) as TaskRow[]), ...((taskData ?? []) as TaskRow[])]) {
        byId.set(t.id, t);
      }
      const tasks = [...byId.values()].slice(0, MAX_TASKS_PER_TENANT);
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

      // Tự tạo buổi giao ban hằng ngày trên lịch họp (một buổi / ngày / tổ chức).
      try {
        const meeting = await ensureDailyStandupMeeting(admin, row.tenant_id, authorId);
        if (meeting === "created") result.meetings += 1;
        (patch["standup_snapshot"] as Record<string, unknown>)["meeting"] = meeting;
      } catch (e) {
        result.errors.push(
          `Lịch họp ${row.tenant_id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200),
        );
      }

      // Làm mới KPI ngay sau khi ghi nhận để Command Center hiển thị số liệu mới.
      try {
        const overview = await loadCeoOverview(admin, row.tenant_id, "week");
        const values = {
          score: overview.kpi.score ?? null,
          configured: overview.kpi.configured,
          totalTasks: overview.totals.tasks.current,
          completed: overview.totals.completed.current,
          overdue: overview.totals.overdue,
          aiSharePct: overview.split.aiSharePct,
        };
        patch["kpi_refreshed_at"] = new Date().toISOString();
        patch["kpi_snapshot"] = values;
        await recordKpiSnapshot(admin, row.tenant_id, "standup", values);
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
