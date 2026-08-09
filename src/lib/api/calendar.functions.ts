// Calendar — server functions trả về sự kiện thật (meetings, tasks, deadline) theo khoảng thời gian. RLS applies.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";

export type CalendarEventKind = "meeting" | "task" | "deadline";

export type CalendarEventDTO = {
  id: string;
  title: string;
  kind: CalendarEventKind;
  /** ISO timestamp bắt đầu (hoặc hạn chót) */
  at: string;
  /** ISO timestamp kết thúc (chỉ meeting) */
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  project: string | null;
  attendees: { name: string; seed: string }[];
};

export const listCalendarEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        workspaceId: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<CalendarEventDTO[]> => {
    const supabase = context.supabase;
    const from = new Date(data.from).toISOString();
    const to = new Date(data.to).toISOString();

    let meetingsQ = supabase
      .from("meetings")
      .select("id, title, start_at, end_at, location, workspace_id, status")
      .is("deleted_at", null)
      .gte("start_at", from)
      .lte("start_at", to)
      .order("start_at", { ascending: true })
      .limit(500);
    let tasksQ = supabase
      .from("tasks")
      .select("id, title, due_at, priority, status, workspace_id")
      .is("deleted_at", null)
      .not("due_at", "is", null)
      .gte("due_at", from)
      .lte("due_at", to)
      .order("due_at", { ascending: true })
      .limit(500);

    if (data.workspaceId) {
      meetingsQ = meetingsQ.eq("workspace_id", data.workspaceId);
      tasksQ = tasksQ.eq("workspace_id", data.workspaceId);
    }

    const [meetingsRes, tasksRes] = await Promise.all([meetingsQ, tasksQ]);
    if (meetingsRes.error) mapPgError(meetingsRes.error);
    if (tasksRes.error) mapPgError(tasksRes.error);

    const meetings = meetingsRes.data ?? [];
    const tasks = tasksRes.data ?? [];

    // Workspace names
    const wsIds = Array.from(
      new Set([
        ...meetings.map((m) => m.workspace_id),
        ...tasks.map((t) => t.workspace_id),
      ]),
    ).filter(Boolean) as string[];
    const wsMap = new Map<string, string>();
    if (wsIds.length > 0) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id, name")
        .in("id", wsIds);
      for (const w of ws ?? []) wsMap.set(w.id, w.name);
    }

    // Meeting participants
    const attendeeMap = new Map<string, { name: string; seed: string }[]>();
    if (meetings.length > 0) {
      const { data: parts } = await supabase
        .from("meeting_participants")
        .select("meeting_id, user_id")
        .in(
          "meeting_id",
          meetings.map((m) => m.id),
        );
      const userIds = Array.from(new Set((parts ?? []).map((p) => p.user_id)));
      const nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, display_name, primary_email")
          .in("id", userIds);
        for (const u of users ?? [])
          nameMap.set(u.id, u.display_name ?? u.primary_email ?? "Thành viên");
      }
      for (const p of parts ?? []) {
        const list = attendeeMap.get(p.meeting_id) ?? [];
        list.push({ name: nameMap.get(p.user_id) ?? "Thành viên", seed: p.user_id });
        attendeeMap.set(p.meeting_id, list);
      }
    }

    const events: CalendarEventDTO[] = [];

    for (const m of meetings) {
      events.push({
        id: `meeting:${m.id}`,
        title: m.title,
        kind: "meeting",
        at: m.start_at,
        endAt: m.end_at,
        allDay: false,
        location: m.location ?? null,
        project: m.workspace_id ? (wsMap.get(m.workspace_id) ?? null) : null,
        attendees: attendeeMap.get(m.id) ?? [],
      });
    }

    for (const t of tasks) {
      // Task ưu tiên cao/khẩn cấp được coi là "hạn chót" trên lịch.
      const isDeadline = t.priority === "high" || t.priority === "urgent";
      events.push({
        id: `task:${t.id}`,
        title: t.title,
        kind: isDeadline ? "deadline" : "task",
        at: t.due_at as string,
        endAt: null,
        allDay: false,
        location: null,
        project: t.workspace_id ? (wsMap.get(t.workspace_id) ?? null) : null,
        attendees: [],
      });
    }

    events.sort((a, b) => a.at.localeCompare(b.at));
    return events;
  });