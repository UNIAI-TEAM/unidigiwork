import { RelatedWorkPanel } from "@/components/work-graph/related-work-panel";
import { AskUniPanel } from "@/components/ai/ask-uni-panel";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWorkspaceOverview } from "@/lib/api/workspace-overview.functions";
import {
  Users,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Plus,
  Star,
  Settings2,
  Activity,
  FolderKanban,
  Sparkles,
  MessageCircle,
  Video,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  GitBranch,
  Pin,
  BookOpen,
  Bell,
  Search,
  FileSpreadsheet,
  FileImage,
  Presentation,
  Download,
  Filter,
  X,
  UserPlus,
  Mail,
  Copy,
  Trash2,
  Shield,
  Upload,
  FolderOpen,
  Tag as TagIcon,
  Eye,
  Lock,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MemberRole = "owner" | "admin" | "member" | "viewer";
const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Chủ sở hữu",
  admin: "Quản trị",
  member: "Thành viên",
  viewer: "Chỉ xem",
};
const ROLE_TINT: Record<MemberRole, string> = {
  owner: "bg-amber-500/15 text-amber-300",
  admin: "bg-violet-500/15 text-violet-300",
  member: "bg-sky-500/15 text-sky-300",
  viewer: "bg-surface-2 text-muted-foreground",
};

type Workspace = {
  slug: string;
  name: string;
  letter: string;
  color: string;
  tagline: string;
  description: string;
  owner: string;
  members: number;
  health: "Tốt" | "Cần chú ý" | "Rủi ro";
  progress: number;
  deadline: string;
  tags: string[];
};

type RecentDoc = {
  name: string;
  type: string;
  size: string;
  folder: string;
  tags: string[];
  visibility: "workspace" | "private";
  description: string;
  file: File;
  uploadedAt: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/workspace/$id")({
  loader: ({ params }) => {
    if (!UUID_RE.test(params.id)) throw notFound();
    return { workspaceId: params.id };
  },
  head: () => ({
    meta: [
      { title: "Workspace — UNIWORK" },
      {
        name: "description",
        content: "Chi tiết workspace: nhiệm vụ, tài liệu, cuộc họp và thành viên.",
      },
      { property: "og:title", content: "Workspace — UNIWORK" },
      { property: "og:description", content: "Chi tiết workspace trên UNIWORK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  notFoundComponent: () => (
    <div className="p-10 text-center text-sm text-muted-foreground">Workspace không tồn tại.</div>
  ),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-10 text-center text-sm text-rose-400">
      {error.message}
    </div>
  ),
  component: WorkspaceDetailPage,
});

const WS_COLORS = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-rose-500",
];
function wsColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return WS_COLORS[h % WS_COLORS.length];
}

const TASK_STATUS_LABEL: Record<string, string> = {
  todo: "Cần làm",
  in_progress: "Đang làm",
  blocked: "Bị chặn",
  done: "Hoàn thành",
  canceled: "Đã huỷ",
};
const TASK_PRIORITY_LABEL: Record<string, string> = {
  low: "Thấp",
  normal: "Trung bình",
  high: "Cao",
  urgent: "Khẩn cấp",
};
const MEETING_STATUS_LABEL: Record<string, string> = {
  scheduled: "Sắp diễn ra",
  live: "Đang diễn ra",
  ended: "Đã kết thúc",
  canceled: "Đã huỷ",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const fmt = (v: number, unit: string) => (diff >= 0 ? `${v} ${unit} trước` : `sau ${v} ${unit}`);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return fmt(mins, "phút");
  const hours = Math.round(mins / 60);
  if (hours < 24) return fmt(hours, "giờ");
  const days = Math.round(hours / 24);
  if (days < 30) return fmt(days, "ngày");
  return new Date(iso).toLocaleDateString("vi-VN");
}

function dueLabel(iso: string | null): string {
  if (!iso) return "Không hạn";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "Hôm nay";
  const tomorrow = new Date(today.getTime() + 86400000);
  if (d.toDateString() === tomorrow.toDateString()) return "Ngày mai";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function mimeToType(mime: string | null, title: string): string {
  const m = (mime ?? "").toLowerCase();
  const ext = title.split(".").pop()?.toLowerCase() ?? "";
  if (m.includes("pdf") || ext === "pdf") return "pdf";
  if (m.includes("sheet") || ["xlsx", "xls", "csv"].includes(ext)) return "xlsx";
  if (m.includes("presentation") || ["pptx", "ppt"].includes(ext)) return "ppt";
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (m.includes("word") || ["docx", "doc"].includes(ext)) return "doc";
  return "doc";
}

const TABS = [
  { id: "overview", label: "Tổng quan" },
  { id: "tasks", label: "Nhiệm vụ" },
  { id: "documents", label: "Tài liệu" },
  { id: "meetings", label: "Cuộc họp" },
  { id: "members", label: "Thành viên" },
  { id: "activity", label: "Hoạt động" },
];

type MemberRow = { seed: string; name: string; title: string; role: MemberRole; email: string };

const DOC_TYPES: { id: string; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "pdf", label: "PDF" },
  { id: "xlsx", label: "Excel" },
  { id: "doc", label: "Word" },
  { id: "ppt", label: "PowerPoint" },
  { id: "image", label: "Hình ảnh" },
];

function docTypeIcon(type: string) {
  switch (type) {
    case "pdf":
      return <FileText className="h-5 w-5 text-rose-500" />;
    case "xlsx":
      return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
    case "ppt":
      return <Presentation className="h-5 w-5 text-amber-500" />;
    case "image":
      return <FileImage className="h-5 w-5 text-violet-500" />;
    default:
      return <FileText className="h-5 w-5 text-sky-500" />;
  }
}

function docTypeBg(type: string) {
  switch (type) {
    case "pdf":
      return "bg-rose-500/15 text-rose-600";
    case "xlsx":
      return "bg-emerald-500/15 text-emerald-600";
    case "ppt":
      return "bg-amber-500/15 text-amber-600";
    case "image":
      return "bg-violet-500/15 text-violet-600";
    default:
      return "bg-sky-500/15 text-sky-600";
  }
}

function WorkspaceDetailPage() {
  const { workspaceId } = Route.useLoaderData();
  const overviewQuery = useQuery({
    queryKey: ["workspace-overview", workspaceId],
    queryFn: () => getWorkspaceOverview({ data: { workspaceId } }),
  });
  const data = overviewQuery.data;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [starred, setStarred] = useState(true);
  const [docSearch, setDocSearch] = useState("");
  const [docFilter, setDocFilter] = useState<string>("all");
  const [showInvite, setShowInvite] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [recentUploads, setRecentUploads] = useState<RecentDoc[]>([]);
  const [recentSort, setRecentSort] = useState<"newest" | "oldest">("newest");
  const [recentSearch, setRecentSearch] = useState("");
  const navigate = useNavigate();

  // Dữ liệu thật -> shape hiển thị.
  const members: MemberRow[] = useMemo(
    () =>
      (data?.members ?? []).map((m) => ({
        seed: m.userId,
        name: m.name,
        title: m.title || m.department || "Thành viên",
        role: (m.role === "owner"
          ? "owner"
          : m.role === "admin"
            ? "admin"
            : "member") as MemberRole,
        email: m.email,
      })),
    [data],
  );

  const tasks = useMemo(
    () =>
      (data?.tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        assignee: t.assignees[0] ?? t.id,
        due: dueLabel(t.dueAt),
        priority: TASK_PRIORITY_LABEL[t.priority] ?? t.priority,
        status: TASK_STATUS_LABEL[t.status] ?? t.status,
      })),
    [data],
  );

  const openTasksView = useMemo(
    () => (data?.tasks ?? []).filter((t) => t.status !== "done" && t.status !== "canceled"),
    [data],
  );

  const milestones = useMemo(
    () =>
      [...(data?.tasks ?? [])]
        .filter((t) => t.dueAt)
        .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
        .slice(0, 5)
        .map((t) => ({
          name: t.title,
          status: t.status === "done" ? "done" : t.status === "in_progress" ? "doing" : "todo",
          date: dueLabel(t.dueAt),
        })),
    [data],
  );

  const docs = useMemo(
    () =>
      (data?.documents ?? []).map((d) => ({
        id: d.id,
        name: d.title,
        type: mimeToType(d.mimeType, d.title),
        size: formatBytes(d.sizeBytes),
        updated: relativeTime(d.updatedAt),
        owner: data?.members.find((m) => m.userId === d.ownerId)?.name ?? "—",
      })),
    [data],
  );

  const meetings = useMemo(
    () =>
      (data?.meetings ?? []).map((m) => ({
        id: m.id,
        title: m.title,
        time: `${new Date(m.startAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${m.endAt ? ` - ${new Date(m.endAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : ""}`,
        today: new Date(m.startAt).toDateString() === new Date().toDateString(),
        attendees: m.attendees,
        status: MEETING_STATUS_LABEL[m.status] ?? m.status,
      })),
    [data],
  );

  const activity = useMemo(
    () =>
      (data?.activity ?? []).map((a) => ({
        who: a.actorName,
        what: a.action,
        target: a.resourceType ? `${a.resourceType}` : a.resourceLabel,
        time: relativeTime(a.occurredAt),
        icon:
          a.resourceType === "task"
            ? CheckCircle2
            : a.resourceType === "document"
              ? FileText
              : a.resourceType === "meeting"
                ? Video
                : Activity,
      })),
    [data],
  );

  const totalTasks = data?.tasks.length ?? 0;
  const progress =
    totalTasks > 0 ? Math.round(((data?.kpis.doneTasks ?? 0) / totalTasks) * 100) : 0;
  const health: Workspace["health"] =
    (data?.kpis.overdueTasks ?? 0) > 3
      ? "Rủi ro"
      : (data?.kpis.overdueTasks ?? 0) > 0
        ? "Cần chú ý"
        : "Tốt";

  const ws: Workspace = useMemo(
    () => ({
      slug: workspaceId,
      name: data?.workspace.name ?? "Workspace",
      letter: (data?.workspace.name ?? "W").trim().charAt(0).toUpperCase(),
      color: wsColor(workspaceId),
      tagline: data ? `Múi giờ ${data.workspace.timezone}` : "",
      description: data
        ? `Không gian làm việc với ${data.kpis.members} thành viên, ${data.kpis.openTasks} nhiệm vụ đang mở và ${data.kpis.documents} tài liệu.`
        : "",
      owner: data?.workspace.ownerName ?? "—",
      members: data?.kpis.members ?? 0,
      health,
      progress,
      deadline:
        openTasksView.filter((t) => t.dueAt).length > 0
          ? dueLabel(
              [...openTasksView]
                .filter((t) => t.dueAt)
                .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())[0]
                .dueAt,
            )
          : "Không hạn",
      tags: data?.workspace.isOwner ? ["Chủ sở hữu"] : [],
    }),
    [data, workspaceId, health, progress, openTasksView],
  );

  const kpis = useMemo(
    () => [
      {
        label: "Thành viên",
        value: String(data?.kpis.members ?? 0),
        icon: Users,
        tint: "bg-violet-500/15 text-violet-300",
      },
      {
        label: "Nhiệm vụ mở",
        value: String(data?.kpis.openTasks ?? 0),
        icon: CheckCircle2,
        tint: "bg-emerald-500/15 text-emerald-300",
      },
      {
        label: "Tài liệu",
        value: String(data?.kpis.documents ?? 0),
        icon: FileText,
        tint: "bg-sky-500/15 text-sky-300",
      },
      {
        label: "Cuộc họp tuần",
        value: String(data?.kpis.meetingsThisWeek ?? 0),
        icon: Video,
        tint: "bg-rose-500/15 text-rose-300",
      },
      {
        label: "Quy trình",
        value: String(data?.kpis.workflows ?? 0),
        icon: GitBranch,
        tint: "bg-amber-500/15 text-amber-300",
      },
    ],
    [data],
  );

  const displayRecent = useMemo(() => {
    const q = recentSearch.trim().toLowerCase();
    if (!q) return recentUploads;
    return recentUploads.filter(
      (d) => d.name.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [recentUploads, recentSearch]);

  const healthCls =
    ws.health === "Tốt"
      ? "bg-emerald-500/15 text-emerald-300"
      : ws.health === "Cần chú ý"
        ? "bg-amber-500/15 text-amber-300"
        : "bg-rose-500/15 text-rose-300";

  if (overviewQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Đang tải workspace...
      </div>
    );
  }
  if (overviewQuery.isError) {
    return (
      <div
        role="alert"
        className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-rose-400"
      >
        Không tải được workspace: {(overviewQuery.error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        {/* Header */}
        <div className="border-b border-border px-4 py-5 sm:px-6">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link to="/dashboard" className="hover:text-foreground">
              Workspaces
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">{ws.name}</span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white ${ws.color}`}
              >
                {ws.letter}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold sm:text-2xl">{ws.name}</h1>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${healthCls}`}>
                    {ws.health}
                  </span>
                  {ws.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{ws.tagline}</p>
                <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground/90">
                  {ws.description}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setStarred((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${starred ? "bg-amber-500/15 text-amber-300" : "bg-surface-2 text-muted-foreground hover:text-foreground"}`}
              >
                <Star className={`h-4 w-4 ${starred ? "fill-current" : ""}`} />{" "}
                {starred ? "Đã ghim" : "Ghim"}
              </button>
              <button
                onClick={() => setShowInvite(true)}
                className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-2/70"
              >
                <Users className="h-4 w-4" /> Mời
              </button>
              <button
                onClick={() => setShowCreateTask(true)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Nhiệm vụ
              </button>
              <button
                onClick={() => setShowEdit(true)}
                className="rounded-lg bg-surface-2 p-2 hover:bg-surface-2/70"
                aria-label="Cài đặt"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Meta strip */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <img src={avatar(ws.owner)} alt="" className="h-5 w-5 rounded-full" />
              Quản lý: <span className="text-foreground">{ws.owner}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {ws.members} thành viên
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Hạn: {ws.deadline}
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Cập nhật 5 phút trước
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-6">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((tabItem) => (
              <button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id)}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors ${
                  tab === tabItem.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tabItem.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4 p-4 sm:p-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${k.tint}`}>
                    <k.icon className="h-4 w-4" />
                  </span>
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <div className="mt-2 text-lg font-bold">{k.value}</div>
                <div className="text-[11px] text-muted-foreground">{k.label}</div>
              </div>
            ))}
          </div>

          {tab === "overview" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Progress + Milestones */}
              <div className="lg:col-span-2 space-y-4">
                <div className="rounded-xl border border-border bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold">Tiến độ tổng thể</h2>
                      <p className="text-xs text-muted-foreground">Sprint 9 · Tuần 24</p>
                    </div>
                    <span className="text-2xl font-bold text-primary">{ws.progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400"
                      style={{ width: `${ws.progress}%` }}
                    />
                  </div>
                  <ol className="mt-4 space-y-2.5">
                    {milestones.map((m) => (
                      <li key={m.name} className="flex items-center gap-3">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${
                            m.status === "done"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : m.status === "doing"
                                ? "bg-primary/20 text-primary"
                                : "bg-surface-2 text-muted-foreground"
                          }`}
                        >
                          {m.status === "done" ? "✓" : m.status === "doing" ? "•" : ""}
                        </span>
                        <div className="flex-1 text-sm">{m.name}</div>
                        <span className="text-xs text-muted-foreground">{m.date}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Tasks preview */}
                <div className="rounded-xl border border-border bg-surface">
                  <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="text-sm font-semibold">Nhiệm vụ ưu tiên</h2>
                    <button
                      onClick={() => setTab("tasks")}
                      className="text-xs text-primary hover:underline"
                    >
                      Xem tất cả
                    </button>
                  </div>
                  <ul className="divide-y divide-border">
                    {tasks.length === 0 && (
                      <li className="p-6 text-center text-sm text-muted-foreground">
                        Chưa có nhiệm vụ nào
                      </li>
                    )}
                    {tasks.slice(0, 5).map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center gap-3 p-3 hover:bg-surface-2/40"
                      >
                        <input type="checkbox" className="h-4 w-4 rounded border-border" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{task.title}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {task.due}
                            </span>
                            <span>·</span>
                            <span>{task.status}</span>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            task.priority === "Cao"
                              ? "bg-rose-500/15 text-rose-300"
                              : task.priority === "Trung bình"
                                ? "bg-amber-500/15 text-amber-300"
                                : "bg-surface-2 text-muted-foreground"
                          }`}
                        >
                          {task.priority}
                        </span>
                        <img
                          src={avatar(task.assignee)}
                          alt=""
                          className="h-6 w-6 rounded-full bg-surface-2"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Side column */}
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-surface p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Thành viên</h2>
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => setTab("members")}
                    >
                      Quản lý
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {members.length === 0 && (
                      <li className="py-4 text-center text-xs text-muted-foreground">
                        Chưa có thành viên
                      </li>
                    )}
                    {members.slice(0, 5).map((m) => (
                      <li key={m.seed} className="flex items-center gap-3">
                        <img
                          src={avatar(m.seed)}
                          alt=""
                          className="h-8 w-8 rounded-lg bg-surface-2"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{m.name}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {m.title} · {ROLE_LABEL[m.role]}
                          </div>
                        </div>
                        <button
                          onClick={() => toast.message(`Thao tác cho ${m.name}`)}
                          className="rounded p-1 text-muted-foreground hover:bg-surface-2"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-border bg-surface p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Cuộc họp sắp tới</h2>
                    <Bell className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <ul className="space-y-2">
                    {meetings.length === 0 && (
                      <li className="py-4 text-center text-xs text-muted-foreground">
                        Chưa có cuộc họp
                      </li>
                    )}
                    {meetings.slice(0, 5).map((m) => (
                      <li
                        key={m.id}
                        className="rounded-lg border border-border p-2.5 hover:bg-surface-2/40"
                      >
                        <div className="flex items-center gap-2">
                          <Video className="h-3.5 w-3.5 text-primary" />
                          <div className="truncate text-sm">{m.title}</div>
                          {m.today && (
                            <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] text-emerald-300">
                              Hôm nay
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{m.time}</span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {m.attendees}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-border bg-gradient-to-br from-primary/15 via-surface to-surface p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold">AI Insight</h2>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    3 nhiệm vụ trong Sprint 9 có nguy cơ trễ hạn. Đề xuất phân bổ lại cho Trần Minh
                    và Phạm Quỳnh để đảm bảo milestone MVP.
                  </p>
                  <button
                    onClick={() => navigate({ to: "/ai" })}
                    className="mt-2 text-xs font-medium text-primary hover:underline"
                  >
                    Xem chi tiết →
                  </button>
                </div>
                <AskUniPanel
                  rootEntity={{ type: "WORKSPACE", id: workspaceId }}
                  workspaceId={workspaceId}
                  label="Hỏi UNI về dự án này"
                  suggestions={["Dự án này đang vướng gì?", "Tóm tắt tình trạng dự án", "Tuần này có trao đổi gì?"]}
                />
                <RelatedWorkPanel
                  entityType="WORKSPACE"
                  entityId={workspaceId}
                  className="rounded-xl border border-border bg-surface p-4"
                />
              </div>
            </div>
          )}

          {tab === "tasks" && (
            <div className="rounded-xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border p-4">
                <h2 className="text-sm font-semibold">Tất cả nhiệm vụ</h2>
                <button
                  onClick={() => setShowCreateTask(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-3.5 w-3.5" /> Tạo nhiệm vụ
                </button>
              </div>
              <ul className="divide-y divide-border">
                {tasks.length === 0 && (
                  <li className="p-8 text-center text-sm text-muted-foreground">
                    Chưa có nhiệm vụ nào trong workspace này
                  </li>
                )}
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 p-3 hover:bg-surface-2/40">
                    <input type="checkbox" className="h-4 w-4 rounded border-border" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{task.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {task.status} · {task.due}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{task.priority}</span>
                    <img src={avatar(task.assignee)} alt="" className="h-6 w-6 rounded-full" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "documents" && (
            <div className="space-y-4">
              {/* Toolbar: search + type filters */}
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-sm font-semibold">Tài liệu dự án</h2>
                  <div className="flex items-center gap-2">
                    <Link to="/documents" className="text-xs text-primary hover:underline">
                      Mở Documents
                    </Link>
                    <button
                      onClick={() => setShowUploadDoc(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      <Plus className="h-3.5 w-3.5" /> Thêm tài liệu
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm tài liệu..."
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {docSearch && (
                    <button
                      onClick={() => setDocSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-surface-2"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {DOC_TYPES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setDocFilter(t.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        docFilter === t.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface-2 text-muted-foreground hover:bg-surface-2/70 hover:text-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent uploads */}
              {recentUploads.length > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <h3 className="text-sm font-semibold text-emerald-200">
                        Vừa tải lên ({displayRecent.length})
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-300/70" />
                        <input
                          type="text"
                          value={recentSearch}
                          onChange={(e) => setRecentSearch(e.target.value)}
                          placeholder="Tìm theo tên hoặc tags..."
                          className="h-8 w-40 rounded-md border border-emerald-500/20 bg-emerald-500/10 pl-7 pr-7 text-xs text-emerald-100 placeholder:text-emerald-300/50 focus:outline-none focus:ring-1 focus:ring-emerald-400/40 sm:w-56"
                        />
                        {recentSearch && (
                          <button
                            onClick={() => setRecentSearch("")}
                            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-emerald-300/70 hover:bg-emerald-500/20 hover:text-emerald-200"
                            title="Xóa tìm kiếm"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => setRecentSort((s) => (s === "newest" ? "oldest" : "newest"))}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                        title={recentSort === "newest" ? "Mới nhất trước" : "Cũ nhất trước"}
                      >
                        <ArrowUpDown className="h-3 w-3" />
                        {recentSort === "newest" ? "Mới nhất" : "Cũ nhất"}
                      </button>
                      <button
                        onClick={() => setRecentUploads([])}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Ẩn
                      </button>
                    </div>
                  </div>
                  {displayRecent.length === 0 ? (
                    <div className="py-6 text-center text-sm text-emerald-300/80">
                      Không tìm thấy tài liệu phù hợp
                    </div>
                  ) : (
                    <ul className="divide-y divide-emerald-500/10">
                      {[...displayRecent]
                        .sort((a, b) =>
                          recentSort === "newest"
                            ? b.uploadedAt - a.uploadedAt
                            : a.uploadedAt - b.uploadedAt,
                        )
                        .map((d) => (
                          <li key={d.name} className="flex items-center gap-3 py-2.5">
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${docTypeBg(d.type)}`}
                            >
                              {docTypeIcon(d.type)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-medium">{d.name}</div>
                                <span
                                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${docTypeBg(d.type)}`}
                                >
                                  {d.type === "xlsx"
                                    ? "Excel"
                                    : d.type === "ppt"
                                      ? "PPTX"
                                      : d.type === "image"
                                        ? "Image"
                                        : d.type === "pdf"
                                          ? "PDF"
                                          : d.type === "doc"
                                            ? "Word"
                                            : "File"}
                                </span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                                <span className="font-medium text-foreground/80">{d.size}</span>
                                <span>·</span>
                                <span>{d.folder}</span>
                                {d.tags.length > 0 && (
                                  <>
                                    <span>·</span>
                                    <span className="flex items-center gap-1">
                                      <TagIcon className="h-3 w-3" />
                                      {d.tags.join(", ")}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                onClick={() => {
                                  const url = URL.createObjectURL(d.file);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = d.file.name;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                  toast.success(`Đã tải xuống ${d.file.name}`);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                                title="Tải xuống"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                                Đã xong
                              </span>
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Document list */}
              <div className="rounded-xl border border-border bg-surface">
                <ul className="divide-y divide-border">
                  {(() => {
                    const filtered = docs.filter((d) => {
                      const matchesSearch = d.name.toLowerCase().includes(docSearch.toLowerCase());
                      const matchesType = docFilter === "all" || d.type === docFilter;
                      return matchesSearch && matchesType;
                    });
                    if (filtered.length === 0) {
                      return (
                        <li className="p-8 text-center text-sm text-muted-foreground">
                          Không tìm thấy tài liệu phù hợp
                        </li>
                      );
                    }
                    return filtered.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center gap-3 p-3 hover:bg-surface-2/40 group"
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-lg ${docTypeBg(d.type)}`}
                        >
                          {docTypeIcon(d.type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{d.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {d.size} · {d.owner} · cập nhật {d.updated}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => toast.success(`Đang tải xuống ${d.name}`)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-surface-2"
                            title="Tải xuống"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              toast.message("Thao tác tài liệu", { description: d.name })
                            }
                            className="rounded p-1.5 text-muted-foreground hover:bg-surface-2"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ));
                  })()}
                </ul>
              </div>
            </div>
          )}

          {tab === "meetings" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {meetings.map((m) => (
                <div key={m.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">{m.title}</h3>
                    {m.today && (
                      <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] text-emerald-300">
                        Hôm nay
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{m.time}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      <Users className="mr-1 inline h-3 w-3" />
                      {m.attendees} tham gia
                    </span>
                    <button
                      onClick={() => {
                        toast.success(`Đang vào: ${m.title}`);
                        navigate({ to: "/meeting" });
                      }}
                      className="rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/25"
                    >
                      Tham gia
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "members" && (
            <div className="rounded-xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border p-4">
                <h2 className="text-sm font-semibold">Thành viên ({members.length})</h2>
                <button
                  onClick={() => setShowInvite(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Mời
                </button>
              </div>
              <ul className="divide-y divide-border">
                {members.map((m) => (
                  <li key={m.seed} className="flex flex-wrap items-center gap-3 p-3">
                    <img src={avatar(m.seed)} alt="" className="h-9 w-9 rounded-lg bg-surface-2" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{m.name}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] ${ROLE_TINT[m.role]}`}
                        >
                          {ROLE_LABEL[m.role]}
                        </span>
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {m.title} · {m.email}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate({ to: "/chat" })}
                      className="rounded p-1 text-muted-foreground hover:bg-surface-2"
                      aria-label="Nhắn tin"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <Link
                      to="/people/$id"
                      params={{ id: m.seed }}
                      className="rounded p-1 text-muted-foreground hover:bg-surface-2"
                      aria-label="Xem hồ sơ"
                    >
                      <Users className="h-4 w-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "activity" && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold">Hoạt động gần đây</h2>
              <ul className="space-y-3">
                {activity.length === 0 && (
                  <li className="py-6 text-center text-sm text-muted-foreground">
                    Chưa có hoạt động nào
                  </li>
                )}
                {activity.map((a, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
                      <a.icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{a.who}</span>{" "}
                        <span className="text-muted-foreground">{a.what}</span>{" "}
                        <span className="font-medium">{a.target}</span>
                      </p>
                      <div className="text-[11px] text-muted-foreground">{a.time}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <InviteDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        wsName={ws.name}
        wsSlug={ws.slug}
        onInvite={() => {
          void overviewQuery.refetch();
        }}
      />
      <EditWorkspaceDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        ws={ws}
        onSave={() => {
          void overviewQuery.refetch();
          toast.success("Đã cập nhật workspace");
        }}
      />
      <CreateTaskDialog
        open={showCreateTask}
        onOpenChange={setShowCreateTask}
        wsName={ws.name}
        members={members}
      />
      <UploadDocumentDialog
        open={showUploadDoc}
        onOpenChange={setShowUploadDoc}
        wsName={ws.name}
        onUploadComplete={(docs) => {
          setRecentUploads(docs);
          setTab("documents");
        }}
      />
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  wsName,
  wsSlug,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wsName: string;
  wsSlug: string;
  onInvite: (rows: MemberRow[]) => void;
}) {
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const link = useMemo(
    () => `https://uniwork.app/invite/${wsSlug}-${Math.random().toString(36).slice(2, 7)}`,
    [wsSlug, open],
  );

  const submit = () => {
    const list = emails
      .split(/[,\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) {
      toast.error("Nhập ít nhất một email");
      return;
    }
    const invalid = list.filter((e) => !/^\S+@\S+\.\S+$/.test(e));
    if (invalid.length) {
      toast.error(`Email không hợp lệ: ${invalid.join(", ")}`);
      return;
    }
    const rows: MemberRow[] = list.map((email) => {
      const name = email
        .split("@")[0]
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return { seed: email, name, title: "Mới mời", role, email };
    });
    onInvite(rows);
    toast.success(`Đã gửi ${list.length} lời mời với quyền ${ROLE_LABEL[role]}`);
    setEmails("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" /> Mời thành viên vào {wsName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Email (cách nhau bằng dấu phẩy)
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="vd: nam@uniwork.vn, linh@uniwork.vn"
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Vai trò</label>
            <div className="grid grid-cols-3 gap-2">
              {(["viewer", "member", "admin"] as MemberRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`rounded-md border py-2 text-xs transition ${
                    role === r
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-2"
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <label className="mb-1.5 block text-xs font-medium">Hoặc chia sẻ liên kết mời</label>
            <div className="flex gap-2">
              <Input value={link} readOnly className="bg-surface-2 text-xs" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  toast.success("Đã sao chép liên kết");
                }}
              >
                <Copy className="size-4" /> Sao chép
              </Button>
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <AlertCircle className="size-3" /> Liên kết hết hạn sau 7 ngày
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit}>
            <Mail className="size-4" /> Gửi lời mời
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditWorkspaceDialog({
  open,
  onOpenChange,
  ws,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ws: Workspace;
  onSave: (patch: Partial<Workspace>) => void;
}) {
  const [name, setName] = useState(ws.name);
  const [tagline, setTagline] = useState(ws.tagline);
  const [description, setDescription] = useState(ws.description);
  const [deadline, setDeadline] = useState(ws.deadline);
  const [tagsStr, setTagsStr] = useState(ws.tags.join(", "));
  const [health, setHealth] = useState<Workspace["health"]>(ws.health);

  useEffect(() => {
    if (!open) return;
    setName(ws.name);
    setTagline(ws.tagline);
    setDescription(ws.description);
    setDeadline(ws.deadline);
    setTagsStr(ws.tags.join(", "));
    setHealth(ws.health);
  }, [open, ws]);

  const submit = () => {
    if (!name.trim()) {
      toast.error("Tên workspace không được trống");
      return;
    }
    onSave({
      name: name.trim(),
      tagline: tagline.trim(),
      description: description.trim(),
      deadline: deadline.trim(),
      health,
      tags: tagsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-5 text-primary" /> Cài đặt workspace
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Tên</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Tagline</label>
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Mô tả</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Hạn</label>
              <Input value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Tình trạng</label>
              <select
                value={health}
                onChange={(e) => setHealth(e.target.value as Workspace["health"])}
                className="w-full rounded-md border border-border bg-surface-2 px-2 py-2 text-sm"
              >
                <option value="Tốt">Tốt</option>
                <option value="Cần chú ý">Cần chú ý</option>
                <option value="Rủi ro">Rủi ro</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Tags (cách nhau bằng dấu phẩy)</label>
            <Input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit}>Lưu thay đổi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  wsName,
  members,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wsName: string;
  members: MemberRow[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState(members[0]?.seed ?? "");
  const [priority, setPriority] = useState<"Cao" | "Trung bình" | "Thấp">("Trung bình");
  const [due, setDue] = useState("");
  const [status, setStatus] = useState("Mới");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setAssignee(members[0]?.seed ?? "");
    setPriority("Trung bình");
    setDue("");
    setStatus("Mới");
  }, [open, members]);

  const submit = () => {
    if (!title.trim()) {
      toast.error("Tên nhiệm vụ không được trống");
      return;
    }
    const who = members.find((m) => m.seed === assignee)?.name ?? "—";
    toast.success(`Đã tạo nhiệm vụ "${title.trim()}" cho ${who}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-5 text-primary" /> Tạo nhiệm vụ trong {wsName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Tiêu đề</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="vd: Soạn báo cáo tuần"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Mô tả</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Mô tả ngắn gọn nội dung công việc..."
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Người phụ trách</label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-2 py-2 text-sm"
              >
                {members.map((m) => (
                  <option key={m.seed} value={m.seed}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Hạn</label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Mức ưu tiên</label>
            <div className="grid grid-cols-3 gap-2">
              {(["Thấp", "Trung bình", "Cao"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`rounded-md border py-2 text-xs transition ${
                    priority === p
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-2"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Trạng thái</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-2 px-2 py-2 text-sm"
            >
              <option>Mới</option>
              <option>Đang làm</option>
              <option>Cần review</option>
              <option>Hoàn thành</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit}>
            <Plus className="size-4" /> Tạo nhiệm vụ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDocumentDialog({
  open,
  onOpenChange,
  wsName,
  onUploadComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wsName: string;
  onUploadComplete?: (docs: RecentDoc[]) => void;
}) {
  type UploadItem = {
    id: string;
    file: File;
    relPath: string;
    progress: number;
    status: "pending" | "uploading" | "done" | "error";
    error?: string;
  };

  const MAX_SIZE = 50 * 1024 * 1024;
  const [items, setItems] = useState<UploadItem[]>([]);
  const [folder, setFolder] = useState("Tài liệu dự án");
  const [tagsStr, setTagsStr] = useState("");
  const [visibility, setVisibility] = useState<"workspace" | "private">("workspace");
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) {
      setItems([]);
      setTagsStr("");
      setDescription("");
      setVisibility("workspace");
      setUploading(false);
      setDragOver(false);
    }
  }, [open]);

  const guessType = (name: string): string => {
    const ext = name.toLowerCase().split(".").pop() ?? "";
    if (ext === "pdf") return "pdf";
    if (["xls", "xlsx", "csv"].includes(ext)) return "xlsx";
    if (["doc", "docx"].includes(ext)) return "doc";
    if (["ppt", "pptx", "key"].includes(ext)) return "ppt";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "fig"].includes(ext)) return "image";
    return "other";
  };

  const formatSize = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const addFiles = (incoming: File[], opts?: { keepPath?: boolean }) => {
    const accepted: UploadItem[] = [];
    const rejected: string[] = [];
    for (const f of incoming) {
      if (f.size > MAX_SIZE) {
        rejected.push(`${f.name} (>50MB)`);
        continue;
      }
      const anyF = f as File & { webkitRelativePath?: string };
      const relPath = opts?.keepPath && anyF.webkitRelativePath ? anyF.webkitRelativePath : f.name;
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${f.name}`,
        file: f,
        relPath,
        progress: 0,
        status: "pending",
      });
    }
    if (rejected.length) toast.error(`Bỏ qua: ${rejected.join(", ")}`);
    if (accepted.length) setItems((prev) => [...prev, ...accepted]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    const dt = e.dataTransfer;
    if (!dt) return;
    addFiles(Array.from(dt.files));
  };

  const totalSize = items.reduce((s, i) => s + i.file.size, 0);
  const overallProgress = items.length
    ? Math.round(items.reduce((s, i) => s + i.progress, 0) / items.length)
    : 0;
  const folders = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      const parts = it.relPath.split("/");
      if (parts.length > 1) set.add(parts[0]);
    });
    return Array.from(set);
  }, [items]);

  const submit = () => {
    if (items.length === 0) {
      toast.error("Chọn ít nhất một tệp để tải lên");
      return;
    }
    setUploading(true);
    setItems((prev) => prev.map((i) => ({ ...i, status: "uploading" as const, progress: 0 })));
    const tags = tagsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const startedAt = Date.now();

    items.forEach((it) => {
      // Simulate per-file progress; larger files take longer
      const duration = Math.min(2800, 600 + it.file.size / 50_000);
      const steps = 14;
      let step = 0;
      const interval = setInterval(() => {
        step += 1;
        const pct = Math.min(100, Math.round((step / steps) * 100));
        setItems((prev) =>
          prev.map((x) =>
            x.id === it.id ? { ...x, progress: pct, status: pct >= 100 ? "done" : "uploading" } : x,
          ),
        );
        if (pct >= 100) clearInterval(interval);
      }, duration / steps);
    });

    // Wait until all done
    const checker = setInterval(() => {
      setItems((curr) => {
        if (curr.every((c) => c.status === "done")) {
          clearInterval(checker);
          const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
          toast.success(`Đã tải lên ${curr.length} tệp vào ${wsName} · ${folder} (${elapsed}s)`, {
            description:
              tags.length > 0 ? `Tags: ${tags.join(", ")}` : description ? description : undefined,
          });
          onUploadComplete?.(
            curr.map((c) => ({
              name: c.relPath,
              type: guessType(c.file.name),
              size: formatSize(c.file.size),
              folder,
              tags,
              visibility,
              description,
              file: c.file,
              uploadedAt: Date.now(),
            })),
          );
          setUploading(false);
          onOpenChange(false);
        }
        return curr;
      });
    }, 250);
  };

  return (
    <Dialog open={open} onOpenChange={uploading ? undefined : onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-5 text-primary" /> Thêm tài liệu vào {wsName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploading) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border bg-surface-2/40"
            } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Upload className="size-5" />
            </span>
            <div className="text-sm font-medium">Kéo thả tệp/thư mục vào đây hoặc bấm để chọn</div>
            <div className="text-[11px] text-muted-foreground">
              PDF, Word, Excel, PowerPoint, hình ảnh · tối đa 50MB / tệp
            </div>
            <div className="mt-2 flex gap-2">
              <label className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2">
                <FileText className="mr-1 inline size-3.5" /> Chọn tệp
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2">
                <FolderOpen className="mr-1 inline size-3.5" /> Chọn thư mục
                <input
                  type="file"
                  multiple
                  className="hidden"
                  // @ts-expect-error non-standard but widely supported
                  webkitdirectory=""
                  directory=""
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []), { keepPath: true });
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>

          {/* Empty / list */}
          {items.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-surface-2/30 px-4 py-6 text-center">
              <FileText className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Chưa có tệp nào</p>
              <p className="text-[11px] text-muted-foreground">
                Kéo thả hoặc chọn tệp để tải lên. Metadata áp dụng cho toàn bộ lần tải lên này
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
                <span>
                  {items.length} tệp · {formatSize(totalSize)}
                  {folders.length > 0 && ` · ${folders.length} thư mục`}
                </span>
                {!uploading && (
                  <button onClick={() => setItems([])} className="text-rose-400 hover:underline">
                    Xoá tất cả
                  </button>
                )}
              </div>
              <ul className="max-h-56 divide-y divide-border overflow-y-auto">
                {items.map((it) => {
                  const t = guessType(it.file.name);
                  return (
                    <li key={it.id} className="px-3 py-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded ${docTypeBg(t)}`}
                        >
                          {docTypeIcon(t)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{it.relPath}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatSize(it.file.size)}
                            {it.file.type && ` · ${it.file.type}`}
                          </div>
                        </div>
                        {it.status === "done" ? (
                          <CheckCircle2 className="size-4 text-emerald-400" />
                        ) : it.status === "uploading" ? (
                          <span className="text-[10px] text-muted-foreground">{it.progress}%</span>
                        ) : (
                          !uploading && (
                            <button
                              onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                              className="rounded p-0.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
                            >
                              <X className="size-3.5" />
                            </button>
                          )
                        )}
                      </div>
                      {(it.status === "uploading" || it.status === "done") && (
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={`h-full rounded-full transition-all ${it.status === "done" ? "bg-emerald-400" : "bg-primary"}`}
                            style={{ width: `${it.progress}%` }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {uploading && (
                <div className="border-t border-border px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Đang tải lên…</span>
                    <span>{overallProgress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all"
                      style={{ width: `${overallProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium">
                <FolderOpen className="size-3.5" /> Thư mục
              </label>
              <select
                disabled={uploading}
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-2 py-2 text-sm disabled:opacity-60"
              >
                <option>Tài liệu dự án</option>
                <option>Kế hoạch</option>
                <option>Báo cáo</option>
                <option>Thiết kế</option>
                <option>Hợp đồng</option>
                <option>Khác</option>
              </select>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium">
                {visibility === "workspace" ? (
                  <Eye className="size-3.5" />
                ) : (
                  <Lock className="size-3.5" />
                )}
                Quyền truy cập
              </label>
              <select
                disabled={uploading}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as "workspace" | "private")}
                className="w-full rounded-md border border-border bg-surface-2 px-2 py-2 text-sm disabled:opacity-60"
              >
                <option value="workspace">Cả workspace có thể xem</option>
                <option value="private">Chỉ tôi</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium">
              <TagIcon className="size-3.5" /> Tags (cách nhau bằng dấu phẩy)
            </label>
            <Input
              disabled={uploading}
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="vd: q3-2026, kpi, nội bộ"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Mô tả (tuỳ chọn)</label>
            <textarea
              disabled={uploading}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Mô tả ngắn về nội dung tệp đính kèm..."
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={uploading} onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={uploading || items.length === 0}>
            {uploading ? (
              <>
                <Upload className="size-4 animate-pulse" /> Đang tải {overallProgress}%
              </>
            ) : (
              <>
                <Upload className="size-4" /> Tải lên {items.length > 0 ? `(${items.length})` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
