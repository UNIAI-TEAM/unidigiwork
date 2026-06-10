import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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

const WORKSPACES: Record<string, Workspace> = {
  stos: {
    slug: "stos",
    name: "STOS Project",
    letter: "S",
    color: "bg-emerald-500",
    tagline: "Smart Office Transformation System",
    description:
      "Triển khai nền tảng văn phòng số STOS cho khối hành chính, tích hợp với UNIWORK và các hệ thống nội bộ.",
    owner: "Nguyễn Văn A",
    members: 24,
    health: "Tốt",
    progress: 68,
    deadline: "30/09/2026",
    tags: ["Chiến lược", "Q3", "Cross-team"],
  },
  "smart-university": {
    slug: "smart-university",
    name: "Smart University",
    letter: "U",
    color: "bg-sky-500",
    tagline: "Hệ sinh thái Đại học thông minh",
    description: "Số hoá quản trị đào tạo và trải nghiệm sinh viên.",
    owner: "Trần Minh",
    members: 18,
    health: "Cần chú ý",
    progress: 42,
    deadline: "15/12/2026",
    tags: ["Giáo dục", "Sản phẩm"],
  },
  "uni-hrm": {
    slug: "uni-hrm",
    name: "UNI-HRM",
    letter: "M",
    color: "bg-rose-500",
    tagline: "Nền tảng nhân sự",
    description: "Quản lý nhân sự, KPI và đào tạo nội bộ.",
    owner: "Lê Hồng",
    members: 12,
    health: "Tốt",
    progress: 81,
    deadline: "10/07/2026",
    tags: ["HR", "Nội bộ"],
  },
  "marketing-pm": {
    slug: "marketing-pm",
    name: "Marketing & PM",
    letter: "H",
    color: "bg-violet-500",
    tagline: "Marketing và Quản lý dự án",
    description: "Phối hợp campaign, nội dung và tiến độ dự án khách hàng.",
    owner: "Phạm Quỳnh",
    members: 9,
    health: "Tốt",
    progress: 55,
    deadline: "Liên tục",
    tags: ["Marketing", "Vận hành"],
  },
  devops: {
    slug: "devops",
    name: "DevOps Team",
    letter: "D",
    color: "bg-orange-500",
    tagline: "Hạ tầng & vận hành",
    description: "Vận hành hạ tầng, CI/CD và giám sát hệ thống.",
    owner: "Hoàng Linh",
    members: 7,
    health: "Rủi ro",
    progress: 73,
    deadline: "Liên tục",
    tags: ["Hạ tầng", "On-call"],
  },
};

export const Route = createFileRoute("/_authenticated/workspace/$id")({
  loader: ({ params }) => {
    const ws = WORKSPACES[params.id];
    if (!ws) throw notFound();
    return { ws };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.ws.name ?? "Workspace"} — UNIWORK` },
      { name: "description", content: loaderData?.ws.tagline ?? "Chi tiết workspace" },
    ],
  }),
  component: WorkspaceDetailPage,
});

const KPIS = [
  { label: "Thành viên", value: "24", icon: Users, tint: "bg-violet-500/15 text-violet-300" },
  {
    label: "Nhiệm vụ mở",
    value: "37",
    icon: CheckCircle2,
    tint: "bg-emerald-500/15 text-emerald-300",
  },
  { label: "Tài liệu", value: "128", icon: FileText, tint: "bg-sky-500/15 text-sky-300" },
  { label: "Cuộc họp tuần", value: "9", icon: Video, tint: "bg-rose-500/15 text-rose-300" },
  { label: "Quy trình", value: "12", icon: GitBranch, tint: "bg-amber-500/15 text-amber-300" },
];

const TABS = [
  { id: "overview", label: "Tổng quan" },
  { id: "tasks", label: "Nhiệm vụ" },
  { id: "documents", label: "Tài liệu" },
  { id: "meetings", label: "Cuộc họp" },
  { id: "members", label: "Thành viên" },
  { id: "activity", label: "Hoạt động" },
];

const MILESTONES = [
  { name: "Khảo sát & phân tích", status: "done", date: "30/04" },
  { name: "Thiết kế hệ thống", status: "done", date: "31/05" },
  { name: "Phát triển MVP", status: "doing", date: "20/07" },
  { name: "UAT & đào tạo", status: "todo", date: "25/08" },
  { name: "Go-live", status: "todo", date: "30/09" },
];

const TASKS = [
  {
    title: "Hoàn thiện thiết kế dashboard điều hành",
    assignee: "nguyen-van-a-1",
    due: "Hôm nay",
    priority: "Cao",
    status: "Đang làm",
  },
  {
    title: "Review API tích hợp HRM",
    assignee: "tran-minh",
    due: "Ngày mai",
    priority: "Trung bình",
    status: "Cần review",
  },
  {
    title: "Soạn tài liệu hướng dẫn người dùng",
    assignee: "le-hong",
    due: "T6",
    priority: "Thấp",
    status: "Mới",
  },
  {
    title: "Demo cho ban điều hành STOS",
    assignee: "pham-quynh",
    due: "Tuần sau",
    priority: "Cao",
    status: "Lên kế hoạch",
  },
];

type MemberRow = { seed: string; name: string; title: string; role: MemberRole; email: string };
const INITIAL_MEMBERS: MemberRow[] = [
  { seed: "nguyen-van-a-1", name: "Nguyễn Văn A", title: "Project Owner", role: "owner", email: "an.nv@uniwork.vn" },
  { seed: "tran-minh", name: "Trần Minh", title: "Tech Lead", role: "admin", email: "minh.tt@uniwork.vn" },
  { seed: "le-hong", name: "Lê Hồng", title: "Designer", role: "member", email: "hong.lt@uniwork.vn" },
  { seed: "pham-quynh", name: "Phạm Quỳnh", title: "PM", role: "admin", email: "quynh.pt@uniwork.vn" },
  { seed: "hoang-linh", name: "Hoàng Linh", title: "DevOps", role: "member", email: "linh.hh@uniwork.vn" },
  { seed: "vo-thanh", name: "Võ Thành", title: "QA", role: "viewer", email: "thanh.vv@uniwork.vn" },
];

const ACTIVITY = [
  {
    who: "Trần Minh",
    what: "đã cập nhật trạng thái nhiệm vụ",
    target: "API tích hợp HRM",
    time: "5 phút trước",
    icon: CheckCircle2,
  },
  {
    who: "Lê Hồng",
    what: "tải lên tài liệu",
    target: "STOS - User Guide v0.3.pdf",
    time: "1 giờ trước",
    icon: FileText,
  },
  {
    who: "Nguyễn Văn A",
    what: "đã tạo cuộc họp",
    target: "Review tiến độ sprint 9",
    time: "3 giờ trước",
    icon: Video,
  },
  {
    who: "Phạm Quỳnh",
    what: "thêm thành viên mới",
    target: "Võ Thành (QA)",
    time: "Hôm qua",
    icon: Users,
  },
];

const DOCS = [
  {
    name: "STOS - Tổng quan kiến trúc hệ thống.pdf",
    type: "pdf",
    size: "4.8 MB",
    updated: "Hôm nay",
    owner: "Trần Minh",
  },
  {
    name: "Kế hoạch triển khai Q3 2026.xlsx",
    type: "xlsx",
    size: "1.2 MB",
    updated: "Hôm qua",
    owner: "Nguyễn Văn A",
  },
  {
    name: "Báo cáo nghiên cứu người dùng.docx",
    type: "doc",
    size: "3.5 MB",
    updated: "2 ngày trước",
    owner: "Lê Hồng",
  },
  {
    name: "API Specification v1.2.pdf",
    type: "pdf",
    size: "2.1 MB",
    updated: "Tuần này",
    owner: "Trần Minh",
  },
  {
    name: "Mockup UI Dashboard v3.fig",
    type: "image",
    size: "18.4 MB",
    updated: "Tuần này",
    owner: "Lê Hồng",
  },
  {
    name: "Slide họp Steering Committee.pptx",
    type: "ppt",
    size: "8.6 MB",
    updated: "3 ngày trước",
    owner: "Phạm Quỳnh",
  },
  {
    name: "Báo cáo tiến độ tháng 5.pdf",
    type: "pdf",
    size: "2.9 MB",
    updated: "1 tuần trước",
    owner: "Đỗ Linh",
  },
  {
    name: "Dataset khảo sát nội bộ.xlsx",
    type: "xlsx",
    size: "856 KB",
    updated: "1 tuần trước",
    owner: "Trần Minh",
  },
  {
    name: "Tài liệu hướng dẫn vận hành.docx",
    type: "doc",
    size: "1.8 MB",
    updated: "2 tuần trước",
    owner: "Nguyễn Văn A",
  },
  {
    name: "Infographic quy trình mới.png",
    type: "image",
    size: "4.2 MB",
    updated: "2 tuần trước",
    owner: "Lê Hồng",
  },
];

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

const MEETINGS = [
  { title: "Standup hàng ngày", time: "09:00 - 09:15", today: true, attendees: 8 },
  { title: "Sprint Review #9", time: "14:00 - 15:30", today: true, attendees: 12 },
  { title: "Demo khách hàng STOS", time: "Mai · 10:00", today: false, attendees: 16 },
  { title: "Retrospective", time: "T6 · 16:00", today: false, attendees: 9 },
];

function WorkspaceDetailPage() {
  const { ws } = Route.useLoaderData() as { ws: Workspace };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [starred, setStarred] = useState(true);
  const [docSearch, setDocSearch] = useState("");
  const [docFilter, setDocFilter] = useState<string>("all");

  const healthCls =
    ws.health === "Tốt"
      ? "bg-emerald-500/15 text-emerald-300"
      : ws.health === "Cần chú ý"
        ? "bg-amber-500/15 text-amber-300"
        : "bg-rose-500/15 text-rose-300";

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
              <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-2/70">
                <Users className="h-4 w-4" /> Mời
              </button>
              <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" /> Nhiệm vụ
              </button>
              <button
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
            {KPIS.map((k) => (
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
                    {MILESTONES.map((m) => (
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
                    {TASKS.map((task) => (
                      <li
                        key={task.title}
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
                    {MEMBERS.slice(0, 5).map((m) => (
                      <li key={m.seed} className="flex items-center gap-3">
                        <img
                          src={avatar(m.seed)}
                          alt=""
                          className="h-8 w-8 rounded-lg bg-surface-2"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{m.name}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{m.role}</div>
                        </div>
                        <button className="rounded p-1 text-muted-foreground hover:bg-surface-2">
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
                    {MEETINGS.map((m) => (
                      <li
                        key={m.title}
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
                  <button className="mt-2 text-xs font-medium text-primary hover:underline">
                    Xem chi tiết →
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "tasks" && (
            <div className="rounded-xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border p-4">
                <h2 className="text-sm font-semibold">Tất cả nhiệm vụ</h2>
                <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-3.5 w-3.5" /> Tạo nhiệm vụ
                </button>
              </div>
              <ul className="divide-y divide-border">
                {TASKS.map((task) => (
                  <li
                    key={task.title}
                    className="flex items-center gap-3 p-3 hover:bg-surface-2/40"
                  >
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
                    <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
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

              {/* Document list */}
              <div className="rounded-xl border border-border bg-surface">
                <ul className="divide-y divide-border">
                  {(() => {
                    const filtered = DOCS.filter((d) => {
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
                        key={d.name}
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
                            className="rounded p-1.5 text-muted-foreground hover:bg-surface-2"
                            title="Tải xuống"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button className="rounded p-1.5 text-muted-foreground hover:bg-surface-2">
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
              {MEETINGS.map((m) => (
                <div key={m.title} className="rounded-xl border border-border bg-surface p-4">
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
                    <button className="rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/25">
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
                <h2 className="text-sm font-semibold">Thành viên ({ws.members})</h2>
                <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-3.5 w-3.5" /> Mời
                </button>
              </div>
              <ul className="divide-y divide-border">
                {MEMBERS.map((m) => (
                  <li key={m.seed} className="flex items-center gap-3 p-3">
                    <img src={avatar(m.seed)} alt="" className="h-9 w-9 rounded-lg bg-surface-2" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.name}</div>
                      <div className="text-[11px] text-muted-foreground">{m.role}</div>
                    </div>
                    <button className="rounded p-1 text-muted-foreground hover:bg-surface-2">
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button className="rounded p-1 text-muted-foreground hover:bg-surface-2">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "activity" && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold">Hoạt động gần đây</h2>
              <ul className="space-y-3">
                {ACTIVITY.map((a, i) => (
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
    </div>
  );
}
