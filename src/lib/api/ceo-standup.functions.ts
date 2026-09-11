// GIAO BAN THỰC TẾ — CEO ghi nhận kết quả từng công việc trong cuộc họp.
// Chỉ dùng lại các lệnh hiện có (transition_task, comment_task, cập nhật tiến độ)
// nên KPI của Command Center và nhật ký hoạt động tự cập nhật theo dữ liệu thật.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";

export type StandupMeeting = {
  id: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  status: string | null;
  location: string | null;
};

export type StandupTask = {
  id: string;
  title: string;
  status: string;
  progressPct: number | null;
  dueAt: string | null;
  projectId: string | null;
  projectName: string | null;
  overdue: boolean;
  lastNote: string | null;
  lastNoteAt: string | null;
};

export type StandupBoard = {
  meetings: StandupMeeting[];
  tasks: StandupTask[];
  summary: { total: number; done: number; inProgress: number; overdue: number; avgProgress: number };
};

/** Danh sách cuộc họp gần đây và công việc cần điểm danh trong buổi giao ban. */
export const getStandupBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        projectId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(100).default(40),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<StandupBoard> => {
    const now = Date.now();
    const from = new Date(now - 7 * 86400000).toISOString();
    const to = new Date(now + 7 * 86400000).toISOString();

    const meetingsRes = await context.supabase
      .from("meetings")
      .select("id, title, start_at, end_at, status, location")
      .eq("workspace_id", data.workspaceId)
      .is("deleted_at", null)
      .gte("start_at", from)
      .lte("start_at", to)
      .order("start_at", { ascending: false })
      .limit(20);
    if (meetingsRes.error) mapPgError(meetingsRes.error);

    let taskQuery = context.supabase
      .from("tasks")
      .select("id, title, status, progress_pct, due_at, project_id, updated_at")
      .eq("workspace_id", data.workspaceId)
      .is("deleted_at", null)
      .not("status", "in", "(canceled)")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(data.limit);
    if (data.projectId) taskQuery = taskQuery.eq("project_id", data.projectId);
    const tasksRes = await taskQuery;
    if (tasksRes.error) mapPgError(tasksRes.error);

    const rawTasks = (tasksRes.data ?? []) as unknown as Array<{
      id: string;
      title: string;
      status: string;
      progress_pct: number | null;
      due_at: string | null;
      project_id: string | null;
    }>;

    const projectIds = [...new Set(rawTasks.map((t) => t.project_id).filter(Boolean))] as string[];
    const projectNames = new Map<string, string>();
    if (projectIds.length) {
      const pr = await context.supabase.from("projects").select("id, name").in("id", projectIds);
      for (const p of (pr.data ?? []) as Array<{ id: string; name: string }>) {
        projectNames.set(p.id, p.name);
      }
    }

    const lastNotes = new Map<string, { body: string; at: string }>();
    if (rawTasks.length) {
      const cr = await context.supabase
        .from("task_comments")
        .select("task_id, body, created_at")
        .in(
          "task_id",
          rawTasks.map((t) => t.id),
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      for (const c of (cr.data ?? []) as Array<{
        task_id: string;
        body: string;
        created_at: string;
      }>) {
        if (!lastNotes.has(c.task_id)) lastNotes.set(c.task_id, { body: c.body, at: c.created_at });
      }
    }

    const tasks: StandupTask[] = rawTasks.map((t) => {
      const note = lastNotes.get(t.id);
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        progressPct: t.progress_pct,
        dueAt: t.due_at,
        projectId: t.project_id,
        projectName: t.project_id ? (projectNames.get(t.project_id) ?? null) : null,
        overdue: Boolean(t.due_at && new Date(t.due_at).getTime() < now && t.status !== "done"),
        lastNote: note?.body ?? null,
        lastNoteAt: note?.at ?? null,
      };
    });

    const done = tasks.filter((t) => t.status === "done").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const overdue = tasks.filter((t) => t.overdue).length;
    const progressValues = tasks.map((t) => t.progressPct ?? (t.status === "done" ? 100 : 0));
    const avgProgress = progressValues.length
      ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
      : 0;

    return {
      meetings: ((meetingsRes.data ?? []) as unknown as Array<Record<string, unknown>>).map((m) => ({
        id: m['id'] as string,
        title: (m['title'] as string) ?? "Cuộc họp",
        startAt: (m['start_at'] as string) ?? null,
        endAt: (m['end_at'] as string) ?? null,
        status: (m['status'] as string) ?? null,
        location: (m['location'] as string) ?? null,
      })),
      tasks,
      summary: { total: tasks.length, done, inProgress, overdue, avgProgress },
    };
  });

/**
 * Ghi nhận kết quả một công việc trong buổi giao ban:
 * đổi trạng thái, cập nhật tiến độ và lưu ghi chú vào nhật ký công việc.
 */
export const recordStandupOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        taskId: z.string().uuid(),
        meetingTitle: z.string().max(300).nullable().optional(),
        status: z.enum(["todo", "in_progress", "blocked", "done"]).nullable().optional(),
        progressPct: z.number().int().min(0).max(100).nullable().optional(),
        note: z.string().max(4000).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: task, error: readErr } = await context.supabase
      .from("tasks")
      .select("id, status, progress_pct")
      .eq("id", data.taskId)
      .is("deleted_at", null)
      .maybeSingle();
    if (readErr) mapPgError(readErr);
    if (!task) throw new Error("TASK_NOT_FOUND");
    const current = task as unknown as { status: string; progress_pct: number | null };

    const changes: string[] = [];

    if (data.status && data.status !== current.status) {
      const res = await context.supabase.rpc("transition_task", {
        _task_id: data.taskId,
        _to_status: data.status,
        _idempotency_key: crypto.randomUUID(),
      } as never);
      if (res.error) mapPgError(res.error);
      changes.push(`trạng thái: ${current.status} → ${data.status}`);
    }

    const nextPct = data.progressPct;
    if (nextPct !== undefined && nextPct !== null && nextPct !== current.progress_pct) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: upErr } = await supabaseAdmin
        .from("tasks")
        .update({ progress_pct: nextPct, updated_by: context.userId } as never)
        .eq("id", data.taskId)
        .is("deleted_at", null);
      if (upErr) mapPgError(upErr);
      changes.push(`tiến độ: ${current.progress_pct ?? 0}% → ${nextPct}%`);
    }

    const noteText = data.note?.trim();
    if (noteText || changes.length) {
      const header = data.meetingTitle?.trim()
        ? `[Giao ban · ${data.meetingTitle.trim()}]`
        : "[Giao ban]";
      const body = [header, noteText, changes.length ? `(${changes.join("; ")})` : ""]
        .filter(Boolean)
        .join(" ")
        .slice(0, 9000);
      const res = await context.supabase.rpc("comment_task", {
        _task_id: data.taskId,
        _body: body,
        _idempotency_key: crypto.randomUUID(),
      } as never);
      if (res.error) mapPgError(res.error);
    }

    return { ok: true as const, changes };
  });
