// Blueprint §5, §9, §25 — neutral base shapes for aggregates and commands.
import type {
  TenantId,
  UserId,
  CorrelationId,
  IdempotencyKey,
} from "./ids";

export interface VersionedResource {
  rowVersion: number;
}

export interface TenantScopedResource {
  tenantId: TenantId;
}

export interface AuditMetadata {
  createdAt: string;
  updatedAt?: string;
  createdBy?: UserId | null;
  updatedBy?: UserId | null;
}

export interface CommandMetadata {
  idempotencyKey: IdempotencyKey;
  correlationId?: CorrelationId;
  expectedRowVersion?: number;
}

export interface StorageObjectRef {
  provider: string;
  bucket: string;
  objectKey: string;
}