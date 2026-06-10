import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard, MessageSquare, Video, ListChecks, FileText, BookOpen,
  Workflow, Users, BarChart3, Bot, Plus, Search, Bell, Settings, Calendar,
  ShieldCheck, ChevronDown, MoreHorizontal, MessageCircle, Circle, Cloud,
  Menu, X, HelpCircle, Sparkles,
} from "lucide-react";
import { ThemeToggle } from "@/lib/theme";
import { LanguageToggle, useI18n } from "@/lib/i18n";

export const avatar = (seed: string) =>
  `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear`;

type NavKey = "dashboard" | "chat" | "meetings" | "tasks" | "documents" | "knowledge" | "workflows" | "people" | "reports" | "ai";

function NavItem({ icon: Icon, label, active, chevron, to, badge }: { icon: any; label: string; active?: boolean; chevron?: boolean; to?: string; badge?: ReactNode }) {
  const cls = `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
    active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
  }`;
  const inner = (
    <>
      <Icon className="h-[18px] w-[18px]" />
      <span className="flex-1 text-left">{label}</span>
      {badge}
      {chevron && <ChevronDown className="h-4 w-4 opacity-60" />}
    </>
  );
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  return <button className={cls}>{inner}</button>;
}

function WorkspaceItem({ letter, name, color, active }: { letter: string; name: string; color: string; active?: boolean }) {
  return (
    <button className={`flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm ${active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold text-white ${color}`}>{letter}</span>
      <span>{name}</span>
    </button>
  );
}

export function AppSidebar({ active, open, onClose }: { active: NavKey; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <>
      {open && (
        <button aria-label="Close sidebar" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-surface transition-transform lg:static lg:w-56 lg:translate-x-0 xl:w-64 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">U</div>
          <div className="flex-1 leading-tight">
            <div className="text-base font-bold tracking-wide">UNIWORK</div>
            <div className="text-[10px] text-muted-foreground">Digital Workplace Platform</div>
          </div>
          <button aria-label="Close sidebar" className="rounded p-1 text-muted-foreground hover:bg-surface-2 lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          <NavItem icon={LayoutDashboard} label={t("nav.dashboard")} to="/dashboard" active={active === "dashboard"} />
          <NavItem icon={MessageSquare} label={t("nav.chat")} to="/chat" active={active === "chat"} />
          <NavItem
            icon={Video}
            label={t("nav.meetings")}
            to="/meeting"
            active={active === "meetings"}
            badge={<span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-medium text-success">{t("nav.live")}</span>}
          />
          <NavItem
            icon={ListChecks}
            label={t("nav.tasks")}
            to="/tasks"
            active={active === "tasks"}
            badge={<span className="rounded-full bg-surface-2 px-1.5 text-[10px] text-muted-foreground">7</span>}
          />
          <NavItem icon={FileText} label={t("nav.documents")} to="/documents" active={active === "documents"} />
          <NavItem icon={BookOpen} label={t("nav.knowledge")} to="/knowledge" active={active === "knowledge"} />
          <NavItem icon={Workflow} label={t("nav.workflows")} to="/workflows" active={active === "workflows"} />
          <NavItem icon={Users} label={t("nav.people")} to="/people" active={active === "people"} />
          <NavItem icon={BarChart3} label={t("nav.reports")} to="/reports" active={active === "reports"} />
          <NavItem icon={Bot} label={t("nav.ai")} to="/ai" active={active === "ai"} />

          <div className="flex items-center justify-between px-3 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{t("nav.workspaces")}</span>
            <button className="rounded p-0.5 hover:bg-surface-2"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <WorkspaceItem letter="S" name="STOS Project" color="bg-emerald-500" active />
          <WorkspaceItem letter="U" name="Smart University" color="bg-sky-500" />
          <WorkspaceItem letter="M" name="UNI-HRM" color="bg-rose-500" />
          <WorkspaceItem letter="H" name="Marketing & PM" color="bg-violet-500" />
          <WorkspaceItem letter="D" name="DevOps Team" color="bg-orange-500" />
          <NavItem icon={MoreHorizontal} label={t("nav.more")} />
        </nav>

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
      </aside>
    </>
  );
}

export function AppTopbar({ variant = "meeting", onOpenSidebar, onNew }: { variant?: "meeting" | "documents"; onOpenSidebar: () => void; onNew?: () => void }) {
  const { t } = useI18n();
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-6 lg:flex-nowrap lg:gap-4">
      <button aria-label="Open sidebar" className="rounded-lg p-2 hover:bg-surface-2 lg:hidden" onClick={onOpenSidebar}>
        <Menu className="h-5 w-5" />
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
          <button onClick={onNew} className="hidden items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:flex">
            <Plus className="h-4 w-4" /> {t("topbar.new")}
          </button>
          <button className="hidden items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm sm:flex">
            <Sparkles className="h-4 w-4 text-primary" /> AI
          </button>
          <button className="hidden rounded-lg p-2 hover:bg-surface-2 md:block"><HelpCircle className="h-5 w-5 text-muted-foreground" /></button>
        </>
      )}
      <LanguageToggle />
      <ThemeToggle />
      <button className="hidden rounded-lg p-2 hover:bg-surface-2 2xl:block"><ShieldCheck className="h-5 w-5 text-muted-foreground" /></button>
      <button className="hidden rounded-lg p-2 hover:bg-surface-2 2xl:block"><Settings className="h-5 w-5 text-muted-foreground" /></button>
      {variant === "meeting" && (
        <button className="hidden items-center gap-1 rounded-lg p-2 hover:bg-surface-2 md:flex">
          <Users className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm">16</span>
        </button>
      )}
      <button className="relative rounded-lg p-2 hover:bg-surface-2">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">12</span>
      </button>
      <button className="hidden rounded-lg p-2 hover:bg-surface-2 lg:block"><Calendar className="h-5 w-5 text-muted-foreground" /></button>
      <button className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-surface-2/80 px-2 py-1.5 transition-colors hover:border-primary/40 hover:bg-surface-2">
        <span className="relative">
          <img src={avatar("nguyen-van-a-1")} className="h-9 w-9 rounded-lg bg-surface object-cover ring-1 ring-border/60" alt="Nguyễn Văn A" />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-2 bg-emerald-400" />
        </span>
        <div className="hidden text-left leading-tight sm:block">
          <div className="whitespace-nowrap text-sm font-semibold">Nguyễn Văn A</div>
          <div className="whitespace-nowrap text-[11px] text-muted-foreground">Giám đốc Điều hành</div>
        </div>
        <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
      </button>
    </header>
  );
}

export function useSidebarState() {
  return useState(false);
}