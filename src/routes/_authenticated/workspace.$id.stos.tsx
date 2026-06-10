import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Calendar,
  FileText,
  Plus,
  Star,
  Sparkles,
  ChevronRight,
  Download,
  Share2,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  AlertCircle,
  UserPlus,
  Mail,
  Copy,
  FolderKanban,
  TrendingUp,
  Pin,
  FileSpreadsheet,
  FileImage,
  Presentation,
  ArrowLeft,
  Pencil,
  Trash2,
  Lock,
  ShieldCheck,
  History,
  Search,
  X,
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/workspace/$id/stos")({
  component: StosDetailPage,
});

type Role = "owner" | "admin" | "member" | "viewer";

type Project = {
  name: string;
  code: string;
  tagline: string;
  description: string;
  owner: string;
  ownerRole: string;
  members: number;
  deadline: string;
  startDate: string;
  budget: string;
  health: string;
  progress: number;
  tags: string[];
};

const INITIAL_PROJECT: Project = {
  name: "STOS Project",
  code: "STOS-2026",
  tagline: "Smart Office Transformation System",
  description:
    "Triển khai nền tảng văn phòng số STOS cho khối hành chính, tích hợp UNIWORK và các hệ thống nội bộ. Mục tiêu tự động hoá 80% quy trình giấy tờ trong Q3/2026.",
  owner: "Nguyễn Văn A",
  ownerRole: "Project Lead",
  members: 24,
  deadline: "30/09/2026",
  startDate: "01/04/2026",
  budget: "1.2 tỷ VNĐ",
  health: "Tốt",
  progress: 68,
  tags: ["Chiến lược", "Q3/2026", "Cross-team"],
};

type Doc = {
  id: string;
  name: string;
  type: "pdf" | "xlsx" | "ppt" | "image" | "doc";
  size: string;
  updatedBy: string;
  updatedAt: string;
};

const INITIAL_DOCUMENTS: Doc[] = [
  {
    id: "1",
    name: "Bản đặc tả kỹ thuật STOS v2.1.pdf",
    type: "pdf",
    size: "4.2 MB",
    updatedBy: "Trần Minh",
    updatedAt: "2 giờ trước",
  },
  {
    id: "2",
    name: "Kế hoạch triển khai Q3.xlsx",
    type: "xlsx",
    size: "1.8 MB",
    updatedBy: "Lê Hoa",
    updatedAt: "Hôm qua",
  },
  {
    id: "3",
    name: "Mockup UI Dashboard.fig",
    type: "image",
    size: "12.5 MB",
    updatedBy: "Phạm Nam",
    updatedAt: "2 ngày trước",
  },
  {
    id: "4",
    name: "Slide họp Steering Committee.pptx",
    type: "ppt",
    size: "8.1 MB",
    updatedBy: "Nguyễn Văn A",
    updatedAt: "3 ngày trước",
  },
  {
    id: "5",
    name: "Báo cáo tiến độ tháng 5.docx",
    type: "doc",
    size: "2.4 MB",
    updatedBy: "Đỗ Linh",
    updatedAt: "1 tuần trước",
  },
];

type Milestone = {
  id: string;
  name: string;
  progress: number;
  status: "done" | "active" | "todo";
  due: string;
  tasks: number;
  completed: number;
};

const INITIAL_MILESTONES: Milestone[] = [
  {
    id: "m1",
    name: "Khảo sát & Phân tích",
    progress: 100,
    status: "done",
    due: "30/04/2026",
    tasks: 18,
    completed: 18,
  },
  {
    id: "m2",
    name: "Thiết kế hệ thống",
    progress: 100,
    status: "done",
    due: "31/05/2026",
    tasks: 24,
    completed: 24,
  },
  {
    id: "m3",
    name: "Phát triển MVP",
    progress: 75,
    status: "active",
    due: "15/07/2026",
    tasks: 36,
    completed: 27,
  },
  {
    id: "m4",
    name: "Kiểm thử & UAT",
    progress: 20,
    status: "active",
    due: "31/08/2026",
    tasks: 22,
    completed: 4,
  },
  {
    id: "m5",
    name: "Triển khai & Go-live",
    progress: 0,
    status: "todo",
    due: "30/09/2026",
    tasks: 14,
    completed: 0,
  },
];

const TEAM = [
  { name: "Nguyễn Văn A", role: "Project Lead" },
  { name: "Trần Minh", role: "Tech Lead" },
  { name: "Lê Hoa", role: "PM" },
  { name: "Phạm Nam", role: "UI/UX" },
  { name: "Đỗ Linh", role: "QA Lead" },
];

type AuditAction = "create" | "update" | "delete";
type AuditTarget = "milestone" | "document";
type AuditEntry = {
  id: string;
  at: Date;
  actor: string;
  actorRole: Role;
  action: AuditAction;
  target: AuditTarget;
  name: string;
  detail?: string;
};

const ACTOR_NAME: Record<Role, string> = {
  owner: "Nguyễn Văn A",
  admin: "Trần Minh",
  member: "Lê Hoa",
  viewer: "Phạm Nam",
};

const INITIAL_AUDIT: AuditEntry[] = [
  {
    id: "a1",
    at: new Date(Date.now() - 1000 * 60 * 35),
    actor: "Trần Minh",
    actorRole: "admin",
    action: "update",
    target: "milestone",
    name: "Phát triển MVP",
    detail: "Tiến độ 60% → 75%",
  },
  {
    id: "a2",
    at: new Date(Date.now() - 1000 * 60 * 60 * 2),
    actor: "Lê Hoa",
    actorRole: "member",
    action: "create",
    target: "document",
    name: "Kế hoạch triển khai Q3.xlsx",
  },
  {
    id: "a3",
    at: new Date(Date.now() - 1000 * 60 * 60 * 24),
    actor: "Nguyễn Văn A",
    actorRole: "owner",
    action: "update",
    target: "milestone",
    name: "Kiểm thử & UAT",
    detail: "Đổi deadline → 31/08/2026",
  },
  {
    id: "a4",
    at: new Date(Date.now() - 1000 * 60 * 60 * 26),
    actor: "Đỗ Linh",
    actorRole: "member",
    action: "delete",
    target: "document",
    name: "Draft đặc tả v1.0.pdf",
  },
  {
    id: "a5",
    at: new Date(Date.now() - 1000 * 60 * 60 * 72),
    actor: "Trần Minh",
    actorRole: "admin",
    action: "create",
    target: "milestone",
    name: "Triển khai & Go-live",
  },
];

function relTime(d: Date) {
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const day = Math.round(h / 24);
  if (day < 30) return `${day} ngày trước`;
  return d.toLocaleDateString("vi-VN");
}

function fullTime(d: Date) {
  return d.toLocaleString("vi-VN", { hour12: false });
}

const ACTION_META: Record<AuditAction, { label: string; cls: string }> = {
  create: { label: "Tạo", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  update: { label: "Sửa", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  delete: { label: "Xoá", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
};

const docIcon = (type: string) => {
  switch (type) {
    case "pdf":
      return <FileText className="size-5 text-rose-500" />;
    case "xlsx":
      return <FileSpreadsheet className="size-5 text-emerald-500" />;
    case "ppt":
      return <Presentation className="size-5 text-orange-500" />;
    case "image":
      return <FileImage className="size-5 text-violet-500" />;
    default:
      return <FileText className="size-5 text-sky-500" />;
  }
};

function StosDetailPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  // Mock current user role — demo switcher in header
  const [currentRole, setCurrentRole] = useState<Role>("owner");
  const can = useMemo(
    () => ({
      editProject: currentRole === "owner" || currentRole === "admin",
      manageMilestones: currentRole === "owner" || currentRole === "admin",
      addDocs: currentRole !== "viewer",
      deleteDocs: currentRole === "owner" || currentRole === "admin",
      invite: currentRole === "owner" || currentRole === "admin",
    }),
    [currentRole],
  );

  const [project, setProject] = useState<Project>(INITIAL_PROJECT);
  const [docs, setDocs] = useState<Doc[]>(INITIAL_DOCUMENTS);
  const [milestones, setMilestones] = useState<Milestone[]>(INITIAL_MILESTONES);
  const [audit, setAudit] = useState<AuditEntry[]>(INITIAL_AUDIT);
  const [auditOpen, setAuditOpen] = useState(false);

  const logAudit = (
    action: AuditAction,
    target: AuditTarget,
    name: string,
    detail?: string,
  ) => {
    setAudit((prev) => [
      {
        id: `a${Date.now()}`,
        at: new Date(),
        actor: ACTOR_NAME[currentRole],
        actorRole: currentRole,
        action,
        target,
        name,
        detail,
      },
      ...prev,
    ]);
  };
  const canViewAudit = currentRole === "owner" || currentRole === "admin";

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [docDialog, setDocDialog] = useState<{ open: boolean; doc: Doc | null }>({
    open: false,
    doc: null,
  });
  const [milestoneDialog, setMilestoneDialog] = useState<{
    open: boolean;
    milestone: Milestone | null;
  }>({ open: false, milestone: null });

  const stats = useMemo(() => {
    const total = milestones.reduce((s, m) => s + m.tasks, 0);
    const done = milestones.reduce((s, m) => s + m.completed, 0);
    const active = milestones.filter((m) => m.status === "active").reduce(
      (s, m) => s + (m.tasks - m.completed),
      0,
    );
    const backlog = Math.max(total - done - active, 0);
    const progress = total ? Math.round((done / total) * 100) : 0;
    return { total, done, active, backlog, progress };
  }, [milestones]);

  const guard = (allowed: boolean, msg = "Bạn không có quyền thực hiện thao tác này") => {
    if (!allowed) {
      toast.error(msg);
      return false;
    }
    return true;
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppTopbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          {/* Banner */}
          <div className="relative min-h-48 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 overflow-hidden">
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-end pt-12 pb-6">
              <Link
                to="/workspace/$id"
                params={{ id: "stos" }}
                className="absolute top-4 left-4 sm:left-6 lg:left-8 inline-flex items-center gap-1.5 text-white/90 hover:text-white text-sm"
              >
                <ArrowLeft className="size-4" /> Quay lại tổng quan
              </Link>
              <div className="absolute top-4 right-4 sm:right-6 lg:right-8 flex items-center gap-1.5 text-[11px]">
                <ShieldCheck className="size-3.5 text-white/80" />
                <span className="text-white/80">Vai trò demo:</span>
                <select
                  value={currentRole}
                  onChange={(e) => setCurrentRole(e.target.value as Role)}
                  className="bg-white/15 backdrop-blur text-white rounded px-1.5 py-0.5 border border-white/20 text-[11px] focus:outline-none"
                >
                  <option className="text-slate-900" value="owner">Owner</option>
                  <option className="text-slate-900" value="admin">Admin</option>
                  <option className="text-slate-900" value="member">Member</option>
                  <option className="text-slate-900" value="viewer">Viewer</option>
                </select>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 w-full">
                <div className="size-16 sm:size-20 shrink-0 rounded-2xl bg-white shadow-xl flex items-center justify-center text-2xl sm:text-3xl font-bold text-emerald-600 ring-4 ring-white/40">
                  S
                </div>
                <div className="flex-1 min-w-0 text-white">
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider opacity-90 mb-1">
                    <span>{project.code}</span>
                    <span className="hidden sm:inline">•</span>
                    <span>{project.tagline}</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold">{project.name}</h1>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm opacity-95">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-300" /> Đang hoạt động
                    </span>
                    <span className="hidden sm:inline">·</span>
                    <span>{project.members} thành viên</span>
                    <span className="hidden sm:inline">·</span>
                    <span>Deadline {project.deadline}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPinned(!pinned)}
                    className="bg-white/20 backdrop-blur text-white hover:bg-white/30 border-0"
                  >
                    <Pin className={`size-4 ${pinned ? "fill-current" : ""}`} />{" "}
                    {pinned ? "Đã ghim" : "Ghim"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-white/20 backdrop-blur text-white hover:bg-white/30 border-0"
                  >
                    <Share2 className="size-4" /> Chia sẻ
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => guard(can.invite) && setInviteOpen(true)}
                    className="bg-white text-emerald-700 hover:bg-white/90"
                  >
                    <UserPlus className="size-4" /> Mời thành viên
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: 2/3 */}
            <div className="lg:col-span-2 space-y-6 min-w-0">
              {/* About */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <FolderKanban className="size-4 text-slate-500" /> Giới thiệu dự án
                  </h2>
                  <button
                    onClick={() => guard(can.editProject) && setEditProjectOpen(true)}
                    className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
                  >
                    {can.editProject ? <Pencil className="size-3" /> : <Lock className="size-3" />}
                    Chỉnh sửa
                  </button>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{project.description}</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {project.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100">
                  <Info label="Chủ sở hữu" value={project.owner} />
                  <Info label="Bắt đầu" value={project.startDate} />
                  <Info label="Hạn chót" value={project.deadline} />
                  <Info label="Ngân sách" value={project.budget} />
                </div>
              </section>

              {/* Milestones */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="size-4 text-slate-500" /> Tiến độ theo milestone
                  </h2>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-slate-500">
                      Tổng tiến độ:{" "}
                      <span className="font-semibold text-emerald-600">{stats.progress}%</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        guard(can.manageMilestones) &&
                        setMilestoneDialog({ open: true, milestone: null })
                      }
                    >
                      <Plus className="size-4" /> Milestone
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {milestones.length === 0 && (
                    <div className="text-center py-8 text-sm text-slate-500">
                      Chưa có milestone nào.
                    </div>
                  )}
                  {milestones.map((m, i) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-lg hover:bg-slate-50 group"
                    >
                      <div
                        className={`size-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                          m.status === "done"
                            ? "bg-emerald-100 text-emerald-700"
                            : m.status === "active"
                              ? "bg-sky-100 text-sky-700"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {m.status === "done" ? (
                          <CheckCircle2 className="size-4" />
                        ) : m.status === "active" ? (
                          <Clock className="size-4" />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-x-2 mb-1.5">
                          <div className="font-medium text-sm text-slate-900 truncate">
                            {m.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {m.completed}/{m.tasks} · {m.due}
                          </div>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              m.status === "done"
                                ? "bg-emerald-500"
                                : m.status === "active"
                                  ? "bg-sky-500"
                                  : "bg-slate-300"
                            }`}
                            style={{ width: `${m.progress}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-10 shrink-0 text-right text-xs font-semibold text-slate-700">
                        {m.progress}%
                      </div>
                      {can.manageMilestones && (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                          <button
                            onClick={() => setMilestoneDialog({ open: true, milestone: m })}
                            className="size-7 inline-flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-600"
                            title="Sửa"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              logAudit("delete", "milestone", m.name);
                              setMilestones((prev) => prev.filter((x) => x.id !== m.id));
                              toast.success("Đã xoá milestone");
                            }}
                            className="size-7 inline-flex items-center justify-center rounded-md hover:bg-rose-50 text-rose-600"
                            title="Xoá"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Documents */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <FileText className="size-4 text-slate-500" /> Tài liệu ({docs.length})
                  </h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      guard(can.addDocs, "Viewer không thể thêm tài liệu") &&
                      setDocDialog({ open: true, doc: null })
                    }
                  >
                    <Plus className="size-4" /> Thêm tài liệu
                  </Button>
                </div>
                <div className="divide-y divide-slate-100">
                  {docs.length === 0 && (
                    <div className="text-center py-8 text-sm text-slate-500">
                      Chưa có tài liệu nào.
                    </div>
                  )}
                  {docs.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-3 py-3 hover:bg-slate-50 -mx-2 px-2 rounded-md group"
                    >
                      <div className="size-9 shrink-0 rounded-md bg-slate-50 flex items-center justify-center">
                        {docIcon(d.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{d.name}</div>
                        <div className="text-xs text-slate-500 truncate">
                          {d.size} · {d.updatedBy} · {d.updatedAt}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                        <button
                          onClick={() => toast.success(`Đang tải xuống ${d.name}`)}
                          className="size-8 inline-flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-600"
                          title="Tải xuống"
                        >
                          <Download className="size-4" />
                        </button>
                        {can.addDocs && (
                          <button
                            onClick={() => setDocDialog({ open: true, doc: d })}
                            className="size-8 inline-flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-600"
                            title="Đổi tên"
                          >
                            <Pencil className="size-4" />
                          </button>
                        )}
                        {can.deleteDocs ? (
                          <button
                            onClick={() => {
                              logAudit("delete", "document", d.name);
                              setDocs((prev) => prev.filter((x) => x.id !== d.id));
                              toast.success("Đã xoá tài liệu");
                            }}
                            className="size-8 inline-flex items-center justify-center rounded-md hover:bg-rose-50 text-rose-600"
                            title="Xoá"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : (
                          <button className="size-8 inline-flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-600">
                            <MoreHorizontal className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {docs.length > 5 && (
                  <button className="w-full mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center justify-center gap-1">
                    Xem tất cả tài liệu <ChevronRight className="size-4" />
                  </button>
                )}
              </section>
            </div>

            {/* Right: 1/3 */}
            <div className="space-y-6 min-w-0">
              {/* Progress card */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Tiến độ tổng thể</h3>
                <div className="flex items-end gap-2 mb-2">
                  <div className="text-4xl font-bold text-slate-900">{stats.progress}%</div>
                  <div className="text-xs text-emerald-600 mb-1.5 flex items-center gap-0.5">
                    <TrendingUp className="size-3" /> +12% tuần này
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                    style={{ width: `${stats.progress}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Stat label="Hoàn thành" value={String(stats.done)} tone="emerald" />
                  <Stat label="Đang làm" value={String(stats.active)} tone="sky" />
                  <Stat label="Tồn đọng" value={String(stats.backlog)} tone="slate" />
                </div>
              </section>

              {/* Team */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Thành viên ({project.members})
                  </h3>
                  <button
                    onClick={() => guard(can.invite) && setInviteOpen(true)}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Mời
                  </button>
                </div>
                <div className="space-y-2.5">
                  {TEAM.map((m) => (
                    <div key={m.name} className="flex items-center gap-3">
                      <div
                        className={`size-8 shrink-0 rounded-full ${avatar(m.name)} flex items-center justify-center text-xs font-semibold text-white`}
                      >
                        {m.name.split(" ").pop()?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{m.name}</div>
                        <div className="text-xs text-slate-500">{m.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="w-full mt-3 text-xs text-slate-500 hover:text-slate-700 inline-flex items-center justify-center gap-1">
                  <Users className="size-3.5" /> Xem tất cả thành viên
                </button>
              </section>

              {/* AI insight */}
              <section className="bg-gradient-to-br from-violet-50 to-pink-50 rounded-xl border border-violet-200/60 p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="size-4 text-violet-600" />
                  <h3 className="text-sm font-semibold text-violet-900">AI Insight</h3>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  Dự án đang vượt 4% so với kế hoạch. Cần chú ý milestone <b>Kiểm thử & UAT</b> —
                  mới đạt 20% nhưng deadline còn 6 tuần.
                </p>
                <button className="mt-3 text-xs font-medium text-violet-700 hover:text-violet-900 inline-flex items-center gap-1">
                  Xem khuyến nghị <ChevronRight className="size-3.5" />
                </button>
              </section>

              {/* Audit log — admin/owner only */}
              {canViewAudit && (
                <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <History className="size-4 text-slate-500" /> Lịch sử thay đổi
                    </h3>
                    <button
                      onClick={() => setAuditOpen(true)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      Xem tất cả
                    </button>
                  </div>
                  {audit.length === 0 ? (
                    <div className="text-xs text-slate-500 py-4 text-center">
                      Chưa có hoạt động nào.
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {audit.slice(0, 5).map((e) => (
                        <AuditItem key={e.id} entry={e} compact />
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-[11px] text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="size-3" /> Chỉ Owner/Admin xem được nhật ký này
                  </p>
                </section>
              )}
            </div>
          </div>
        </main>
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <EditProjectDialog
        open={editProjectOpen}
        onOpenChange={setEditProjectOpen}
        project={project}
        onSave={(p) => {
          setProject(p);
          toast.success("Đã cập nhật dự án");
        }}
      />
      <DocDialog
        state={docDialog}
        onOpenChange={(o) => setDocDialog((s) => ({ ...s, open: o }))}
        onSave={(d) => {
          const wasEdit = !!docDialog.doc;
          const prevName = docDialog.doc?.name;
          setDocs((prev) => {
            const exists = prev.find((x) => x.id === d.id);
            return exists ? prev.map((x) => (x.id === d.id ? d : x)) : [d, ...prev];
          });
          if (wasEdit) {
            logAudit(
              "update",
              "document",
              d.name,
              prevName && prevName !== d.name ? `Đổi tên từ "${prevName}"` : undefined,
            );
          } else {
            logAudit("create", "document", d.name);
          }
          toast.success(docDialog.doc ? "Đã đổi tên" : "Đã thêm tài liệu");
        }}
      />
      <MilestoneDialog
        state={milestoneDialog}
        onOpenChange={(o) => setMilestoneDialog((s) => ({ ...s, open: o }))}
        onSave={(m) => {
          const wasEdit = !!milestoneDialog.milestone;
          const prevM = milestoneDialog.milestone;
          setMilestones((prev) => {
            const exists = prev.find((x) => x.id === m.id);
            return exists ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m];
          });
          if (wasEdit && prevM) {
            const parts: string[] = [];
            if (prevM.progress !== m.progress)
              parts.push(`Tiến độ ${prevM.progress}% → ${m.progress}%`);
            if (prevM.due !== m.due) parts.push(`Deadline → ${m.due}`);
            if (prevM.tasks !== m.tasks) parts.push(`Tasks ${prevM.tasks} → ${m.tasks}`);
            logAudit("update", "milestone", m.name, parts.join(" · ") || undefined);
          } else {
            logAudit("create", "milestone", m.name);
          }
          toast.success(milestoneDialog.milestone ? "Đã cập nhật milestone" : "Đã thêm milestone");
        }}
      />
      <AuditDialog open={auditOpen} onOpenChange={setAuditOpen} entries={audit} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className="text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "sky" | "slate";
}) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    slate: "bg-slate-50 text-slate-700",
  };
  return (
    <div className={`rounded-lg py-2 ${colors[tone]}`}>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<"member" | "viewer" | "admin">("member");
  const link = "https://uniwork.app/invite/stos-x7f2a";

  const submit = () => {
    if (!emails.trim()) {
      toast.error("Nhập ít nhất một email");
      return;
    }
    toast.success("Đã gửi lời mời");
    setEmails("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-emerald-600" /> Mời thành viên vào STOS Project
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">
              Email (cách nhau bằng dấu phẩy)
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 size-4 text-slate-400" />
              <Input
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="vd: nam@uniwork.vn, linh@uniwork.vn"
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">Vai trò</label>
            <div className="grid grid-cols-3 gap-2">
              {(["viewer", "member", "admin"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`text-xs py-2 rounded-md border capitalize transition ${
                    role === r
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {r === "viewer" ? "Xem" : r === "member" ? "Thành viên" : "Quản trị"}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100">
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">
              Hoặc chia sẻ liên kết mời
            </label>
            <div className="flex gap-2">
              <Input value={link} readOnly className="text-xs bg-slate-50" />
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
            <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
              <AlertCircle className="size-3" /> Liên kết hết hạn sau 7 ngày
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit} className="bg-emerald-600 hover:bg-emerald-700">
            <Star className="size-4" /> Gửi lời mời
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project;
  onSave: (p: Project) => void;
}) {
  const [form, setForm] = useState<Project>(project);
  const [tagsRaw, setTagsRaw] = useState(project.tags.join(", "));

  // sync when opening for a different project
  const reset = () => {
    setForm(project);
    setTagsRaw(project.tags.join(", "));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5 text-emerald-600" /> Chỉnh sửa dự án
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Tên dự án">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Tagline">
            <Input
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            />
          </Field>
          <Field label="Mô tả">
            <Textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bắt đầu">
              <Input
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </Field>
            <Field label="Deadline">
              <Input
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </Field>
            <Field label="Ngân sách">
              <Input
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              />
            </Field>
            <Field label="Tình trạng">
              <Input
                value={form.health}
                onChange={(e) => setForm({ ...form, health: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Thẻ (cách nhau bằng dấu phẩy)">
            <Input value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => {
              if (!form.name.trim()) {
                toast.error("Tên dự án không được để trống");
                return;
              }
              onSave({
                ...form,
                tags: tagsRaw
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              });
              onOpenChange(false);
            }}
          >
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocDialog({
  state,
  onOpenChange,
  onSave,
}: {
  state: { open: boolean; doc: Doc | null };
  onOpenChange: (v: boolean) => void;
  onSave: (d: Doc) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Doc["type"]>("doc");

  return (
    <Dialog
      open={state.open}
      onOpenChange={(o) => {
        if (o) {
          setName(state.doc?.name ?? "");
          setType(state.doc?.type ?? "doc");
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-emerald-600" />
            {state.doc ? "Đổi tên tài liệu" : "Thêm tài liệu"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Tên tài liệu">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {!state.doc && (
            <Field label="Loại">
              <div className="grid grid-cols-5 gap-2">
                {(["doc", "pdf", "xlsx", "ppt", "image"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`text-xs py-2 rounded-md border uppercase ${
                      type === t
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => {
              if (!name.trim()) {
                toast.error("Nhập tên tài liệu");
                return;
              }
              onSave({
                id: state.doc?.id ?? `d-${Date.now()}`,
                name: name.trim(),
                type: state.doc?.type ?? type,
                size: state.doc?.size ?? "—",
                updatedBy: "Bạn",
                updatedAt: "vừa xong",
              });
              onOpenChange(false);
            }}
          >
            {state.doc ? "Lưu" : "Thêm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneDialog({
  state,
  onOpenChange,
  onSave,
}: {
  state: { open: boolean; milestone: Milestone | null };
  onOpenChange: (v: boolean) => void;
  onSave: (m: Milestone) => void;
}) {
  const [name, setName] = useState("");
  const [due, setDue] = useState("");
  const [tasks, setTasks] = useState(0);
  const [completed, setCompleted] = useState(0);

  return (
    <Dialog
      open={state.open}
      onOpenChange={(o) => {
        if (o) {
          setName(state.milestone?.name ?? "");
          setDue(state.milestone?.due ?? "");
          setTasks(state.milestone?.tasks ?? 0);
          setCompleted(state.milestone?.completed ?? 0);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="size-5 text-emerald-600" />
            {state.milestone ? "Chỉnh sửa milestone" : "Thêm milestone"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Tên milestone">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Deadline (vd: 30/09/2026)">
            <Input value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tổng tasks">
              <Input
                type="number"
                min={0}
                value={tasks}
                onChange={(e) => setTasks(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            <Field label="Đã hoàn thành">
              <Input
                type="number"
                min={0}
                value={completed}
                onChange={(e) => setCompleted(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => {
              if (!name.trim()) {
                toast.error("Nhập tên milestone");
                return;
              }
              const done = Math.min(completed, tasks);
              const progress = tasks ? Math.round((done / tasks) * 100) : 0;
              const status: Milestone["status"] =
                progress >= 100 ? "done" : progress > 0 ? "active" : "todo";
              onSave({
                id: state.milestone?.id ?? `m-${Date.now()}`,
                name: name.trim(),
                due: due.trim() || "—",
                tasks,
                completed: done,
                progress,
                status,
              });
              onOpenChange(false);
            }}
          >
            {state.milestone ? "Lưu" : "Thêm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-700 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function AuditItem({ entry, compact }: { entry: AuditEntry; compact?: boolean }) {
  const meta = ACTION_META[entry.action];
  return (
    <li className="flex items-start gap-3">
      <div
        className={`size-7 shrink-0 rounded-full ${avatar(entry.actor)} flex items-center justify-center text-[10px] font-semibold text-white`}
      >
        {entry.actor.split(" ").pop()?.[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          <span className="font-medium text-slate-900 truncate">{entry.actor}</span>
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ring-1 ${meta.cls}`}
          >
            {meta.label}
          </span>
          <span className="text-slate-500 text-xs">
            {entry.target === "milestone" ? "milestone" : "tài liệu"}
          </span>
        </div>
        <div className="text-sm text-slate-700 truncate">{entry.name}</div>
        {entry.detail && !compact && (
          <div className="text-xs text-slate-500 mt-0.5">{entry.detail}</div>
        )}
        <div className="text-[11px] text-slate-400 mt-0.5" title={fullTime(entry.at)}>
          {relTime(entry.at)}
          {compact && entry.detail ? ` · ${entry.detail}` : ""}
        </div>
      </div>
    </li>
  );
}

function AuditDialog({
  open,
  onOpenChange,
  entries,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entries: AuditEntry[];
}) {
  const [filter, setFilter] = useState<"all" | AuditTarget>("all");
  const [actor, setActor] = useState<string>("all");
  const [keyword, setKeyword] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortOrder, setSortOrder] = useState<
    "newest" | "oldest" | "actor" | "action"
  >("newest");
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);

  const actors = useMemo(
    () => Array.from(new Set(entries.map((e) => e.actor))).sort(),
    [entries],
  );

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const fromTs = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const toTs = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    const filtered = entries.filter((e) => {
      if (filter !== "all" && e.target !== filter) return false;
      if (actor !== "all" && e.actor !== actor) return false;
      if (kw && !e.name.toLowerCase().includes(kw)) return false;
      const ts = new Date(e.at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const tDiff = new Date(b.at).getTime() - new Date(a.at).getTime();
      if (sortOrder === "newest") return tDiff;
      if (sortOrder === "oldest") return -tDiff;
      if (sortOrder === "actor") {
        const c = a.actor.localeCompare(b.actor, "vi");
        return c !== 0 ? c : tDiff;
      }
      // action: group by target then action, fallback newest
      const t = a.target.localeCompare(b.target);
      if (t !== 0) return t;
      const ac = a.action.localeCompare(b.action);
      return ac !== 0 ? ac : tDiff;
    });
  }, [entries, filter, actor, keyword, fromDate, toDate, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = list.slice(pageStart, pageStart + pageSize);

  // Reset page về 1 khi bộ lọc/sắp xếp/kích thước trang thay đổi
  useEffect(() => {
    setPage(1);
  }, [filter, actor, keyword, fromDate, toDate, sortOrder, pageSize]);

  const hasFilter =
    filter !== "all" || actor !== "all" || keyword !== "" || fromDate !== "" || toDate !== "";
  const resetFilters = () => {
    setFilter("all");
    setActor("all");
    setKeyword("");
    setFromDate("");
    setToDate("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-emerald-600" /> Lịch sử thay đổi
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 mb-2">
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
              Loại
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["all", "milestone", "document"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-md border transition ${
                    filter === f
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {f === "all" ? "Tất cả" : f === "milestone" ? "Milestone" : "Tài liệu"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
              Người cập nhật
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setActor("all")}
                className={`text-xs px-2.5 py-1 rounded-md border transition ${
                  actor === "all"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Tất cả
              </button>
              {actors.map((a) => (
                <button
                  key={a}
                  onClick={() => setActor(a)}
                  className={`text-xs px-2.5 py-1 rounded-md border transition ${
                    actor === a
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-1">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                Từ khoá
              </div>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tên milestone / tài liệu"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                Từ ngày
              </div>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                Đến ngày
              </div>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{list.length} mục</span>
              <span className="text-slate-300">·</span>
              <label className="text-xs text-slate-500">Sắp xếp:</label>
              <select
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value as "newest" | "oldest" | "actor" | "action")
                }
                className="text-xs border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="newest">Mới nhất trước</option>
                <option value="oldest">Cũ nhất trước</option>
                <option value="actor">Theo người cập nhật</option>
                <option value="action">Theo loại thay đổi</option>
              </select>
            </div>
            {hasFilter && (
              <button
                onClick={resetFilters}
                className="text-xs text-emerald-700 hover:underline font-medium"
              >
                Xoá bộ lọc
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <div className="sticky top-0 z-10 bg-white pb-2 -mt-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tìm nhanh theo tên milestone / tài liệu…"
                className="h-8 text-sm pl-8 pr-8"
              />
              {keyword && (
                <button
                  onClick={() => setKeyword("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Xoá tìm kiếm"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
          {list.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">Không có hoạt động.</div>
          ) : (
            <ul className="space-y-3">
              {pageItems.map((e) => (
                <AuditItem key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </div>
        {list.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Mỗi trang:</label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="text-xs border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {[5, 10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-400">
                {pageStart + 1}–{Math.min(pageStart + pageSize, list.length)} / {list.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                «
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹
              </button>
              <span className="text-xs text-slate-600 px-2">
                Trang {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ›
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages}
                className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                »
              </button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
