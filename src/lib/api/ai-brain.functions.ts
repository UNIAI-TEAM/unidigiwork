// AI BRAIN — read-only overview cho màn hình tổng quan AI.
// Không ghi dữ liệu. Mọi truy vấn đi qua RLS của người dùng hiện tại.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

const fail = (code: string, message: string) => new ApiError({ code: code as never, message });

const Input = z.object({ workspaceId: z.string().uuid().nullable().optional() });

export type AiBrainLogEntry = {
  id: string;
  title: string;
  description: string | null;
  actionType: string;
  status: string;
  risk: string;
  source: string;
  aiWorkerId: string | null;
  createdAt: string;
};

export type AiBrainOverview = {
  metrics: {
    pending: number;
    approvedThisWeek: number;
    rejectedThisWeek: number;
    acceptanceRate: number;
    tokensThisWeek: number;
  };
  /** Kỹ năng đang tắt nhưng có khai báo hành động — AI sẽ không đề xuất các hành động này. */
  disabledSkills: { id: string; name: string; actionTypes: string[] }[];
  log: AiBrainLogEntry[];
};

const PENDING = ["PROPOSED", "PREVIEWED"];
const REJECTED = ["CANCELLED", "FAILED", "EXPIRED"];

export const getAiBrainOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }): Promise<AiBrainOverview> => {
    let tenantId: string | null = null;
    if (data.workspaceId) {
      const { data: ws, error: wsErr } = await context.supabase
        .from("workspaces")
        .select("id, tenant_id")
        .eq("id", data.workspaceId)
        .maybeSingle();
      if (wsErr || !ws) throw fail("WORKSPACE_NOT_FOUND", "Không tìm thấy không gian làm việc.");
      tenantId = ws.tenant_id as string;
    } else {
      // "Tất cả không gian làm việc": lấy tổ chức đang hoạt động của người dùng (RLS bảo vệ).
      const { data: rows } = await context.supabase
        .from("tenant_members")
        .select("tenant_id")
        .eq("user_id", context.userId)
        .eq("status", "active")
        .limit(2);
      if ((rows ?? []).length === 1) tenantId = (rows as { tenant_id: string }[])[0].tenant_id;
    }
    if (!tenantId) throw fail("WORKSPACE_NOT_FOUND", "Không tìm thấy không gian làm việc.");

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [pendingRes, approvedRes, rejectedRes, logRes, usageRes] = await Promise.all([
      context.supabase
        .from("ai_action_proposals")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", PENDING),
      context.supabase
        .from("ai_action_proposals")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "SUCCEEDED")
        .gte("created_at", weekAgo),
      context.supabase
        .from("ai_action_proposals")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", REJECTED)
        .gte("created_at", weekAgo),
      context.supabase
        .from("ai_action_proposals")
        .select(
          "id, title, description, action_type, status, risk, source, ai_worker_id, created_at",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("ai_usage_events")
        .select("total_tokens")
        .eq("tenant_id", tenantId)
        .gte("created_at", weekAgo)
        .limit(1000),
    ]);

    const { data: skillRows } = await context.supabase
      .from("ai_skills")
      .select("id, name, enabled, action_types")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .eq("enabled", false);
    const disabledSkills = (skillRows ?? [])
      .filter((r) => ((r.action_types as string[] | null) ?? []).length > 0)
      .map((r) => ({
        id: r.id as string,
        name: (r.name as string) ?? "",
        actionTypes: ((r.action_types as string[] | null) ?? []) as string[],
      }));

    const approved = approvedRes.count ?? 0;
    const rejected = rejectedRes.count ?? 0;
    const decided = approved + rejected;
    const tokensThisWeek = (usageRes.data ?? []).reduce(
      (sum, r: { total_tokens: number | null }) => sum + (r.total_tokens ?? 0),
      0,
    );

    return {
      metrics: {
        pending: pendingRes.count ?? 0,
        approvedThisWeek: approved,
        rejectedThisWeek: rejected,
        acceptanceRate: decided === 0 ? 0 : Math.round((approved / decided) * 100),
        tokensThisWeek,
      },
      disabledSkills,
      log: (logRes.data ?? []).map((r) => ({
        id: r.id as string,
        title: (r.title as string) ?? "",
        description: (r.description as string | null) ?? null,
        actionType: (r.action_type as string) ?? "",
        status: (r.status as string) ?? "",
        risk: (r.risk as string) ?? "LOW",
        source: (r.source as string) ?? "",
        aiWorkerId: (r.ai_worker_id as string | null) ?? null,
        createdAt: r.created_at as string,
      })),
    };
  });

// ===== GIAO VIỆC THEO VAI TRÒ =====
// Bộ não AI nhìn theo vai trò (ai_workers), không chỉ theo hồ sơ mặc định.

const WorkspaceInput = z.object({ workspaceId: z.string().uuid() });

async function tenantOf(context: any, workspaceId: string) {
  const { data, error } = await context.supabase
    .from("workspaces")
    .select("id, tenant_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error || !data) throw fail("WORKSPACE_NOT_FOUND", "Không tìm thấy không gian làm việc.");
  return data.tenant_id as string;
}

export type RoleWorkload = {
  workerId: string;
  name: string;
  role: string;
  status: string;
  total: number;
  done: number;
  avgProgress: number;
  stalled: { id: string; title: string; status: string; progressPct: number; reason: string }[];
};

const STALE_DAYS = 7;

/** Khối lượng và tiến độ công việc theo từng vai trò AI, kèm danh sách việc ì ạch. */
export const getRoleWorkload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => WorkspaceInput.parse(i))
  .handler(async ({ data, context }): Promise<RoleWorkload[]> => {
    const tenantId = await tenantOf(context, data.workspaceId);
    const { data: workers } = await context.supabase
      .from("ai_workers")
      .select("id, name, role, status")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });
    const list = (workers ?? []) as { id: string; name: string; role: string; status: string }[];
    if (!list.length) return [];

    const { data: tasks } = await context.supabase
      .from("tasks")
      .select("id, title, status, progress_pct, due_at, updated_at, ai_worker_id")
      .eq("tenant_id", tenantId)
      .in(
        "ai_worker_id",
        list.map((w) => w.id),
      )
      .is("deleted_at", null)
      .limit(500);
    const rows = (tasks ?? []) as any[];
    const now = Date.now();
    const staleMs = STALE_DAYS * 24 * 60 * 60 * 1000;

    return list.map((w) => {
      const own = rows.filter((t) => t.ai_worker_id === w.id);
      const open = own.filter((t) => !["done", "canceled"].includes(t.status));
      const progress = own.length
        ? Math.round(own.reduce((s, t) => s + (t.progress_pct ?? 0), 0) / own.length)
        : 0;
      const stalled = open
        .map((t) => {
          const overdue = t.due_at && new Date(t.due_at).getTime() < now;
          const stale = t.updated_at && now - new Date(t.updated_at).getTime() > staleMs;
          if (!overdue && !stale) return null;
          return {
            id: t.id as string,
            title: t.title as string,
            status: t.status as string,
            progressPct: (t.progress_pct ?? 0) as number,
            reason: overdue ? "Quá hạn" : `Không cập nhật hơn ${STALE_DAYS} ngày`,
          };
        })
        .filter(Boolean)
        .slice(0, 5) as RoleWorkload["stalled"];
      return {
        workerId: w.id,
        name: w.name,
        role: w.role,
        status: w.status,
        total: own.length,
        done: own.filter((t) => t.status === "done").length,
        avgProgress: progress,
        stalled,
      };
    });
  });

/** Công việc chưa giao cho vai trò AI nào trong không gian làm việc. */
export const listUnassignedTasksForRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => WorkspaceInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("tasks")
      .select("id, title, status, due_at, progress_pct")
      .eq("workspace_id", data.workspaceId)
      .is("deleted_at", null)
      .is("ai_worker_id", null)
      .neq("status", "canceled")
      .neq("status", "done")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(50);
    return (rows ?? []) as {
      id: string;
      title: string;
      status: string;
      due_at: string | null;
      progress_pct: number | null;
    }[];
  });

/** Giao công việc cho một vai trò AI, dùng RPC sẵn có (RLS + outbox). */
export const assignTasksToRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        workerId: z.string().uuid(),
        taskIds: z.array(z.string().uuid()).min(1).max(20),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await tenantOf(context, data.workspaceId);
    const { data: worker } = await context.supabase
      .from("ai_workers")
      .select("id, name, role")
      .eq("id", data.workerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!worker) throw fail("AI_WORKER_NOT_FOUND", "Không tìm thấy vai trò AI.");

    let assigned = 0;
    let lastError = "";
    for (const taskId of data.taskIds) {
      const res = await context.supabase.rpc(
        "assign_task_to_ai" as never,
        {
          _task_id: taskId,
          _ai_worker_id: data.workerId,
          _expected_deliverable: `Kết quả theo vai trò ${(worker as any).role ?? (worker as any).name}`,
          _acceptance_criteria: "Bám đúng vai trò, cập nhật tiến độ khi hoàn thành từng phần.",
          _idempotency_key: `brain-assign:${taskId}:${data.workerId}`,
        } as never,
      );
      if (res.error) lastError = res.error.message;
      else assigned += 1;
    }
    if (!assigned) throw fail("TASK_NOT_FOUND", lastError || "Không giao được công việc.");
    return { ok: true as const, assigned, failed: data.taskIds.length - assigned };
  });

export type ProposalLogItem = {
  id: string;
  title: string;
  actionType: string;
  status: string;
  source: string;
  risk: string;
  createdAt: string;
  executedAt: string | null;
  workerName: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
  taskProgress: number | null;
};

/** Nhật ký đề xuất: lịch sử đề xuất, vai trò được giao và công việc đã xử lý. */
export const getProposalLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ProposalLogItem[]> => {
    const tenantId = await tenantOf(context, data.workspaceId);
    const { data: rows } = await context.supabase
      .from("ai_action_proposals")
      .select(
        "id, title, action_type, status, source, risk, created_at, executed_at, ai_worker_id, target_type, target_id, result",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 40);
    const list = (rows ?? []) as any[];
    if (!list.length) return [];

    const workerIds = Array.from(new Set(list.map((r) => r.ai_worker_id).filter(Boolean)));
    const taskIds = Array.from(
      new Set(
        list
          .map((r) =>
            r.target_type === "TASK"
              ? r.target_id
              : ((r.result as any)?.entityType === "TASK" ? (r.result as any)?.entityId : null),
          )
          .filter(Boolean),
      ),
    );

    const [workersRes, tasksRes] = await Promise.all([
      workerIds.length
        ? context.supabase.from("ai_workers").select("id, name").in("id", workerIds)
        : Promise.resolve({ data: [] as any[] }),
      taskIds.length
        ? context.supabase
            .from("tasks")
            .select("id, title, status, progress_pct")
            .eq("tenant_id", tenantId)
            .in("id", taskIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const workerById = new Map(((workersRes.data ?? []) as any[]).map((w) => [w.id, w.name]));
    const taskById = new Map(((tasksRes.data ?? []) as any[]).map((t) => [t.id, t]));

    return list.map((r) => {
      const taskId =
        r.target_type === "TASK"
          ? r.target_id
          : ((r.result as any)?.entityType === "TASK" ? (r.result as any)?.entityId : null);
      const task = taskId ? taskById.get(taskId) : null;
      return {
        id: r.id as string,
        title: (r.title as string) ?? "",
        actionType: (r.action_type as string) ?? "",
        status: (r.status as string) ?? "",
        source: (r.source as string) ?? "",
        risk: (r.risk as string) ?? "",
        createdAt: r.created_at as string,
        executedAt: (r.executed_at as string) ?? null,
        workerName: r.ai_worker_id ? (workerById.get(r.ai_worker_id) ?? null) : null,
        taskTitle: task?.title ?? null,
        taskStatus: task?.status ?? null,
        taskProgress: task?.progress_pct ?? null,
      };
    });
  });
