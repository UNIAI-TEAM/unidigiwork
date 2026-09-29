import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { schoolContext } from "./school-ops.functions";

const statusSchema = z.enum(["todo", "in_progress", "blocked", "done"]);
const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);

export type SchoolDeptTask = {
  id: string;
  title: string;
  description: string | null;
  status: z.infer<typeof statusSchema>;
  priority: z.infer<typeof prioritySchema>;
  due_at: string | null;
  row_version: number;
  updated_at: string;
  assignees: Array<{ user_id: string; display_name: string | null; email: string | null }>;
  owner_id: string | null;
};

export type SchoolDeptTaskMember = { user_id: string; display_name: string; email: string };

const errorCode = (message: string) =>
  ["FORBIDDEN", "PACK_DISABLED", "ASSIGNEE_OUTSIDE_DEPARTMENT", "WORKSPACE_NOT_FOUND", "TASK_NOT_FOUND", "CONCURRENT_MODIFICATION", "QUOTA_EXCEEDED"].find((code) => message.includes(code)) ?? "SAVE_FAILED";

export const listSchoolDeptTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ department: z.string().trim().max(80).nullable() }).parse(input))
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) return { enabled: false as const, role: "teacher" as const, dept: null, tasks: [] as SchoolDeptTask[], members: [] as SchoolDeptTaskMember[] };
    const dept = ctx.role === "bgh" ? data.department : ctx.dept;
    if (!dept) return { enabled: true as const, role: ctx.role, dept: null, tasks: [] as SchoolDeptTask[], members: [] as SchoolDeptTaskMember[] };

    const [taskResult, memberResult] = await Promise.all([
      (context.supabase as any).rpc("school_list_dept_tasks", { _tenant_id: ctx.tenantId, _department: dept }),
      (context.supabase as any).rpc("school_list_dept_task_members", { _tenant_id: ctx.tenantId, _department: dept }),
    ]);
    if (taskResult.error) throw new Error(errorCode(taskResult.error.message));
    if (memberResult.error) throw new Error(errorCode(memberResult.error.message));
    return { enabled: true as const, role: ctx.role, userId: context.userId, dept, tasks: (taskResult.data ?? []) as SchoolDeptTask[], members: (memberResult.data ?? []) as SchoolDeptTaskMember[] };
  });

export const createSchoolDeptTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    department: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10000).optional(),
    priority: prioritySchema,
    dueAt: z.string().datetime().nullable(),
    assigneeId: z.string().uuid(),
    idempotencyKey: z.string().min(8).max(100),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx || ctx.role === "teacher") throw new Error("FORBIDDEN");
    const dept = ctx.role === "bgh" ? data.department : ctx.dept;
    if (!dept) throw new Error("FORBIDDEN");
    const { data: task, error } = await (context.supabase as any).rpc("school_create_dept_task", {
      _tenant_id: ctx.tenantId,
      _department: dept,
      _title: data.title,
      _description: data.description ?? null,
      _priority: data.priority,
      _due_at: data.dueAt,
      _assignee_id: data.assigneeId,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: null,
    });
    if (error) throw new Error(errorCode(error.message));
    return task as SchoolDeptTask;
  });

export const transitionSchoolDeptTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    department: z.string().trim().min(1).max(80),
    taskId: z.string().uuid(),
    toStatus: statusSchema,
    expectedRowVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(100),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) throw new Error("FORBIDDEN");
    const dept = ctx.role === "bgh" ? data.department : ctx.dept;
    if (!dept) throw new Error("FORBIDDEN");
    const { data: task, error } = await (context.supabase as any).rpc("school_transition_dept_task", {
      _tenant_id: ctx.tenantId,
      _department: dept,
      _task_id: data.taskId,
      _to_status: data.toStatus,
      _expected_row_version: data.expectedRowVersion,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: null,
    });
    if (error) throw new Error(errorCode(error.message));
    return task as SchoolDeptTask;
  });