import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  createInstantMeeting,
  createMeetingInviteLink,
  inviteMeetingParticipant,
  listMyMeetingRooms,
  listMyWorkspaces,
  listMeetingParticipants,
  redeemMeetingInviteLink,
} from "@/lib/api/meeting-rooms.functions";
import {
  cancelMeeting,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ListChecks,
  Users,
  BarChart3,
  Plus,
  Calendar,
  MoreHorizontal,
  Mic,
  MicOff,
  VideoIcon,
  Monitor,
  Hand,
  MessageCircle,
  Sparkles,
  PhoneOff,
  Maximize2,
  Hash,
  Circle,
  Video,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  PlayCircle,
  FileText,
  Download,
  Star,
  ArrowUpRight,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
  Send,
  Paperclip,
  Smile,
  Image as ImageIcon,
  FileSpreadsheet,
  FileArchive,
  UserPlus,
  Crown,
  Pin,
  MoreVertical,
  ShieldCheck,
  Eye,
  XCircle,
  MailQuestion,
  Mail,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { notifyComingSoon } from "@/lib/coming-soon";

export const Route = createFileRoute("/meeting")({
  validateSearch: (search: {
    ws?: string;
    q?: string;
    focus?: "rooms";
    state?: "live" | "upcoming" | "ended";
    page?: number;
    from?: string;
    to?: string;
    sort?: "asc" | "desc";
  } & Partial<Record<string, unknown>>): {
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
      search["state"] === "live" ||
      search["state"] === "upcoming" ||
      search["state"] === "ended"
        ? (search["state"] as "live" | "upcoming" | "ended")
        : undefined,
    page: typeof search["page"] === "string" && /^[1-9]\d*$/.test(search["page"] as string)
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

type RoomChipState = "live" | "upcoming" | "ended";

function resolveRoomState(status: string, startAt?: string, endAt?: string): RoomChipState {
  if (status === "live") return "live";
  if (status === "ended" || status === "canceled") return "ended";
  const now = Date.now();
  if (endAt && new Date(endAt).getTime() < now) return "ended";
  if (startAt && new Date(startAt).getTime() <= now) return "live";
  return "upcoming";
}

const ROOM_CHIP: Record<RoomChipState, { label: string; className: string }> = {
  live: { label: "Đang diễn ra", className: "bg-destructive/15 text-destructive" },
  upcoming: { label: "Sắp diễn ra", className: "bg-primary/10 text-primary" },
  ended: { label: "Đã kết thúc", className: "bg-surface-2 text-muted-foreground" },
};

function RoomStatusChip({
  status,
  startAt,
  endAt,
}: {
  status: string;
  startAt?: string;
  endAt?: string;
}) {
  const state = resolveRoomState(status, startAt, endAt);
  const chip = ROOM_CHIP[state];
  return (
    <span
      className={`ml-3 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full bg-current ${state === "live" ? "animate-pulse" : ""}`}
      />
      {chip.label}
    </span>
  );
}

const participants = [
  { name: "Nguyễn Văn A", seed: "nguyen-van-a-1" },
  { name: "Trần Thị B", seed: "tran-thi-b" },
  { name: "Phạm Minh C", seed: "pham-minh-c" },
  { name: "Lê Hoàng D", seed: "le-hoang-d" },
  { name: "Nguyễn Hương", seed: "nguyen-huong" },
  { name: "Đỗ Tuấn Nam", seed: "do-tuan-nam" },
  { name: "Duy Anh", seed: "duy-anh" },
  { name: "Quang Minh", seed: "quang-minh" },
  { name: "Mỹ Linh", seed: "my-linh" },
  { name: "Bảo Ngọc", seed: "bao-ngoc" },
];

type Tab = "upcoming" | "live" | "ended" | "recordings" | "rooms";

function formatRange(startAt?: string, endAt?: string) {
  if (!startAt) return "Chưa đặt thời gian";
  const s = new Date(startAt);
  const e = endAt ? new Date(endAt) : null;
  const time = s.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const date = s.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  const mins = e ? Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000)) : null;
  return `${time} · ${date}${mins ? ` · ${mins}p` : ""}`;
}

function MeetingPage() {
  const [open, setOpen] = useSidebarState();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();

  const workspaces = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
  });

  // Ghi nhớ bộ lọc phòng gần nhất (workspace + từ khóa + trạng thái + sắp xếp) giữa các lần truy cập.
  const ROOM_FILTER_KEY = "uniwork.meeting.roomFilter";
  type RoomFilterState = "all" | "live" | "upcoming" | "ended";
  const [restoredFilter, setRestoredFilter] = useState<{
    ws?: string;
    q?: string;
    state?: RoomFilterState;
    sort?: "asc" | "desc";
  } | null>(null);

  useEffect(() => {
    if (search.ws !== undefined || search.q !== undefined || search.state !== undefined || search.sort !== undefined) return;
    try {
      const raw = window.localStorage.getItem(ROOM_FILTER_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { ws?: string; q?: string; state?: RoomFilterState; sort?: "asc" | "desc" };
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
  const ROOM_PAGE_SIZE = 20;

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

  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; title: string } | null>(null);

  // Lên lịch họp thật
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schTitle, setSchTitle] = useState("");
  const [schStart, setSchStart] = useState("");
  const [schEnd, setSchEnd] = useState("");
  const [schAgenda, setSchAgenda] = useState("");

  // Tham gia bằng mã mời
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");

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

  type ListRoom = { id: string; title: string; status: string; start_at: string; end_at: string };

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

  const listItems: ListRoom[] = rangeActive
    ? rangeFiltered.slice((currentPage - 1) * ROOM_PAGE_SIZE, currentPage * ROOM_PAGE_SIZE)
    : ((rooms.data?.items ?? []) as ListRoom[]);
  const listTotal = rangeActive ? rangeFiltered.length : (rooms.data?.total ?? 0);
  const listLoading = rangeActive ? rangeQuery.isLoading : rooms.isLoading;
  const listFetching = rangeActive ? rangeQuery.isFetching : rooms.isFetching;

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
    onError: () => toast.error("Không tạo được phòng họp. Kiểm tra quyền và hạn mức của tổ chức."),
  });

  // Sửa / hủy phòng họp thật.
  type RoomItem = { id: string; title: string; status: string; start_at: string; end_at: string };
  const [editRoom, setEditRoom] = useState<RoomItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [cancelRoom, setCancelRoom] = useState<RoomItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const openEdit = (r: RoomItem) => {
    setEditRoom(r);
    setEditTitle(r.title);
    setEditStart(r.start_at ? toLocalInput(new Date(r.start_at)) : "");
    setEditEnd(r.end_at ? toLocalInput(new Date(r.end_at)) : "");
  };

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
      setEditRoom(null);
      toast.success("Đã cập nhật cuộc họp.");
    },
    onError: () => toast.error("Không cập nhật được cuộc họp. Kiểm tra quyền của bạn."),
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
      toast.success("Đã lên lịch cuộc họp.");
    },
    onError: () => toast.error("Không lên lịch được. Kiểm tra quyền và thời gian hợp lệ."),
  });

  const joinByCode = useMutation({
    mutationFn: () => redeemMeetingInviteLink({ data: { token: joinCode.trim() } }),
    onSuccess: (res) => {
      if ((res.status === "joined" || res.status === "already") && res.meetingId) {
        setJoinOpen(false);
        setJoinCode("");
        void navigate({ to: "/meeting/$id", params: { id: res.meetingId } });
        return;
      }
      const msg: Record<string, string> = {
        expired: "Mã mời đã hết hạn.",
        exhausted: "Mã mời đã hết lượt sử dụng.",
        revoked: "Mã mời đã bị thu hồi.",
        invalid: "Mã mời không hợp lệ.",
      };
      toast.error(msg[res.status] ?? "Không tham gia được bằng mã này.");
    },
    onError: () => toast.error("Không tham gia được. Kiểm tra lại mã mời."),
  });

  const cancelRoomMutation = useMutation({
    mutationFn: () =>
      cancelMeeting({
        data: {
          idempotencyKey: crypto.randomUUID(),
          meetingId: cancelRoom!.id,
          ...(cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-rooms"] });
      setCancelRoom(null);
      setCancelReason("");
      toast.success("Đã hủy cuộc họp.");
    },
    onError: () => toast.error("Không hủy được cuộc họp. Kiểm tra quyền của bạn."),
  });

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="meetings" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          variant="documents"
          onOpenSidebar={() => setOpen(true)}
          onNew={() => setCreateOpen(true)}
        />

        {tab === "rooms" ? null : null}

        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          {/* Main column */}
          <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            {/* Header */}
            <div className="border-b border-border px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold">Họp</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Lên lịch, tham gia và xem lại cuộc họp với AI Copilot.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setCreateOpen(true)}
                    disabled={createRoom.isPending}
                    className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {createRoom.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <VideoIcon className="h-4 w-4" />
                    )}
                    Bắt đầu họp ngay
                  </button>
                  <button
                    onClick={() => {
                      const now = new Date();
                      const start = new Date(now.getTime() + 30 * 60000);
                      const end = new Date(start.getTime() + 30 * 60000);
                      setSchStart(toLocalInput(start));
                      setSchEnd(toLocalInput(end));
                      setScheduleOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-primary/40"
                  >
                    <Calendar className="h-4 w-4" /> Lên lịch
                  </button>
                  <button
                    onClick={() => setJoinOpen(true)}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-primary/40"
                  >
                    <Link2 className="h-4 w-4" /> Tham gia bằng mã
                  </button>
                  <Link
                    to="/meeting/history"
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-primary/40"
                  >
                    <Clock className="h-4 w-4" /> Lịch sử họp
                  </Link>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Hôm nay"
                  value="4"
                  sub="cuộc họp"
                  icon={Calendar}
                  color="text-primary"
                />
                <StatCard
                  label="Đang diễn ra"
                  value="1"
                  sub="LIVE"
                  icon={Circle}
                  color="text-destructive"
                />
                <StatCard
                  label="Bản ghi tuần này"
                  value="12"
                  sub="2.4 GB"
                  icon={Video}
                  color="text-sky-300"
                />
                <StatCard
                  label="Tóm tắt AI"
                  value="38"
                  sub="tháng này"
                  icon={Sparkles}
                  color="text-violet-300"
                />
              </div>
            </div>

            {/* Tabs + search */}
            {/* Phòng họp thật (LiveKit) */}
            <div
              id="online-rooms"
              className={`border-b border-border px-6 py-4 ${search.focus === "rooms" ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""}`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Phòng họp trực tuyến</h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    Cần bật camera/micro khi trình duyệt hỏi quyền
                  </span>
                  <button
                    onClick={() => setCreateOpen(true)}
                    disabled={createRoom.isPending || !activeWs}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {createRoom.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Tạo phòng nhanh
                  </button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select
                  value={activeWs ?? ""}
                  onChange={(e) => setRoomFilter({ ws: e.target.value, page: 1 })}
                  disabled={workspaces.isLoading}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
                  aria-label="Chọn workspace"
                >
                  {workspaces.data?.length ? (
                    workspaces.data.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))
                  ) : (
                    <option value="">Chưa có workspace</option>
                  )}
                </select>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={roomQuery}
                    onChange={(e) => setRoomFilter({ q: e.target.value, page: 1 })}
                    placeholder="Tìm phòng theo tên…"
                    className="w-52 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                  />
                  {roomQuery && (
                    <button
                      onClick={() => setRoomFilter({ q: "", page: 1 })}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Xóa
                    </button>
                  )}
                </div>
                <div
                  className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1"
                  role="group"
                  aria-label="Lọc trạng thái phòng"
                >
                  {(
                    [
                      { key: "all", label: "Tất cả" },
                      { key: "live", label: "Đang diễn ra" },
                      { key: "upcoming", label: "Sắp diễn ra" },
                      { key: "ended", label: "Đã kết thúc" },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setRoomFilter({ state: s.key, page: 1 })}
                      aria-pressed={roomState === s.key}
                      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                        roomState === s.key
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground">Từ</span>
                  <input
                    type="date"
                    value={dateFrom ?? ""}
                    max={dateTo ?? undefined}
                    onChange={(e) => setRoomFilter({ from: e.target.value, page: 1 })}
                    aria-label="Từ ngày"
                    className="bg-transparent text-sm focus:outline-none"
                  />
                  <span className="text-xs text-muted-foreground">đến</span>
                  <input
                    type="date"
                    value={dateTo ?? ""}
                    min={dateFrom ?? undefined}
                    onChange={(e) => setRoomFilter({ to: e.target.value, page: 1 })}
                    aria-label="Đến ngày"
                    className="bg-transparent text-sm focus:outline-none"
                  />
                  {rangeActive && (
                    <button
                      onClick={() => setRoomFilter({ from: "", to: "", page: 1 })}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Xóa
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setRoomFilter({ sort: sortStartAt === "asc" ? "desc" : "asc", page: 1 })}
                  aria-label={sortStartAt === "asc" ? "Sắp xếp ngày bắt đầu tăng dần" : "Sắp xếp ngày bắt đầu giảm dần"}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {sortStartAt === "asc" ? "Ngày bắt đầu ↑" : "Ngày bắt đầu ↓"}
                </button>
              </div>

              {listLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải phòng…
                </div>
              ) : listItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {rangeActive
                    ? "Không có cuộc họp nào trong khoảng ngày đã chọn."
                    : roomState === "live"
                    ? "Không có phòng nào đang diễn ra trong workspace này."
                    : roomState === "upcoming"
                      ? "Không có phòng nào sắp diễn ra trong workspace này."
                      : roomState === "ended"
                        ? "Chưa có cuộc họp nào đã kết thúc trong workspace này."
                      : roomQuery
                    ? "Không có phòng nào khớp từ khóa trong workspace này."
                    : "Workspace này chưa có phòng nào. Bấm “Bắt đầu họp ngay” để tạo phòng thật và vào bằng camera."}
                </p>
              ) : (
                <>
                  <ul className="grid gap-2 md:grid-cols-2">
                    {listItems.map((r) => (
                      <li key={r.id}>
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm hover:border-primary/40">
                          <Link
                            to="/meeting/$id"
                            params={{ id: r.id }}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2"
                          >
                            <span className="min-w-0 flex-1 truncate">{r.title}</span>
                            <RoomStatusChip
                              status={r.status}
                              startAt={r.start_at}
                              endAt={r.end_at}
                            />
                          </Link>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCancelRoom(r);
                                setCancelReason("");
                              }}
                              className="rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {listTotal > ROOM_PAGE_SIZE && (
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">
                        Trang {currentPage} · {(currentPage - 1) * ROOM_PAGE_SIZE + 1} -{" "}
                        {Math.min(currentPage * ROOM_PAGE_SIZE, listTotal)} / {listTotal} phòng
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setRoomFilter({ page: currentPage - 1 })}
                          disabled={currentPage <= 1 || listFetching}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 disabled:opacity-50"
                        >
                          Trước
                        </button>
                        <button
                          onClick={() => setRoomFilter({ page: currentPage + 1 })}
                          disabled={currentPage * ROOM_PAGE_SIZE >= listTotal || listFetching}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 disabled:opacity-50"
                        >
                          Sau
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/95 px-6 py-3 backdrop-blur">
              <div className="flex gap-1 rounded-lg bg-surface p-1 text-sm">
                {(
                  [
                    ["upcoming", "Sắp tới"],
                    ["live", "Đang diễn ra"],
                    ["ended", "Đã kết thúc"],
                    ["recordings", "Bản ghi"],
                    ["rooms", "Phòng họp"],
                  ] as [Tab, string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`rounded-md px-3 py-1.5 transition-colors ${
                      tab === k
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Tìm cuộc họp…"
                    className="w-56 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Lọc trạng thái phòng họp"
                      className="rounded-lg border border-border bg-surface p-2 text-muted-foreground hover:text-foreground"
                    >
                      <Filter className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(
                      [
                        ["all", "Tất cả"],
                        ["live", "Đang diễn ra"],
                        ["upcoming", "Sắp diễn ra"],
                        ["ended", "Đã kết thúc"],
                      ] as [RoomFilterState, string][]
                    ).map(([value, label]) => (
                      <DropdownMenuItem
                        key={value}
                        onClick={() => setRoomFilter({ state: value, page: 1 })}
                      >
                        {label}
                        {roomState === value ? " ✓" : ""}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem
                      onClick={() =>
                        setRoomFilter({ sort: sortStartAt === "asc" ? "desc" : "asc", page: 1 })
                      }
                    >
                      {sortStartAt === "asc" ? "Sắp xếp: mới nhất trước" : "Sắp xếp: sớm nhất trước"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Body by tab */}
            <div className="px-6 py-5">
              {tab === "rooms" ? (
                <RoomsGrid />
              ) : (
                <div className="space-y-3">
                  {listLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Đang tải cuộc họp…
                    </div>
                  ) : listItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                      Không tìm thấy cuộc họp nào
                    </div>
                  ) : (
                    <>
                      {listItems.map((m) => (
                        <div
                          key={m.id}
                          className={`flex flex-wrap items-center gap-4 rounded-xl border bg-surface p-4 ${m.status === "live" ? "border-destructive/40" : "border-border"} hover:border-primary/40`}
                        >
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${m.status === "live" ? "bg-destructive/15 text-destructive" : m.status === "ended" || m.status === "canceled" ? "bg-surface-2 text-muted-foreground" : "bg-primary/15 text-primary"}`}
                          >
                            {m.status === "live" ? (
                              <Circle className="h-5 w-5 fill-current" />
                            ) : m.status === "ended" || m.status === "canceled" ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : (
                              <VideoIcon className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{m.title}</span>
                              <RoomStatusChip status={m.status} startAt={m.start_at} endAt={m.end_at} />
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatRange(m.start_at, m.end_at)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link
                              to="/meeting/$id"
                              params={{ id: m.id }}
                              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium ${m.status === "live" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" />
                              {m.status === "live" ? "Tham gia" : "Vào phòng"}
                            </Link>
                            <button
                              type="button"
                              onClick={() => openEdit(m)}
                              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCancelRoom(m);
                                setCancelReason("");
                              }}
                              className="rounded-lg border border-border px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      ))}
                      {listTotal > ROOM_PAGE_SIZE && (
                        <div className="flex items-center justify-between gap-3 pt-2 text-xs">
                          <span className="text-muted-foreground">
                            Trang {currentPage} · {(currentPage - 1) * ROOM_PAGE_SIZE + 1} -{" "}
                            {Math.min(currentPage * ROOM_PAGE_SIZE, listTotal)} / {listTotal} cuộc họp
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setRoomFilter({ page: currentPage - 1 })}
                              disabled={currentPage <= 1 || listFetching}
                              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 disabled:opacity-50"
                            >
                              Trước
                            </button>
                            <button
                              onClick={() => setRoomFilter({ page: currentPage + 1 })}
                              disabled={currentPage * ROOM_PAGE_SIZE >= listTotal || listFetching}
                              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 disabled:opacity-50"
                            >
                              Sau
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Right panel */}
          <aside className="hidden w-[340px] shrink-0 flex-col border-l border-border bg-surface xl:flex">
            <MiniCalendar />
            <div className="border-t border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Sắp diễn ra</h3>
                <Link to="/calendar" className="text-xs text-primary hover:underline">
                  Tất cả
                </Link>
              </div>
              <div className="space-y-2">
                {upcomingPanel.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải…
                  </div>
                ) : upcomingItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Chưa có cuộc họp nào sắp diễn ra.</p>
                ) : (
                  upcomingItems.slice(0, 3).map((m) => (
                    <Link
                      key={m.id}
                      to="/meeting/$id"
                      params={{ id: m.id }}
                      className="block w-full rounded-lg border border-border bg-bg p-3 text-left hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 truncate text-sm font-medium">{m.title}</div>
                        <RoomStatusChip status={m.status} startAt={m.start_at} endAt={m.end_at} />
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatRange(m.start_at, m.end_at)}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="border-t border-border p-4">
              <h3 className="mb-3 text-sm font-semibold">Tích hợp</h3>
              <div className="space-y-2 text-sm">
                {[
                  { name: "Google Calendar", on: true },
                  { name: "Outlook 365", on: true },
                  { name: "Zalo OA Notify", on: true },
                  { name: "Slack Reminders", on: false },
                ].map((i) => (
                  <div
                    key={i.name}
                    className="flex items-center justify-between rounded-lg bg-bg px-3 py-2"
                  >
                    <span className="text-muted-foreground">{i.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${i.on ? "bg-emerald-500/15 text-emerald-300" : "bg-surface-2 text-muted-foreground"}`}
                    >
                      {i.on ? "Đang bật" : "Tắt"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
      {createOpen ? (
        <QuickRoomModal
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
            <DialogTitle>Lên lịch cuộc họp</DialogTitle>
            <DialogDescription>Tạo cuộc họp có thời gian cụ thể trong workspace hiện tại.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sch-title">Tiêu đề</Label>
              <Input id="sch-title" value={schTitle} onChange={(e) => setSchTitle(e.target.value)} placeholder="Họp review sprint" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sch-start">Bắt đầu</Label>
                <Input id="sch-start" type="datetime-local" value={schStart} onChange={(e) => setSchStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sch-end">Kết thúc</Label>
                <Input id="sch-end" type="datetime-local" value={schEnd} onChange={(e) => setSchEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sch-agenda">Nội dung (tùy chọn)</Label>
              <Input id="sch-agenda" value={schAgenda} onChange={(e) => setSchAgenda(e.target.value)} placeholder="Chương trình họp" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Đóng</Button>
            <Button
              onClick={() => scheduleMutation.mutate()}
              disabled={
                scheduleMutation.isPending || !activeWs || !schTitle.trim() || !schStart || !schEnd
              }
            >
              {scheduleMutation.isPending ? "Đang lưu…" : "Lên lịch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tham gia bằng mã</DialogTitle>
            <DialogDescription>Nhập mã mời để vào phòng họp.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="join-code">Mã mời</Label>
            <Input
              id="join-code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Dán mã mời tại đây"
              onKeyDown={(e) => {
                if (e.key === "Enter" && joinCode.trim().length >= 10) joinByCode.mutate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinOpen(false)}>Đóng</Button>
            <Button
              onClick={() => joinByCode.mutate()}
              disabled={joinByCode.isPending || joinCode.trim().length < 10}
            >
              {joinByCode.isPending ? "Đang kiểm tra…" : "Tham gia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRoom} onOpenChange={(o) => !o && setEditRoom(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sửa cuộc họp</DialogTitle>
            <DialogDescription>Cập nhật tiêu đề và thời gian của cuộc họp.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Tiêu đề</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-start">Bắt đầu</Label>
                <Input
                  id="edit-start"
                  type="datetime-local"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-end">Kết thúc</Label>
                <Input
                  id="edit-end"
                  type="datetime-local"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoom(null)}>
              Đóng
            </Button>
            <Button
              onClick={() => updateRoom.mutate()}
              disabled={updateRoom.isPending || !editTitle.trim()}
            >
              {updateRoom.isPending ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelRoom} onOpenChange={(o) => !o && setCancelRoom(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hủy cuộc họp</DialogTitle>
            <DialogDescription>
              {cancelRoom ? `“${cancelRoom.title}” sẽ được đánh dấu là đã hủy.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Lý do (tùy chọn)</Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ví dụ: dời sang tuần sau"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelRoom(null)}>
              Quay lại
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelRoomMutation.mutate()}
              disabled={cancelRoomMutation.isPending}
            >
              {cancelRoomMutation.isPending ? "Đang hủy…" : "Xác nhận hủy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function QuickRoomModal({
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
  const [title, setTitle] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() + 15 * 60_000)));
  const [duration, setDuration] = useState(60);
  const [invitees, setInvitees] = useState("");
  // Tiến trình & kết quả gửi lời mời theo từng email.
  type InviteResult = {
    email: string;
    state: "pending" | "sending" | "invited" | "already" | "not_found" | "failed";
    detail?: string;
  };
  const [inviteResults, setInviteResults] = useState<InviteResult[] | null>(null);
  const [inviteRunning, setInviteRunning] = useState(false);

  // Danh sách người đã được mời + trạng thái tham gia của phòng vừa tạo.
  type Participant = {
    userId: string;
    role: string;
    rsvp: string;
    rsvpAt: string | null;
    invitedAt: string;
    name: string | null;
    email: string | null;
  };
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  const refreshParticipants = useCallback(async () => {
    if (!created) return;
    setLoadingParticipants(true);
    try {
      const rows = await listMeetingParticipants({ data: { meetingId: created.id } });
      setParticipants(rows as Participant[]);
    } catch {
      toast.error("Không tải được danh sách người tham gia");
    } finally {
      setLoadingParticipants(false);
    }
  }, [created]);

  useEffect(() => {
    if (created) void refreshParticipants();
  }, [created, refreshParticipants]);

  const inviteDone = (inviteResults ?? []).filter(
    (r) => r.state !== "pending" && r.state !== "sending",
  ).length;
  const inviteSummary = {
    // Người chưa thực sự nhận được lời mời trong hệ thống → gợi ý gửi email link.
    mailable: (inviteResults ?? [])
      .filter((r) => r.state === "not_found" || r.state === "failed")
      .map((r) => r.email),
  };

  // Phân tích danh sách email: kiểm tra định dạng + phát hiện trùng lặp.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
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
      toast.success("Đã tạo link mời có kiểm soát");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tạo được link mời");
    } finally {
      setCreatingLink(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast.success("Đã copy link mời");
    } catch {
      toast.error("Không copy được link, hãy chọn và copy thủ công");
    }
  };

  const sendInvites = async () => {
    const { valid, invalid, duplicates } = parsedInvitees;
    if (invalid.length) {
      toast.error(`Email không hợp lệ: ${invalid.join(", ")}`);
      return;
    }
    if (!valid.length) {
      toast.error("Nhập ít nhất một email người tham gia");
      return;
    }
    if (duplicates.length) {
      toast.warning(`Đã bỏ ${duplicates.length} email trùng: ${duplicates.join(", ")}`);
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
            idx === i ? { ...r, state: res.status as InviteResult["state"] } : r,
          ),
        );
      } catch (err) {
        setInviteResults((prev) =>
          (prev ?? []).map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  state: "failed",
                  detail: err instanceof Error ? err.message : "Lỗi không xác định",
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
    const subject = encodeURIComponent(`Mời họp: ${created?.title ?? "Phòng họp"}`);
    const body = encodeURIComponent(
      `Bạn được mời tham gia phòng họp "${created?.title ?? ""}".\n\nLink: ${shareLink}`,
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tạo phòng nhanh"
      onClick={onClose}
    >
      {created ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
        >
          <h2 className="text-base font-semibold">Đã tạo phòng · Mời người tham gia</h2>
          <p className="mt-1 text-xs text-muted-foreground">{created.title}</p>

          <label className="mt-4 block text-sm font-medium" htmlFor="qr-link">
            Link mời
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="qr-link"
              readOnly
              value={shareLink}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void copyLink()}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40"
            >
              Copy
            </button>
          </div>

          <div className="mt-3 rounded-lg border border-border bg-bg p-3">
            <p className="text-xs font-medium">Kiểm soát quyền truy cập của link</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted-foreground">
                Hết hạn sau
                <select
                  value={linkExpiry}
                  onChange={(e) => setLinkExpiry(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="60">1 giờ</option>
                  <option value="360">6 giờ</option>
                  <option value="1440">1 ngày</option>
                  <option value="10080">7 ngày</option>
                  <option value="43200">30 ngày</option>
                  <option value="never">Không giới hạn</option>
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Số lần sử dụng
                <select
                  value={linkUses}
                  onChange={(e) => setLinkUses(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="1">1 lượt</option>
                  <option value="5">5 lượt</option>
                  <option value="10">10 lượt</option>
                  <option value="50">50 lượt</option>
                  <option value="unlimited">Không giới hạn</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={creatingLink}
              onClick={() => void generateControlledLink()}
              className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40 disabled:opacity-60"
            >
              {creatingLink ? "Đang tạo link…" : "Tạo link mời có kiểm soát"}
            </button>
            {controlledLink && (
              <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                Link hiện tại:{" "}
                {controlledLink.expiresAt
                  ? `hết hạn ${new Date(controlledLink.expiresAt).toLocaleString("vi-VN")}`
                  : "không hết hạn"}{" "}
                ·{" "}
                {controlledLink.maxUses
                  ? `tối đa ${controlledLink.maxUses} lượt dùng`
                  : "không giới hạn lượt dùng"}
              </p>
            )}
          </div>

          <label className="mt-4 block text-sm font-medium" htmlFor="qr-invitees">
            Danh sách người tham gia (email, cách nhau bằng dấu phẩy)
          </label>
          <textarea
            id="qr-invitees"
            rows={3}
            value={invitees}
            onChange={(e) => setInvitees(e.target.value)}
            placeholder="an@uniwork.vn, binh@uniwork.vn"
            aria-invalid={parsedInvitees.invalid.length > 0}
            className={`mt-1 w-full rounded-lg border bg-bg px-3 py-2 text-sm focus:outline-none ${
              parsedInvitees.invalid.length
                ? "border-destructive focus:border-destructive"
                : "border-border focus:border-primary/40"
            }`}
          />
          {invitees.trim() && (
            <div className="mt-2 space-y-1 text-xs" aria-live="polite">
              <p className="text-muted-foreground">
                {parsedInvitees.valid.length} email hợp lệ sẽ được mời.
              </p>
              {parsedInvitees.invalid.length > 0 && (
                <p className="text-destructive">
                  Sai định dạng: {parsedInvitees.invalid.join(", ")}
                </p>
              )}
              {parsedInvitees.duplicates.length > 0 && (
                <p className="text-amber-600">
                  Trùng lặp (sẽ chỉ gửi một lần): {parsedInvitees.duplicates.join(", ")}
                </p>
              )}
            </div>
          )}

          {inviteResults && (
            <div className="mt-4 rounded-lg border border-border bg-bg p-3" aria-live="polite">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  {inviteRunning ? "Đang gửi lời mời…" : "Kết quả gửi lời mời"}
                </span>
                <span className="text-muted-foreground">
                  {inviteDone}/{inviteResults.length}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${inviteResults.length ? (inviteDone / inviteResults.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto text-xs">
                {inviteResults.map((r) => (
                  <li key={r.email} className="flex items-center justify-between gap-2">
                    <span className="truncate">{r.email}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {r.state === "pending" && (
                        <span className="text-muted-foreground">Chờ gửi</span>
                      )}
                      {r.state === "sending" && (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          <span className="text-muted-foreground">Đang gửi</span>
                        </>
                      )}
                      {r.state === "invited" && (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-emerald-600">Đã mời</span>
                        </>
                      )}
                      {r.state === "already" && (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">Đã có trong phòng</span>
                        </>
                      )}
                      {r.state === "not_found" && (
                        <>
                          <MailQuestion className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-amber-600">Chưa có tài khoản</span>
                        </>
                      )}
                      {r.state === "failed" && (
                        <>
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                          <span className="text-destructive" title={r.detail}>
                            Thất bại
                          </span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {!inviteRunning && inviteSummary.mailable.length > 0 && (
                <button
                  type="button"
                  onClick={() => mailtoFallback(inviteSummary.mailable)}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:border-primary/40"
                >
                  <Mail className="h-3.5 w-3.5" /> Gửi email link mời cho{" "}
                  {inviteSummary.mailable.length} người chưa nhận được
                </button>
              )}
            </div>
          )}

          <div className="mt-4 rounded-lg border border-border bg-bg p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-medium">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                Người đã mời ({participants?.length ?? 0})
              </span>
              <button
                type="button"
                onClick={() => void refreshParticipants()}
                disabled={loadingParticipants}
                className="rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary/40 disabled:opacity-50"
              >
                {loadingParticipants ? "Đang tải…" : "Làm mới"}
              </button>
            </div>
            {participants && participants.length > 0 ? (
              <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto text-xs">
                {participants.map((p) => (
                  <li key={p.userId} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {p.name ?? p.email ?? p.userId}
                      {p.role === "host" && (
                        <span className="ml-1 text-muted-foreground">· Chủ phòng</span>
                      )}
                    </span>
                    <span
                      className={
                        p.rsvp === "accepted"
                          ? "shrink-0 text-emerald-600"
                          : p.rsvp === "declined"
                            ? "shrink-0 text-destructive"
                            : p.rsvp === "tentative"
                              ? "shrink-0 text-amber-600"
                              : "shrink-0 text-muted-foreground"
                      }
                    >
                      {p.rsvp === "accepted"
                        ? "Đã nhận lời"
                        : p.rsvp === "declined"
                          ? "Từ chối"
                          : p.rsvp === "tentative"
                            ? "Có thể tham gia"
                            : "Chờ phản hồi"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {loadingParticipants ? "Đang tải danh sách…" : "Chưa có ai được mời vào phòng này."}
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40"
            >
              Để sau
            </button>
            <button
              type="button"
              onClick={() => void sendInvites()}
              disabled={
                inviteRunning ||
                parsedInvitees.invalid.length > 0 ||
                parsedInvitees.valid.length === 0
              }
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inviteRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {inviteRunning ? "Đang gửi…" : "Gửi lời mời"}
            </button>
            <button
              type="button"
              onClick={onEnter}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <VideoIcon className="h-4 w-4" /> Vào phòng
            </button>
          </div>
        </div>
      ) : (
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold">Tạo phòng nhanh</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Đặt tên và thời gian bắt đầu để tạo phòng chính xác.
        </p>

        <label className="mt-4 block text-sm font-medium" htmlFor="qr-title">
          Tên phòng
        </label>
        <input
          id="qr-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Phòng họp nhanh"
          maxLength={200}
          className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
        />

        <div className="mt-4 flex items-center gap-2">
          <input
            id="qr-now"
            type="checkbox"
            checked={startNow}
            onChange={(e) => setStartNow(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <label htmlFor="qr-now" className="text-sm">
            Bắt đầu ngay
          </label>
        </div>

        {!startNow ? (
          <>
            <label className="mt-3 block text-sm font-medium" htmlFor="qr-start">
              Thời gian bắt đầu
            </label>
            <input
              id="qr-start"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
            />
          </>
        ) : null}

        <label className="mt-4 block text-sm font-medium" htmlFor="qr-duration">
          Thời lượng (phút)
        </label>
        <select
          id="qr-duration"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
        >
          {[15, 30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m} phút
            </option>
          ))}
        </select>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Tạo và vào phòng
          </button>
        </div>
      </form>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-[11px] text-muted-foreground">{sub}</span>
      </div>
    </div>
  );
}

function RoomsGrid() {
const ROOMS = [
  {
    name: "Phòng họp lớn – Tầng 5",
    capacity: 30,
    free: true,
    equipment: ['TV 75"', "Polycom", "Whiteboard"],
  },
  { name: "Hội trường A", capacity: 80, free: false, equipment: ["Projector", "Mic không dây"] },
  { name: "Phòng nhỏ – Tầng 3", capacity: 8, free: true, equipment: ['TV 55"', "Jabra"] },
  { name: "Phòng nhỏ – Tầng 4", capacity: 6, free: true, equipment: ['TV 55"'] },
];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {ROOMS.map((r) => (
        <div key={r.name} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3 w-3" /> Sức chứa {r.capacity} người
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.free ? "bg-emerald-500/15 text-emerald-300" : "bg-destructive/15 text-destructive"}`}
            >
              {r.free ? "Trống" : "Đang dùng"}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.equipment.map((e) => (
              <span
                key={e}
                className="rounded bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {e}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => notifyComingSoon()}
              disabled={!r.free}
              className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              Đặt phòng
            </button>
            <button onClick={() => notifyComingSoon()} className="rounded-lg border border-border px-3 py-2 text-xs hover:border-primary/40">
              Lịch sử
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniCalendar() {
  const today = 10;
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const events: Record<number, number> = { 10: 4, 11: 2, 12: 3, 13: 1, 16: 2, 17: 1, 20: 5 };
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tháng 6, 2026</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => notifyComingSoon()} className="rounded p-1 hover:bg-surface-2">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => notifyComingSoon()} className="rounded p-1 hover:bg-surface-2">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isToday = d === today;
          const has = events[d];
          return (
            <button onClick={() => notifyComingSoon()}
              key={d}
              className={`relative aspect-square rounded text-xs ${
                isToday
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "hover:bg-surface-2 text-foreground"
              }`}
            >
              {d}
              {has && !isToday && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ====================== LIVE ROOM (existing) ====================== */

function VideoTile({ name, seed, highlight }: { name: string; seed: string; highlight?: boolean }) {
  return (
    <div className={`video-tile ${highlight ? "ring-2 ring-primary/70" : ""}`}>
      <img src={avatar(seed)} alt={name} className="h-full w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent p-2 text-xs text-white">
        <Mic className="h-3 w-3" />
        <span>{name}</span>
      </div>
      {highlight && (
        <button onClick={() => notifyComingSoon()} className="absolute right-2 top-2 rounded-md bg-black/50 p-1.5 text-white hover:bg-black/70">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ControlButton({
  icon: Icon,
  label,
  badge,
  danger,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  badge?: number;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      <span
        className={`relative flex h-11 w-11 items-center justify-center rounded-full ${danger ? "bg-destructive text-destructive-foreground" : "bg-surface-2 text-foreground hover:bg-surface-2/70"}`}
      >
        <Icon className="h-5 w-5" />
        {badge !== undefined && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </button>
  );
}


/* keep referenced for typing */
void AlertCircle;
void Star;
