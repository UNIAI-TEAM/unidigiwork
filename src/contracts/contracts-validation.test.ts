import { describe, it, expect } from "vitest";
import {
  CreateTaskCommandSchema,
  CreateDocumentCommandSchema,
  JoinMeetingTokenRequestSchema,
  MarkNotificationReadCommandSchema,
} from "./index";

describe("command schemas reject invalid input", () => {
  it("CreateTaskCommand requires idempotencyKey and title", () => {
    expect(CreateTaskCommandSchema.safeParse({}).success).toBe(false);
    expect(
      CreateTaskCommandSchema.safeParse({
        idempotencyKey: "k",
        workspaceId: "00000000-0000-4000-8000-000000000001",
        title: "hello",
      }).success,
    ).toBe(true);
  });

  it("CreateDocumentCommand validates storageRef shape", () => {
    const bad = CreateDocumentCommandSchema.safeParse({
      idempotencyKey: "k",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      title: "doc",
      storageRef: { provider: "", bucket: "", objectKey: "" },
    });
    expect(bad.success).toBe(false);
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
