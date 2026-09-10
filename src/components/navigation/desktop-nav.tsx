import { useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useUnreadNotifications } from "@/lib/use-unread-notifications";
import { getMyIsAdmin } from "@/lib/api/admin.functions";
import {
  visibleNavigation,
  isNavItemActive,
  NAV_ICON_CLASS,
  NAV_ICON_STROKE,
  NAV_ICON_STROKE_ACTIVE,
  type NavItem,
  type NavGroupId,
} from "@/config/navigation";

const STORE_KEY = "uniwork:nav-collapsed-groups";

function useCollapsedGroups(activeGroup: NavGroupId | null) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setCollapsed(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* preference only */
    }
  }, []);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        /* preference only */
      }
      return next;
    });
  }, []);

  // Nhóm đang active luôn tự mở.
  const isCollapsed = (id: NavGroupId) => id !== activeGroup && collapsed[id] === true;
  return { isCollapsed, toggle };
}

/**
 * Sidebar navigation V2 — render từ src/config/navigation.ts.
 * Chỉ 1 request bổ sung (kiểm tra quyền quản trị, cache 5 phút).
 */
export function DesktopNavigation({ collapsed }: { collapsed?: boolean }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { unreadCount } = useUnreadNotifications();
  const { data: adminData } = useQuery({
    queryKey: ["admin", "isAdmin"],
    queryFn: () => getMyIsAdmin(),
    staleTime: 5 * 60_000,
  });
  const isAdmin = adminData?.isAdmin === true;
  const groups = visibleNavigation({ isAdmin });
  const activeGroup =
    groups.find((g) => g.items.some((i) => isNavItemActive(i, pathname)))?.group.id ?? null;
  const { isCollapsed, toggle } = useCollapsedGroups(activeGroup);

  const badgeFor = (item: NavItem) => {
    if (collapsed) return null;
    if (item.badge === "notifications" && unreadCount > 0)
      return (
        <span className="rounded-full bg-destructive px-1.5 text-[10px] font-medium text-destructive-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      );
    if (item.badge === "live")
      return (
        <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-medium text-success">
          {t("nav.live")}
        </span>
      );
    return null;
  };

  return (
    <div className="space-y-1">
      {groups.map(({ group, items }) => {
        const groupCollapsed = group.collapsible && isCollapsed(group.id);
        return (
          <div key={group.id} className={cn(!collapsed && "pb-1")}>
            {!collapsed ? (
              group.collapsible ? (
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  aria-expanded={!groupCollapsed}
                  className="module-label flex w-full items-center justify-between rounded-lg px-3 pb-1 pt-3 text-muted-foreground hover:text-foreground"
                >
                  <span>{t(group.labelKey)}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      groupCollapsed && "-rotate-90",
                    )}
                  />
                </button>
              ) : (
                <div className="module-label px-3 pb-1 pt-1 text-muted-foreground">
                  {t(group.labelKey)}
                </div>
              )
            ) : (
              <div className="my-2 h-px bg-border" />
            )}

            {!groupCollapsed &&
              items.map((item) => {
                const active = isNavItemActive(item, pathname);
                const Icon = item.icon;
                const label = t(item.labelKey);
                const cls = cn(
                  "relative flex items-center rounded-lg transition-colors",
                  collapsed
                    ? "w-full justify-center px-2 py-2.5"
                    : "min-h-10 w-full gap-3 px-3 py-2 text-sm",
                  active
                    ? "bg-secondary font-semibold text-primary"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                );
                const link = (
                  <Link
                    to={item.href}
                    className={cls}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? label : undefined}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full bg-primary",
                          collapsed ? "h-5 w-[3px]" : "h-5 w-[3px]",
                        )}
                      />
                    )}
                    <Icon
                      className={cn(NAV_ICON_CLASS, active ? "text-primary" : "text-current")}
                      strokeWidth={active ? NAV_ICON_STROKE_ACTIVE : NAV_ICON_STROKE}
                    />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">{label}</span>
                        {badgeFor(item)}
                      </>
                    )}
                  </Link>
                );
                if (collapsed) {
                  return (
                    <Tooltip key={item.id} delayDuration={0}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{label}</TooltipContent>
                    </Tooltip>
                  );
                }
                return <div key={item.id}>{link}</div>;
              })}
          </div>
        );
      })}
    </div>
  );
}
