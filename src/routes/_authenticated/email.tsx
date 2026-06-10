import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Mail, Search, Plus, ChevronDown, MoreHorizontal, Inbox, Star, Send, FileEdit,
  Trash2, Archive, AlertOctagon, Paperclip, RefreshCw, Filter, ArrowUpDown,
  Reply, ReplyAll, Forward, Tag, Sparkles, Bot, FileText, FileSpreadsheet,
  Download, ArrowLeft, MailOpen, X, Clock, AlertCircle, Check, Settings2,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ComposeEmailDialog,
  AdvancedFilterDialog,
  AiAssistantDialog,
  LabelsRulesDialog,
  EMPTY_FILTERS,
  type AdvancedFilters,
  type LabelDef,
  type RuleDef,
} from "@/components/email-features";

export const Route = createFileRoute("/_authenticated/email")({
  head: () => ({
    meta: [
      { title: "Email Hub — UNIWORK" },
      { name: "description", content: "Quản lý toàn bộ email từ Microsoft 365, Gmail và các nguồn khác tại một nơi với trợ lý AI Email Assistant." },
    ],
  }),
  component: EmailHubPage,
});

const MAILBOXES = [
  { key: "inbox", label: "Hộp đến", icon: Inbox, count: 128, active: true },
  { key: "starred", label: "Quan trọng", icon: Star, count: 12 },
  { key: "sent", label: "Đã gửi", icon: Send, count: 65 },
  { key: "drafts", label: "Bản nháp", icon: FileEdit, count: 8 },
  { key: "trash", label: "Đã xóa", icon: Trash2, count: 4 },
  { key: "archive", label: "Lưu trữ", icon: Archive, count: 37 },
  { key: "spam", label: "Spam", icon: AlertOctagon, count: 3 },
  { key: "bin", label: "Thùng rác", icon: Trash2, count: 2 },
];

const INITIAL_LABELS: LabelDef[] = [
  { name: "Dự án STOS", color: "bg-emerald-500", count: 24 },
  { name: "Khách hàng", color: "bg-amber-500", count: 18 },
  { name: "Hợp đồng", color: "bg-violet-500", count: 15 },
  { name: "Nhân sự", color: "bg-sky-500", count: 6 },
  { name: "Hóa đơn", color: "bg-rose-500", count: 9 },
] as any;

const ACCOUNTS = [
  { provider: "M365", label: "M", color: "bg-sky-600", email: "nguyenvana@ubos.vn", count: 128 },
  { provider: "Gmail", label: "G", color: "bg-rose-500", email: "nguyenvana@ubos.vn", count: 46 },
];

type Email = {
  id: string;
  from: string;
  subject: string;
  preview: string;
  time: string;
  group: "Hôm nay" | "Hôm qua" | "Tuần này";
  unread?: boolean;
  starred?: boolean;
  hasAttachment?: boolean;
  selected?: boolean;
  labels?: string[];
};

const EMAILS: Email[] = [
  { id: "1", from: "Lê Minh Đức", subject: "RFQ - Hệ thống máy chủ cho dự án STOS", preview: "Kính gửi anh/chị, Chúng tôi xin gửi yêu cầu báo giá...", time: "10:24 AM", group: "Hôm nay", unread: true, starred: true, hasAttachment: true, selected: true, labels: ["Dự án STOS"] },
  { id: "2", from: "Trần Thùy Linh", subject: "Review hợp đồng triển khai Smart University", preview: "Anh vui lòng xem xét và phản hồi các nội dung...", time: "09:15 AM", group: "Hôm nay", unread: true, starred: true, labels: ["Hợp đồng", "Khách hàng"] },
  { id: "3", from: "Vũ Hoàng Nam", subject: "Yêu cầu phê duyệt ngân sách Q2/2025", preview: "Theo kế hoạch, chúng tôi đề xuất ngân sách...", time: "08:47 AM", group: "Hôm nay", hasAttachment: true, labels: ["Dự án STOS"] },
  { id: "4", from: "Nguyễn Lan Anh", subject: "Kế hoạch đào tạo nhân sự tháng 6", preview: "Danh sách học viên và nội dung đào tạo chi tiết...", time: "Yesterday", group: "Hôm qua", starred: true, labels: ["Nhân sự"] },
  { id: "5", from: "Phạm Quốc Huy", subject: "Re: Hợp đồng bảo trì hệ thống", preview: "Cảm ơn anh. Chúng tôi sẽ xử lý trong hôm nay...", time: "Yesterday", group: "Hôm qua", labels: ["Hợp đồng"] },
  { id: "6", from: "Đỗ Thành Công", subject: "Hóa đơn VAT số 2025-06-001", preview: "Đính kèm hóa đơn VAT và bảng kê chi tiết.", time: "12/05/2025", group: "Tuần này", hasAttachment: true, labels: ["Hóa đơn", "Khách hàng"] },
  { id: "7", from: "support@cloudvendor.com", subject: "Thông báo nâng cấp dịch vụ", preview: "Kính gửi Quý khách hàng, Chúng tôi xin thông...", time: "12/05/2025", group: "Tuần này", labels: ["Khách hàng"] },
];

const QUICK_SUMMARY = [
  { label: "Email cần phản hồi", value: 5 },
  { label: "Chờ xử lý", value: 12 },
  { label: "Email quan trọng", value: 3 },
  { label: "Email từ khách hàng", value: 7 },
];

const PRIORITY = [
  { from: "Lê Minh Đức", subject: "RFQ - Hệ thống máy chủ cho dự án STOS", time: "10:24 AM", level: "Cao", tint: "bg-rose-500/15 text-rose-300" },
  { from: "Trần Thùy Linh", subject: "Review hợp đồng triển khai Smart University", time: "09:15 AM", level: "Trung bình", tint: "bg-amber-500/15 text-amber-300" },
  { from: "Vũ Hoàng Nam", subject: "Yêu cầu phê duyệt ngân sách Q2/2025", time: "08:47 AM", level: "Trung bình", tint: "bg-amber-500/15 text-amber-300" },
];

const STATS = [
  { label: "Đã nhận", value: 210, pct: 59, color: "#7c3aed" },
  { label: "Đã gửi", value: 80, pct: 22, color: "#10b981" },
  { label: "Trả lời", value: 46, pct: 13, color: "#f59e0b" },
  { label: "Khác", value: 20, pct: 6, color: "#94a3b8" },
];

function DonutChart() {
  const total = STATS.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className="relative h-[140px] w-[140px]">
      <svg viewBox="0 0 120 120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--surface-2))" strokeWidth="14" />
        {STATS.map((s, i) => {
          const len = (s.value / total) * c;
          const off = (acc / total) * c;
          acc += s.value;
          return <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl font-bold tabular-nums">{total + 20}</div>
        <div className="text-[10px] text-muted-foreground">Email</div>
      </div>
    </div>
  );
}

function EmailHubPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeMailbox, setActiveMailbox] = useState("inbox");
  const [selected, setSelected] = useState("1");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLabel, setFilterLabel] = useState<string | null>(null);
  const [filterUnread, setFilterUnread] = useState(false);
  const [sortBy, setSortBy] = useState<"time" | "priority">("time");
  const [labels, setLabels] = useState<any[]>(INITIAL_LABELS);
  const [rules, setRules] = useState<RuleDef[]>([
    { id: "r1", name: "Email từ STOS → gắn nhãn Dự án STOS", whenField: "from", whenContains: "@stos.vn", thenAction: "label", thenValue: "Dự án STOS", active: true },
    { id: "r2", name: "Email hóa đơn → lưu trữ", whenField: "subject", whenContains: "hóa đơn", thenAction: "archive", thenValue: "", active: false },
  ]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedFilters>(EMPTY_FILTERS);
  const selectedEmail = EMAILS.find((e) => e.id === selected) ?? EMAILS[0];

  function timeSortValue(e: Email): number {
    const groupWeight = e.group === "Hôm nay" ? 3 : e.group === "Hôm qua" ? 2 : 1;
    if (e.time.includes("AM") || e.time.includes("PM")) {
      const m = e.time.match(/(\d+):(\d+)/);
      if (m) {
        let hour = parseInt(m[1]);
        const minute = parseInt(m[2]);
        if (e.time.includes("PM") && hour !== 12) hour += 12;
        if (e.time.includes("AM") && hour === 12) hour = 0;
        return groupWeight * 10000 + hour * 60 + minute;
      }
    }
    return groupWeight * 10000;
  }

  function prioritySortValue(e: Email): number {
    if (e.unread && e.starred) return 3;
    if (e.unread) return 2;
    if (e.starred) return 1;
    return 0;
  }

  const filteredEmails = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = EMAILS.filter((e) => {
      const matchQuery =
        !q ||
        e.from.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        e.preview.toLowerCase().includes(q);
      const matchLabel = !filterLabel || (e.labels?.includes(filterLabel) ?? false);
      const matchUnread = !filterUnread || e.unread;
      const a = advanced;
      const matchAdvKeyword = !a.keyword || (
        e.subject.toLowerCase().includes(a.keyword.toLowerCase()) ||
        e.preview.toLowerCase().includes(a.keyword.toLowerCase())
      );
      const matchAdvFrom = !a.from || e.from.toLowerCase().includes(a.from.toLowerCase());
      const matchAdvAttach = !a.hasAttachment || !!e.hasAttachment;
      const matchAdvLabels = a.labels.length === 0 || a.labels.every((l) => e.labels?.includes(l));
      return matchQuery && matchLabel && matchUnread && matchAdvKeyword && matchAdvFrom && matchAdvAttach && matchAdvLabels;
    });
    return list.slice().sort((a, b) => {
      if (sortBy === "priority") {
        return prioritySortValue(b) - prioritySortValue(a);
      }
      return timeSortValue(b) - timeSortValue(a);
    });
  }, [searchQuery, filterLabel, filterUnread, sortBy]);

  const groups: Record<string, Email[]> = {};
  if (sortBy === "priority") {
    groups["Theo mức độ ưu tiên"] = filteredEmails;
  } else {
    filteredEmails.forEach((e) => {
      groups[e.group] = groups[e.group] || [];
      groups[e.group].push(e);
    });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="email" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="flex min-w-0 flex-1 overflow-hidden">
          {/* Mailboxes column */}
          <aside className="hidden w-[260px] shrink-0 flex-col border-r border-border bg-surface md:flex">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Mail className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-base font-semibold">Email Hub</div>
                  <div className="text-[11px] text-muted-foreground">Tất cả email của bạn tại một nơi</div>
                </div>
              </div>
            </div>

            <div className="px-3 py-3">
              <div className="flex items-center gap-1">
                <button onClick={() => setComposeOpen(true)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <FileEdit className="h-4 w-4" /> Soạn email
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary px-2 text-primary-foreground hover:bg-primary/90">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <button onClick={() => setLabelsOpen(true)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-surface-2/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                <Settings2 className="h-3.5 w-3.5" /> Nhãn & Quy tắc tự động
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <div className="px-2 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mailboxes</div>
              <ul className="space-y-0.5">
                {MAILBOXES.map((m) => {
                  const Icon = m.icon;
                  const active = activeMailbox === m.key;
                  return (
                    <li key={m.key}>
                      <button onClick={() => setActiveMailbox(m.key)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm ${active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}>
                        <Icon className="h-[18px] w-[18px]" />
                        <span className="flex-1 text-left">{m.label}</span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">{m.count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between px-2 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Labels</span>
                <button className="rounded p-0.5 hover:bg-surface-2"><ChevronDown className="h-3 w-3" /></button>
              </div>
              <ul className="space-y-0.5">
                {labels.map((l: any) => {
                  const active = filterLabel === l.name;
                  return (
                    <li key={l.name}>
                      <button
                        onClick={() => setFilterLabel(active ? null : l.name)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm ${active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-sm ${l.color}`} />
                        <span className="flex-1 text-left">{l.name}</span>
                        <span className="text-[11px] tabular-nums">{l.count}</span>
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                    <Plus className="h-3.5 w-3.5" />
                    <span onClick={(e) => { e.stopPropagation(); setLabelsOpen(true); }}>More</span>
                  </button>
                </li>
              </ul>

              <div className="flex items-center justify-between px-2 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Accounts</span>
                <button className="rounded p-0.5 hover:bg-surface-2"><Plus className="h-3 w-3" /></button>
              </div>
              <ul className="space-y-0.5">
                {ACCOUNTS.map((a, i) => (
                  <li key={i}>
                    <button className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                      <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold text-white ${a.color}`}>{a.label}</span>
                      <span className="flex-1 truncate text-left">{a.email}</span>
                      <span className="text-[11px] tabular-nums">{a.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-border px-4 py-3">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Đã dùng 28.4 GB / 100 GB</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-primary" style={{ width: "28%" }} />
              </div>
            </div>
          </aside>

          {/* Email list column */}
          <section className="hidden w-[360px] shrink-0 flex-col border-r border-border bg-background lg:flex">
            <div className="border-b border-border px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo người gửi, tiêu đề, nội dung..."
                  className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <button
                  onClick={() => setFilterUnread((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${filterUnread ? "border-primary bg-primary/15 text-foreground" : "border-border bg-surface hover:bg-surface-2"}`}
                >
                  <MailOpen className="h-3.5 w-3.5" /> Chưa đọc
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${sortBy !== "time" ? "border-primary bg-primary/15 text-foreground" : "border-border bg-surface hover:bg-surface-2"}`}>
                      <ArrowUpDown className="h-3.5 w-3.5" /> Sắp xếp <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[14rem]">
                    <DropdownMenuItem onClick={() => setSortBy("time")} className="cursor-pointer">
                      <Clock className="h-4 w-4" />
                      <span className="flex-1">Thời gian (mới nhất)</span>
                      {sortBy === "time" && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("priority")} className="cursor-pointer">
                      <AlertCircle className="h-4 w-4" />
                      <span className="flex-1">Mức độ ưu tiên</span>
                      {sortBy === "priority" && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {(searchQuery || filterLabel || filterUnread) && (
                  <button
                    onClick={() => { setSearchQuery(""); setFilterLabel(null); setFilterUnread(false); }}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2"
                  >
                    <X className="h-3 w-3" /> Xóa lọc
                  </button>
                )}
                <button onClick={() => setAdvancedOpen(true)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2">
                  <Filter className="h-3 w-3" /> Lọc nâng cao
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {searchQuery && (
                  <Badge variant="secondary" className="text-[11px]">
                    <Search className="mr-1 h-3 w-3" />
                    {searchQuery}
                    <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setSearchQuery("")} />
                  </Badge>
                )}
                {filterLabel && (
                  <Badge variant="secondary" className="text-[11px]">
                    <Tag className="mr-1 h-3 w-3" />
                    {filterLabel}
                    <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setFilterLabel(null)} />
                  </Badge>
                )}
                {filterUnread && (
                  <Badge variant="secondary" className="text-[11px]">
                    <MailOpen className="mr-1 h-3 w-3" />
                    Chưa đọc
                    <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setFilterUnread(false)} />
                  </Badge>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {filteredEmails.length} thư
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {Object.entries(groups).map(([group, items]) => (
                <div key={group}>
                  <div className="sticky top-0 z-10 bg-background/95 px-4 py-1.5 text-[11px] font-semibold text-muted-foreground backdrop-blur">{group}</div>
                  <ul>
                    {items.map((e) => {
                      const isActive = e.id === selected;
                      return (
                        <li key={e.id}>
                          <button
                            onClick={() => setSelected(e.id)}
                            className={`flex w-full gap-3 border-l-2 px-4 py-3 text-left transition-colors ${
                              isActive ? "border-primary bg-primary/10" : "border-transparent hover:bg-surface-2/60"
                            }`}
                          >
                            <img src={avatar(e.from)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`truncate text-sm ${e.unread ? "font-semibold" : "font-medium text-muted-foreground"}`}>{e.from}</span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">{e.time}</span>
                              </div>
                              <div className={`truncate text-sm ${e.unread ? "text-foreground" : "text-muted-foreground"}`}>{e.subject}</div>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">{e.preview}</span>
                                {e.hasAttachment && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                                {e.starred && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Reading pane */}
          <section className="min-w-0 flex-1 overflow-y-auto bg-background">
            <div className="flex items-center gap-1 border-b border-border px-4 py-2">
              <button className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2"><ArrowLeft className="h-4 w-4" /></button>
              <ToolBtn icon={Reply} label="Trả lời" />
              <ToolBtn icon={ReplyAll} label="Trả lời tất cả" />
              <ToolBtn icon={Forward} label="Chuyển tiếp" />
              <ToolBtn icon={Archive} label="Lưu trữ" />
              <ToolBtn icon={Trash2} label="Xóa" />
              <ToolBtn icon={Tag} label="Đánh dấu" />
              <button className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-surface-2"><MoreHorizontal className="h-4 w-4" /></button>
            </div>

            <div className="px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-xl font-semibold tracking-tight">
                  {selectedEmail.subject}
                  <span className="ml-2 align-middle rounded bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Dự án STOS</span>
                </h1>
              </div>

              <div className="mt-4 flex items-start gap-3">
                <img src={avatar(selectedEmail.from)} alt="" className="h-10 w-10 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{selectedEmail.from}</span>
                    <span className="text-muted-foreground">&lt;leminhduc@techcorp.vn&gt;</span>
                    <span className="ml-auto text-xs text-muted-foreground">{selectedEmail.time} (2 giờ trước)</span>
                    <button className="rounded p-1 text-muted-foreground hover:bg-surface-2"><Star className="h-4 w-4" /></button>
                    <button className="rounded p-1 text-muted-foreground hover:bg-surface-2"><MoreHorizontal className="h-4 w-4" /></button>
                  </div>
                  <div className="text-xs text-muted-foreground">đến tôi <ChevronDown className="inline h-3 w-3" /></div>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-sm leading-relaxed">
                <p>Kính gửi anh/chị,</p>
                <p>Chúng tôi xin gửi yêu cầu báo giá cho hệ thống máy chủ phục vụ dự án STOS Platform với các yêu cầu kỹ thuật như file đính kèm.</p>
                <p>Rất mong nhận được báo giá và thời gian dự kiến.</p>
                <p>Trân trọng cảm ơn!</p>
                <p className="pt-2">Lê Minh Đức<br /><span className="text-muted-foreground">Giám đốc Công nghệ</span><br /><span className="text-muted-foreground">TechCorp Solutions</span></p>
              </div>

              <div className="mt-6">
                <div className="text-sm font-medium">2 tệp đính kèm</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <AttachmentCard icon={FileText} color="bg-rose-500/15 text-rose-300" name="Yeu_cau_ky_thuat_STOS.pdf" size="1.2 MB" />
                  <AttachmentCard icon={FileSpreadsheet} color="bg-emerald-500/15 text-emerald-300" name="Bang_du_toan_may_chu.xlsx" size="320 KB" />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <ActionBtn icon={Reply}>Trả lời</ActionBtn>
                <ActionBtn icon={ReplyAll}>Trả lời tất cả</ActionBtn>
                <ActionBtn icon={Forward}>Chuyển tiếp</ActionBtn>
              </div>

              {/* AI Assistant inline */}
              <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Email Assistant
                  <button onClick={() => setAiOpen(true)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25">
                    <Sparkles className="h-3 w-3" /> Mở AI Assistant
                  </button>
                </div>
                <div className="mt-3 text-sm font-medium">Tóm tắt nội dung email</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Email này là yêu cầu báo giá hệ thống máy chủ cho dự án STOS Platform, bao gồm tài liệu mô tả yêu cầu kỹ thuật và bảng dự toán.
                </p>
                <div className="mt-4 text-sm font-medium">Đề xuất hành động</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <SuggestBtn icon={FileText} title="Tạo task" desc="Yêu cầu báo giá STOS" />
                  <SuggestBtn icon={Bot} title="Tạo workflow" desc="Quy trình mua sắm" />
                  <SuggestBtn icon={Tag} title="Liên kết dự án" desc="STOS Platform" />
                  <SuggestBtn icon={Reply} title="Trả lời email" desc="Soạn thư trả lời" />
                </div>
              </div>

              <div className="mt-6">
                <div className="text-sm font-medium">Email liên quan</div>
                <div className="mt-3 flex items-center justify-center">
                  <button className="text-sm text-primary hover:underline">Xem 8 email liên quan</button>
                </div>
              </div>
            </div>
          </section>

          {/* Right rail */}
          <aside className="hidden w-[320px] shrink-0 flex-col gap-4 border-l border-border bg-surface/60 px-4 py-5 xl:flex">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="text-sm font-semibold">AI Email Assistant</div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-sm font-semibold">Tóm tắt nhanh</div>
              <ul className="mt-3 space-y-2 text-sm">
                {QUICK_SUMMARY.map((q) => (
                  <li key={q.label} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{q.label}</span>
                    <span className="font-semibold tabular-nums">{q.value}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-sm font-semibold">Ưu tiên xử lý</div>
              <ul className="mt-3 space-y-3">
                {PRIORITY.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <img src={avatar(p.from)} alt="" className="h-8 w-8 rounded-full object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="line-clamp-2 text-sm font-medium">{p.subject}</div>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${p.tint}`}>{p.level}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{p.from}</span>
                        <span>{p.time}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <button className="mt-3 w-full text-center text-xs text-primary hover:underline">Xem tất cả (12)</button>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Thống kê email</div>
                <button className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-surface">
                  Tuần này <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <DonutChart />
                <ul className="flex-1 space-y-1.5 text-xs">
                  {STATS.map((s) => (
                    <li key={s.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.label}
                      </span>
                      <span className="tabular-nums">{s.value} <span className="text-muted-foreground">({s.pct}%)</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-sm font-semibold">Kết nối tài khoản</div>
              <ul className="mt-3 space-y-3 text-sm">
                {ACCOUNTS.map((a, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={`flex h-7 w-7 items-center justify-center rounded text-[11px] font-semibold text-white ${a.color}`}>{a.label}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{a.provider === "M365" ? "Microsoft 365" : "Gmail"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{a.email}</div>
                    </div>
                    <span className="text-[11px] text-success">✓ Đã kết nối</span>
                  </li>
                ))}
              </ul>
              <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-surface-2/40 px-3 py-2 text-xs text-primary hover:bg-surface-2">
                <Plus className="h-3.5 w-3.5" /> Thêm tài khoản email
              </button>
            </div>
          </aside>
        </div>
      </main>

      <ComposeEmailDialog open={composeOpen} onOpenChange={setComposeOpen} />
      <AdvancedFilterDialog
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        value={advanced}
        onChange={setAdvanced}
        availableLabels={labels.map((l: any) => l.name)}
      />
      <AiAssistantDialog open={aiOpen} onOpenChange={setAiOpen} emailSubject={selectedEmail.subject} />
      <LabelsRulesDialog
        open={labelsOpen}
        onOpenChange={setLabelsOpen}
        labels={labels.map((l: any) => ({ name: l.name, color: l.color }))}
        onChangeLabels={(v) => setLabels(v.map((x) => ({ ...x, count: labels.find((l: any) => l.name === x.name)?.count ?? 0 })))}
        rules={rules}
        onChangeRules={setRules}
      />
    </div>
  );
}

function ToolBtn({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <button className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-foreground">
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function ActionBtn({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2">
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

function AttachmentCard({ icon: Icon, color, name, size }: { icon: any; color: string; name: string; size: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="text-[11px] text-muted-foreground">{size}</div>
      </div>
      <button className="rounded p-1.5 text-muted-foreground hover:bg-surface-2"><Download className="h-4 w-4" /></button>
    </div>
  );
}

function SuggestBtn({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <button className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3 text-left hover:border-primary/40">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}