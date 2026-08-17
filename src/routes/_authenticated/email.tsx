import { createFileRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getEmailFolderCounts,
  listEmailMessages,
  moveEmailMessages,
  setEmailMessagesRead,
} from "@/lib/api/emails.functions";
import {
  Mail,
  Search,
  Plus,
  ChevronDown,
  MoreHorizontal,
  Inbox,
  Star,
  Send,
  FileEdit,
  Trash2,
  Archive,
  AlertOctagon,
  Paperclip,
  RefreshCw,
  Filter,
  ArrowUpDown,
  Reply,
  ReplyAll,
  Forward,
  Tag,
  Sparkles,
  Bot,
  FileText,
  FileSpreadsheet,
  Download,
  ArrowLeft,
  MailOpen,
  X,
  Clock,
  AlertCircle,
  Check,
  Settings2,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  Image,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { buildForwardBody, buildReplyBody, stripPrefix } from "@/lib/email-quote";
import { notifyComingSoon } from "@/lib/coming-soon";
import { useActiveWorkspace } from "@/lib/active-workspace";

export const Route = createFileRoute("/_authenticated/email")({
  head: () => ({
    meta: [
      { title: "Email Hub — UNIWORK" },
      {
        name: "description",
        content:
          "Quản lý toàn bộ email từ Microsoft 365, Gmail và các nguồn khác tại một nơi với trợ lý AI Email Assistant.",
      },
    ],
  }),
  component: EmailHubPage,
});

const MAILBOXES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "inbox", label: "Hộp đến", icon: Inbox },
  { key: "starred", label: "Quan trọng", icon: Star },
  { key: "sent", label: "Đã gửi", icon: Send },
  { key: "drafts", label: "Bản nháp", icon: FileEdit },
  { key: "archive", label: "Lưu trữ", icon: Archive },
  { key: "trash", label: "Đã xóa", icon: Trash2 },
];

type LabelWithCount = LabelDef & { count: number };
const INITIAL_LABELS: LabelWithCount[] = [
  { name: "Dự án STOS", color: "bg-emerald-500", count: 24 },
  { name: "Khách hàng", color: "bg-amber-500", count: 18 },
  { name: "Hợp đồng", color: "bg-violet-500", count: 15 },
  { name: "Nhân sự", color: "bg-sky-500", count: 6 },
  { name: "Hóa đơn", color: "bg-rose-500", count: 9 },
];

const ACCOUNTS = [
  { provider: "M365", label: "M", color: "bg-sky-600", email: "nguyenvana@ubos.vn", count: 128 },
  { provider: "Gmail", label: "G", color: "bg-rose-500", email: "nguyenvana@ubos.vn", count: 46 },
];

type Email = {
  id: string;
  from: string;
  fromEmail?: string;
  to?: string;
  cc?: string;
  subject: string;
  preview: string;
  body?: string;
  time: string;
  group: "Hôm nay" | "Hôm qua" | "Tuần này";
  unread?: boolean;
  starred?: boolean;
  hasAttachment?: boolean;
  selected?: boolean;
  labels?: string[];
  mailbox?: "inbox" | "sent" | "drafts" | "spam" | "trash" | "archive" | "bin";
  attachments?: { name: string; size: string; type: "pdf" | "excel" | "doc" | "image" }[];
};

const DB_FOLDERS = ["inbox", "sent", "drafts", "archive", "trash"] as const;
type DbFolder = (typeof DB_FOLDERS)[number];

function formatEmailTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function bucketEmailWhen(iso: string): Email["group"] {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.floor((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";
  return "Tuần này";
}

type StatSlice = { label: string; value: number; pct: number; color: string };

function DonutChart({ stats, centerValue }: { stats: StatSlice[]; centerValue?: number }) {
  const total = stats.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const r = 42,
    c = 2 * Math.PI * r;
  return (
    <div className="relative h-[140px] w-[140px]">
      <svg viewBox="0 0 120 120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--surface-2))" strokeWidth="14" />
        {stats.map((s, i) => {
          const len = (s.value / total) * c;
          const off = (acc / total) * c;
          acc += s.value;
          return (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-off}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl font-bold tabular-nums">
          {centerValue ?? stats.reduce((s, x) => s + x.value, 0)}
        </div>
        <div className="text-[10px] text-muted-foreground">Email</div>
      </div>
    </div>
  );
}

function EmailHubPage() {
  const { workspaceId } = useActiveWorkspace();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeMailbox, setActiveMailbox] = useState("inbox");
  const [selected, setSelected] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLabel, setFilterLabel] = useState<string | null>(null);
  const [filterUnread, setFilterUnread] = useState(false);
  const [sortBy, setSortBy] = useState<"time" | "priority">("time");
  const [labels, setLabels] = useState<LabelWithCount[]>(INITIAL_LABELS);
  const [rules, setRules] = useState<RuleDef[]>([
    {
      id: "r1",
      name: "Email từ STOS → gắn nhãn Dự án STOS",
      whenField: "from",
      whenContains: "@stos.vn",
      thenAction: "label",
      thenValue: "Dự án STOS",
      active: true,
    },
    {
      id: "r2",
      name: "Email hóa đơn → lưu trữ",
      whenField: "subject",
      whenContains: "hóa đơn",
      thenAction: "archive",
      thenValue: "",
      active: false,
    },
  ]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePrefill, setComposePrefill] = useState({ to: "", subject: "", body: "", cc: "" });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedFilters>(EMPTY_FILTERS);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const PAGE_SIZE = 6;

  // Debounce search to avoid a query per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset to first page whenever the effective filters or folder change.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeMailbox]);

  // Danh sách email thật theo workspace đang chọn (không còn dữ liệu mock).
  const starredMode = activeMailbox === "starred";
  const folder: DbFolder = starredMode ? "inbox" : (activeMailbox as DbFolder);
  const dbQuery = useQuery({
    queryKey: ["emails", workspaceId, activeMailbox, debouncedSearch, page],
    queryFn: () =>
      listEmailMessages({
        data: {
          folder,
          search: debouncedSearch,
          workspace_id: workspaceId ?? null,
          starred_only: starredMode,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        },
      }),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
  const countsQuery = useQuery({
    queryKey: ["emails", "counts", workspaceId],
    queryFn: () => getEmailFolderCounts({ data: { workspace_id: workspaceId ?? null } }),
    staleTime: 30_000,
  });

  const dbEmails: Email[] = useMemo(() => {
    if (!dbQuery.data) return [];
    return dbQuery.data.items.map((r) => {
      const m = r.message as {
        id: string;
        subject: string;
        body: string;
        sent_at: string | null;
        created_at: string;
        from_user_id: string;
      };
      const senderName = r.sender?.display_name ?? r.sender?.email ?? "Người gửi";
      const when = m.sent_at ?? m.created_at;
      return {
        id: m.id,
        from: senderName,
        fromEmail: r.sender?.email,
        subject: m.subject,
        preview: (m.body ?? "").replace(/\s+/g, " ").slice(0, 160),
        body: m.body,
        time: formatEmailTime(when),
        group: bucketEmailWhen(when),
        unread: !r.is_read,
        starred: r.is_starred,
        mailbox: r.folder as Email["mailbox"],
      } satisfies Email;
    });
  }, [dbQuery.data]);

  function prioritySortValue(e: Email): number {
    if (e.unread && e.starred) return 3;
    if (e.unread) return 2;
    if (e.starred) return 1;
    return 0;
  }

  // Lọc phía client trên dữ liệu thật của trang hiện tại.
  const pagedEmails = useMemo(() => {
    const a = advanced;
    const list = dbEmails.filter((e) => {
      const matchUnread = !filterUnread || !!e.unread;
      const matchAdvKeyword =
        !a.keyword ||
        e.subject.toLowerCase().includes(a.keyword.toLowerCase()) ||
        (e.preview ?? "").toLowerCase().includes(a.keyword.toLowerCase());
      const matchAdvFrom = !a.from || e.from.toLowerCase().includes(a.from.toLowerCase());
      return matchUnread && matchAdvKeyword && matchAdvFrom;
    });
    return list
      .slice()
      .sort((x, y) => (sortBy === "priority" ? prioritySortValue(y) - prioritySortValue(x) : 0));
  }, [dbEmails, filterUnread, advanced, sortBy]);

  const selectedEmail = dbEmails.find((e) => e.id === selected) ?? dbEmails[0] ?? null;

  const effectiveTotal = dbQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const folderCounts = countsQuery.data?.counts ?? {};
  const mailboxes = useMemo(
    () => MAILBOXES.map((m) => ({ ...m, count: folderCounts[m.key] ?? 0 })),
    [folderCounts],
  );

  const quickSummary = useMemo(
    () => [
      { label: "Tổng email", value: countsQuery.data?.total ?? 0 },
      { label: "Đã đọc", value: countsQuery.data?.read ?? 0 },
      { label: "Chưa đọc", value: countsQuery.data?.unread ?? 0 },
      { label: "Đã gửi", value: countsQuery.data?.sent ?? 0 },
      { label: "Chuyển tiếp", value: countsQuery.data?.forwarded ?? 0 },
      { label: "Đã giải quyết", value: countsQuery.data?.resolved ?? 0 },
      { label: "Đã hủy", value: countsQuery.data?.cancelled ?? 0 },
      { label: "Chưa đọc ở hộp đến", value: countsQuery.data?.unreadInbox ?? 0 },
    ],
    [countsQuery.data, folderCounts],
  );

  const priorityEmails = useMemo(
    () =>
      dbEmails
        .slice()
        .sort((x, y) => prioritySortValue(y) - prioritySortValue(x))
        .filter((e) => e.unread || e.starred)
        .slice(0, 3),
    [dbEmails],
  );

  const statSlices: StatSlice[] = useMemo(() => {
    const c = countsQuery.data;
    const raw = [
      { label: "Đã đọc", value: c?.read ?? 0, color: "#7c3aed" },
      { label: "Chưa đọc", value: c?.unread ?? 0, color: "#ef4444" },
      { label: "Đã gửi", value: c?.sent ?? 0, color: "#10b981" },
      { label: "Chuyển tiếp", value: c?.forwarded ?? 0, color: "#0ea5e9" },
      { label: "Đã giải quyết", value: c?.resolved ?? 0, color: "#f59e0b" },
      { label: "Đã hủy", value: c?.cancelled ?? 0, color: "#94a3b8" },
    ];
    const total = raw.reduce((s, x) => s + x.value, 0) || 1;
    return raw.map((r) => ({ ...r, pct: Math.round((r.value / total) * 100) }));
  }, [countsQuery.data]);

  // Reset paging + selection when mailbox/filters change
  function changeMailbox(key: string) {
    setActiveMailbox(key);
    setPage(1);
    setCheckedIds(new Set());
  }

  const allOnPageChecked = pagedEmails.length > 0 && pagedEmails.every((e) => checkedIds.has(e.id));
  const someOnPageChecked = pagedEmails.some((e) => checkedIds.has(e.id));
  function toggleAllOnPage() {
    const next = new Set(checkedIds);
    if (allOnPageChecked) pagedEmails.forEach((e) => next.delete(e.id));
    else pagedEmails.forEach((e) => next.add(e.id));
    setCheckedIds(next);
  }
  function toggleOne(id: string) {
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIds(next);
  }
  function clearChecked() {
    setCheckedIds(new Set());
  }

  // --- Real actions (DB-backed messages only) --------------------------------
  const qc = useQueryClient();
  const doMove = useServerFn(moveEmailMessages);
  const doSetRead = useServerFn(setEmailMessagesRead);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function realIds(ids: string[]) {
    return ids.filter((id) => UUID_RE.test(id));
  }

  const bulkMoveMut = useMutation({
    mutationFn: (v: { ids: string[]; folder: "inbox" | "archive" | "trash" }) =>
      doMove({ data: { message_ids: v.ids, folder: v.folder } }),
    onSuccess: (_r, v) => {
      toast.success(
        v.folder === "archive"
          ? "Đã lưu trữ"
          : v.folder === "trash"
            ? "Đã chuyển vào thùng rác"
            : "Đã chuyển về hộp đến",
      );
      qc.invalidateQueries({ queryKey: ["emails"] });
      clearChecked();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkReadMut = useMutation({
    mutationFn: (v: { ids: string[]; is_read: boolean }) =>
      doSetRead({ data: { message_ids: v.ids, is_read: v.is_read } }),
    onSuccess: (_r, v) => {
      toast.success(v.is_read ? "Đã đánh dấu đã đọc" : "Đã đánh dấu chưa đọc");
      qc.invalidateQueries({ queryKey: ["emails"] });
      clearChecked();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function bulkMove(folder: "inbox" | "archive" | "trash") {
    const ids = realIds([...checkedIds]);
    if (!ids.length) {
      toast.info("Chỉ áp dụng cho email thật trong hộp thư");
      clearChecked();
      return;
    }
    bulkMoveMut.mutate({ ids, folder });
  }

  function bulkRead(is_read: boolean) {
    const ids = realIds([...checkedIds]);
    if (!ids.length) {
      toast.info("Chỉ áp dụng cho email thật trong hộp thư");
      clearChecked();
      return;
    }
    bulkReadMut.mutate({ ids, is_read });
  }

  function messageAction(folder: "archive" | "trash") {
    const ids = realIds(selectedEmail ? [selectedEmail.id] : []);
    if (!ids.length) {
      toast.info("Email mẫu không thể thao tác");
      return;
    }
    bulkMoveMut.mutate({ ids, folder });
  }

  // Mở email = đọc thật: cập nhật trạng thái đã đọc trong database.
  function openEmail(id: string) {
    setSelected(id);
    setDetailOpen(true);
    const target = dbEmails.find((e) => e.id === id);
    if (!target?.unread) return;
    if (!UUID_RE.test(id)) return;
    doSetRead({ data: { message_ids: [id], is_read: true } })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["emails"] });
      })
      .catch((e: Error) => toast.error(e.message));
  }

  function openCompose(to: string, subject: string, body = "", cc = "") {
    setComposePrefill({ to, subject, body, cc });
    setComposeOpen(true);
  }

  function replySelected(all: boolean) {
    if (!selectedEmail) return;
    const from =
      selectedEmail.fromEmail ||
      `${selectedEmail.from.toLowerCase().replace(/\s+/g, ".")}@company.vn`;
    const cc = all && selectedEmail.cc ? `, ${selectedEmail.cc}` : "";
    openCompose(
      `${from}${cc}`,
      `Re: ${stripPrefix(selectedEmail.subject)}`,
      buildReplyBody({
        from: selectedEmail.from,
        fromEmail: selectedEmail.fromEmail,
        subject: selectedEmail.subject,
        date: selectedEmail.time,
        body: selectedEmail.body || selectedEmail.preview,
      }),
    );
  }

  function forwardSelected() {
    if (!selectedEmail) return;
    openCompose(
      "",
      `Fwd: ${stripPrefix(selectedEmail.subject)}`,
      buildForwardBody({
        from: selectedEmail.from,
        fromEmail: selectedEmail.fromEmail,
        to: selectedEmail.to,
        cc: selectedEmail.cc,
        subject: selectedEmail.subject,
        date: selectedEmail.time,
        body: selectedEmail.body || selectedEmail.preview,
      }),
    );
  }

  const groups: Record<string, Email[]> = {};
  if (sortBy === "priority") {
    groups["Theo mức độ ưu tiên"] = pagedEmails;
  } else {
    pagedEmails.forEach((e) => {
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
                  <div className="text-[11px] text-muted-foreground">
                    Tất cả email của bạn tại một nơi
                  </div>
                </div>
              </div>
            </div>

            <div className="px-3 py-3">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setComposeOpen(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <FileEdit className="h-4 w-4" /> Soạn email
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Tùy chọn soạn email"
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary px-2 text-primary-foreground hover:bg-primary/90"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => openCompose("", "")}>
                      Soạn email mới
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changeMailbox("drafts")}>
                      Mở bản nháp
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAiOpen(true)}>
                      Soạn với AI
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <button
                onClick={() => setLabelsOpen(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-surface-2/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" /> Nhãn & Quy tắc tự động
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <div className="px-2 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mailboxes
              </div>
              <ul className="space-y-0.5">
                {mailboxes.map((m) => {
                  const Icon = m.icon;
                  const active = activeMailbox === m.key;
                  return (
                    <li key={m.key}>
                      <button
                        onClick={() => changeMailbox(m.key)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm ${active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                        <span className="flex-1 text-left">{m.label}</span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {m.count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between px-2 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Labels</span>
                <button onClick={() => notifyComingSoon()} className="rounded p-0.5 hover:bg-surface-2">
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              <ul className="space-y-0.5">
                {labels.map((l) => {
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
                  <button onClick={() => notifyComingSoon()} className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                    <Plus className="h-3.5 w-3.5" />
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setLabelsOpen(true);
                      }}
                    >
                      More
                    </span>
                  </button>
                </li>
              </ul>

              <div className="flex items-center justify-between px-2 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Accounts</span>
                <button onClick={() => notifyComingSoon()} className="rounded p-0.5 hover:bg-surface-2">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <ul className="space-y-0.5">
                {ACCOUNTS.map((a, i) => (
                  <li key={i}>
                    <button onClick={() => notifyComingSoon()} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold text-white ${a.color}`}
                      >
                        {a.label}
                      </span>
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
          <section
            className={`flex-col border-r border-border bg-background ${detailOpen ? "hidden" : "flex w-full"} lg:flex lg:w-[360px] lg:shrink-0`}
          >
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
                    <button
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${sortBy !== "time" ? "border-primary bg-primary/15 text-foreground" : "border-border bg-surface hover:bg-surface-2"}`}
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" /> Sắp xếp{" "}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[14rem]">
                    <DropdownMenuItem onClick={() => setSortBy("time")} className="cursor-pointer">
                      <Clock className="h-4 w-4" />
                      <span className="flex-1">Thời gian (mới nhất)</span>
                      {sortBy === "time" && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSortBy("priority")}
                      className="cursor-pointer"
                    >
                      <AlertCircle className="h-4 w-4" />
                      <span className="flex-1">Mức độ ưu tiên</span>
                      {sortBy === "priority" && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {(searchQuery || filterLabel || filterUnread) && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setFilterLabel(null);
                      setFilterUnread(false);
                    }}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2"
                  >
                    <X className="h-3 w-3" /> Xóa lọc
                  </button>
                )}
                <button
                  onClick={() => setAdvancedOpen(true)}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2"
                >
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
                    <X
                      className="ml-1 h-3 w-3 cursor-pointer"
                      onClick={() => setFilterLabel(null)}
                    />
                  </Badge>
                )}
                {filterUnread && (
                  <Badge variant="secondary" className="text-[11px]">
                    <MailOpen className="mr-1 h-3 w-3" />
                    Chưa đọc
                    <X
                      className="ml-1 h-3 w-3 cursor-pointer"
                      onClick={() => setFilterUnread(false)}
                    />
                  </Badge>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {effectiveTotal} thư
                </span>
              </div>
            </div>

            {/* Bulk select bar */}
            <div className="flex items-center gap-2 border-b border-border bg-surface/40 px-4 py-2">
              <button
                onClick={toggleAllOnPage}
                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                title={allOnPageChecked ? "Bỏ chọn trang này" : "Chọn tất cả trang này"}
              >
                {allOnPageChecked ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className={`h-4 w-4 ${someOnPageChecked ? "text-primary" : ""}`} />
                )}
                <span>{checkedIds.size > 0 ? `Đã chọn ${checkedIds.size}` : "Chọn"}</span>
              </button>
              {checkedIds.size > 0 ? (
                <div className="ml-1 flex items-center gap-0.5">
                  <BulkBtn icon={Archive} label="Lưu trữ" onClick={() => bulkMove("archive")} />
                  <BulkBtn icon={Trash2} label="Xóa" onClick={() => bulkMove("trash")} />
                  <BulkBtn icon={MailOpen} label="Đánh dấu đã đọc" onClick={() => bulkRead(true)} />
                  <BulkBtn icon={Mail} label="Đánh dấu chưa đọc" onClick={() => bulkRead(false)} />
                  <BulkBtn icon={Inbox} label="Về hộp đến" onClick={() => bulkMove("inbox")} />
                  <button
                    onClick={clearChecked}
                    className="ml-1 rounded p-1 text-muted-foreground hover:bg-surface-2"
                    title="Bỏ chọn"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => dbQuery.refetch()}
                  className="ml-1 rounded p-1 text-muted-foreground hover:bg-surface-2"
                  title="Làm mới"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${dbQuery.isFetching ? "animate-spin" : ""}`} />
                </button>
              )}
              <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                {effectiveTotal === 0
                  ? "0"
                  : `${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, effectiveTotal)} / ${effectiveTotal}`}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="rounded p-1 text-muted-foreground hover:bg-surface-2 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded p-1 text-muted-foreground hover:bg-surface-2 disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {dbQuery.isLoading ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin opacity-60" />
                  <span className="text-xs">Đang tải email…</span>
                </div>
              ) : dbQuery.error ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center text-sm text-destructive">
                  <AlertCircle className="h-6 w-6" />
                  <span className="font-medium">Không tải được email</span>
                  <span className="text-xs text-muted-foreground">
                    {(dbQuery.error as Error).message}
                  </span>
                </div>
              ) : effectiveTotal === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
                  <Inbox className="h-8 w-8 opacity-50" />
                  <span className="font-medium">
                    {debouncedSearch ? "Không tìm thấy email phù hợp" : "Chưa có email nào"}
                  </span>
                  <span className="text-xs">
                    {debouncedSearch
                      ? "Thử thay đổi từ khóa hoặc bỏ bộ lọc"
                      : "Email mới sẽ hiển thị tại đây"}
                  </span>
                </div>
              ) : null}
              {Object.entries(groups).map(([group, items]) => (
                <div key={group}>
                  <div className="sticky top-0 z-10 bg-background/95 px-4 py-1.5 text-[11px] font-semibold text-muted-foreground backdrop-blur">
                    {group}
                  </div>
                  <ul>
                    {items.map((e) => {
                      const isActive = e.id === selected;
                      const isChecked = checkedIds.has(e.id);
                      return (
                        <li key={e.id}>
                          <div
                            className={`group flex w-full gap-3 border-l-2 px-4 py-3 text-left transition-colors ${
                              isActive
                                ? "border-primary bg-primary/10"
                                : "border-transparent hover:bg-surface-2/60"
                            }`}
                          >
                            <div
                              className="relative flex h-9 w-9 shrink-0 items-center justify-center"
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              <img
                                src={avatar(e.from)}
                                alt=""
                                className={`h-9 w-9 rounded-full object-cover ${isChecked ? "hidden" : "group-hover:hidden"}`}
                                onClick={() => openEmail(e.id)}
                              />
                              <div
                                className={`${isChecked ? "flex" : "hidden group-hover:flex"} h-9 w-9 items-center justify-center`}
                              >
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => toggleOne(e.id)}
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => openEmail(e.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`truncate text-sm ${e.unread ? "font-semibold" : "font-medium text-muted-foreground"}`}
                                >
                                  {e.from}
                                </span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {e.time}
                                </span>
                              </div>
                              <div
                                className={`truncate text-sm ${e.unread ? "text-foreground" : "text-muted-foreground"}`}
                              >
                                {e.subject}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">
                                  {e.preview}
                                </span>
                                {e.hasAttachment && (
                                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                                )}
                                {e.starred && (
                                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                )}
                              </div>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {/* Pagination footer */}
              {effectiveTotal > 0 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                  <span>
                    Trang {currentPage} / {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }).map((_, i) => {
                      const p = i + 1;
                      const isCur = p === currentPage;
                      return (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`h-6 min-w-6 rounded px-1.5 text-[11px] tabular-nums ${
                            isCur
                              ? "bg-primary text-primary-foreground"
                              : "bg-surface-2 hover:bg-surface"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Reading pane */}
          <section
            className={`min-w-0 flex-1 flex-col overflow-hidden bg-background ${detailOpen ? "flex" : "hidden"} lg:flex`}
          >
            {!selectedEmail ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <Mail className="h-10 w-10 text-muted-foreground/50" />
                <div className="text-sm font-medium">Chưa chọn email</div>
                <p className="text-xs text-muted-foreground">
                  Chọn một email ở danh sách bên trái để xem nội dung
                </p>
              </div>
            ) : (
              <>
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-4 py-2">
              <button
                onClick={() => setDetailOpen(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 lg:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <ToolBtn icon={Reply} label="Trả lời" onClick={() => replySelected(false)} />
              <ToolBtn icon={ReplyAll} label="Trả lời tất cả" onClick={() => replySelected(true)} />
              <ToolBtn icon={Forward} label="Chuyển tiếp" onClick={forwardSelected} />
              <ToolBtn icon={Archive} label="Lưu trữ" onClick={() => messageAction("archive")} />
              <ToolBtn icon={Trash2} label="Xóa" onClick={() => messageAction("trash")} />
              <ToolBtn icon={Sparkles} label="Hỏi AI" onClick={() => setAiOpen(true)} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Thao tác khác"
                    className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-surface-2"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      const ids = realIds(selectedEmail ? [selectedEmail.id] : []);
                      if (!ids.length) return toast.info("Email mẫu không thể thao tác");
                      bulkReadMut.mutate({ ids, is_read: false });
                    }}
                  >
                    Đánh dấu chưa đọc
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => messageAction("archive")}>Lưu trữ</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => messageAction("trash")}>Chuyển vào thùng rác</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLabelsOpen(true)}>Nhãn & quy tắc</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-xl font-semibold tracking-tight">
                  {selectedEmail.subject}
                  {selectedEmail.labels && selectedEmail.labels.length > 0 && (
                    <span className="ml-2 align-middle rounded bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {selectedEmail.labels[0]}
                    </span>
                  )}
                </h1>
              </div>

              <div className="mt-4 flex items-start gap-3">
                <img
                  src={avatar(selectedEmail.from)}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{selectedEmail.from}</span>
                    <span className="text-muted-foreground">
                      &lt;
                      {selectedEmail.fromEmail ||
                        `${selectedEmail.from.toLowerCase().replace(/\s+/g, ".")}@company.vn`}
                      &gt;
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {selectedEmail.time}
                    </span>
                    <button
                      onClick={() => notifyComingSoon()}
                      title="Đánh dấu quan trọng"
                      className="rounded p-1 text-muted-foreground hover:bg-surface-2"
                    >
                      <Star
                        className={`h-4 w-4 ${selectedEmail.starred ? "fill-amber-400 text-amber-400" : ""}`}
                      />
                    </button>
                    <button
                      onClick={() => replySelected(false)}
                      title="Trả lời"
                      className="rounded p-1 text-muted-foreground hover:bg-surface-2"
                    >
                      <Reply className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    đến {selectedEmail.to || "tôi"}
                    {selectedEmail.cc && <span> · Cc: {selectedEmail.cc}</span>}
                    <ChevronDown className="inline h-3 w-3" />
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-sm leading-relaxed">
                {selectedEmail.body ? (
                  selectedEmail.body.split("\n\n").map((para, i) => <p key={i}>{para}</p>)
                ) : (
                  <p className="text-muted-foreground">Email này chưa có nội dung</p>
                )}
              </div>

              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <div className="mt-6">
                  <div className="text-sm font-medium">
                    {selectedEmail.attachments.length} tệp đính kèm
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {selectedEmail.attachments.map((att, i) => (
                      <AttachmentCard
                        key={i}
                        icon={
                          att.type === "excel"
                            ? FileSpreadsheet
                            : att.type === "image"
                              ? Image
                              : FileText
                        }
                        color={
                          att.type === "pdf"
                            ? "bg-rose-500/15 text-rose-300"
                            : att.type === "excel"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : att.type === "image"
                                ? "bg-sky-500/15 text-sky-300"
                                : "bg-violet-500/15 text-violet-300"
                        }
                        name={att.name}
                        size={att.size}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                <ActionBtn icon={Reply} onClick={() => replySelected(false)}>
                  Trả lời
                </ActionBtn>
                <ActionBtn icon={ReplyAll} onClick={() => replySelected(true)}>
                  Trả lời tất cả
                </ActionBtn>
                <ActionBtn icon={Forward} onClick={forwardSelected}>
                  Chuyển tiếp
                </ActionBtn>
              </div>

              {/* AI Assistant inline */}
              <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Email Assistant
                  <button
                    onClick={() => setAiOpen(true)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25"
                  >
                    <Sparkles className="h-3 w-3" /> Mở AI Assistant
                  </button>
                </div>
                <div className="mt-3 text-sm font-medium">Tóm tắt nội dung email</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedEmail.body
                    ? selectedEmail.body.substring(0, 180).replace(/\n/g, " ") +
                      (selectedEmail.body.length > 180 ? "..." : "")
                    : "Chưa có nội dung để tóm tắt"}
                </p>
                <div className="mt-4 text-sm font-medium">Đề xuất hành động</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <SuggestBtn
                    icon={FileText}
                    title="Tạo task"
                    desc={selectedEmail.subject.substring(0, 30)}
                  />
                  <SuggestBtn icon={Bot} title="Tạo workflow" desc="Quy trình xử lý email" />
                  <SuggestBtn
                    icon={Tag}
                    title="Liên kết dự án"
                    desc={selectedEmail.labels?.[0] || "Dự án"}
                  />
                  <SuggestBtn icon={Reply} title="Trả lời email" desc="Soạn thư trả lời" />
                </div>
              </div>

              <div className="mt-6">
                <div className="text-sm font-medium">Email liên quan</div>
                <div className="mt-3 flex items-center justify-center">
                  <button onClick={() => notifyComingSoon()} className="text-sm text-primary hover:underline">
                    Xem 8 email liên quan
                  </button>
                </div>
              </div>
            </div>
              </>
            )}
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
                {quickSummary.map((q) => (
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
                {priorityEmails.length === 0 ? (
                  <li className="text-xs text-muted-foreground">Không có email cần ưu tiên.</li>
                ) : null}
                {priorityEmails.map((p) => (
                  <li key={p.id} className="flex gap-2">
                    <img
                      src={avatar(p.from)}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="line-clamp-2 text-sm font-medium">{p.subject}</div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${p.unread && p.starred ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}
                        >
                          {p.unread && p.starred ? "Cao" : "Trung bình"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{p.from}</span>
                        <span>{p.time}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <button onClick={() => notifyComingSoon()} className="mt-3 w-full text-center text-xs text-primary hover:underline">
                Xem tất cả (12)
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Thống kê email</div>
                <button onClick={() => notifyComingSoon()} className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-surface">
                  Tuần này <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <DonutChart stats={statSlices} centerValue={countsQuery.data?.total ?? 0} />
                <ul className="flex-1 space-y-1.5 text-xs">
                  {statSlices.map((s) => (
                    <li key={s.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{" "}
                        {s.label}
                      </span>
                      <span className="tabular-nums">
                        {s.value} <span className="text-muted-foreground">({s.pct}%)</span>
                      </span>
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
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded text-[11px] font-semibold text-white ${a.color}`}
                    >
                      {a.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {a.provider === "M365" ? "Microsoft 365" : "Gmail"}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{a.email}</div>
                    </div>
                    <span className="text-[11px] text-success">✓ Đã kết nối</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => notifyComingSoon()} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-surface-2/40 px-3 py-2 text-xs text-primary hover:bg-surface-2">
                <Plus className="h-3.5 w-3.5" /> Thêm tài khoản email
              </button>
            </div>
          </aside>
        </div>
      </main>

      <ComposeEmailDialog
        key={`${composePrefill.to}|${composePrefill.subject}|${composePrefill.body.length}`}
        open={composeOpen}
        onOpenChange={setComposeOpen}
        initialTo={composePrefill.to}
        initialSubject={composePrefill.subject}
        initialBody={composePrefill.body}
        initialCc={composePrefill.cc}
      />
      <AdvancedFilterDialog
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        value={advanced}
        onChange={setAdvanced}
        availableLabels={labels.map((l) => l.name)}
      />
      <AiAssistantDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        emailSubject={selectedEmail.subject}
      />
      <LabelsRulesDialog
        open={labelsOpen}
        onOpenChange={setLabelsOpen}
        labels={labels.map((l) => ({ name: l.name, color: l.color }))}
        onChangeLabels={(v) =>
          setLabels(
            v.map((x) => ({ ...x, count: labels.find((l) => l.name === x.name)?.count ?? 0 })),
          )
        }
        rules={rules}
        onChangeRules={setRules}
      />
    </div>
  );
}

function ToolBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function BulkBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function ActionBtn({ icon: Icon, children, onClick }: { icon: LucideIcon; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick ?? (() => notifyComingSoon())} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2">
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

function AttachmentCard({
  icon: Icon,
  color,
  name,
  size,
}: {
  icon: LucideIcon;
  color: string;
  name: string;
  size: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="text-[11px] text-muted-foreground">{size}</div>
      </div>
      <button onClick={() => notifyComingSoon()} className="rounded p-1.5 text-muted-foreground hover:bg-surface-2">
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}

function SuggestBtn({
  icon: Icon,
  title,
  desc,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <button onClick={() => notifyComingSoon()} className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3 text-left hover:border-primary/40">
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
