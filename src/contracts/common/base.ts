// Blueprint §5, §9, §25 — neutral base shapes for aggregates and commands.
import { z } from "zod";
import type { TenantId, UserId, CorrelationId, IdempotencyKey } from "./ids";

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

// ---------------------------------------------------------------------------
// Blueprint §25.9 / §9 — shared Zod schema for mutation command metadata.
// Every mutating command MUST validate its metadata against this schema so
// that server-side idempotency dedup (audit_events / outbox_events per-domain
// unique indexes) works consistently. Keys length 8..128 accepts UUID, ULID,
// KSUID, and namespaced custom keys.
// ---------------------------------------------------------------------------
export const IDEMPOTENCY_KEY_MIN = 8;
export const IDEMPOTENCY_KEY_MAX = 128;

export const idempotencyKeySchema = z
  .string()
  .min(IDEMPOTENCY_KEY_MIN)
  .max(IDEMPOTENCY_KEY_MAX)
  .regex(/^[A-Za-z0-9._:-]+$/, "idempotencyKey: allowed chars A-Za-z0-9._:-");

export const correlationIdSchema = z.string().min(1).max(128).optional();

/** Required for every mutating command (create/update/delete/state-change). */
export const commandMetadataSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  correlationId: correlationIdSchema,
  expectedRowVersion: z.number().int().nonnegative().optional(),
});
export type CommandMetadataInput = z.infer<typeof commandMetadataSchema>;

/** For read-adjacent commands where idempotency is not required. */
export const optionalCommandMetadataSchema = commandMetadataSchema.partial();

export interface StorageObjectRef {
  provider: string;
  bucket: string;
  objectKey: string;
}
