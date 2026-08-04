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

export interface MeetingApi {
  getById(id: MeetingId): Promise<MeetingDto>;
  schedule(command: ScheduleMeetingCommand): Promise<MeetingDto>;
  requestJoinToken(
    meetingId: MeetingId,
    input: JoinMeetingTokenRequest,
  ): Promise<JoinMeetingTokenResponse>;
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
};

export function resolveMeetingApi(): MeetingApi {
  const provider = resolveBackendProvider();
  if (provider === "lovable") return lovableMeetingApi;
  return assertJavaConfigured();
}
