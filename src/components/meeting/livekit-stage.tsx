// Browser-only LiveKit stage. Loaded via React.lazy inside <ClientOnly>.
// Never fabricate LiveKit tokens here: the token prop is signed server-side.
import "@livekit/components-styles";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";

export interface LiveKitStageProps {
  serverUrl: string;
  token: string;
  onDisconnected: () => void;
}

export default function LiveKitStage({ serverUrl, token, onDisconnected }: LiveKitStageProps) {
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      video
      audio
      onDisconnected={onDisconnected}
      data-lk-theme="default"
      style={{ height: "100%", width: "100%", borderRadius: "0.75rem", overflow: "hidden" }}
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}