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

export interface WorkspaceInviteRow {
  invitationId: string;
  email: string;
  tenantRole: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
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
        "invitation_id, workspace_role, can_edit, can_publish, can_run, created_at, invitation:tenant_invitations(email, role, status, expires_at, created_at)",
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
        workspaceRole: r.workspace_role,
        canEdit: r.can_edit,
        canPublish: r.can_publish,
        canRun: r.can_run,
      }));
  });
