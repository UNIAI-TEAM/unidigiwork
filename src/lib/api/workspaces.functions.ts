// CRUD workspace cho người dùng cuối: tạo (provision tenant + workspace mặc định),
// đổi tên/timezone, lưu trữ (soft delete) và phân quyền cơ bản trong workspace.
// Mọi thao tác chạy qua RLS của caller (owner-only cho ghi).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export type WorkspaceListItemDTO = {
  id: string;
  name: string;
  timezone: string;
  ownerId: string;
  isOwner: boolean;
  members: number;
  createdAt: string;
  archived: boolean;
};

export type WorkspaceMemberRowDTO = {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "member";
  joinedAt: string;
  isMe: boolean;
};

function fail(err: { message?: string } | null, fallback: string): never {
  const raw = (err?.message ?? "").toUpperCase();
  const denied = raw.includes("PERMISSION") || raw.includes("DENIED") || raw.includes("RLS");
  throw new ApiError({
    code: denied ? "PERMISSION_DENIED" : "INTERNAL_ERROR",
    message: err?.message ?? fallback,
  });
}

/** Sinh slug hợp lệ từ tên (bỏ dấu tiếng Việt) + hậu tố ngẫu nhiên tránh trùng. */
function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomUUID().slice(0, 8);
  const head = base.length >= 2 ? base : "workspace";
  return `${head}-${suffix}`;
}

/** Ghi nhật ký thay đổi workspace (best-effort, không chặn nghiệp vụ chính). */
async function logWorkspaceAudit(input: {
  tenantId: string | null;
  actorId: string;
  eventType: string;
  workspaceId: string;
  before?: Row | null;
  after?: Row | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_events").insert({
      tenant_id: input.tenantId,
      actor_id: input.actorId,
      actor_user_id: input.actorId,
      event_type: input.eventType,
      action: input.eventType,
      aggregate_type: "workspace",
      aggregate_id: input.workspaceId,
      resource_type: "workspace",
      resource_id: input.workspaceId,
      before_state: input.before ?? null,
      after_state: input.after ?? null,
      payload: { workspace_id: input.workspaceId },
      source: "app",
    });
  } catch {
    // audit không được phép làm hỏng thao tác chính
  }
}

const AUDIT_FIELDS =
  "id, name, description, timezone, visibility, default_member_role, allow_member_invites, deleted_at, tenant_id";

export type WorkspaceAuditEventDTO = {
  id: string;
  eventType: string;
  workspaceId: string;
  workspaceName: string;
  actorId: string | null;
  actorName: string;
  occurredAt: string;
  changes: { field: string; before: string; after: string }[];
};

/** Nhật ký tạo/sửa/xóa workspace theo thời gian (RLS: thành viên tenant). */
export const listWorkspaceAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<WorkspaceAuditEventDTO[]> => {
    const { supabase } = context;
    let q = supabase
      .from("audit_events")
      .select("id, event_type, aggregate_id, actor_id, occurred_at, before_state, after_state")
      .eq("aggregate_type", "workspace")
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (data.workspaceId) q = q.eq("aggregate_id", data.workspaceId);
    const { data: rows, error } = await q;
    if (error) fail(error, "WORKSPACE_ACCESS_DENIED");

    const events = (rows ?? []) as Row[];
    const wsIds = [...new Set(events.map((e) => e.aggregate_id as string).filter(Boolean))];
    const actorIds = [...new Set(events.map((e) => e.actor_id as string).filter(Boolean))];

    const [wsRes, profRes] = await Promise.all([
      wsIds.length
        ? supabase.from("workspaces").select("id, name").in("id", wsIds)
        : Promise.resolve({ data: [] as Row[] }),
      actorIds.length
        ? supabase.from("profiles").select("id, display_name").in("id", actorIds)
        : Promise.resolve({ data: [] as Row[] }),
    ]);
    const wsName = new Map(((wsRes.data ?? []) as Row[]).map((w) => [w.id as string, w.name as string]));
    const actorName = new Map(
      ((profRes.data ?? []) as Row[]).map((p) => [p.id as string, (p.display_name as string) ?? ""]),
    );

    const LABEL: Record<string, string> = {
      name: "Tên",
      description: "Mô tả",
      timezone: "Múi giờ",
      visibility: "Phạm vi hiển thị",
      default_member_role: "Vai trò mặc định",
      allow_member_invites: "Cho phép thành viên mời",
      deleted_at: "Trạng thái lưu trữ",
    };

    return events.map((e) => {
      const before = (e.before_state ?? null) as Row | null;
      const after = (e.after_state ?? null) as Row | null;
      const changes: { field: string; before: string; after: string }[] = [];
      if (before && after) {
        for (const key of Object.keys(LABEL)) {
          const b = before[key] ?? null;
          const a = after[key] ?? null;
          if (JSON.stringify(b) !== JSON.stringify(a)) {
            changes.push({
              field: LABEL[key] ?? key,
              before: b === null || b === "" ? "—" : String(b),
              after: a === null || a === "" ? "—" : String(a),
            });
          }
        }
      }
      return {
        id: e.id as string,
        eventType: (e.event_type as string) ?? "workspace.updated",
        workspaceId: (e.aggregate_id as string) ?? "",
        workspaceName: wsName.get(e.aggregate_id as string) ?? "Workspace",
        actorId: (e.actor_id as string) ?? null,
        actorName: actorName.get(e.actor_id as string) || "Người dùng",
        occurredAt: (e.occurred_at as string) ?? new Date().toISOString(),
        changes,
      };
    });
  });

/** Danh sách workspace của người dùng kèm số thành viên. */
export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceListItemDTO[]> => {
    const { supabase, userId } = context;
    const { data: memberships, error: mErr } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId);
    if (mErr) fail(mErr, "WORKSPACE_ACCESS_DENIED");
    const ids = ((memberships ?? []) as Row[]).map((m) => m.workspace_id as string);
    if (!ids.length) return [];

    const [wsRes, allMembersRes] = await Promise.all([
      supabase
        .from("workspaces")
        .select("id, name, owner_id, timezone, created_at, deleted_at")
        .in("id", ids)
        .order("created_at", { ascending: false }),
      supabase.from("workspace_members").select("workspace_id").in("workspace_id", ids),
    ]);
    if (wsRes.error) fail(wsRes.error, "WORKSPACE_ACCESS_DENIED");

    const counts = new Map<string, number>();
    for (const r of (allMembersRes.data ?? []) as Row[]) {
      counts.set(r.workspace_id, (counts.get(r.workspace_id) ?? 0) + 1);
    }
    return ((wsRes.data ?? []) as Row[]).map((w) => ({
      id: w.id as string,
      name: (w.name as string) ?? "Workspace",
      timezone: (w.timezone as string) ?? "Asia/Ho_Chi_Minh",
      ownerId: w.owner_id as string,
      isOwner: w.owner_id === userId,
      members: counts.get(w.id as string) ?? 1,
      createdAt: w.created_at as string,
      archived: Boolean(w.deleted_at),
    }));
  });

const CreateInput = z.object({
  name: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(1).max(64).default("Asia/Ho_Chi_Minh"),
  idempotencyKey: z.string().uuid(),
});

/** Tạo workspace mới (mỗi workspace là một tenant theo kiến trúc hiện tại). */
export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }): Promise<{ workspaceId: string }> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase.rpc("provision_tenant", {
      _name: data.name,
      _slug: slugify(data.name),
      _owner_id: userId,
      _default_workspace_name: data.name,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) fail(error, "WORKSPACE_CREATE_FAILED");
    const row = (Array.isArray(rows) ? rows[0] : rows) as Row | null;
    const workspaceId = row?.workspace_id as string | undefined;
    if (!workspaceId) fail(null, "WORKSPACE_CREATE_FAILED");

    if (data.timezone && data.timezone !== "Asia/Ho_Chi_Minh") {
      await supabase.from("workspaces").update({ timezone: data.timezone }).eq("id", workspaceId);
    }
    return { workspaceId };
  });

const UpdateInput = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  visibility: z.enum(["private", "tenant"]).optional(),
  defaultMemberRole: z.enum(["member", "owner"]).optional(),
  allowMemberInvites: z.boolean().optional(),
});

/** Đổi tên / múi giờ workspace — RLS chỉ cho chủ sở hữu. */
export const updateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const patch: {
      updated_by: string;
      updated_at: string;
      name?: string;
      timezone?: string;
      description?: string | null;
      visibility?: string;
      default_member_role?: string;
      allow_member_invites?: boolean;
    } = {
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.name) patch.name = data.name;
    if (data.timezone) patch.timezone = data.timezone;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.visibility) patch.visibility = data.visibility;
    if (data.defaultMemberRole) patch.default_member_role = data.defaultMemberRole;
    if (data.allowMemberInvites !== undefined) patch.allow_member_invites = data.allowMemberInvites;

    const { data: updated, error } = await supabase
      .from("workspaces")
      .update(patch)
      .eq("id", data.workspaceId)
      .select("id");
    if (error) fail(error, "WORKSPACE_UPDATE_FAILED");
    if (!updated?.length)
      throw new ApiError({
        code: "PERMISSION_DENIED",
        message: "Chỉ chủ sở hữu workspace mới được chỉnh sửa.",
      });
    return { ok: true };
  });

export type WorkspaceSettingsDTO = {
  id: string;
  name: string;
  description: string;
  timezone: string;
  visibility: "private" | "tenant";
  defaultMemberRole: "member" | "owner";
  allowMemberInvites: boolean;
  isOwner: boolean;
};

/** Lấy cấu hình chi tiết của một workspace (đọc theo RLS thành viên). */
export const getWorkspaceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<WorkspaceSettingsDTO> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (error) fail(error, "WORKSPACE_ACCESS_DENIED");
    if (!row)
      throw new ApiError({ code: "WORKSPACE_ACCESS_DENIED", message: "Không tìm thấy workspace." });
    const w = row as Row;
    return {
      id: w.id as string,
      name: (w.name as string) ?? "",
      description: (w.description as string | null) ?? "",
      timezone: (w.timezone as string) ?? "Asia/Ho_Chi_Minh",
      visibility: (w.visibility as "private" | "tenant") ?? "private",
      defaultMemberRole: (w.default_member_role as "member" | "owner") ?? "member",
      allowMemberInvites: Boolean(w.allow_member_invites),
      isOwner: w.owner_id === userId,
    };
  });

const ArchiveInput = z.object({
  workspaceId: z.string().uuid(),
  restore: z.boolean().default(false),
});

/** Lưu trữ (xóa mềm) hoặc khôi phục workspace — chỉ chủ sở hữu. */
export const archiveWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ArchiveInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { data: updated, error } = await supabase
      .from("workspaces")
      .update({
        deleted_at: data.restore ? null : new Date().toISOString(),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.workspaceId)
      .select("id");
    if (error) fail(error, "WORKSPACE_DELETE_FAILED");
    if (!updated?.length)
      throw new ApiError({
        code: "PERMISSION_DENIED",
        message: "Chỉ chủ sở hữu workspace mới được xóa hoặc khôi phục.",
      });
    return { ok: true };
  });

/** Danh sách thành viên + vai trò trong workspace. */
export const listWorkspaceMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<WorkspaceMemberRowDTO[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("workspace_members")
      .select("user_id, role, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: true });
    if (error) fail(error, "WORKSPACE_ACCESS_DENIED");

    const members = (rows ?? []) as Row[];
    const ids = members.map((m) => m.user_id as string);
    const userMap = new Map<string, { name: string; email: string }>();
    if (ids.length) {
      const { data: users } = await supabase
        .from("users")
        .select("id, display_name, primary_email")
        .in("id", ids);
      for (const u of (users ?? []) as Row[]) {
        userMap.set(u.id, {
          name: u.display_name ?? u.primary_email ?? "Thành viên",
          email: u.primary_email ?? "",
        });
      }
    }
    return members.map((m) => ({
      userId: m.user_id as string,
      name: userMap.get(m.user_id)?.name ?? "Thành viên",
      email: userMap.get(m.user_id)?.email ?? "",
      role: (m.role as "owner" | "member") ?? "member",
      joinedAt: m.created_at as string,
      isMe: m.user_id === userId,
    }));
  });

const RoleInput = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["owner", "member"]),
});

/** Đổi vai trò thành viên (owner/member) — chỉ chủ sở hữu. */
export const setWorkspaceMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RoleInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { data: updated, error } = await supabase
      .from("workspace_members")
      .update({ role: data.role, updated_at: new Date().toISOString() })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId)
      .select("user_id");
    if (error) fail(error, "WORKSPACE_MEMBER_UPDATE_FAILED");
    if (!updated?.length)
      throw new ApiError({
        code: "PERMISSION_DENIED",
        message: "Chỉ chủ sở hữu workspace mới được đổi vai trò.",
      });
    return { ok: true };
  });

/** Gỡ thành viên khỏi workspace (hoặc tự rời) — không cho gỡ chủ sở hữu chính. */
export const removeWorkspaceMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { data: ws } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if ((ws as Row | null)?.owner_id === data.userId) {
      throw new ApiError({
        code: "VALIDATION_FAILED",
        message: "Không thể gỡ chủ sở hữu workspace.",
      });
    }
    const { data: removed, error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId)
      .select("user_id");
    if (error) fail(error, "WORKSPACE_MEMBER_REMOVE_FAILED");
    if (!removed?.length)
      throw new ApiError({
        code: "PERMISSION_DENIED",
        message: "Chỉ chủ sở hữu workspace mới được gỡ thành viên.",
      });
    return { ok: true };
  });
