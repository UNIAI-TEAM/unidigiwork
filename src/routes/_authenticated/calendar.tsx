import { useStickySearch } from "@/lib/sticky-search";
import { FilterPageHeader } from "@/components/filter-page-header";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { listCalendarEvents } from "@/lib/api/calendar.functions";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Video,
  ListChecks,
  Flag,
  Filter,
  CalendarDays,
  CalendarRange,
  Search,
  MapPin,
  Clock,
  Users as UsersIcon,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import { Link } from "@tanstack/react-router";
import { getMeeting } from "@/lib/api/meetings.functions";
import { Loader2, FileText, Radio } from "lucide-react";
import { CreateEventDialog } from "@/components/calendar/create-event-dialog";
import { buildIcs, downloadIcs } from "@/lib/ics";
import { Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/calendar")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: search['view'] === "week" ? ("week" as const) : undefined,
    kind: search['kind'] === "meeting" ? ("meeting" as const) : undefined,
    day:
      typeof search['day'] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search['day'] as string)
        ? (search['day'] as string)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Lịch — UNIWORK" },
      {
        name: "description",
        content:
          "Lịch tổng hợp meeting, task và deadline cho toàn workspace theo tháng và tuần.",
      },
    ],
  }),
  component: CalendarPage,
});

type EventKind = "meeting" | "task" | "deadline";

type CalEvent = {
  id: string;
  title: string;
  kind: EventKind;
  // ISO date YYYY-MM-DD
  date: string;
  start?: string; // HH:mm
  end?: string; // HH:mm
  allDay?: boolean;
  location?: string;
  agenda?: string | null;
  conferenceProvider?: string | null;
  owner?: { name: string; seed: string };
  attendees?: { name: string; seed: string }[];
  project?: string;
  meetingStatus?: "upcoming" | "past" | "canceled" | null;
  priority?: "low" | "normal" | "high" | "urgent" | null;
  at?: string;
  endAt?: string | null;
};

type MeetingStatusKey = "upcoming" | "past" | "canceled";
type TaskLevelKey = "urgent" | "high" | "other";

const MEETING_STATUS_META: Record<MeetingStatusKey, string> = {
  upcoming: "Sắp tới",
  past: "Đã diễn ra",
  canceled: "Đã huỷ",
};
const TASK_LEVEL_META: Record<TaskLevelKey, string> = {
  urgent: "Khẩn cấp",
  high: "Ưu tiên cao",
  other: "Khác",
};
const taskLevelOf = (e: CalEvent): TaskLevelKey =>
  e.priority === "urgent" ? "urgent" : e.priority === "high" ? "high" : "other";

const KIND_META: Record<
  EventKind,
  { label: string; dot: string; chip: string; ring: string; icon: typeof Video }
> = {
  meeting: {
    label: "Họp",
    dot: "bg-primary",
    chip: "bg-primary/15 text-primary border-primary/30",
    ring: "ring-primary/40",
    icon: Video,
  },
  task: {
    label: "Công việc",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    ring: "ring-emerald-500/40",
    icon: ListChecks,
  },
  deadline: {
    label: "Hạn chót",
    dot: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    ring: "ring-rose-500/40",
    icon: Flag,
  },
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date) {
  // Monday as first day
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonthGrid(d: Date) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfWeek(first);
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type ViewMode = "month" | "week";

function CalendarPage() {
  const { view: urlView, kind: urlKind, day: urlDay } = Route.useSearch();
  const navigateCalendar = useNavigate();
  const calendarSearch = Route.useSearch();
  useStickySearch("calendar", calendarSearch, (saved) =>
    navigateCalendar({ to: "/calendar", search: () => saved, replace: true }),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cursor, setCursor] = useState(() => (urlDay ? new Date(`${urlDay}T00:00:00`) : new Date()));
  const [view, setView] = useState<ViewMode>(urlView === "week" ? "week" : "month");
  const [filters, setFilters] = useState<Record<EventKind, boolean>>({
    meeting: true,
    task: urlKind !== "meeting",
    deadline: urlKind !== "meeting",
  });
  const [meetingStatusFilter, setMeetingStatusFilter] = useState<Record<MeetingStatusKey, boolean>>({
    upcoming: true,
    past: true,
    canceled: true,
  });
  const [taskLevelFilter, setTaskLevelFilter] = useState<Record<TaskLevelKey, boolean>>({
    urgent: true,
    high: true,
    other: true,
  });
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Khoảng thời gian tải dữ liệu: phủ trọn lưới tháng và tuần đang xem
  const range = useMemo(() => {
    const gridStart = addDays(startOfMonthGrid(cursor), -7);
    const weekStart = addDays(startOfWeek(cursor), -7);
    const rangeFrom = gridStart < weekStart ? gridStart : weekStart;
    const rangeTo = addDays(rangeFrom, 70);
    return { from: rangeFrom.toISOString(), to: rangeTo.toISOString() };
  }, [cursor]);

  const fetchEvents = useServerFn(listCalendarEvents);
  const { workspaceId: activeWorkspaceId } = useActiveWorkspace();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["calendar-events", range.from, range.to, activeWorkspaceId ?? "all"],
    queryFn: () =>
      fetchEvents({
        data: {
          from: range.from,
          to: range.to,
          ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
        },
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const events = useMemo<CalEvent[]>(
    () =>
      (data ?? []).map((e) => {
        const at = new Date(e.at);
        const end = e.endAt ? new Date(e.endAt) : null;
        const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        return {
          id: e.id,
          title: e.title,
          kind: e.kind,
          date: isoDate(at),
          start: e.allDay ? undefined : hhmm(at),
          end: end ? hhmm(end) : undefined,
          allDay: e.allDay,
          location: e.location ?? undefined,
          agenda: e.agenda ?? null,
          conferenceProvider: e.conferenceProvider ?? null,
          project: e.project ?? undefined,
          attendees: e.attendees,
          meetingStatus: e.meetingStatus,
          priority: e.priority,
          at: e.at,
          endAt: e.endAt ?? null,
        };
      }),
    [data],
  );

  const visible = useMemo(
    () =>
      events.filter((e) => {
        if (urlDay && e.date !== urlDay) return false;
        if (!filters[e.kind]) return false;
        if (e.kind === "meeting") {
          const st = (e.meetingStatus ?? "upcoming") as MeetingStatusKey;
          if (!meetingStatusFilter[st]) return false;
        } else if (!taskLevelFilter[taskLevelOf(e)]) return false;
        if (q && !e.title.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [events, filters, meetingStatusFilter, taskLevelFilter, q, urlDay],
  );

  const today = new Date();

  const monthLabel = cursor.toLocaleDateString("vi-VN", {
    month: "long",
    year: "numeric",
  });

  const goPrev = () => {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    else setCursor(addDays(cursor, -7));
  };
  const goNext = () => {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    else setCursor(addDays(cursor, 7));
  };

  const selectedEvent = visible.find((e) => e.id === selected) ?? null;

  const handleExportIcs = () => {
    const items = visible.filter((e) => e.at);
    if (items.length === 0) {
      toast.error("Không có sự kiện nào trong khoảng thời gian đang chọn");
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const priorityLabel: Record<string, string> = {
      urgent: "Khẩn cấp",
      high: "Ưu tiên cao",
      normal: "Bình thường",
      low: "Thấp",
    };
    const statusLabel: Record<string, string> = {
      upcoming: "Sắp diễn ra",
      past: "Đã diễn ra",
      canceled: "Đã huỷ",
    };
    const ics = buildIcs(
      items.map((e) => {
        const rawId = e.id.split(":")[1] ?? e.id;
        const isMeeting = e.kind === "meeting";
        const url = isMeeting ? `${origin}/meeting/${rawId}` : `${origin}/tasks/${rawId}`;
        const lines: string[] = [];
        lines.push(
          isMeeting ? "Loại: Cuộc họp" : e.kind === "deadline" ? "Loại: Hạn chót" : "Loại: Công việc",
        );
        if (e.project) lines.push(`Dự án / Không gian: ${e.project}`);
        if (e.location) lines.push(`Địa điểm: ${e.location}`);
        if (e.conferenceProvider) lines.push(`Nền tảng họp: ${e.conferenceProvider}`);
        if (e.meetingStatus) lines.push(`Trạng thái: ${statusLabel[e.meetingStatus]}`);
        if (e.priority) lines.push(`Mức độ: ${priorityLabel[e.priority] ?? e.priority}`);
        const atts = e.attendees ?? [];
        if (atts.length > 0)
          lines.push(`Thành viên: ${atts.map((a) => a.name).join(", ")}`);
        if (e.agenda) lines.push("", "Agenda:", e.agenda);
        lines.push("", `Mở trong UNIWORK: ${url}`);
        return {
          id: e.id,
          title: e.title,
          kind: e.kind,
          at: e.at!,
          endAt: e.endAt,
          allDay: e.allDay,
          location: e.location ?? e.conferenceProvider ?? null,
          description: lines.join("\n"),
          url,
          status:
            e.meetingStatus === "canceled"
              ? ("cancelled" as const)
              : ("confirmed" as const),
          attendees: atts.map((a) => a.name),
          categories: [
            ...(e.project ? [e.project] : []),
            ...(e.priority ? [priorityLabel[e.priority] ?? e.priority] : []),
          ],
        };
      }),
      "UNIWORK — Lịch",
    );
    const from = isoDate(new Date(range.from));
    const to = isoDate(new Date(range.to));
    downloadIcs(`uniwork-calendar-${from}_${to}.ics`, ics);
    toast.success(`Đã xuất ${items.length} sự kiện ra file ICS`);
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="calendar" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="mx-auto grid w-full max-w-[1400px] flex-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[260px_1fr]">
          {/* Left rail */}
          <aside className="space-y-4">
            <FilterPageHeader
              crumbs={[
                { label: "Dashboard", to: "/dashboard" },
                { label: "Lịch", to: "/calendar" },
                {
                  label: urlDay
                    ? "Hôm nay"
                    : urlKind === "meeting"
                      ? "Cuộc họp"
                      : view === "week"
                        ? "Tuần"
                        : "Tháng",
                },
              ]}
              title={urlKind === "meeting" ? "Lịch cuộc họp" : "Lịch"}
              description="Tổng hợp họp, công việc và hạn chót của workspace"
              chips={[
                ...(urlDay
                  ? [
                      {
                        label: `Ngày ${urlDay}`,
                        onClear: () =>
                          navigateCalendar({
                            to: "/calendar",
                            search: (p: Record<string, unknown>) => ({ ...p, day: undefined }),
                          }),
                      },
                    ]
                  : []),
                ...(urlKind === "meeting"
                  ? [
                      {
                        label: "Chỉ cuộc họp",
                        onClear: () =>
                          navigateCalendar({
                            to: "/calendar",
                            search: (p: Record<string, unknown>) => ({ ...p, kind: undefined }),
                          }),
                      },
                    ]
                  : []),
              ]}
            />

            <button
              onClick={() => setCreateOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Tạo sự kiện
            </button>

            <button
              onClick={handleExportIcs}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
            >
              <Download className="h-4 w-4" /> Xuất lịch (.ics)
            </button>

            <div className="rounded-2xl border border-border bg-surface p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Filter className="h-3.5 w-3.5" /> Bộ lọc
              </div>
              <div className="space-y-1">
                {(Object.keys(KIND_META) as EventKind[]).map((k) => {
                  const meta = KIND_META[k];
                  const Icon = meta.icon;
                  const count = events.filter((e) => e.kind === k).length;
                  return (
                    <label
                      key={k}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={filters[k]}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, [k]: e.target.checked }))
                        }
                      />
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1">{meta.label}</span>
                      <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted-foreground">
                        {count}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Trạng thái họp
                </div>
                <div className="space-y-1">
                  {(Object.keys(MEETING_STATUS_META) as MeetingStatusKey[]).map((k) => {
                    const count = events.filter(
                      (e) => e.kind === "meeting" && (e.meetingStatus ?? "upcoming") === k,
                    ).length;
                    return (
                      <label
                        key={k}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1 text-sm hover:bg-surface-2"
                      >
                        <input
                          type="checkbox"
                          className="accent-primary"
                          disabled={!filters.meeting}
                          checked={meetingStatusFilter[k]}
                          onChange={(ev) =>
                            setMeetingStatusFilter((f) => ({ ...f, [k]: ev.target.checked }))
                          }
                        />
                        <span className="flex-1">{MEETING_STATUS_META[k]}</span>
                        <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted-foreground">
                          {count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Mức độ công việc
                </div>
                <div className="space-y-1">
                  {(Object.keys(TASK_LEVEL_META) as TaskLevelKey[]).map((k) => {
                    const count = events.filter((e) => e.kind !== "meeting" && taskLevelOf(e) === k).length;
                    return (
                      <label
                        key={k}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1 text-sm hover:bg-surface-2"
                      >
                        <input
                          type="checkbox"
                          className="accent-primary"
                          disabled={!filters.task && !filters.deadline}
                          checked={taskLevelFilter[k]}
                          onChange={(ev) =>
                            setTaskLevelFilter((f) => ({ ...f, [k]: ev.target.checked }))
                          }
                        />
                        <span className="flex-1">{TASK_LEVEL_META[k]}</span>
                        <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted-foreground">
                          {count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <MiniMonth cursor={cursor} onPick={(d) => setCursor(d)} events={visible} />

            <div className="rounded-2xl border border-border bg-surface-2/40 p-3 text-xs text-muted-foreground">
              Mẹo: bấm vào một ngày trong lịch để xem chi tiết. Bộ lọc áp dụng cho cả hai chế độ
              xem.
            </div>
          </aside>

          {/* Calendar canvas */}
          <section className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCursor(new Date())}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2"
                >
                  Hôm nay
                </button>
                <button
                  onClick={goPrev}
                  className="rounded-lg border border-border bg-surface p-1.5 hover:bg-surface-2"
                  aria-label="Trước"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={goNext}
                  className="rounded-lg border border-border bg-surface p-1.5 hover:bg-surface-2"
                  aria-label="Sau"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="min-w-0 text-sm font-semibold capitalize">{monthLabel}</div>
              {isPending && (
                <span className="text-xs text-muted-foreground">Đang tải…</span>
              )}
              {isError && (
                <button
                  onClick={() => refetch()}
                  className="rounded-lg border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                >
                  Không tải được dữ liệu · Thử lại
                </button>
              )}
              {!isPending && !isError && events.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Không có sự kiện trong khoảng thời gian này
                </span>
              )}

              <div className="relative ml-auto hidden min-w-0 sm:block sm:max-w-xs sm:flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tìm sự kiện…"
                  className="w-full rounded-lg bg-surface-2 py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
                <button
                  onClick={() => setView("month")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${view === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <CalendarDays className="h-3.5 w-3.5" /> Tháng
                </button>
                <button
                  onClick={() => setView("week")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${view === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <CalendarRange className="h-3.5 w-3.5" /> Tuần
                </button>
              </div>
            </div>

            {urlDay && (
              <button
                onClick={() =>
                  navigateCalendar({
                    to: "/calendar",
                    search: (p: { view?: "week"; kind?: "meeting"; day?: string }) => ({
                      ...p,
                      day: undefined,
                    }),
                  })
                }
                className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs text-primary hover:bg-primary/25"
              >
                Chỉ ngày {urlDay} · Bỏ lọc ✕
              </button>
            )}
            {view === "month" ? (
              <MonthGrid
                cursor={cursor}
                today={today}
                events={visible}
                onSelect={setSelected}
                selected={selected}
              />
            ) : (
              <WeekGrid
                cursor={cursor}
                today={today}
                events={visible}
                onSelect={setSelected}
                selected={selected}
              />
            )}
          </section>
        </div>

        {selectedEvent && (
          <EventDetail event={selectedEvent} onClose={() => setSelected(null)} />
        )}

        <CreateEventDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          defaultDate={cursor}
        />
      </main>
    </div>
  );
}

function MiniMonth({
  cursor,
  onPick,
  events,
}: {
  cursor: Date;
  onPick: (d: Date) => void;
  events: CalEvent[];
}) {
  const start = startOfMonthGrid(cursor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const monthIdx = cursor.getMonth();
  const today = new Date();
  const eventDates = new Set(events.map((e) => e.date));
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="mb-1.5 text-xs font-semibold capitalize">
        {cursor.toLocaleDateString("vi-VN", { month: "long", year: "numeric" })}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
        {days.map((d, i) => {
          const inMonth = d.getMonth() === monthIdx;
          const isToday = sameDay(d, today);
          const has = eventDates.has(isoDate(d));
          return (
            <button
              key={i}
              onClick={() => onPick(d)}
              className={`relative aspect-square rounded-md text-[11px] transition-colors ${
                isToday
                  ? "bg-primary text-primary-foreground"
                  : inMonth
                    ? "text-foreground hover:bg-surface-2"
                    : "text-muted-foreground/50 hover:bg-surface-2"
              }`}
            >
              {d.getDate()}
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

function MonthGrid({
  cursor,
  today,
  events,
  onSelect,
  selected,
}: {
  cursor: Date;
  today: Date;
  events: CalEvent[];
  onSelect: (id: string) => void;
  selected: string | null;
}) {
  const start = startOfMonthGrid(cursor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const monthIdx = cursor.getMonth();
  const byDate = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    events.forEach((e) => {
      m.set(e.date, [...(m.get(e.date) ?? []), e]);
    });
    return m;
  }, [events]);

  return (
    <div className="grid grid-cols-7 border-l border-border">
      {["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"].map((d) => (
        <div
          key={d}
          className="border-b border-r border-border bg-surface-2/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {d}
        </div>
      ))}
      {days.map((d, i) => {
        const inMonth = d.getMonth() === monthIdx;
        const isToday = sameDay(d, today);
        const list = byDate.get(isoDate(d)) ?? [];
        return (
          <div
            key={i}
            className={`min-h-[110px] border-b border-r border-border p-1.5 text-xs ${inMonth ? "bg-surface" : "bg-surface-2/30"}`}
          >
            <div className="mb-1 flex items-center justify-between px-1">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : inMonth
                      ? "text-foreground"
                      : "text-muted-foreground/60"
                }`}
              >
                {d.getDate()}
              </span>
              {list.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{list.length - 3}</span>
              )}
            </div>
            <div className="space-y-1">
              {list.slice(0, 3).map((e) => {
                const meta = KIND_META[e.kind];
                const active = selected === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => onSelect(e.id)}
                    className={`flex w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-left text-[11px] transition-colors ${meta.chip} ${active ? `ring-2 ${meta.ring}` : ""}`}
                    title={e.title}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                    {e.start && (
                      <span className="shrink-0 font-medium tabular-nums opacity-80">
                        {e.start}
                      </span>
                    )}
                    <span className="truncate">{e.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekGrid({
  cursor,
  today,
  events,
  onSelect,
  selected,
}: {
  cursor: Date;
  today: Date;
  events: CalEvent[];
  onSelect: (id: string) => void;
  selected: string | null;
}) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 12 }, (_, i) => i + 7); // 7..18
  const byDate = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    events.forEach((e) => {
      m.set(e.date, [...(m.get(e.date) ?? []), e]);
    });
    return m;
  }, [events]);

  const parseHour = (s?: string) => {
    if (!s) return null;
    const [h, m] = s.split(":").map(Number);
    return h + (m ?? 0) / 60;
  };

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[900px] grid-cols-[64px_repeat(7,1fr)] border-l border-border">
        <div className="border-b border-r border-border bg-surface-2/40" />
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className="border-b border-r border-border bg-surface-2/40 px-3 py-2 text-center"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {d.toLocaleDateString("vi-VN", { weekday: "short" })}
              </div>
              <div
                className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${isToday ? "bg-primary text-primary-foreground" : ""}`}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}

        {/* All-day row */}
        <div className="flex items-start justify-end border-b border-r border-border bg-surface px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Cả ngày
        </div>
        {days.map((d) => {
          const list = (byDate.get(isoDate(d)) ?? []).filter((e) => e.allDay || !e.start);
          return (
            <div
              key={`ad-${d.toISOString()}`}
              className="space-y-1 border-b border-r border-border bg-surface p-1.5"
            >
              {list.map((e) => {
                const meta = KIND_META[e.kind];
                const active = selected === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => onSelect(e.id)}
                    className={`flex w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-left text-[11px] ${meta.chip} ${active ? `ring-2 ${meta.ring}` : ""}`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                    <span className="truncate">{e.title}</span>
                  </button>
                );
              })}
            </div>
          );
        })}

        {/* Hour grid */}
        <div className="contents">
          {hours.map((h) => (
            <div key={`row-${h}`} className="contents">
              <div className="flex items-start justify-end border-b border-r border-border bg-surface px-2 pt-1 text-[10px] text-muted-foreground">
                {pad(h)}:00
              </div>
              {days.map((d) => {
                const list = (byDate.get(isoDate(d)) ?? []).filter((e) => {
                  if (e.allDay) return false;
                  const hh = parseHour(e.start);
                  return hh !== null && Math.floor(hh) === h;
                });
                return (
                  <div
                    key={`${h}-${d.toISOString()}`}
                    className="relative min-h-[56px] border-b border-r border-border bg-surface hover:bg-surface-2/30"
                  >
                    <div className="space-y-1 p-1">
                      {list.map((e) => {
                        const meta = KIND_META[e.kind];
                        const active = selected === e.id;
                        return (
                          <button
                            key={e.id}
                            onClick={() => onSelect(e.id)}
                            className={`flex w-full flex-col gap-0.5 rounded-md border px-1.5 py-1 text-left text-[11px] ${meta.chip} ${active ? `ring-2 ${meta.ring}` : ""}`}
                          >
                            <span className="truncate font-medium">{e.title}</span>
                            {e.start && (
                              <span className="text-[10px] opacity-80">
                                {e.start}
                                {e.end ? ` – ${e.end}` : ""}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventDetail({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  const meetingId =
    event.kind === "meeting" && event.id.startsWith("meeting:") ? event.id.slice("meeting:".length) : null;

  const fetchMeeting = useServerFn(getMeeting);
  const detailQ = useQuery({
    queryKey: ["calendar-meeting", meetingId],
    queryFn: () => fetchMeeting({ data: { meetingId: meetingId! } }),
    enabled: !!meetingId,
    staleTime: 30_000,
  });
  const detail = detailQ.data as
    | { agenda: string | null; status: string; location: string | null; conference_provider: string | null }
    | undefined;

  const STATUS_LABEL: Record<string, string> = {
    scheduled: "Đã lên lịch",
    live: "Đang diễn ra",
    ended: "Đã kết thúc",
    canceled: "Đã huỷ",
  };
  const canJoin = !!meetingId && detail?.status !== "canceled" && detail?.status !== "ended";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 p-4 sm:items-center sm:justify-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 border-b border-border p-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.chip} border`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {meta.label}
              {detail?.status && (
                <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px]">
                  {STATUS_LABEL[detail.status] ?? detail.status}
                </span>
              )}
            </div>
            <div className="truncate text-base font-semibold">{event.title}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2" aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              {new Date(event.date).toLocaleDateString("vi-VN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {event.allDay
                ? " · Cả ngày"
                : event.start
                  ? ` · ${event.start}${event.end ? ` – ${event.end}` : ""}`
                  : ""}
            </span>
          </div>
          {(event.location || detail?.location) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{event.location ?? detail?.location}</span>
            </div>
          )}
          {detail?.conference_provider && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Radio className="h-4 w-4" />
              <span className="uppercase">{detail.conference_provider}</span>
            </div>
          )}
          {event.project && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Flag className="h-4 w-4" />
              <span>{event.project}</span>
            </div>
          )}

          {meetingId && (
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Agenda
              </div>
              {detailQ.isPending ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải nội dung họp…
                </div>
              ) : detailQ.isError ? (
                <p className="text-xs text-destructive">Không tải được chi tiết cuộc họp.</p>
              ) : detail?.agenda ? (
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-sm text-foreground">
                  {detail.agenda}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Chưa có agenda cho cuộc họp này.</p>
              )}
            </div>
          )}

          {event.attendees && event.attendees.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <UsersIcon className="h-3.5 w-3.5" /> Thành viên ({event.attendees.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {event.attendees.map((a) => (
                  <div
                    key={a.seed}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-xs"
                  >
                    <img src={avatar(a.seed)} alt={a.name} className="h-5 w-5 rounded-full" />
                    {a.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Đóng
          </button>
          {meetingId ? (
            canJoin ? (
              <Link
                to="/meeting/$id"
                params={{ id: meetingId }}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Tham gia
              </Link>
            ) : (
              <Link
                to="/meeting/$id"
                params={{ id: meetingId }}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Xem chi tiết
              </Link>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
