// Blueprint §5.5, §9 — React Query hooks for tenant lifecycle.
// Components import from here; hooks call server functions via useServerFn.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getActiveTenant,
  listAvailableTenants,
  setActiveTenant,
  clearActiveTenant,
} from "@/lib/api/active-tenant.functions";
import {
  provisionTenant,
  listTenantMembers,
  listTenantInvitations,
  changeMemberRole,
  changeMemberStatus,
  transferOwnership,
  createInvitation,
  revokeInvitation,
  acceptInvitation,
  changeTenantStatus,
} from "@/lib/api/tenants.functions";
import { listTenantWorkspaces } from "@/lib/api/workspaces-admin.functions";
import { listTenantAuditEvents } from "@/lib/api/audit.functions";
import {
  tenantKeys,
  adminWorkspaceKeys,
  auditKeys,
  type AdminWorkspaceFilters,
  type AuditFilters,
} from "./query-keys";

export function useActiveTenant() {
  const fn = useServerFn(getActiveTenant);
  return useQuery({ queryKey: tenantKeys.active(), queryFn: () => fn() });
}

export function useAvailableTenants() {
  const fn = useServerFn(listAvailableTenants);
  return useQuery({ queryKey: tenantKeys.available(), queryFn: () => fn() });
}

export function useSetActiveTenant() {
  const qc = useQueryClient();
  const fn = useServerFn(setActiveTenant);
  return useMutation({
    mutationFn: (tenantId: string) => fn({ data: { tenantId } }),
    onSuccess: async () => {
      // Nuke tenant-scoped cache; force fresh reads under new tenant context.
      await qc.cancelQueries();
      qc.clear();
    },
  });
}

export function useClearActiveTenant() {
  const qc = useQueryClient();
  const fn = useServerFn(clearActiveTenant);
  return useMutation({
    mutationFn: () => fn(),
    onSuccess: async () => {
      await qc.cancelQueries();
      qc.clear();
    },
  });
}

export function useProvisionTenant() {
  const qc = useQueryClient();
  const fn = useServerFn(provisionTenant);
  return useMutation({
    mutationFn: (input: {
      name: string;
      slug: string;
      defaultWorkspaceName: string;
      metadata: { idempotencyKey: string; correlationId?: string };
    }) => fn({ data: input }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: tenantKeys.all });
    },
  });
}

export function useTenantMembers(tenantId: string | undefined) {
  const fn = useServerFn(listTenantMembers);
  return useQuery({
    queryKey: tenantId ? tenantKeys.members(tenantId) : ["tenants", "members", "disabled"],
    queryFn: () => fn({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });
}

export function useTenantInvitations(tenantId: string | undefined) {
  const fn = useServerFn(listTenantInvitations);
  return useQuery({
    queryKey: tenantId ? tenantKeys.invitations(tenantId) : ["tenants", "invitations", "disabled"],
    queryFn: () => fn({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });
}

export function useChangeMemberRole(tenantId: string) {
  const qc = useQueryClient();
  const fn = useServerFn(changeMemberRole);
  return useMutation({
    mutationFn: (input: { userId: string; newRole: "tenant_owner" | "tenant_admin" | "manager" | "member" | "guest" }) =>
      fn({ data: { tenantId, userId: input.userId, newRole: input.newRole } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tenantKeys.members(tenantId) }),
  });
}

export function useChangeMemberStatus(tenantId: string) {
  const qc = useQueryClient();
  const fn = useServerFn(changeMemberStatus);
  return useMutation({
    mutationFn: (input: { userId: string; newStatus: "active" | "invited" | "suspended" | "removed" }) =>
      fn({ data: { tenantId, userId: input.userId, newStatus: input.newStatus } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tenantKeys.members(tenantId) }),
  });
}

export function useTransferOwnership(tenantId: string) {
  const qc = useQueryClient();
  const fn = useServerFn(transferOwnership);
  return useMutation({
    mutationFn: (newOwnerId: string) => fn({ data: { tenantId, newOwnerId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tenantKeys.members(tenantId) }),
  });
}

export function useCreateInvitation(tenantId: string) {
  const qc = useQueryClient();
  const fn = useServerFn(createInvitation);
  return useMutation({
    mutationFn: (input: { email: string; role: "tenant_admin" | "manager" | "member" | "guest"; ttlSeconds: number; idempotencyKey: string }) =>
      fn({
        data: {
          tenantId,
          email: input.email,
          role: input.role,
          ttlSeconds: input.ttlSeconds,
          metadata: { idempotencyKey: input.idempotencyKey },
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tenantKeys.invitations(tenantId) }),
  });
}

export function useRevokeInvitation(tenantId: string) {
  const qc = useQueryClient();
  const fn = useServerFn(revokeInvitation);
  return useMutation({
    mutationFn: (invitationId: string) => fn({ data: { invitationId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tenantKeys.invitations(tenantId) }),
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  const fn = useServerFn(acceptInvitation);
  return useMutation({
    mutationFn: (input: { token: string; idempotencyKey: string }) =>
      fn({ data: { token: input.token, metadata: { idempotencyKey: input.idempotencyKey } } }),
    onSuccess: async () => {
      await qc.cancelQueries();
      qc.clear();
    },
  });
}

export function useChangeTenantStatus(tenantId: string) {
  const qc = useQueryClient();
  const fn = useServerFn(changeTenantStatus);
  return useMutation({
    mutationFn: (newStatus: "active" | "suspended" | "archived") =>
      fn({ data: { tenantId, newStatus } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tenantKeys.all }),
  });
}

export function useTenantWorkspaces(tenantId: string | undefined, filters: AdminWorkspaceFilters) {
  const fn = useServerFn(listTenantWorkspaces);
  return useQuery({
    queryKey: tenantId
      ? adminWorkspaceKeys.list(tenantId, filters)
      : ["admin", "workspaces", "disabled"],
    queryFn: () =>
      fn({
        data: {
          tenantId: tenantId!,
          search: filters.search || undefined,
          status: filters.status ?? "all",
          sort: filters.sort ?? "newest",
          page: filters.page ?? 1,
          pageSize: filters.pageSize ?? 25,
        },
      }),
    enabled: !!tenantId,
  });
}

export function useTenantAuditEvents(tenantId: string | undefined, filters: AuditFilters) {
  const fn = useServerFn(listTenantAuditEvents);
  return useQuery({
    queryKey: tenantId
      ? auditKeys.list(tenantId, filters)
      : ["admin", "audit", "disabled"],
    queryFn: () =>
      fn({
        data: {
          tenantId: tenantId!,
          action: filters.action || undefined,
          resourceType: filters.resourceType || undefined,
          actorId: filters.actorId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          page: filters.page ?? 1,
          pageSize: filters.pageSize ?? 25,
        },
      }),
    enabled: !!tenantId,
  });
}