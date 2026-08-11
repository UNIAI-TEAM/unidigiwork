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
  Video as VideoIcon,
} from "lucide-react";
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
import { MeetingRecordingPanel } from "@/components/meeting/recording-panel";
import {
  openMeetingAttendance,
  closeMeetingAttendance,
} from "@/lib/api/meeting-recordings.functions";
import { listMeetingParticipants } from "@/lib/api/meeting-rooms.functions";
import {
  setMeetingRsvp,
  getMeeting,
  startMeeting,
  endMeeting,
  listMeetingHostActions,
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
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
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
  }, [camOff, session]);

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

  const participants = (participantsQuery.data ?? []).map((p) => ({
    seed: p.userId,
    name: p.name ?? p.email ?? "Thành viên",
    role: p.role,
    rsvp: p.rsvp,
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
        await Promise.all([meetingQuery.refetch(), refetchParticipants()]);
        // Webhook meeting_provider_events có thể tới trễ -> sync lại lần nữa
        window.setTimeout(() => {
          void syncMeetingQueries();
        }, 2500);
      } catch {
        toast.error(
          action === "start" ? "Không bắt đầu được cuộc họp." : "Không kết thúc được cuộc họp.",
        );
      } finally {
        setLifecycleBusy(null);
      }
    },
    [id, meetingQuery, refetchParticipants, syncMeetingQueries],
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
                {camOff ? (
                  <VideoOff className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                )}
                <div className="absolute bottom-2 left-2 right-2 rounded-md bg-black/40 px-2 py-1 text-xs backdrop-blur">
                  Bạn (xem trước)
                </div>
              </div>
              {participants.map((p) => (
                <div
                  key={p.seed}
                  className={`relative flex items-center justify-center rounded-xl bg-surface-2 ${p.speaking ? "ring-2 ring-success" : ""}`}
                >
                  <img src={avatar(p.seed)} className="h-20 w-20 rounded-full" alt="" />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-md bg-black/40 px-2 py-1 text-xs backdrop-blur">
                    <span className="truncate">{p.name}</span>
                    {p.speaking && <Mic className="h-3 w-3 text-success" />}
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

            <div className="mt-4 flex items-center justify-center gap-2">
              {session ? (
                <button
                  onClick={leaveRoom}
                  className="flex items-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  <PhoneOff className="h-4 w-4" /> Rời phòng
                </button>
              ) : (
                <>
                  <CtrlBtn active={!muted} onClick={() => setMuted(!muted)} icon={muted ? MicOff : Mic} />
                  <CtrlBtn active={!camOff} onClick={() => setCamOff(!camOff)} icon={camOff ? VideoOff : Video} />
                  <CtrlBtn icon={ScreenShare} />
                  <CtrlBtn icon={Hand} />
                  <CtrlBtn icon={MoreHorizontal} />
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
                        <span className="text-[10px] text-muted-foreground">
                          {RSVP_LABELS[p.rsvp] ?? p.rsvp}
                        </span>
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
                                  {e.action === "start" ? "Bắt đầu" : "Kết thúc"} ·{" "}
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