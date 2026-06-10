import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard, MessageSquare, Video, ListChecks, FileText, BookOpen,
  Workflow, Users, BarChart3, Bot, Plus, Search, Bell, Settings, Calendar,
  ShieldCheck, ChevronDown, MoreHorizontal, MessageCircle, Circle, Cloud,
  Menu, X, HelpCircle, Sparkles, UserCircle2, KeyRound, LogOut, Mail, Phone, Moon,
  PanelLeft, PanelLeftClose, ArrowUp, Wand2, Languages, FileSearch, Lightbulb,
} from "lucide-react";
import { ThemeToggle } from "@/lib/theme";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const avatar = (seed: string) =>
  `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear`;

type NavKey = "dashboard" | "chat" | "meetings" | "tasks" | "documents" | "knowledge" | "workflows" | "people" | "email" | "reports" | "ai";

function NavItem({ icon: Icon, label, active, chevron, to, badge, collapsed }: { icon: any; label: string; active?: boolean; chevron?: boolean; to?: string; badge?: ReactNode; collapsed?: boolean }) {
  const cls = cn(
    "flex items-center rounded-lg transition-colors",
    collapsed ? "w-full justify-center px-2 py-2.5" : "w-full gap-3 px-3 py-2 text-sm",
    active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
  );
  const inner = collapsed ? (
    <Icon className="h-[18px] w-[18px]" />
  ) : (
    <>
      <Icon className="h-[18px] w-[18px]" />
      <span className="flex-1 text-left">{label}</span>
      {badge}
      {chevron && <ChevronDown className="h-4 w-4 opacity-60" />}
    </>
  );
  const el = to ? (
    <Link to={to} className={cls} title={collapsed ? label : undefined}>{inner}</Link>
  ) : (
    <button className={cls} title={collapsed ? label : undefined}>{inner}</button>
  );
  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{el}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }
  return el;
}

function WorkspaceItem({ letter, name, color, active, collapsed, slug }: { letter: string; name: string; color: string; active?: boolean; collapsed?: boolean; slug?: string }) {
  const cls = cn(
    "flex w-full items-center rounded-lg transition-colors",
    collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-1.5 text-sm",
    active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
  );
  const inner = (
    <>
      <span className={cn("flex items-center justify-center rounded text-[11px] font-semibold text-white", collapsed ? "h-7 w-7 text-[10px]" : "h-5 w-5", color)}>
        {letter}
      </span>
      {!collapsed && <span>{name}</span>}
    </>
  );
  const btn = slug ? (
    <Link to="/workspace/$id" params={{ id: slug }} className={cls} title={collapsed ? name : undefined}>{inner}</Link>
  ) : (
    <button className={cls} title={collapsed ? name : undefined}>{inner}</button>
  );
  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">{name}</TooltipContent>
      </Tooltip>
    );
  }
  return btn;
}

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebarCollapsed") === "true";
    }
    return false;
  });

  useEffect(() => {
    const handler = (e: Event) => setCollapsed((e as CustomEvent<boolean>).detail);
    window.addEventListener("uniwork:sidebar-toggle", handler);
    return () => window.removeEventListener("uniwork:sidebar-toggle", handler);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("sidebarCollapsed", String(next));
      }
      window.dispatchEvent(new CustomEvent("uniwork:sidebar-toggle", { detail: next }));
      return next;
    });
  }, []);

  return { collapsed, toggleCollapsed };
}

export function AppSidebar({ active, open, onClose }: { active: NavKey; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();
  const [wsOpen, setWsOpen] = useState(false);

  const desktopWidth = collapsed ? "lg:w-14 xl:w-14" : "lg:w-56 xl:w-64";

  return (
    <TooltipProvider>
      {open && (
        <button aria-label="Close sidebar" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-border bg-surface transition-all duration-200 lg:static lg:translate-x-0",
          desktopWidth,
          open ? "translate-x-0 w-64" : "-translate-x-full w-64",
          collapsed && "lg:items-center lg:px-2 lg:py-4"
        )}
      >
        {/* Header */}
        <div className={cn("flex items-center gap-2 py-5", collapsed ? "px-2 lg:justify-center" : "px-5")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">U</div>
          {!collapsed && (
            <div className="flex-1 leading-tight">
              <div className="text-base font-bold tracking-wide">UNIWORK</div>
              <div className="text-[10px] text-muted-foreground">Digital Workplace Platform</div>
            </div>
          )}
          <button aria-label="Close sidebar" className="rounded p-1 text-muted-foreground hover:bg-surface-2 lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1 space-y-1 overflow-y-auto", collapsed ? "px-1" : "px-3")}>
          <NavItem icon={LayoutDashboard} label={t("nav.dashboard")} to="/dashboard" active={active === "dashboard"} collapsed={collapsed} />
          <NavItem icon={MessageSquare} label={t("nav.chat")} to="/chat" active={active === "chat"} collapsed={collapsed} />
          <NavItem
            icon={Video}
            label={t("nav.meetings")}
            to="/meeting"
            active={active === "meetings"}
            badge={!collapsed ? <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-medium text-success">{t("nav.live")}</span> : undefined}
            collapsed={collapsed}
          />
          <NavItem
            icon={ListChecks}
            label={t("nav.tasks")}
            to="/tasks"
            active={active === "tasks"}
            badge={!collapsed ? <span className="rounded-full bg-surface-2 px-1.5 text-[10px] text-muted-foreground">7</span> : undefined}
            collapsed={collapsed}
          />
          <NavItem icon={FileText} label={t("nav.documents")} to="/documents" active={active === "documents"} collapsed={collapsed} />
          <NavItem icon={BookOpen} label={t("nav.knowledge")} to="/knowledge" active={active === "knowledge"} collapsed={collapsed} />
          <NavItem icon={Workflow} label={t("nav.workflows")} to="/workflows" active={active === "workflows"} collapsed={collapsed} />
          <NavItem icon={Users} label={t("nav.people")} to="/people" active={active === "people"} collapsed={collapsed} />
          <NavItem icon={Mail} label={t("nav.email")} to="/email" active={active === "email"} collapsed={collapsed} />
          <NavItem icon={BarChart3} label={t("nav.reports")} to="/reports" active={active === "reports"} collapsed={collapsed} />
          <NavItem icon={Bot} label={t("nav.ai")} to="/ai" active={active === "ai"} collapsed={collapsed} />

          {!collapsed && (
            <>
              <div className="flex items-center justify-between px-3 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>{t("nav.workspaces")}</span>
                <button
                  className="rounded p-0.5 hover:bg-surface-2"
                  aria-label="Tạo workspace mới"
                  onClick={() => setWsOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <WorkspaceItem slug="stos" letter="S" name="STOS Project" color="bg-emerald-500" active />
              <WorkspaceItem slug="smart-university" letter="U" name="Smart University" color="bg-sky-500" />
              <WorkspaceItem slug="uni-hrm" letter="M" name="UNI-HRM" color="bg-rose-500" />
              <WorkspaceItem slug="marketing-pm" letter="H" name="Marketing & PM" color="bg-violet-500" />
              <WorkspaceItem slug="devops" letter="D" name="DevOps Team" color="bg-orange-500" />
              <NavItem icon={MoreHorizontal} label={t("nav.more")} />
            </>
          )}
          {collapsed && (
            <>
              <div className="my-2 h-px bg-border" />
              <WorkspaceItem slug="stos" letter="S" name="STOS Project" color="bg-emerald-500" active collapsed />
              <WorkspaceItem slug="smart-university" letter="U" name="Smart University" color="bg-sky-500" collapsed />
              <WorkspaceItem slug="uni-hrm" letter="M" name="UNI-HRM" color="bg-rose-500" collapsed />
              <WorkspaceItem slug="marketing-pm" letter="H" name="Marketing & PM" color="bg-violet-500" collapsed />
              <WorkspaceItem slug="devops" letter="D" name="DevOps Team" color="bg-orange-500" collapsed />
            </>
          )}
        </nav>

        {/* Bottom section */}
        {!collapsed && (
          <>
            <div className="m-3 rounded-xl bg-surface-2 p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">Mattermost</div>
                  <div className="flex items-center gap-1 text-[11px] text-success">
                    <Circle className="h-1.5 w-1.5 fill-current" /> Connected
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm">
              <Cloud className="h-5 w-5 text-sky-400" />
              <div>
                <div className="font-medium">Nguyễn Văn A</div>
                <div className="text-[11px] text-muted-foreground">28°C · Hà Nội</div>
              </div>
            </div>
          </>
        )}

        {/* Collapse toggle */}
        <div className={cn("border-t border-border", collapsed ? "px-1 py-2" : "px-3 py-2")}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={toggleCollapsed}
                className={cn(
                  "flex items-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground",
                  collapsed ? "w-full justify-center px-2 py-2" : "w-full px-3 py-2"
                )}
                aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
              >
                {collapsed ? <PanelLeft className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
                {!collapsed && <span className="text-left">Thu gọn menu</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Mở rộng menu" : "Thu gọn menu"}</TooltipContent>
          </Tooltip>
        </div>
      </aside>
      <CreateWorkspaceDialog open={wsOpen} onOpenChange={setWsOpen} />
    </TooltipProvider>
  );
}

function CreateWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const colors = [
    { id: "emerald", cls: "bg-emerald-500" },
    { id: "sky", cls: "bg-sky-500" },
    { id: "rose", cls: "bg-rose-500" },
    { id: "violet", cls: "bg-violet-500" },
    { id: "orange", cls: "bg-orange-500" },
    { id: "amber", cls: "bg-amber-500" },
    { id: "teal", cls: "bg-teal-500" },
    { id: "indigo", cls: "bg-indigo-500" },
  ];
  const templates = [
    { id: "blank", icon: Plus, name: "Trống", desc: "Bắt đầu từ đầu" },
    { id: "project", icon: Workflow, name: "Dự án", desc: "Quản lý task & timeline" },
    { id: "team", icon: Users, name: "Phòng ban", desc: "Cộng tác theo nhóm" },
    { id: "client", icon: BookOpen, name: "Khách hàng", desc: "Không gian chia sẻ" },
  ];
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [colorId, setColorId] = useState("emerald");
  const [templateId, setTemplateId] = useState("blank");
  const [privacy, setPrivacy] = useState<"private" | "team">("team");
  const [members, setMembers] = useState("");

  const letter = (name.trim()[0] || "W").toUpperCase();
  const colorCls = colors.find((c) => c.id === colorId)?.cls ?? "bg-emerald-500";

  const reset = () => {
    setName(""); setDesc(""); setColorId("emerald"); setTemplateId("blank"); setPrivacy("team"); setMembers("");
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên workspace");
      return;
    }
    toast.success(`Đã tạo workspace "${name.trim()}"`);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo workspace mới</DialogTitle>
          <DialogDescription>
            Workspace giúp nhóm của bạn tổ chức dự án, tài liệu và cuộc họp riêng biệt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 p-3">
            <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white", colorCls)}>
              {letter}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{name.trim() || "Workspace của bạn"}</div>
              <div className="truncate text-xs text-muted-foreground">{desc.trim() || "Mô tả ngắn xuất hiện tại đây"}</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tên workspace</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Phòng Marketing"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Mô tả (tuỳ chọn)</label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Mục đích sử dụng của workspace"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Màu sắc</label>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setColorId(c.id)}
                  aria-label={c.id}
                  className={cn(
                    "h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition",
                    c.cls,
                    colorId === c.id ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100"
                  )}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Mẫu khởi tạo</label>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((tp) => (
                <button
                  key={tp.id}
                  onClick={() => setTemplateId(tp.id)}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border p-2.5 text-left transition",
                    templateId === tp.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface-2/40 hover:bg-surface-2"
                  )}
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <tp.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{tp.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{tp.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Quyền truy cập</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPrivacy("team")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2.5 text-left",
                  privacy === "team" ? "border-primary bg-primary/10" : "border-border bg-surface-2/40 hover:bg-surface-2"
                )}
              >
                <Users className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">Nhóm</div>
                  <div className="text-[11px] text-muted-foreground">Thành viên được mời có thể tham gia</div>
                </div>
              </button>
              <button
                onClick={() => setPrivacy("private")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2.5 text-left",
                  privacy === "private" ? "border-primary bg-primary/10" : "border-border bg-surface-2/40 hover:bg-surface-2"
                )}
              >
                <ShieldCheck className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">Riêng tư</div>
                  <div className="text-[11px] text-muted-foreground">Chỉ mình bạn truy cập</div>
                </div>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Mời thành viên (tuỳ chọn)</label>
            <input
              value={members}
              onChange={(e) => setMembers(e.target.value)}
              placeholder="email1@uniwork.vn, email2@uniwork.vn"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            Huỷ
          </button>
          <button
            onClick={handleCreate}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Tạo workspace
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewPanel({ onClose }: { onClose: () => void }) {
  const groups: { label: string; items: { icon: any; title: string; desc: string; kbd?: string; color: string }[] }[] = [
    {
      label: "Công việc",
      items: [
        { icon: ListChecks, title: "Nhiệm vụ mới", desc: "Tạo task, gán người, đặt deadline", kbd: "T", color: "bg-primary/15 text-primary" },
        { icon: Workflow, title: "Quy trình", desc: "Khởi tạo workflow tự động", kbd: "W", color: "bg-violet-500/15 text-violet-300" },
      ],
    },
    {
      label: "Giao tiếp",
      items: [
        { icon: Video, title: "Cuộc họp", desc: "Bắt đầu hoặc lên lịch họp", kbd: "M", color: "bg-rose-500/15 text-rose-300" },
        { icon: MessageSquare, title: "Tin nhắn", desc: "Mở hội thoại nhóm mới", kbd: "C", color: "bg-emerald-500/15 text-emerald-300" },
        { icon: Mail, title: "Soạn email", desc: "Gửi email từ Email Hub", kbd: "E", color: "bg-sky-500/15 text-sky-300" },
      ],
    },
    {
      label: "Nội dung",
      items: [
        { icon: FileText, title: "Tài liệu", desc: "Tạo tài liệu cộng tác", kbd: "D", color: "bg-amber-500/15 text-amber-300" },
        { icon: BookOpen, title: "Trang Wiki", desc: "Ghi chú kiến thức nội bộ", color: "bg-teal-500/15 text-teal-300" },
        { icon: Calendar, title: "Sự kiện lịch", desc: "Thêm vào lịch cá nhân", color: "bg-indigo-500/15 text-indigo-300" },
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-label="Tạo mới"
      className="absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] origin-top-right overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40"
    >
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary/15 via-surface to-surface px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Tạo nhanh</div>
          <div className="text-[11px] text-muted-foreground">Chọn một loại để bắt đầu</div>
        </div>
        <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">N</span>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2">
        {groups.map((g) => (
          <div key={g.label} className="mb-2 last:mb-0">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.title}>
                  <button onClick={onClose} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-2">
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", it.color)}>
                      <it.icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{it.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{it.desc}</div>
                    </div>
                    {it.kbd && (
                      <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {it.kbd}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border bg-surface-2/40 px-3 py-2 text-[11px] text-muted-foreground">
        Gõ <span className="rounded border border-border bg-surface px-1 font-mono text-[10px]">/</span> trong bất kỳ ô nào để mở lệnh nhanh.
      </div>
    </div>
  );
}

function AIPanel({ onClose }: { onClose: () => void }) {
  const suggestions = [
    { icon: FileSearch, title: "Tóm tắt cuộc họp hôm nay", desc: "Lấy điểm chính từ 3 cuộc họp gần nhất" },
    { icon: Wand2, title: "Soạn email cảm ơn khách hàng", desc: "Gửi đến STOS sau buổi demo" },
    { icon: ListChecks, title: "Lập kế hoạch tuần", desc: "Dựa trên task đang mở và lịch" },
    { icon: Languages, title: "Dịch tài liệu sang tiếng Anh", desc: "Văn bản đang xem trong Documents" },
  ];
  const recent = ["Phân tích tiến độ Dự án Alpha", "Tạo OKR Q3 cho phòng Marketing"];

  return (
    <div
      role="dialog"
      aria-label="Trợ lý AI"
      className="absolute right-0 top-[calc(100%+8px)] z-50 w-[380px] origin-top-right overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40"
    >
      <div className="flex items-center gap-3 border-b border-border bg-gradient-to-br from-primary/20 via-surface to-surface px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Trợ lý Uniwork AI</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Sẵn sàng · Gemini 3 Flash
          </div>
        </div>
        <button onClick={onClose} aria-label="Đóng" className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pt-3">
        <div className="relative">
          <textarea
            rows={3}
            placeholder="Hỏi AI bất kỳ điều gì về công việc, tài liệu, cuộc họp..."
            className="w-full resize-none rounded-xl border border-border bg-surface-2 p-3 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            aria-label="Gửi"
            className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { icon: FileText, label: "Tài liệu hiện tại" },
            { icon: Calendar, label: "Lịch tuần" },
            { icon: ListChecks, label: "Task của tôi" },
          ].map((c) => (
            <button key={c.label} className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
              <c.icon className="h-3 w-3" /> {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pt-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5" /> Gợi ý cho bạn
        </div>
        <ul className="space-y-1">
          {suggestions.map((s) => (
            <li key={s.title}>
              <button className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left hover:bg-surface-2">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <s.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{s.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{s.desc}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-2 border-t border-border px-3 py-2">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lịch sử gần đây</div>
        <ul className="space-y-0.5">
          {recent.map((r) => (
            <li key={r}>
              <button className="flex w-full items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                <MessageCircle className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{r}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface-2/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span>AI có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.</span>
        <button className="rounded-md px-1.5 py-0.5 hover:bg-surface-2 hover:text-foreground">Mở rộng</button>
      </div>
    </div>
  );
}

function CalendarPanel({ onClose }: { onClose: () => void }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today.getDate());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells: { d: number; cur: boolean }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) cells.push({ d: prevDays - i, cur: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, cur: true });
  while (cells.length % 7 !== 0) cells.push({ d: cells.length - daysInMonth - firstDow + 1, cur: false });

  const monthName = cursor.toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
  const dows = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const eventDays = new Set([3, 8, 10, 15, 18, 22, 27]);

  const events = [
    { time: "09:00", title: "Họp giao ban tuần", room: "Phòng Alpha", color: "bg-primary" },
    { time: "11:30", title: "Review thiết kế Email Hub", room: "Google Meet", color: "bg-emerald-500" },
    { time: "14:00", title: "1-1 với Trần Minh", room: "Phòng Beta", color: "bg-amber-500" },
    { time: "16:30", title: "Demo khách hàng STOS", room: "Zoom", color: "bg-rose-500" },
  ];

  return (
    <div
      role="dialog"
      aria-label="Lịch"
      className="absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] origin-top-right overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40"
    >
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary/10 via-surface to-surface p-3">
        <div>
          <div className="text-sm font-semibold capitalize">{monthName}</div>
          <div className="text-[11px] text-muted-foreground">Hôm nay · {today.toLocaleDateString("vi-VN")}</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded-md p-1.5 hover:bg-surface-2"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label="Tháng trước"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
          </button>
          <button
            className="rounded-md px-2 py-1 text-[11px] font-medium hover:bg-surface-2"
            onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today.getDate()); }}
          >
            Hôm nay
          </button>
          <button
            className="rounded-md p-1.5 hover:bg-surface-2"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label="Tháng sau"
          >
            <ChevronDown className="h-4 w-4 -rotate-90" />
          </button>
        </div>
      </div>

      <div className="px-3 pt-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
          {dows.map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 pb-2 text-center text-xs">
          {cells.map((c, i) => {
            const isToday = c.cur && c.d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const isSel = c.cur && c.d === selected;
            const hasEvent = c.cur && eventDays.has(c.d);
            return (
              <button
                key={i}
                onClick={() => c.cur && setSelected(c.d)}
                className={cn(
                  "relative aspect-square rounded-md text-xs transition-colors",
                  !c.cur && "text-muted-foreground/40",
                  c.cur && !isSel && !isToday && "hover:bg-surface-2",
                  isToday && !isSel && "bg-primary/15 text-foreground font-semibold",
                  isSel && "bg-primary text-primary-foreground font-semibold"
                )}
              >
                {c.d}
                {hasEvent && !isSel && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sự kiện hôm nay</div>
          <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">{events.length}</span>
        </div>
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li key={e.title} className="flex items-start gap-2 rounded-lg p-1.5 hover:bg-surface-2">
              <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", e.color)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{e.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">{e.time} · {e.room}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface-2/40 px-3 py-2">
        <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <Plus className="h-3.5 w-3.5" /> Tạo sự kiện
        </button>
        <button onClick={onClose} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground">Đóng</button>
      </div>
    </div>
  );
}

export function AppTopbar({ variant = "meeting", onOpenSidebar, onNew }: { variant?: "meeting" | "documents"; onOpenSidebar: () => void; onNew?: () => void }) {
  const { t } = useI18n();
  const [userOpen, setUserOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const calRef = useRef<HTMLDivElement | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const newRef = useRef<HTMLDivElement | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const aiRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!userOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setUserOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [userOpen]);

  useEffect(() => {
    if (!calOpen) return;
    const onClick = (e: MouseEvent) => {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setCalOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCalOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [calOpen]);

  useEffect(() => {
    if (!newOpen) return;
    const onClick = (e: MouseEvent) => {
      if (newRef.current && !newRef.current.contains(e.target as Node)) setNewOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNewOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [newOpen]);

  useEffect(() => {
    if (!aiOpen) return;
    const onClick = (e: MouseEvent) => {
      if (aiRef.current && !aiRef.current.contains(e.target as Node)) setAiOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAiOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [aiOpen]);

  const { collapsed, toggleCollapsed } = useSidebarCollapsed();

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-6 lg:flex-nowrap lg:gap-4">
      <button aria-label="Open sidebar" className="rounded-lg p-2 hover:bg-surface-2 lg:hidden" onClick={onOpenSidebar}>
        <Menu className="h-5 w-5" />
      </button>
      <button
        aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
        className="hidden rounded-lg p-2 hover:bg-surface-2 lg:block"
        onClick={toggleCollapsed}
      >
        {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </button>
      <div className="relative order-last w-full min-w-0 flex-1 basis-full sm:order-none sm:basis-auto sm:max-w-2xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder={variant === "documents" ? t("topbar.search.docs") : t("topbar.search")}
          className="w-full rounded-lg bg-surface-2 py-2.5 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>
      {variant === "meeting" ? (
        <>
          <span className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
            <Circle className="h-2 w-2 fill-current" /> {t("nav.live")}
          </span>
          <span className="hidden font-mono text-sm tabular-nums sm:inline">00:28:45</span>
        </>
      ) : (
        <>
          <div className="relative hidden sm:block" ref={newRef}>
            <button
              onClick={() => { setNewOpen((v) => !v); onNew?.(); }}
              aria-haspopup="dialog"
              aria-expanded={newOpen}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> {t("topbar.new")}
            </button>
            {newOpen && <NewPanel onClose={() => setNewOpen(false)} />}
          </div>
          <div className="relative hidden sm:block" ref={aiRef}>
            <button
              onClick={() => setAiOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={aiOpen}
              className={cn(
                "flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-2/70",
                aiOpen && "ring-1 ring-primary/40"
              )}
            >
              <Sparkles className="h-4 w-4 text-primary" /> AI
            </button>
            {aiOpen && <AIPanel onClose={() => setAiOpen(false)} />}
          </div>
          <Link to="/help" aria-label="Trợ giúp" className="hidden rounded-lg p-2 hover:bg-surface-2 md:block"><HelpCircle className="h-5 w-5 text-muted-foreground" /></Link>
        </>
      )}
      <LanguageToggle />
      <ThemeToggle />
      <Link to="/settings" className="hidden rounded-lg p-2 hover:bg-surface-2 2xl:block" aria-label="Bảo mật"><ShieldCheck className="h-5 w-5 text-muted-foreground" /></Link>
      <Link to="/settings" className="hidden rounded-lg p-2 hover:bg-surface-2 2xl:block" aria-label="Cài đặt"><Settings className="h-5 w-5 text-muted-foreground" /></Link>
      {variant === "meeting" && (
        <button className="hidden items-center gap-1 rounded-lg p-2 hover:bg-surface-2 md:flex">
          <Users className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm">16</span>
        </button>
      )}
      <Link to="/notifications" className="relative rounded-lg p-2 hover:bg-surface-2" aria-label="Thông báo">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">12</span>
      </Link>
      <div className="relative" ref={calRef}>
        <button
          onClick={() => setCalOpen((v) => !v)}
          aria-label="Lịch"
          aria-haspopup="dialog"
          aria-expanded={calOpen}
          className={cn(
            "hidden rounded-lg p-2 hover:bg-surface-2 lg:block",
            calOpen && "bg-surface-2"
          )}
        >
          <Calendar className="h-5 w-5 text-muted-foreground" />
        </button>
        {calOpen && <CalendarPanel onClose={() => setCalOpen(false)} />}
      </div>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setUserOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={userOpen}
          className={cn(
            "flex items-center gap-2.5 rounded-xl border bg-surface-2/80 px-2 py-1.5 transition-colors hover:bg-surface-2",
            userOpen ? "border-primary/60" : "border-border/60 hover:border-primary/40"
          )}
        >
          <span className="relative">
            <img src={avatar("nguyen-van-a-1")} className="h-9 w-9 rounded-lg bg-surface object-cover ring-1 ring-border/60" alt="Nguyễn Văn A" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-2 bg-emerald-400" />
          </span>
          <div className="hidden text-left leading-tight sm:block">
            <div className="whitespace-nowrap text-sm font-semibold">Nguyễn Văn A</div>
            <div className="whitespace-nowrap text-[11px] text-muted-foreground">Giám đốc Điều hành</div>
          </div>
          <ChevronDown className={cn("hidden h-4 w-4 text-muted-foreground transition-transform sm:block", userOpen ? "rotate-180 text-primary" : "")} />
        </button>

        {userOpen && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] origin-top-right overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40"
          >
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-border bg-gradient-to-br from-primary/15 via-surface to-surface p-4">
              <span className="relative">
                <img src={avatar("nguyen-van-a-1")} className="h-12 w-12 rounded-xl bg-surface object-cover ring-2 ring-primary/40" alt="" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-emerald-400" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="truncate text-sm font-semibold">Nguyễn Văn A</div>
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">Pro</span>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">Giám đốc Điều hành · STOS</div>
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">nguyenvana@uniwork.vn</span>
                </div>
              </div>
            </div>

            {/* Quick status */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                <span>Đang trực tuyến</span>
              </div>
              <button className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
                <Moon className="h-3 w-3" /> Đặt trạng thái
              </button>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 border-b border-border px-3 py-2.5">
              <Link
                to="/settings"
                search={{ tab: 'account' }}
                onClick={() => setUserOpen(false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
              >
                <KeyRound className="h-3.5 w-3.5" /> Đổi mật khẩu
              </Link>
            </div>

            {/* Menu items */}
            <div className="p-1.5">
              <MenuItem icon={UserCircle2} label="Hồ sơ cá nhân" desc="Xem & chỉnh sửa thông tin" onClick={() => setUserOpen(false)} to="/settings" search={{ tab: 'profile' }} />
              <MenuItem icon={Settings} label="Cài đặt tài khoản" desc="Email, tên đăng nhập" onClick={() => setUserOpen(false)} to="/settings" search={{ tab: 'account' }} />
              <MenuItem icon={KeyRound} label="Đổi mật khẩu" desc="Cập nhật & bật 2FA" onClick={() => setUserOpen(false)} to="/settings" search={{ tab: 'password' }} />
              <MenuItem icon={ShieldCheck} label="Quyền riêng tư & bảo mật" desc="Phiên đăng nhập, thiết bị" onClick={() => setUserOpen(false)} to="/settings" search={{ tab: 'security' }} />
              <MenuItem icon={HelpCircle} label="Trợ giúp & hỗ trợ" desc="Tài liệu, hotline 1900 6996" onClick={() => setUserOpen(false)} to="/help" />
            </div>

            {/* Logout */}
            <div className="border-t border-border p-1.5">
              <button
                onClick={() => setUserOpen(false)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                <span className="flex-1 text-left font-medium">Đăng xuất</span>
                <span className="text-[11px] text-muted-foreground">⇧⌘Q</span>
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-surface-2/40 px-3 py-2 text-[10px] text-muted-foreground">
              <span>UNIWORK v2.4.1</span>
              <a href="#" className="hover:text-foreground">Điều khoản · Bảo mật</a>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function MenuItem({ icon: Icon, label, desc, to, search, onClick }: { icon: any; label: string; desc?: string; to?: string; search?: Record<string, any>; onClick?: () => void }) {
  const inner = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {desc && <span className="block truncate text-[11px] text-muted-foreground">{desc}</span>}
      </span>
    </>
  );
  const cls = "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2";
  if (to) return <Link to={to} search={search} onClick={onClick} className={cls}>{inner}</Link>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}

export function useSidebarState() {
  return useState(false);
}
