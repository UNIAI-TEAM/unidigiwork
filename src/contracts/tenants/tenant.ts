// Blueprint §5, §7 — Tenant domain contracts (Batch 1B).
import { z } from "zod";
import type { TenantId, UserId, WorkspaceId } from "../common/ids";
import type {
  AuditMetadata,
  CommandMetadata,
  TenantScopedResource,
  VersionedResource,
} from "../common/base";

export type TenantStatus = "active" | "suspended" | "archived";
export type TenantRole = "tenant_owner" | "tenant_admin" | "manager" | "member" | "guest";
export type TenantMemberStatus = "active" | "invited" | "suspended" | "removed";
export type TenantInvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface Tenant extends VersionedResource, AuditMetadata {
  id: TenantId;
  slug: string;
  name: string;
  status: TenantStatus;
}

export interface TenantMember extends VersionedResource, TenantScopedResource, AuditMetadata {
  id: string;
  userId: UserId;
  role: TenantRole;
  status: TenantMemberStatus;
}

export interface TenantInvitation extends VersionedResource, TenantScopedResource, AuditMetadata {
  id: string;
  email: string;
  role: TenantRole;
  status: TenantInvitationStatus;
  expiresAt: string;
  invitedBy?: UserId | null;
  acceptedBy?: UserId | null;
  acceptedAt?: string | null;
  revokedAt?: string | null;
}

// ---------------- Commands ----------------

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

export const ProvisionTenantCommandSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().regex(SLUG_PATTERN),
  defaultWorkspaceName: z.string().min(2).max(120),
  metadata: z.object({
    idempotencyKey: z.string().min(8),
    correlationId: z.string().optional(),
  }),
});
export type ProvisionTenantCommand = z.infer<typeof ProvisionTenantCommandSchema>;

export interface ProvisionTenantResult {
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  membershipId: string;
}

export const ChangeTenantStatusCommandSchema = z.object({
  tenantId: z.string().uuid(),
  newStatus: z.enum(["active", "suspended", "archived"]),
  metadata: z
    .object({
      idempotencyKey: z.string().min(8).optional(),
      correlationId: z.string().optional(),
      expectedRowVersion: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type ChangeTenantStatusCommand = z.infer<typeof ChangeTenantStatusCommandSchema>;

export const ChangeMemberRoleCommandSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  newRole: z.enum(["tenant_owner", "tenant_admin", "manager", "member", "guest"]),
  metadata: z.object({ correlationId: z.string().optional() }).optional(),
});
export type ChangeMemberRoleCommand = z.infer<typeof ChangeMemberRoleCommandSchema>;

export const TransferOwnershipCommandSchema = z.object({
  tenantId: z.string().uuid(),
  newOwnerId: z.string().uuid(),
  metadata: z.object({ correlationId: z.string().optional() }).optional(),
});
export type TransferOwnershipCommand = z.infer<typeof TransferOwnershipCommandSchema>;

export const ChangeMemberStatusCommandSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  newStatus: z.enum(["active", "invited", "suspended", "removed"]),
  metadata: z.object({ correlationId: z.string().optional() }).optional(),
});
export type ChangeMemberStatusCommand = z.infer<typeof ChangeMemberStatusCommandSchema>;

export const CreateInvitationCommandSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["tenant_admin", "manager", "member", "guest"]),
  ttlSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 14),
  metadata: z.object({
    idempotencyKey: z.string().min(8),
    correlationId: z.string().optional(),
  }),
});
export type CreateInvitationCommand = z.infer<typeof CreateInvitationCommandSchema>;

export const AcceptInvitationCommandSchema = z.object({
  token: z.string().min(16),
  metadata: z.object({
    idempotencyKey: z.string().min(8),
    correlationId: z.string().optional(),
  }),
});
export type AcceptInvitationCommand = z.infer<typeof AcceptInvitationCommandSchema>;

export const RevokeInvitationCommandSchema = z.object({
  invitationId: z.string().uuid(),
  metadata: z.object({ correlationId: z.string().optional() }).optional(),
});
export type RevokeInvitationCommand = z.infer<typeof RevokeInvitationCommandSchema>;

// Command envelope helper (Blueprint §9)
export type WithMetadata<T> = T & { metadata: CommandMetadata };

export const KNOWN_TENANT_EVENT_TYPES = [
  "tenant.created.v1",
  "tenant.suspended.v1",
  "tenant.reactivated.v1",
  "tenant.archived.v1",
  "tenant.ownership_transferred.v1",
  "tenant.member_added.v1",
  "tenant.member_invited.v1",
  "tenant.member_role_changed.v1",
  "tenant.member_status_changed.v1",
  "workspace.created.v1",
] as const;
