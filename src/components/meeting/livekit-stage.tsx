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
import { ConnectionState, ConnectionQuality, Track } from "livekit-client";
import { useEffect, useMemo, useRef } from "react";
import {
  applyPresetToTrack,
  degrade,
  readTrackSurface,
  resolvePreset,
  upgrade,
  type ShareQualityKey,
  type ShareSourceKey,
} from "@/lib/screen-share-quality";
import { useI18n } from "@/lib/i18n";
import { toastDisplayMediaError } from "@/components/meeting/share-messages";

export interface LiveKitStageProps {
  serverUrl: string;
  token: string;
  onDisconnected: () => void;
  /** Báo trạng thái kết nối ra ngoài để trang chủ động rejoin. */
  onConnectionStateChange?: (
    state: "connected" | "reconnecting" | "disconnected" | "connecting",
  ) => void;
  /** Bật/tắt micro thật của người dùng trong phòng. */
  micEnabled?: boolean;
  /** Bật/tắt camera thật của người dùng trong phòng. */
  camEnabled?: boolean;
  /** Thiết bị đã chọn ở màn hình chờ. */
  micDeviceId?: string;
  camDeviceId?: string;
  /** Báo ngược trạng thái thật (khi người dùng bấm nút trong khung LiveKit). */
  onMediaStateChange?: (state: { mic: boolean; cam: boolean }) => void;
  /** Chất lượng chia sẻ màn hình; "auto" sẽ tự điều chỉnh khi mạng yếu. */
  shareQuality?: ShareQualityKey;
  /** Báo bậc chất lượng thực tế đang dùng (key của preset, UI tự dịch nhãn). */
  onShareQualityResolved?: (key: Exclude<ShareQualityKey, "auto">) => void;
  /** Yêu cầu publish/ngừng publish track chia sẻ màn hình vào phòng. */
  screenShareEnabled?: boolean;
  /** Báo ngược trạng thái chia sẻ màn hình thật trong phòng. */
  onScreenShareStateChange?: (enabled: boolean) => void;
  /** Nguồn chia sẻ ưu tiên: toàn màn hình / cửa sổ / tab. */
  shareSource?: ShareSourceKey;
  /** Báo nguồn thật mà người dùng đã chọn trong hộp thoại. */
  onShareSourceResolved?: (surface: ShareSourceKey | null) => void;
}

/** Đồng bộ nút chia sẻ màn hình bên ngoài với track thật publish vào LiveKit. */
function ScreenShareSync({
  screenShareEnabled,
  shareQuality = "auto",
  shareSource = "any",
  onScreenShareStateChange,
  onShareSourceResolved,
}: Pick<
  LiveKitStageProps,
  | "screenShareEnabled"
  | "shareQuality"
  | "shareSource"
  | "onScreenShareStateChange"
  | "onShareSourceResolved"
>) {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!localParticipant || screenShareEnabled === undefined) return;
    if (isScreenShareEnabled === screenShareEnabled) return;
    const preset = resolvePreset(shareQuality);
    void localParticipant
      .setScreenShareEnabled(screenShareEnabled, {
        audio: true,
        contentHint: preset.contentHint,
        ...(shareSource !== "any" ? { video: { displaySurface: shareSource } } : {}),
        resolution: {
          width: preset.width,
          height: preset.height,
          frameRate: preset.frameRate,
        },
      })
      .then(() => {
        if (!screenShareEnabled) return;
        const track = localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track
          ?.mediaStreamTrack;
        onShareSourceResolved?.(readTrackSurface(track));
      })
      .catch((err: unknown) => {
        // Người dùng hủy/từ chối hộp thoại chọn màn hình -> trả nút về trạng thái tắt + hướng dẫn.
        toastDisplayMediaError(err, tRef.current);
        onScreenShareStateChange?.(false);
      });
  }, [
    localParticipant,
    screenShareEnabled,
    isScreenShareEnabled,
    shareQuality,
    shareSource,
    onScreenShareStateChange,
    onShareSourceResolved,
  ]);

  // Người dùng bấm "Stop sharing" của trình duyệt hoặc nút trong khung LiveKit.
  useEffect(() => {
    onScreenShareStateChange?.(isScreenShareEnabled);
  }, [isScreenShareEnabled, onScreenShareStateChange]);

  return null;
}

/**
 * Ép độ phân giải/khung hình cho track màn hình đang publish và tự hạ bậc
 * khi chất lượng kết nối kém (chống giật), tự nâng lại khi mạng hồi phục.
 */
function ScreenShareQuality({
  shareQuality = "auto",
  onShareQualityResolved,
}: Pick<LiveKitStageProps, "shareQuality" | "onShareQualityResolved">) {
  const { localParticipant } = useLocalParticipant();
  const levelRef = useRef(resolvePreset(shareQuality).key);

  useEffect(() => {
    if (!localParticipant) return;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      const pub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
      const track = pub?.track?.mediaStreamTrack;
      if (!track) return;

      let next = shareQuality === "auto" ? levelRef.current : resolvePreset(shareQuality).key;
      if (shareQuality === "auto") {
        const q = localParticipant.connectionQuality;
        if (q === ConnectionQuality.Poor) next = degrade(next);
        else if (q === ConnectionQuality.Excellent) next = upgrade(next);
      }
      const preset = resolvePreset(next);
      if (next !== levelRef.current || !pub?.isMuted) {
        levelRef.current = next;
        await applyPresetToTrack(track, preset);
        onShareQualityResolved?.(preset.key);
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [localParticipant, shareQuality, onShareQualityResolved]);

  return null;
}

function MediaSync({
  micEnabled,
  camEnabled,
  micDeviceId,
  camDeviceId,
  onMediaStateChange,
}: Pick<
  LiveKitStageProps,
  "micEnabled" | "camEnabled" | "micDeviceId" | "camDeviceId" | "onMediaStateChange"
>) {
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
    void localParticipant
      .setMicrophoneEnabled(micEnabled ?? true, { deviceId: micDeviceId })
      .catch(() => {});
  }, [micDeviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!camDeviceId || !localParticipant) return;
    void localParticipant
      .setCameraEnabled(camEnabled ?? true, { deviceId: camDeviceId })
      .catch(() => {});
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
  const { t } = useI18n();
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
      <span
        role="status"
        className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-foreground shadow"
      >
        {t("mtg.room.reconnecting")}
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
  shareQuality = "auto",
  onShareQualityResolved,
  screenShareEnabled,
  onScreenShareStateChange,
  shareSource,
  onShareSourceResolved,
}: LiveKitStageProps) {
  const preset = useMemo(() => resolvePreset(shareQuality), [shareQuality]);
  return (
    <div className="relative h-full w-full">
      <LiveKitRoom
        serverUrl={serverUrl}
        token={token}
        connect
        video={camEnabled ?? true}
        audio={micEnabled ?? true}
        onDisconnected={onDisconnected}
        options={{
          // Chỉ gửi/nhận đúng độ phân giải đang hiển thị -> đỡ giật khi mạng yếu.
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            screenShareEncoding: {
              maxBitrate: preset.maxBitrate,
              maxFramerate: preset.frameRate,
            },
            simulcast: true,
            degradationPreference: "maintain-resolution",
          },
        }}
        data-lk-theme="default"
        style={{ height: "100%", width: "100%", borderRadius: "0.75rem", overflow: "hidden" }}
      >
        <VideoConference />
        <RoomAudioRenderer />
        <ConnectionMonitor onConnectionStateChange={onConnectionStateChange} />
        <ScreenShareQuality
          shareQuality={shareQuality}
          onShareQualityResolved={onShareQualityResolved}
        />
        <ScreenShareSync
          screenShareEnabled={screenShareEnabled}
          shareQuality={shareQuality}
          shareSource={shareSource}
          onScreenShareStateChange={onScreenShareStateChange}
          onShareSourceResolved={onShareSourceResolved}
        />
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
