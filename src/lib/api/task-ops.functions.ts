// TASK OPS — trang quản lý công việc riêng: danh sách việc đang chạy toàn tổ chức,
// gán lại người phụ trách qua RPC tenant-guarded (trigger tự cập nhật Work Graph).
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";

export type TaskOpsPerson = {
  userId: string;
  name: string;
  email: string;
};

export type TaskOpsItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  workspaceId: string;
  workspaceName: string;
  dueAt: string | null;
  updatedAt: string | null;
  overdue: boolean;
  assignees: TaskOpsPerson[];
  graphLinks: number;
  inGraph: boolean;
};

export type TaskOpsBoard = {
  tenantId: string | null;
  tasks: TaskOpsItem[];
  members: Record<string, TaskOpsPerson[]>;
};

type Ctx = { supabase: any; userId: string };

async function resolveTenant(ctx: Ctx): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from("tenant_members")
    .select("tenant_id, status")
    .eq("user_id", ctx.userId)
    .eq("status", "active");
  if (error) mapPgError(error, "TENANT_ACCESS_DENIED");
  const rows = (data ?? []) as Array<{ tenant_id: string }>;
  if (rows.length === 0) return null;
  const hint = getCookie(ACTIVE_TENANT_COOKIE);
  return (hint && rows.find((r) => r.tenant_id === hint)?.tenant_id) || rows[0].tenant_id;
}

/** Danh sách công việc đang chạy của tổ chức + người phụ trách + số liên kết Work Graph. */
export const listTaskOpsBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ includeDone: z.boolean().default(false) })
      .default({ includeDone: false })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<TaskOpsBoard> => {
    const ctx = context as unknown as Ctx;
    const tenantId = await resolveTenant(ctx);
    if (!tenantId) return { tenantId: null, tasks: [], members: {} };

    // Workspace trong phạm vi quyền (RLS lọc).
    const { data: wsRows, error: wsErr } = await ctx.supabase
      .from("workspaces")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .limit(200);
    if (wsErr) mapPgError(wsErr);
    const workspaces = (wsRows ?? []) as Array<{ id: string; name: string }>;
    if (workspaces.length === 0) return { tenantId, tasks: [], members: {} };
    const wsName = new Map(workspaces.map((w) => [w.id, w.name]));
    const wsIds = workspaces.map((w) => w.id);

    const { data: taskRows, error: tErr } = await ctx.supabase.rpc("list_tenant_open_tasks", {
      _tenant_id: tenantId,
      _include_done: data.includeDone,
      _limit: 300,
    });
    if (tErr) mapPgError(tErr, "TENANT_ACCESS_DENIED");
    const tasks = (taskRows ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      workspace_id: string;
      due_at: string | null;
      updated_at: string | null;
    }>;
    if (tasks.length === 0) return { tenantId, tasks: [], members: {} };
    const taskIds = tasks.map((t) => t.id);

    const [assignRes, memberRes, nodeRes] = await Promise.all([
      ctx.supabase.from("task_assignees").select("task_id, user_id, role").in("task_id", taskIds),
      ctx.supabase
        .from("workspace_members")
        .select("workspace_id, user_id")
        .in("workspace_id", wsIds),
      ctx.supabase
        .from("work_nodes")
        .select("id, entity_id")
        .eq("tenant_id", tenantId)
        .eq("entity_type", "TASK")
        .in("entity_id", taskIds),
    ]);
    if (assignRes.error) mapPgError(assignRes.error);
    if (memberRes.error) mapPgError(memberRes.error);

    const assignRows = (assignRes.data ?? []) as Array<{ task_id: string; user_id: string }>;
    const memberRows = (memberRes.data ?? []) as Array<{ workspace_id: string; user_id: string }>;

    const userIds = Array.from(
      new Set([...assignRows.map((a) => a.user_id), ...memberRows.map((m) => m.user_id)]),
    );
    const people = new Map<string, TaskOpsPerson>();
    if (userIds.length > 0) {
      const { data: users } = await ctx.supabase
        .from("users")
        .select("id, display_name, primary_email")
        .in("id", userIds);
      for (const u of (users ?? []) as Array<{
        id: string;
        display_name: string | null;
        primary_email: string | null;
      }>) {
        people.set(u.id, {
          userId: u.id,
          name: u.display_name || u.primary_email || "—",
          email: u.primary_email ?? "",
        });
      }
    }
    const person = (id: string): TaskOpsPerson =>
      people.get(id) ?? { userId: id, name: "—", email: "" };

    // Số liên kết Work Graph của từng công việc.
    const nodes = (nodeRes.data ?? []) as Array<{ id: string; entity_id: string }>;
    const nodeToTask = new Map(nodes.map((n) => [n.id, n.entity_id]));
    const links = new Map<string, number>();
    if (nodes.length > 0) {
      const ids = nodes.map((n) => n.id);
      const { data: edges } = await ctx.supabase
        .from("work_edges")
        .select("source_node_id, target_node_id")
        .eq("tenant_id", tenantId)
        .or(`source_node_id.in.(${ids.join(",")}),target_node_id.in.(${ids.join(",")})`);
      for (const e of (edges ?? []) as Array<{
        source_node_id: string;
        target_node_id: string;
      }>) {
        for (const nid of [e.source_node_id, e.target_node_id]) {
          const tid = nodeToTask.get(nid);
          if (tid) links.set(tid, (links.get(tid) ?? 0) + 1);
        }
      }
    }
    const inGraph = new Set(nodes.map((n) => n.entity_id));

    const byTask = new Map<string, TaskOpsPerson[]>();
    for (const a of assignRows) {
      const list = byTask.get(a.task_id) ?? [];
      list.push(person(a.user_id));
      byTask.set(a.task_id, list);
    }

    const members: Record<string, TaskOpsPerson[]> = {};
    for (const m of memberRows) {
      (members[m.workspace_id] ??= []).push(person(m.user_id));
    }
    for (const key of Object.keys(members)) {
      members[key].sort((a, b) => a.name.localeCompare(b.name, "vi"));
    }

    const now = Date.now();
    return {
      tenantId,
      members,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        workspaceId: t.workspace_id,
        workspaceName: wsName.get(t.workspace_id) ?? "",
        dueAt: t.due_at,
        updatedAt: t.updated_at,
        overdue: Boolean(t.due_at && new Date(t.due_at).getTime() < now && t.status !== "done"),
        assignees: byTask.get(t.id) ?? [],
        graphLinks: links.get(t.id) ?? 0,
        inGraph: inGraph.has(t.id),
      })),
    };
  });

/** Gán lại người phụ trách chính — RPC gỡ người cũ và gán người mới, Work Graph tự cập nhật. */
export const reassignTaskOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        taskId: z.string().uuid(),
        assigneeId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ taskId: string; assigneeId: string }> => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase.rpc("reassign_task", {
      _task_id: data.taskId,
      _assignee_id: data.assigneeId,
      _idempotency_key: data.idempotencyKey ?? null,
      _correlation_id: data.correlationId ?? null,
    });
    if (error) {
      mapPgError(error, "TASK_NOT_FOUND");
      throw new ApiError({ code: "TASK_NOT_FOUND", message: "TASK_NOT_FOUND" });
    }
    return { taskId: data.taskId, assigneeId: data.assigneeId };
  });
