// HOME V2 — Trang chủ điều hành công việc cá nhân (My Work · Upcoming · Work Inbox).
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Inbox, Plus } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { getHomeSummary, type HomeTask, type WorkInboxItem } from "@/lib/api/home.functions";
import { getHomeAiBrief } from "@/lib/api/home-brief.functions";
import { transitionTask } from "@/lib/api/tasks.functions";
import { markNotificationsRead } from "@/lib/api/notifications.functions";
import { setEmailMessagesRead } from "@/lib/api/emails.functions";
import { useActiveTenant } from "@/features/tenants/hooks";
import {
  AiBrief,
  EmptyState,
  InboxRow,
  MyWorkRow,
  PartialNotice,
  SectionCard,
  SkeletonRows,
  TodaySummary,
  UpcomingRow,
  ViewAll,
} from "@/components/home/home-sections";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Trang chủ · Công việc của tôi — UNIWORK" },
      {
        name: "description",
        content:
          "Trang chủ UNIWORK: việc cần xử lý hôm nay, việc quá hạn, cuộc họp sắp tới và hộp việc cần chú ý.",
      },
      { property: "og:title", content: "Trang chủ · Công việc của tôi — UNIWORK" },
      {
        property: "og:description",
        content: "Bắt đầu ngày làm việc với việc cần chú ý, cuộc họp sắp tới và hộp việc hợp nhất.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const qc = useQueryClient();
  const { data: tenant } = useActiveTenant();
  const tenantId = (tenant as { tenantId?: string } | undefined)?.tenantId ?? "none";
  const fetchHome = useServerFn(getHomeSummary);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const homeQuery = useQuery({
    queryKey: ["home", "summary", tenantId],
    queryFn: () => fetchHome(),
    staleTime: 60_000,
  });
  const data = homeQuery.data;

  const fetchBrief = useServerFn(getHomeAiBrief);
  const briefQuery = useQuery({
    queryKey: ["home", "ai-brief", tenantId],
    queryFn: () => fetchBrief(),
    staleTime: 5 * 60_000,
  });
  const brief = briefQuery.data;

  const transition = useServerFn(transitionTask);
  const markRead = useServerFn(markNotificationsRead);
  const markEmailRead = useServerFn(setEmailMessagesRead);
  const router = useRouter();

  const complete = useMutation({
    mutationFn: (t: HomeTask) =>
      transition({
        data: { taskId: t.id, toStatus: "done", idempotencyKey: crypto.randomUUID() },
      }),
    onMutate: (t: HomeTask) => setCompletingId(t.id),
    onSettled: () => setCompletingId(null),
    onSuccess: async () => {
      toast.success("Đã hoàn thành công việc");
      await qc.invalidateQueries({ queryKey: ["home", "summary", tenantId] });
    },
    onError: () => toast.error("Không thể cập nhật công việc. Thử lại sau."),
  });

  const readMutation = useMutation({
    mutationFn: (item: WorkInboxItem) =>
      markRead({ data: { ids: [item.id.replace("notif-", "")] } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["home", "summary", tenantId] });
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Không đánh dấu được. Thử lại sau."),
  });

  // Mở item Work Inbox: đánh dấu đã đọc đúng nguồn rồi điều hướng tới deep link.
  const openInboxItem = async (item: WorkInboxItem) => {
    try {
      if (!item.read) {
        if (item.source === "notification") {
          await markRead({ data: { ids: [item.id.replace("notif-", "")] } });
        } else if (item.source === "email") {
          await markEmailRead({
            data: { message_ids: [item.id.replace("email-", "")], is_read: true },
          });
        }
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["home", "summary", tenantId] }),
          qc.invalidateQueries({ queryKey: ["notifications"] }),
          qc.invalidateQueries({ queryKey: ["unread-counts"] }),
        ]);
      }
    } catch {
      toast.error("Không cập nhật được trạng thái đã đọc.");
    }
    await router.navigate({ to: item.href as never });
  };

  const subtitle = useMemo(() => {
    if (!data) return "Đây là công việc của bạn hôm nay";
    return data.counts.attention > 0
      ? `Bạn có ${data.counts.attention} việc cần chú ý hôm nay`
      : "Hôm nay bạn không có việc gấp";
  }, [data]);

  const failed = homeQuery.isError;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="w-full flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{greeting()}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/tasks"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Công việc
              </Link>
              <Link
                to="/meeting"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-2"
              >
                <Plus className="h-4 w-4" /> Cuộc họp
              </Link>
              <Link
                to="/chat"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-2"
              >
                <Plus className="h-4 w-4" /> Tin nhắn
              </Link>
            </div>
          </header>

          {failed ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted-foreground">
              Không tải được dữ liệu trang chủ.{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => homeQuery.refetch()}
              >
                Thử lại
              </button>
            </div>
          ) : (
            <TodaySummary counts={data?.counts} />
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <SectionCard title="Công việc của tôi" action={<ViewAll to="/tasks" />}>
              {homeQuery.isLoading ? (
                <SkeletonRows rows={4} />
              ) : !data?.myWork.length ? (
                <EmptyRow label="Không có việc cần xử lý 🎉" />
              ) : (
                data.myWork.map((t) => (
                  <MyWorkRow
                    key={t.id}
                    task={t}
                    completing={completingId === t.id}
                    onComplete={(task) => complete.mutate(task)}
                  />
                ))
              )}
            </SectionCard>

            <SectionCard title="Sắp tới" action={<ViewAll to="/calendar" />}>
              {homeQuery.isLoading ? (
                <SkeletonRows rows={3} />
              ) : !data?.upcoming.length ? (
                <EmptyRow label="Không có lịch trong hôm nay và ngày mai" />
              ) : (
                data.upcoming.map((u) => <UpcomingRow key={u.id} item={u} />)
              )}
            </SectionCard>
          </div>

          <SectionCard title="Hộp việc" action={<ViewAll to="/notifications" />}>
            {homeQuery.isLoading ? (
              <SkeletonRows rows={4} />
            ) : !data?.inbox.length ? (
              <EmptyRow label="Không có gì cần bạn xử lý" />
            ) : (
              data.inbox.map((i) => (
                <InboxRow
                    key={i.id}
                    item={i}
                    onOpen={openInboxItem}
                    onMarkRead={(item) => readMutation.mutate(item)}
                  />
              ))
            )}
          </SectionCard>

          <AiBrief
            aiBullets={brief?.available ? brief.bullets : []}
            factBrief={data?.brief ?? []}
            loading={briefQuery.isLoading || briefQuery.isFetching}
            unavailableMessage={brief && !brief.available ? brief.message : null}
            onRefresh={() => briefQuery.refetch()}
            generatedAt={brief?.generatedAt ?? null}
          />

          {data?.partial.length ? (
            <p className="text-xs text-muted-foreground">
              Một số nguồn tạm thời không khả dụng: {data.partial.join(", ")}.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
