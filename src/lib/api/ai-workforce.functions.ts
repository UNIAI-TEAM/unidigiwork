// AI WORKFORCE — gán công việc thật cho từng nhân sự AI (hồ sơ trong AI_WORKER_PROFILES).
// Mỗi hồ sơ được ánh xạ 1-1 sang một dòng public.ai_workers của tổ chức (code WF_<PROFILE>),
// sau đó dùng RPC assign_task_to_ai sẵn có (RLS + outbox + kiểm tra quyền) để giao việc.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { AI_WORKER_PROFILES } from "@/domain/ai-workforce/profiles";

const fail = (code: string, message: string) => new ApiError({ code: code as never, message });

const workerCode = (profileId: string) => `WF_${profileId.toUpperCase()}`;

async function resolveTenant(context: any, workspaceId: string) {
  const { data, error } = await context.supabase
    .from("workspaces")
    .select("id, tenant_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error || !data) throw fail("WORKSPACE_NOT_FOUND", "Không tìm thấy không gian làm việc.");
  return data.tenant_id as string;
}

/** Đảm bảo tổ chức có đủ 9 dòng ai_workers tương ứng 9 hồ sơ nhân sự AI. */
async function ensureWorkforceWorkers(context: any, tenantId: string) {
  const { data: existing } = await context.supabase
    .from("ai_workers")
    .select("id, code, name, status")
    .eq("tenant_id", tenantId);
  const rows = (existing ?? []) as { id: string; code: string; name: string; status: string }[];
  const missing = AI_WORKER_PROFILES.filter((p) => !rows.some((r) => r.code === workerCode(p.id)));
  if (missing.length) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ins = await supabaseAdmin
      .from("ai_workers" as never)
      .insert(
        missing.map((p) => ({
          tenant_id: tenantId,
          code: workerCode(p.id),
          name: p.name,
          role: p.title,
          skills: [...p.skills],
          status: "ACTIVE",
        })) as never,
      )
      .select("id, code, name, status");
    if (ins.error) throw fail("AI_WORKER_NOT_FOUND", "Không tạo được hồ sơ nhân sự AI.");
    rows.push(...((ins.data ?? []) as any[]));
  }
  const byProfile = new Map<string, { id: string; code: string }>();
  for (const p of AI_WORKER_PROFILES) {
    const row = rows.find((r) => r.code === workerCode(p.id));
    if (row) byProfile.set(p.id, { id: row.id, code: row.code });
  }
  return byProfile;
}

export interface WorkforceAssignment {
  profileId: string;
  workerId: string;
  tasks: {
    id: string;
    title: string;
    status: string;
    due_at: string | null;
    ai_execution_status: string | null;
  }[];
}

/** Danh sách công việc đang giao cho từng nhân sự AI. */
export const listWorkforceAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<WorkforceAssignment[]> => {
    const tenantId = await resolveTenant(context, data.workspaceId);
    const byProfile = await ensureWorkforceWorkers(context, tenantId);
    const ids = [...byProfile.values()].map((w) => w.id);
    const { data: tasks } = await context.supabase
      .from("tasks")
      .select("id, title, status, due_at, ai_worker_id, ai_execution_status")
      .eq("tenant_id", tenantId)
      .in("ai_worker_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(200);
    const list = (tasks ?? []) as any[];
    return [...byProfile.entries()].map(([profileId, worker]) => ({
      profileId,
      workerId: worker.id,
      tasks: list
        .filter((t) => t.ai_worker_id === worker.id)
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          due_at: t.due_at ?? null,
          ai_execution_status: t.ai_execution_status ?? null,
        })),
    }));
  });

/** Công việc có thể giao cho nhân sự AI trong không gian làm việc. */
export const listAssignableTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ workspaceId: z.string().uuid(), search: z.string().trim().max(120).optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("tasks")
      .select("id, title, status, due_at, priority, ai_worker_id")
      .eq("workspace_id", data.workspaceId)
      .is("deleted_at", null)
      .neq("status", "canceled")
      .order("updated_at", { ascending: false })
      .limit(60);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw fail("TASK_NOT_FOUND", "Không tải được danh sách công việc.");
    return (rows ?? []) as {
      id: string;
      title: string;
      status: string;
      due_at: string | null;
      priority: string | null;
      ai_worker_id: string | null;
    }[];
  });

/** Giao một hoặc nhiều công việc cho một nhân sự AI cụ thể. */
export const assignTasksToWorkerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        profileId: z.string().min(1).max(60),
        taskIds: z.array(z.string().uuid()).min(1).max(20),
        expectedDeliverable: z.string().trim().max(2000).optional(),
        acceptanceCriteria: z.string().trim().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const profile = AI_WORKER_PROFILES.find((p) => p.id === data.profileId);
    if (!profile) throw fail("AI_WORKER_NOT_FOUND", "Không tìm thấy nhân sự AI.");
    const tenantId = await resolveTenant(context, data.workspaceId);
    const byProfile = await ensureWorkforceWorkers(context, tenantId);
    const worker = byProfile.get(profile.id);
    if (!worker) throw fail("AI_WORKER_NOT_FOUND", "Không tìm thấy nhân sự AI.");

    const deliverable =
      data.expectedDeliverable ||
      `${profile.title} (${profile.name}) xử lý theo nhiệm vụ: ${profile.mission}`;
    const criteria =
      data.acceptanceCriteria ||
      `Kết quả đúng phạm vi ${profile.domain}, có dẫn chứng từ dữ liệu công việc và cần người xác nhận.`;

    let assigned = 0;
    const errors: string[] = [];
    for (const taskId of data.taskIds) {
      const res = await context.supabase.rpc(
        "assign_task_to_ai" as never,
        {
          _task_id: taskId,
          _ai_worker_id: worker.id,
          _expected_deliverable: deliverable,
          _acceptance_criteria: criteria,
          _idempotency_key: `wf-assign:${taskId}:${worker.id}`,
        } as never,
      );
      if (res.error) errors.push(res.error.message);
      else assigned += 1;
    }
    if (!assigned)
      throw fail("TASK_NOT_FOUND", errors[0] ?? "Không giao được công việc cho nhân sự AI.");
    return { ok: true as const, assigned, failed: data.taskIds.length - assigned };
  });

/** Một dòng nhân sự AI nhập từ tệp Excel/CSV. */
const importRowSchema = z.object({
  code: z.string().trim().max(60).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(160).nullable().optional(),
  skills: z.array(z.string().trim().max(80)).max(30).optional(),
  status: z.string().trim().max(20).nullable().optional(),
});

/**
 * Nhập danh sách nhân sự AI từ tệp Excel/CSV.
 * Chỉ chủ sở hữu/quản trị tổ chức được nhập; vai trò và kỹ năng được đồng bộ
 * vào bảng ai_workers nên Bộ não AI sẽ học ngay ở lần đào tạo kế tiếp.
 */
export const importAiWorkers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        rows: z.array(importRowSchema).min(1).max(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenant(context, data.workspaceId);
    const { data: member } = await context.supabase
      .from("tenant_members")
      .select("role, status")
      .eq("tenant_id", tenantId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const role = (member as { role?: string; status?: string } | null)?.role ?? "";
    const status = (member as { status?: string } | null)?.status ?? "";
    if (status !== "active" || !["tenant_owner", "tenant_admin"].includes(role)) {
      throw fail("FORBIDDEN", "Chỉ quản trị tổ chức mới được nhập nhân sự AI.");
    }

    const { data: existingRows } = await context.supabase
      .from("ai_workers")
      .select("id, code")
      .eq("tenant_id", tenantId);
    const byCode = new Map<string, string>();
    for (const r of (existingRows ?? []) as { id: string; code: string }[]) {
      byCode.set(r.code.toUpperCase(), r.id);
    }

    const slug = (name: string) =>
      name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/gi, "d")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "AI_WORKER";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let created = 0;
    let updated = 0;
    const failed: string[] = [];
    const seen = new Set<string>();

    for (const row of data.rows) {
      const code = (row.code?.trim() || slug(row.name)).toUpperCase().slice(0, 60);
      if (seen.has(code)) continue;
      seen.add(code);
      const payload = {
        name: row.name,
        role: row.role?.trim() || "Nhân sự AI",
        skills: row.skills?.filter(Boolean) ?? [],
        status: (row.status?.trim().toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE") as string,
      };
      const existingId = byCode.get(code);
      if (existingId) {
        const res = await supabaseAdmin
          .from("ai_workers" as never)
          .update({ ...payload, updated_at: new Date().toISOString() } as never)
          .eq("id", existingId)
          .eq("tenant_id", tenantId);
        if (res.error) failed.push(row.name);
        else updated += 1;
      } else {
        const res = await supabaseAdmin
          .from("ai_workers" as never)
          .insert({ tenant_id: tenantId, code, ...payload } as never);
        if (res.error) failed.push(row.name);
        else created += 1;
      }
    }

    if (!created && !updated) {
      throw fail("AI_WORKER_NOT_FOUND", "Không nhập được nhân sự AI nào từ tệp.");
    }
    return { ok: true as const, created, updated, failed };
  });

/** Danh sách nhân sự AI thật của tổ chức (gồm cả hồ sơ nhập từ Excel). */
export const listTenantAiWorkers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenant(context, data.workspaceId);
    const { data: rows } = await context.supabase
      .from("ai_workers")
      .select("id, code, name, role, skills, status")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });
    return (rows ?? []) as {
      id: string;
      code: string;
      name: string;
      role: string;
      skills: string[] | null;
      status: string;
    }[];
  });
