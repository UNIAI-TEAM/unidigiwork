import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Users, Calendar, FileText, Plus, Star, Sparkles, ChevronRight,
  Download, Share2, MoreHorizontal, CheckCircle2, Clock, AlertCircle,
  UserPlus, Mail, Copy, FolderKanban, TrendingUp, Pin, FileSpreadsheet,
  FileImage, Presentation, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/workspace/$id/stos")({
  component: StosDetailPage,
});

const PROJECT = {
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

const DOCUMENTS = [
  { id: "1", name: "Bản đặc tả kỹ thuật STOS v2.1.pdf", type: "pdf", size: "4.2 MB", updatedBy: "Trần Minh", updatedAt: "2 giờ trước" },
  { id: "2", name: "Kế hoạch triển khai Q3.xlsx", type: "xlsx", size: "1.8 MB", updatedBy: "Lê Hoa", updatedAt: "Hôm qua" },
  { id: "3", name: "Mockup UI Dashboard.fig", type: "image", size: "12.5 MB", updatedBy: "Phạm Nam", updatedAt: "2 ngày trước" },
  { id: "4", name: "Slide họp Steering Committee.pptx", type: "ppt", size: "8.1 MB", updatedBy: "Nguyễn Văn A", updatedAt: "3 ngày trước" },
  { id: "5", name: "Báo cáo tiến độ tháng 5.docx", type: "doc", size: "2.4 MB", updatedBy: "Đỗ Linh", updatedAt: "1 tuần trước" },
];

const MILESTONES = [
  { id: "m1", name: "Khảo sát & Phân tích", progress: 100, status: "done", due: "30/04/2026", tasks: 18, completed: 18 },
  { id: "m2", name: "Thiết kế hệ thống", progress: 100, status: "done", due: "31/05/2026", tasks: 24, completed: 24 },
  { id: "m3", name: "Phát triển MVP", progress: 75, status: "active", due: "15/07/2026", tasks: 36, completed: 27 },
  { id: "m4", name: "Kiểm thử & UAT", progress: 20, status: "active", due: "31/08/2026", tasks: 22, completed: 4 },
  { id: "m5", name: "Triển khai & Go-live", progress: 0, status: "todo", due: "30/09/2026", tasks: 14, completed: 0 },
];

const TEAM = [
  { name: "Nguyễn Văn A", role: "Project Lead" },
  { name: "Trần Minh", role: "Tech Lead" },
  { name: "Lê Hoa", role: "PM" },
  { name: "Phạm Nam", role: "UI/UX" },
  { name: "Đỗ Linh", role: "QA Lead" },
];

const docIcon = (type: string) => {
  switch (type) {
    case "pdf": return <FileText className="size-5 text-rose-500" />;
    case "xlsx": return <FileSpreadsheet className="size-5 text-emerald-500" />;
    case "ppt": return <Presentation className="size-5 text-orange-500" />;
    case "image": return <FileImage className="size-5 text-violet-500" />;
    default: return <FileText className="size-5 text-sky-500" />;
  }
};

function StosDetailPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppTopbar onToggleSidebar={() => setCollapsed(!collapsed)} />
        <main className="flex-1 overflow-y-auto">
          {/* Banner */}
          <div className="relative h-48 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 overflow-hidden">
            <div className="absolute inset-0 opacity-20"
              style={{ backgroundImage: "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            <div className="relative h-full max-w-7xl mx-auto px-8 flex items-end pb-6">
              <Link to="/workspace/$id" params={{ id: "stos" }} className="absolute top-4 left-8 inline-flex items-center gap-1.5 text-white/90 hover:text-white text-sm">
                <ArrowLeft className="size-4" /> Quay lại tổng quan
              </Link>
              <div className="flex items-end gap-4 w-full">
                <div className="size-20 rounded-2xl bg-white shadow-xl flex items-center justify-center text-3xl font-bold text-emerald-600 ring-4 ring-white/40">
                  S
                </div>
                <div className="flex-1 text-white">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-90 mb-1">
                    <span>{PROJECT.code}</span>
                    <span>•</span>
                    <span>{PROJECT.tagline}</span>
                  </div>
                  <h1 className="text-3xl font-bold">{PROJECT.name}</h1>
                  <div className="flex items-center gap-3 mt-2 text-sm opacity-95">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-300" /> Đang hoạt động
                    </span>
                    <span>·</span>
                    <span>{PROJECT.members} thành viên</span>
                    <span>·</span>
                    <span>Deadline {PROJECT.deadline}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPinned(!pinned)} className="bg-white/20 backdrop-blur text-white hover:bg-white/30 border-0">
                    <Pin className={`size-4 ${pinned ? "fill-current" : ""}`} /> {pinned ? "Đã ghim" : "Ghim"}
                  </Button>
                  <Button variant="secondary" size="sm" className="bg-white/20 backdrop-blur text-white hover:bg-white/30 border-0">
                    <Share2 className="size-4" /> Chia sẻ
                  </Button>
                  <Button size="sm" onClick={() => setInviteOpen(true)} className="bg-white text-emerald-700 hover:bg-white/90">
                    <UserPlus className="size-4" /> Mời thành viên
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-8 py-6 grid grid-cols-3 gap-6">
            {/* Left: 2/3 */}
            <div className="col-span-2 space-y-6">
              {/* About */}
              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <FolderKanban className="size-4 text-slate-500" /> Giới thiệu dự án
                  </h2>
                  <button className="text-xs text-slate-500 hover:text-slate-700">Chỉnh sửa</button>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{PROJECT.description}</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {PROJECT.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200">{t}</Badge>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100">
                  <Info label="Chủ sở hữu" value={PROJECT.owner} />
                  <Info label="Bắt đầu" value={PROJECT.startDate} />
                  <Info label="Hạn chót" value={PROJECT.deadline} />
                  <Info label="Ngân sách" value={PROJECT.budget} />
                </div>
              </section>

              {/* Milestones */}
              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="size-4 text-slate-500" /> Tiến độ theo milestone
                  </h2>
                  <div className="text-sm text-slate-500">
                    Tổng tiến độ: <span className="font-semibold text-emerald-600">{PROJECT.progress}%</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {MILESTONES.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50">
                      <div className={`size-9 rounded-full flex items-center justify-center text-xs font-bold ${
                        m.status === "done" ? "bg-emerald-100 text-emerald-700" :
                        m.status === "active" ? "bg-sky-100 text-sky-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {m.status === "done" ? <CheckCircle2 className="size-4" /> :
                         m.status === "active" ? <Clock className="size-4" /> :
                         i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="font-medium text-sm text-slate-900 truncate">{m.name}</div>
                          <div className="text-xs text-slate-500 ml-2">{m.completed}/{m.tasks} tasks · {m.due}</div>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              m.status === "done" ? "bg-emerald-500" :
                              m.status === "active" ? "bg-sky-500" : "bg-slate-300"
                            }`}
                            style={{ width: `${m.progress}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-10 text-right text-xs font-semibold text-slate-700">{m.progress}%</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Documents */}
              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <FileText className="size-4 text-slate-500" /> Tài liệu ({DOCUMENTS.length})
                  </h2>
                  <Button size="sm" variant="outline">
                    <Plus className="size-4" /> Thêm tài liệu
                  </Button>
                </div>
                <div className="divide-y divide-slate-100">
                  {DOCUMENTS.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 py-3 hover:bg-slate-50 -mx-2 px-2 rounded-md group">
                      <div className="size-9 rounded-md bg-slate-50 flex items-center justify-center">
                        {docIcon(d.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{d.name}</div>
                        <div className="text-xs text-slate-500">{d.size} · {d.updatedBy} · {d.updatedAt}</div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button className="size-8 inline-flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-600">
                          <Download className="size-4" />
                        </button>
                        <button className="size-8 inline-flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-600">
                          <MoreHorizontal className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="w-full mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center justify-center gap-1">
                  Xem tất cả tài liệu <ChevronRight className="size-4" />
                </button>
              </section>
            </div>

            {/* Right: 1/3 */}
            <div className="space-y-6">
              {/* Progress card */}
              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Tiến độ tổng thể</h3>
                <div className="flex items-end gap-2 mb-2">
                  <div className="text-4xl font-bold text-slate-900">{PROJECT.progress}%</div>
                  <div className="text-xs text-emerald-600 mb-1.5 flex items-center gap-0.5">
                    <TrendingUp className="size-3" /> +12% tuần này
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ width: `${PROJECT.progress}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Stat label="Hoàn thành" value="49" tone="emerald" />
                  <Stat label="Đang làm" value="31" tone="sky" />
                  <Stat label="Tồn đọng" value="34" tone="slate" />
                </div>
              </section>

              {/* Team */}
              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">Thành viên ({PROJECT.members})</h3>
                  <button onClick={() => setInviteOpen(true)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Mời</button>
                </div>
                <div className="space-y-2.5">
                  {TEAM.map((m) => (
                    <div key={m.name} className="flex items-center gap-3">
                      <div className={`size-8 rounded-full ${avatar(m.name)} flex items-center justify-center text-xs font-semibold text-white`}>
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
              <section className="bg-gradient-to-br from-violet-50 to-pink-50 rounded-xl border border-violet-200/60 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="size-4 text-violet-600" />
                  <h3 className="text-sm font-semibold text-violet-900">AI Insight</h3>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  Dự án đang vượt 4% so với kế hoạch. Cần chú ý milestone <b>Kiểm thử & UAT</b> — mới đạt 20% nhưng deadline còn 6 tuần.
                </p>
                <button className="mt-3 text-xs font-medium text-violet-700 hover:text-violet-900 inline-flex items-center gap-1">
                  Xem khuyến nghị <ChevronRight className="size-3.5" />
                </button>
              </section>
            </div>
          </div>
        </main>
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
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

function Stat({ label, value, tone }: { label: string; value: string; tone: "emerald" | "sky" | "slate" }) {
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

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<"member" | "viewer" | "admin">("member");
  const link = "https://uniwork.app/invite/stos-x7f2a";

  const submit = () => {
    if (!emails.trim()) { toast.error("Nhập ít nhất một email"); return; }
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
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">Email (cách nhau bằng dấu phẩy)</label>
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
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">Hoặc chia sẻ liên kết mời</label>
            <div className="flex gap-2">
              <Input value={link} readOnly className="text-xs bg-slate-50" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigator.clipboard?.writeText(link); toast.success("Đã sao chép liên kết"); }}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={submit} className="bg-emerald-600 hover:bg-emerald-700">
            <Star className="size-4" /> Gửi lời mời
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}