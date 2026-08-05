import type {
  MeetingDto,
  MeetingId,
  ScheduleMeetingCommand,
  JoinMeetingTokenRequest,
  JoinMeetingTokenResponse,
} from "@/contracts";
import { ApiError } from "@/contracts/errors";
import { assertJavaConfigured, resolveBackendProvider } from "../core/provider";
import { requestJoinToken as requestJoinTokenFn } from "@/lib/api/meetings.functions";
import {
  requestMeetingJoin as requestMeetingJoinFn,
  getMyMeetingJoinRequest as getMyMeetingJoinRequestFn,
  listMeetingJoinRequests as listMeetingJoinRequestsFn,
  decideMeetingJoinRequest as decideMeetingJoinRequestFn,
} from "@/lib/api/meeting-join-requests.functions";

export type JoinRequestStatus = "pending" | "approved" | "rejected" | "canceled";

export interface MyJoinRequest {
  id: string;
  status: JoinRequestStatus;
  message: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface IncomingJoinRequest {
  id: string;
  requester_id: string;
  status: JoinRequestStatus;
  message: string | null;
  created_at: string;
  decided_at: string | null;
  requester_name: string | null;
  requester_email: string | null;
}

export interface MeetingApi {
  getById(id: MeetingId): Promise<MeetingDto>;
  schedule(command: ScheduleMeetingCommand): Promise<MeetingDto>;
  requestJoinToken(
    meetingId: MeetingId,
    input: JoinMeetingTokenRequest,
  ): Promise<JoinMeetingTokenResponse>;
  requestJoin(
    meetingId: MeetingId,
    message?: string,
  ): Promise<{ status: JoinRequestStatus; request_id?: string; already_participant?: boolean }>;
  getMyJoinRequest(meetingId: MeetingId): Promise<MyJoinRequest | null>;
  listJoinRequests(meetingId: MeetingId): Promise<IncomingJoinRequest[]>;
  decideJoinRequest(requestId: string, approve: boolean): Promise<unknown>;
}

const notImplemented = () => {
  throw new ApiError({
    code: "NOT_IMPLEMENTED",
    message: "Meeting backend is not implemented yet.",
  });
};

const lovableMeetingApi: MeetingApi = {
  async getById() {
    return notImplemented();
  },
  async schedule() {
    return notImplemented();
  },
  async requestJoinToken(meetingId, input) {
    // Never fabricate LiveKit tokens client-side — the server signs them.
    return (await requestJoinTokenFn({
      data: { meetingId, displayName: input.participantIdentity },
    })) as JoinMeetingTokenResponse;
  },
  async requestJoin(meetingId, message) {
    return await requestMeetingJoinFn({ data: { meetingId, message } });
  },
  async getMyJoinRequest(meetingId) {
    return (await getMyMeetingJoinRequestFn({ data: { meetingId } })) as MyJoinRequest | null;
  },
  async listJoinRequests(meetingId) {
    return (await listMeetingJoinRequestsFn({
      data: { meetingId, status: "pending" },
    })) as IncomingJoinRequest[];
  },
  async decideJoinRequest(requestId, approve) {
    return await decideMeetingJoinRequestFn({ data: { requestId, approve } });
  },
};

export function resolveMeetingApi(): MeetingApi {
  const provider = resolveBackendProvider();
  if (provider === "lovable") return lovableMeetingApi;
  return assertJavaConfigured();
}
