// HUMAN AGENTS — đăng ký người thật tham gia orchestration: bật/tắt, lĩnh vực, email nhận việc,
// giới hạn tải và quyền trong tổ chức. Mọi ghi đều qua RPC tenant-guarded; RLS áp dụng cho đọc.
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";

const ACTIVE_TENANT_COOKIE = "uniwork_active_tenant";
const MANAGER_ROLES = ["tenant_owner", "tenant_admin"];
const OPEN_STATUSES = ["todo", "in_progress", "blocked"];

export const ASSIGN_ROLES = ["admin", "manager", "staff"] as const;
export type AssignRole = (typeof ASSIGN_ROLES)[number];

export type HumanAgentDTO = {
  userId: string;
  name: string;
  accountEmail: string;
  workEmail: string;
  role: string;
  assignRole: AssignRole;
  memberStatus: string;
  registered: boolean;
  enabled: boolean;
  domains: string[];
  maxOpenTasks: number;
  note: string;
  openTasks: number;
  isSelf: boolean;
};

export type HumanAgentsResult = {
  tenantId: string | null;
  canManage: boolean;
  agents: HumanAgentDTO[];
  /** Vai trò nào được orchestration giao việc (mặc định tất cả đều được). */
  rolePolicies: Record<AssignRole, boolean>;
};

type Ctx = { supabase: any; userId: string };

async function loadRolePolicies(ctx: Ctx, tenantId: string): Promise<Record<AssignRole, boolean>> {
  const { data } = await ctx.supabase
    .from("human_agent_role_policies")
    .select("role, can_receive_tasks")
    .eq("tenant_id", tenantId);
  const result = { admin: true, manager: true, staff: true } as Record<AssignRole, boolean>;
  for (const row of (data ?? []) as Array<{ role: string; can_receive_tasks: boolean }>) {
    if ((ASSIGN_ROLES as readonly string[]).includes(row.role)) {
      result[row.role as AssignRole] = Boolean(row.can_receive_tasks);
    }
  }
  return result;
}

async function resolveTenant(ctx: Ctx): Promise<{ tenantId: string; role: string } | null> {
  const { data, error } = await ctx.supabase
    .from("tenant_members")
    .select("tenant_id, role, status")
    .eq("user_id", ctx.userId)
    .eq("status", "active");
  if (error) mapPgError(error, "TENANT_ACCESS_DENIED");
  const rows = (data ?? []) as Array<{ tenant_id: string; role: string }>;
  if (rows.length === 0) return null;
  const hint = getCookie(ACTIVE_TENANT_COOKIE);
  const matched = hint ? rows.find((r) => r.tenant_id === hint) : undefined;
  const chosen = matched ?? rows[0];
  return { tenantId: chosen.tenant_id, role: chosen.role };
}

async function loadAgents(ctx: Ctx, tenantId: string): Promise<HumanAgentDTO[]> {
  const { data: members, error } = await ctx.supabase
    .from("tenant_members")
    .select("user_id, role, status")
    .eq("tenant_id", tenantId)
    .neq("status", "removed");
  if (error) mapPgError(error);
  const rows = (members ?? []) as Array<{ user_id: string; role: string; status: string }>;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.user_id);

  const [usersRes, agentRes, wsRes] = await Promise.all([
    ctx.supabase.from("users").select("id, display_name, primary_email").in("id", ids),
    ctx.supabase.from("human_agents").select("*").eq("tenant_id", tenantId).in("user_id", ids),
    ctx.supabase.from("workspaces").select("id").eq("tenant_id", tenantId).limit(100),
  ]);
  if (usersRes.error) mapPgError(usersRes.error);
  if (agentRes.error) mapPgError(agentRes.error);

  // Tải hiện tại: số việc đang mở của tổ chức mà người đó được giao.
  const load = new Map<string, number>();
  const workspaceIds = ((wsRes.data ?? []) as Array<{ id: string }>).map((w) => w.id);
  if (workspaceIds.length > 0) {
    const { data: tasks } = await ctx.supabase
      .from("tasks")
      .select("id, status")
      .in("workspace_id", workspaceIds)
      .in("status", OPEN_STATUSES)
      .is("deleted_at", null)
      .limit(1000);
    const openIds = ((tasks ?? []) as Array<{ id: string }>).map((t) => t.id);
    if (openIds.length > 0) {
      const { data: links } = await ctx.supabase
        .from("task_assignees")
        .select("task_id, user_id")
        .in("task_id", openIds);
      for (const link of (links ?? []) as Array<{ user_id: string }>) {
        load.set(link.user_id, (load.get(link.user_id) ?? 0) + 1);
      }
    }
  }

  const uMap = new Map<string, { display_name: string | null; primary_email: string | null }>();
  for (const u of usersRes.data ?? []) uMap.set(u.id, u);
  const aMap = new Map<string, Record<string, unknown>>();
  for (const a of agentRes.data ?? []) aMap.set(a.user_id as string, a);

  return rows
    .map((m) => {
      const u = uMap.get(m.user_id);
      const a = aMap.get(m.user_id);
      const accountEmail = u?.primary_email ?? "";
      return {
        userId: m.user_id,
        name: u?.display_name ?? accountEmail ?? "Thành viên",
        accountEmail,
        workEmail: typeof a?.["work_email"] === "string" ? (a["work_email"] as string) : "",
        role: m.role,
        assignRole: ((ASSIGN_ROLES as readonly string[]).includes(String(a?.["assign_role"]))
          ? (a?.["assign_role"] as AssignRole)
          : "staff") as AssignRole,
        memberStatus: m.status,
        registered: Boolean(a),
        enabled: a ? Boolean(a["enabled"]) : false,
        domains: Array.isArray(a?.["domains"]) ? (a["domains"] as string[]) : [],
        maxOpenTasks:
          typeof a?.["max_open_tasks"] === "number" ? (a["max_open_tasks"] as number) : 10,
        note: typeof a?.["note"] === "string" ? (a["note"] as string) : "",
        openTasks: load.get(m.user_id) ?? 0,
        isSelf: m.user_id === ctx.userId,
      } satisfies HumanAgentDTO;
    })
    .sort(
      (a, b) => Number(b.registered) - Number(a.registered) || a.name.localeCompare(b.name, "vi"),
    );
}

export const listHumanAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HumanAgentsResult> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant)
      return {
        tenantId: null,
        canManage: false,
        agents: [],
        rolePolicies: { admin: true, manager: true, staff: true },
      };
    const [agents, rolePolicies] = await Promise.all([
      loadAgents(ctx, tenant.tenantId),
      loadRolePolicies(ctx, tenant.tenantId),
    ]);
    return {
      tenantId: tenant.tenantId,
      canManage: MANAGER_ROLES.includes(tenant.role),
      agents,
      rolePolicies,
    };
  });

const SaveInput = z.object({
  userId: z.string().uuid(),
  enabled: z.boolean(),
  workEmail: z.string().trim().email().max(160).or(z.literal("")).optional(),
  domains: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  maxOpenTasks: z.number().int().min(1).max(200),
  note: z.string().trim().max(500).optional(),
  role: z.string().trim().max(40).optional(),
  assignRole: z.enum(ASSIGN_ROLES).optional(),
});

/** Thêm/sửa một human agent (bật tham gia orchestration, lĩnh vực, email nhận việc, quyền). */
export const saveHumanAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SaveInput.parse(i))
  .handler(async ({ data, context }): Promise<{ agents: HumanAgentDTO[] }> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant)
      throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
    if (!MANAGER_ROLES.includes(tenant.role))
      throw new ApiError({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED" });

    const { error } = await ctx.supabase.rpc("upsert_human_agent", {
      _tenant_id: tenant.tenantId,
      _user_id: data.userId,
      _enabled: data.enabled,
      _work_email: data.workEmail && data.workEmail.length > 0 ? data.workEmail : null,
      _domains: data.domains ?? [],
      _max_open_tasks: data.maxOpenTasks,
      _note: data.note && data.note.length > 0 ? data.note : null,
      _assign_role: data.assignRole ?? "staff",
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");

    if (data.role) {
      const { error: rErr } = await ctx.supabase.rpc("change_tenant_member_role", {
        _tenant_id: tenant.tenantId,
        _user_id: data.userId,
        _new_role: data.role,
        _correlation_id: null,
      });
      if (rErr) mapPgError(rErr, "PERMISSION_DENIED");
    }

    return { agents: await loadAgents(ctx, tenant.tenantId) };
  });

/** Gỡ người khỏi danh sách human agent (không xoá tài khoản, không rời tổ chức). */
export const removeHumanAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ agents: HumanAgentDTO[] }> => {
    const ctx = context as unknown as Ctx;
    const tenant = await resolveTenant(ctx);
    if (!tenant)
      throw new ApiError({ code: "TENANT_ACCESS_DENIED", message: "TENANT_ACCESS_DENIED" });
    if (!MANAGER_ROLES.includes(tenant.role))
      throw new ApiError({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED" });
    const { error } = await ctx.supabase.rpc("delete_human_agent", {
      _tenant_id: tenant.tenantId,
      _user_id: data.userId,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { agents: await loadAgents(ctx, tenant.tenantId) };
  });
