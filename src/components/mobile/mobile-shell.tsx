import { useActiveWorkspace } from "@/lib/active-workspace";
import { BrandMark } from "@/components/brand-logo";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home,
  MessageSquare,
  Sparkles,
  Inbox,
  LayoutGrid,
  Search,
  Bell,
  MoreHorizontal,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useUnreadNotifications } from "@/lib/use-unread-notifications";
import { useUnreadCounts } from "@/lib/use-unread-counts";
import { MobileUniCopilotButton } from "@/components/ai/uni-copilot-mobile";
import { useEffect, useRef, useState } from "react";

const TABS = [
  { id: "home", label: "Home", icon: Home, to: "/m/home" },
  { id: "chat", label: "Chat", icon: MessageSquare, to: "/m/chat" },
  // Nút W ở giữa: mở My AI (đội ngũ AI của bạn).
  { id: "ai", label: "My AI", icon: Sparkles, to: "/m/ai" },
  { id: "box", label: "My Box", icon: Inbox, to: "/m/box" },
  { id: "more", label: "More", icon: MoreHorizontal, to: "/m/more" },
];


const SWIPE_THRESHOLD = 72;

export function MobileShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isCompose = pathname.startsWith("/m/compose") || pathname.startsWith("/m/email/");
  const hideTabBar = pathname.startsWith("/m/meet/") || isCompose;
  const activeTab = pathname.split("/")[2] || "home";
  const isTab = TABS.some((t) => t.id === activeTab);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MobileTopbar />
      <SwipeableMain className="flex-1" activeTab={activeTab} enabled={isTab && !hideTabBar}>
        <Outlet />
      </SwipeableMain>
      {!hideTabBar && <BottomTabBar activeTab={activeTab} />}
    </div>
  );
}

function SwipeableMain({
  children,
  className,
  activeTab,
  enabled,
}: {
  children: React.ReactNode;
  className?: string;
  activeTab: string;
  enabled: boolean;
}) {
  const navigate = useNavigate();
  const [start, setStart] = useState<{ x: number; y: number; pointerId: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const directionRef = useRef<1 | -1 | null>(null);
  const activeIndex = TABS.findIndex((t) => t.id === activeTab);

  useEffect(() => {
    setStart(null);
    setOffset(0);
    setIsAnimating(false);
    directionRef.current = null;
  }, [activeTab]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled || isAnimating || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setStart({ x: e.clientX, y: e.clientY, pointerId: e.pointerId });
    setOffset(0);
    setIsAnimating(false);
    directionRef.current = null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled || !start || isAnimating || e.pointerId !== start.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > 8) {
      directionRef.current = dx > 0 ? -1 : 1;
      setOffset(dx);
    }
  };

  const reset = (target?: HTMLElement) => {
    setIsAnimating(true);
    setOffset(0);
    setTimeout(() => {
      setIsAnimating(false);
      setStart(null);
      directionRef.current = null;
    }, 220);
    if (target) {
      try {
        target.releasePointerCapture(start?.pointerId ?? -1);
      } catch {
        // capture may already be released
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!enabled || !start || e.pointerId !== start.pointerId) return;
    const dir = directionRef.current;
    if (dir && Math.abs(offset) > SWIPE_THRESHOLD) {
      const targetIndex = dir === 1 ? activeIndex + 1 : activeIndex - 1;
      if (targetIndex >= 0 && targetIndex < TABS.length) {
        setIsAnimating(true);
        setOffset(0);
        navigate({ to: TABS[targetIndex].to, replace: true });
      } else {
        reset(e.currentTarget as HTMLElement);
      }
    } else {
      reset(e.currentTarget as HTMLElement);
    }
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    reset(e.currentTarget as HTMLElement);
  };

  return (
    <main
      className={cn("overflow-y-auto overflow-x-hidden relative", className)}
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div
        className={cn("min-h-full", isAnimating && "transition-transform duration-200 ease-out")}
        style={{
          transform: offset || isAnimating ? `translateX(${offset}px)` : undefined,
        }}
      >
        {children}
      </div>
    </main>
  );
}

function MobileTopbar() {
  const navigate = useNavigate();
  const { workspaceName, workspaceId, isLoading } = useActiveWorkspace();
  const { unreadCount } = useUnreadNotifications();

  return (
    <header className="sticky top-0 z-40 grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <button
        onClick={() => navigate({ to: "/m/more" })}
        className="flex items-center gap-2"
        aria-label="Menu"
      >
        <BrandMark className="h-8 w-8" />
      </button>

      <button
        onClick={() => navigate({ to: "/workspace" })}
        className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
      >
        <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-medium">
          {isLoading ? "Đang tải…" : (workspaceName ?? "Workspace")}
        </span>
      </button>

      <div className="flex items-center gap-1">
        <MobileUniCopilotButton workspaceId={workspaceId ?? null} />
        <Link
          to="/m/search"
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
  const { chatUnread, emailUnread, refreshUnread } = useUnreadCounts();

  // Mở tab Chat/Email → làm mới badge ngay và sau khi trang kịp đánh dấu đã đọc.
  useEffect(() => {
    if (activeTab !== "chat" && activeTab !== "email") return;
    refreshUnread();
    const t = setTimeout(() => refreshUnread(), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const badgeFor = (id: string) => (id === "chat" ? chatUnread : id === "email" ? emailUnread : 0);
  return (
    <nav className="sticky bottom-0 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-4 mb-4 rounded-[32px] border border-border/60 bg-surface/95 backdrop-blur-3xl dock-shadow">
        <ul className="flex h-20 items-center px-2">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            if (tab.id === "ai") {
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
                    "relative flex min-h-[52px] min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl py-4 px-2 transition-all duration-200 ease-out active:scale-95",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-foreground active:bg-primary/15",
                  )}
                  aria-label={
                    badgeFor(tab.id) > 0 ? `${tab.label}, ${badgeFor(tab.id)} chưa đọc` : tab.label
                  }
                >
                  <span className="relative">
                    <tab.icon
                      className={cn(
                        "h-6 w-6 transition-transform duration-200",
                        active && "stroke-[2.5px]",
                      )}
                    />
                    {badgeFor(tab.id) > 0 && (
                      <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-surface bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground shadow-sm">
                        {badgeFor(tab.id) > 99 ? "99+" : badgeFor(tab.id)}
                      </span>
                    )}
                  </span>
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
