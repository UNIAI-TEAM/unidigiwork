import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { supabase } from "@/integrations/supabase/client";
import { listNotifications, markNotificationsRead } from "@/lib/api/notifications.functions";
import { listWorkDeliverables } from "@/lib/api/work-deliverables.functions";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { SwipeRow } from "@/components/mobile/swipe-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bell, CheckSquare, ExternalLink, FileText, Inbox, Share2 } from "lucide-react";
import { toast } from "sonner";
import coverImage from "@/assets/work-product-cover.jpg";

const TABS = [
  { id: "action", label: "Cần làm" },
  { id: "review", label: "Chờ duyệt" },
  { id: "fyi", label: "Để biết" },
] as const;

type TabId = (typeof TABS)[number]["id"];

type BoxItem = {
  key: string;
  kind: "task" | "product" | "notification";
  title: string;
  subtitle?: string;
  priority?: "low" | "normal" | "high" | "urgent" | null;
  onOpen: () => void;
};

export const Route = createFileRoute("/_authenticated/m/box")({
  head: () => ({
    meta: [
      { title: "My Box · UNIWORK" },
      { name: "description", content: "Hộp việc hợp nhất: cần làm, chờ duyệt và để biết." },
      { property: "og:title", content: "My Box · UNIWORK" },
      {
        property: "og:description",
        content: "Hộp việc hợp nhất: cần làm, chờ duyệt và để biết.",
      },
    ],
  }),
  component: MobileBoxPage,
});

function MobileBoxPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { workspaceId } = useActiveWorkspace();
  const [tab, setTab] = useState<TabId>("action");
  const [hidden, setHidden] = useState<string[]>([]);

  const tasks = useQuery({
    queryKey: ["m-box-tasks", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_at")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .in("status", ["todo", "in_progress", "blocked"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(50);
      return data ?? [];
    },
  });

  const products = useQuery({
    queryKey: ["m-box-products", workspaceId],
    queryFn: () =>
      listWorkDeliverables({
        data: { workspaceId: workspaceId ?? null, status: "IN_REVIEW", limit: 50 },
      } as any),
  });

  const notifications = useQuery({
    queryKey: ["m-box-notifications"],
    queryFn: () => listNotifications(),
  });

  const readMut = useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead({ data: { ids } } as any),
    onSuccess: () => {
      toast.success("Đã đánh dấu đã đọc.");
      void qc.invalidateQueries({ queryKey: ["m-box-notifications"] });
    },
  });

  const doneMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").update({ status: "done" }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Đã hoàn tất công việc.");
      void qc.invalidateQueries({ queryKey: ["m-box-tasks", workspaceId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không cập nhật được."),
  });

  const snoozeMut = useMutation({
    mutationFn: async (id: string) => {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      const { error } = await supabase
        .from("tasks")
        .update({ due_at: next.toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Đã hoãn sang ngày mai.");
      void qc.invalidateQueries({ queryKey: ["m-box-tasks", workspaceId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không hoãn được."),
  });

  const hide = (key: string) => {
    setHidden((prev) => [...prev, key]);
    toast.success("Đã ẩn khỏi hộp hôm nay.");
  };

  const items: BoxItem[] = useMemo(() => {
    if (tab === "action")
      return ((tasks.data as any[]) ?? []).map((t) => ({
        key: t.id,
        kind: "task" as const,
        title: t.title,
        subtitle: t.due_at ? `Hạn ${new Date(t.due_at).toLocaleDateString("vi-VN")}` : "Không hạn",
        priority: t.priority ?? "normal",
        onOpen: () => navigate({ to: "/m/tasks" }),
      }));
    if (tab === "review")
      return ((products.data as any[]) ?? []).map((p) => ({
        key: p.id,
        kind: "product" as const,
        title: p.title,
        subtitle: `${p.business_type} · v${p.current_version ?? 1}`,
        onOpen: () => navigate({ to: "/m/work-products/$id", params: { id: p.id } }),
      }));
    return ((notifications.data as any[]) ?? [])
      .filter((n) => !n.is_read)
      .map((n) => ({
        key: n.id,
        kind: "notification" as const,
        title: n.title ?? "Thông báo",
        subtitle: n.body ?? undefined,
        onOpen: () => readMut.mutate([n.id]),
      }));
  }, [tab, tasks.data, products.data, notifications.data, navigate, readMut]);

  const visibleItems = useMemo(
    () => items.filter((it) => !hidden.includes(it.key)),
    [items, hidden],
  );

  const counts = {
    action: ((tasks.data as any[]) ?? []).length,
    review: ((products.data as any[]) ?? []).length,
    fyi: ((notifications.data as any[]) ?? []).filter((n) => !n.is_read).length,
  };

  const icon = (kind: BoxItem["kind"]) =>
    kind === "task" ? (
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
        <CheckSquare className="h-4 w-4" />
      </span>
    ) : kind === "product" ? (
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-warning/10 text-warning">
        <FileText className="h-4 w-4" />
      </span>
    ) : (
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-muted-foreground">
        <Bell className="h-4 w-4" />
      </span>
    );

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 pb-28">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My Box</h1>
        <p className="text-sm text-muted-foreground">Mọi thứ đang chờ bạn, gom về một hộp.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Mẹo: vuốt phải để duyệt, vuốt trái để hoãn.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-11 rounded-xl px-2 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface-2",
            )}
          >
            {t.label}
            <Badge
              variant={tab === t.id ? "secondary" : "outline"}
              className="ml-1.5 px-1.5 text-[10px]"
            >
              {counts[t.id]}
            </Badge>
          </button>
        ))}
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Inbox className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Hộp này đang trống. Rất tốt!</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {visibleItems.map((it) => (
            <li key={it.key}>
              <SwipeRow
                rightLabel={it.kind === "notification" ? "Đã đọc" : "Duyệt"}
                leftLabel="Hoãn"
                onSwipeRight={() => {
                  if (it.kind === "task") doneMut.mutate(it.key);
                  else if (it.kind === "notification") readMut.mutate([it.key]);
                  else it.onOpen();
                }}
                onSwipeLeft={() => {
                  if (it.kind === "task") snoozeMut.mutate(it.key);
                  else hide(it.key);
                }}
              >
                <div className="flex items-stretch gap-2 bg-background">
                  <MobileListItem
                    title={it.title}
                    subtitle={it.subtitle}
                    icon={icon(it.kind)}
                    priorityBar={it.priority ?? null}
                    onClick={it.onOpen}
                    className="min-h-16 flex-1 rounded-2xl"
                  />
                  {it.kind === "task" && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-auto w-12 shrink-0 rounded-2xl"
                      aria-label="Đánh dấu hoàn tất"
                      onClick={() => doneMut.mutate(it.key)}
                    >
                      <CheckSquare className="h-4 w-4" />
                    </Button>
                  )}
                  {it.kind === "notification" && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-auto w-12 shrink-0 rounded-2xl"
                      aria-label="Đánh dấu đã đọc"
                      onClick={() => readMut.mutate([it.key])}
                    >
                      <Bell className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
