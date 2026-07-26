// Blueprint §11 — Domain event envelope. Neutral shape, versioned type.
import { z } from "zod";
import type { TenantId } from "../common/ids";

export interface DomainEventEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  tenantId?: TenantId | null;
  aggregateType: string;
  aggregateId: string;
  correlationId?: string;
  causationId?: string;
  occurredAt: string;
  payload: TPayload;
}

// Event names MUST follow `domain.action.vN`.
export const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.v[1-9][0-9]*$/;

export const DomainEventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().regex(EVENT_TYPE_PATTERN),
  eventVersion: z.number().int().positive(),
  tenantId: z.string().uuid().nullable().optional(),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  occurredAt: z.string().datetime(),
  payload: z.unknown(),
});

export const KNOWN_EVENT_TYPES = [
  "tenant.created.v1",
  "tenant.member_added.v1",
  "workspace.created.v1",
  "task.created.v1",
  "task.assigned.v1",
  "task.completed.v1",
  "meeting.created.v1",
  "meeting.ended.v1",
  "document.created.v1",
  "document.updated.v1",
  "notification.created.v1",
] as const;

export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number];

// Field names that MUST NEVER appear in event payloads.
export const FORBIDDEN_PAYLOAD_FIELDS = [
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "service_role_key",
  "serviceRoleKey",
  "livekit_token",
  "livekitToken",
  "password",
  "secret",
] as const;

export function assertNoSecretFields(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const keys = Object.keys(payload as Record<string, unknown>);
  for (const k of keys) {
    if ((FORBIDDEN_PAYLOAD_FIELDS as readonly string[]).includes(k)) {
      throw new Error(`Event payload must not contain forbidden field: ${k}`);
    }
  }
}
