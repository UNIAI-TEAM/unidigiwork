// Projects — server functions (tenant/workspace scoped, RLS enforced).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";

export const PROJECT_STATUSES = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "canceled",
] as const;

const statusSchema = z.enum(PROJECT_STATUSES);

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  name: string;
  code: string | null;
  description: string | null;
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

    return {
      project: project as unknown as ProjectRow,
      tasks: (tasks ?? []) as unknown as {
        id: string;
        title: string;
        status: string;
        priority: string;
        due_at: string | null;
        updated_at: string;
      }[],
    };
  });

const upsertShape = {
  name: z.string().min(1).max(200),
  code: z.string().max(40).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
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
