// Blueprint §18 — Billing / Subscription / Entitlement / Quota contracts.
// Neutral DTOs. MUST NOT import Supabase types.
import { z } from "zod";
import type { TenantId, UserId } from "../common/ids";
import type { CommandMetadata, VersionedResource, TenantScopedResource, AuditMetadata } from "../common/base";

// -------- Feature catalog (global) --------
export type FeatureKind = "flag" | "quota";

export interface FeatureDto {
  key: string;
  name: string;
  kind: FeatureKind;
  unit: string | null;
  category: string;
  sortOrder: number;
}

// -------- Plan catalog (global) --------
export interface PlanFeatureDto {
  featureKey: string;
  enabled: boolean;
  quotaLimit: number | null;
}

export interface PlanDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  features: PlanFeatureDto[];
}

// -------- Subscription (tenant-scoped) --------
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "suspended"
  | "canceled";

export interface SubscriptionDto extends TenantScopedResource, VersionedResource, AuditMetadata {
  id: string;
  planId: string;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  periodStart: string;
  periodEnd: string | null;
  cancelAt: string | null;
  canceledAt: string | null;
  provider: string;
}

// -------- Entitlement snapshot (tenant-scoped) --------
export interface EntitlementDto {
  featureKey: string;
  featureName: string;
  kind: FeatureKind;
  unit: string | null;
  category: string;
  enabled: boolean;
  quotaLimit: number | null;
  currentUsage: number;
}

export interface EntitlementSnapshotDto {
  tenantId: TenantId;
  planCode: string;
  planName: string;
  subscriptionStatus: SubscriptionStatus;
  entitlements: EntitlementDto[];
  periodStart: string;
  fetchedAt: string;
}

// -------- Commands --------
export const ChangeSubscriptionCommandSchema = z.object({
  tenantId: z.string().uuid(),
  planCode: z.string().min(1).max(64),
  metadata: z.object({
    idempotencyKey: z.string().min(1),
    correlationId: z.string().optional(),
    expectedRowVersion: z.number().int().nonnegative().optional(),
  }),
});
export type ChangeSubscriptionCommand = z.infer<typeof ChangeSubscriptionCommandSchema>;

export const RecordUsageCommandSchema = z.object({
  tenantId: z.string().uuid(),
  meterKey: z.string().min(1).max(128),
  quantity: z.number().int().positive(),
  workspaceId: z.string().uuid().optional(),
  metadata: z.object({
    idempotencyKey: z.string().min(1),
    correlationId: z.string().optional(),
  }),
  extra: z.record(z.unknown()).optional(),
});
export type RecordUsageCommand = z.infer<typeof RecordUsageCommandSchema>;