import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Hand,
  MoreHorizontal,
  Send,
  FileText,
  Clock,
  Loader2,
  Lock,
  Crown,
  Video as VideoIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
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
  SHARE_QUALITY_LABELS,
  SHARE_QUALITY_STORAGE_KEY,
  applyPresetToTrack,
  degrade,
  displayMediaConstraints,
  resolvePreset,
  type ShareQualityKey,
} from "@/lib/screen-share-quality";
import { MeetingRecordingPanel } from "@/components/meeting/recording-panel";
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

const LiveKitStage = lazy(() => import("@/components/meeting/livekit-stage"));

const JOIN_ERRORS: Record<string, string> = {
  MEETING_ACCESS_DENIED: "Bạn không có quyền tham gia cuộc họp này.",
  MEETING_NOT_FOUND: "Không tìm thấy cuộc họp.",
  MEETING_NOT_JOINABLE: "Cuộc họp đã kết thúc hoặc bị hủy.",
  ENTITLEMENT_DENIED: "Gói dịch vụ hiện tại chưa bật hội nghị trực tuyến.",
  QUOTA_EXCEEDED: "Đã vượt hạn mức phút họp của tổ chức.",
  CONFERENCE_PROVIDER_UNAVAILABLE: "Hệ thống hội nghị chưa được cấu hình.",
  MEETING_TOKEN_ISSUE_FAILED: "Không cấp được vé vào phòng. Vui lòng thử lại.",
  TENANT_ACCESS_DENIED: "Phòng họp này thuộc tổ chức khác với tổ chức bạn đang chọn.",
};

// Lý do chi tiết + gợi ý xử lý, hiển thị ngay trên trang thay vì chỉ toast.
const JOIN_ERROR_HINTS: Record<string, string> = {
  MEETING_ACCESS_DENIED:
    "Bạn chưa nằm trong danh sách người tham gia của phòng này, hoặc phòng thuộc workspace khác với workspace bạn đang mở. Hãy yêu cầu người tổ chức mời bạn, hoặc đổi sang đúng workspace rồi thử lại.",
  TENANT_ACCESS_DENIED:
    "Hãy dùng bộ chọn tổ chức ở thanh trên cùng để chuyển sang đúng tổ chức chứa phòng họp này, sau đó thử lại.",
  MEETING_NOT_FOUND: "Phòng có thể đã bị xóa. Kiểm tra lại đường dẫn hoặc mở danh sách phòng họp.",
  MEETING_NOT_JOINABLE: "Bạn có thể xem lại thông tin cuộc họp trong lịch sử cuộc họp.",
  ENTITLEMENT_DENIED: "Liên hệ quản trị tổ chức để nâng cấp gói có hội nghị trực tuyến.",
  QUOTA_EXCEEDED: "Liên hệ quản trị tổ chức để tăng hạn mức phút họp hoặc chờ chu kỳ kế tiếp.",
};

const RSVP_LABELS: Record<string, string> = {
  pending: "Chờ phản hồi",
  accepted: "Tham gia",
  declined: "Từ chối",
  tentative: "Chưa chắc",
};

const PRESENCE_LABELS: Record<string, string> = {
  online: "Đang online",
  left: "Đã rời",
  absent: "Chưa vào",
};

const HOST_ACTION_LABELS: Record<string, string> = {
  start: "Bắt đầu",
  end: "Kết thúc",
  cancel: "Hủy họp",
  transfer_host: "Chuyển quyền chủ trì",
};

const MEETING_STATUS_META: Record<
  string,
  { label: string; className: string; dotClassName: string }
> = {
  scheduled: {
    label: "Chưa bắt đầu",
    className: "bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground",
  },
  live: {
    label: "Đang diễn ra",
    className: "bg-destructive/20 text-destructive",
    dotClassName: "bg-destructive animate-pulse",
  },
  ended: {
    label: "Đã kết thúc",
    className: "bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground",
  },
  canceled: {
    label: "Đã hủy",
    className: "bg-muted text-muted-foreground line-through",
    dotClassName: "bg-muted-foreground",
  },
};

function StageFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang kết nối phòng họp…
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
    invite: typeof search['invite'] === "string" ? (search['invite'] as string) : undefined,
  }),
  head: ({ params }) => ({
    meta: [{ title: `Phòng họp ${params.id} · UNIWORK` }],
  }),
  component: MeetingDetailPage,
});

function MeetingDetailPage() {
  const { id } = Route.useParams();
  const { invite } = Route.useSearch();
  const isRealRoom = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const [open, setOpen] = useSidebarState();
  const [tab, setTab] = useState<"chat" | "participants" | "transcript" | "ai" | "recording">("ai");
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const screenRef = useRef<MediaStream | null>(null);
  // Chất lượng chia sẻ màn hình (ghi nhớ theo trình duyệt).
  const [shareQuality, setShareQuality] = useState<ShareQualityKey>("auto");
  const [shareQualityInfo, setShareQualityInfo] = useState<string | null>(null);
  const autoLevelRef = useRef<Exclude<ShareQualityKey, "auto">>("balanced");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(SHARE_QUALITY_STORAGE_KEY) as ShareQualityKey | null;
    if (saved && saved in SHARE_QUALITY_LABELS) setShareQuality(saved);
  }, []);
  const changeShareQuality = useCallback((key: ShareQualityKey) => {
    setShareQuality(key);
    if (typeof window !== "undefined") window.localStorage.setItem(SHARE_QUALITY_STORAGE_KEY, key);
  }, []);
  const [session, setSession] = useState<{
    serverUrl: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [joining, setJoining] = useState(false);
  const [autoStatus, setAutoStatus] = useState<null | "refreshing" | "rejoining">(null);
  const [joinError, setJoinError] = useState<{ code: string; message: string } | null>(null);
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
      toast.error("Không đọc được danh sách thiết bị.");
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
  const inRoomRef = useRef(false);
  const attemptsRef = useRef(0);
  const rejoinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Xem trước camera trước khi vào phòng — giúp phát hiện sớm lỗi quyền thiết bị.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: camId ? { deviceId: { exact: camId } } : true,
          audio: micId ? { deviceId: { exact: micId } } : false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        void refreshDevices();
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "Error";
        toast.error(
          name === "NotAllowedError"
            ? "Trình duyệt đã chặn camera. Hãy cho phép quyền camera cho trang này."
            : name === "NotFoundError"
              ? "Không tìm thấy camera trên thiết bị."
              : "Không mở được camera.",
        );
        setCamOff(true);
      }
    }
    function stop() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }
    if (!session && !camOff) void start();
    else stop();
    return () => {
      cancelled = true;
      stop();
    };
  }, [camOff, session, sharing, camId, micId, refreshDevices]);

  // Chia sẻ màn hình thật bằng getDisplayMedia; dừng khi người dùng bấm "Stop sharing" của trình duyệt.
  const stopShare = useCallback(() => {
    screenRef.current?.getTracks().forEach((t) => t.stop());
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
      toast.error("Trình duyệt không hỗ trợ chia sẻ màn hình.");
      return;
    }
    try {
      const preset = resolvePreset(shareQuality);
      autoLevelRef.current = preset.key;
      const s = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints(preset));
      await applyPresetToTrack(s.getVideoTracks()[0], preset);
      screenRef.current = s;
      setShareQualityInfo(preset.label);
      setSharing(true);
      s.getVideoTracks()[0]?.addEventListener("ended", () => stopShare());
      toast.success(`Đang chia sẻ màn hình · ${preset.label}`);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "Error";
      if (name !== "NotAllowedError" && name !== "AbortError") {
        toast.error("Không chia sẻ được màn hình.");
      }
    }
  }, [sharing, stopShare, shareQuality, session]);

  // Vào phòng: dừng luồng xem trước cục bộ, LiveKit sẽ tự lấy lại luồng để publish.
  useEffect(() => {
    if (!session) return;
    screenRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
  }, [session]);

  // Đổi cấu hình khi đang chia sẻ: áp ngay cho track hiện tại.
  useEffect(() => {
    if (session || !sharing || !screenRef.current) return;
    const preset = resolvePreset(shareQuality);
    autoLevelRef.current = preset.key;
    void applyPresetToTrack(screenRef.current.getVideoTracks()[0], preset);
    setShareQualityInfo(preset.label);
  }, [shareQuality, sharing, session]);

  // Tự hạ bậc khi mạng yếu (chế độ "Tự động") ở màn hình chờ.
  useEffect(() => {
    if (session || !sharing || shareQuality !== "auto" || typeof navigator === "undefined") return;
    const conn = (navigator as unknown as { connection?: EventTarget & { effectiveType?: string; downlink?: number } })
      .connection;
    const adjust = () => {
      const weak =
        !conn ||
        ["slow-2g", "2g", "3g"].includes(conn.effectiveType ?? "") ||
        (conn.downlink ?? 99) < 1.5;
      if (!weak) return;
      const next = degrade(autoLevelRef.current);
      if (next === autoLevelRef.current) return;
      autoLevelRef.current = next;
      const preset = resolvePreset(next);
      void applyPresetToTrack(screenRef.current?.getVideoTracks()[0], preset);
      setShareQualityInfo(`${preset.label} · tự giảm do mạng yếu`);
    };
    adjust();
    const timer = setInterval(adjust, 8000);
    conn?.addEventListener?.("change", adjust);
    return () => {
      clearInterval(timer);
      conn?.removeEventListener?.("change", adjust);
    };
  }, [sharing, shareQuality, session]);

  // Gắn luồng màn hình vào khung xem trước.
  useEffect(() => {
    if (sharing && videoRef.current && screenRef.current) {
      videoRef.current.srcObject = screenRef.current;
    }
  }, [sharing]);

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
        const messages: Record<string, string> = {
          joined: "Đã dùng link mời — bạn có thể vào phòng.",
          already: "Bạn đã có quyền tham gia phòng này.",
          expired: "Link mời đã hết hạn. Hãy xin link mới từ người tổ chức.",
          exhausted: "Link mời đã hết số lượt sử dụng.",
          revoked: "Link mời đã bị thu hồi.",
          invalid: "Link mời không hợp lệ.",
        };
        const msg = messages[res.status] ?? "Không xử lý được link mời.";
        if (res.status === "joined" || res.status === "already") toast.success(msg);
        else toast.error(msg);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Link mời không hợp lệ.");
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
      toast.error("Đây là phòng demo. Hãy tạo phòng họp thật từ trang Họp.");
      return;
    }
    setJoining(true);
    setJoinError(null);
    manualLeaveRef.current = false;
    attemptsRef.current = 0;
    try {
      setSession(await fetchSession());
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "INTERNAL_ERROR";
      const message = JOIN_ERRORS[code] ?? "Không thể vào phòng họp.";
      setJoinError({ code, message });
      toast.error(message);
    } finally {
      setJoining(false);
    }
  }

  function leaveRoom() {
    manualLeaveRef.current = true;
    setAutoStatus(null);
    setSession(null);
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
        toast.error("Không gia hạn được vé phòng họp — sẽ thử kết nối lại khi mất kết nối.");
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
      toast.error("Không thể tự kết nối lại. Vui lòng bấm Vào phòng họp để thử lại.");
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
        toast.success("Đã tự động vào lại phòng họp.");
      } catch {
        scheduleRejoin();
      }
    }, delay);
  }, [fetchSession]);

  function handleStageDisconnected() {
    inRoomRef.current = false;
    setSession(null);
    if (!manualLeaveRef.current) scheduleRejoin();
  }

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
    let cancelled = false;
    void openMeetingAttendance({ data: { meetingId: id } }).catch(() => undefined);
    inRoomRef.current = true;
    return () => {
      cancelled = true;
      void closeMeetingAttendance({ data: { meetingId: id } }).catch(() => undefined);
      void cancelled;
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
    seed: p.userId,
    userId: p.userId,
    name: p.name ?? p.email ?? "Thành viên",
    email: p.email ?? null,
    role: p.role,
    rsvp: p.rsvp,
    rsvpAt: p.rsvpAt ?? null,
    invitedAt: p.invitedAt ?? null,
    presence: presenceByUser.get(p.userId) ?? ("absent" as const),
    speaking: false,
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
  const myRsvp =
    (participantsQuery.data ?? []).find((p) => p.userId === myUserId)?.rsvp ?? null;

  // ==== Giơ tay realtime (Supabase Presence trên kênh riêng của cuộc họp) ====
  const myName =
    (participantsQuery.data ?? []).find((p) => p.userId === myUserId)?.name ??
    (participantsQuery.data ?? []).find((p) => p.userId === myUserId)?.email ??
    "Bạn";
  const [raisedHands, setRaisedHands] = useState<Array<{ userId: string; name: string; at: number }>>([]);
  const handsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const handRaised = raisedHands.some((h) => h.userId === myUserId);

  useEffect(() => {
    if (!isRealRoom || !myUserId) return;
    const channel = supabase.channel(`meeting-hands-${id}`, {
      config: { presence: { key: myUserId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ raised?: boolean; name?: string; at?: number }>();
        const next: Array<{ userId: string; name: string; at: number }> = [];
        for (const [key, metas] of Object.entries(state)) {
          const meta = metas[metas.length - 1];
          if (meta?.raised) next.push({ userId: key, name: meta.name ?? "Thành viên", at: meta.at ?? 0 });
        }
        next.sort((a, b) => a.at - b.at);
        setRaisedHands(next);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ raised: false, name: myName });
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
      toast.error("Chưa kết nối được trạng thái phòng họp.");
      return;
    }
    const next = !handRaised;
    await channel.track({ raised: next, name: myName, at: Date.now() });
    toast.success(next ? "Bạn đã giơ tay." : "Bạn đã hạ tay.");
  }, [handRaised, myName]);

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
        toast.success(`Đã cập nhật: ${RSVP_LABELS[rsvp]}`);
        await syncMeetingQueries();
      } catch {
        if (previous !== undefined) queryClient.setQueryData(key, previous);
        toast.error("Không cập nhật được phản hồi tham dự.");
        void refetchParticipants();
      } finally {
        setRsvpSaving(null);
      }
    },
    [id, isRealRoom, myUserId, queryClient, refetchParticipants, syncMeetingQueries],
  );

  // Trạng thái cuộc họp + quyền chủ trì để hiện nút Bắt đầu / Kết thúc.
  const meetingQuery = useQuery({
    queryKey: ["meeting", id],
    enabled: isRealRoom,
    staleTime: 15_000,
    queryFn: () => getMeeting({ data: { meetingId: id } }),
  });
  const meetingStatus = (meetingQuery.data as { status?: string } | undefined)?.status ?? null;
  const statusMeta = MEETING_STATUS_META[meetingStatus ?? ""] ?? MEETING_STATUS_META["scheduled"];
  const isHost =
    !!myUserId &&
    (participantsQuery.data ?? []).some((p) => p.userId === myUserId && p.role === "host");
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
        toast.success(action === "start" ? "Đã bắt đầu cuộc họp." : "Đã kết thúc cuộc họp.");
        // Đồng bộ ngay roster + thông tin phòng họp
        await syncMeetingQueries();
        await Promise.all([meetingQuery.refetch(), refetchParticipants(), hostLogQuery.refetch()]);
        // Webhook meeting_provider_events có thể tới trễ -> sync lại lần nữa
        window.setTimeout(() => {
          void syncMeetingQueries();
          void hostLogQuery.refetch();
        }, 2500);
      } catch {
        toast.error(
          action === "start" ? "Không bắt đầu được cuộc họp." : "Không kết thúc được cuộc họp.",
        );
      } finally {
        setLifecycleBusy(null);
      }
    },
    [id, meetingQuery, hostLogQuery, refetchParticipants, syncMeetingQueries],
  );

  const handleTransferHost = useCallback(
    async (userId: string, name: string) => {
      setTransferBusy(userId);
      try {
        await transferMeetingHost({
          data: { meetingId: id, newHostUserId: userId, idempotencyKey: crypto.randomUUID() },
        });
        toast.success(`Đã chuyển quyền chủ trì cho ${name}.`);
        await syncMeetingQueries();
        await Promise.all([refetchParticipants(), hostLogQuery.refetch()]);
      } catch {
        toast.error("Không chuyển được quyền chủ trì.");
      } finally {
        setTransferBusy(null);
      }
    },
    [id, hostLogQuery, refetchParticipants, syncMeetingQueries],
  );

  // Thời lượng cuộc họp: suy ra từ nhật ký thao tác chủ trì (start/end thành công).
  const hostLog = hostLogQuery.data ?? [];
  const successStarts = hostLog.filter((e) => e.action === "start" && e.outcome === "success");
  const successEnds = hostLog.filter((e) => e.action === "end" && e.outcome === "success");
  const actualStartAt =
    successStarts.length > 0
      ? successStarts[successStarts.length - 1]!.occurredAt
      : null;
  const actualEndAt = successEnds.length > 0 ? successEnds[0]!.occurredAt : null;
  const isLive = meetingStatus === "live";

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isRealRoom || meetingStatus === "ended") return;
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [isRealRoom, meetingStatus]);

  const elapsedMs = actualStartAt
    ? (isLive || !actualEndAt ? nowTick : new Date(actualEndAt).getTime()) -
      new Date(actualStartAt).getTime()
    : null;
  const durationLabel =
    elapsedMs !== null && elapsedMs >= 0 ? formatDuration(elapsedMs) : null;
  const startTimeLabel = actualStartAt
    ? new Date(actualStartAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : null;

  // Lịch dự kiến (start_at / end_at) để đếm ngược và cảnh báo quá giờ.
  const meetingRow = meetingQuery.data as
    | { start_at?: string | null; end_at?: string | null }
    | undefined;
  const plannedStart = meetingRow?.start_at ? new Date(meetingRow.start_at) : null;
  const plannedEnd = meetingRow?.end_at ? new Date(meetingRow.end_at) : null;
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const fmtDateTime = (d: Date) =>
    d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  // Bộ đếm theo trạng thái: chưa bắt đầu -> đếm ngược tới giờ bắt đầu (hoặc trễ giờ);
  // đang diễn ra -> còn lại tới giờ kết thúc dự kiến (hoặc quá giờ).
  let timerLabel: string | null = null;
  let timerTone: "normal" | "warn" | "over" = "normal";
  if (isRealRoom) {
    if (meetingStatus === "live" && plannedEnd) {
      const diff = plannedEnd.getTime() - nowTick;
      if (diff >= 0) {
        timerLabel = `Còn ${formatDuration(diff)}`;
        timerTone = diff <= 5 * 60_000 ? "warn" : "normal";
      } else {
        timerLabel = `Quá giờ ${formatDuration(-diff)}`;
        timerTone = "over";
      }
    } else if ((meetingStatus === "scheduled" || !meetingStatus) && plannedStart) {
      const diff = plannedStart.getTime() - nowTick;
      if (diff >= 0) {
        timerLabel = `Bắt đầu sau ${formatDuration(diff)}`;
        timerTone = diff <= 5 * 60_000 ? "warn" : "normal";
      } else {
        timerLabel = `Trễ ${formatDuration(-diff)}`;
        timerTone = "over";
      }
    }
  }
  const timerToneClass =
    timerTone === "over"
      ? "bg-destructive/15 text-destructive"
      : timerTone === "warn"
        ? "bg-primary/15 text-primary"
        : "bg-muted text-muted-foreground";

  // Khóa RSVP khi cuộc họp đã kết thúc hoặc đã hủy.
  const rsvpLocked = meetingStatus === "ended" || meetingStatus === "canceled";
  const rsvpLockReason =
    meetingStatus === "ended"
      ? "Cuộc họp đã kết thúc nên không thể thay đổi phản hồi tham dự."
      : meetingStatus === "canceled"
        ? "Cuộc họp đã bị hủy nên không thể thay đổi phản hồi tham dự."
        : null;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="meetings" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="meeting" onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex flex-1 flex-col overflow-hidden p-4 lg:p-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
              <Link to="/meeting" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" /> Tất cả cuộc họp
              </Link>
              <h1 className="mt-1 text-lg font-semibold">
                Sprint Review · <span className="font-mono text-muted-foreground">{id}</span>
              </h1>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${statusMeta.className}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClassName}`} /> {statusMeta.label}
                </span>
                {isRealRoom ? (
                  <>
                    {(plannedStart || plannedEnd) && (
                      <>
                        <Clock className="h-3 w-3" />
                        <span>
                          {plannedStart ? fmtDateTime(plannedStart) : "—"}
                          {plannedEnd ? ` → ${fmtTime(plannedEnd)}` : ""}
                        </span>
                        <span>·</span>
                      </>
                    )}
                    {timerLabel && (
                      <>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono tabular-nums ${timerToneClass}`}
                        >
                          {timerLabel}
                        </span>
                        <span>·</span>
                      </>
                    )}
                    {durationLabel && (
                      <>
                        <span>
                          {startTimeLabel ? `Bắt đầu thật ${startTimeLabel} · ` : ""}
                          {isLive ? "Đã diễn ra" : "Tổng"}{" "}
                          <span className="font-mono tabular-nums text-foreground">{durationLabel}</span>
                        </span>
                        <span>·</span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3" /> 32:14
                    <span>·</span>
                  </>
                )}
                <Users className="h-3 w-3" /> {participants.length} người
              </div>
              </div>
              {isRealRoom && isHost && (
                <div className="flex shrink-0 items-center gap-2">
                  {meetingStatus !== "live" && meetingStatus !== "ended" && (
                    <button
                      type="button"
                      disabled={lifecycleBusy !== null}
                      onClick={() => void handleLifecycle("start")}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {lifecycleBusy === "start" ? "Đang bắt đầu…" : "Bắt đầu họp"}
                    </button>
                  )}
                  {meetingStatus === "live" && (
                    <AlertDialog open={confirmEndOpen} onOpenChange={setConfirmEndOpen}>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          disabled={lifecycleBusy !== null}
                          className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-60"
                        >
                          {lifecycleBusy === "end" ? "Đang kết thúc…" : "Kết thúc họp"}
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Kết thúc cuộc họp?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Hành động này sẽ dừng cuộc họp cho tất cả người tham gia và không thể hoàn tác.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={lifecycleBusy === "end"}>Hủy</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => void handleLifecycle("end")}
                            disabled={lifecycleBusy === "end"}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {lifecycleBusy === "end" ? "Đang kết thúc…" : "Xác nhận kết thúc"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {meetingStatus === "ended" && (
                    <span className="text-xs text-muted-foreground">Cuộc họp đã kết thúc</span>
                  )}
                </div>
              )}
            </div>

            {session ? (
              <div className="flex-1 overflow-hidden rounded-xl bg-surface-2">
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
                      onShareQualityResolved={setShareQualityInfo}
                      screenShareEnabled={sharing}
                      onScreenShareStateChange={(on) => setSharing((s) => (s === on ? s : on))}
                      onMediaStateChange={({ mic, cam }) => {
                        setMuted((m) => (m === !mic ? m : !mic));
                        setCamOff((c) => (c === !cam ? c : !cam));
                      }}
                      onConnectionStateChange={(s) => {
                        if (s === "connected") {
                          inRoomRef.current = true;
                          attemptsRef.current = 0;
                          setAutoStatus(null);
                        }
                      }}
                    />
                  </Suspense>
                </ClientOnly>
              </div>
            ) : (
            <div className="grid flex-1 grid-cols-2 gap-2 overflow-hidden lg:grid-cols-3">
              <div className="relative flex items-center justify-center overflow-hidden rounded-xl bg-surface-2">
                {camOff && !sharing ? (
                  <VideoOff className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`h-full w-full ${sharing ? "object-contain bg-black" : "object-cover"}`}
                  />
                )}
                <div className="absolute bottom-2 left-2 right-2 rounded-md bg-black/40 px-2 py-1 text-xs backdrop-blur">
                  {sharing
                    ? `Bạn (đang chia sẻ màn hình${shareQualityInfo ? ` · ${shareQualityInfo}` : ""})`
                    : "Bạn (xem trước)"}
                </div>
              </div>
              {participants.map((p) => (
                <div
                  key={p.seed}
                  className={`relative flex items-center justify-center rounded-xl bg-surface-2 ${p.speaking ? "ring-2 ring-success" : ""}`}
                >
                  <img src={avatar(p.seed)} className="h-20 w-20 rounded-full" alt="" />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-md bg-black/40 px-2 py-1 text-xs backdrop-blur">
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          p.presence === "online"
                            ? "bg-success"
                            : p.presence === "left"
                              ? "bg-muted-foreground"
                              : "bg-border"
                        }`}
                      />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {raisedSet.has(p.userId) && <Hand className="h-3 w-3 text-primary" />}
                      {p.speaking && <Mic className="h-3 w-3 text-success" />}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            )}

            {!session && joinError && (
              <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
                <p className="text-sm font-medium text-destructive">{joinError.message}</p>
                {JOIN_ERROR_HINTS[joinError.code] && (
                  <p className="mt-1 text-xs text-muted-foreground">{JOIN_ERROR_HINTS[joinError.code]}</p>
                )}
                <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                  Mã lỗi: {joinError.code} · Phòng: {id}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleJoin}
                    disabled={joining || redeeming}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
                  >
                    Thử vào lại
                  </button>
                  <Link
                    to="/meeting"
                    search={{ focus: "rooms" }}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
                  >
                    Phòng họp của workspace này
                  </Link>
                </div>
                {isRealRoom && (joinError.code === "MEETING_ACCESS_DENIED" || joinError.code === "TENANT_ACCESS_DENIED") && (
                  <JoinRequestPanel meetingId={id} onApproved={() => void handleJoin()} />
                )}
              </div>
            )}

            {!session && isRealRoom && <JoinRequestInbox meetingId={id} />}

            {autoStatus && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {autoStatus === "refreshing"
                  ? "Đang gia hạn vé phòng họp…"
                  : "Mất kết nối — đang tự động vào lại phòng họp…"}
              </p>
            )}

            {!session && !isRealRoom && (
              <p className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                Phòng <span className="font-mono">{id}</span> là dữ liệu mẫu nên không kết nối được
                máy chủ họp.{" "}
                <Link to="/meeting" className="text-primary hover:underline">
                  Tạo phòng họp thật
                </Link>{" "}
                để dùng camera và micro.
              </p>
            )}

            {raisedHands.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
                <Hand className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="font-medium text-primary">Đang giơ tay:</span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {raisedHands.map((h, i) => `${i + 1}. ${h.userId === myUserId ? "Bạn" : h.name}`).join(" · ")}
                </span>
              </div>
            )}

            <div className="mt-4 flex items-center justify-center gap-2">
              {session ? (
                <>
                  <CtrlBtn active={!muted} onClick={() => setMuted(!muted)} icon={muted ? MicOff : Mic} />
                  <CtrlBtn active={!camOff} onClick={() => setCamOff(!camOff)} icon={camOff ? VideoOff : Video} />
                  <button
                    onClick={leaveRoom}
                    className="ml-2 flex items-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                  >
                    <PhoneOff className="h-4 w-4" /> Rời phòng
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 transition-colors hover:bg-surface-3"
                        aria-label="Chất lượng chia sẻ màn hình"
                      >
                        <ScreenShare className="h-5 w-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel>Chất lượng chia sẻ màn hình</DropdownMenuLabel>
                      {(Object.keys(SHARE_QUALITY_LABELS) as ShareQualityKey[]).map((k) => (
                        <DropdownMenuItem
                          key={k}
                          onSelect={() => changeShareQuality(k)}
                          className={shareQuality === k ? "font-medium text-primary" : ""}
                        >
                          {SHARE_QUALITY_LABELS[k]}
                        </DropdownMenuItem>
                      ))}
                      {shareQualityInfo && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                            Đang áp dụng: {shareQualityInfo}
                          </DropdownMenuLabel>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <>
                  <CtrlBtn active={!muted} onClick={() => setMuted(!muted)} icon={muted ? MicOff : Mic} />
                  <CtrlBtn active={!camOff} onClick={() => setCamOff(!camOff)} icon={camOff ? VideoOff : Video} />
                  <CtrlBtn
                    active={!sharing}
                    onClick={() => void toggleShare()}
                    icon={sharing ? ScreenShareOff : ScreenShare}
                  />
                  <CtrlBtn
                    active={!handRaised}
                    onClick={() => void toggleHand()}
                    icon={Hand}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 transition-colors hover:bg-surface-3">
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel className="flex items-center justify-between gap-2">
                        Micro
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            void refreshDevices();
                            toast.success("Đã làm mới danh sách thiết bị.");
                          }}
                          className="text-xs font-normal text-primary hover:underline"
                        >
                          Làm mới
                        </button>
                      </DropdownMenuLabel>
                      {devices.filter((d) => d.kind === "audioinput").length === 0 ? (
                        <DropdownMenuItem disabled>Không có micro</DropdownMenuItem>
                      ) : (
                        devices
                          .filter((d) => d.kind === "audioinput")
                          .map((d, i) => (
                            <DropdownMenuItem
                              key={d.deviceId || i}
                              onSelect={() => setMicId(d.deviceId)}
                              className={micId === d.deviceId ? "font-medium text-primary" : ""}
                            >
                              <Mic className="mr-2 h-4 w-4" />
                              <span className="truncate">{d.label || `Micro ${i + 1}`}</span>
                            </DropdownMenuItem>
                          ))
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Camera</DropdownMenuLabel>
                      {devices.filter((d) => d.kind === "videoinput").length === 0 ? (
                        <DropdownMenuItem disabled>Không có camera</DropdownMenuItem>
                      ) : (
                        devices
                          .filter((d) => d.kind === "videoinput")
                          .map((d, i) => (
                            <DropdownMenuItem
                              key={d.deviceId || i}
                              onSelect={() => {
                                setCamId(d.deviceId);
                                setCamOff(false);
                              }}
                              className={camId === d.deviceId ? "font-medium text-primary" : ""}
                            >
                              <Video className="mr-2 h-4 w-4" />
                              <span className="truncate">{d.label || `Camera ${i + 1}`}</span>
                            </DropdownMenuItem>
                          ))
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Chất lượng chia sẻ màn hình</DropdownMenuLabel>
                      {(Object.keys(SHARE_QUALITY_LABELS) as ShareQualityKey[]).map((k) => (
                        <DropdownMenuItem
                          key={k}
                          onSelect={() => changeShareQuality(k)}
                          className={shareQuality === k ? "font-medium text-primary" : ""}
                        >
                          <ScreenShare className="mr-2 h-4 w-4" />
                          <span className="truncate">{SHARE_QUALITY_LABELS[k]}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    onClick={handleJoin}
                    disabled={joining || redeeming}
                    className="ml-2 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {joining || redeeming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Video className="h-4 w-4" />
                    )}
                    {redeeming ? "Đang xử lý link mời…" : "Vào phòng họp"}
                  </button>
                </>
              )}
            </div>

            {isHost && isRealRoom && (
              <section className="mt-6 overflow-hidden rounded-xl border border-border bg-surface text-left">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold">Danh sách người tham dự</h3>
                    <p className="text-xs text-muted-foreground">
                      Trạng thái phản hồi và thời điểm cập nhật gần nhất
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {(["accepted", "tentative", "declined", "pending"] as const).map((v) => (
                      <span
                        key={v}
                        className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-muted-foreground"
                      >
                        {RSVP_LABELS[v] ?? v}:{" "}
                        <span className="font-medium text-foreground">
                          {participants.filter((p) => p.rsvp === v).length}
                        </span>
                      </span>
                    ))}
                  </div>
                </header>
                {participantsQuery.isLoading ? (
                  <p className="px-4 py-4 text-xs text-muted-foreground">Đang tải danh sách…</p>
                ) : participants.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-muted-foreground">
                    Chưa có người tham dự nào được mời.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-2 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 font-medium">Người tham dự</th>
                          <th className="px-4 py-2 font-medium">Vai trò</th>
                          <th className="px-4 py-2 font-medium">RSVP</th>
                          <th className="px-4 py-2 font-medium">Hiện diện</th>
                          <th className="px-4 py-2 font-medium">Cập nhật lúc</th>
                          <th className="px-4 py-2 font-medium">Được mời lúc</th>
                        </tr>
                      </thead>
                      <tbody>
                        {participants.map((p) => (
                          <tr key={p.userId} className="border-t border-border">
                            <td className="px-4 py-2">
                              <div className="font-medium text-foreground">{p.name}</div>
                              {p.email && (
                                <div className="text-[11px] text-muted-foreground">{p.email}</div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {p.role === "host" ? "Chủ trì" : "Tham dự"}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] ${
                                  p.rsvp === "accepted"
                                    ? "bg-success/10 text-success"
                                    : p.rsvp === "declined"
                                      ? "bg-destructive/10 text-destructive"
                                      : p.rsvp === "tentative"
                                        ? "bg-warning/10 text-primary"
                                        : "bg-surface-3 text-muted-foreground"
                                }`}
                              >
                                {RSVP_LABELS[p.rsvp] ?? p.rsvp}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {PRESENCE_LABELS[p.presence]}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {p.rsvpAt ? new Date(p.rsvpAt).toLocaleString("vi-VN") : "—"}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {p.invitedAt ? new Date(p.invitedAt).toLocaleString("vi-VN") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </main>

          <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-surface lg:flex">
            <div className="flex border-b border-border text-xs">
              {(
                [
                  { k: "ai", label: "AI", icon: Sparkles },
                  { k: "chat", label: "Chat", icon: MessageSquare },
                  { k: "participants", label: "Người", icon: Users },
                  { k: "transcript", label: "Biên bản", icon: FileText },
                  { k: "recording", label: "Ghi hình", icon: VideoIcon },
                ] as const
              ).map((it) => (
                <button
                  key={it.k}
                  onClick={() => setTab(it.k)}
                  className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 transition-colors ${tab === it.k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <it.icon className="h-3.5 w-3.5" /> {it.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 text-sm">
              {tab === "ai" && <AICopilotPanel />}
              {tab === "recording" &&
                (isRealRoom ? (
                  <MeetingRecordingPanel meetingId={id} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Phòng demo không có dữ liệu ghi hình. Hãy tạo phòng họp thật để dùng tính năng
                    này.
                  </p>
                ))}
              {tab === "chat" && <ChatPanel />}
              {tab === "participants" && (
                <div className="space-y-3">
                  {isRealRoom && (
                    <div className="rounded-lg border border-border bg-surface-2 p-2">
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        Phản hồi tham dự của bạn
                        {myRsvp ? ` · ${RSVP_LABELS[myRsvp] ?? myRsvp}` : ""}
                      </p>
                      <div className="flex gap-1.5">
                        {(["accepted", "tentative", "declined"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            disabled={rsvpSaving !== null || rsvpLocked}
                            title={rsvpLockReason ?? undefined}
                            onClick={() => void handleRsvp(v)}
                            className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors disabled:opacity-60 ${
                              myRsvp === v
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-surface hover:bg-surface-3"
                            }`}
                          >
                            {rsvpSaving === v ? "Đang lưu…" : RSVP_LABELS[v]}
                          </button>
                        ))}
                      </div>
                      {rsvpLockReason && (
                        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{rsvpLockReason}</span>
                        </p>
                      )}
                    </div>
                  )}
                  {participantsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Đang tải danh sách…</p>
                ) : participants.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {isRealRoom
                      ? "Chưa có người tham gia nào được mời."
                      : "Phòng demo không có danh sách người tham gia thật."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {participants.map((p) => (
                      <li key={p.seed} className="flex items-center gap-2">
                        <img src={avatar(p.seed)} className="h-7 w-7 rounded-full" alt="" />
                        <span className="flex-1 truncate">
                          {p.name}
                          {p.role === "host" && (
                            <span className="ml-1 text-[10px] text-muted-foreground">(Chủ trì)</span>
                          )}
                        </span>
                        {raisedSet.has(p.userId) && (
                          <Hand className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Đang giơ tay" />
                        )}
                        <span
                          title={PRESENCE_LABELS[p.presence]}
                          className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                            p.presence === "online"
                              ? "bg-success/10 text-success"
                              : p.presence === "left"
                                ? "bg-surface-3 text-muted-foreground"
                                : "text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              p.presence === "online"
                                ? "bg-success"
                                : p.presence === "left"
                                  ? "bg-muted-foreground"
                                  : "bg-border"
                            }`}
                          />
                          {PRESENCE_LABELS[p.presence]}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {RSVP_LABELS[p.rsvp] ?? p.rsvp}
                        </span>
                        {isHost &&
                          p.userId !== myUserId &&
                          meetingStatus !== "ended" &&
                          meetingStatus !== "canceled" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  type="button"
                                  disabled={transferBusy !== null}
                                  title="Chuyển quyền chủ trì"
                                  className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-60"
                                >
                                  {transferBusy === p.userId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Crown className="h-3 w-3" />
                                  )}
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Chuyển quyền chủ trì?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {p.name} sẽ trở thành người chủ trì cuộc họp. Bạn sẽ chuyển
                                    thành người tham gia và mất quyền bắt đầu/kết thúc cuộc họp.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => void handleTransferHost(p.userId, p.name)}
                                  >
                                    Chuyển quyền
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
                      <h4 className="mb-2 text-xs font-semibold">Lịch sử thao tác chủ trì</h4>
                      {hostLogQuery.isLoading ? (
                        <p className="text-xs text-muted-foreground">Đang tải…</p>
                      ) : (hostLogQuery.data ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">Chưa có thao tác nào.</p>
                      ) : (
                        <ul className="space-y-2">
                          {(hostLogQuery.data ?? []).map((e) => (
                            <li key={e.id} className="text-xs">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                    e.outcome === "success"
                                      ? "bg-success/10 text-success"
                                      : "bg-destructive/10 text-destructive"
                                  }`}
                                >
                                  {HOST_ACTION_LABELS[e.action] ?? e.action} ·{" "}
                                  {e.outcome === "success" ? "Thành công" : "Thất bại"}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                {e.actorName ?? "Người dùng"} ·{" "}
                                {new Date(e.occurredAt).toLocaleString("vi-VN")}
                              </div>
                              {e.errorCode && (
                                <div className="text-[10px] font-mono text-destructive">
                                  {e.errorCode}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
              {tab === "transcript" && (
                <div className="space-y-3 text-xs">
                  {[
                    { who: "Minh Anh", time: "00:01:24", text: "Chào mọi người, bắt đầu sprint review." },
                    { who: "Tuấn Nam", time: "00:02:10", text: "Backend hoàn thành 8/10 user story." },
                    { who: "Hương Trần", time: "00:03:45", text: "Frontend còn 2 bug responsive trên mobile." },
                  ].map((m, i) => (
                    <div key={i}>
                      <div className="text-[10px] text-muted-foreground">
                        {m.who} · {m.time}
                      </div>
                      <div className="text-foreground">{m.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function CtrlBtn({
  icon: Icon,
  active = true,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${active ? "bg-surface-2 hover:bg-surface-3" : "bg-destructive/20 text-destructive"}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function AICopilotPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Tóm tắt tức thời
        </div>
        <p className="text-xs text-muted-foreground">
          Backend hoàn thành 8/10 user story. Frontend cần fix 2 bug responsive
          trước EOD. Sprint planning tiếp theo dự kiến thứ Hai.
        </p>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Action items
        </div>
        <ul className="space-y-2 text-xs">
          <li className="flex items-start gap-2 rounded-md bg-surface-2 p-2">
            <input type="checkbox" className="mt-0.5" />
            <div>
              Hương Trần fix bug responsive trên Dashboard
              <div className="text-[10px] text-muted-foreground">Hạn: hôm nay</div>
            </div>
          </li>
          <li className="flex items-start gap-2 rounded-md bg-surface-2 p-2">
            <input type="checkbox" className="mt-0.5" />
            <div>
              Tuấn Nam gửi test report sprint 14
              <div className="text-[10px] text-muted-foreground">Hạn: 30/05</div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}

function ChatPanel() {
  const [msg, setMsg] = useState("");
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {[
          { who: "Minh Anh", text: "Mọi người đã sẵn sàng chưa?", time: "10:00" },
          { who: "Tuấn Nam", text: "Sẵn sàng nhé", time: "10:01" },
        ].map((m, i) => (
          <div key={i} className="text-xs">
            <span className="font-medium">{m.who}</span>{" "}
            <span className="text-[10px] text-muted-foreground">{m.time}</span>
            <div className="text-muted-foreground">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Nhập tin nhắn…"
          className="flex-1 bg-transparent text-xs focus:outline-none"
        />
        <button className="rounded p-1 hover:bg-surface-3">
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}