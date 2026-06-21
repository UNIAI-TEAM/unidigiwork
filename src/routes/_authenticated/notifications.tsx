import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import { CATS, NOTIFS, catMeta, type Cat, type Notif } from "@/lib/notifications-data";

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
}: {
  n: Notif;
  selected: boolean;
  onToggle: () => void;
  onMarkRead: () => void;
}) {
  const meta = catMeta(n.cat);
  const Icon = meta.icon;
  return (
    <div
      className={`group flex items-start gap-3 border-b border-border/60 px-4 py-3 transition-colors hover:bg-surface-2/40 ${n.unread ? "bg-primary/[0.03]" : ""}`}
    >
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
  const [tab, setTab] = useState<"inbox" | "unread" | "mentions" | "archived">("inbox");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Notif[]>(NOTIFS);
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (cat !== "all" && n.cat !== cat) return false;
      if (tab === "unread" && !n.unread) return false;
      if (tab === "mentions" && n.cat !== "mention") return false;
      if (tab === "archived") return false;
      if (q && !`${n.title} ${n.body} ${n.actor ?? ""}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [items, cat, tab, q]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setPage(1);
  }, [cat, tab, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage],
  );

  const groups = useMemo(() => {
    const map = new Map<Notif["group"], Notif[]>();
    pageItems.forEach((n) => {
      map.set(n.group, [...(map.get(n.group) ?? []), n]);
    });
    return Array.from(map.entries());
  }, [pageItems]);

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
    const set = new Set(ids);
    setItems((arr) => arr.map((n) => (set.has(n.id) ? { ...n, unread: false } : n)));
  };
  const markAllRead = () => setItems((arr) => arr.map((n) => ({ ...n, unread: false })));
  const removeItems = (ids: string[]) => {
    const set = new Set(ids);
    setItems((arr) => arr.filter((n) => !set.has(n.id)));
    setSelected(new Set());
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
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
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-2">
                <Filter className="h-3.5 w-3.5" /> Bộ lọc
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
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
                  <Bell className="h-6 w-6" />
                </div>
                <div className="text-sm font-medium">Không có thông báo nào</div>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Bạn đã xem hết các thông báo phù hợp với bộ lọc hiện tại.
                </p>
              </div>
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
