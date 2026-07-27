// Blueprint §5.5 — tenant-scoped query key factory.
// Every tenant-scoped query key MUST include tenantId to prevent
// cross-tenant cache leaks when the active tenant changes.
export const tenantKeys = {
  all: ["tenants"] as const,
  active: () => ["tenants", "active"] as const,
  available: () => ["tenants", "available"] as const,
  detail: (tenantId: string) => ["tenants", "detail", tenantId] as const,
  members: (tenantId: string) => ["tenants", tenantId, "members"] as const,
  invitations: (tenantId: string) => ["tenants", tenantId, "invitations"] as const,
  audit: (tenantId: string) => ["tenants", tenantId, "audit"] as const,
};

export const workspaceKeys = {
  list: (tenantId: string) => ["workspaces", tenantId] as const,
  detail: (tenantId: string, workspaceId: string) =>
    ["workspaces", tenantId, workspaceId] as const,
};

// Batch 1B-UI-FINISH — admin workspace list & audit list keys.
// Every key MUST include tenantId to prevent cross-tenant cache leaks.
export interface AdminWorkspaceFilters {
  search?: string;
  status?: "active" | "archived" | "all";
  sort?: "newest" | "oldest" | "name";
  page?: number;
  pageSize?: number;
}
export const adminWorkspaceKeys = {
  list: (tenantId: string, filters: AdminWorkspaceFilters) =>
    ["admin", "workspaces", tenantId, filters] as const,
};

export interface AuditFilters {
  action?: string;
  resourceType?: string;
  actorId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
export const auditKeys = {
  list: (tenantId: string, filters: AuditFilters) =>
    ["admin", "audit", tenantId, filters] as const,
};