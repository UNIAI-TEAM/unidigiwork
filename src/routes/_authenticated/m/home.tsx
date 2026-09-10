import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { supabase } from "@/integrations/supabase/client";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { MobileFAB } from "@/components/mobile/mobile-fab";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, CheckSquare, Bell } from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";
import { vi } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";

type Meeting = Database["public"]["Tables"]["meetings"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Notification = Database["public"]["Tables"]["notifications"]["Row"];
type Priority = "low" | "normal" | "high" | "urgent";

export const Route = createFileRoute("/_authenticated/m/home")({
  head: () => ({
    meta: [
      { title: "Trang chủ · UNIWORK" },
      { name: "description", content: "Tổng quan công việc và hoạt động trên UNIWORK mobile." },
      { property: "og:title", content: "Trang chủ · UNIWORK" },
      { property: "og:description", content: "Tổng quan công việc và hoạt động trên UNIWORK mobile." },
    ],
  }),
  component: MobileHomePage,
});

function MobileHomePage() {
  const navigate = useNavigate();
  const { workspaceId } = useActiveWorkspace();

  const { data: summary } = useSuspenseQuery({
    queryKey: ["mobile-home", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return { meetings: [], tasks: [], notifications: [] };
      const { data: user } = await supabase.auth.getUser();
      const [meetings, tasks, notifications] = await Promise.all([
        supabase
          .from("meetings")
          .select("id, title, start_at, status")
          .eq("workspace_id", workspaceId)
          .in("status", ["scheduled", "live"])
          .gte("start_at", new Date().toISOString())
          .order("start_at", { ascending: true })
          .limit(3),
        supabase
          .from("tasks")
          .select("id, title, due_at, status, priority")
          .eq("workspace_id", workspaceId)
          .in("status", ["todo", "in_progress"])
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(3),
        supabase
          .from("notifications")
          .select("id, title, body, is_read, created_at, type")
          .eq("workspace_id", workspaceId)
          .eq("user_id", user.user?.id ?? "")
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
      return {
        meetings: meetings.data ?? [],
        tasks: tasks.data ?? [],
        notifications: notifications.data ?? [],
      };
    },
  });

  const { meetings = [], tasks = [], notifications = [] } = summary ?? {};

  return (
    <div className="flex min-h-full flex-col gap-5 p-4 pb-24">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Hôm nay
          </h2>
          <button
            onClick={() => navigate({ to: "/calendar" })}
            className="text-xs text-primary"
          >
            Lịch
          </button>
        </div>
        {meetings.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
            Không có cuộc họp nào sắp tới.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {meetings.map((m) => (
              <MobileListItem
                key={m.id}
                title={m.title}
                subtitle={formatDateLabel(m.start_at)}
                icon={
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CalendarDays className="h-4 w-4" />
                  </span>
                }
                badge={
                  m.status === "live" ? (
                    <Badge variant="default" className="text-[10px]">
                      Đang diễn ra
                    </Badge>
                  ) : null
                }
                onClick={() => navigate({ to: "/m/meet" as any })}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Việc cần làm
          </h2>
          <button
            onClick={() => navigate({ to: "/m/tasks" as any })}
            className="text-xs text-primary"
          >
            Tất cả
          </button>
        </div>
        {tasks.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
            Không có việc nào đang chờ.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((t) => (
              <MobileListItem
                key={t.id}
                title={t.title}
                subtitle={t.due_at ? formatDateLabel(t.due_at) : "Không hạn"}
                priorityBar={t.priority || "normal"}
                onClick={() => navigate({ to: "/m/tasks" as any })}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Thông báo mới
          </h2>
          <button
            onClick={() => navigate({ to: "/notifications" })}
            className="text-xs text-primary"
          >
            Xem tất cả
          </button>
        </div>
        {notifications.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
            Không có thông báo mới.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map((n) => (
              <MobileListItem
                key={n.id}
                title={n.title}
                subtitle={n.body ?? undefined}
                meta={formatRelative(n.created_at)}
                priorityBar={notifPriority(n.type)}
                icon={
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <Bell className="h-4 w-4" />
                  </span>
                }
                onClick={() => navigate({ to: "/notifications" })}
              />
            ))}
          </div>
        )}
      </section>

      <MobileFAB label="Tạo nhanh" />
    </div>
  );
}

function notifPriority(type: string): Priority {
  if (type === "alert" || type === "mention") return "high";
  if (type === "deadline" || type === "task_overdue") return "urgent";
  return "normal";
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return `Hôm nay, ${format(d, "HH:mm", { locale: vi })}`;
  if (isTomorrow(d)) return `Ngày mai, ${format(d, "HH:mm", { locale: vi })}`;
  return format(d, "EEE, dd/MM HH:mm", { locale: vi });
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm", { locale: vi });
  return format(d, "dd/MM", { locale: vi });
}
