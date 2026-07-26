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