import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bell, AtSign, CheckCircle2, Video, FileText, Workflow, MessageCircle,
  AlertTriangle, ShieldCheck, Filter, CheckCheck, Settings2, Search, Trash2,
  Circle, Archive,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Thông báo — UNIWORK" },
      { name: "description", content: "Trung tâm thông báo: nhắc tên, nhiệm vụ, họp, tài liệu và hệ thống." },
    ],
  }),
  component: NotificationsPage,
});

type Cat = "all" | "mention" | "task" | "meeting" | "document" | "workflow" | "system";

type Notif = {
  id: string;
  cat: Exclude<Cat, "all">;
  actor?: string;
  title: string;
  body: string;
  time: string;
  group: "Hôm nay" | "Hôm qua" | "Tuần này";
  unread?: boolean;
  important?: boolean;
};

const CATS: { key: Cat; label: string; icon: any; tint: string }[] = [
  { key: "all", label: "Tất cả", icon: Bell, tint: "text-foreground" },
  { key: "mention", label: "Nhắc tên", icon: AtSign, tint: "text-violet-300" },
  { key: "task", label: "Nhiệm vụ", icon: CheckCircle2, tint: "text-emerald-300" },
  { key: "meeting", label: "Họp", icon: Video, tint: "text-rose-300" },
  { key: "document", label: "Tài liệu", icon: FileText, tint: "text-sky-300" },
  { key: "workflow", label: "Quy trình", icon: Workflow, tint: "text-amber-300" },
  { key: "system", label: "Hệ thống", icon: ShieldCheck, tint: "text-primary" },
];

const NOTIFS: Notif[] = [
  { id: "1", cat: "mention", actor: "Trần Thị B", title: "đã nhắc bạn trong #dev-team", body: '"@Nguyễn Văn A vui lòng review PR #482 trước 17:00 nhé."', time: "5 phút trước", group: "Hôm nay", unread: true, important: true },
  { id: "2", cat: "task", actor: "Phạm Minh C", title: "đã giao nhiệm vụ cho bạn", body: "Thiết kế API Gateway v2.2 — hạn 15/06/2026", time: "32 phút trước", group: "Hôm nay", unread: true },
  { id: "3", cat: "meeting", title: "Sắp diễn ra: Sprint 6 Daily Standup", body: "Bắt đầu lúc 09:30 AM · 5 người tham gia", time: "1 giờ trước", group: "Hôm nay", unread: true },
  { id: "4", cat: "document", actor: "Phạm Minh C", title: "đã cập nhật tài liệu", body: "API_Gateway_Spec_v2.1.docx trong STOS Project", time: "2 giờ trước", group: "Hôm nay" },
  { id: "5", cat: "workflow", actor: "Lê Hoàng D", title: "cần bạn phê duyệt", body: "Approval — Leave Request của Nguyễn Hương (3 ngày)", time: "3 giờ trước", group: "Hôm nay", unread: true, important: true },
  { id: "6", cat: "system", title: "Bảo trì định kỳ hệ thống", body: "Hệ thống sẽ bảo trì vào 22:00 ngày 25/05/2026 (GMT+7), ngừng dịch vụ ~30 phút.", time: "Hôm qua, 18:00", group: "Hôm qua" },
  { id: "7", cat: "mention", actor: "Nguyễn Hương", title: "đã bình luận trong tài liệu", body: '"Phần API Gateway có thể chia nhỏ section 3 không?"', time: "Hôm qua, 14:22", group: "Hôm qua" },
  { id: "8", cat: "task", actor: "Trần Thị B", title: "đã hoàn thành nhiệm vụ", body: "Thiết kế UI Dashboard — STOS Project", time: "Hôm qua, 09:45", group: "Hôm qua" },
  { id: "9", cat: "meeting", title: "Tóm tắt cuộc họp: Review API Gateway", body: "5 quyết định, 7 hành động được tạo. Xem tóm tắt AI.", time: "Hôm qua, 11:30", group: "Hôm qua" },
  { id: "10", cat: "document", actor: "Bạn", title: "đã được chia sẻ tài liệu", body: "Kế hoạch tuyển dụng Q3 — UNI-HRM workspace", time: "T3, 16:10", group: "Tuần này" },
  { id: "11", cat: "system", title: "Đăng nhập thiết bị mới", body: "UNIWORK iOS · Hà Nội, Việt Nam · IP 14.232.xxx.12", time: "T2, 08:05", group: "Tuần này", important: true },
];

function iconFor(cat: Notif["cat"]) {
  return CATS.find((c) => c.key === cat)!;
}

function NotifRow({ n, selected, onToggle }: { n: Notif; selected: boolean; onToggle: () => void }) {
  const meta = iconFor(n.cat);
  const Icon = meta.icon;
  return (
    <div className={`group flex items-start gap-3 border-b border-border/60 px-4 py-3 transition-colors hover:bg-surface-2/40 ${n.unread ? "bg-primary/[0.03]" : ""}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1.5 h-4 w-4 rounded border-border bg-surface accent-primary" />
      <div className="relative shrink-0">
        {n.actor ? (
          <img src={avatar(n.actor)} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 ${meta.tint}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        {n.actor && (
          <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background ring-2 ring-background ${meta.tint}`}>
            <Icon className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 text-sm leading-snug">
            {n.actor && <span className="font-semibold">{n.actor}</span>}{" "}
            <span className={n.unread ? "text-foreground" : "text-muted-foreground"}>{n.title}</span>
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
          <button className="hidden text-primary hover:underline sm:inline">Xem chi tiết</button>
          <button className="hidden text-muted-foreground hover:text-foreground sm:inline">Đánh dấu đã đọc</button>
        </div>
      </div>
      <div className="hidden items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
        <button title="Lưu trữ" className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"><Archive className="h-3.5 w-3.5" /></button>
        <button title="Xóa" className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
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

  const filtered = useMemo(() => {
    return NOTIFS.filter((n) => {
      if (cat !== "all" && n.cat !== cat) return false;
      if (tab === "unread" && !n.unread) return false;
      if (tab === "mentions" && n.cat !== "mention") return false;
      if (tab === "archived") return false;
      if (q && !(`${n.title} ${n.body} ${n.actor ?? ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [cat, tab, q]);

  const groups = useMemo(() => {
    const map = new Map<Notif["group"], Notif[]>();
    filtered.forEach((n) => { map.set(n.group, [...(map.get(n.group) ?? []), n]); });
    return Array.from(map.entries());
  }, [filtered]);

  const unreadCount = NOTIFS.filter((n) => n.unread).length;

  const toggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active={"dashboard" as any} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr]">
          {/* Left filter rail */}
          <aside className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Thông báo</h1>
              <p className="text-xs text-muted-foreground">{unreadCount} chưa đọc · {NOTIFS.length} tổng cộng</p>
            </div>
            <nav className="space-y-1 rounded-2xl border border-border bg-surface p-2">
              {CATS.map((c) => {
                const count = c.key === "all" ? NOTIFS.length : NOTIFS.filter((n) => n.cat === c.key).length;
                const active = cat === c.key;
                return (
                  <button key={c.key} onClick={() => setCat(c.key)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}>
                    <c.icon className={`h-4 w-4 ${c.tint}`} />
                    <span className="flex-1 text-left">{c.label}</span>
                    <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}>{count}</span>
                  </button>
                );
              })}
            </nav>
            <a href="/settings" className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/40 p-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
              <Settings2 className="h-4 w-4" />
              Cấu hình kênh thông báo & tần suất
            </a>
          </aside>

          {/* Main list */}
          <section className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
                {([
                  { k: "inbox", l: "Hộp thư" },
                  { k: "unread", l: `Chưa đọc (${unreadCount})` },
                  { k: "mentions", l: "Nhắc tên" },
                  { k: "archived", l: "Đã lưu trữ" },
                ] as const).map((t) => (
                  <button key={t.k} onClick={() => setTab(t.k)}
                    className={`rounded-md px-3 py-1.5 ${tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t.l}</button>
                ))}
              </div>
              <div className="relative ml-auto min-w-0 flex-1 sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong thông báo..."
                  className="w-full rounded-lg bg-surface-2 py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-2">
                <Filter className="h-3.5 w-3.5" /> Bộ lọc
              </button>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
                <CheckCheck className="h-3.5 w-3.5" /> Đánh dấu tất cả đã đọc
              </button>
            </div>

            {selected.size > 0 && (
              <div className="flex items-center gap-3 border-b border-border bg-primary/10 px-4 py-2 text-xs">
                <span className="font-medium">{selected.size} được chọn</span>
                <button className="text-muted-foreground hover:text-foreground">Đánh dấu đã đọc</button>
                <button className="text-muted-foreground hover:text-foreground">Lưu trữ</button>
                <button className="text-destructive hover:underline">Xóa</button>
                <button onClick={() => setSelected(new Set())} className="ml-auto text-muted-foreground hover:text-foreground">Bỏ chọn</button>
              </div>
            )}

            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
                  <Bell className="h-6 w-6" />
                </div>
                <div className="text-sm font-medium">Không có thông báo nào</div>
                <p className="max-w-xs text-xs text-muted-foreground">Bạn đã xem hết các thông báo phù hợp với bộ lọc hiện tại.</p>
              </div>
            ) : (
              groups.map(([g, items]) => (
                <div key={g}>
                  <div className="flex items-center gap-2 bg-surface-2/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g} <span className="text-muted-foreground/70">· {items.length}</span>
                  </div>
                  {items.map((n) => (
                    <NotifRow key={n.id} n={n} selected={selected.has(n.id)} onToggle={() => toggle(n.id)} />
                  ))}
                </div>
              ))
            )}
          </section>
        </div>
      </main>
    </div>
  );
}