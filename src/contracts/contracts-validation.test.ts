import { describe, it, expect } from "vitest";
import {
  CreateTaskCommandSchema,
  TransitionTaskCommandSchema,
  isTaskTransitionAllowed,
  CreateDocumentCommandSchema,
  ShareDocumentCommandSchema,
  JoinMeetingTokenRequestSchema,
  ScheduleMeetingCommandSchema,
  CreateWorkflowCommandSchema,
  WorkflowDefinitionSchema,
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

describe("Batch 1D domain schemas", () => {
  const WS = "00000000-0000-4000-8000-000000000001";

  it("TransitionTaskCommand only accepts allowed statuses", () => {
    expect(
      TransitionTaskCommandSchema.safeParse({ idempotencyKey: IDEM, toStatus: "done" })
        .success,
    ).toBe(true);
    expect(
      TransitionTaskCommandSchema.safeParse({ idempotencyKey: IDEM, toStatus: "nope" })
        .success,
    ).toBe(false);
  });

  it("task status transition matrix enforced", () => {
    expect(isTaskTransitionAllowed("todo", "in_progress")).toBe(true);
    expect(isTaskTransitionAllowed("done", "todo")).toBe(false);
    expect(isTaskTransitionAllowed("todo", "todo")).toBe(false);
  });

  it("ScheduleMeetingCommand requires endAt > startAt", () => {
    const base = {
      idempotencyKey: IDEM,
      workspaceId: WS,
      title: "Sync",
      timezone: "Asia/Ho_Chi_Minh",
    };
    expect(
      ScheduleMeetingCommandSchema.safeParse({
        ...base,
        startAt: "2026-08-01T10:00:00.000Z",
        endAt: "2026-08-01T09:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      ScheduleMeetingCommandSchema.safeParse({
        ...base,
        startAt: "2026-08-01T10:00:00.000Z",
        endAt: "2026-08-01T11:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("ShareDocumentCommand enforces principalType + level enums", () => {
    expect(
      ShareDocumentCommandSchema.safeParse({
        idempotencyKey: IDEM,
        principalType: "group",
        principalId: WS,
        level: "view",
      }).success,
    ).toBe(false);
    expect(
      ShareDocumentCommandSchema.safeParse({
        idempotencyKey: IDEM,
        principalType: "user",
        principalId: WS,
        level: "edit",
      }).success,
    ).toBe(true);
  });

  it("WorkflowDefinition rejects invalid DAG references", () => {
    expect(
      WorkflowDefinitionSchema.safeParse({
        version: 1,
        startNodeKey: "missing",
        nodes: [{ key: "a", type: "task" }],
      }).success,
    ).toBe(false);

    expect(
      WorkflowDefinitionSchema.safeParse({
        version: 1,
        startNodeKey: "a",
        nodes: [
          { key: "a", type: "task", next: ["b"] },
          { key: "b", type: "task" },
        ],
      }).success,
    ).toBe(true);
  });

  it("CreateWorkflowCommand validates nested definition", () => {
    expect(
      CreateWorkflowCommandSchema.safeParse({
        idempotencyKey: IDEM,
        workspaceId: WS,
        name: "Onboarding",
        definition: {
          version: 1,
          startNodeKey: "start",
          nodes: [{ key: "start", type: "manual" }],
        },
      }).success,
    ).toBe(true);
  });
});
