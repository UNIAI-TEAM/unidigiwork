// Projects — server functions (tenant/workspace scoped, RLS enforced).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";

export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "canceled"] as const;

const statusSchema = z.enum(PROJECT_STATUSES);

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  name: string;
  code: string | null;
  description: string | null;
  notes: string | null;
  status: ProjectStatus;
  color: string | null;
  tags: string[];
  start_date: string | null;
  due_date: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectWithStats = ProjectRow & {
  taskTotal: number;
  taskDone: number;
  taskOverdue: number;
};

async function resolveWorkspaceTenant(
  supabase: { from: (t: string) => any },
  workspaceId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("tenant_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) mapPgError(error);
  if (!data?.tenant_id) throw new Error("WORKSPACE_NOT_FOUND");
  return data.tenant_id as string;
}

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        search: z.string().max(200).optional(),
        status: statusSchema.optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ProjectWithStats[]> => {
    let q = context.supabase
      .from("projects")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    const projects = (rows ?? []) as unknown as ProjectRow[];
    if (projects.length === 0) return [];

    const ids = projects.map((p) => p.id);
    const { data: taskRows, error: taskErr } = await context.supabase
      .from("tasks")
      .select("project_id, status, due_at")
      .in("project_id", ids)
      .is("deleted_at", null);
    if (taskErr) mapPgError(taskErr);

    const now = Date.now();
    const stats = new Map<string, { total: number; done: number; overdue: number }>();
    for (const t of (taskRows ?? []) as unknown as {
      project_id: string | null;
      status: string;
      due_at: string | null;
    }[]) {
      if (!t.project_id) continue;
      const s = stats.get(t.project_id) ?? { total: 0, done: 0, overdue: 0 };
      s.total += 1;
      if (t.status === "done") s.done += 1;
      else if (t.due_at && new Date(t.due_at).getTime() < now) s.overdue += 1;
      stats.set(t.project_id, s);
    }

    return projects.map((p) => {
      const s = stats.get(p.id) ?? { total: 0, done: 0, overdue: 0 };
      return { ...p, taskTotal: s.total, taskDone: s.done, taskOverdue: s.overdue };
    });
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: project, error } = await context.supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) mapPgError(error);
    if (!project) throw new Error("PROJECT_NOT_FOUND");

    const { data: tasks, error: taskErr } = await context.supabase
      .from("tasks")
      .select("id, title, status, priority, due_at, updated_at")
      .eq("project_id", data.projectId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (taskErr) mapPgError(taskErr);

    // Người phụ trách: task_assignees -> users (display_name/primary_email).
    const taskIds = (tasks ?? []).map((t) => t.id as string);
    const assigneeRows = taskIds.length
      ? await context.supabase
          .from("task_assignees")
          .select("task_id, user_id")
          .in("task_id", taskIds)
      : { data: [], error: null };
    const assigneeIds = Array.from(
      new Set(((assigneeRows.data ?? []) as Array<{ user_id: string }>).map((a) => a.user_id)),
    );
    const userRows = assigneeIds.length
      ? await context.supabase
          .from("users")
          .select("id, display_name, primary_email")
          .in("id", assigneeIds)
      : { data: [], error: null };
    const userName = new Map<string, string>();
    for (const u of (userRows.data ?? []) as Array<{
      id: string;
      display_name: string | null;
      primary_email: string | null;
    }>) {
      userName.set(u.id, u.display_name ?? u.primary_email ?? "Thành viên");
    }
    const assigneeMap = new Map<string, { id: string; name: string }[]>();
    for (const a of (assigneeRows.data ?? []) as Array<{
      task_id: string;
      user_id: string;
    }>) {
      const list = assigneeMap.get(a.task_id) ?? [];
      list.push({ id: a.user_id, name: userName.get(a.user_id) ?? "Thành viên" });
      assigneeMap.set(a.task_id, list);
    }

    return {
      project: project as unknown as ProjectRow,
      tasks: (tasks ?? []).map((t) => ({
        ...(t as unknown as {
          id: string;
          title: string;
          status: string;
          priority: string;
          due_at: string | null;
          updated_at: string;
        }),
        assignees: assigneeMap.get((t as unknown as { id: string }).id) ?? [],
      })),
    };
  });

const upsertShape = {
  name: z.string().min(1).max(200),
  code: z.string().max(40).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
  status: statusSchema.default("planning"),
  color: z.string().max(30).optional().nullable(),
  tags: z.array(z.string().max(50)).max(30).default([]),
  startDate: z.string().max(20).optional().nullable(),
  dueDate: z.string().max(20).optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
};

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ workspaceId: z.string().uuid(), ...upsertShape }).parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveWorkspaceTenant(context.supabase, data.workspaceId);
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert({
        tenant_id: tenantId,
        workspace_id: data.workspaceId,
        name: data.name,
        code: data.code || null,
        description: data.description || null,
        notes: data.notes || null,
        status: data.status,
        color: data.color || null,
        tags: data.tags,
        start_date: data.startDate || null,
        due_date: data.dueDate || null,
        owner_id: data.ownerId || context.userId,
        created_by: context.userId,
        updated_by: context.userId,
      } as never)
      .select("*")
      .single();
    if (error) mapPgError(error);
    return row as unknown as ProjectRow;
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        projectId: z.string().uuid(),
        ...upsertShape,
        name: upsertShape.name.optional(),
        status: statusSchema.optional(),
        tags: z.array(z.string().max(50)).max(30).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { updated_by: context.userId };
    if (data.name !== undefined) patch.name = data.name;
    if (data.code !== undefined) patch.code = data.code || null;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    if (data.status !== undefined) patch.status = data.status;
    if (data.color !== undefined) patch.color = data.color || null;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.startDate !== undefined) patch.start_date = data.startDate || null;
    if (data.dueDate !== undefined) patch.due_date = data.dueDate || null;
    if (data.ownerId !== undefined) patch.owner_id = data.ownerId || null;

    const { data: row, error } = await context.supabase
      .from("projects")
      .update(patch as never)
      .eq("id", data.projectId)
      .select("*")
      .single();
    if (error) mapPgError(error);
    return row as unknown as ProjectRow;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ deleted_at: new Date().toISOString(), updated_by: context.userId } as never)
      .eq("id", data.projectId);
    if (error) mapPgError(error);
    return { ok: true };
  });

export const setTaskProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        taskId: z.string().uuid(),
        projectId: z.string().uuid().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tasks")
      .update({ project_id: data.projectId, updated_by: context.userId } as never)
      .eq("id", data.taskId);
    if (error) mapPgError(error);
    return { ok: true };
  });

export type ProjectActivityItem = {
  id: string;
  at: string;
  actorName: string;
  kind: "TASK_CREATED" | "TASK_UPDATED" | "TASK_COMMENT" | "PROJECT_CREATED" | "PROJECT_UPDATED";
  title: string;
  detail: string | null;
};

/** Dòng thời gian hoạt động của dự án: tạo/cập nhật công việc, bình luận, ghi chú dự án. */
export const getProjectActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        projectId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(60),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ProjectActivityItem[]> => {
    const { data: project, error: pErr } = await context.supabase
      .from("projects")
      .select("id, name, created_at, updated_at, created_by, updated_by")
      .eq("id", data.projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (pErr) mapPgError(pErr);
    if (!project) throw new Error("PROJECT_NOT_FOUND");

    const { data: tasks, error: tErr } = await context.supabase
      .from("tasks")
      .select("id, title, status, created_at, updated_at, created_by, updated_by")
      .eq("project_id", data.projectId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (tErr) mapPgError(tErr);

    type TaskRow = {
      id: string;
      title: string;
      status: string;
      created_at: string;
      updated_at: string;
      created_by: string | null;
      updated_by: string | null;
    };
    const taskRows = (tasks ?? []) as unknown as TaskRow[];
    const taskIds = taskRows.map((t) => t.id);

    const commentsRes = taskIds.length
      ? await context.supabase
          .from("task_comments")
          .select("id, task_id, author_id, body, created_at")
          .in("task_id", taskIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [], error: null };
    if (commentsRes.error) mapPgError(commentsRes.error);
    type CommentRow = {
      id: string;
      task_id: string;
      author_id: string;
      body: string;
      created_at: string;
    };
    const comments = (commentsRes.data ?? []) as unknown as CommentRow[];

    const projectRow = project as unknown as {
      id: string;
      name: string;
      created_at: string;
      updated_at: string;
      created_by: string | null;
      updated_by: string | null;
    };

    const userIds = Array.from(
      new Set(
        [
          projectRow.created_by,
          projectRow.updated_by,
          ...taskRows.flatMap((t) => [t.created_by, t.updated_by]),
          ...comments.map((c) => c.author_id),
        ].filter((v): v is string => !!v),
      ),
    );
    const usersRes = userIds.length
      ? await context.supabase
          .from("users")
          .select("id, display_name, primary_email")
          .in("id", userIds)
      : { data: [], error: null };
    const nameOf = new Map<string, string>();
    for (const u of (usersRes.data ?? []) as Array<{
      id: string;
      display_name: string | null;
      primary_email: string | null;
    }>) {
      nameOf.set(u.id, u.display_name ?? u.primary_email ?? "Thành viên");
    }
    const actor = (uid: string | null) => (uid ? (nameOf.get(uid) ?? "Thành viên") : "Hệ thống");

    const items: ProjectActivityItem[] = [];
    items.push({
      id: `project-created-${projectRow.id}`,
      at: projectRow.created_at,
      actorName: actor(projectRow.created_by),
      kind: "PROJECT_CREATED",
      title: "Tạo dự án",
      detail: projectRow.name,
    });
    if (projectRow.updated_at !== projectRow.created_at) {
      items.push({
        id: `project-updated-${projectRow.id}`,
        at: projectRow.updated_at,
        actorName: actor(projectRow.updated_by),
        kind: "PROJECT_UPDATED",
        title: "Cập nhật dự án / ghi chú",
        detail: projectRow.name,
      });
    }
    for (const t of taskRows) {
      items.push({
        id: `task-created-${t.id}`,
        at: t.created_at,
        actorName: actor(t.created_by),
        kind: "TASK_CREATED",
        title: "Tạo công việc",
        detail: t.title,
      });
      if (t.updated_at !== t.created_at) {
        items.push({
          id: `task-updated-${t.id}`,
          at: t.updated_at,
          actorName: actor(t.updated_by),
          kind: "TASK_UPDATED",
          title: `Cập nhật công việc · ${t.status}`,
          detail: t.title,
        });
      }
    }
    const taskTitle = new Map(taskRows.map((t) => [t.id, t.title]));
    for (const c of comments) {
      items.push({
        id: `comment-${c.id}`,
        at: c.created_at,
        actorName: actor(c.author_id),
        kind: "TASK_COMMENT",
        title: `Bình luận · ${taskTitle.get(c.task_id) ?? "Công việc"}`,
        detail: c.body.slice(0, 200),
      });
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return items.slice(0, data.limit);
  });

// ---------------------------------------------------------------------------
// Thảo luận: bình luận cấp dự án (ghi chú) và bình luận theo công việc.
// ---------------------------------------------------------------------------

export type CommentItem = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
};

async function resolveNames(
  supabase: { from: (t: string) => any },
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return map;
  const { data } = await supabase
    .from("users")
    .select("id, display_name, primary_email")
    .in("id", unique);
  for (const u of (data ?? []) as Array<{
    id: string;
    display_name: string | null;
    primary_email: string | null;
  }>) {
    map.set(u.id, u.display_name ?? u.primary_email ?? "Thành viên");
  }
  return map;
}

export const listProjectComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<CommentItem[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_comments")
      .select("id, body, author_id, created_at")
      .eq("project_id", data.projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) mapPgError(error);
    const list = (rows ?? []) as unknown as Array<{
      id: string;
      body: string;
      author_id: string;
      created_at: string;
    }>;
    const names = await resolveNames(context.supabase, list.map((r) => r.author_id));
    return list.map((r) => ({
      id: r.id,
      body: r.body,
      authorId: r.author_id,
      authorName: names.get(r.author_id) ?? "Thành viên",
      createdAt: r.created_at,
    }));
  });

export const addProjectComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ projectId: z.string().uuid(), body: z.string().trim().min(1).max(4000) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: project, error: pErr } = await context.supabase
      .from("projects")
      .select("id, tenant_id")
      .eq("id", data.projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (pErr) mapPgError(pErr);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const { error } = await context.supabase.from("project_comments").insert({
      tenant_id: (project as unknown as { tenant_id: string }).tenant_id,
      project_id: data.projectId,
      author_id: context.userId,
      body: data.body,
    } as never);
    if (error) mapPgError(error);
    return { ok: true };
  });

export const listTaskComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<CommentItem[]> => {
    const { data: rows, error } = await context.supabase
      .from("task_comments")
      .select("id, body, author_id, created_at")
      .eq("task_id", data.taskId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) mapPgError(error);
    const list = (rows ?? []) as unknown as Array<{
      id: string;
      body: string;
      author_id: string;
      created_at: string;
    }>;
    const names = await resolveNames(context.supabase, list.map((r) => r.author_id));
    return list.map((r) => ({
      id: r.id,
      body: r.body,
      authorId: r.author_id,
      authorName: names.get(r.author_id) ?? "Thành viên",
      createdAt: r.created_at,
    }));
  });

export const addTaskComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ taskId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("comment_task", {
      _task_id: data.taskId,
      _body: data.body,
      _idempotency_key: crypto.randomUUID(),
    } as never);
    if (error) mapPgError(error);
    return { ok: true };
  });
