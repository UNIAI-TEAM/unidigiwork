import { z } from "zod";
import type { MeetingId, TenantId, WorkspaceId, UserId } from "../common/ids";
import type { CommandMetadata } from "../common/base";
import { commandMetadataSchema } from "../common/base";

// ADR-1D-001 §2.3
export type MeetingStatus = "scheduled" | "live" | "ended" | "canceled";
export type MeetingRsvp = "pending" | "accepted" | "declined" | "tentative";
export type MeetingParticipantRole = "host" | "moderator" | "participant" | "viewer";

export const MEETING_STATUSES = ["scheduled", "live", "ended", "canceled"] as const;
export const MEETING_RSVPS = ["pending", "accepted", "declined", "tentative"] as const;
export const MEETING_PARTICIPANT_ROLES = [
  "host",
  "moderator",
  "participant",
  "viewer",
] as const;

export interface MeetingDto {
  id: MeetingId;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  title: string;
  agenda?: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  rrule?: string | null;
  location?: string | null;
  conferenceProvider?: string | null;
  status: MeetingStatus;
  createdBy?: UserId | null;
  updatedBy?: UserId | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingParticipantDto {
  meetingId: MeetingId;
  userId: UserId;
  role: MeetingParticipantRole;
  rsvp: MeetingRsvp;
  rsvpAt?: string | null;
}

export interface ScheduleMeetingCommand extends CommandMetadata {
  workspaceId: WorkspaceId;
  title: string;
  agenda?: string;
  startAt: string;
  endAt: string;
  timezone: string;
  rrule?: string;
  location?: string;
  participantIds?: UserId[];
}
export interface UpdateMeetingCommand extends CommandMetadata {
  title?: string;
  agenda?: string | null;
  startAt?: string;
  endAt?: string;
  timezone?: string;
  rrule?: string | null;
  location?: string | null;
}
export type CancelMeetingCommand = CommandMetadata & { reason?: string };
export interface SetMeetingRsvpCommand extends CommandMetadata {
  rsvp: MeetingRsvp;
}

export const ScheduleMeetingCommandSchema = z
  .object({
    ...commandMetadataSchema.shape,
    workspaceId: z.string().uuid(),
    title: z.string().min(1).max(500),
    agenda: z.string().max(10000).optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    timezone: z.string().min(1).max(64),
    rrule: z.string().max(1000).optional(),
    location: z.string().max(500).optional(),
    participantIds: z.array(z.string().uuid()).max(500).optional(),
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), {
    message: "endAt must be greater than startAt",
    path: ["endAt"],
  });

export const UpdateMeetingCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  title: z.string().min(1).max(500).optional(),
  agenda: z.string().max(10000).nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  timezone: z.string().min(1).max(64).optional(),
  rrule: z.string().max(1000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
});

export const CancelMeetingCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  reason: z.string().max(2000).optional(),
});

export const SetMeetingRsvpCommandSchema = z.object({
  ...commandMetadataSchema.shape,
  rsvp: z.enum(MEETING_RSVPS),
});

export interface JoinMeetingTokenRequest {
  participantIdentity: string;
  role: MeetingParticipantRole;
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
  role: z.enum(MEETING_PARTICIPANT_ROLES),
});
