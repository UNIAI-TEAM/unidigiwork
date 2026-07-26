import { describe, it, expect } from "vitest";
import {
  DomainEventEnvelopeSchema,
  EVENT_TYPE_PATTERN,
  KNOWN_EVENT_TYPES,
  assertNoSecretFields,
  FORBIDDEN_PAYLOAD_FIELDS,
} from "./envelope";

describe("domain event envelope", () => {
  it("all known event types follow naming convention", () => {
    for (const t of KNOWN_EVENT_TYPES) {
      expect(EVENT_TYPE_PATTERN.test(t)).toBe(true);
    }
  });

  it("rejects invalid envelope", () => {
    const bad = { eventId: "not-a-uuid", eventType: "bad", payload: {} };
    expect(DomainEventEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts valid envelope", () => {
    const ok = {
      eventId: "00000000-0000-4000-8000-000000000001",
      eventType: "task.created.v1",
      eventVersion: 1,
      aggregateType: "task",
      aggregateId: "t1",
      occurredAt: new Date().toISOString(),
      payload: { title: "hello" },
    };
    expect(DomainEventEnvelopeSchema.safeParse(ok).success).toBe(true);
  });

  it("assertNoSecretFields blocks forbidden fields", () => {
    for (const field of FORBIDDEN_PAYLOAD_FIELDS) {
      expect(() => assertNoSecretFields({ [field]: "leak" })).toThrow();
    }
    expect(() => assertNoSecretFields({ title: "ok" })).not.toThrow();
  });
});