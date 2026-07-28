// Blueprint §5.5, §9, §18 — React Query hooks for billing.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listPlans,
  getActiveSubscription,
  getEntitlementSnapshot,
  changeSubscription,
} from "@/lib/api/billing.functions";
import { billingKeys } from "./query-keys";

export function usePlans() {
  const fn = useServerFn(listPlans);
  return useQuery({ queryKey: billingKeys.plans(), queryFn: () => fn() });
}

export function useActiveSubscription(tenantId: string | undefined) {
  const fn = useServerFn(getActiveSubscription);
  return useQuery({
    queryKey: tenantId ? billingKeys.subscription(tenantId) : ["billing", "subscription", "disabled"],
    queryFn: () => fn({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });
}

export function useEntitlements(tenantId: string | undefined) {
  const fn = useServerFn(getEntitlementSnapshot);
  return useQuery({
    queryKey: tenantId ? billingKeys.entitlements(tenantId) : ["billing", "entitlements", "disabled"],
    queryFn: () => fn({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}

export function useChangeSubscription(tenantId: string) {
  const qc = useQueryClient();
  const fn = useServerFn(changeSubscription);
  return useMutation({
    mutationFn: (input: { planCode: string; idempotencyKey: string; expectedRowVersion?: number }) =>
      fn({
        data: {
          tenantId,
          planCode: input.planCode,
          metadata: {
            idempotencyKey: input.idempotencyKey,
            expectedRowVersion: input.expectedRowVersion,
          },
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: billingKeys.all });
    },
  });
}

/**
 * Helper: check a feature flag or quota against the current snapshot.
 * Blueprint §25.13 — NEVER hard-code plan names; always drive UX from entitlements.
 */
export function canUseFeature(
  snapshot: import("@/contracts/billing/plan").EntitlementSnapshotDto | null | undefined,
  featureKey: string,
): { allowed: boolean; reason?: "ENTITLEMENT_DENIED" | "QUOTA_EXCEEDED"; usage?: number; limit?: number | null } {
  if (!snapshot) return { allowed: false, reason: "ENTITLEMENT_DENIED" };
  const ent = snapshot.entitlements.find((e) => e.featureKey === featureKey);
  if (!ent || !ent.enabled) return { allowed: false, reason: "ENTITLEMENT_DENIED" };
  if (ent.kind === "quota" && ent.quotaLimit !== null && ent.currentUsage >= ent.quotaLimit) {
    return { allowed: false, reason: "QUOTA_EXCEEDED", usage: ent.currentUsage, limit: ent.quotaLimit };
  }
  return { allowed: true, usage: ent.currentUsage, limit: ent.quotaLimit };
}