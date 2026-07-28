import { describe, it, expect } from "vitest";
import {
  CreateTaskCommandSchema,
  CreateDocumentCommandSchema,
  JoinMeetingTokenRequestSchema,
  MarkNotificationReadCommandSchema,
  commandMetadataSchema,
} from "./index";

const IDEM = "01J8ZC3RF9XKPB8N5H2E5G4Q7Y"; // ULID-like, 26 chars

describe("command schemas reject invalid input", () => {
  it("CreateTaskCommand requires idempotencyKey and title", () => {
    expect(CreateTaskCommandSchema.safeParse({}).success).toBe(false);
    // rejects too-short idempotency key
    expect(
      CreateTaskCommandSchema.safeParse({
        idempotencyKey: "short",
        workspaceId: "00000000-0000-4000-8000-000000000001",
        title: "hello",
      }).success,
    ).toBe(false);
    expect(
      CreateTaskCommandSchema.safeParse({
        idempotencyKey: IDEM,
        workspaceId: "00000000-0000-4000-8000-000000000001",
        title: "hello",
      }).success,
    ).toBe(true);
  });

  it("CreateDocumentCommand validates storageRef shape", () => {
    const bad = CreateDocumentCommandSchema.safeParse({
      idempotencyKey: IDEM,
      workspaceId: "00000000-0000-4000-8000-000000000001",
      title: "doc",
      storageRef: { provider: "", bucket: "", objectKey: "" },
    });
    expect(bad.success).toBe(false);
  });

  it("shared commandMetadataSchema rejects illegal chars", () => {
    expect(commandMetadataSchema.safeParse({ idempotencyKey: IDEM }).success).toBe(true);
    expect(
      commandMetadataSchema.safeParse({ idempotencyKey: "has space here!" }).success,
    ).toBe(false);
  });

  it("JoinMeetingTokenRequest restricts role enum", () => {
    expect(
      JoinMeetingTokenRequestSchema.safeParse({
        participantIdentity: "u1",
        role: "root",
      }).success,
    ).toBe(false);
  });

  it("MarkNotificationReadCommand requires uuid", () => {
    expect(
      MarkNotificationReadCommandSchema.safeParse({
        idempotencyKey: "k",
        notificationId: "not-uuid",
      }).success,
    ).toBe(false);
  });
});
