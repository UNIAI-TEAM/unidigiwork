import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Pin,
  Search,
  Settings,
  Workflow,
} from "lucide-react";
import { BrandMark } from "@/components/brand-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { listAiConversations } from "@/lib/api/ai-chat.functions";
import { getHomeSummary } from "@/lib/api/home.functions";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { useCurrentIdentity } from "@/lib/use-current-identity";
import { localeTag, useI18n, type Key } from "@/lib/i18n";

const INBOX_LINKS = [
  { label: "m.nav.attention" as Key, icon: AlertCircle },
  { label: "m.nav.working" as Key, icon: Workflow },
  { label: "m.nav.review" as Key, icon: CheckCircle2 },
];

const LIBRARY_LINKS = [
  { label: "nav.workProducts" as Key, icon: FileText, to: "/m/work-products" },
  { label: "nav.meetings" as Key, icon: CalendarDays, to: "/m/meet" },
  { label: "nav.documents" as Key, icon: Folder, to: "/documents" },
];

const PINNED_KEY = "uniwork.mobile.pinned-conversations";

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
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl"
          aria-label={t("m.nav.open")}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <button
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 text-left"
          onClick={startNew}
        >
          <BrandMark className="h-7 w-7 shrink-0" />
          <span className="truncate text-sm font-semibold tracking-tight">UniWork</span>
        </button>
        <Button
          variant="ghost"
          className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium"
          onClick={startNew}
        >
          <MessageSquarePlus className="h-4 w-4" />
          {t("m.nav.new")}
        </Button>
      </header>

      <main
        className={
          isNativeRoot
            ? "min-h-0 flex-1 overflow-hidden"
            : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        }
      >
        <Outlet />
      </main>
      <NativeDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

function NativeDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const listFn = useServerFn(listAiConversations);
  const homeFn = useServerFn(getHomeSummary);
  const identity = useCurrentIdentity();
  const { workspaces, workspaceId, select } = useActiveWorkspace();
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PINNED_KEY);
      if (saved) setPinnedIds(JSON.parse(saved) as string[]);
    } catch {
      /* preference only */
    }
  }, []);
  const conversations = useQuery({
    queryKey: ["mobile-ai-conversations", workspaceId],
    queryFn: () =>
      listFn({ data: { workspaceId: workspaceId ?? undefined, limit: 6, sort: "recent" } }),
    enabled: open,
  });
  const home = useQuery({
    queryKey: ["home", "summary", "mobile-drawer"],
    queryFn: () => homeFn(),
    enabled: open,
    staleTime: 60_000,
  });

  const recentConversations = useMemo(() => {
    const rows = conversations.data?.conversations ?? [];
    return [...rows].sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedIds.includes(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });
  }, [conversations.data?.conversations, pinnedIds]);

  const togglePin = (id: string) => {
    setPinnedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try {
        localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      } catch {
        /* preference only */
      }
      return next;
    });
  };

  const inboxCounts = {
    attention: home.data?.counts.attention ?? 0,
    working: home.data?.myWork.filter((task) => task.status === "in_progress").length ?? 0,
    review: home.data?.counts.approvals ?? 0,
  };

  const relativeTime = (value: string) => {
    const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
    const formatter = new Intl.RelativeTimeFormat(localeTag(lang), { numeric: "auto" });
    if (minutes < 60) return formatter.format(-minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (hours < 24) return formatter.format(-hours, "hour");
    return formatter.format(-Math.round(hours / 24), "day");
  };

  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to: to as never });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[min(92vw,400px)] flex-col gap-0 overflow-hidden border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-panel sm:max-w-[400px] [&>button]:right-5 [&>button]:top-[max(1rem,env(safe-area-inset-top))] [&>button]:grid [&>button]:h-11 [&>button]:w-11 [&>button]:place-items-center [&>button]:rounded-xl [&>button]:border [&>button]:border-border [&>button]:opacity-100"
      >
        <SheetHeader className="border-b border-sidebar-border px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-left">
          <SheetTitle className="flex min-h-11 items-center gap-3 pr-14 text-2xl text-sidebar-foreground">
            <BrandMark className="h-9 w-9 shrink-0" /> UniWork
          </SheetTitle>
          <SheetDescription className="text-base text-muted-foreground">
            {t("m.nav.tagline")}
          </SheetDescription>
        </SheetHeader>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <DrawerLink
            icon={MessageSquarePlus}
            label={t("m.nav.newWork")}
            onClick={() => go("/m")}
          />
          <DrawerLink icon={Search} label={t("cmd.group.search")} onClick={() => go("/m/search")} />

          <DrawerSection label={t("m.nav.recent")} action={t("m.nav.viewAll")} onAction={() => go("/m/search")}>
            {recentConversations.map((conversation, index) => (
              <div
                key={conversation.id}
                className="grid min-h-16 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 rounded-xl hover:bg-sidebar-accent"
              >
                <button
                  onClick={() => go(`/m/c/${conversation.id}`)}
                  aria-label={conversation.title}
                  className="contents"
                >
                  {index % 3 === 0 ? (
                    <FileText className="mx-auto h-5 w-5" />
                  ) : index % 3 === 1 ? (
                    <CalendarDays className="mx-auto h-5 w-5" />
                  ) : (
                    <BarChart3 className="mx-auto h-5 w-5" />
                  )}
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-[15px] font-medium">{conversation.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t("m.nav.conversation")} · {relativeTime(conversation.lastMessageAt)}
                    </span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-muted-foreground"
                  onClick={() => togglePin(conversation.id)}
                  aria-label={pinnedIds.includes(conversation.id) ? t("m.nav.unpin") : t("m.nav.pin")}
                >
                  {pinnedIds.includes(conversation.id) ? (
                    <Pin className="fill-primary text-primary" />
                  ) : (
                    <MoreHorizontal />
                  )}
                </Button>
              </div>
            ))}
          </DrawerSection>

          <DrawerSection label={t("m.nav.inbox")}>
            {INBOX_LINKS.map((item, index) => (
              <DrawerLink
                key={item.label}
                icon={item.icon}
                label={t(item.label)}
                onClick={() => go("/m/box")}
                count={[inboxCounts.attention, inboxCounts.working, inboxCounts.review][index]}
                tone={index === 0 ? "danger" : index === 1 ? "brand" : "primary"}
              />
            ))}
          </DrawerSection>

          <DrawerSection label={t("m.nav.workspaces")}>
            <button
              onClick={() => setWorkspacesOpen((value) => !value)}
              className="grid min-h-12 w-full grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 rounded-xl text-left hover:bg-sidebar-accent"
              aria-expanded={workspacesOpen}
            >
              <Building2 className="mx-auto h-5 w-5 text-primary" />
              <span className="truncate text-[15px] font-medium">
                {identity.tenantName ?? t("m.nav.workspaces")}
              </span>
              <ChevronDown className={`mx-auto h-5 w-5 transition-transform ${workspacesOpen ? "" : "-rotate-90"}`} />
            </button>
            {workspacesOpen && (
              <div className="space-y-0.5">
                {workspaces.slice(0, 8).map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => {
                      select(workspace.id);
                      onOpenChange(false);
                    }}
                    className={`grid min-h-11 w-full grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2 rounded-xl text-left text-sm ${workspaceId === workspace.id ? "text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}
                  >
                    <span className="mx-auto h-2.5 w-2.5 rounded-full bg-primary" />
                    <span className="truncate">{workspace.name}</span>
                  </button>
                ))}
              </div>
            )}
          </DrawerSection>

          <DrawerSection label={t("m.nav.library")}>
            {LIBRARY_LINKS.map((item) => (
              <DrawerLink
                key={item.to}
                icon={item.icon}
                label={t(item.label)}
                onClick={() => go(item.to)}
              />
            ))}
          </DrawerSection>
        </nav>

        <button
          onClick={() => go("/settings")}
          className="grid min-h-20 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-t border-sidebar-border px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 text-left hover:bg-sidebar-accent"
        >
          <Avatar className="h-11 w-11">
            <AvatarFallback>{identity.initials}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{identity.displayName}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {identity.tenantName ?? identity.email}
            </span>
          </span>
          <Settings className="mx-auto h-5 w-5 text-muted-foreground" />
        </button>
      </SheetContent>
    </Sheet>
  );
}

function DrawerSection({
  label,
  action,
  onAction,
  children,
}: {
  label: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 border-t border-sidebar-border pt-4">
      <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-1">
        <p className="truncate text-xs font-semibold uppercase text-muted-foreground">{label}</p>
        {action && onAction ? (
          <button onClick={onAction} className="min-h-11 px-2 text-xs font-medium text-primary">
            {action}
          </button>
        ) : null}
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function DrawerLink({
  icon: Icon,
  label,
  onClick,
  strong,
  active,
  count,
  tone = "primary",
}: {
  icon: typeof Search;
  label: string;
  onClick: () => void;
  strong?: boolean;
  active?: boolean;
  count?: number;
  tone?: "danger" | "brand" | "primary";
}) {
  return (
    <button
      onClick={onClick}
      className={`grid min-h-12 w-full grid-cols-[2.75rem_minmax(0,1fr)_auto_2.75rem] items-center gap-2 rounded-xl text-left text-[15px] transition-colors ${strong ? "bg-primary text-primary-foreground" : active ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}
    >
      <Icon className={`mx-auto h-5 w-5 shrink-0 ${tone === "danger" ? "text-destructive" : tone === "brand" ? "text-brand-blue" : count !== undefined ? "text-primary" : ""}`} />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {count !== undefined && count > 0 ? (
        <span className={`grid h-8 min-w-8 place-items-center rounded-full px-2 text-sm font-semibold text-primary-foreground ${tone === "danger" ? "bg-destructive" : tone === "brand" ? "bg-brand-blue" : "bg-primary"}`}>
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
      <ChevronRight className="mx-auto h-4 w-4 opacity-60" />
    </button>
  );
}
