// Browser-only LiveKit stage. Loaded via React.lazy inside <ClientOnly>.
// Never fabricate LiveKit tokens here: the token prop is signed server-side.
import "@livekit/components-styles";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useConnectionState,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { useEffect } from "react";

export interface LiveKitStageProps {
  serverUrl: string;
  token: string;
  onDisconnected: () => void;
  /** Báo trạng thái kết nối ra ngoài để trang chủ động rejoin. */
  onConnectionStateChange?: (state: "connected" | "reconnecting" | "disconnected" | "connecting") => void;
}

function ConnectionMonitor({
  onConnectionStateChange,
}: {
  onConnectionStateChange?: LiveKitStageProps["onConnectionStateChange"];
}) {
  const state = useConnectionState();
  useEffect(() => {
    const mapped =
      state === ConnectionState.Connected
        ? "connected"
        : state === ConnectionState.Reconnecting
          ? "reconnecting"
          : state === ConnectionState.Connecting
            ? "connecting"
            : "disconnected";
    onConnectionStateChange?.(mapped);
  }, [state, onConnectionStateChange]);

  if (state !== ConnectionState.Reconnecting) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-2">
      <span className="rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow">
        Mất kết nối tạm thời — đang tự động kết nối lại…
      </span>
    </div>
  );
}

export default function LiveKitStage({
  serverUrl,
  token,
  onDisconnected,
  onConnectionStateChange,
}: LiveKitStageProps) {
  return (
    <div className="relative h-full w-full">
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
      <ConnectionMonitor onConnectionStateChange={onConnectionStateChange} />
    </LiveKitRoom>
    </div>
  );
}