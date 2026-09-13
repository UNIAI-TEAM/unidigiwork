import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowUpDown,
  ArrowUpRight,
  Calendar,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  Link2,
  Loader2,
  Mail,
  MailQuestion,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Users,
  Video as VideoIcon,
  X,
  XCircle,
} from "lucide-react";
import {
  createInstantMeeting,
  createMeetingInviteLink,
  inviteMeetingParticipant,
  listMyMeetingRooms,
  getWorkspaceMeetingStats,
  listMyWorkspaces,
  listMeetingParticipants,
  redeemMeetingInviteLink,
} from "@/lib/api/meeting-rooms.functions";
import {
  cancelMeeting,
  getMeetingManagePermissions,
  listMeetings,
  scheduleMeeting,
  updateMeeting,
} from "@/lib/api/meetings.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { useMeetingsRealtime } from "@/hooks/use-meetings-realtime";
import { localeTag, useI18n, type Key } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

export const Route = createFileRoute("/meeting")({
  validateSearch: (
    search: {
      ws?: string;
      q?: string;
      focus?: "rooms";
      state?: "live" | "upcoming" | "ended";
      page?: number;
      from?: string;
      to?: string;
      sort?: "asc" | "desc";
    } & Partial<Record<string, unknown>>,
  ): {
    ws?: string;
    q?: string;
    focus?: "rooms";
    state?: "live" | "upcoming" | "ended";
    page?: number;
    from?: string;
    to?: string;
    sort?: "asc" | "desc";
  } => ({
    ws: typeof search["ws"] === "string" ? (search["ws"] as string) : undefined,
    q: typeof search["q"] === "string" ? (search["q"] as string) : undefined,
    focus: search["focus"] === "rooms" ? ("rooms" as const) : undefined,
    state:
      search["state"] === "live" || search["state"] === "upcoming" || search["state"] === "ended"
        ? (search["state"] as "live" | "upcoming" | "ended")
        : undefined,
    page:
      typeof search["page"] === "string" && /^[1-9]\d*$/.test(search["page"] as string)
        ? Number(search["page"])
        : 1,
    from:
      typeof search["from"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search["from"] as string)
        ? (search["from"] as string)
        : undefined,
    to:
      typeof search["to"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search["to"] as string)
        ? (search["to"] as string)
        : undefined,
    sort:
      search["sort"] === "asc" || search["sort"] === "desc"
        ? (search["sort"] as "asc" | "desc")
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Họp · UNIWORK" },
      { name: "description", content: "Lên lịch, tham gia và quản lý cuộc họp với AI Copilot." },
    ],
  }),
  component: MeetingPage,
});

type Translate = (k: Key) => string;
type RoomFilterState = "all" | "live" | "upcoming" | "ended";
type ListRoom = { id: string; title: string; status: string; start_at: string; end_at: string };

const ROOM_FILTER_KEY = "uniwork.meeting.roomFilter";
const ROOM_PAGE_SIZE = 20;

const STATE_FILTERS: { key: RoomFilterState; label: Key }[] = [
  { key: "all", label: "mtg.filter.all" },
  { key: "upcoming", label: "mtg.status.scheduled" },
  { key: "live", label: "mtg.status.live" },
  { key: "ended", label: "mtg.status.ended" },
];

// "late" / "overdue": cuộc họp vẫn ở trạng thái đã lên lịch nhưng đã quá giờ bắt đầu / kết thúc
// mà chưa ai bắt đầu — không được hiển thị là "Đang diễn ra".
type RoomChipState = "live" | "upcoming" | "late" | "overdue" | "ended" | "canceled";

function resolveRoomState(status: string, startAt?: string, endAt?: string): RoomChipState {
  if (status === "live") return "live";
  if (status === "canceled") return "canceled";
  if (status === "ended") return "ended";
  const now = Date.now();
  if (endAt && new Date(endAt).getTime() < now) return "overdue";
  if (startAt && new Date(startAt).getTime() <= now) return "late";
  return "upcoming";
}

const ROOM_CHIP: Record<RoomChipState, { label: Key; className: string; dot: string }> = {
  live: {
    label: "mtg.status.live",
    className: "bg-destructive/12 text-destructive",
    dot: "bg-destructive animate-pulse",
  },
  upcoming: {
    label: "mtg.status.scheduled",
    className: "bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  late: { label: "mtg.chip.late", className: "bg-warning/15 text-foreground", dot: "bg-warning" },
  overdue: {
    label: "mtg.chip.overdue",
    className: "bg-surface-2 text-muted-foreground",
    dot: "bg-warning",
  },
  ended: {
    label: "mtg.status.ended",
    className: "bg-surface-2 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  canceled: {
    label: "mtg.status.canceled",
    className: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

function RoomStatusChip({ state }: { state: RoomChipState }) {
  const { t } = useI18n();
  const chip = ROOM_CHIP[state];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} aria-hidden="true" />
      {t(chip.label)}
    </span>
  );
}

function formatRange(
  startAt: string | undefined,
  endAt: string | undefined,
  locale: string,
  t: Translate,
) {
  if (!startAt) return t("mtg.row.noTime");
  const s = new Date(startAt);
  const e = endAt ? new Date(endAt) : null;
  const time = s.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const date = s.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  const mins = e ? Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000)) : 0;
  return mins ? `${time} · ${date} · ${fmt(t("mtg.dur.min"), { m: mins })}` : `${time} · ${date}`;
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isRangeInvalid(start: string, end: string) {
  return !!start && !!end && new Date(end).getTime() <= new Date(start).getTime();
}

/** Chấp nhận cả mã mời lẫn cả đường link có tham số `?invite=`. */
function extractInviteToken(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    return new URL(raw).searchParams.get("invite")?.trim() || raw;
  } catch {
    return raw;
  }
}

function MeetingPage() {
  const [open, setOpen] = useSidebarState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const { t, lang } = useI18n();
  const locale = localeTag(lang);

  const workspaces = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
  });

  // Ghi nhớ bộ lọc gần nhất (workspace + từ khóa + trạng thái + sắp xếp) giữa các lần truy cập.
  const [restoredFilter, setRestoredFilter] = useState<{
    ws?: string;
    q?: string;
    state?: RoomFilterState;
    sort?: "asc" | "desc";
  } | null>(null);

  useEffect(() => {
    if (
      search.ws !== undefined ||
      search.q !== undefined ||
      search.state !== undefined ||
      search.sort !== undefined
    )
      return;
    try {
      const raw = window.localStorage.getItem(ROOM_FILTER_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        ws?: string;
        q?: string;
        state?: RoomFilterState;
        sort?: "asc" | "desc";
      };
      if (!saved || (!saved.ws && !saved.q && !saved.state && !saved.sort)) return;
      setRestoredFilter(saved);
      void navigate({
        to: "/meeting",
        search: {
          ...search,
          ws: saved.ws,
          q: saved.q,
          state: saved.state === "all" ? undefined : saved.state,
          sort: saved.sort === "asc" ? undefined : saved.sort,
          page: 1,
        },
        replace: true,
      });
    } catch {
      /* bỏ qua dữ liệu hỏng */
    }
    // chỉ chạy một lần khi vào trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Workspace đang xem: ưu tiên tham số URL, mặc định workspace đầu tiên.
  const activeWs = search.ws ?? restoredFilter?.ws ?? workspaces.data?.[0]?.id;
  const roomQuery = search.q ?? restoredFilter?.q ?? "";
  const currentPage = search.page ?? 1;
  const roomState: RoomFilterState = search.state ?? restoredFilter?.state ?? "all";
  const sortStartAt: "asc" | "desc" = search.sort ?? "asc";

  // Bộ lọc khoảng ngày (yyyy-mm-dd) — khi bật sẽ truy vấn qua listMeetings.
  const dateFrom = search.from;
  const dateTo = search.to;
  const rangeActive = !!(dateFrom || dateTo);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        ROOM_FILTER_KEY,
        JSON.stringify({ ws: activeWs, q: roomQuery, state: roomState, sort: sortStartAt }),
      );
    } catch {
      /* storage không khả dụng */
    }
  }, [activeWs, roomQuery, roomState, sortStartAt]);

  const setRoomFilter = (next: {
    ws?: string;
    q?: string;
    page?: number;
    state?: RoomFilterState;
    from?: string;
    to?: string;
    sort?: "asc" | "desc";
  }) => {
    setRestoredFilter(null);
    const effectiveState = next.state ?? roomState;
    const effectiveSort = next.sort ?? sortStartAt;
    const { state: _ignored, sort: _ignoredSort, from: nextFrom, to: nextTo, ...rest } = next;
    void navigate({
      to: "/meeting",
      search: {
        ...search,
        ws: activeWs,
        q: roomQuery,
        from: nextFrom !== undefined ? nextFrom || undefined : dateFrom,
        to: nextTo !== undefined ? nextTo || undefined : dateTo,
        ...rest,
        state: effectiveState === "all" ? undefined : effectiveState,
        sort: effectiveSort === "asc" ? undefined : effectiveSort,
      },
      replace: true,
    });
  };

  // Ô tìm kiếm: gõ vào bản nháp, 300ms sau khi ngừng gõ mới ghi vào URL (tránh gọi server mỗi phím).
  const [queryDraft, setQueryDraft] = useState(roomQuery);
  const committedQueryRef = useRef(roomQuery);
  useEffect(() => {
    if (roomQuery === committedQueryRef.current) return;
    committedQueryRef.current = roomQuery;
    setQueryDraft(roomQuery);
  }, [roomQuery]);
  useEffect(() => {
    if (queryDraft === committedQueryRef.current) return;
    const timer = window.setTimeout(() => {
      committedQueryRef.current = queryDraft;
      setRoomFilter({ q: queryDraft, page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDraft]);

  const filtersActive = !!roomQuery || roomState !== "all" || rangeActive;
  const clearFilters = () => {
    committedQueryRef.current = "";
    setQueryDraft("");
    setRoomFilter({ q: "", state: "all", from: "", to: "", page: 1 });
  };

  const rooms = useQuery({
    queryKey: ["meeting-rooms", activeWs ?? null, roomQuery, roomState, sortStartAt, currentPage],
    enabled: !!activeWs && !rangeActive,
    placeholderData: keepPreviousData,
    queryFn: () =>
      listMyMeetingRooms({
        data: {
          workspaceId: activeWs,
          search: roomQuery || undefined,
          state: roomState,
          sort: sortStartAt,
          limit: ROOM_PAGE_SIZE,
          offset: (currentPage - 1) * ROOM_PAGE_SIZE,
        },
      }),
  });

  const rangeQuery = useQuery({
    queryKey: ["meetings-range", activeWs ?? null, dateFrom ?? null, dateTo ?? null, sortStartAt],
    enabled: !!activeWs && rangeActive,
    placeholderData: keepPreviousData,
    queryFn: () =>
      listMeetings({
        data: {
          workspaceId: activeWs as string,
          ...(dateFrom ? { from: new Date(`${dateFrom}T00:00:00`).toISOString() } : {}),
          ...(dateTo ? { to: new Date(`${dateTo}T23:59:59.999`).toISOString() } : {}),
          sort: sortStartAt,
          limit: 200,
        },
      }),
  });

  // Khi lọc theo ngày: lọc thêm từ khóa/trạng thái và phân trang phía client.
  const rangeFiltered = useMemo<ListRoom[]>(() => {
    if (!rangeActive) return [];
    const now = Date.now();
    const rows = (rangeQuery.data ?? []) as unknown as ListRoom[];
    return rows.filter((r) => {
      if (roomQuery && !r.title?.toLowerCase().includes(roomQuery.toLowerCase())) return false;
      if (roomState === "live") return r.status === "live";
      if (roomState === "upcoming")
        return r.status === "scheduled" && new Date(r.start_at).getTime() > now;
      if (roomState === "ended") return r.status === "ended" || r.status === "canceled";
      return true;
    });
  }, [rangeActive, rangeQuery.data, roomQuery, roomState]);

  const activeListQuery = rangeActive ? rangeQuery : rooms;
  const listItems: ListRoom[] = rangeActive
    ? rangeFiltered.slice((currentPage - 1) * ROOM_PAGE_SIZE, currentPage * ROOM_PAGE_SIZE)
    : ((rooms.data?.items ?? []) as ListRoom[]);
  const listTotal = rangeActive ? rangeFiltered.length : (rooms.data?.total ?? 0);
  const listLoading = activeListQuery.isLoading || (!activeWs && workspaces.isLoading);
  const listFetching = activeListQuery.isFetching;
  const listError = activeListQuery.isError;

  // Panel "Sắp diễn ra": luôn lấy dữ liệu thật, độc lập với bộ lọc đang chọn.
  useMeetingsRealtime(activeWs ?? null);
  const upcomingPanel = useQuery({
    queryKey: ["meeting-rooms", "upcoming-panel", activeWs ?? null],
    enabled: !!activeWs,
    queryFn: () =>
      listMyMeetingRooms({
        data: {
          workspaceId: activeWs as string,
          state: "upcoming",
          sort: "asc",
          limit: 3,
          offset: 0,
        },
      }),
  });
  const upcomingItems = (upcomingPanel.data?.items ?? []) as unknown as ListRoom[];

  // Thống kê thật qua RPC (kiểm tra quyền thành viên phía server).
  const statsQuery = useQuery({
    queryKey: ["meeting-stats", activeWs ?? null],
    enabled: !!activeWs,
    staleTime: 30_000,
    queryFn: () => getWorkspaceMeetingStats({ data: { workspaceId: activeWs as string } }),
  });
  const stats = statsQuery.data;
  const statValue = (n: number | undefined) => (n === undefined ? "–" : String(n));

  // Phân quyền: chỉ chủ trì / quản trị tổ chức mới được sửa hoặc hủy buổi họp.
  const idsKey = listItems.map((r) => r.id).join(",");
  const permIds = useMemo(
    () =>
      Array.from(new Set(idsKey ? idsKey.split(",") : []))
        .sort()
        .slice(0, 100),
    [idsKey],
  );
  const permsQuery = useQuery({
    queryKey: ["meeting-manage-perms", permIds],
    enabled: permIds.length > 0,
    staleTime: 60_000,
    queryFn: () => getMeetingManagePermissions({ data: { meetingIds: permIds } }),
  });
  const canManageMeeting = (id: string) => permsQuery.data?.[id] === true;

  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; title: string } | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schTitle, setSchTitle] = useState("");
  const [schStart, setSchStart] = useState("");
  const [schEnd, setSchEnd] = useState("");
  const [schAgenda, setSchAgenda] = useState("");
  const schRangeInvalid = isRangeInvalid(schStart, schEnd);

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const joinToken = extractInviteToken(joinCode);

  const [editRoom, setEditRoom] = useState<ListRoom | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const editRangeInvalid = isRangeInvalid(editStart, editEnd);

  const [cancelRoom, setCancelRoom] = useState<ListRoom | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const reasonLength = cancelReason.trim().length;

  const openSchedule = () => {
    const start = new Date(Date.now() + 30 * 60000);
    const end = new Date(start.getTime() + 30 * 60000);
    setSchStart(toLocalInput(start));
    setSchEnd(toLocalInput(end));
    setScheduleOpen(true);
  };

  const openEdit = (r: ListRoom) => {
    setEditRoom(r);
    setEditTitle(r.title);
    setEditStart(r.start_at ? toLocalInput(new Date(r.start_at)) : "");
    setEditEnd(r.end_at ? toLocalInput(new Date(r.end_at)) : "");
  };

  const openCancel = (r: ListRoom) => {
    setCancelRoom(r);
    setCancelReason("");
  };
  const closeCancel = () => {
    setCancelRoom(null);
    setCancelReason("");
  };

  const createRoom = useMutation({
    mutationFn: (vars?: { title?: string; startAt?: string; durationMinutes?: number }) =>
      createInstantMeeting({
        data: {
          ...(activeWs ? { workspaceId: activeWs } : {}),
          ...(vars?.title ? { title: vars.title } : {}),
          ...(vars?.startAt ? { startAt: vars.startAt } : {}),
          ...(vars?.durationMinutes ? { durationMinutes: vars.durationMinutes } : {}),
        },
      }),
    onSuccess: (m) => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-rooms"] });
      setCreated({ id: m.id, title: m.title });
    },
    onError: () => toast.error(t("mtg.create.error")),
  });

  const updateRoom = useMutation({
    mutationFn: () =>
      updateMeeting({
        data: {
          idempotencyKey: crypto.randomUUID(),
          meetingId: editRoom!.id,
          title: editTitle.trim(),
          ...(editStart ? { startAt: new Date(editStart).toISOString() } : {}),
          ...(editEnd ? { endAt: new Date(editEnd).toISOString() } : {}),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["meetings-range"] });
      setEditRoom(null);
      toast.success(t("mtg.edit.success"));
    },
    onError: () => toast.error(t("mtg.edit.error")),
  });

  const scheduleMutation = useMutation({
    mutationFn: () =>
      scheduleMeeting({
        data: {
          idempotencyKey: crypto.randomUUID(),
          workspaceId: activeWs as string,
          title: schTitle.trim(),
          startAt: new Date(schStart).toISOString(),
          endAt: new Date(schEnd).toISOString(),
          ...(schAgenda.trim() ? { agenda: schAgenda.trim() } : {}),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["meetings-range"] });
      setScheduleOpen(false);
      setSchTitle("");
      setSchStart("");
      setSchEnd("");
      setSchAgenda("");
      toast.success(t("mtg.sch.success"));
    },
    onError: () => toast.error(t("mtg.sch.error")),
  });
  const canSubmitSchedule =
    !scheduleMutation.isPending &&
    !!activeWs &&
    !!schTitle.trim() &&
    !!schStart &&
    !!schEnd &&
    !schRangeInvalid;

  const joinByCode = useMutation({
    mutationFn: () => redeemMeetingInviteLink({ data: { token: joinToken } }),
    onSuccess: (res) => {
      if ((res.status === "joined" || res.status === "already") && res.meetingId) {
        setJoinOpen(false);
        setJoinCode("");
        void navigate({ to: "/meeting/$id", params: { id: res.meetingId } });
        return;
      }
      const msg: Record<string, Key> = {
        expired: "mtg.join.expired",
        exhausted: "mtg.join.exhausted",
        revoked: "mtg.join.revoked",
        invalid: "mtg.join.invalid",
      };
      toast.error(t(msg[res.status] ?? "mtg.join.error"));
    },
    onError: () => toast.error(t("mtg.join.error")),
  });
  const canSubmitJoin = !joinByCode.isPending && joinToken.length >= 10;

  const cancelRoomMutation = useMutation({
    mutationFn: () =>
      cancelMeeting({
        data: {
          idempotencyKey: crypto.randomUUID(),
          meetingId: cancelRoom!.id,
          reason: cancelReason.trim(),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["meetings-range"] });
      closeCancel();
      toast.success(t("mtg.cancel.success"));
    },
    onError: (err: unknown) => {
      const msg = String((err as { message?: string })?.message ?? "");
      if (msg.includes("42501") || /denied|permission|FORBIDDEN/i.test(msg)) {
        toast.error(t("mtg.perm.denyManage"));
      } else if (/MEETING_NOT_FOUND/.test(msg)) {
        toast.error(t("mtg.cancel.notFound"));
      } else {
        toast.error(t("mtg.cancel.error"));
      }
    },
  });
  const canConfirmCancel =
    !cancelRoomMutation.isPending &&
    reasonLength >= 5 &&
    !!cancelRoom &&
    canManageMeeting(cancelRoom.id);

  const emptyMessage = rangeActive
    ? t("mtg.empty.range")
    : roomQuery
      ? t("mtg.empty.query")
      : roomState === "live"
        ? t("mtg.empty.live")
        : roomState === "upcoming"
          ? t("mtg.empty.upcoming")
          : roomState === "ended"
            ? t("mtg.empty.ended")
            : t("mtg.empty.none");

  const workspaceCount = workspaces.data?.length ?? 0;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="meetings" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          variant="documents"
          onOpenSidebar={() => setOpen(true)}
          onNew={() => setCreateOpen(true)}
        />

        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-border px-4 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold">{t("mtg.home.title")}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">{t("mtg.home.desc")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => setCreateOpen(true)} disabled={createRoom.isPending}>
                    {createRoom.isPending ? <Loader2 className="animate-spin" /> : <VideoIcon />}
                    {t("mtg.home.startNow")}
                  </Button>
                  <Button variant="outline" onClick={openSchedule} disabled={!activeWs}>
                    <Calendar /> {t("mtg.home.schedule")}
                  </Button>
                  <Button variant="outline" onClick={() => setJoinOpen(true)}>
                    <Link2 /> {t("mtg.home.joinByCode")}
                  </Button>
                  <Button variant="ghost" asChild>
                    <Link to="/meeting/history">
                      <Clock /> {t("mtg.home.history")}
                    </Link>
                  </Button>
                </div>
              </div>

              <dl
                aria-label={t("mtg.stats.label")}
                aria-busy={statsQuery.isLoading}
                className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm"
              >
                <StatItem label={t("mtg.stats.today")} value={statValue(stats?.today)} />
                <StatItem
                  label={t("mtg.stats.live")}
                  value={statValue(stats?.live)}
                  live={(stats?.live ?? 0) > 0}
                />
                <StatItem label={t("mtg.stats.recordings")} value={statValue(stats?.recordings)} />
                <StatItem label={t("mtg.stats.summaries")} value={statValue(stats?.summaries)} />
              </dl>
            </div>

            {/* Một thanh công cụ duy nhất cho mọi bộ lọc */}
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-3 sm:px-6">
              <div
                role="group"
                aria-label={t("mtg.filter.stateLabel")}
                className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1"
              >
                {STATE_FILTERS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={roomState === s.key}
                    onClick={() => setRoomFilter({ state: s.key, page: 1 })}
                    className={`h-8 shrink-0 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      roomState === s.key
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t(s.label)}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={queryDraft}
                  onChange={(e) => setQueryDraft(e.target.value)}
                  placeholder={t("mtg.filter.search")}
                  aria-label={t("mtg.filter.search")}
                  className="h-9 pl-9"
                />
              </div>

              {workspaceCount > 1 && (
                <Select
                  value={activeWs ?? ""}
                  onValueChange={(v) => setRoomFilter({ ws: v, page: 1 })}
                >
                  <SelectTrigger
                    className="h-9 w-auto min-w-[10rem]"
                    aria-label={t("mtg.filter.workspace")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.data!.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={dateFrom ?? ""}
                  max={dateTo ?? undefined}
                  onChange={(e) => setRoomFilter({ from: e.target.value, page: 1 })}
                  aria-label={t("mtg.filter.from")}
                  className="h-9 w-auto"
                />
                <span className="text-muted-foreground" aria-hidden="true">
                  –
                </span>
                <Input
                  type="date"
                  value={dateTo ?? ""}
                  min={dateFrom ?? undefined}
                  onChange={(e) => setRoomFilter({ to: e.target.value, page: 1 })}
                  aria-label={t("mtg.filter.to")}
                  className="h-9 w-auto"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-9"
                title={t("mtg.filter.sortLabel")}
                onClick={() =>
                  setRoomFilter({ sort: sortStartAt === "asc" ? "desc" : "asc", page: 1 })
                }
              >
                <ArrowUpDown />
                {sortStartAt === "asc" ? t("mtg.filter.sortAsc") : t("mtg.filter.sortDesc")}
              </Button>

              {filtersActive && (
                <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
                  <X /> {t("mtg.filter.clear")}
                </Button>
              )}
            </div>

            <div className="px-4 py-5 sm:px-6">
              {listLoading ? (
                <ul className="space-y-2" aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <li key={i}>
                      <Skeleton className="h-[74px] rounded-xl" />
                    </li>
                  ))}
                </ul>
              ) : listError ? (
                <div className="rounded-xl border border-border p-8 text-center">
                  <p className="text-sm text-foreground">{t("mtg.loadError")}</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => void activeListQuery.refetch()}
                  >
                    {t("mtg.retry")}
                  </Button>
                </div>
              ) : listItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-10 text-center">
                  <p className="mx-auto max-w-md text-sm text-muted-foreground">{emptyMessage}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {filtersActive ? (
                      <Button variant="outline" onClick={clearFilters}>
                        <X /> {t("mtg.filter.clear")}
                      </Button>
                    ) : (
                      <>
                        <Button onClick={() => setCreateOpen(true)}>
                          <VideoIcon /> {t("mtg.home.startNow")}
                        </Button>
                        <Button variant="outline" onClick={openSchedule} disabled={!activeWs}>
                          <Calendar /> {t("mtg.home.schedule")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <ul className="space-y-2">
                    {listItems.map((m) => (
                      <MeetingRow
                        key={m.id}
                        meeting={m}
                        canManage={canManageMeeting(m.id)}
                        permsLoading={permsQuery.isLoading}
                        onEdit={() => openEdit(m)}
                        onCancel={() => openCancel(m)}
                      />
                    ))}
                  </ul>
                  {listTotal > ROOM_PAGE_SIZE && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">
                        {fmt(t("mtg.list.page"), {
                          page: currentPage,
                          from: (currentPage - 1) * ROOM_PAGE_SIZE + 1,
                          to: Math.min(currentPage * ROOM_PAGE_SIZE, listTotal),
                          total: listTotal,
                        })}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRoomFilter({ page: currentPage - 1 })}
                          disabled={currentPage <= 1 || listFetching}
                        >
                          {t("mtg.prev")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRoomFilter({ page: currentPage + 1 })}
                          disabled={currentPage * ROOM_PAGE_SIZE >= listTotal || listFetching}
                        >
                          {t("mtg.next")}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <aside className="hidden w-[340px] shrink-0 flex-col border-l border-border bg-surface xl:flex">
            <MiniCalendar workspaceId={activeWs} />
            <div className="border-t border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{t("mtg.upcoming.title")}</h2>
                <Link to="/calendar" className="text-xs text-primary hover:underline">
                  {t("mtg.upcoming.all")}
                </Link>
              </div>
              <div className="space-y-2">
                {upcomingPanel.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("mtg.loading")}
                  </div>
                ) : upcomingItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("mtg.upcoming.empty")}</p>
                ) : (
                  upcomingItems.slice(0, 3).map((m) => (
                    <Link
                      key={m.id}
                      to="/meeting/$id"
                      params={{ id: m.id }}
                      className="block w-full rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 truncate text-sm font-medium">{m.title}</div>
                        <RoomStatusChip state={resolveRoomState(m.status, m.start_at, m.end_at)} />
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatRange(m.start_at, m.end_at, locale, t)}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>

      {createOpen ? (
        <QuickRoomDialog
          pending={createRoom.isPending}
          created={created}
          onEnter={() => {
            if (!created) return;
            const id = created.id;
            setCreateOpen(false);
            setCreated(null);
            void navigate({ to: "/meeting/$id", params: { id } });
          }}
          onClose={() => {
            setCreateOpen(false);
            setCreated(null);
          }}
          onSubmit={(v) => createRoom.mutate(v)}
        />
      ) : null}

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("mtg.sch.title")}</DialogTitle>
            <DialogDescription>{t("mtg.sch.desc")}</DialogDescription>
          </DialogHeader>
          <form
            id="schedule-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmitSchedule) scheduleMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="sch-title">{t("mtg.form.title")}</Label>
              <Input
                id="sch-title"
                value={schTitle}
                onChange={(e) => setSchTitle(e.target.value)}
                placeholder={t("mtg.sch.titlePlaceholder")}
                maxLength={500}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sch-start">{t("mtg.form.start")}</Label>
                <Input
                  id="sch-start"
                  type="datetime-local"
                  value={schStart}
                  onChange={(e) => setSchStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sch-end">{t("mtg.form.end")}</Label>
                <Input
                  id="sch-end"
                  type="datetime-local"
                  value={schEnd}
                  min={schStart || undefined}
                  onChange={(e) => setSchEnd(e.target.value)}
                  aria-invalid={schRangeInvalid}
                  aria-describedby={schRangeInvalid ? "sch-range-error" : undefined}
                  required
                />
              </div>
            </div>
            {schRangeInvalid && (
              <p id="sch-range-error" role="alert" className="text-xs text-destructive">
                {t("mtg.form.rangeInvalid")}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="sch-agenda">{t("mtg.sch.agenda")}</Label>
              <Textarea
                id="sch-agenda"
                rows={3}
                value={schAgenda}
                onChange={(e) => setSchAgenda(e.target.value)}
                placeholder={t("mtg.sch.agendaPlaceholder")}
                maxLength={10000}
              />
            </div>
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setScheduleOpen(false)}>
              {t("mtg.close")}
            </Button>
            <Button type="submit" form="schedule-form" disabled={!canSubmitSchedule}>
              {scheduleMutation.isPending ? t("mtg.saving") : t("mtg.sch.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("mtg.join.title")}</DialogTitle>
            <DialogDescription>{t("mtg.join.desc")}</DialogDescription>
          </DialogHeader>
          <form
            id="join-form"
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmitJoin) joinByCode.mutate();
            }}
          >
            <Label htmlFor="join-code">{t("mtg.join.label")}</Label>
            <Input
              id="join-code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder={t("mtg.join.placeholder")}
              autoComplete="off"
            />
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setJoinOpen(false)}>
              {t("mtg.close")}
            </Button>
            <Button type="submit" form="join-form" disabled={!canSubmitJoin}>
              {joinByCode.isPending ? t("mtg.join.checking") : t("mtg.join.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRoom} onOpenChange={(o) => !o && setEditRoom(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("mtg.edit.title")}</DialogTitle>
            <DialogDescription>{t("mtg.edit.desc")}</DialogDescription>
          </DialogHeader>
          <form
            id="edit-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!updateRoom.isPending && editTitle.trim() && !editRangeInvalid)
                updateRoom.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">{t("mtg.form.title")}</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={500}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-start">{t("mtg.form.start")}</Label>
                <Input
                  id="edit-start"
                  type="datetime-local"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-end">{t("mtg.form.end")}</Label>
                <Input
                  id="edit-end"
                  type="datetime-local"
                  value={editEnd}
                  min={editStart || undefined}
                  onChange={(e) => setEditEnd(e.target.value)}
                  aria-invalid={editRangeInvalid}
                  aria-describedby={editRangeInvalid ? "edit-range-error" : undefined}
                />
              </div>
            </div>
            {editRangeInvalid && (
              <p id="edit-range-error" role="alert" className="text-xs text-destructive">
                {t("mtg.form.rangeInvalid")}
              </p>
            )}
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRoom(null)}>
              {t("mtg.close")}
            </Button>
            <Button
              type="submit"
              form="edit-form"
              disabled={updateRoom.isPending || !editTitle.trim() || editRangeInvalid}
            >
              {updateRoom.isPending ? t("mtg.saving") : t("mtg.edit.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!cancelRoom}
        onOpenChange={(o) => {
          if (!o && !cancelRoomMutation.isPending) closeCancel();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("mtg.cancel.title")}</DialogTitle>
            <DialogDescription>
              {cancelRoom ? fmt(t("mtg.cancel.desc"), { title: cancelRoom.title }) : ""}
            </DialogDescription>
          </DialogHeader>
          <form
            id="cancel-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (canConfirmCancel) cancelRoomMutation.mutate();
            }}
          >
            {cancelRoom && permsQuery.isSuccess && !canManageMeeting(cancelRoom.id) && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {t("mtg.perm.denyManage")}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">
                {t("mtg.cancel.reason")}{" "}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              </Label>
              <Input
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t("mtg.cancel.reasonPlaceholder")}
                maxLength={1000}
                required
                aria-invalid={reasonLength > 0 && reasonLength < 5}
                aria-describedby="cancel-reason-hint"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(
                  [
                    "mtg.cancel.preset.postpone",
                    "mtg.cancel.preset.attendance",
                    "mtg.cancel.preset.conflict",
                    "mtg.cancel.preset.notNeeded",
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCancelReason(t(preset))}
                    className="h-8 rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t(preset)}
                  </button>
                ))}
              </div>
              <p
                id="cancel-reason-hint"
                className={`text-xs ${reasonLength > 0 && reasonLength < 5 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {t("mtg.cancel.reasonHint")}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{t("mtg.cancel.irreversible")}</p>
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeCancel}
              disabled={cancelRoomMutation.isPending}
            >
              {t("mtg.back")}
            </Button>
            <Button
              type="submit"
              form="cancel-form"
              variant="destructive"
              disabled={!canConfirmCancel}
            >
              {cancelRoomMutation.isPending ? t("mtg.cancel.pending") : t("mtg.cancel.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatItem({ label, value, live }: { label: string; value: string; live?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5 font-semibold tabular-nums text-foreground">
        {live && (
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive"
            aria-hidden="true"
          />
        )}
        {value}
      </dd>
    </div>
  );
}

function MeetingRow({
  meeting: m,
  canManage,
  permsLoading,
  onEdit,
  onCancel,
}: {
  meeting: ListRoom;
  canManage: boolean;
  permsLoading: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { t, lang } = useI18n();
  const state = resolveRoomState(m.status, m.start_at, m.end_at);
  const isLive = state === "live";
  const finished = state === "ended" || state === "canceled" || state === "overdue";
  const isScheduled = m.status === "scheduled";

  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border bg-surface p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center ${
        isLive ? "border-destructive/40" : "border-border"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            isLive
              ? "bg-destructive/12 text-destructive"
              : finished
                ? "bg-surface-2 text-muted-foreground"
                : "bg-primary/10 text-primary"
          }`}
        >
          {isLive ? (
            <Circle className="h-4 w-4 fill-current" />
          ) : state === "overdue" || state === "canceled" ? (
            <CalendarX2 className="h-5 w-5" />
          ) : finished ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <VideoIcon className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to="/meeting/$id"
              params={{ id: m.id }}
              className="block max-w-full truncate rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {m.title}
            </Link>
            <RoomStatusChip state={state} />
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            {formatRange(m.start_at, m.end_at, localeTag(lang), t)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:shrink-0">
        <Button
          asChild
          size="sm"
          variant={finished ? "outline" : "default"}
          className="flex-1 sm:flex-none"
        >
          <Link to="/meeting/$id" params={{ id: m.id }}>
            <ArrowUpRight />
            {isLive ? t("mtg.row.join") : finished ? t("mtg.row.view") : t("mtg.row.enter")}
          </Link>
        </Button>
        {isScheduled && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-8 px-0"
                aria-label={fmt(t("mtg.row.more"), { title: m.title })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem disabled={!canManage} onSelect={onEdit}>
                <Pencil className="mr-2 h-4 w-4" /> {t("mtg.row.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canManage}
                onSelect={onCancel}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="mr-2 h-4 w-4" /> {t("mtg.row.cancel")}
              </DropdownMenuItem>
              {!canManage && (
                <>
                  <DropdownMenuSeparator />
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    {permsLoading ? t("mtg.row.permLoading") : t("mtg.perm.denyManage")}
                  </p>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

type InviteState = "pending" | "sending" | "invited" | "already" | "not_found" | "failed";
type InviteResult = { email: string; state: InviteState; detail?: string };
type InvitedParticipant = {
  userId: string;
  role: string;
  rsvp: string;
  rsvpAt: string | null;
  invitedAt: string;
  name: string | null;
  email: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const DURATIONS = [15, 30, 45, 60, 90, 120];
const EXPIRY_OPTIONS: { value: string; label: Key }[] = [
  { value: "60", label: "mtg.qr.exp.1h" },
  { value: "360", label: "mtg.qr.exp.6h" },
  { value: "1440", label: "mtg.qr.exp.1d" },
  { value: "10080", label: "mtg.qr.exp.7d" },
  { value: "43200", label: "mtg.qr.exp.30d" },
  { value: "never", label: "mtg.qr.unlimited" },
];
const USE_OPTIONS = ["1", "5", "10", "50", "unlimited"];
const RSVP_KEY: Record<string, Key> = {
  accepted: "mtg.rsvp.accepted",
  declined: "mtg.rsvp.declined",
  tentative: "mtg.rsvp.tentative",
  pending: "mtg.rsvp.pending",
};
const RSVP_TONE: Record<string, string> = {
  accepted: "text-success",
  declined: "text-destructive",
  tentative: "text-foreground",
  pending: "text-muted-foreground",
};

function QuickRoomDialog({
  pending,
  created,
  onClose,
  onEnter,
  onSubmit,
}: {
  pending: boolean;
  created: { id: string; title: string } | null;
  onClose: () => void;
  onEnter: () => void;
  onSubmit: (v: { title?: string; startAt?: string; durationMinutes?: number }) => void;
}) {
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const [title, setTitle] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() + 15 * 60_000)));
  const [duration, setDuration] = useState(60);
  const [invitees, setInvitees] = useState("");
  const [inviteResults, setInviteResults] = useState<InviteResult[] | null>(null);
  const [inviteRunning, setInviteRunning] = useState(false);
  const [participants, setParticipants] = useState<InvitedParticipant[] | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  const refreshParticipants = useCallback(async () => {
    if (!created) return;
    setLoadingParticipants(true);
    try {
      const rows = await listMeetingParticipants({ data: { meetingId: created.id } });
      setParticipants(rows as InvitedParticipant[]);
    } catch {
      toast.error(t("mtg.qr.participantsError"));
    } finally {
      setLoadingParticipants(false);
    }
  }, [created, t]);

  useEffect(() => {
    if (created) void refreshParticipants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created]);

  const inviteDone = (inviteResults ?? []).filter(
    (r) => r.state !== "pending" && r.state !== "sending",
  ).length;
  // Người chưa thực sự nhận được lời mời trong hệ thống → gợi ý gửi email link.
  const mailable = (inviteResults ?? [])
    .filter((r) => r.state === "not_found" || r.state === "failed")
    .map((r) => r.email);

  // Phân tích danh sách email: kiểm tra định dạng + phát hiện trùng lặp.
  const parsedInvitees = useMemo(() => {
    const raw = invitees
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const valid: string[] = [];
    const invalid: string[] = [];
    const duplicates: string[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      if (!EMAIL_RE.test(item)) {
        if (!invalid.includes(item)) invalid.push(item);
        continue;
      }
      const key = item.toLowerCase();
      if (seen.has(key)) {
        if (!duplicates.includes(key)) duplicates.push(key);
        continue;
      }
      seen.add(key);
      valid.push(item);
    }
    return { valid, invalid, duplicates };
  }, [invitees]);

  const inviteLink =
    created && typeof window !== "undefined"
      ? `${window.location.origin}/meeting/${created.id}`
      : "";

  // Link mời có kiểm soát: thời hạn + số lượt sử dụng.
  const [linkExpiry, setLinkExpiry] = useState<string>("1440");
  const [linkUses, setLinkUses] = useState<string>("unlimited");
  const [controlledLink, setControlledLink] = useState<{
    url: string;
    expiresAt: string | null;
    maxUses: number | null;
  } | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const shareLink = controlledLink?.url ?? inviteLink;

  const generateControlledLink = async () => {
    if (!created) return;
    setCreatingLink(true);
    try {
      const res = await createMeetingInviteLink({
        data: {
          meetingId: created.id,
          expiresInMinutes: linkExpiry === "never" ? null : Number(linkExpiry),
          maxUses: linkUses === "unlimited" ? null : Number(linkUses),
        },
      });
      setControlledLink({
        url: `${window.location.origin}/meeting/${created.id}?invite=${res.token}`,
        expiresAt: res.expiresAt,
        maxUses: res.maxUses,
      });
      toast.success(t("mtg.qr.linkCreated"));
    } catch {
      toast.error(t("mtg.qr.linkError"));
    } finally {
      setCreatingLink(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast.success(t("mtg.qr.copied"));
    } catch {
      toast.error(t("mtg.qr.copyError"));
    }
  };

  const sendInvites = async () => {
    const { valid, invalid, duplicates } = parsedInvitees;
    if (invalid.length) {
      toast.error(fmt(t("mtg.qr.errInvalid"), { list: invalid.join(", ") }));
      return;
    }
    if (!valid.length) {
      toast.error(t("mtg.qr.errNone"));
      return;
    }
    if (duplicates.length) {
      toast.warning(fmt(t("mtg.qr.warnDup"), { n: duplicates.length }));
    }
    if (!created) return;

    setInviteRunning(true);
    setInviteResults(valid.map((email) => ({ email, state: "pending" as const })));

    for (let i = 0; i < valid.length; i++) {
      const email = valid[i]!;
      setInviteResults((prev) =>
        (prev ?? []).map((r, idx) => (idx === i ? { ...r, state: "sending" } : r)),
      );
      try {
        const res = await inviteMeetingParticipant({
          data: { meetingId: created.id, email },
        });
        setInviteResults((prev) =>
          (prev ?? []).map((r, idx) =>
            idx === i ? { ...r, state: res.status as InviteState } : r,
          ),
        );
      } catch (err) {
        setInviteResults((prev) =>
          (prev ?? []).map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  state: "failed",
                  detail: err instanceof Error ? err.message : t("mtg.qr.unknownError"),
                }
              : r,
          ),
        );
      }
    }
    setInviteRunning(false);
    void refreshParticipants();
  };

  const mailtoFallback = (emails: string[]) => {
    const subject = encodeURIComponent(
      fmt(t("mtg.qr.mailSubject"), { title: created?.title ?? "" }),
    );
    const body = encodeURIComponent(
      fmt(t("mtg.qr.mailBody"), { title: created?.title ?? "", link: shareLink }),
    );
    window.location.href = `mailto:${emails.join(",")}?subject=${subject}&body=${body}`;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title: title.trim() || undefined,
      startAt: startNow ? undefined : new Date(startAt).toISOString(),
      durationMinutes: duration,
    });
  };

  const STATE_VIEW: Record<InviteState, { icon?: React.ReactNode; label: Key; tone: string }> = {
    pending: { label: "mtg.qr.st.pending", tone: "text-muted-foreground" },
    sending: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
      label: "mtg.qr.st.sending",
      tone: "text-muted-foreground",
    },
    invited: {
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
      label: "mtg.qr.st.invited",
      tone: "text-success",
    },
    already: {
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />,
      label: "mtg.qr.st.already",
      tone: "text-muted-foreground",
    },
    not_found: {
      icon: <MailQuestion className="h-3.5 w-3.5 text-warning" />,
      label: "mtg.qr.st.notFound",
      tone: "text-foreground",
    },
    failed: {
      icon: <XCircle className="h-3.5 w-3.5 text-destructive" />,
      label: "mtg.qr.st.failed",
      tone: "text-destructive",
    },
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("mtg.qr.createdTitle")}</DialogTitle>
              <DialogDescription className="truncate">{created.title}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="qr-link">{t("mtg.qr.link")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="qr-link"
                    readOnly
                    value={shareLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1"
                  />
                  <Button type="button" variant="outline" onClick={() => void copyLink()}>
                    <Copy /> {t("mtg.qr.copy")}
                  </Button>
                </div>
              </div>

              <fieldset className="space-y-2 rounded-lg border border-border p-3">
                <legend className="px-1 text-xs font-medium">{t("mtg.qr.linkControl")}</legend>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="qr-expiry" className="text-xs text-muted-foreground">
                      {t("mtg.qr.expiry")}
                    </Label>
                    <Select value={linkExpiry} onValueChange={setLinkExpiry}>
                      <SelectTrigger id="qr-expiry" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPIRY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {t(o.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="qr-uses" className="text-xs text-muted-foreground">
                      {t("mtg.qr.usesLabel")}
                    </Label>
                    <Select value={linkUses} onValueChange={setLinkUses}>
                      <SelectTrigger id="qr-uses" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {USE_OPTIONS.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v === "unlimited"
                              ? t("mtg.qr.unlimited")
                              : fmt(t("mtg.qr.uses"), { n: v })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={creatingLink}
                  onClick={() => void generateControlledLink()}
                >
                  {creatingLink ? t("mtg.qr.linkCreating") : t("mtg.qr.linkCreate")}
                </Button>
                {controlledLink && (
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {fmt(t("mtg.qr.currentLink"), {
                      expiry: controlledLink.expiresAt
                        ? fmt(t("mtg.qr.expiresAt"), {
                            date: new Date(controlledLink.expiresAt).toLocaleString(locale),
                          })
                        : t("mtg.qr.noExpiry"),
                      uses: controlledLink.maxUses
                        ? fmt(t("mtg.qr.maxUses"), { n: controlledLink.maxUses })
                        : t("mtg.qr.unlimitedUses"),
                    })}
                  </p>
                )}
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor="qr-invitees">{t("mtg.qr.invitees")}</Label>
                <Textarea
                  id="qr-invitees"
                  rows={3}
                  value={invitees}
                  onChange={(e) => setInvitees(e.target.value)}
                  placeholder={t("mtg.qr.inviteesPlaceholder")}
                  aria-invalid={parsedInvitees.invalid.length > 0}
                  aria-describedby="qr-invitees-status"
                  className={parsedInvitees.invalid.length ? "border-destructive" : undefined}
                />
                <div id="qr-invitees-status" className="space-y-1 text-xs" aria-live="polite">
                  {invitees.trim() ? (
                    <>
                      <p className="text-muted-foreground">
                        {fmt(t("mtg.qr.validCount"), { n: parsedInvitees.valid.length })}
                      </p>
                      {parsedInvitees.invalid.length > 0 && (
                        <p className="text-destructive">
                          {fmt(t("mtg.qr.invalidList"), {
                            list: parsedInvitees.invalid.join(", "),
                          })}
                        </p>
                      )}
                      {parsedInvitees.duplicates.length > 0 && (
                        <p className="text-foreground">
                          {fmt(t("mtg.qr.dupList"), { list: parsedInvitees.duplicates.join(", ") })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground">{t("mtg.qr.inviteesHint")}</p>
                  )}
                </div>
              </div>

              {inviteResults && (
                <div className="rounded-lg border border-border p-3" aria-live="polite">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {inviteRunning ? t("mtg.qr.sending") : t("mtg.qr.results")}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {inviteDone}/{inviteResults.length}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full origin-left rounded-full bg-primary transition-transform duration-300 ease-out"
                      style={{
                        transform: `scaleX(${inviteResults.length ? inviteDone / inviteResults.length : 0})`,
                      }}
                    />
                  </div>
                  <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto text-xs">
                    {inviteResults.map((r) => {
                      const view = STATE_VIEW[r.state];
                      return (
                        <li key={r.email} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">{r.email}</span>
                          <span className="flex shrink-0 items-center gap-1" title={r.detail}>
                            {view.icon}
                            <span className={view.tone}>{t(view.label)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {!inviteRunning && mailable.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => mailtoFallback(mailable)}
                    >
                      <Mail /> {fmt(t("mtg.qr.mailto"), { n: mailable.length })}
                    </Button>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-medium">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {fmt(t("mtg.qr.invited"), { n: participants?.length ?? 0 })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void refreshParticipants()}
                    disabled={loadingParticipants}
                  >
                    {loadingParticipants ? t("mtg.loading") : t("mtg.qr.refresh")}
                  </Button>
                </div>
                {participants && participants.length > 0 ? (
                  <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto text-xs">
                    {participants.map((p) => (
                      <li key={p.userId} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {p.name ?? p.email ?? p.userId}
                          {p.role === "host" && (
                            <span className="ml-1 text-muted-foreground">· {t("mtg.qr.host")}</span>
                          )}
                        </span>
                        <span
                          className={`shrink-0 ${RSVP_TONE[p.rsvp] ?? "text-muted-foreground"}`}
                        >
                          {t(RSVP_KEY[p.rsvp] ?? "mtg.rsvp.pending")}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {loadingParticipants ? t("mtg.loading") : t("mtg.qr.noInvited")}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {t("mtg.qr.later")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void sendInvites()}
                disabled={
                  inviteRunning ||
                  parsedInvitees.invalid.length > 0 ||
                  parsedInvitees.valid.length === 0
                }
              >
                {inviteRunning ? <Loader2 className="animate-spin" /> : <Send />}
                {inviteRunning ? t("mtg.qr.sendingShort") : t("mtg.qr.sendInvites")}
              </Button>
              <Button type="button" onClick={onEnter}>
                <VideoIcon /> {t("mtg.row.enter")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("mtg.qr.title")}</DialogTitle>
              <DialogDescription>{t("mtg.qr.desc")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="qr-title">{t("mtg.qr.name")}</Label>
              <Input
                id="qr-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("mtg.qr.namePlaceholder")}
                maxLength={200}
                autoFocus
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="qr-now"
                checked={startNow}
                onCheckedChange={(v) => setStartNow(v === true)}
              />
              <Label htmlFor="qr-now" className="font-normal">
                {t("mtg.qr.startNow")}
              </Label>
            </div>

            {!startNow && (
              <div className="space-y-1.5">
                <Label htmlFor="qr-start">{t("mtg.qr.startAt")}</Label>
                <Input
                  id="qr-start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="qr-duration">{t("mtg.qr.duration")}</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger id="qr-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {fmt(t("mtg.dur.min"), { m })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("mtg.cancelAction")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Plus />}
                {t("mtg.qr.create")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MiniCalendar({ workspaceId }: { workspaceId?: string }) {
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);

  const monthQuery = useQuery({
    queryKey: ["meetings-month", workspaceId ?? null, monthStart.toISOString()],
    enabled: !!workspaceId,
    placeholderData: keepPreviousData,
    queryFn: () =>
      listMeetings({
        data: {
          workspaceId: workspaceId as string,
          from: monthStart.toISOString(),
          to: monthEnd.toISOString(),
          sort: "asc",
          limit: 200,
        },
      }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, ListRoom[]>();
    for (const r of (monthQuery.data ?? []) as unknown as ListRoom[]) {
      if (!r.start_at) continue;
      const d = new Date(r.start_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return map;
  }, [monthQuery.data]);

  // 01/01/2024 là Thứ 2 — dùng để lấy tên thứ theo ngôn ngữ, tuần bắt đầu từ Thứ 2.
  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "narrow" }),
      ),
    [locale],
  );

  const daysInMonth = monthEnd.getDate();
  const leading = (monthStart.getDay() + 6) % 7;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const dayKey = (d: number) => `${cursor.getFullYear()}-${cursor.getMonth()}-${d}`;
  const isSameMonthAsToday =
    cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth();
  const selectedList = selected ? (byDay.get(selected) ?? []) : [];

  const shiftMonth = (delta: number) => {
    setSelected(null);
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold capitalize">
          {cursor.toLocaleDateString(locale, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-8 px-0"
            aria-label={t("mtg.cal.prev")}
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-8 px-0"
            aria-label={t("mtg.cal.next")}
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div
        className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground"
        aria-hidden="true"
      >
        {weekdays.map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }, (_, i) => (
          <div key={`lead-${i}`} className="aspect-square" />
        ))}
        {days.map((d) => {
          const key = dayKey(d);
          const isToday = isSameMonthAsToday && d === now.getDate();
          const count = byDay.get(key)?.length ?? 0;
          const isSelected = selected === key;
          const dateLabel = new Date(cursor.getFullYear(), cursor.getMonth(), d).toLocaleDateString(
            locale,
            {
              day: "numeric",
              month: "long",
            },
          );
          return (
            <button
              key={d}
              type="button"
              aria-label={fmt(t("mtg.cal.day"), { date: dateLabel, n: count })}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              onClick={() => setSelected(isSelected ? null : key)}
              className={`relative aspect-square rounded-md text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isToday
                  ? "bg-primary font-semibold text-primary-foreground"
                  : isSelected
                    ? "bg-primary/15 text-primary"
                    : "text-foreground hover:bg-surface-2"
              }`}
            >
              {d}
              {count > 0 && (
                <span
                  className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    isToday ? "bg-primary-foreground" : "bg-primary"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {monthQuery.isLoading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> {t("mtg.cal.loading")}
        </div>
      )}

      {selected && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {selectedList.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("mtg.cal.emptyDay")}</p>
          ) : (
            selectedList.map((m) => (
              <Link
                key={m.id}
                to="/meeting/$id"
                params={{ id: m.id }}
                className="block rounded-lg border border-border bg-background p-2.5 transition-colors hover:border-primary/40"
              >
                <div className="truncate text-xs font-medium">{m.title}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatRange(m.start_at, m.end_at, locale, t)}
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
