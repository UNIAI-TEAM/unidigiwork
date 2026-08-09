// Dashboard — server functions cung cấp dữ liệu thật cho các widget /dashboard (RLS applies).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";
import type { ReportOverview } from "./reports.functions";

export type DashboardRecentItem = {
  id: string;
  who: string;
  what: string;
  target: string;
  area: "Tasks" | "Documents" | "Meetings" | "Workflows";
  at: string;
};

export type DashboardMeeting = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  participants: number;
};

export type DashboardProject = {
  id: string;
  name: string;
  progress: number;
  tasks: number;
  members: number;
};

export type DashboardOverview = {
  overview: ReportOverview | null;
  projects: DashboardProject[];
  recent: DashboardRecentItem[];
  meetings: DashboardMeeting[];
};

export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        rangeDays: z.number().int().min(1).max(90).default(7),
        workspaceId: z.string().uuid().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<DashboardOverview> => {
    const supabase = context.supabase;
    const now = new Date();
    const from = new Date(now.getTime() - data.rangeDays * 86400_000).toISOString();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400_000);

    const overviewP = supabase.rpc("report_overview_range", {
      _from: from,
      _to: now.toISOString(),
      _workspace_id: data.workspaceId ?? undefined,
    });

    let tasksQ = supabase
      .from("tasks")
      .select("id, title, status, updated_at, updated_by, workspace_id")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(10);
    let docsQ = supabase
      .from("documents")
      .select("id, title, updated_at, updated_by, workspace_id")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(10);
    let meetRecentQ = supabase
      .from("meetings")
      .select("id, title, updated_at, updated_by, workspace_id")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(10);
    let wfQ = supabase
      .from("workflows")
      .select("id, name, updated_at, updated_by, workspace_id")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(10);
    let todayQ = supabase
      .from("meetings")
      .select("id, title, start_at, end_at, meeting_participants(user_id)")
      .is("deleted_at", null)
      .gte("start_at", dayStart.toISOString())
      .lt("start_at", dayEnd.toISOString())
      .order("start_at", { ascending: true })
      .limit(10);

    if (data.workspaceId) {
      tasksQ = tasksQ.eq("workspace_id", data.workspaceId);
      docsQ = docsQ.eq("workspace_id", data.workspaceId);
      meetRecentQ = meetRecentQ.eq("workspace_id", data.workspaceId);
      wfQ = wfQ.eq("workspace_id", data.workspaceId);
      todayQ = todayQ.eq("workspace_id", data.workspaceId);
    }

    const [overviewR, tasksR, docsR, meetsR, wfR, todayR] = await Promise.all([
      overviewP,
      tasksQ,
      docsQ,
      meetRecentQ,
      wfQ,
      todayQ,
    ]);

    for (const r of [overviewR, tasksR, docsR, meetsR, wfR, todayR]) {
      if (r.error) mapPgError(r.error);
    }

    const overview = (overviewR.data ?? null) as ReportOverview | null;

    type Raw = {
      id: string;
      label: string;
      at: string;
      by: string | null;
      area: DashboardRecentItem["area"];
      what: string;
    };
    const raw: Raw[] = [
      ...((tasksR.data ?? []) as Array<Record<string, unknown>>).map((t) => ({
        id: `task-${t.id}`,
        label: t.title as string,
        at: t.updated_at as string,
        by: (t.updated_by as string | null) ?? null,
        area: "Tasks" as const,
        what: t.status === "done" ? "đã hoàn thành nhiệm vụ" : "đã cập nhật nhiệm vụ",
      })),
      ...((docsR.data ?? []) as Array<Record<string, unknown>>).map((d) => ({
        id: `doc-${d.id}`,
        label: d.title as string,
        at: d.updated_at as string,
        by: (d.updated_by as string | null) ?? null,
        area: "Documents" as const,
        what: "đã cập nhật tài liệu",
      })),
      ...((meetsR.data ?? []) as Array<Record<string, unknown>>).map((m) => ({
        id: `meet-${m.id}`,
        label: m.title as string,
        at: m.updated_at as string,
        by: (m.updated_by as string | null) ?? null,
        area: "Meetings" as const,
        what: "đã cập nhật cuộc họp",
      })),
      ...((wfR.data ?? []) as Array<Record<string, unknown>>).map((w) => ({
        id: `wf-${w.id}`,
        label: w.name as string,
        at: w.updated_at as string,
        by: (w.updated_by as string | null) ?? null,
        area: "Workflows" as const,
        what: "đã cập nhật quy trình",
      })),
    ]
      .filter((r) => !!r.at)
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 8);

    const userIds = Array.from(new Set(raw.map((r) => r.by).filter(Boolean))) as string[];
    const names = new Map<string, string>();
    if (userIds.length) {
      const { data: users } = await supabase
        .from("users")
        .select("id, display_name, primary_email")
        .in("id", userIds);
      for (const u of users ?? [])
        names.set(
          u.id as string,
          (u.display_name as string) || (u.primary_email as string) || "Thành viên",
        );
    }

    const recent: DashboardRecentItem[] = raw.map((r) => ({
      id: r.id,
      who: (r.by && names.get(r.by)) || "Hệ thống",
      what: r.what,
      target: r.label,
      area: r.area,
      at: r.at,
    }));

    const projects: DashboardProject[] = (overview?.workspaces ?? []).slice(0, 4).map((w) => ({
      id: w.id,
      name: w.name,
      progress: w.progress,
      tasks: w.tasks,
      members: w.members,
    }));

    const meetings: DashboardMeeting[] = (
      (todayR.data ?? []) as Array<Record<string, unknown>>
    ).map((m) => ({
      id: m.id as string,
      title: m.title as string,
      start_at: m.start_at as string,
      end_at: m.end_at as string,
      participants: Array.isArray(m.meeting_participants) ? m.meeting_participants.length : 0,
    }));

    return { overview, projects, recent, meetings };
  });
