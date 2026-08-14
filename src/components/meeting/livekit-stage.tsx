// Browser-only LiveKit stage. Loaded via React.lazy inside <ClientOnly>.
// Never fabricate LiveKit tokens here: the token prop is signed server-side.
import "@livekit/components-styles";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { useEffect } from "react";

export interface LiveKitStageProps {
  serverUrl: string;
  token: string;
  onDisconnected: () => void;
  /** Báo trạng thái kết nối ra ngoài để trang chủ động rejoin. */
  onConnectionStateChange?: (state: "connected" | "reconnecting" | "disconnected" | "connecting") => void;
  /** Bật/tắt micro thật của người dùng trong phòng. */
  micEnabled?: boolean;
  /** Bật/tắt camera thật của người dùng trong phòng. */
  camEnabled?: boolean;
  /** Thiết bị đã chọn ở màn hình chờ. */
  micDeviceId?: string;
  camDeviceId?: string;
  /** Báo ngược trạng thái thật (khi người dùng bấm nút trong khung LiveKit). */
  onMediaStateChange?: (state: { mic: boolean; cam: boolean }) => void;
}

function MediaSync({
  micEnabled,
  camEnabled,
  micDeviceId,
  camDeviceId,
  onMediaStateChange,
}: Pick<LiveKitStageProps, "micEnabled" | "camEnabled" | "micDeviceId" | "camDeviceId" | "onMediaStateChange">) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  // Áp trạng thái nút bên ngoài vào track thật.
  useEffect(() => {
    if (!localParticipant || micEnabled === undefined) return;
    if (isMicrophoneEnabled !== micEnabled) {
      void localParticipant.setMicrophoneEnabled(micEnabled).catch(() => {});
    }
  }, [localParticipant, micEnabled, isMicrophoneEnabled]);

  useEffect(() => {
    if (!localParticipant || camEnabled === undefined) return;
    if (isCameraEnabled !== camEnabled) {
      void localParticipant.setCameraEnabled(camEnabled).catch(() => {});
    }
  }, [localParticipant, camEnabled, isCameraEnabled]);

  // Áp thiết bị đã chọn.
  useEffect(() => {
    if (!micDeviceId || !localParticipant) return;
    void localParticipant.setMicrophoneEnabled(micEnabled ?? true, { deviceId: micDeviceId }).catch(() => {});
  }, [micDeviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!camDeviceId || !localParticipant) return;
    void localParticipant.setCameraEnabled(camEnabled ?? true, { deviceId: camDeviceId }).catch(() => {});
  }, [camDeviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Báo ngược ra ngoài khi người dùng đổi bằng nút của LiveKit.
  useEffect(() => {
    onMediaStateChange?.({ mic: isMicrophoneEnabled, cam: isCameraEnabled });
  }, [isMicrophoneEnabled, isCameraEnabled, onMediaStateChange]);

  return null;
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
  micEnabled,
  camEnabled,
  micDeviceId,
  camDeviceId,
  onMediaStateChange,
}: LiveKitStageProps) {
  return (
    <div className="relative h-full w-full">
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      video={camEnabled ?? true}
      audio={micEnabled ?? true}
      onDisconnected={onDisconnected}
      data-lk-theme="default"
      style={{ height: "100%", width: "100%", borderRadius: "0.75rem", overflow: "hidden" }}
    >
      <VideoConference />
      <RoomAudioRenderer />
      <ConnectionMonitor onConnectionStateChange={onConnectionStateChange} />
      <MediaSync
        micEnabled={micEnabled}
        camEnabled={camEnabled}
        micDeviceId={micDeviceId}
        camDeviceId={camDeviceId}
        onMediaStateChange={onMediaStateChange}
      />
    </LiveKitRoom>
    </div>
  );
}