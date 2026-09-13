import { RelatedWorkPanel } from "@/components/work-graph/related-work-panel";
import { AskUniPanel } from "@/components/ai/ask-uni-panel";
import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  MessageSquare,
  Users,
  Sparkles,
  ClipboardList,
  Hand,
  MoreHorizontal,
  FileText,
  Clock,
  Loader2,
  Lock,
  Crown,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  PanelRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { JoinRequestPanel, JoinRequestInbox } from "@/components/meeting/join-request-panel";
import {
  SHARE_QUALITY_STORAGE_KEY,
  SHARE_SOURCE_STORAGE_KEY,
  applyPresetToTrack,
  degrade,
  displayMediaConstraints,
  readTrackSurface,
  resolvePreset,
  type ShareQualityKey,
  type ShareSourceKey,
} from "@/lib/screen-share-quality";
import {
  SHARE_QUALITY_KEY,
  SHARE_SOURCE_KEY,
  toastDisplayMediaError,
} from "@/components/meeting/share-messages";
import { useLiveCaptions } from "@/lib/use-live-captions";
import { MeetingIntelligencePanel } from "@/components/meeting/meeting-intelligence-panel";
import {
  appendMeetingTranscript,
  getMeetingSummary,
  generateMeetingSummary,
} from "@/lib/api/meeting-intelligence.functions";
import { MeetingContentPanel } from "@/components/meeting/meeting-content-panel";
import { MeetingStatusHistoryPanel } from "@/components/meeting/meeting-status-history-panel";
import { MeetingParticipantsManagerPanel } from "@/components/meeting/participants-manager-panel";
import { MeetingRecordingPanel } from "@/components/meeting/recording-panel";
import { ParticipantAvatar } from "@/components/meeting/participant-avatar";
import {
  openMeetingAttendance,
  closeMeetingAttendance,
  listMeetingAttendance,
} from "@/lib/api/meeting-recordings.functions";
import { listMeetingParticipants } from "@/lib/api/meeting-rooms.functions";
import {
  setMeetingRsvp,
  getMeeting,
  startMeeting,
  endMeeting,
  listMeetingHostActions,
  transferMeetingHost,
} from "@/lib/api/meetings.functions";
import { supabase } from "@/integrations/supabase/client";
import { resolveMeetingApi } from "@/sdk/meetings";
import { ApiError } from "@/contracts/errors";
import type { MeetingId } from "@/contracts";
import { usePanelCollapse, usePanelCollapseControls } from "@/hooks/use-panel-collapse";
import { playMeetingCue } from "@/lib/meeting-cues";
import { localeTag, useI18n, type Key } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

type Translate = (k: Key) => string;
type PresetKey = Exclude<ShareQualityKey, "auto">;
type SideTab = "ai" | "content" | "chat" | "participants" | "transcript" | "recording";

const MEETING_AI_PANEL_IDS = ["ai-copilot", "meeting-intelligence", "uni-copilot"];

const LiveKitStage = lazy(() => import("@/components/meeting/livekit-stage"));

const JOIN_ERROR_KEY: Record<string, Key> = {
  MEETING_ACCESS_DENIED: "mtg.room.err.accessDenied",
  MEETING_NOT_FOUND: "mtg.room.err.notFound",
  MEETING_NOT_JOINABLE: "mtg.room.err.notJoinable",
  ENTITLEMENT_DENIED: "mtg.room.err.entitlement",
  QUOTA_EXCEEDED: "mtg.room.err.quota",
  CONFERENCE_PROVIDER_UNAVAILABLE: "mtg.room.err.provider",
  MEETING_TOKEN_ISSUE_FAILED: "mtg.room.err.token",
  TENANT_ACCESS_DENIED: "mtg.room.err.tenant",
};

// Lý do chi tiết + gợi ý xử lý, hiển thị ngay trên trang thay vì chỉ toast.
const JOIN_ERROR_HINT_KEY: Record<string, Key> = {
  MEETING_ACCESS_DENIED: "mtg.room.hint.accessDenied",
  TENANT_ACCESS_DENIED: "mtg.room.hint.tenant",
  MEETING_NOT_FOUND: "mtg.room.hint.notFound",
  MEETING_NOT_JOINABLE: "mtg.room.hint.notJoinable",
  ENTITLEMENT_DENIED: "mtg.room.hint.entitlement",
  QUOTA_EXCEEDED: "mtg.room.hint.quota",
};

const RSVP_ACTION_KEY: Record<"accepted" | "tentative" | "declined", Key> = {
  accepted: "mtg.room.rsvp.accept",
  tentative: "mtg.room.rsvp.tentative",
  declined: "mtg.room.rsvp.decline",
};

const RSVP_STATUS_KEY: Record<string, Key> = {
  pending: "mtg.rsvp.pending",
  accepted: "mtg.rsvp.accepted",
  declined: "mtg.rsvp.declined",
  tentative: "mtg.rsvp.tentative",
};

const PRESENCE_KEY: Record<"online" | "left" | "absent", Key> = {
  online: "mtg.room.presence.online",
  left: "mtg.room.presence.left",
  absent: "mtg.room.presence.absent",
};

const HOST_ACTION_KEY: Record<string, Key> = {
  start: "mtg.room.host.start",
  end: "mtg.room.host.end",
  cancel: "mtg.room.host.cancel",
  transfer_host: "mtg.room.host.transfer",
};

const MEETING_STATUS_META: Record<string, { label: Key; className: string; dotClassName: string }> =
  {
    scheduled: {
      label: "mtg.room.status.notStarted",
      className: "bg-surface-2 text-muted-foreground",
      dotClassName: "bg-muted-foreground",
    },
    live: {
      label: "mtg.status.live",
      className: "bg-destructive/12 text-destructive",
      dotClassName: "bg-destructive animate-pulse",
    },
    ended: {
      label: "mtg.status.ended",
      className: "bg-surface-2 text-muted-foreground",
      dotClassName: "bg-muted-foreground",
    },
    canceled: {
      label: "mtg.status.canceled",
      className: "bg-destructive/10 text-destructive",
      dotClassName: "bg-destructive",
    },
  };

function StageFallback() {
  const { t } = useI18n();
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("mtg.room.connecting")}
    </div>
  );
}

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const Route = createFileRoute("/meeting_/$id")({
  validateSearch: (search: Record<string, unknown>): { invite?: string } => ({
    invite: typeof search["invite"] === "string" ? (search["invite"] as string) : undefined,
  }),
  head: () => ({
    meta: [{ title: "Phòng họp · UNIWORK" }],
  }),
  component: MeetingDetailPage,
});

function MeetingDetailPage() {
  const { id } = Route.useParams();
  const { invite } = Route.useSearch();
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  // Callback realtime/timer đọc hàm dịch mới nhất mà không phải đăng ký lại kênh.
  const tRef = useRef(t);
  tRef.current = t;
  const isRealRoom = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const [open, setOpen] = useSidebarState();
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<SideTab>("ai");
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);
  sharingRef.current = sharing;
  const screenRef = useRef<MediaStream | null>(null);

  // Chất lượng + nguồn chia sẻ màn hình (ghi nhớ theo trình duyệt).
  const [shareQuality, setShareQuality] = useState<ShareQualityKey>("auto");
  const [shareQualityInfo, setShareQualityInfo] = useState<{
    key: PresetKey;
    degraded: boolean;
  } | null>(null);
  const [shareSource, setShareSource] = useState<ShareSourceKey>("any");
  const [activeSurface, setActiveSurface] = useState<ShareSourceKey | null>(null);
  const autoLevelRef = useRef<PresetKey>("balanced");

  // Thông báo rõ ràng mỗi khi trạng thái chia sẻ màn hình đổi (kể cả khi
  // người dùng bấm "Stop sharing" của trình duyệt).
  const prevSharingRef = useRef(false);
  useEffect(() => {
    if (prevSharingRef.current === sharing) return;
    prevSharingRef.current = sharing;
    if (sharing) toast.success(tRef.current("mtg.room.share.started"));
    else {
      toast.info(tRef.current("mtg.room.share.stopped"));
      setShareQualityInfo(null);
      setActiveSurface(null);
    }
  }, [sharing]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedQuality = window.localStorage.getItem(
      SHARE_QUALITY_STORAGE_KEY,
    ) as ShareQualityKey | null;
    if (savedQuality && savedQuality in SHARE_QUALITY_KEY) setShareQuality(savedQuality);
    const savedSource = window.localStorage.getItem(
      SHARE_SOURCE_STORAGE_KEY,
    ) as ShareSourceKey | null;
    if (savedSource && savedSource in SHARE_SOURCE_KEY) setShareSource(savedSource);
  }, []);
  const changeShareQuality = useCallback((key: ShareQualityKey) => {
    setShareQuality(key);
    if (typeof window !== "undefined") window.localStorage.setItem(SHARE_QUALITY_STORAGE_KEY, key);
  }, []);
  const changeShareSource = useCallback((key: ShareSourceKey) => {
    setShareSource(key);
    if (typeof window !== "undefined") window.localStorage.setItem(SHARE_SOURCE_STORAGE_KEY, key);
  }, []);
  const shareQualityLabel = shareQualityInfo
    ? shareQualityInfo.degraded
      ? fmt(t("mtg.share.degraded"), { quality: t(SHARE_QUALITY_KEY[shareQualityInfo.key]) })
      : t(SHARE_QUALITY_KEY[shareQualityInfo.key])
    : null;

  const [session, setSession] = useState<{
    serverUrl: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [joining, setJoining] = useState(false);
  const [autoStatus, setAutoStatus] = useState<null | "refreshing" | "rejoining">(null);
  const [joinErrorCode, setJoinErrorCode] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Chọn thiết bị mic/camera và áp dụng ngay cho luồng xem trước.
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");
  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "videoinput" || d.kind === "audioinput"));
    } catch {
      toast.error(tRef.current("mtg.room.devicesError"));
    }
  }, []);
  useEffect(() => {
    void refreshDevices();
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const handler = () => void refreshDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", handler);
  }, [refreshDevices]);

  // Rời phòng chủ động thì KHÔNG auto rejoin.
  const manualLeaveRef = useRef(false);
  // Phụ đề trực tiếp (nếu trình duyệt hỗ trợ Web Speech API), nhận dạng theo ngôn ngữ giao diện.
  const captions = useLiveCaptions(locale);
  // Lưu phụ đề trực tiếp thành biên bản thật (gom mỗi ~10s để giảm số request).
  const captionFlushRef = useRef<{ start: number | null; last: string }>({ start: null, last: "" });
  const captionSpeakerRef = useRef<string | null>(null);
  const captionTextRef = useRef("");
  captionTextRef.current = captions.text;
  useEffect(() => {
    if (!isRealRoom || !captions.enabled) {
      captionFlushRef.current = { start: null, last: "" };
      return;
    }
    if (captionFlushRef.current.start === null) captionFlushRef.current.start = Date.now();
    const startedAt = captionFlushRef.current.start;
    const timer = window.setInterval(() => {
      const text = captionTextRef.current.trim();
      const prev = captionFlushRef.current.last;
      const delta = text.startsWith(prev) ? text.slice(prev.length).trim() : text;
      if (delta.length < 8) return;
      captionFlushRef.current.last = text;
      void appendMeetingTranscript({
        data: {
          meetingId: id,
          source: "LIVE_CAPTION",
          segments: [
            {
              content: delta.slice(0, 4000),
              speakerName: captionSpeakerRef.current,
              offsetSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
            },
          ],
        },
      }).catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [captions.enabled, id, isRealRoom]);

  const inRoomRef = useRef(false);
  const attemptsRef = useRef(0);
  const rejoinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Xem trước camera trước khi vào phòng — giúp phát hiện sớm lỗi quyền thiết bị.
  // Không phụ thuộc `sharing`: bật/tắt chia sẻ không được khởi động lại camera.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: camId ? { deviceId: { exact: camId } } : true,
          audio: micId ? { deviceId: { exact: micId } } : false,
        });
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current && !sharingRef.current) videoRef.current.srcObject = s;
        void refreshDevices();
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "Error";
        toast.error(
          tRef.current(
            name === "NotAllowedError"
              ? "mtg.room.cam.blocked"
              : name === "NotFoundError"
                ? "mtg.room.cam.notFound"
                : "mtg.room.cam.error",
          ),
        );
        setCamOff(true);
      }
    }
    function stop() {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current && !sharingRef.current) videoRef.current.srcObject = null;
    }
    if (!session && !camOff) void start();
    else stop();
    return () => {
      cancelled = true;
      stop();
    };
  }, [camOff, session, camId, micId, refreshDevices]);

  // Gắn đúng luồng vào khung xem trước: màn hình khi đang chia sẻ, camera khi không.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const next = sharing ? screenRef.current : streamRef.current;
    if (el.srcObject !== next) el.srcObject = next;
  }, [sharing, camOff]);

  // Chia sẻ màn hình thật bằng getDisplayMedia; dừng khi người dùng bấm "Stop sharing" của trình duyệt.
  const stopShare = useCallback(() => {
    screenRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    setSharing(false);
  }, []);

  const toggleShare = useCallback(async () => {
    // Trong phòng: để LiveKit publish track thật (ScreenShareSync sẽ xử lý).
    if (session) {
      setSharing((s) => !s);
      return;
    }
    if (sharing) {
      stopShare();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      toast.error(t("mtg.room.share.unsupported"), {
        description: t("mtg.room.share.unsupportedDesc"),
        duration: 8000,
      });
      return;
    }
    try {
      const preset = resolvePreset(shareQuality);
      autoLevelRef.current = preset.key;
      const s = await navigator.mediaDevices.getDisplayMedia(
        displayMediaConstraints(preset, shareSource),
      );
      await applyPresetToTrack(s.getVideoTracks()[0], preset);
      screenRef.current = s;
      setActiveSurface(readTrackSurface(s.getVideoTracks()[0]));
      setShareQualityInfo({ key: preset.key, degraded: false });
      setSharing(true);
      s.getVideoTracks()[0]?.addEventListener("ended", () => stopShare());
    } catch (e) {
      toastDisplayMediaError(e, t);
    }
  }, [sharing, stopShare, shareQuality, shareSource, session, t]);

  // Vào phòng: dừng luồng xem trước cục bộ, LiveKit sẽ tự lấy lại luồng để publish.
  useEffect(() => {
    if (!session) return;
    screenRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
  }, [session]);

  // Đổi cấu hình khi đang chia sẻ: áp ngay cho track hiện tại.
  useEffect(() => {
    if (session || !sharing || !screenRef.current) return;
    const preset = resolvePreset(shareQuality);
    autoLevelRef.current = preset.key;
    void applyPresetToTrack(screenRef.current.getVideoTracks()[0], preset);
    setShareQualityInfo({ key: preset.key, degraded: false });
  }, [shareQuality, sharing, session]);

  // Tự hạ bậc khi mạng yếu (chế độ "Tự động") ở màn hình chờ.
  useEffect(() => {
    if (session || !sharing || shareQuality !== "auto" || typeof navigator === "undefined") return;
    const conn = (
      navigator as unknown as {
        connection?: EventTarget & { effectiveType?: string; downlink?: number };
      }
    ).connection;
    const adjust = () => {
      const weak =
        !conn ||
        ["slow-2g", "2g", "3g"].includes(conn.effectiveType ?? "") ||
        (conn.downlink ?? 99) < 1.5;
      if (!weak) return;
      const next = degrade(autoLevelRef.current);
      if (next === autoLevelRef.current) return;
      autoLevelRef.current = next;
      void applyPresetToTrack(screenRef.current?.getVideoTracks()[0], resolvePreset(next));
      setShareQualityInfo({ key: next, degraded: true });
    };
    adjust();
    const timer = setInterval(adjust, 8000);
    conn?.addEventListener?.("change", adjust);
    return () => {
      clearInterval(timer);
      conn?.removeEventListener?.("change", adjust);
    };
  }, [sharing, shareQuality, session]);

  useEffect(() => () => stopShare(), [stopShare]);

  // Link mời có kiểm soát: đổi token thành quyền tham gia trước khi xin vé vào phòng.
  const [redeeming, setRedeeming] = useState(Boolean(invite));
  useEffect(() => {
    if (!invite) return;
    let cancelled = false;
    void (async () => {
      try {
        const { redeemMeetingInviteLink } = await import("@/lib/api/meeting-rooms.functions");
        const res = await redeemMeetingInviteLink({ data: { token: invite } });
        if (cancelled) return;
        const messages: Record<string, Key> = {
          joined: "mtg.room.invite.joined",
          already: "mtg.room.invite.already",
          expired: "mtg.room.invite.expired",
          exhausted: "mtg.room.invite.exhausted",
          revoked: "mtg.room.invite.revoked",
          invalid: "mtg.room.invite.invalid",
        };
        const msg = tRef.current(messages[res.status] ?? "mtg.room.invite.invalid");
        if (res.status === "joined" || res.status === "already") toast.success(msg);
        else toast.error(msg);
      } catch {
        if (!cancelled) toast.error(tRef.current("mtg.room.invite.invalid"));
      } finally {
        if (!cancelled) setRedeeming(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invite]);

  const fetchSession = useCallback(async () => {
    const res = await resolveMeetingApi().requestJoinToken(id as MeetingId, {
      participantIdentity: "",
      role: "participant",
    });
    return {
      serverUrl: res.serverUrl,
      token: res.token,
      expiresAt: res.expiresAt ?? new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }, [id]);

  async function handleJoin() {
    if (!isRealRoom) {
      toast.error(t("mtg.room.demoJoin"));
      return;
    }
    setJoining(true);
    setJoinErrorCode(null);
    manualLeaveRef.current = false;
    attemptsRef.current = 0;
    try {
      setSession(await fetchSession());
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "INTERNAL_ERROR";
      setJoinErrorCode(code);
      toast.error(t(JOIN_ERROR_KEY[code] ?? "mtg.room.err.generic"));
    } finally {
      setJoining(false);
    }
  }

  function leaveRoom() {
    manualLeaveRef.current = true;
    setAutoStatus(null);
    setSession(null);
  }

  function toggleCaptions() {
    if (captions.enabled) {
      captions.stop();
      toast.info(t("mtg.room.captions.off"));
      return;
    }
    if (!captions.supported) {
      toast.error(t("mtg.room.captions.unsupported"), {
        description: t("mtg.room.captions.unsupportedDesc"),
        duration: 8000,
      });
      return;
    }
    if (captions.start()) toast.success(t("mtg.room.captions.on"));
    else
      toast.error(t("mtg.room.captions.failed"), {
        description: t("mtg.room.captions.failedDesc"),
      });
  }

  // Tự động xin token mới trước khi hết hạn (2 phút đệm) để không bị rớt phòng.
  useEffect(() => {
    if (!session) return;
    const ms = Math.max(new Date(session.expiresAt).getTime() - Date.now() - 120_000, 5_000);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        setAutoStatus("refreshing");
        const next = await fetchSession();
        setSession(next);
      } catch {
        toast.error(tRef.current("mtg.room.token.refreshError"));
      } finally {
        setAutoStatus(null);
      }
    }, ms);
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [session, fetchSession]);

  // Tự động vào lại phòng khi rớt kết nối ngoài ý muốn (backoff tối đa 5 lần).
  const scheduleRejoin = useCallback(() => {
    if (manualLeaveRef.current) return;
    if (attemptsRef.current >= 5) {
      setAutoStatus(null);
      toast.error(tRef.current("mtg.room.rejoin.failed"));
      return;
    }
    const delay = Math.min(1000 * 2 ** attemptsRef.current, 15_000);
    attemptsRef.current += 1;
    setAutoStatus("rejoining");
    rejoinTimerRef.current = setTimeout(async () => {
      try {
        const next = await fetchSession();
        setSession(next);
        setAutoStatus(null);
        attemptsRef.current = 0;
        toast.success(tRef.current("mtg.room.rejoin.success"));
      } catch {
        scheduleRejoin();
      }
    }, delay);
  }, [fetchSession]);

  const handleStageDisconnected = useCallback(() => {
    inRoomRef.current = false;
    setSession(null);
    if (!manualLeaveRef.current) scheduleRejoin();
  }, [scheduleRejoin]);

  // Callback ổn định cho LiveKit stage: tránh chạy lại effect đồng bộ ở mỗi lần render.
  const handleShareQualityResolved = useCallback(
    (key: PresetKey) => setShareQualityInfo({ key, degraded: false }),
    [],
  );
  const handleScreenShareStateChange = useCallback(
    (on: boolean) => setSharing((s) => (s === on ? s : on)),
    [],
  );
  const handleMediaStateChange = useCallback(({ mic, cam }: { mic: boolean; cam: boolean }) => {
    setMuted((m) => (m === !mic ? m : !mic));
    setCamOff((c) => (c === !cam ? c : !cam));
  }, []);
  const handleConnectionStateChange = useCallback(
    (s: "connected" | "reconnecting" | "disconnected" | "connecting") => {
      if (s === "connected") {
        inRoomRef.current = true;
        attemptsRef.current = 0;
        setAutoStatus(null);
      }
    },
    [],
  );

  // Mạng trở lại: thử ngay thay vì chờ hết backoff.
  useEffect(() => {
    function onOnline() {
      if (manualLeaveRef.current || session) return;
      if (rejoinTimerRef.current) clearTimeout(rejoinTimerRef.current);
      attemptsRef.current = 0;
      scheduleRejoin();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [session, scheduleRejoin]);

  useEffect(
    () => () => {
      if (rejoinTimerRef.current) clearTimeout(rejoinTimerRef.current);
    },
    [],
  );

  // Ghi nhận phiên tham dự để tính phút họp (usage) — mở khi vào phòng, đóng khi rời.
  useEffect(() => {
    if (!session || !isRealRoom) return;
    void openMeetingAttendance({ data: { meetingId: id } }).catch(() => undefined);
    inRoomRef.current = true;
    return () => {
      void closeMeetingAttendance({ data: { meetingId: id } }).catch(() => undefined);
    };
  }, [session, id, isRealRoom]);

  // Rời trang đột ngột vẫn chốt phiên tham dự.
  useEffect(() => {
    if (!isRealRoom) return;
    function onHide() {
      if (!inRoomRef.current) return;
      void closeMeetingAttendance({ data: { meetingId: id } }).catch(() => undefined);
    }
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [id, isRealRoom]);

  const participantsQuery = useQuery({
    queryKey: ["meeting-participants", id],
    enabled: isRealRoom,
    staleTime: 30_000,
    queryFn: () => listMeetingParticipants({ data: { meetingId: id } }),
  });

  const attendanceQuery = useQuery({
    queryKey: ["meeting-attendance", id],
    enabled: isRealRoom,
    staleTime: 5_000,
    refetchInterval: 10_000,
    queryFn: () => listMeetingAttendance({ data: { meetingId: id } }),
  });

  const presenceByUser = new Map<string, "online" | "left">();
  for (const a of attendanceQuery.data ?? []) {
    const current = presenceByUser.get(a.userId);
    if (a.leftAt === null) presenceByUser.set(a.userId, "online");
    else if (current !== "online") presenceByUser.set(a.userId, "left");
  }

  const participants = (participantsQuery.data ?? []).map((p) => ({
    userId: p.userId,
    name: p.name ?? p.email ?? t("mtg.room.member"),
    role: p.role,
    rsvp: p.rsvp,
    presence: presenceByUser.get(p.userId) ?? ("absent" as const),
  }));

  // Realtime: cập nhật RSVP/roster ngay khi có thay đổi
  const refetchParticipants = participantsQuery.refetch;
  const queryClient = useQueryClient();
  const syncMeetingQueries = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["meeting-participants", id] });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["meeting", id] }),
      queryClient.invalidateQueries({ queryKey: ["meeting-host-actions", id] }),
      queryClient.invalidateQueries({ queryKey: ["meetings"] }),
      queryClient.invalidateQueries({ queryKey: ["calendar"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  }, [id, queryClient]);
  useEffect(() => {
    if (!isRealRoom) return;
    const channel = supabase
      .channel(`meeting-participants-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_participants",
          filter: `meeting_id=eq.${id}`,
        },
        () => {
          void syncMeetingQueries();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, isRealRoom, syncMeetingQueries]);

  // Realtime: trạng thái cuộc họp (scheduled / live / ended / canceled)
  useEffect(() => {
    if (!isRealRoom) return;
    const channel = supabase
      .channel(`meeting-status-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meetings", filter: `id=eq.${id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["meeting", id] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, isRealRoom, queryClient]);

  // RSVP của chính mình
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [rsvpSaving, setRsvpSaving] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setMyUserId(data.user?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);
  const myParticipant = (participantsQuery.data ?? []).find((p) => p.userId === myUserId);
  const myRsvp = myParticipant?.rsvp ?? null;

  // ==== Giơ tay realtime (Supabase Presence trên kênh riêng của cuộc họp) ====
  const myName = myParticipant?.name ?? myParticipant?.email ?? t("mtg.room.you");
  captionSpeakerRef.current = myName;
  const [raisedHands, setRaisedHands] = useState<
    Array<{ userId: string; name: string; at: number }>
  >([]);
  // Danh sách người được chủ trì cấp quyền phát biểu (đồng bộ qua presence).
  const [speakers, setSpeakers] = useState<Array<{ userId: string; name: string }>>([]);
  const handsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const handRaised = raisedHands.some((h) => h.userId === myUserId);
  const canSpeak = speakers.some((s) => s.userId === myUserId);
  const myMetaRef = useRef<{ raised: boolean; speaking: boolean }>({
    raised: false,
    speaking: false,
  });
  // Theo dõi thay đổi hàng đợi giơ tay để bắn toast realtime cho mọi người.
  const prevRaisedRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (!isRealRoom || !myUserId) return;
    const channel = supabase.channel(`meeting-hands-${id}`, {
      config: { presence: { key: myUserId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const tr = tRef.current;
        const state = channel.presenceState<{
          raised?: boolean;
          name?: string;
          at?: number;
          speaking?: boolean;
        }>();
        const next: Array<{ userId: string; name: string; at: number }> = [];
        const speaking: Array<{ userId: string; name: string }> = [];
        for (const [key, metas] of Object.entries(state)) {
          const meta = metas[metas.length - 1];
          const name = meta?.name ?? tr("mtg.room.member");
          if (meta?.raised) next.push({ userId: key, name, at: meta.at ?? 0 });
          if (meta?.speaking) speaking.push({ userId: key, name });
        }
        next.sort((a, b) => a.at - b.at);
        const currentMap = new Map(next.map((h) => [h.userId, h.name]));
        const prev = prevRaisedRef.current;
        if (prev) {
          for (const [uid, name] of currentMap) {
            if (!prev.has(uid) && uid !== myUserId) {
              playMeetingCue("raise");
              toast.info(fmt(tr("mtg.room.hands.raisedToast"), { name }), {
                description: tr("mtg.room.hands.waiting"),
              });
            }
          }
          for (const [uid, name] of prev) {
            if (!currentMap.has(uid) && uid !== myUserId) {
              playMeetingCue("lower");
              toast(fmt(tr("mtg.room.hands.loweredToast"), { name }));
            }
          }
        }
        prevRaisedRef.current = currentMap;
        setRaisedHands(next);
        setSpeakers(speaking);
      })
      // Chủ trì cấp/thu quyền phát biểu: chỉ người được nhắc tới mới đổi trạng thái của mình.
      .on("broadcast", { event: "speak" }, ({ payload }) => {
        const tr = tRef.current;
        const p = payload as { userId?: string; allow?: boolean; hostName?: string };
        if (!p?.userId || p.userId !== myUserId) return;
        const allow = !!p.allow;
        myMetaRef.current = { raised: false, speaking: allow };
        void channel.track({ raised: false, speaking: allow, name: myName, at: Date.now() });
        setMuted(!allow);
        if (allow)
          toast.success(tr("mtg.room.speak.granted"), {
            description: fmt(tr("mtg.room.speak.grantedDesc"), {
              host: p.hostName ?? tr("mtg.room.speak.hostFallback"),
            }),
          });
        else toast.info(tr("mtg.room.speak.revoked"));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED")
          void channel.track({ ...myMetaRef.current, name: myName, at: Date.now() });
      });
    handsChannelRef.current = channel;
    return () => {
      handsChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [id, isRealRoom, myUserId, myName]);

  const toggleHand = useCallback(async () => {
    const channel = handsChannelRef.current;
    if (!channel) {
      toast.error(t("mtg.room.hands.notConnected"));
      return;
    }
    const next = !handRaised;
    myMetaRef.current = { ...myMetaRef.current, raised: next };
    await channel.track({ ...myMetaRef.current, name: myName, at: Date.now() });
    toast.success(next ? t("mtg.room.hands.youRaised") : t("mtg.room.hands.youLowered"));
  }, [handRaised, myName, t]);

  // Chủ trì cấp / thu quyền phát biểu cho một người trong hàng đợi.
  const setSpeakPermission = useCallback(
    async (userId: string, name: string, allow: boolean) => {
      const channel = handsChannelRef.current;
      if (!channel) {
        toast.error(t("mtg.room.hands.notConnected"));
        return;
      }
      await channel.send({
        type: "broadcast",
        event: "speak",
        payload: { userId, allow, hostName: myName },
      });
      toast.success(
        fmt(t(allow ? "mtg.room.speak.allowed" : "mtg.room.speak.revokedFor"), { name }),
      );
    },
    [myName, t],
  );

  const raisedSet = new Set(raisedHands.map((h) => h.userId));

  const handleRsvp = useCallback(
    async (rsvp: "accepted" | "declined" | "tentative") => {
      if (!isRealRoom) return;
      setRsvpSaving(rsvp);
      const key = ["meeting-participants", id] as const;
      const previous = queryClient.getQueryData(key);
      // Optimistic: cập nhật ngay RSVP của mình, giữ nguyên vai trò
      if (myUserId && Array.isArray(previous)) {
        queryClient.setQueryData(
          key,
          (previous as Array<{ userId: string }>).map((p) =>
            p.userId === myUserId ? { ...p, rsvp } : p,
          ),
        );
      }
      try {
        await setMeetingRsvp({
          data: { meetingId: id, rsvp, idempotencyKey: crypto.randomUUID() },
        });
        toast.success(fmt(t("mtg.room.rsvp.updated"), { label: t(RSVP_STATUS_KEY[rsvp]!) }));
        await syncMeetingQueries();
      } catch {
        if (previous !== undefined) queryClient.setQueryData(key, previous);
        toast.error(t("mtg.room.rsvp.error"));
        void refetchParticipants();
      } finally {
        setRsvpSaving(null);
      }
    },
    [id, isRealRoom, myUserId, queryClient, refetchParticipants, syncMeetingQueries, t],
  );

  // Trạng thái cuộc họp + quyền chủ trì để hiện nút Bắt đầu / Kết thúc.
  const meetingQuery = useQuery({
    queryKey: ["meeting", id],
    enabled: isRealRoom,
    staleTime: 15_000,
    queryFn: () => getMeeting({ data: { meetingId: id } }),
  });
  const meetingRow = meetingQuery.data as
    | { title?: string | null; status?: string; start_at?: string | null; end_at?: string | null }
    | undefined;
  const meetingStatus = meetingRow?.status ?? null;
  const statusMeta = MEETING_STATUS_META[meetingStatus ?? ""] ?? MEETING_STATUS_META["scheduled"]!;
  const meetingTitle = !isRealRoom
    ? t("mtg.room.demoTitle")
    : meetingRow?.title?.trim() || t("mtg.room.untitled");
  const isHost = myParticipant?.role === "host";
  const [lifecycleBusy, setLifecycleBusy] = useState<null | "start" | "end">(null);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [transferBusy, setTransferBusy] = useState<string | null>(null);

  // Nhật ký thao tác chủ trì (start/end, thành công/thất bại)
  const hostLogQuery = useQuery({
    queryKey: ["meeting-host-actions", id],
    enabled: isRealRoom,
    staleTime: 10_000,
    queryFn: () => listMeetingHostActions({ data: { meetingId: id, limit: 50 } }),
  });

  const handleLifecycle = useCallback(
    async (action: "start" | "end") => {
      setLifecycleBusy(action);
      try {
        const fn = action === "start" ? startMeeting : endMeeting;
        await fn({ data: { meetingId: id, idempotencyKey: crypto.randomUUID() } });
        toast.success(t(action === "start" ? "mtg.room.startedToast" : "mtg.room.endedToast"));
        // Đồng bộ ngay roster + thông tin phòng họp
        await syncMeetingQueries();
        await Promise.all([meetingQuery.refetch(), refetchParticipants(), hostLogQuery.refetch()]);
        // Webhook meeting_provider_events có thể tới trễ -> sync lại lần nữa
        window.setTimeout(() => {
          void syncMeetingQueries();
          void hostLogQuery.refetch();
        }, 2500);
      } catch {
        toast.error(t(action === "start" ? "mtg.room.startError" : "mtg.room.endError"));
      } finally {
        setLifecycleBusy(null);
        setConfirmEndOpen(false);
      }
    },
    [id, meetingQuery, hostLogQuery, refetchParticipants, syncMeetingQueries, t],
  );

  const handleTransferHost = useCallback(
    async (userId: string, name: string) => {
      setTransferBusy(userId);
      try {
        await transferMeetingHost({
          data: { meetingId: id, newHostUserId: userId, idempotencyKey: crypto.randomUUID() },
        });
        toast.success(fmt(t("mtg.room.transfer.success"), { name }));
        await syncMeetingQueries();
        await Promise.all([refetchParticipants(), hostLogQuery.refetch()]);
      } catch {
        toast.error(t("mtg.room.transfer.error"));
      } finally {
        setTransferBusy(null);
      }
    },
    [id, hostLogQuery, refetchParticipants, syncMeetingQueries, t],
  );

  // Thời lượng cuộc họp: suy ra từ nhật ký thao tác chủ trì (start/end thành công).
  const hostLog = hostLogQuery.data ?? [];
  const successStarts = hostLog.filter((e) => e.action === "start" && e.outcome === "success");
  const successEnds = hostLog.filter((e) => e.action === "end" && e.outcome === "success");
  const actualStartAt =
    successStarts.length > 0 ? successStarts[successStarts.length - 1]!.occurredAt : null;
  const actualEndAt = successEnds.length > 0 ? successEnds[0]!.occurredAt : null;

  const plannedStart = meetingRow?.start_at ? new Date(meetingRow.start_at) : null;
  const plannedEnd = meetingRow?.end_at ? new Date(meetingRow.end_at) : null;

  // Khóa RSVP và nút vào phòng khi cuộc họp đã kết thúc hoặc đã hủy.
  const meetingClosed = meetingStatus === "ended" || meetingStatus === "canceled";
  const rsvpLockReason =
    meetingStatus === "ended"
      ? t("mtg.room.rsvp.lockedEnded")
      : meetingStatus === "canceled"
        ? t("mtg.room.rsvp.lockedCanceled")
        : null;

  const participantsTab = (
    <div className="space-y-3">
      {isRealRoom && (
        <div className="rounded-lg border border-border bg-surface-2 p-2.5">
          <p className="mb-2 text-xs text-muted-foreground">
            {t("mtg.room.rsvp.yours")}
            {myRsvp ? ` · ${t(RSVP_STATUS_KEY[myRsvp] ?? "mtg.rsvp.pending")}` : ""}
          </p>
          <div className="flex gap-1.5" role="group" aria-label={t("mtg.room.rsvp.yours")}>
            {(["accepted", "tentative", "declined"] as const).map((v) => (
              <button
                key={v}
                type="button"
                disabled={rsvpSaving !== null || meetingClosed}
                aria-pressed={myRsvp === v}
                onClick={() => void handleRsvp(v)}
                className={`h-8 flex-1 rounded-md border px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                  myRsvp === v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface hover:bg-surface-3"
                }`}
              >
                {rsvpSaving === v ? t("mtg.saving") : t(RSVP_ACTION_KEY[v])}
              </button>
            ))}
          </div>
          {rsvpLockReason && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{rsvpLockReason}</span>
            </p>
          )}
        </div>
      )}
      {participantsQuery.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 rounded-md" />
          ))}
        </div>
      ) : participants.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {isRealRoom ? t("mtg.room.people.empty") : t("mtg.room.demoPeople")}
        </p>
      ) : (
        <ul className="space-y-2">
          {participants.map((p) => (
            <li key={p.userId} className="flex items-center gap-2">
              <ParticipantAvatar name={p.name} className="h-7 w-7 text-[11px]" />
              <span className="min-w-0 flex-1 truncate">
                {p.name}
                {p.role === "host" && (
                  <span className="ml-1 text-xs text-muted-foreground">({t("mtg.room.host")})</span>
                )}
              </span>
              {raisedSet.has(p.userId) && (
                <Hand
                  className="h-3.5 w-3.5 shrink-0 text-primary"
                  aria-label={t("mtg.room.raisedHand")}
                />
              )}
              <span
                className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] ${
                  p.presence === "online"
                    ? "bg-success/10 text-success"
                    : p.presence === "left"
                      ? "bg-surface-3 text-muted-foreground"
                      : "text-muted-foreground"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    p.presence === "online"
                      ? "bg-success"
                      : p.presence === "left"
                        ? "bg-muted-foreground"
                        : "bg-border"
                  }`}
                />
                {t(PRESENCE_KEY[p.presence])}
              </span>
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                {t(RSVP_STATUS_KEY[p.rsvp] ?? "mtg.rsvp.pending")}
              </span>
              {isHost && p.userId !== myUserId && !meetingClosed && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      disabled={transferBusy !== null}
                      aria-label={fmt(t("mtg.room.transfer.label"), { name: p.name })}
                      title={fmt(t("mtg.room.transfer.label"), { name: p.name })}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      {transferBusy === p.userId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Crown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("mtg.room.transfer.title")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {fmt(t("mtg.room.transfer.desc"), { name: p.name })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("mtg.cancelAction")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleTransferHost(p.userId, p.name)}>
                        {t("mtg.room.transfer.confirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </li>
          ))}
        </ul>
      )}
      {isRealRoom && (
        <div className="mt-5 border-t border-border pt-3">
          <h3 className="mb-2 text-xs font-semibold">{t("mtg.room.hostLog")}</h3>
          {hostLogQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">{t("mtg.loading")}</p>
          ) : hostLog.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("mtg.room.hostLogEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {hostLog.map((e) => (
                <li key={e.id} className="text-xs">
                  <span
                    className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] ${
                      e.outcome === "success"
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {HOST_ACTION_KEY[e.action] ? t(HOST_ACTION_KEY[e.action]!) : e.action} ·{" "}
                    {e.outcome === "success"
                      ? t("mtg.room.host.success")
                      : t("mtg.room.host.failed")}
                  </span>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {e.actorName ?? t("mtg.room.user")} ·{" "}
                    {new Date(e.occurredAt).toLocaleString(locale)}
                  </div>
                  {e.errorCode && (
                    <div className="font-mono text-[11px] text-destructive">{e.errorCode}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  const sidePanelProps = {
    meetingId: id,
    isRealRoom,
    inRoom: !!session,
    tab,
    onTabChange: setTab,
    participantsContent: participantsTab,
  };

  const shareStatus = sharing
    ? fmt(t("mtg.room.share.status"), {
        source: activeSurface ? t(SHARE_SOURCE_KEY[activeSurface]) : t("mtg.room.share.screen"),
      }) + (shareQualityLabel ? ` · ${shareQualityLabel}` : "")
    : fmt(t("mtg.room.share.idle"), { source: t(SHARE_SOURCE_KEY[shareSource]) });

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <AppSidebar active="meetings" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 lg:p-6">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-64">
                <Link
                  to="/meeting"
                  className="inline-flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> {t("mtg.room.all")}
                </Link>
                {isRealRoom && meetingQuery.isLoading ? (
                  <Skeleton className="mt-1 h-7 w-64 max-w-full" />
                ) : (
                  <h1 className="mt-1 line-clamp-2 break-words text-lg font-semibold">
                    {meetingTitle}
                  </h1>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${statusMeta.className}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClassName}`}
                    />
                    {t(statusMeta.label)}
                  </span>
                  {isRealRoom && (plannedStart || plannedEnd) && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {plannedStart
                        ? plannedStart.toLocaleString(locale, {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                      {plannedEnd
                        ? ` → ${plannedEnd.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                    </span>
                  )}
                  {isRealRoom && (
                    <MeetingTimers
                      status={meetingStatus}
                      plannedStart={meetingRow?.start_at ?? null}
                      plannedEnd={meetingRow?.end_at ?? null}
                      actualStartAt={actualStartAt}
                      actualEndAt={actualEndAt}
                    />
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />{" "}
                    {fmt(t("mtg.room.peopleCount"), { n: participants.length })}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {isRealRoom && isHost && meetingStatus !== "live" && !meetingClosed && (
                  <Button
                    size="sm"
                    disabled={lifecycleBusy !== null}
                    onClick={() => void handleLifecycle("start")}
                  >
                    {lifecycleBusy === "start"
                      ? t("mtg.room.starting")
                      : t("mtg.room.startMeeting")}
                  </Button>
                )}
                {isRealRoom && isHost && meetingStatus === "live" && (
                  <AlertDialog open={confirmEndOpen} onOpenChange={setConfirmEndOpen}>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" disabled={lifecycleBusy !== null}>
                        {lifecycleBusy === "end" ? t("mtg.room.ending") : t("mtg.room.endMeeting")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("mtg.room.endConfirm.title")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("mtg.room.endConfirm.desc")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={lifecycleBusy === "end"}>
                          {t("mtg.cancelAction")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.preventDefault();
                            void handleLifecycle("end");
                          }}
                          disabled={lifecycleBusy === "end"}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {lifecycleBusy === "end"
                            ? t("mtg.room.ending")
                            : t("mtg.room.endConfirm.confirm")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setPanelOpen(true)}
                >
                  <PanelRight /> {t("mtg.room.panel.open")}
                </Button>
              </div>
            </div>

            {session ? (
              <div className="relative min-h-[18rem] flex-1 overflow-hidden rounded-xl bg-surface-2 sm:min-h-[24rem]">
                <ClientOnly fallback={<StageFallback />}>
                  <Suspense fallback={<StageFallback />}>
                    <LiveKitStage
                      serverUrl={session.serverUrl}
                      token={session.token}
                      onDisconnected={handleStageDisconnected}
                      micEnabled={!muted}
                      camEnabled={!camOff}
                      micDeviceId={micId || undefined}
                      camDeviceId={camId || undefined}
                      shareQuality={shareQuality}
                      onShareQualityResolved={handleShareQualityResolved}
                      screenShareEnabled={sharing}
                      shareSource={shareSource}
                      onShareSourceResolved={setActiveSurface}
                      onScreenShareStateChange={handleScreenShareStateChange}
                      onMediaStateChange={handleMediaStateChange}
                      onConnectionStateChange={handleConnectionStateChange}
                    />
                  </Suspense>
                </ClientOnly>
              </div>
            ) : (
              <div
                className={`grid content-start gap-2 ${
                  participants.length === 0 ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3"
                }`}
              >
                <div
                  className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-surface-2 ${
                    participants.length === 0 ? "mx-auto w-full max-w-3xl" : ""
                  }`}
                >
                  {camOff && !sharing ? (
                    <VideoOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`h-full w-full ${sharing ? "bg-black object-contain" : "object-cover"}`}
                    />
                  )}
                  <div className="absolute bottom-2 left-2 right-2 truncate rounded-md bg-black/60 px-2 py-1 text-xs text-white">
                    {sharing
                      ? shareQualityLabel
                        ? fmt(t("mtg.room.sharingSelfQuality"), { quality: shareQualityLabel })
                        : t("mtg.room.sharingSelf")
                      : t("mtg.room.previewSelf")}
                  </div>
                </div>
                {participants.map((p) => (
                  <div
                    key={p.userId}
                    className="relative flex aspect-video items-center justify-center rounded-xl bg-surface-2"
                  >
                    <ParticipantAvatar name={p.name} className="h-16 w-16 text-lg" />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          title={t(PRESENCE_KEY[p.presence])}
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            p.presence === "online"
                              ? "bg-success"
                              : p.presence === "left"
                                ? "bg-white/50"
                                : "bg-white/25"
                          }`}
                        />
                        <span className="truncate">{p.name}</span>
                        <span className="sr-only">{t(PRESENCE_KEY[p.presence])}</span>
                      </span>
                      {raisedSet.has(p.userId) && (
                        <Hand className="h-3 w-3 shrink-0" aria-label={t("mtg.room.raisedHand")} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isRealRoom && meetingQuery.isError && !joinErrorCode && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-3">
                <p className="text-sm text-foreground">{t("mtg.room.loadMeetingError")}</p>
                <Button variant="outline" size="sm" onClick={() => void meetingQuery.refetch()}>
                  {t("mtg.retry")}
                </Button>
              </div>
            )}

            {!session && isRealRoom && meetingClosed && (
              <div className="mt-3 rounded-lg border border-border bg-surface px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {t("mtg.room.err.notJoinable")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("mtg.room.hint.notJoinable")}
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to="/meeting/history">{t("mtg.home.history")}</Link>
                </Button>
              </div>
            )}

            {!session && joinErrorCode && (
              <div
                className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3"
                role="alert"
              >
                <p className="text-sm font-medium text-destructive">
                  {t(JOIN_ERROR_KEY[joinErrorCode] ?? "mtg.room.err.generic")}
                </p>
                {JOIN_ERROR_HINT_KEY[joinErrorCode] && (
                  <p className="mt-1 text-xs text-foreground">
                    {t(JOIN_ERROR_HINT_KEY[joinErrorCode]!)}
                  </p>
                )}
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {fmt(t("mtg.room.err.code"), { code: joinErrorCode })}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleJoin()}
                    disabled={joining || redeeming}
                  >
                    {t("mtg.room.retryJoin")}
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/meeting">{t("mtg.room.backToList")}</Link>
                  </Button>
                </div>
                {isRealRoom &&
                  (joinErrorCode === "MEETING_ACCESS_DENIED" ||
                    joinErrorCode === "TENANT_ACCESS_DENIED") && (
                    <JoinRequestPanel meetingId={id} onApproved={() => void handleJoin()} />
                  )}
              </div>
            )}

            {!session && isRealRoom && <JoinRequestInbox meetingId={id} />}

            {autoStatus && (
              <p
                role="status"
                className="mt-3 inline-flex items-center gap-2 self-start rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {autoStatus === "refreshing"
                  ? t("mtg.room.auto.refreshing")
                  : t("mtg.room.auto.rejoining")}
              </p>
            )}

            {!session && !isRealRoom && (
              <p className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                {t("mtg.room.demoNotice")}{" "}
                <Link to="/meeting" className="text-primary hover:underline">
                  {t("mtg.room.demoCreate")}
                </Link>
              </p>
            )}

            {(session || raisedHands.length > 0 || speakers.length > 0) && (
              <section
                aria-label={fmt(t("mtg.room.hands.title"), { n: raisedHands.length })}
                className="mt-4 space-y-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Hand className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="font-medium text-foreground">
                    {fmt(t("mtg.room.hands.title"), { n: raisedHands.length })}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    {t("mtg.room.hands.live")}
                  </span>
                </div>
                {raisedHands.length === 0 && (
                  <p className="text-muted-foreground">{t("mtg.room.hands.empty")}</p>
                )}
                {raisedHands.length > 0 && (
                  <ol className="space-y-1">
                    {raisedHands.map((h, i) => (
                      <li
                        key={h.userId}
                        className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1 ${
                          h.userId === myUserId ? "bg-primary/10" : ""
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                            {i + 1}
                          </span>
                          <span className="min-w-0 truncate text-foreground">
                            {h.userId === myUserId ? t("mtg.room.you") : h.name}
                          </span>
                          <WaitingTime at={h.at} />
                        </span>
                        {isHost && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void setSpeakPermission(h.userId, h.name, true)}
                          >
                            <Mic /> {t("mtg.room.hands.allow")}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                {speakers.length > 0 && (
                  <div className="space-y-1 border-t border-border pt-2">
                    <p className="font-medium text-foreground">{t("mtg.room.hands.speaking")}</p>
                    {speakers.map((s) => (
                      <div key={s.userId} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-muted-foreground">
                          {s.userId === myUserId ? t("mtg.room.you") : s.name}
                        </span>
                        {isHost && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void setSpeakPermission(s.userId, s.name, false)}
                          >
                            <MicOff /> {t("mtg.room.hands.revoke")}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canSpeak && (
                  <p className="text-muted-foreground">{t("mtg.room.hands.canSpeak")}</p>
                )}
              </section>
            )}

            {captions.enabled && (
              <div className="mt-4 rounded-lg bg-foreground/90 px-4 py-3 text-center text-sm text-background">
                <span className="mr-2 rounded bg-background/20 px-1.5 py-0.5 text-[11px] font-medium">
                  {t("mtg.room.captions.label")}
                </span>
                {captions.text || t("mtg.room.captions.listening")}
              </div>
            )}

            <div
              role="group"
              aria-label={t("mtg.room.controls")}
              className="mt-4 flex flex-wrap items-center justify-center gap-2"
            >
              {sharing && (
                <span
                  role="status"
                  className="mr-1 hidden max-w-[22rem] items-center gap-1.5 truncate rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary md:inline-flex"
                >
                  <ScreenShare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{shareStatus}</span>
                </span>
              )}
              <CtrlBtn
                label={t("mtg.room.ctrl.mute")}
                pressed={muted}
                tone="danger"
                onClick={() => setMuted(!muted)}
                icon={muted ? MicOff : Mic}
              />
              <CtrlBtn
                label={t("mtg.room.ctrl.camOff")}
                pressed={camOff}
                tone="danger"
                onClick={() => setCamOff(!camOff)}
                icon={camOff ? VideoOff : Video}
              />
              <CtrlBtn
                label={t("mtg.room.ctrl.share")}
                pressed={sharing}
                tone="primary"
                onClick={() => void toggleShare()}
                icon={sharing ? ScreenShareOff : ScreenShare}
              />
              <CtrlBtn
                label={t("mtg.room.ctrl.hand")}
                pressed={handRaised}
                tone="primary"
                onClick={() => void toggleHand()}
                icon={Hand}
              />
              <DeviceMenu
                devices={devices}
                micId={micId}
                camId={camId}
                onPickMic={(deviceId) => {
                  setMicId(deviceId);
                  setMuted(false);
                }}
                onPickCam={(deviceId) => {
                  setCamId(deviceId);
                  setCamOff(false);
                }}
                onRefresh={() => {
                  void refreshDevices();
                  toast.success(t("mtg.room.menu.refreshed"));
                }}
                captionsEnabled={captions.enabled}
                captionsSupported={captions.supported}
                onToggleCaptions={toggleCaptions}
                shareSource={shareSource}
                onShareSource={changeShareSource}
                shareQuality={shareQuality}
                onShareQuality={changeShareQuality}
                shareQualityLabel={shareQualityLabel}
              />
              {session ? (
                <Button
                  variant="destructive"
                  className="h-11 rounded-full px-4"
                  onClick={leaveRoom}
                  aria-label={t("mtg.room.leave")}
                >
                  <PhoneOff />
                  <span className="hidden sm:inline">{t("mtg.room.leave")}</span>
                </Button>
              ) : (
                <Button
                  className="h-11 rounded-full px-5"
                  onClick={() => void handleJoin()}
                  disabled={joining || redeeming || meetingClosed}
                >
                  {joining || redeeming ? <Loader2 className="animate-spin" /> : <Video />}
                  {redeeming ? t("mtg.room.redeeming") : t("mtg.room.join")}
                </Button>
              )}
            </div>

            {isRealRoom && (
              <div className="mt-6">
                <MeetingParticipantsManagerPanel meetingId={id} />
              </div>
            )}
          </main>

          <aside className="hidden w-80 shrink-0 border-l border-border bg-surface lg:flex lg:flex-col">
            <MeetingSidePanel {...sidePanelProps} idPrefix="aside" />
          </aside>
        </div>
      </div>

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("mtg.room.panel.title")}</SheetTitle>
            <SheetDescription>{t("mtg.room.panel.desc")}</SheetDescription>
          </SheetHeader>
          <MeetingSidePanel {...sidePanelProps} idPrefix="sheet" inSheet />
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Đồng hồ đếm ngược / thời lượng — tự tick mỗi giây mà không render lại cả trang. */
function MeetingTimers({
  status,
  plannedStart,
  plannedEnd,
  actualStartAt,
  actualEndAt,
}: {
  status: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
}) {
  const { t, lang } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const ticking = status !== "ended" && status !== "canceled";
  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  const isLive = status === "live";
  let timer: { label: string; tone: "normal" | "warn" | "over" } | null = null;
  if (isLive && plannedEnd) {
    const diff = new Date(plannedEnd).getTime() - now;
    timer =
      diff >= 0
        ? {
            label: fmt(t("mtg.room.timer.remaining"), { time: formatDuration(diff) }),
            tone: diff <= 5 * 60_000 ? "warn" : "normal",
          }
        : {
            label: fmt(t("mtg.room.timer.overtime"), { time: formatDuration(-diff) }),
            tone: "over",
          };
  } else if ((status === "scheduled" || !status) && plannedStart) {
    const diff = new Date(plannedStart).getTime() - now;
    timer =
      diff >= 0
        ? {
            label: fmt(t("mtg.room.timer.startsIn"), { time: formatDuration(diff) }),
            tone: diff <= 5 * 60_000 ? "warn" : "normal",
          }
        : { label: fmt(t("mtg.room.timer.late"), { time: formatDuration(-diff) }), tone: "over" };
  }

  const elapsedMs = actualStartAt
    ? (isLive || !actualEndAt ? now : new Date(actualEndAt).getTime()) -
      new Date(actualStartAt).getTime()
    : null;
  const durationLabel = elapsedMs !== null && elapsedMs >= 0 ? formatDuration(elapsedMs) : null;
  const startTime = actualStartAt
    ? new Date(actualStartAt).toLocaleTimeString(localeTag(lang), {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const toneClass =
    timer?.tone === "over"
      ? "bg-destructive/12 text-destructive"
      : timer?.tone === "warn"
        ? "bg-warning/15 text-foreground"
        : "bg-surface-2 text-muted-foreground";

  return (
    <>
      {timer && (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono tabular-nums ${toneClass}`}
        >
          {timer.label}
        </span>
      )}
      {durationLabel && (
        <span>
          {startTime ? `${fmt(t("mtg.room.actualStart"), { time: startTime })} · ` : ""}
          {isLive ? t("mtg.room.elapsed") : t("mtg.room.total")}{" "}
          <span className="font-mono tabular-nums text-foreground">{durationLabel}</span>
        </span>
      )}
    </>
  );
}

/** Thời gian một người đã chờ trong hàng đợi giơ tay — tick riêng, không render lại cả trang. */
function WaitingTime({ at }: { at: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!at) return null;
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  return (
    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
      {s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}
    </span>
  );
}

function CtrlBtn({
  icon: Icon,
  label,
  pressed,
  tone,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  pressed: boolean;
  tone: "danger" | "primary";
  onClick: () => void;
}) {
  const pressedClass =
    tone === "danger"
      ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
      : "bg-primary text-primary-foreground hover:bg-primary/90";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        pressed ? pressedClass : "bg-surface-2 text-foreground hover:bg-surface-3"
      }`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function DeviceMenu({
  devices,
  micId,
  camId,
  onPickMic,
  onPickCam,
  onRefresh,
  captionsEnabled,
  captionsSupported,
  onToggleCaptions,
  shareSource,
  onShareSource,
  shareQuality,
  onShareQuality,
  shareQualityLabel,
}: {
  devices: MediaDeviceInfo[];
  micId: string;
  camId: string;
  onPickMic: (deviceId: string) => void;
  onPickCam: (deviceId: string) => void;
  onRefresh: () => void;
  captionsEnabled: boolean;
  captionsSupported: boolean;
  onToggleCaptions: () => void;
  shareSource: ShareSourceKey;
  onShareSource: (key: ShareSourceKey) => void;
  shareQuality: ShareQualityKey;
  onShareQuality: (key: ShareQualityKey) => void;
  shareQualityLabel: string | null;
}) {
  const { t } = useI18n();
  const mics = devices.filter((d) => d.kind === "audioinput");
  const cams = devices.filter((d) => d.kind === "videoinput");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("mtg.room.menu")}
          title={t("mtg.room.menu")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-foreground transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70dvh] w-72 overflow-y-auto">
        <DropdownMenuLabel>{t("mtg.room.menu.mic")}</DropdownMenuLabel>
        {mics.length === 0 ? (
          <DropdownMenuItem disabled>{t("mtg.room.menu.noMic")}</DropdownMenuItem>
        ) : (
          <DropdownMenuRadioGroup value={micId} onValueChange={onPickMic}>
            {mics.map((d, i) => (
              <DropdownMenuRadioItem key={d.deviceId || i} value={d.deviceId}>
                <span className="truncate">
                  {d.label || fmt(t("mtg.room.menu.micN"), { n: i + 1 })}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("mtg.room.menu.cam")}</DropdownMenuLabel>
        {cams.length === 0 ? (
          <DropdownMenuItem disabled>{t("mtg.room.menu.noCam")}</DropdownMenuItem>
        ) : (
          <DropdownMenuRadioGroup value={camId} onValueChange={onPickCam}>
            {cams.map((d, i) => (
              <DropdownMenuRadioItem key={d.deviceId || i} value={d.deviceId}>
                <span className="truncate">
                  {d.label || fmt(t("mtg.room.menu.camN"), { n: i + 1 })}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onRefresh();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> {t("mtg.room.menu.refresh")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={captionsEnabled}
          onCheckedChange={() => onToggleCaptions()}
        >
          <span className="truncate">{t("mtg.room.menu.captions")}</span>
          {!captionsSupported && (
            <span className="ml-auto pl-2 text-xs text-muted-foreground">
              {t("mtg.room.menu.unsupported")}
            </span>
          )}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("mtg.room.menu.source")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={shareSource}
          onValueChange={(v) => onShareSource(v as ShareSourceKey)}
        >
          {(Object.keys(SHARE_SOURCE_KEY) as ShareSourceKey[]).map((k) => (
            <DropdownMenuRadioItem key={k} value={k}>
              {t(SHARE_SOURCE_KEY[k])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("mtg.room.menu.quality")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={shareQuality}
          onValueChange={(v) => onShareQuality(v as ShareQualityKey)}
        >
          {(Object.keys(SHARE_QUALITY_KEY) as ShareQualityKey[]).map((k) => (
            <DropdownMenuRadioItem key={k} value={k}>
              {t(SHARE_QUALITY_KEY[k])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {shareQualityLabel && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {fmt(t("mtg.room.menu.applied"), { quality: shareQualityLabel })}
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SIDE_TABS: { k: SideTab; label: Key; icon: ComponentType<{ className?: string }> }[] = [
  { k: "ai", label: "mtg.room.tab.ai", icon: Sparkles },
  { k: "content", label: "mtg.room.tab.content", icon: ClipboardList },
  { k: "chat", label: "mtg.room.tab.chat", icon: MessageSquare },
  { k: "participants", label: "mtg.room.tab.people", icon: Users },
  { k: "transcript", label: "mtg.room.tab.transcript", icon: FileText },
  { k: "recording", label: "mtg.room.tab.recording", icon: Video },
];

function MeetingSidePanel({
  meetingId,
  isRealRoom,
  inRoom,
  tab,
  onTabChange,
  participantsContent,
  idPrefix,
  inSheet = false,
}: {
  meetingId: string;
  isRealRoom: boolean;
  inRoom: boolean;
  tab: SideTab;
  onTabChange: (tab: SideTab) => void;
  participantsContent: ReactNode;
  idPrefix: string;
  inSheet?: boolean;
}) {
  const { t } = useI18n();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Điều hướng tab bằng phím mũi tên / Home / End theo mẫu WAI-ARIA Tabs.
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const index = SIDE_TABS.findIndex((it) => it.k === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % SIDE_TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + SIDE_TABS.length) % SIDE_TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = SIDE_TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = SIDE_TABS[next]!.k;
    onTabChange(target);
    tabRefs.current[target]?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`flex items-center justify-between gap-2 border-b border-border py-2 pl-3 ${inSheet ? "pr-12" : "pr-3"}`}
      >
        <span className="text-xs font-medium text-muted-foreground">
          {t("mtg.room.panel.title")}
        </span>
        <ExpandCollapseAllButtons panelIds={MEETING_AI_PANEL_IDS} />
      </div>
      <div
        role="tablist"
        aria-label={t("mtg.room.panel.title")}
        className="grid grid-cols-3 gap-1 border-b border-border p-2 text-xs"
      >
        {SIDE_TABS.map((it) => {
          const selected = tab === it.k;
          return (
            <button
              key={it.k}
              ref={(el) => {
                tabRefs.current[it.k] = el;
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-meeting-tab-${it.k}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-meeting-tabpanel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTabChange(it.k)}
              onKeyDown={onTabKeyDown}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <it.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{t(it.label)}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${idPrefix}-meeting-tabpanel`}
        aria-labelledby={`${idPrefix}-meeting-tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto p-4 text-sm"
      >
        {tab === "ai" && <AICopilotPanel meetingId={meetingId} isRealRoom={isRealRoom} />}
        {tab === "content" &&
          (isRealRoom ? (
            <div className="space-y-5">
              <MeetingContentPanel meetingId={meetingId} />
              <MeetingStatusHistoryPanel meetingId={meetingId} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("mtg.room.demoContent")}</p>
          ))}
        {tab === "recording" &&
          (isRealRoom ? (
            <MeetingRecordingPanel meetingId={meetingId} />
          ) : (
            <p className="text-xs text-muted-foreground">{t("mtg.room.demoRecording")}</p>
          ))}
        {tab === "chat" && <ChatPanel inRoom={inRoom} />}
        {tab === "participants" && participantsContent}
        {tab === "transcript" &&
          (isRealRoom ? (
            <MeetingIntelligencePanel meetingId={meetingId} />
          ) : (
            <p className="text-xs text-muted-foreground">{t("mtg.room.demoTranscript")}</p>
          ))}
      </div>
      <div className="border-t border-border p-4">
        <AskUniPanel
          rootEntity={{ type: "MEETING", id: meetingId }}
          label={t("mtg.room.askUni")}
          suggestions={[t("mtg.room.askUni.s1"), t("mtg.room.askUni.s2"), t("mtg.room.askUni.s3")]}
        />
      </div>
      <div className="border-t border-border p-4">
        <RelatedWorkPanel entityType="MEETING" entityId={meetingId} />
      </div>
    </div>
  );
}

function ExpandCollapseAllButtons({ panelIds }: { panelIds: string[] }) {
  const { t } = useI18n();
  const { expandAll, collapseAll } = usePanelCollapseControls(panelIds);
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-8 px-0 text-muted-foreground"
        onClick={expandAll}
        aria-label={t("mtg.room.panel.expandAll")}
        title={t("mtg.room.panel.expandAll")}
      >
        <Maximize2 />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-8 px-0 text-muted-foreground"
        onClick={collapseAll}
        aria-label={t("mtg.room.panel.collapseAll")}
        title={t("mtg.room.panel.collapseAll")}
      >
        <Minimize2 />
      </Button>
    </div>
  );
}

function AICopilotPanel({ meetingId, isRealRoom }: { meetingId: string; isRealRoom: boolean }) {
  const { t, lang } = useI18n();
  const [collapsed, setCollapsed] = usePanelCollapse("ai-copilot");
  const queryClient = useQueryClient();
  const summaryQuery = useQuery({
    queryKey: ["meeting-summary", meetingId],
    enabled: isRealRoom,
    staleTime: 30_000,
    queryFn: () => getMeetingSummary({ data: { meetingId } }),
  });
  const regenerate = useMutation({
    mutationFn: () => generateMeetingSummary({ data: { meetingId } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["meeting-summary", meetingId], data);
      void queryClient.invalidateQueries({ queryKey: ["meeting-transcript", meetingId] });
      void queryClient.invalidateQueries({ queryKey: ["meeting-summary-progress", meetingId] });
      toast.success(t("mtg.room.ai.updated"));
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("mtg.room.ai.error")),
  });

  const summary = summaryQuery.data ?? null;

  const rerunButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={regenerate.isPending}
      onClick={() => regenerate.mutate()}
    >
      {regenerate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {regenerate.isPending
        ? t("mtg.room.ai.running")
        : summary
          ? t("mtg.room.ai.rerun")
          : t("mtg.room.ai.generate")}
    </Button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />{" "}
          {t("mtg.room.ai.title")}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-8 px-0 text-muted-foreground"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("mtg.room.ai.expand") : t("mtg.room.ai.collapse")}
        >
          {collapsed ? <ChevronDown /> : <ChevronUp />}
        </Button>
      </div>

      {collapsed ? null : !isRealRoom ? (
        <p className="text-xs text-muted-foreground">{t("mtg.room.ai.demo")}</p>
      ) : summaryQuery.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-16" />
        </div>
      ) : !summary ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("mtg.room.ai.empty")}</p>
          {rerunButton}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-1.5 text-xs font-semibold text-foreground">
              {summary.status === "partial" ? t("mtg.room.ai.partial") : t("mtg.room.ai.full")}
            </div>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
              {summary.summary || t("mtg.room.ai.noContent")}
            </p>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {fmt(t("mtg.room.ai.meta"), {
                n: summary.segmentCount,
                date: new Date(summary.generatedAt).toLocaleString(localeTag(lang)),
              })}
            </div>
          </div>
          {summary.actionItems.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-foreground">
                {t("mtg.room.ai.actions")}
              </h4>
              <ul className="space-y-2 text-xs">
                {summary.actionItems.map((a, i) => (
                  <li key={i} className="rounded-md bg-surface-2 p-2">
                    <div className="text-foreground">{a.title}</div>
                    {(a.owner || a.dueHint) && (
                      <div className="text-[11px] text-muted-foreground">
                        {[a.owner, a.dueHint].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {rerunButton}
        </div>
      )}
    </div>
  );
}

function ChatPanel({ inRoom }: { inRoom: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <MessageSquare className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{t("mtg.room.chat.title")}</p>
      <p className="max-w-[16rem] text-xs text-muted-foreground">
        {inRoom ? t("mtg.room.chat.inRoom") : t("mtg.room.chat.preJoin")}
      </p>
    </div>
  );
}
