import { z } from "zod";
import type { MeetingId, TenantId, WorkspaceId, UserId } from "../common/ids";
import type { CommandMetadata } from "../common/base";

export interface MeetingDto {
  id: MeetingId;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  title: string;
  scheduledStart: string;
  scheduledEnd?: string | null;
  hostId: UserId;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMeetingCommand extends CommandMetadata {
  workspaceId: WorkspaceId;
  title: string;
  scheduledStart: string;
  scheduledEnd?: string;
}

export interface JoinMeetingTokenRequest {
  participantIdentity: string;
  role: "host" | "moderator" | "participant" | "viewer";
}

// Blueprint §17 — server always issues token. Never generated client-side.
export interface JoinMeetingTokenResponse {
  serverUrl: string;
  token: string;
  roomName: string;
  participantIdentity: string;
  role: string;
  expiresAt: string;
}

export const JoinMeetingTokenRequestSchema = z.object({
  participantIdentity: z.string().min(1),
  role: z.enum(["host", "moderator", "participant", "viewer"]),
});
