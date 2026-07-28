// Blueprint §5.5 — tenant-scoped billing query keys.
export const billingKeys = {
  all: ["billing"] as const,
  plans: () => ["billing", "plans"] as const,
  subscription: (tenantId: string) => ["billing", "subscription", tenantId] as const,
  entitlements: (tenantId: string) => ["billing", "entitlements", tenantId] as const,
};