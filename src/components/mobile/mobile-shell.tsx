import { useRef, useState } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Menu,
  Plus,
  Search,
  Settings,
  Workflow,
} from "lucide-react";
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
import { useI18n, type Key } from "@/lib/i18n";
import { toMobileHref } from "@/lib/mobile-routes";

const INBOX_LINKS = [
  { label: "m.nav.attention" as Key, icon: AlertCircle },
  { label: "m.nav.working" as Key, icon: Workflow },
  { label: "m.nav.review" as Key, icon: CheckCircle2 },
];

const LIBRARY_LINKS = [
  { label: "nav.workProducts" as Key, icon: FileText, to: "/m/work-products" },
  { label: "nav.meetings" as Key, icon: CalendarDays, to: "/m/meet" },
  { label: "nav.documents" as Key, icon: Folder, to: "/m/documents" },
];

export function MobileShell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isNativeRoot = pathname === "/m" || pathname === "/m/" || pathname.startsWith("/m/c/");

  const startNew = () => void navigate({ to: "/m" as never });

  const keepNavigationNative = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || anchor.target === "_blank" || event.metaKey || event.ctrlKey) return;
    const url = new URL(anchor.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    const currentHref = `${url.pathname}${url.search}${url.hash}`;
    const mobileHref = toMobileHref(currentHref);
    if (mobileHref === currentHref) return;
    event.preventDefault();
    void navigate({ to: mobileHref as never });
  };

  return (
    <div
      onClickCapture={keepNavigationNative}
      className="flex h-dvh min-h-dvh min-w-0 flex-col overflow-hidden bg-background"
    >
      <header className="z-40 flex min-h-16 shrink-0 items-center gap-2 bg-background px-[max(0.75rem,env(safe-area-inset-left))] pb-2 pt-[max(.5rem,env(safe-area-inset-top))]">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          aria-label={t("m.nav.open")}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <button
          className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-1 text-center"
          onClick={startNew}
        >
          <span className="truncate text-base font-semibold">UniWork</span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full hover:bg-surface-2"
          onClick={() => void navigate({ to: "/m/search" as never })}
          aria-label={t("cmd.group.search")}
          title={t("cmd.group.search")}
        >
          <Search className="h-6 w-6" strokeWidth={2.25} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full hover:bg-surface-2"
          onClick={startNew}
          aria-label={t("m.nav.newWork")}
          title={t("m.nav.newWork")}
        >
          <Plus className="h-6 w-6" strokeWidth={2.25} />
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
  const { t } = useI18n();
  const navigate = useNavigate();
  const listFn = useServerFn(listAiConversations);
  const homeFn = useServerFn(getHomeSummary);
  const identity = useCurrentIdentity();
  const { workspaces, workspaceId, select } = useActiveWorkspace();
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const swipeStartX = useRef<number | null>(null);
  const swipeDistance = useRef(0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const conversations = useQuery({
    queryKey: ["mobile-ai-conversations"],
    queryFn: () => listFn({ data: { limit: 6, sort: "recent" } }),
    enabled: open,
  });
  const home = useQuery({
    queryKey: ["home", "summary", "mobile-drawer"],
    queryFn: () => homeFn(),
    enabled: open,
    staleTime: 60_000,
  });

  const inboxCounts = {
    attention: home.data?.counts.attention ?? 0,
    working: home.data?.myWork.filter((task) => task.status === "in_progress").length ?? 0,
    review: home.data?.counts.approvals ?? 0,
  };

  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to: to as never });
  };

  const startSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    swipeStartX.current = event.clientX;
    swipeDistance.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    if (swipeStartX.current === null || !drawerRef.current) return;
    const distance = Math.min(0, event.clientX - swipeStartX.current);
    swipeDistance.current = distance;
    drawerRef.current.style.transform = `translateX(${distance}px)`;
    drawerRef.current.style.transition = "none";
  };

  const endSwipe = () => {
    if (!drawerRef.current || swipeStartX.current === null) return;
    const shouldClose = swipeDistance.current < -72;
    drawerRef.current.style.transform = "";
    drawerRef.current.style.transition = "";
    swipeStartX.current = null;
    swipeDistance.current = 0;
    if (shouldClose) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={drawerRef}
        showClose={false}
        side="left"
        onPointerDown={startSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={endSwipe}
        className="flex w-[86vw] max-w-[360px] touch-pan-y flex-col gap-0 overflow-hidden border-mobile-menu-border bg-mobile-menu p-0 text-mobile-menu-foreground shadow-panel"
      >
        <SheetHeader className="px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-left">
          <SheetTitle className="flex min-h-11 items-center text-xl text-mobile-menu-foreground">
            UniWork
          </SheetTitle>
          <SheetDescription className="sr-only">{t("m.nav.tagline")}</SheetDescription>
        </SheetHeader>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
          <DrawerLink icon={Plus} label={t("m.nav.newWork")} onClick={() => go("/m")} />


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
              className="grid min-h-12 w-full grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-1 rounded-lg text-left hover:bg-mobile-menu-accent"
              aria-expanded={workspacesOpen}
            >
              <Building2 className="mx-auto h-5 w-5" />
              <span className="truncate text-[15px] font-medium">
                {identity.tenantName ?? t("m.nav.workspaces")}
              </span>
              <ChevronDown
                className={`mx-auto h-5 w-5 transition-transform ${workspacesOpen ? "" : "-rotate-90"}`}
              />
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
                    className={`grid min-h-11 w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-1 rounded-lg text-left text-sm ${workspaceId === workspace.id ? "bg-mobile-menu-accent text-mobile-menu-foreground" : "text-mobile-menu-muted hover:bg-mobile-menu-accent hover:text-mobile-menu-foreground"}`}
                  >
                    <span className="mx-auto h-2.5 w-2.5 rounded-full bg-mobile-menu-foreground" />
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

          <DrawerSection label={t("m.nav.recent")}>
            {(conversations.data?.conversations ?? []).map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => go(`/m/c/${conversation.id}`)}
                aria-label={conversation.title}
                className="grid min-h-11 w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center rounded-lg px-2 text-left hover:bg-mobile-menu-accent"
              >
                <span className="block min-w-0 truncate text-[15px] font-normal">
                  {conversation.title}
                </span>
              </button>
            ))}
          </DrawerSection>
        </nav>

        <button
          onClick={() => go("/m/settings")}
          className="relative grid w-full min-w-0 min-h-20 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-t border-mobile-menu-border px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 text-left hover:bg-mobile-menu-accent"
        >
          <Avatar className="h-11 w-11">
            <AvatarFallback>{identity.initials}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{identity.displayName}</span>
            <span className="block truncate text-xs text-mobile-menu-muted">
              {identity.tenantName ?? identity.email}
            </span>
          </span>
          <Settings className="mx-auto h-5 w-5 text-mobile-menu-muted" />
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
    <section className="mt-6">
      <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-1">
        <p className="truncate text-sm font-semibold text-mobile-menu-foreground">{label}</p>
        {action && onAction ? (
          <button onClick={onAction} className="min-h-11 px-2 text-xs text-mobile-menu-muted">
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
      className={`grid min-h-12 w-full grid-cols-[2.5rem_minmax(0,1fr)_auto_2.5rem] items-center gap-1 rounded-lg text-left text-[15px] transition-colors ${strong || active ? "bg-mobile-menu-accent text-mobile-menu-foreground" : "text-mobile-menu-foreground hover:bg-mobile-menu-accent"}`}
    >
      <Icon className="mx-auto h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {count !== undefined && count > 0 ? (
        <span className="grid h-7 min-w-7 place-items-center rounded-full bg-mobile-menu-foreground px-2 text-xs font-semibold text-mobile-menu">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
      <ChevronRight className="mx-auto h-4 w-4 opacity-60" />
    </button>
  );
}
