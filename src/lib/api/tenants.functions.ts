// Blueprint §5, §7, §9 — Tenant lifecycle server functions (Batch 1B).
// Trusted boundary wrappers around the Postgres SECURITY DEFINER RPCs.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AcceptInvitationCommandSchema,
  ChangeMemberRoleCommandSchema,
  ChangeMemberStatusCommandSchema,
  ChangeTenantStatusCommandSchema,
  CreateInvitationCommandSchema,
  ProvisionTenantCommandSchema,
  RevokeInvitationCommandSchema,
  TransferOwnershipCommandSchema,
} from "@/contracts/tenants/tenant";
import { toApiError, ApiError, type StableErrorCode } from "@/contracts/errors";

function mapPgError(err: { message?: string; code?: string } | null): never {
  const raw = (err?.message ?? "").toUpperCase();
  const known: StableErrorCode[] = [
    "AUTHENTICATION_REQUIRED",
    "PERMISSION_DENIED",
    "TENANT_NOT_FOUND",
    "TENANT_SLUG_CONFLICT",
    "TENANT_INVALID_TRANSITION",
    "TENANT_LAST_OWNER_PROTECTED",
    "TENANT_ROLE_CHANGE_FORBIDDEN",
    "TENANT_MEMBERSHIP_NOT_FOUND",
    "TENANT_INVITATION_NOT_FOUND",
    "TENANT_INVITATION_EXPIRED",
    "TENANT_INVITATION_REVOKED",
    "TENANT_INVITATION_ALREADY_ACCEPTED",
    "TENANT_INVITATION_EMAIL_MISMATCH",
    "VALIDATION_FAILED",
  ];
  const match = known.find((c) => raw.startsWith(c));
  throw new ApiError({
    code: match ?? "INTERNAL_ERROR",
    message: match ? match : "Tenant operation failed.",
  });
}

async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const provisionTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ProvisionTenantCommandSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase.rpc("provision_tenant", {
      _name: data.name,
      _slug: data.slug,
      _owner_id: userId,
      _default_workspace_name: data.defaultWorkspaceName,
      _idempotency_key: data.metadata.idempotencyKey,
      _correlation_id: data.metadata.correlationId ?? undefined,
    });
    if (error) mapPgError(error);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      membershipId: row.membership_id,
    };
  });

export const changeTenantStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChangeTenantStatusCommandSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("change_tenant_status", {
      _tenant_id: data.tenantId,
      _new_status: data.newStatus,
      _correlation_id: data.metadata?.correlationId ?? undefined,
    });
    if (error) mapPgError(error);
    return row;
  });

export const changeMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChangeMemberRoleCommandSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("change_tenant_member_role", {
      _tenant_id: data.tenantId,
      _user_id: data.userId,
      _new_role: data.newRole,
      _correlation_id: data.metadata?.correlationId ?? undefined,
    });
    if (error) mapPgError(error);
    return row;
  });

export const transferOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TransferOwnershipCommandSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("transfer_tenant_ownership", {
      _tenant_id: data.tenantId,
      _new_owner_id: data.newOwnerId,
      _correlation_id: data.metadata?.correlationId ?? undefined,
    });
    if (error) mapPgError(error);
    return { ok: true };
  });

export const changeMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChangeMemberStatusCommandSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("change_tenant_member_status", {
      _tenant_id: data.tenantId,
      _user_id: data.userId,
      _new_status: data.newStatus,
      _correlation_id: data.metadata?.correlationId ?? undefined,
    });
    if (error) mapPgError(error);
    return row;
  });

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInvitationCommandSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + data.ttlSeconds * 1000).toISOString();
    const { data: row, error } = await supabase.rpc("create_tenant_invitation", {
      _tenant_id: data.tenantId,
      _email: data.email,
      _role: data.role,
      _token_hash: tokenHash,
      _expires_at: expiresAt,
      _correlation_id: data.metadata.correlationId ?? undefined,
    });
    if (error) mapPgError(error);
    // Token is returned ONCE to the caller; never persisted in the clear.
    return { invitation: row, token };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RevokeInvitationCommandSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("revoke_tenant_invitation", {
      _invitation_id: data.invitationId,
      _correlation_id: data.metadata?.correlationId ?? undefined,
    });
    if (error) mapPgError(error);
    return row;
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AcceptInvitationCommandSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const tokenHash = await hashToken(data.token);
    const { data: row, error } = await supabase.rpc("accept_tenant_invitation", {
      _token_hash: tokenHash,
      _correlation_id: data.metadata.correlationId ?? undefined,
    });
    if (error) mapPgError(error);
    return row;
  });

// Read-only listing for the tenant admin console. RLS applies.
export const listTenantMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!d || typeof d !== "object" || !("tenantId" in d)) {
      throw new ApiError({ code: "VALIDATION_FAILED", message: "tenantId required" });
    }
    return d as { tenantId: string };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("tenant_members")
      .select("id, tenant_id, user_id, role, status, row_version, created_at, updated_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: true });
    if (error) throw toApiError(error);
    return rows ?? [];
  });

export const listTenantInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!d || typeof d !== "object" || !("tenantId" in d)) {
      throw new ApiError({ code: "VALIDATION_FAILED", message: "tenantId required" });
    }
    return d as { tenantId: string };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("tenant_invitations")
      .select("id, tenant_id, email, role, status, expires_at, created_at, invited_by")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw toApiError(error);
    return rows ?? [];
  });