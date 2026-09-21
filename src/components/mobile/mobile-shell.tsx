import { useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileText,
  Inbox,
  Mail,
  Menu,
  MessageSquarePlus,
  Search,
  Settings,
  Sparkles,
  Video,
  Workflow,
} from "lucide-react";
import { BrandMark } from "@/components/brand-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { listAiConversations } from "@/lib/api/ai-chat.functions";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { useCurrentIdentity } from "@/lib/use-current-identity";
import { useI18n, type Key } from "@/lib/i18n";

const INBOX_LINKS = [
  { label: "m.nav.attention" as Key, icon: AlertCircle },
  { label: "m.nav.working" as Key, icon: Workflow },
  { label: "m.nav.review" as Key, icon: CheckCircle2 },
];

const LIBRARY_LINKS = [
  { label: "nav.workProducts" as Key, icon: FileText, to: "/m/work-products" },
  { label: "nav.meetings" as Key, icon: Video, to: "/m/meet" },
  { label: "nav.email" as Key, icon: Mail, to: "/m/email" },
  { label: "nav.documents" as Key, icon: FileText, to: "/documents" },
];

export function MobileShell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isNativeRoot = pathname === "/m" || pathname === "/m/" || pathname.startsWith("/m/c/");

  const startNew = () => void navigate({ to: "/m" as never });

  return (
    <div className="flex h-dvh min-h-dvh min-w-0 flex-col overflow-hidden bg-background">
      <header className="z-40 flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-background px-[max(0.75rem,env(safe-area-inset-left))] pb-2 pt-[max(.5rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl" aria-label={t("m.nav.open")} onClick={() => setDrawerOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <button className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 text-left" onClick={startNew}>
          <BrandMark className="h-7 w-7 shrink-0" />
          <span className="truncate text-sm font-semibold tracking-tight">UniWork</span>
        </button>
        <Button variant="ghost" className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium" onClick={startNew}>
          <MessageSquarePlus className="h-4 w-4" />
          {t("m.nav.new")}
        </Button>
      </header>

      <main className={isNativeRoot ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden"}>
        <Outlet />
      </main>
      <NativeDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

function NativeDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const listFn = useServerFn(listAiConversations);
  const identity = useCurrentIdentity();
  const { workspaces, workspaceId, select } = useActiveWorkspace();
  const conversations = useQuery({
    queryKey: ["mobile-ai-conversations", workspaceId],
    queryFn: () => listFn({ data: { workspaceId: workspaceId ?? undefined, limit: 6, sort: "recent" } }),
    enabled: open,
  });

  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to: to as never });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-[min(88vw,360px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[360px]">
        <SheetHeader className="border-b border-border px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] text-left">
          <SheetTitle className="flex items-center gap-2"><BrandMark className="h-7 w-7" /> UniWork</SheetTitle>
          <SheetDescription>{t("m.nav.tagline")}</SheetDescription>
        </SheetHeader>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <DrawerLink icon={MessageSquarePlus} label={t("m.nav.newWork")} onClick={() => go("/m")} strong />
          <DrawerLink icon={Search} label={t("cmd.group.search")} onClick={() => go("/m/search")} />
          <DrawerLink icon={Sparkles} label={t("m.nav.myAi")} onClick={() => go("/m")} />

          {(conversations.data?.conversations.length ?? 0) > 0 && (
            <div className="mt-2 space-y-0.5 border-l border-border pl-3">
              {conversations.data?.conversations.map((conversation) => (
                <button key={conversation.id} onClick={() => go(`/m/c/${conversation.id}`)} className="min-h-10 w-full truncate rounded-lg px-3 text-left text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  {conversation.title}
                </button>
              ))}
            </div>
          )}

          <DrawerSection label={t("m.nav.inbox")}>
            {INBOX_LINKS.map((item) => <DrawerLink key={item.label} icon={item.icon} label={t(item.label)} onClick={() => go("/m/box")} />)}
          </DrawerSection>

          <DrawerSection label={t("m.nav.workspaces")}>
            <DrawerLink icon={Bot} label={t("m.nav.allWorkspaces")} onClick={() => { select(null); onOpenChange(false); }} active={!workspaceId} />
            {workspaces.slice(0, 8).map((workspace) => (
              <button key={workspace.id} onClick={() => { select(workspace.id); onOpenChange(false); }} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm ${workspaceId === workspace.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-primary/70" />
                <span className="truncate">{workspace.name}</span>
              </button>
            ))}
          </DrawerSection>

          <DrawerSection label={t("m.nav.library")}>
            {LIBRARY_LINKS.map((item) => <DrawerLink key={item.to} icon={item.icon} label={t(item.label)} onClick={() => go(item.to)} />)}
          </DrawerSection>
        </nav>

        <button onClick={() => go("/settings")} className="flex min-h-16 items-center gap-3 border-t border-border px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 text-left hover:bg-surface-2">
          <Avatar className="h-9 w-9"><AvatarFallback>{identity.initials}</AvatarFallback></Avatar>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{identity.displayName}</span><span className="block truncate text-xs text-muted-foreground">{identity.tenantName ?? identity.email}</span></span>
          <Settings className="h-4 w-4 text-muted-foreground" />
        </button>
      </SheetContent>
    </Sheet>
  );
}

function DrawerSection({ label, children }: { label: string; children: React.ReactNode }) {
  return <section className="mt-6"><p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p><div className="space-y-0.5">{children}</div></section>;
}

function DrawerLink({ icon: Icon, label, onClick, strong, active }: { icon: typeof Search; label: string; onClick: () => void; strong?: boolean; active?: boolean }) {
  return <button onClick={onClick} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors ${strong ? "bg-primary text-primary-foreground" : active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-surface-2"}`}><Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate font-medium">{label}</span><ChevronRight className="h-3.5 w-3.5 opacity-40" /></button>;
}