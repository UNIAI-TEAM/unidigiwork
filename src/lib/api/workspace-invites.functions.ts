// Mời người dùng vào workspace kèm quyền mặc định (áp dụng khi lời mời được chấp nhận).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

const InviteInput = z.object({
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  tenantRole: z.enum(["tenant_admin", "manager", "member", "guest"]).default("member"),
  workspaceRole: z.enum(["owner", "member"]).default("member"),
  canEdit: z.boolean().default(false),
  canPublish: z.boolean().default(false),
  canRun: z.boolean().default(true),
  ttlDays: z.number().int().min(1).max(14).default(7),
});

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const inviteUserToWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InviteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, tenant_id, name")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (wsErr || !ws) {
      throw new ApiError({ code: "WORKSPACE_ACCESS_DENIED", message: "WORKSPACE_ACCESS_DENIED" });
    }
    const tenantId = (ws as { tenant_id: string }).tenant_id;

    const token = randomToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + data.ttlDays * 86400_000).toISOString();

    const { data: inv, error } = await supabase.rpc("create_tenant_invitation", {
      _tenant_id: tenantId,
      _email: data.email,
      _role: data.tenantRole,
      _token_hash: tokenHash,
      _expires_at: expiresAt,
    });
    if (error) {
      const raw = (error.message ?? "").toUpperCase();
      throw new ApiError({
        code: raw.startsWith("PERMISSION_DENIED") ? "PERMISSION_DENIED" : "INTERNAL_ERROR",
        message: error.message ?? "INVITE_FAILED",
      });
    }

    const invRow = (inv ?? {}) as { id?: string; invitation_id?: string };
    const invitationId = invRow.id ?? invRow.invitation_id;
    if (!invitationId) {
      throw new ApiError({ code: "INTERNAL_ERROR", message: "INVITE_ID_MISSING" });
    }

    const { error: defErr } = await supabase.from("workspace_invitation_defaults").insert({
      invitation_id: invitationId,
      tenant_id: tenantId,
      workspace_id: data.workspaceId,
      workspace_role: data.workspaceRole,
      can_edit: data.canEdit,
      can_publish: data.canPublish,
      can_run: data.canRun,
      created_by: context.userId,
    });
    if (defErr) {
      throw new ApiError({ code: "PERMISSION_DENIED", message: defErr.message });
    }

    return { invitationId, token, expiresAt, email: data.email };
  });

/** Ai được phép quản lý lời mời của workspace (tenant_owner / tenant_admin). */
export const getWorkspaceInviteAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ canManage: boolean; tenantRole: string | null }> => {
    const { supabase, userId } = context;
    const { data: ws } = await supabase
      .from("workspaces")
      .select("tenant_id")
      .eq("id", data.workspaceId)
      .maybeSingle();
    const tenantId = (ws as { tenant_id: string } | null)?.tenant_id;
    if (!tenantId) return { canManage: false, tenantRole: null };
    const { data: tm } = await supabase
      .from("tenant_members")
      .select("role, status")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle();
    const row = tm as { role: string; status: string } | null;
    const canManage =
      !!row && row.status === "active" && (row.role === "tenant_owner" || row.role === "tenant_admin");
    return { canManage, tenantRole: row?.role ?? null };
  });

/** Thu hồi lời mời đang chờ. */
export const revokeWorkspaceInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invitationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("revoke_tenant_invitation", {
      _invitation_id: data.invitationId,
    });
    if (error) {
      const raw = (error.message ?? "").toUpperCase();
      throw new ApiError({
        code: raw.startsWith("PERMISSION_DENIED") ? "PERMISSION_DENIED" : "INTERNAL_ERROR",
        message: error.message ?? "REVOKE_FAILED",
      });
    }
    return { ok: true as const };
  });

/**
 * Gửi lại lời mời: thu hồi lời mời cũ (nếu còn chờ) và tạo lời mời mới
 * giữ nguyên vai trò + quyền mặc định của workspace.
 */
export const resendWorkspaceInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ invitationId: z.string().uuid(), ttlDays: z.number().int().min(1).max(14).default(7) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: defRow, error: defErr } = await supabase
      .from("workspace_invitation_defaults")
      .select(
        "workspace_id, tenant_id, workspace_role, can_edit, can_publish, can_run, invitation:tenant_invitations(email, role, status)",
      )
      .eq("invitation_id", data.invitationId)
      .maybeSingle();
    if (defErr || !defRow) throw new ApiError({ code: "PERMISSION_DENIED", message: "INVITE_NOT_FOUND" });
    const d = defRow as unknown as {
      workspace_id: string;
      tenant_id: string;
      workspace_role: string;
      can_edit: boolean;
      can_publish: boolean;
      can_run: boolean;
      invitation: { email: string; role: string; status: string } | null;
    };
    if (!d.invitation) throw new ApiError({ code: "PERMISSION_DENIED", message: "INVITE_NOT_FOUND" });
    if (d.invitation.status === "accepted") {
      throw new ApiError({ code: "VALIDATION_FAILED", message: "INVITE_ALREADY_ACCEPTED" });
    }

    if (d.invitation.status === "pending") {
      await supabase.rpc("revoke_tenant_invitation", { _invitation_id: data.invitationId });
    }

    const token = randomToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + data.ttlDays * 86400_000).toISOString();
    const { data: inv, error } = await supabase.rpc("create_tenant_invitation", {
      _tenant_id: d.tenant_id,
      _email: d.invitation.email,
      _role: d.invitation.role as "tenant_admin" | "manager" | "member" | "guest",
      _token_hash: tokenHash,
      _expires_at: expiresAt,
    });
    if (error) {
      const raw = (error.message ?? "").toUpperCase();
      throw new ApiError({
        code: raw.startsWith("PERMISSION_DENIED") ? "PERMISSION_DENIED" : "INTERNAL_ERROR",
        message: error.message ?? "RESEND_FAILED",
      });
    }
    const invitationId = (inv as { id?: string } | null)?.id;
    if (!invitationId) throw new ApiError({ code: "INTERNAL_ERROR", message: "INVITE_ID_MISSING" });

    await supabase.from("workspace_invitation_defaults").insert({
      invitation_id: invitationId,
      tenant_id: d.tenant_id,
      workspace_id: d.workspace_id,
      workspace_role: d.workspace_role,
      can_edit: d.can_edit,
      can_publish: d.can_publish,
      can_run: d.can_run,
      created_by: userId,
    });

    return { invitationId, token, expiresAt, email: d.invitation.email };
  });

export interface WorkspaceInviteRow {
  invitationId: string;
  email: string;
  tenantRole: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  acceptedAt: string | null;
  isExpired: boolean;
  workspaceRole: string;
  canEdit: boolean;
  canPublish: boolean;
  canRun: boolean;
}

export const listWorkspaceInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<WorkspaceInviteRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("workspace_invitation_defaults")
      .select(
        "invitation_id, workspace_role, can_edit, can_publish, can_run, created_at, invitation:tenant_invitations(email, role, status, expires_at, created_at, accepted_at)",
      )
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return [];
    type Row = {
      invitation_id: string;
      workspace_role: string;
      can_edit: boolean;
      can_publish: boolean;
      can_run: boolean;
      created_at: string;
      invitation: {
        email: string;
        role: string;
        status: string;
        expires_at: string | null;
        created_at: string;
        accepted_at: string | null;
      } | null;
    };
    return ((rows ?? []) as unknown as Row[])
      .filter((r) => r.invitation)
      .map((r) => ({
        invitationId: r.invitation_id,
        email: r.invitation!.email,
        tenantRole: r.invitation!.role,
        status: r.invitation!.status,
        expiresAt: r.invitation!.expires_at,
        createdAt: r.invitation!.created_at,
        acceptedAt: r.invitation!.accepted_at,
        isExpired:
          r.invitation!.status === "pending" &&
          !!r.invitation!.expires_at &&
          new Date(r.invitation!.expires_at).getTime() < Date.now(),
        workspaceRole: r.workspace_role,
        canEdit: r.can_edit,
        canPublish: r.can_publish,
        canRun: r.can_run,
      }));
  });
