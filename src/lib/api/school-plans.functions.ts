import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { schoolContext } from "./school-ops.functions";

export type PlanKind = "lesson" | "assignment" | "weekly";
export type DeptPlan = {
  id: string;
  kind: PlanKind;
  title: string;
  class_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  body: string | null;
  task_id: string | null;
  task_status: string | null;
  author_name: string | null;
  can_edit: boolean;
};

const code = (m: string) =>
  ["FORBIDDEN", "INVALID_TIME", "DUE_REQUIRED", "NOT_FOUND", "QUOTA_EXCEEDED"].find((c) => m.includes(c)) ?? "SAVE_FAILED";

export const listDeptPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ department: z.string().max(80).nullable(), from: z.string(), to: z.string() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) return { enabled: false as const, role: "teacher" as const, dept: null, items: [] as DeptPlan[] };
    const dept = ctx.role === "bgh" ? (data.department ?? ctx.dept) : ctx.dept;
    if (!dept) return { enabled: true as const, role: ctx.role, dept: null, items: [] as DeptPlan[] };
    const { data: rows, error } = await (context.supabase as any).rpc("school_list_dept_plans", {
      _tenant_id: ctx.tenantId,
      _department: dept,
      _from: data.from,
      _to: data.to,
    });
    if (error) throw new Error(code(error.message));
    return { enabled: true as const, role: ctx.role, dept, items: (rows ?? []) as DeptPlan[] };
  });

export const saveDeptPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        department: z.string().min(1).max(80),
        kind: z.enum(["lesson", "assignment", "weekly"]),
        title: z.string().trim().min(1).max(200),
        className: z.string().max(40).optional(),
        startsAt: z.string().nullable(),
        endsAt: z.string().nullable(),
        body: z.string().max(8000).optional(),
        idempotencyKey: z.string().min(8).max(100),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) throw new Error("PACK_DISABLED");
    const { data: id, error } = await (context.supabase as any).rpc("school_save_dept_plan", {
      _tenant_id: ctx.tenantId,
      _department: data.department,
      _kind: data.kind,
      _title: data.title,
      _class_name: data.className ?? null,
      _starts_at: data.startsAt,
      _ends_at: data.endsAt,
      _body: data.body ?? null,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(code(error.message));
    return { id: id as string };
  });

export const deleteDeptPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await schoolContext(context.supabase as never, context.userId);
    if (!ctx) throw new Error("PACK_DISABLED");
    const { error } = await (context.supabase as any).rpc("school_delete_dept_plan", { _tenant_id: ctx.tenantId, _id: data.id });
    if (error) throw new Error(code(error.message));
    return { ok: true };
  });
