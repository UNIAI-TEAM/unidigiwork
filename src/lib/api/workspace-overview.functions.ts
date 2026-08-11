// Workspace detail — dữ liệu tổng hợp thật (workspace, members, tasks, documents,
// meetings, activity). Toàn bộ đọc qua RLS của caller.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";

export type WsMemberDTO = {
  userId: string;
  name: string;
  email: string;
  role: string;
  title: string;
  department: string;
  joinedAt: string;
};

export type WsTaskDTO = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  assignees: string[];
  updatedAt: string;
};

export type WsDocDTO = {
  id: string;
  title: string;
  folder: string;
  mimeType: string | null;
  sizeBytes: number | null;
  tags: string[];
  updatedAt: string;
  ownerId: string | null;
};

export type WsMeetingDTO = {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  status: string;
  location: string | null;
  conferenceProvider: string | null;
  attendees: number;
};

export type WsActivityDTO = {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  resourceType: string | null;
  resourceLabel: string;
  occurredAt: string;
};

export type WorkspaceOverviewDTO = {
  workspace: {
    id: string;
    name: string;
    ownerId: string;
    ownerName: string;
    timezone: string;
    createdAt: string;
    isOwner: boolean;
  };
  kpis: {
    members: number;
    openTasks: number;
    overdueTasks: number;
    doneTasks: number;
    documents: number;
    meetingsThisWeek: number;
    workflows: number;
  };
  members: WsMemberDTO[];
  tasks: WsTaskDTO[];
  documents: WsDocDTO[];
  meetings: WsMeetingDTO[];
  activity: WsActivityDTO[];
};

const UUID = z.string().uuid();

export const getWorkspaceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => z.object({ workspaceId: UUID }).parse(input))
  .handler(async ({ data, context }): Promise<WorkspaceOverviewDTO> => {
    const { supabase, userId } = context;
    const wsId = data.workspaceId;

    const { data: wsRow, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, name, owner_id, timezone, created_at, tenant_id")
      .eq("id", wsId)
      .is("deleted_at", null)
      .maybeSingle();
    if (wsErr) mapPgError(wsErr, "WORKSPACE_ACCESS_DENIED");
    if (!wsRow)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "Workspace không tồn tại." });

    const [membersRes, tasksRes, docsRes, meetingsRes, wfRes, auditRes] = await Promise.all([
      supabase
        .from("workspace_members")
        .select("user_id, role, created_at")
        .eq("workspace_id", wsId),
      supabase
        .from("tasks")
        .select("id, title, status, priority, due_at, updated_at")
        .eq("workspace_id", wsId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("documents")
        .select("id, title, folder, mime_type, size_bytes, tags, updated_at, created_by")
        .eq("workspace_id", wsId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("meetings")
        .select("id, title, start_at, end_at, status, location, conference_provider")
        .eq("workspace_id", wsId)
        .is("deleted_at", null)
        .order("start_at", { ascending: true })
        .limit(50),
      supabase
        .from("workflows")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .is("deleted_at", null),
      supabase
        .from("audit_events")
        .select("id, actor_user_id, action, resource_type, resource_id, occurred_at")
        .eq("tenant_id", wsRow.tenant_id)
        .order("occurred_at", { ascending: false })
        .limit(20),
    ]);

    if (membersRes.error) mapPgError(membersRes.error, "WORKSPACE_ACCESS_DENIED");
    if (tasksRes.error) mapPgError(tasksRes.error, "WORKSPACE_ACCESS_DENIED");
    if (docsRes.error) mapPgError(docsRes.error, "WORKSPACE_ACCESS_DENIED");
    if (meetingsRes.error) mapPgError(meetingsRes.error, "WORKSPACE_ACCESS_DENIED");

    const memberRows = (membersRes.data ?? []) as Array<{
      user_id: string;
      role: string;
      created_at: string;
    }>;
    const taskRows = (tasksRes.data ?? []) as Array<Record<string, unknown>>;
    const docRows = (docsRes.data ?? []) as Array<Record<string, unknown>>;
    const meetingRows = (meetingsRes.data ?? []) as Array<Record<string, unknown>>;
    const auditRows = (auditRes.data ?? []) as Array<Record<string, unknown>>;

    // Hồ sơ người dùng cho member + actor hoạt động.
    const userIds = Array.from(
      new Set<string>([
        wsRow.owner_id,
        ...memberRows.map((m) => m.user_id),
        ...auditRows.map((a) => a.actor_user_id).filter(Boolean),
      ]),
    );
    const [usersRes, profilesRes] = await Promise.all([
      userIds.length
        ? supabase.from("users").select("id, display_name, primary_email").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase
            .from("tenant_member_profiles")
            .select("user_id, title, department")
            .eq("tenant_id", wsRow.tenant_id)
            .in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const userMap = new Map<string, { name: string; email: string }>();
    for (const u of (usersRes.data ?? []) as Array<Record<string, unknown>>) {
      userMap.set(u.id, {
        name: u.display_name ?? u.primary_email ?? "Thành viên",
        email: u.primary_email ?? "",
      });
    }
    const profMap = new Map<string, { title: string; department: string }>();
    for (const p of (profilesRes.data ?? []) as Array<Record<string, unknown>>) {
      profMap.set(p.user_id, { title: p.title ?? "", department: p.department ?? "" });
    }

    // Người thực hiện nhiệm vụ.
    const taskIds = taskRows.map((t) => t.id as string);
    const assigneeMap = new Map<string, string[]>();
    if (taskIds.length) {
      const { data: asg } = await supabase
        .from("task_assignees")
        .select("task_id, user_id")
        .in("task_id", taskIds);
      for (const a of (asg ?? []) as Array<Record<string, unknown>>) {
        const list = assigneeMap.get(a.task_id) ?? [];
        list.push(a.user_id);
        assigneeMap.set(a.task_id, list);
      }
    }

    const now = Date.now();
    const weekAhead = now + 7 * 24 * 3600 * 1000;

    // Số người tham gia mỗi cuộc họp.
    const meetingIds = meetingRows.map((m) => m.id as string);
    const attendeeCount = new Map<string, number>();
    if (meetingIds.length) {
      const { data: parts } = await supabase
        .from("meeting_participants")
        .select("meeting_id")
        .in("meeting_id", meetingIds);
      for (const p of (parts ?? []) as Array<Record<string, unknown>>) {
        attendeeCount.set(p.meeting_id, (attendeeCount.get(p.meeting_id) ?? 0) + 1);
      }
    }

    const openTasks = taskRows.filter((t) => t.status !== "done" && t.status !== "canceled");
    const overdue = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);

    return {
      workspace: {
        id: wsRow.id,
        name: wsRow.name,
        ownerId: wsRow.owner_id,
        ownerName: userMap.get(wsRow.owner_id)?.name ?? "—",
        timezone: wsRow.timezone,
        createdAt: wsRow.created_at,
        isOwner: wsRow.owner_id === userId,
      },
      kpis: {
        members: memberRows.length,
        openTasks: openTasks.length,
        overdueTasks: overdue.length,
        doneTasks: taskRows.filter((t) => t.status === "done").length,
        documents: docRows.length,
        meetingsThisWeek: meetingRows.filter((m) => {
          const t = new Date(m.start_at).getTime();
          return t >= now && t <= weekAhead;
        }).length,
        workflows: wfRes.count ?? 0,
      },
      members: memberRows.map((m) => ({
        userId: m.user_id,
        name: userMap.get(m.user_id)?.name ?? "Thành viên",
        email: userMap.get(m.user_id)?.email ?? "",
        role: m.user_id === wsRow.owner_id ? "owner" : m.role,
        title: profMap.get(m.user_id)?.title ?? "",
        department: profMap.get(m.user_id)?.department ?? "",
        joinedAt: m.created_at,
      })),
      tasks: taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueAt: t.due_at ?? null,
        assignees: assigneeMap.get(t.id) ?? [],
        updatedAt: t.updated_at,
      })),
      documents: docRows.map((d) => ({
        id: d.id,
        title: d.title,
        folder: d.folder ?? "",
        mimeType: d.mime_type ?? null,
        sizeBytes: d.size_bytes ?? null,
        tags: Array.isArray(d.tags) ? d.tags : [],
        updatedAt: d.updated_at,
        ownerId: d.created_by ?? null,
      })),
      meetings: meetingRows.map((m) => ({
        id: m.id,
        title: m.title,
        startAt: m.start_at,
        endAt: m.end_at ?? null,
        status: String(m.status),
        location: m.location ?? null,
        conferenceProvider: m.conference_provider ?? null,
        attendees: attendeeCount.get(m.id) ?? 0,
      })),
      activity: auditRows.map((a) => ({
        id: a.id,
        actorId: a.actor_user_id ?? null,
        actorName: a.actor_user_id
          ? (userMap.get(a.actor_user_id)?.name ?? "Hệ thống")
          : "Hệ thống",
        action: a.action ?? "",
        resourceType: a.resource_type ?? null,
        resourceLabel: a.resource_id ?? "",
        occurredAt: a.occurred_at,
      })),
    };
  });
