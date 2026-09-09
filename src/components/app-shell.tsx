import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/brand-logo";
import type { LucideIcon } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listMyWorkspaces } from "@/lib/api/workspace-overview.functions";
import { useUnreadNotifications } from "@/lib/use-unread-notifications";
import {
  LayoutDashboard,
  MessageSquare,
  Video,
  ListChecks,
  FileText,
  BookOpen,
  Workflow,
  Users,
  BarChart3,
  Bot,
  Plus,
  Search,
  Bell,
  Settings,
  Calendar,
  ShieldCheck,
  ChevronDown,
  MoreHorizontal,
  MessageCircle,
  Circle,
  Cloud,
  Menu,
  X,
  HelpCircle,
  Sparkles,
  CreditCard,
  UserCircle2,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  Moon,
  PanelLeft,
  PanelLeftClose,
  ArrowUp,
  Wand2,
  Languages,
  FileSearch,
  Lightbulb,
  AtSign,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { ThemeToggle, ToneToggle } from "@/lib/theme";
import { LanguageToggle, useI18n, type Key } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { useCurrentIdentity } from "@/lib/use-current-identity";
import { QuickCreateDialog, type QuickCreateKind } from "@/components/quick-create-dialog";
import { useAvailableTenants } from "@/features/tenants/hooks";
import { DesktopNavigation } from "@/components/navigation/desktop-nav";
import { NAV_ICON_CLASS, NAV_ICON_STROKE, NAV_ICON_STROKE_ACTIVE } from "@/config/navigation";
import { notifyComingSoon } from "@/lib/coming-soon";

/**
 * Batch 1B-UI-FINISH — Tenant switcher slot embedded in AppTopbar.
 * Single-tenant users see nothing (the strip in _authenticated/route.tsx was
 * removed to avoid duplicate switchers). Multi-tenant users see the compact
 * switcher inline. Kept as a small dedicated component to avoid touching the
 * 1.7k-LOC AppTopbar for anything beyond a single insertion point.
 */
function TenantSwitcherSlot() {
  const list = useAvailableTenants();
  const count = list.data?.length ?? 0;
  if (count <= 1) return null;
  return (
    <div className="hidden md:block">
      <TenantSwitcher compact />
    </div>
  );
}

export const avatar = (seed: string) =>
  `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear`;

type NavKey =
  | "ai-market"
  | "dashboard"
  | "chat"
  | "meetings"
  | "calendar"
  | "tasks"
  | "documents"
  | "work-products"
  | "knowledge"
  | "workflows"
  | "people"
  | "email"
  | "reports"
  | "ai"
  | "ai-workforce"
  | "notifications"
  | "settings"
  | "help";

function NavItem({
  icon: Icon,
  label,
  active,
  chevron,
  to,
  badge,
  collapsed,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  chevron?: boolean;
  to?: string;
  badge?: ReactNode;
  collapsed?: boolean;
}) {
  const cls = cn(
    "relative flex items-center rounded-lg transition-colors",
    collapsed ? "w-full justify-center px-2 py-2.5" : "w-full gap-3 px-3 py-2 text-sm",
    active
      ? "bg-primary/15 font-medium text-foreground"
      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
  );
  const inner = collapsed ? (
    <>
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
        />
      )}
      <Icon
        className={cn(NAV_ICON_CLASS, active && "text-primary")}
        strokeWidth={active ? NAV_ICON_STROKE_ACTIVE : NAV_ICON_STROKE}
      />
    </>
  ) : (
    <>
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
        />
      )}
      <Icon
        className={cn(NAV_ICON_CLASS, active && "text-primary")}
        strokeWidth={active ? NAV_ICON_STROKE_ACTIVE : NAV_ICON_STROKE}
      />
      <span className="flex-1 text-left">{label}</span>
      {badge}
      {chevron && <ChevronDown className="h-4 w-4 opacity-60" strokeWidth={NAV_ICON_STROKE} />}
    </>
  );
  const el = to ? (
    <Link to={to} className={cls} title={collapsed ? label : undefined}>
      {inner}
    </Link>
  ) : (
    <button
      onClick={() => notifyComingSoon(label)}
      className={cls}
      title={collapsed ? label : undefined}
    >
      {inner}
    </button>
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

const WS_COLORS = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-orange-500",
  "bg-teal-500",
];
function wsColorOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return WS_COLORS[h % WS_COLORS.length];
}

// Danh sách workspace thật của người dùng.
function WorkspaceList({ collapsed }: { collapsed?: boolean }) {
  const { workspaceId: activeWsId } = useActiveWorkspace();
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
    staleTime: 60_000,
  });
  if (isLoading) {
    return (
      <div className={collapsed ? "px-2 py-2" : "px-3 py-2"}>
        <div className="h-5 animate-pulse rounded bg-surface-2" />
      </div>
    );
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    return collapsed ? null : (
      <div className="px-3 py-2 text-[11px] text-muted-foreground">
        {t("sh.ws.empty")}{" "}
        <Link to="/workspace" className="text-primary hover:underline">
          {t("sh.ws.createNew")}
        </Link>
      </div>
    );
  }
  return (
    <>
      {rows.map((w) => (
        <WorkspaceItem
          key={w.id}
          slug={w.id}
          letter={w.name.trim().charAt(0).toUpperCase() || "W"}
          name={w.name}
          color={wsColorOf(w.id)}
          active={w.id === activeWsId}
          collapsed={collapsed}
        />
      ))}
      {!collapsed && (
        <Link
          to="/workspace"
          className="mx-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> {t("sh.ws.manage")}
        </Link>
      )}
    </>
  );
}

function WorkspaceItem({
  letter,
  name,
  color,
  active,
  collapsed,
  slug,
}: {
  letter: string;
  name: string;
  color: string;
  active?: boolean;
  collapsed?: boolean;
  slug?: string;
}) {
  const cls = cn(
    "flex w-full items-center rounded-lg transition-colors",
    collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-1.5 text-sm",
    active
      ? "bg-primary/15 text-foreground"
      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
  );
  const inner = (
    <>
      <span
        className={cn(
          "flex items-center justify-center rounded text-[11px] font-semibold text-white",
          collapsed ? "h-7 w-7 text-[10px]" : "h-5 w-5",
          color,
        )}
      >
        {letter}
      </span>
      {!collapsed && <span>{name}</span>}
    </>
  );
  const btn = slug ? (
    <Link
      to="/workspace/$id"
      params={{ id: slug }}
      className={cls}
      title={collapsed ? name : undefined}
    >
      {inner}
    </Link>
  ) : (
    <button
      onClick={() => notifyComingSoon(name)}
      className={cls}
      title={collapsed ? name : undefined}
    >
      {inner}
    </button>
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

export function AppSidebar({
  active,
  open,
  onClose,
}: {
  active?: NavKey;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();
  const sidebarIdentity = useCurrentIdentity();
  const [wsOpen, setWsOpen] = useState(false);
  const { unreadCount } = useUnreadNotifications();

  const desktopWidth = collapsed ? "lg:w-14 xl:w-14" : "lg:w-56 xl:w-64";

  return (
    <TooltipProvider>
      {open && (
        <button
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-border bg-surface transition-all duration-200 lg:static lg:translate-x-0",
          desktopWidth,
          open ? "translate-x-0 w-64" : "-translate-x-full w-64",
          collapsed && "lg:items-center lg:px-2 lg:py-4",
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center gap-2 py-5",
            collapsed ? "px-2 lg:justify-center" : "px-5",
          )}
        >
          <BrandMark className="h-9 w-9" />
          {!collapsed && (
            <div className="flex-1 leading-tight">
              <div className="text-base font-bold tracking-wide">UNIWORK</div>
              <div className="text-[10px] text-muted-foreground">Digital Workplace Platform</div>
            </div>
          )}
          <button
            aria-label="Close sidebar"
            className="rounded p-1 text-muted-foreground hover:bg-surface-2 lg:hidden"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <div className={cn("pb-3", collapsed ? "px-1" : "px-3")}>
          <WorkspaceSwitcher collapsed={collapsed} />
        </div>
        <nav className={cn("flex-1 space-y-1 overflow-y-auto", collapsed ? "px-1" : "px-3")}>
          <DesktopNavigation collapsed={collapsed} />

          {!collapsed && (
            <>
              <div className="flex items-center justify-between px-3 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>{t("nav.workspaces")}</span>
                <button
                  className="rounded p-0.5 hover:bg-surface-2"
                  aria-label={t("sh.ws.addAria")}
                  onClick={() => setWsOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <WorkspaceList />
            </>
          )}
          {collapsed && (
            <>
              <div className="my-2 h-px bg-border" />
              <WorkspaceList collapsed />
            </>
          )}
        </nav>

        {/* Bottom section */}
        {!collapsed && (
          <>
            <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm">
              <Cloud className="h-5 w-5 text-sky-400" />
              <div>
                <div className="font-medium">{sidebarIdentity.displayName}</div>
                <div className="text-[11px] text-muted-foreground">{t("sh.user.weather")}</div>
              </div>
            </div>
          </>
        )}

        {/* Collapse toggle */}
        <div
          className={cn("space-y-1 border-t border-border", collapsed ? "px-1 py-2" : "px-3 py-2")}
        >
          <NavItem
            icon={Settings}
            label={t("nav.settings")}
            to="/settings"
            active={active === "settings"}
            collapsed={collapsed}
          />
          <NavItem
            icon={HelpCircle}
            label={t("nav.help")}
            to="/help"
            active={active === "help"}
            collapsed={collapsed}
          />
        </div>
        <div className={cn("border-t border-border", collapsed ? "px-1 py-2" : "px-3 py-2")}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={toggleCollapsed}
                className={cn(
                  "flex items-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground",
                  collapsed ? "w-full justify-center px-2 py-2" : "w-full px-3 py-2",
                )}
                aria-label={collapsed ? t("sh.menu.expand") : t("sh.menu.collapse")}
              >
                {collapsed ? (
                  <PanelLeft className="h-[18px] w-[18px]" />
                ) : (
                  <PanelLeftClose className="h-[18px] w-[18px]" />
                )}
                {!collapsed && <span className="text-left">{t("sh.menu.collapse")}</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? t("sh.menu.expand") : t("sh.menu.collapse")}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
      <CreateWorkspaceDialog open={wsOpen} onOpenChange={setWsOpen} />
    </TooltipProvider>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
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
    { id: "blank", icon: Plus, name: t("sh.tpl.blank"), desc: t("sh.tpl.blankDesc") },
    { id: "project", icon: Workflow, name: t("sh.tpl.project"), desc: t("sh.tpl.projectDesc") },
    { id: "team", icon: Users, name: t("sh.tpl.team"), desc: t("sh.tpl.teamDesc") },
    { id: "client", icon: BookOpen, name: t("sh.tpl.client"), desc: t("sh.tpl.clientDesc") },
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
    setName("");
    setDesc("");
    setColorId("emerald");
    setTemplateId("blank");
    setPrivacy("team");
    setMembers("");
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error(t("sh.wsdlg.nameRequired"));
      return;
    }
    toast.success(`${t("sh.wsdlg.created")}: "${name.trim()}"`);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sh.wsdlg.title")}</DialogTitle>
          <DialogDescription>{t("sh.wsdlg.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 p-3">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white",
                colorCls,
              )}
            >
              {letter}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {name.trim() || t("sh.wsdlg.phName")}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {desc.trim() || t("sh.wsdlg.phDesc")}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("sh.wsdlg.nameLabel")}
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("sh.wsdlg.namePh")}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("sh.wsdlg.descLabel")}
            </label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t("sh.wsdlg.descPh")}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("sh.wsdlg.color")}
            </label>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setColorId(c.id)}
                  aria-label={c.id}
                  className={cn(
                    "h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition",
                    c.cls,
                    colorId === c.id ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100",
                  )}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("sh.wsdlg.template")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((tp) => (
                <button
                  key={tp.id}
                  onClick={() => setTemplateId(tp.id)}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border p-2.5 text-left transition",
                    templateId === tp.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface-2/40 hover:bg-surface-2",
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
            <label className="text-xs font-medium text-muted-foreground">
              {t("sh.wsdlg.access")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPrivacy("team")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2.5 text-left",
                  privacy === "team"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface-2/40 hover:bg-surface-2",
                )}
              >
                <Users className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t("sh.wsdlg.team")}</div>
                  <div className="text-[11px] text-muted-foreground">{t("sh.wsdlg.teamDesc")}</div>
                </div>
              </button>
              <button
                onClick={() => setPrivacy("private")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2.5 text-left",
                  privacy === "private"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface-2/40 hover:bg-surface-2",
                )}
              >
                <ShieldCheck className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t("sh.wsdlg.private")}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("sh.wsdlg.privateDesc")}
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("sh.wsdlg.invite")}
            </label>
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
            {t("sh.wsdlg.cancel")}
          </button>
          <button
            onClick={handleCreate}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("sh.wsdlg.submit")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [quickKind, setQuickKind] = useState<QuickCreateKind | null>(null);

  const groups: {
    label: string;
    items: {
      icon: LucideIcon;
      title: string;
      desc: string;
      kbd?: string;
      color: string;
      kind: QuickCreateKind;
    }[];
  }[] = [
    {
      label: t("sh.new.g.work"),
      items: [
        {
          icon: ListChecks,
          title: t("sh.new.task"),
          desc: t("sh.new.taskDesc"),
          kbd: "T",
          color: "bg-primary/15 text-primary",
          kind: "task",
        },
        {
          icon: Workflow,
          title: t("sh.new.flow"),
          desc: t("sh.new.flowDesc"),
          kbd: "W",
          color: "bg-violet-500/15 text-violet-300",
          kind: "workflow",
        },
      ],
    },
    {
      label: t("sh.new.g.comm"),
      items: [
        {
          icon: Video,
          title: t("sh.new.meeting"),
          desc: t("sh.new.meetingDesc"),
          kbd: "M",
          color: "bg-rose-500/15 text-rose-300",
          kind: "meeting",
        },
        {
          icon: MessageSquare,
          title: t("sh.new.msg"),
          desc: t("sh.new.msgDesc"),
          kbd: "C",
          color: "bg-emerald-500/15 text-emerald-300",
          kind: "message",
        },
        {
          icon: Mail,
          title: t("sh.new.email"),
          desc: t("sh.new.emailDesc"),
          kbd: "E",
          color: "bg-sky-500/15 text-sky-300",
          kind: "email",
        },
      ],
    },
    {
      label: t("sh.new.g.content"),
      items: [
        {
          icon: FileText,
          title: t("sh.new.doc"),
          desc: t("sh.new.docDesc"),
          kbd: "D",
          color: "bg-amber-500/15 text-amber-300",
          kind: "doc",
        },
        {
          icon: BookOpen,
          title: t("sh.new.wiki"),
          desc: t("sh.new.wikiDesc"),
          color: "bg-teal-500/15 text-teal-300",
          kind: "wiki",
        },
        {
          icon: Calendar,
          title: t("sh.new.event"),
          desc: t("sh.new.eventDesc"),
          color: "bg-indigo-500/15 text-indigo-300",
          kind: "event",
        },
      ],
    },
  ];

  // Phím tắt trong panel: T/W/M/C/E/D mở dialog tạo thật (panel vẫn mở).
  useEffect(() => {
    const map: Record<string, QuickCreateKind> = {
      t: "task",
      w: "workflow",
      m: "meeting",
      c: "message",
      e: "email",
      d: "doc",
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const target = ev.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (ev.key === "Escape") {
        if (quickKind) setQuickKind(null);
        else onClose();
        return;
      }
      if (quickKind) return;
      const kind = map[ev.key.toLowerCase()];
      if (!kind) return;
      ev.preventDefault();
      setQuickKind(kind);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, quickKind]);

  return (
    <div
      role="dialog"
      aria-label={t("sh.new.aria")}
      className="fixed left-2 right-2 top-[64px] z-50 w-auto origin-top-right overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40 sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[340px]"
    >
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary/15 via-surface to-surface px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{t("sh.new.title")}</div>
          <div className="text-[11px] text-muted-foreground">{t("sh.new.sub")}</div>
        </div>
        <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          N
        </span>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2">
        {groups.map((g) => (
          <div key={g.label} className="mb-2 last:mb-0">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {g.label}
            </div>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.title}>
                  <button
                    onClick={() => setQuickKind(it.kind)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-2"
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        it.color,
                      )}
                    >
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
        {t("sh.new.hintA")}{" "}
        <span className="rounded border border-border bg-surface px-1 font-mono text-[10px]">
          /
        </span>{" "}
        {t("sh.new.hintB")}
      </div>
      <QuickCreateDialog kind={quickKind} onOpenChange={(o) => !o && setQuickKind(null)} />
    </div>
  );
}

function AIPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const suggestions = [
    {
      icon: FileSearch,
      title: t("sh.ai.s1"),
      desc: t("sh.ai.s1d"),
    },
    { icon: Wand2, title: t("sh.ai.s2"), desc: t("sh.ai.s2d") },
    { icon: ListChecks, title: t("sh.ai.s3"), desc: t("sh.ai.s3d") },
    {
      icon: Languages,
      title: t("sh.ai.s4"),
      desc: t("sh.ai.s4d"),
    },
  ];
  const recent = [t("sh.ai.r1"), t("sh.ai.r2")];

  return (
    <div
      role="dialog"
      aria-label={t("sh.ai.aria")}
      className="fixed left-2 right-2 top-[64px] z-50 w-auto origin-top-right overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40 sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[380px]"
    >
      <div className="flex items-center gap-3 border-b border-border bg-gradient-to-br from-primary/20 via-surface to-surface px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t("sh.ai.title")}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {t("sh.ai.ready")}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label={t("sh.ai.close")}
          className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pt-3">
        <div className="relative">
          <textarea
            rows={3}
            placeholder={t("sh.ai.ph")}
            className="w-full resize-none rounded-xl border border-border bg-surface-2 p-3 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={() => notifyComingSoon()}
            aria-label={t("sh.ai.send")}
            className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { icon: FileText, label: t("sh.ai.chip.doc") },
            { icon: Calendar, label: t("sh.ai.chip.week") },
            { icon: ListChecks, label: t("sh.ai.chip.tasks") },
          ].map((c) => (
            <button
              onClick={() => notifyComingSoon()}
              key={c.label}
              className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <c.icon className="h-3 w-3" /> {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pt-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5" /> {t("sh.ai.suggest")}
        </div>
        <ul className="space-y-1">
          {suggestions.map((s) => (
            <li key={s.title}>
              <button
                onClick={() => notifyComingSoon()}
                className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left hover:bg-surface-2"
              >
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
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("sh.ai.recent")}
        </div>
        <ul className="space-y-0.5">
          {recent.map((r) => (
            <li key={r}>
              <button
                onClick={() => notifyComingSoon()}
                className="flex w-full items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0" />{" "}
                <span className="truncate">{r}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface-2/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span>{t("sh.ai.disclaimer")}</span>
        <button
          onClick={() => notifyComingSoon()}
          className="rounded-md px-1.5 py-0.5 hover:bg-surface-2 hover:text-foreground"
        >
          {t("sh.ai.expand")}
        </button>
      </div>
    </div>
  );
}

function CalendarPanel({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const locale = lang === "vi" ? "vi-VN" : "en-US";
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
  while (cells.length % 7 !== 0)
    cells.push({ d: cells.length - daysInMonth - firstDow + 1, cur: false });

  const monthName = cursor.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const dows = [
    t("sh.cal.dow.mon"),
    t("sh.cal.dow.tue"),
    t("sh.cal.dow.wed"),
    t("sh.cal.dow.thu"),
    t("sh.cal.dow.fri"),
    t("sh.cal.dow.sat"),
    t("sh.cal.dow.sun"),
  ];
  const eventDays = new Set([3, 8, 10, 15, 18, 22, 27]);

  const events = [
    { time: "09:00", title: t("sh.cal.e1"), room: t("sh.cal.e1room"), color: "bg-primary" },
    {
      time: "11:30",
      title: t("sh.cal.e2"),
      room: "Google Meet",
      color: "bg-emerald-500",
    },
    { time: "14:00", title: t("sh.cal.e3"), room: t("sh.cal.e3room"), color: "bg-amber-500" },
    { time: "16:30", title: t("sh.cal.e4"), room: "Zoom", color: "bg-rose-500" },
  ];

  return (
    <div
      role="dialog"
      aria-label={t("sh.cal.aria")}
      className="fixed left-2 right-2 top-[64px] z-50 w-auto origin-top-right overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40 sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[340px]"
    >
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary/10 via-surface to-surface p-3">
        <div>
          <div className="text-sm font-semibold capitalize">{monthName}</div>
          <div className="text-[11px] text-muted-foreground">
            {t("sh.cal.today")} · {today.toLocaleDateString(locale)}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded-md p-1.5 hover:bg-surface-2"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label={t("sh.cal.prev")}
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
          </button>
          <button
            className="rounded-md px-2 py-1 text-[11px] font-medium hover:bg-surface-2"
            onClick={() => {
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelected(today.getDate());
            }}
          >
            {t("sh.cal.today")}
          </button>
          <button
            className="rounded-md p-1.5 hover:bg-surface-2"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label={t("sh.cal.next")}
          >
            <ChevronDown className="h-4 w-4 -rotate-90" />
          </button>
        </div>
      </div>

      <div className="px-3 pt-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
          {dows.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 pb-2 text-center text-xs">
          {cells.map((c, i) => {
            const isToday =
              c.cur &&
              c.d === today.getDate() &&
              month === today.getMonth() &&
              year === today.getFullYear();
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
                  isSel && "bg-primary text-primary-foreground font-semibold",
                )}
              >
                {c.d}
                {hasEvent && !isSel && (
                  <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("sh.cal.events")}
          </div>
          <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {events.length}
          </span>
        </div>
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li
              key={e.title}
              className="flex items-start gap-2 rounded-lg p-1.5 hover:bg-surface-2"
            >
              <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", e.color)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{e.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {e.time} · {e.room}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface-2/40 px-3 py-2">
        <button
          onClick={() => notifyComingSoon()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> {t("sh.cal.new")}
        </button>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          {t("sh.cal.close")}
        </button>
      </div>
    </div>
  );
}

type PanelNotif = {
  id: string;
  icon: LucideIcon;
  tint: string;
  actor?: string;
  titleKey: Key;
  bodyKey: Key;
  timeKey: Key;
  unread?: boolean;
};

const PANEL_NOTIFS: PanelNotif[] = [
  {
    id: "1",
    icon: AtSign,
    tint: "text-violet-400 bg-violet-500/15",
    actor: "Trần Thị B",
    titleKey: "sh.notif.n1t",
    bodyKey: "sh.notif.n1b",
    timeKey: "sh.notif.n1time",
    unread: true,
  },
  {
    id: "2",
    icon: CheckCircle2,
    tint: "text-emerald-400 bg-emerald-500/15",
    actor: "Phạm Minh C",
    titleKey: "sh.notif.n2t",
    bodyKey: "sh.notif.n2b",
    timeKey: "sh.notif.n2time",
    unread: true,
  },
  {
    id: "3",
    icon: Video,
    tint: "text-rose-400 bg-rose-500/15",
    titleKey: "sh.notif.n3t",
    bodyKey: "sh.notif.n3b",
    timeKey: "sh.notif.n3time",
    unread: true,
  },
  {
    id: "4",
    icon: FileText,
    tint: "text-sky-400 bg-sky-500/15",
    actor: "Phạm Minh C",
    titleKey: "sh.notif.n4t",
    bodyKey: "sh.notif.n4b",
    timeKey: "sh.notif.n4time",
  },
  {
    id: "5",
    icon: Workflow,
    tint: "text-amber-400 bg-amber-500/15",
    actor: "Lê Hoàng D",
    titleKey: "sh.notif.n5t",
    bodyKey: "sh.notif.n5b",
    timeKey: "sh.notif.n5time",
    unread: true,
  },
];

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [items, setItems] = useState(PANEL_NOTIFS);
  const list = tab === "unread" ? items.filter((n) => n.unread) : items;
  const unreadCount = items.filter((n) => n.unread).length;

  const markAll = () => setItems((arr) => arr.map((n) => ({ ...n, unread: false })));

  return (
    <div
      role="dialog"
      aria-label={t("sh.notif.aria")}
      className="fixed left-2 right-2 top-[64px] z-50 w-auto origin-top-right overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40 sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[380px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary/10 via-surface to-surface px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{t("sh.notif.title")}</div>
          <div className="text-[11px] text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} ${t("sh.notif.unreadSuffix")}`
              : t("sh.notif.allRead")}
          </div>
        </div>
        <button
          onClick={markAll}
          disabled={unreadCount === 0}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
        >
          {t("sh.notif.markAll")}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-2 pt-2">
        {(["all", "unread"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === k
                ? "bg-surface-2 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k === "all"
              ? t("sh.notif.all")
              : `${t("sh.notif.unread")}${unreadCount ? ` (${unreadCount})` : ""}`}
          </button>
        ))}
      </div>

      {/* List */}
      <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
        {list.length === 0 ? (
          <li className="px-6 py-10 text-center text-sm text-muted-foreground">
            {t("sh.notif.empty")}
          </li>
        ) : (
          list.map((n) => {
            const Icon = n.icon;
            return (
              <li
                key={n.id}
                className={cn(
                  "group relative flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60",
                  n.unread && "bg-primary/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                    n.tint,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug">
                    {n.actor && <span className="font-medium">{n.actor} </span>}
                    <span className="text-foreground/90">{t(n.titleKey)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {t(n.bodyKey)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{t(n.timeKey)}</div>
                </div>
                {n.unread && (
                  <span
                    aria-label={t("sh.notif.unread")}
                    className="absolute right-3 top-3.5 h-2 w-2 rounded-full bg-primary"
                  />
                )}
              </li>
            );
          })
        )}
      </ul>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border bg-surface-2/40 px-3 py-2">
        <Link
          to="/notifications"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {t("sh.notif.viewAll")}
        </Link>
        <Link
          to="/settings"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <Settings className="h-3.5 w-3.5" /> {t("sh.notif.settings")}
        </Link>
      </div>
    </div>
  );
}

export function AppTopbar({
  variant = "meeting",
  onOpenSidebar,
  onNew,
}: {
  variant?: "meeting" | "documents";
  onOpenSidebar: () => void;
  onNew?: () => void;
}) {
  const { t } = useI18n();
  const [userOpen, setUserOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const calRef = useRef<HTMLDivElement | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const newRef = useRef<HTMLDivElement | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const aiRef = useRef<HTMLDivElement | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!userOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserOpen(false);
    };
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCalOpen(false);
    };
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNewOpen(false);
    };
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAiOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [aiOpen]);

  useEffect(() => {
    if (!notifOpen) return;
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNotifOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [notifOpen]);

  const { collapsed, toggleCollapsed } = useSidebarCollapsed();
  const identity = useCurrentIdentity();

  const navigate = useNavigate();
  const { unreadCount: topbarUnread } = useUnreadNotifications();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchValue, setSearchValue] = useState("");
  // ⌘K is owned globally by <CommandPalette />. Topbar input stays as a
  // standard search field (Enter → /search).

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-6 lg:flex-nowrap lg:gap-4">
      <button
        aria-label="Open sidebar"
        className="rounded-lg p-2 hover:bg-surface-2 lg:hidden"
        onClick={onOpenSidebar}
      >
        <Menu className="h-5 w-5" />
      </button>
      <button
        aria-label={collapsed ? t("sh.menu.expand") : t("sh.menu.collapse")}
        className="hidden rounded-lg p-2 hover:bg-surface-2 lg:block"
        onClick={toggleCollapsed}
      >
        {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </button>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = searchValue.trim();
          navigate({ to: "/search", search: q ? { q } : {} });
        }}
        className="relative order-last w-full min-w-0 flex-1 basis-full sm:order-none sm:basis-auto sm:max-w-2xl"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchInputRef}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder={variant === "documents" ? t("topbar.search.docs") : t("topbar.search")}
          className="w-full rounded-lg bg-surface-2 py-2.5 pl-10 pr-16 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </form>
      <TenantSwitcherSlot />
      {variant === "meeting" ? (
        <>
          <span className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
            <Circle className="h-2 w-2 fill-current" /> {t("nav.live")}
          </span>
          <span className="hidden font-mono text-sm tabular-nums sm:inline">00:28:45</span>
        </>
      ) : (
        <>
          <div className="relative" ref={newRef}>
            <button
              onClick={() => {
                // Khi route cung cấp hành động tạo riêng (Tasks, Documents),
                // nút chính gọi thẳng hành động đó thay vì mở panel Tạo nhanh.
                if (onNew) {
                  onNew();
                  return;
                }
                setNewOpen((v) => !v);
              }}
              aria-haspopup="dialog"
              aria-expanded={onNew ? undefined : newOpen}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:px-3"
            >
              <Plus className="h-4 w-4" />{" "}
              <span className="hidden sm:inline">{t("topbar.new")}</span>
            </button>
            {newOpen && <NewPanel onClose={() => setNewOpen(false)} />}
          </div>
          <div className="relative" ref={aiRef}>
            <button
              onClick={() => setAiOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={aiOpen}
              className={cn(
                "flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-2 text-sm hover:bg-surface-2/70 sm:px-3",
                aiOpen && "ring-1 ring-primary/40",
              )}
            >
              <Sparkles className="h-4 w-4 text-primary" />{" "}
              <span className="hidden sm:inline">AI</span>
            </button>
            {aiOpen && <AIPanel onClose={() => setAiOpen(false)} />}
          </div>
          <Link
            to="/help"
            aria-label={t("sh.aria.help")}
            className="hidden rounded-lg p-2 hover:bg-surface-2 md:block"
          >
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
          </Link>
        </>
      )}
      <LanguageToggle />
      <ToneToggle />
      <ThemeToggle />
      <Link
        to="/settings"
        className="hidden rounded-lg p-2 hover:bg-surface-2 2xl:block"
        aria-label={t("sh.aria.security")}
      >
        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
      </Link>
      <Link
        to="/settings"
        className="hidden rounded-lg p-2 hover:bg-surface-2 2xl:block"
        aria-label={t("sh.aria.settings")}
      >
        <Settings className="h-5 w-5 text-muted-foreground" />
      </Link>
      {variant === "meeting" && (
        <button
          onClick={() => notifyComingSoon()}
          className="hidden items-center gap-1 rounded-lg p-2 hover:bg-surface-2 md:flex"
        >
          <Users className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm">16</span>
        </button>
      )}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setNotifOpen((v) => !v)}
          className={cn("relative rounded-lg p-2 hover:bg-surface-2", notifOpen && "bg-surface-2")}
          aria-label={t("sh.notif.aria")}
          aria-haspopup="dialog"
          aria-expanded={notifOpen}
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {topbarUnread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {topbarUnread > 99 ? "99+" : topbarUnread}
            </span>
          )}
        </button>
        {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
      </div>
      <div className="relative" ref={calRef}>
        <button
          onClick={() => setCalOpen((v) => !v)}
          aria-label={t("sh.cal.aria")}
          aria-haspopup="dialog"
          aria-expanded={calOpen}
          className={cn("rounded-lg p-2 hover:bg-surface-2", calOpen && "bg-surface-2")}
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
            userOpen ? "border-primary/60" : "border-border/60 hover:border-primary/40",
          )}
        >
          <span className="relative">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-xs font-semibold ring-1 ring-border/60"
              aria-hidden
            >
              {identity.initials}
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-2 bg-emerald-400" />
          </span>
          <div className="hidden text-left leading-tight sm:block">
            <div className="whitespace-nowrap text-sm font-semibold">{identity.displayName}</div>
            <div className="whitespace-nowrap text-[11px] text-muted-foreground">
              {identity.roleLabel}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "hidden h-4 w-4 text-muted-foreground transition-transform sm:block",
              userOpen ? "rotate-180 text-primary" : "",
            )}
          />
        </button>

        {userOpen && (
          <div
            role="menu"
            className="fixed left-2 right-2 top-[64px] z-50 w-auto origin-top-right overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40 sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[300px]"
          >
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-border bg-gradient-to-br from-primary/15 via-surface to-surface p-4">
              <span className="relative">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-sm font-semibold ring-2 ring-primary/40"
                  aria-hidden
                >
                  {identity.initials}
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-emerald-400" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="truncate text-sm font-semibold">{identity.displayName}</div>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {identity.tenantName
                    ? `${identity.roleLabel} · ${identity.tenantName}`
                    : identity.roleLabel}
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{identity.email ?? "—"}</span>
                </div>
              </div>
            </div>

            {/* Quick status */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                <span>{t("sh.user.online")}</span>
              </div>
              <button
                onClick={() => notifyComingSoon()}
                className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Moon className="h-3 w-3" /> {t("sh.user.setStatus")}
              </button>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 border-b border-border px-3 py-2.5">
              <Link
                to="/settings"
                search={{ tab: "account" }}
                onClick={() => setUserOpen(false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
              >
                <KeyRound className="h-3.5 w-3.5" /> {t("sh.user.changePw")}
              </Link>
            </div>

            {/* Menu items */}
            <div className="p-1.5">
              <MenuItem
                icon={UserCircle2}
                label={t("sh.user.profile")}
                desc={t("sh.user.profileDesc")}
                onClick={() => setUserOpen(false)}
                to="/settings"
                search={{ tab: "profile" }}
              />
              <MenuItem
                icon={Settings}
                label={t("sh.user.account")}
                desc={t("sh.user.accountDesc")}
                onClick={() => setUserOpen(false)}
                to="/settings"
                search={{ tab: "account" }}
              />
              <MenuItem
                icon={KeyRound}
                label={t("sh.user.changePw")}
                desc={t("sh.user.pwDesc")}
                onClick={() => setUserOpen(false)}
                to="/settings"
                search={{ tab: "password" }}
              />
              <MenuItem
                icon={ShieldCheck}
                label={t("sh.user.privacy")}
                desc={t("sh.user.privacyDesc")}
                onClick={() => setUserOpen(false)}
                to="/settings"
                search={{ tab: "security" }}
              />
              <MenuItem
                icon={CreditCard}
                label={t("sh.user.plan")}
                desc={t("sh.user.planDesc")}
                onClick={() => setUserOpen(false)}
                to="/billing"
              />
              <MenuItem
                icon={HelpCircle}
                label={t("sh.user.help")}
                desc={t("sh.user.helpDesc")}
                onClick={() => setUserOpen(false)}
                to="/help"
              />
            </div>

            {/* Logout */}
            <div className="border-t border-border p-1.5">
              <button
                onClick={() => setUserOpen(false)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                <span className="flex-1 text-left font-medium">{t("sh.user.logout")}</span>
                <span className="text-[11px] text-muted-foreground">⇧⌘Q</span>
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-surface-2/40 px-3 py-2 text-[10px] text-muted-foreground">
              <span>UNIWORK v2.4.1</span>
              <a href="/terms" className="hover:text-foreground" onClick={() => setUserOpen(false)}>
                {t("sh.user.legal")}
              </a>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function MenuItem({
  icon: Icon,
  label,
  desc,
  to,
  search,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  desc?: string;
  to?: string;
  search?: Record<string, unknown>;
  onClick?: () => void;
}) {
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
  const cls =
    "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2";
  if (to)
    return (
      <Link to={to} search={search} onClick={onClick} className={cls}>
        {inner}
      </Link>
    );
  return (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

export function useSidebarState() {
  return useState(false);
}
