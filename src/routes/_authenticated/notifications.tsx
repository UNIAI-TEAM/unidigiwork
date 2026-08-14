import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Filter,
  CheckCheck,
  Settings2,
  Search,
  Trash2,
  Circle,
  Archive,
  ChevronLeft,
  ChevronRight,
  Inbox,
  SearchX,
  RotateCcw,
  ArrowLeft,
  ArrowUpDown,
  Pin,
  PinOff,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import {
  CATS,
  catMeta,
  mapNotifRow,
  PRIORITY_DOT,
  PRIORITY_LABELS,
  PRIORITY_TINT,
  sortNotifRows,
  type Cat,
  type Notif,
  type NotifPriority,
  type NotifSortMode,
} from "@/lib/notifications-data";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  restoreNotifications,
  unmarkNotificationsRead,
} from "@/lib/api/notifications.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Thông báo — UNIWORK" },
      {
        name: "description",
        content: "Trung tâm thông báo: nhắc tên, nhiệm vụ, họp, tài liệu và hệ thống.",
      },
    ],
  }),
  component: NotificationsPage,
});

function NotifRow({
  n,
  selected,
  onToggle,
  onMarkRead,
  pinned,
  onTogglePin,
}: {
  n: Notif;
  selected: boolean;
  onToggle: () => void;
  onMarkRead: () => void;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const meta = catMeta(n.cat);
  const Icon = meta.icon;
  return (
    <div
      className={`group relative flex items-start gap-3 border-b border-border/60 pl-1 pr-4 py-3 transition-colors hover:bg-surface-2/40 ${n.unread ? "bg-primary/[0.03]" : ""}`}
    >
      {/* Priority indicator bar */}
      <span
        className={`absolute left-0 top-0 bottom-0 w-1 rounded-l ${n.priority ? PRIORITY_DOT[n.priority] : "bg-transparent"}`}
        aria-hidden="true"
      />
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-1.5 h-4 w-4 rounded border-border bg-surface accent-primary"
      />
      <Link
        to="/notifications/$id"
        params={{ id: n.id }}
        onClick={() => n.unread && onMarkRead()}
        className="relative shrink-0"
      >
        {n.actor ? (
          <img src={avatar(n.actor)} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 ${meta.tint}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
        {n.actor && (
          <span
            className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background ring-2 ring-background ${meta.tint}`}
          >
            <Icon className="h-3 w-3" />
          </span>
        )}
      </Link>
      <Link
        to="/notifications/$id"
        params={{ id: n.id }}
        onClick={() => n.unread && onMarkRead()}
        className="min-w-0 flex-1"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 text-sm leading-snug">
            {n.actor && <span className="font-semibold">{n.actor}</span>}{" "}
            <span className={n.unread ? "text-foreground" : "text-muted-foreground"}>
              {n.title}
            </span>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${n.priority ? PRIORITY_TINT[n.priority] : PRIORITY_TINT["normal"]}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${n.priority ? PRIORITY_DOT[n.priority] : PRIORITY_DOT["normal"]}`} />
            {n.priority ? PRIORITY_LABELS[n.priority] : PRIORITY_LABELS["normal"]}
          </span>
          {n.important && (
            <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
              <AlertTriangle className="h-3 w-3" /> Quan trọng
            </span>
          )}
          {n.unread && <Circle className="mt-1 h-2 w-2 shrink-0 fill-primary text-primary" />}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{n.time}</span>
          <span className="hidden h-1 w-1 rounded-full bg-muted-foreground/60 sm:inline-block" />
          <span className="hidden text-primary group-hover:underline sm:inline">Xem chi tiết</span>
          {n.unread && (
            <span
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMarkRead();
              }}
              className="hidden text-muted-foreground hover:text-foreground sm:inline"
            >
              Đánh dấu đã đọc
            </span>
          )}
        </div>
      </Link>
      <div className="hidden items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
        <button
          title={pinned ? "Bỏ ghim" : "Ghim lên đầu"}
          onClick={onTogglePin}
          className={`rounded p-1.5 hover:bg-surface ${pinned ? "text-primary opacity-100" : "text-muted-foreground hover:text-primary"}`}
        >
          {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
        {n.unread && (
          <button
            title="Đánh dấu đã đọc"
            onClick={onMarkRead}
            className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-primary"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          title="Lưu trữ"
          className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
        <button
          title="Xóa"
          className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function NotificationsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cat, setCat] = useState<Cat>("all");
  const [tab, setTab] = useState<"inbox" | "unread" | "read" | "mentions" | "archived">("inbox");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const [sortMode, setSortMode] = useState<NotifSortMode>(() => {
    if (typeof window === "undefined") return "recent";
    return window.localStorage.getItem("notifications.sort") === "priority"
      ? "priority"
      : "recent";
  });
  const [priorityFilter, setPriorityFilter] = useState<"all" | "important" | NotifPriority>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const toggleSort = () => {
    const next: NotifSortMode = sortMode === "recent" ? "priority" : "recent";
    setSortMode(next);
    try {
      window.localStorage.setItem("notifications.sort", next);
    } catch {
      /* ignore */
    }
  };

  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(),
  });
  const items = useMemo<Notif[]>(
    () => sortNotifRows(rows, sortMode).map(mapNotifRow),
    [rows, sortMode],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  // Realtime: khi có notification mới/sửa/xóa thì refetch danh sách
  useEffect(() => {
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const readMut = useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead({ data: { ids } }),
    onSuccess: invalidate,
  });
  const readAllMut = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (ids: string[]) => deleteNotifications({ data: { ids } }),
    onSuccess: invalidate,
  });
  const unreadMut = useMutation({
    mutationFn: (ids: string[]) => unmarkNotificationsRead({ data: { ids } }),
    onSuccess: invalidate,
  });
  const restoreMut = useMutation({
    mutationFn: (rows: Array<Record<string, unknown>>) =>
      restoreNotifications({ data: { rows } as never }),
    onSuccess: invalidate,
  });

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (cat !== "all" && n.cat !== cat) return false;
      if (tab === "unread" && !n.unread) return false;
      if (tab === "read" && n.unread) return false;
      if (tab === "mentions" && n.cat !== "mention") return false;
      if (tab === "archived") return false;
      if (q && !`${n.title} ${n.body} ${n.actor ?? ""}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      if (priorityFilter === "important") return !!n.important;
      if (priorityFilter !== "all" && n.priority !== priorityFilter) return false;
      return true;
    });
  }, [items, cat, tab, q, priorityFilter]);

  // Khi bộ lọc ưu tiên đang hoạt động, sắp xếp từ thấp đến cao
  const displayItems = useMemo(() => {
    if (priorityFilter === "all") return filtered;
    const rank: Record<NotifPriority, number> = { low: 1, normal: 2, high: 3, urgent: 4 };
    return [...filtered].sort((a, b) => {
      if (priorityFilter === "important") return Number(b.important) - Number(a.important);
      return (rank[a.priority ?? "normal"] ?? 2) - (rank[b.priority ?? "normal"] ?? 2);
    });
  }, [filtered, priorityFilter]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setPage(1);
  }, [cat, tab, q, priorityFilter]);

  const totalPages = Math.max(1, Math.ceil(displayItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => displayItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [displayItems, currentPage],
  );

  const groups = useMemo(() => {
    if (sortMode === "priority") {
      return pageItems.length ? ([["Theo ưu tiên", pageItems]] as [string, Notif[]][]) : [];
    }
    const map = new Map<string, Notif[]>();
    pageItems.forEach((n) => {
      map.set(n.group, [...(map.get(n.group) ?? []), n]);
    });
    return Array.from(map.entries());
  }, [pageItems, sortMode]);

  const unreadCount = items.filter((n) => n.unread).length;

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const markRead = (ids: string[]) => {
    if (ids.length === 0) return;
    // Only undo the ones that were actually unread before
    const unreadIds = rows.filter((r) => ids.includes(r.id) && !r.is_read).map((r) => r.id);
    readMut.mutate(ids, {
      onSuccess: () => {
        if (unreadIds.length === 0) return;
        toast.success(`Đã đánh dấu đã đọc ${unreadIds.length} thông báo`, {
          action: {
            label: "Hoàn tác",
            onClick: () => unreadMut.mutate(unreadIds),
          },
          duration: 6000,
        });
      },
    });
  };
  const markAllRead = () => {
    const unreadIds = rows.filter((r) => !r.is_read).map((r) => r.id);
    readAllMut.mutate(undefined, {
      onSuccess: () => {
        if (unreadIds.length === 0) return;
        toast.success(`Đã đánh dấu đã đọc tất cả (${unreadIds.length})`, {
          action: {
            label: "Hoàn tác",
            onClick: () => unreadMut.mutate(unreadIds),
          },
          duration: 6000,
        });
      },
    });
  };
  const removeItems = (ids: string[]) => {
    if (ids.length === 0) return;
    // Snapshot rows before deletion so we can restore them
    const snapshot = rows.filter((r) => ids.includes(r.id));
    deleteMut.mutate(ids, {
      onSuccess: () => {
        toast.success(`Đã xóa ${snapshot.length} thông báo`, {
          action: {
            label: "Hoàn tác",
            onClick: () =>
              restoreMut.mutate(
                snapshot.map((r) => ({
                  id: r.id,
                  workspace_id: r.workspace_id,
                  type: r.type as
                    | "mention"
                    | "task"
                    | "meeting"
                    | "document"
                    | "workflow"
                    | "system"
                    | "email",
                  title: r.title,
                  body: r.body,
                  link: r.link,
                  meta: r.meta,
                  is_read: r.is_read,
                  read_at: r.read_at,
                  created_at: r.created_at,
                })),
              ),
          },
          duration: 6000,
        });
      },
      onSettled: () => setSelected(new Set()),
    });
  };
  // Silence unused warning while loading state is not yet rendered.
  useEffect(() => void isLoading, [isLoading]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="notifications" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr]">
          {/* Left filter rail */}
          <aside className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Thông báo</h1>
              <p className="text-xs text-muted-foreground">
                {unreadCount} chưa đọc · {items.length} tổng cộng
              </p>
            </div>
            <nav className="space-y-1 rounded-2xl border border-border bg-surface p-2">
              {CATS.map((c) => {
                const count =
                    c.key === "all" ? items.length : items.filter((n) => n.cat === c.key).length;
                const active = cat === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => setCat(c.key)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
                  >
                    <c.icon className={`h-4 w-4 ${c.tint}`} />
                    <span className="flex-1 text-left">{c.label}</span>
                    <span
                      className={`rounded-full px-1.5 text-[11px] ${active ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </nav>
            <a
              href="/settings"
              className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/40 p-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              <Settings2 className="h-4 w-4" />
              Cấu hình kênh thông báo & tần suất
            </a>
          </aside>

          {/* Main list */}
          <section className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
                {(
                  [
                    { k: "inbox", l: "Hộp thư" },
                    { k: "unread", l: `Chưa đọc (${unreadCount})` },
                    { k: "read", l: `Đã đọc (${items.length - unreadCount})` },
                    { k: "mentions", l: "Nhắc tên" },
                    { k: "archived", l: "Đã lưu trữ" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setTab(t.k)}
                    className={`rounded-md px-3 py-1.5 ${tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t.l}
                  </button>
                ))}
              </div>
              <div className="relative ml-auto min-w-0 flex-1 sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tìm trong thông báo..."
                  className="w-full rounded-lg bg-surface-2 py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div className="relative">
                <button
                  onClick={() => setFilterOpen((o) => !o)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-2 ${priorityFilter !== "all" ? "border-primary/50 text-primary" : ""}`}
                >
                  <Filter className="h-3.5 w-3.5" />
                  {priorityFilter === "all" ? "Bộ lọc" : `Ưu tiên: ${PRIORITY_LABELS[priorityFilter]}`}
                </button>
                {filterOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setFilterOpen(false)}
                    />
                    <div className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-border bg-surface p-1 shadow-lg">
                      <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Mức độ ưu tiên
                      </div>
                      {(
                        [
                          { k: "all", l: "Tất cả mức ưu tiên" },
                          { k: "important", l: "Quan trọng" },
                          { k: "low", l: "Thấp" },
                          { k: "normal", l: "Bình thường" },
                          { k: "high", l: "Cao" },
                          { k: "urgent", l: "Khẩn cấp" },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.k}
                          onClick={() => {
                            setPriorityFilter(p.k as typeof priorityFilter);
                            setFilterOpen(false);
                          }}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${priorityFilter === p.k ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
                        >
                          {p.k !== "all" && (
                            <span
                              className={`h-2 w-2 rounded-full ${PRIORITY_DOT[p.k as NotifPriority | "important"]}`}
                            />
                          )}
                          {p.l}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={toggleSort}
                title={
                  sortMode === "recent"
                    ? "Đang sắp xếp: Mới nhất — bấm để đổi sang Ưu tiên"
                    : "Đang sắp xếp: Ưu tiên — bấm để đổi sang Mới nhất"
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-2"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {sortMode === "recent" ? "Mới nhất" : "Ưu tiên"}
              </button>
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Đánh dấu tất cả đã đọc
              </button>
            </div>

            {selected.size > 0 && (
              <div className="flex items-center gap-3 border-b border-border bg-primary/10 px-4 py-2 text-xs">
                <span className="font-medium">{selected.size} được chọn</span>
                <button
                  onClick={() => {
                    markRead(Array.from(selected));
                    setSelected(new Set());
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Đánh dấu đã đọc
                </button>
                <button className="text-muted-foreground hover:text-foreground">Lưu trữ</button>
                <button
                  onClick={() => removeItems(Array.from(selected))}
                  className="text-destructive hover:underline"
                >
                  Xóa
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="ml-auto text-muted-foreground hover:text-foreground"
                >
                  Bỏ chọn
                </button>
              </div>
            )}

            {groups.length === 0 ? (
              items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
                    <Inbox className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-medium">Chưa có thông báo nào</div>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Thông báo mới sẽ hiển thị khi có hoạt động liên quan đến bạn
                  </p>
                  <Link
                    to="/dashboard"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Về Trang chủ
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
                    <SearchX className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-medium">Không tìm thấy thông báo</div>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm
                  </p>
                  <button
                    onClick={() => {
                      setCat("all");
                      setTab("inbox");
                      setQ("");
                      setPriorityFilter("all");
                    }}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Xóa bộ lọc
                  </button>
                </div>
              )
            ) : (
              <>
              {groups.map(([g, list]) => (
                <div key={g}>
                  <div className="flex items-center gap-2 bg-surface-2/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g} <span className="text-muted-foreground/70">· {list.length}</span>
                  </div>
                  {list.map((n) => (
                    <NotifRow
                      key={n.id}
                      n={n}
                      selected={selected.has(n.id)}
                      onToggle={() => toggle(n.id)}
                      onMarkRead={() => markRead([n.id])}
                    />
                  ))}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <span>
                  Hiển thị{" "}
                  <span className="font-medium text-foreground">
                    {(currentPage - 1) * pageSize + 1}–
                    {Math.min(currentPage * pageSize, filtered.length)}
                  </span>{" "}
                  trong tổng {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Trước
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const p = i + 1;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`min-w-[28px] rounded-lg px-2 py-1 ${p === currentPage ? "bg-primary text-primary-foreground" : "border border-border bg-surface hover:bg-surface-2"}`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Sau <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
