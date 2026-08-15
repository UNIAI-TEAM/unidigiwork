import { useActiveWorkspace } from "@/lib/active-workspace";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home,
  MessageSquare,
  CheckSquare,
  Video,
  Mail,
  LayoutGrid,
  Search,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadNotifications } from "@/lib/use-unread-notifications";

const TABS = [
  { id: "home", label: "Home", icon: Home, to: "/m/home" },
  { id: "chat", label: "Chat", icon: MessageSquare, to: "/m/chat" },
  { id: "tasks", label: "Task", icon: CheckSquare, to: "/m/tasks" },
  { id: "meet", label: "Meet", icon: Video, to: "/m/meet" },
  { id: "email", label: "Email", icon: Mail, to: "/m/email" },
];

export function MobileShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isCompose = pathname.startsWith("/m/compose") || pathname.startsWith("/m/email/");
  const hideTabBar = pathname.startsWith("/m/meet/") || isCompose;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MobileTopbar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
      {!hideTabBar && <BottomTabBar activeTab={pathname.split("/")[2] || "home"} />}
    </div>
  );
}

function MobileTopbar() {
  const navigate = useNavigate();
  const { workspaceName, isLoading } = useActiveWorkspace();
  const { unreadCount } = useUnreadNotifications();

  return (
    <header className="sticky top-0 z-40 grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <button
        onClick={() => navigate({ to: "/m/more" })}
        className="flex items-center gap-2"
        aria-label="Menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          U
        </span>
      </button>

      <button className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
        <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-medium">
          {isLoading ? "Đang tải…" : workspaceName ?? "Workspace"}
        </span>
      </button>

      <div className="flex items-center gap-1">
        <Link
          to="/search"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2"
          aria-label="Tìm kiếm"
        >
          <Search className="h-4 w-4" />
        </Link>
        <Link
          to="/notifications"
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2"
          aria-label="Thông báo"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}

function BottomTabBar({ activeTab }: { activeTab: string }) {
  return (
    <nav className="sticky bottom-0 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-4 mb-4 rounded-[32px] border border-border/60 bg-surface/95 backdrop-blur-3xl dock-shadow">
        <ul className="flex h-20 items-center px-2">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            if (tab.id === "tasks") {
              return (
                <li key={tab.id} className="relative flex flex-1 justify-center -top-4">
                  <Link
                    to={tab.to}
                    className="relative flex flex-col items-center justify-center p-2 -m-2"
                    aria-label={tab.label}
                  >
                    <div className="dock-task-glow absolute -bottom-4 h-20 w-20 rounded-full blur-3xl opacity-70" />
                    <span className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-background bg-gradient-to-tr from-primary via-primary to-primary-foreground/25 text-primary-foreground shadow-xl shadow-primary/40 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/50 active:scale-90">
                      <tab.icon className="h-7 w-7" />
                    </span>
                    <span className="absolute -bottom-7 text-[10px] font-bold uppercase tracking-wider text-primary drop-shadow-sm">
                      {tab.label}
                    </span>
                  </Link>
                </li>
              );
            }
            return (
              <li key={tab.id} className="flex-1">
                <Link
                  to={tab.to}
                  className={cn(
                    "flex min-h-[52px] min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl py-4 px-2 transition-all duration-200 ease-out active:scale-95",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-foreground active:bg-primary/15",
                  )}
                  aria-label={tab.label}
                >
                  <tab.icon className={cn("h-6 w-6 transition-transform duration-200", active && "stroke-[2.5px]")} />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                  {active && (
                    <span className="h-1 w-1 rounded-full bg-primary shadow-[0_0_12px_2px_currentColor]" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}


