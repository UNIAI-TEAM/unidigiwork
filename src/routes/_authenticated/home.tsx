// HOME V2 — Trang chủ điều hành công việc cá nhân (My Work · Upcoming · Work Inbox).
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Inbox, Plus } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import {
  getHomeSummary,
  type HomeSummary,
  type HomeTask,
  type WorkInboxItem,
} from "@/lib/api/home.functions";
import { getHomeAiBrief } from "@/lib/api/home-brief.functions";
import { transitionTask } from "@/lib/api/tasks.functions";
import { markNotificationsRead } from "@/lib/api/notifications.functions";
import { setEmailMessagesRead } from "@/lib/api/emails.functions";
import { useActiveTenant } from "@/features/tenants/hooks";
import { getTaskKind, TASK_KIND_META } from "@/lib/home-task-kind";
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

  const homeKey = ["home", "summary", tenantId] as const;

  // Optimistic: đánh dấu dòng "done" ngay, rollback snapshot nếu RPC lỗi.
  const complete = useMutation({
    mutationFn: (t: HomeTask) =>
      transition({
        data: { taskId: t.id, toStatus: "done", idempotencyKey: crypto.randomUUID() },
      }),
    onMutate: async (t: HomeTask) => {
      setCompletingId(t.id);
      await qc.cancelQueries({ queryKey: homeKey });
      const previous = qc.getQueryData<HomeSummary>(homeKey);
      if (previous) {
        qc.setQueryData<HomeSummary>(homeKey, {
          ...previous,
          myWork: previous.myWork.map((x) =>
            x.id === t.id ? { ...x, status: "done" } : x,
          ),
          counts: {
            ...previous.counts,
            attention: Math.max(0, (previous.counts.attention ?? 0) - 1),
            overdue: Math.max(0, (previous.counts.overdue ?? 0) - (t.overdue_days ? 1 : 0)),
            dueToday: Math.max(
              0,
              (previous.counts.dueToday ?? 0) - (!t.overdue_days && t.due_at ? 1 : 0),
            ),
          },
        });
      }
      return { previous };
    },
    onSettled: () => setCompletingId(null),
    onSuccess: async () => {
      toast.success("Đã hoàn thành công việc");
      await qc.invalidateQueries({ queryKey: homeKey });
    },
    onError: (_e, _t, ctx) => {
      if (ctx?.previous) qc.setQueryData(homeKey, ctx.previous);
      toast.error("Không thể cập nhật công việc. Đã hoàn tác thay đổi.");
    },
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
  const partialSet = useMemo(() => new Set(data?.partial ?? []), [data]);

  // Phím tắt My Work: J/K hoặc mũi tên để chọn dòng, C hoàn thành, O mở chi tiết, R mở trang liên quan.
  const [selectedIdx, setSelectedIdx] = useState(-1);
  // Chọn nhiều dòng để hoàn thành hàng loạt qua command transitionTask.
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const openTasks = useMemo(
    () => (data?.myWork ?? []).filter((t) => t.status !== "done"),
    [data],
  );
  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds]);
  const toggleChecked = (t: HomeTask, next: boolean) =>
    setCheckedIds((prev) => (next ? [...new Set([...prev, t.id])] : prev.filter((x) => x !== t.id)));
  const allChecked = openTasks.length > 0 && checkedIds.length === openTasks.length;

  const bulkComplete = async () => {
    const targets = openTasks.filter((t) => checkedSet.has(t.id));
    if (!targets.length) return;
    setBulkRunning(true);
    let ok = 0;
    let fail = 0;
    for (const t of targets) {
      try {
        await transition({
          data: { taskId: t.id, toStatus: "done", idempotencyKey: crypto.randomUUID() },
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkRunning(false);
    setCheckedIds([]);
    await qc.invalidateQueries({ queryKey: homeKey });
    if (fail === 0) toast.success(`Đã hoàn thành ${ok} công việc`);
    else toast.error(`Hoàn thành ${ok} việc, ${fail} việc lỗi`);
  };

  const stateRef = useRef({ tasks: [] as HomeTask[], idx: -1 });
  stateRef.current = { tasks: data?.myWork ?? [], idx: selectedIdx };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        el &&
        (el.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
          el.closest("[role='dialog']"))
      )
        return;
      const { tasks, idx } = stateRef.current;
      if (!tasks.length) return;
      const key = e.key.toLowerCase();
      if (key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(tasks.length - 1, i + 1));
        return;
      }
      if (key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(0, i <= 0 ? 0 : i - 1));
        return;
      }
      if (idx < 0 || idx >= tasks.length) return;
      const task = tasks[idx];
      if (key === "c") {
        e.preventDefault();
        if (task.status !== "done") complete.mutate(task);
        return;
      }
      if (key === "o" || e.key === "Enter") {
        e.preventDefault();
        void router.navigate({ to: "/tasks/$id", params: { id: task.id } });
        return;
      }
      if (key === "r") {
        e.preventDefault();
        void router.navigate({ to: TASK_KIND_META[getTaskKind(task)].to as never });
        return;
      }
      if (key === "x") {
        e.preventDefault();
        setCheckedIds((prev) =>
          prev.includes(task.id) ? prev.filter((x) => x !== task.id) : [...prev, task.id],
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [complete, router]);

  useEffect(() => {
    document
      .querySelector("[data-mywork-row='selected']")
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

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
            <SectionCard
              title="Công việc của tôi"
              action={
                <div className="flex items-center gap-3">
                  <span className="hidden text-xs text-muted-foreground md:inline">
                    J/K di chuyển · X chọn · C hoàn thành · O mở · R trang liên quan
                  </span>
                  <ViewAll to="/tasks" />
                </div>
              }
            >
              {openTasks.length ? (
                <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-2/60 px-4 py-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-primary"
                      checked={allChecked}
                      onChange={(e) =>
                        setCheckedIds(e.target.checked ? openTasks.map((t) => t.id) : [])
                      }
                      aria-label="Chọn tất cả công việc"
                    />
                    Chọn tất cả
                  </label>
                  <span className="text-xs text-muted-foreground">
                    Đã chọn {checkedIds.length}/{openTasks.length}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    {checkedIds.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setCheckedIds([])}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2"
                      >
                        Bỏ chọn
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={bulkComplete}
                      disabled={!checkedIds.length || bulkRunning}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {bulkRunning ? "Đang xử lý…" : `Hoàn thành ${checkedIds.length || ""}`.trim()}
                    </button>
                  </div>
                </div>
              ) : null}
              {partialSet.has("tasks") ? (
                <PartialNotice
                  label="Không tải được đầy đủ danh sách công việc."
                  onRetry={() => homeQuery.refetch()}
                  retrying={homeQuery.isFetching}
                />
              ) : null}
              {homeQuery.isLoading ? (
                <SkeletonRows rows={4} />
              ) : !data?.myWork.length ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Không có việc cần xử lý"
                  description="Bạn không còn công việc quá hạn hay đến hạn hôm nay. Tạo việc mới hoặc xem toàn bộ danh sách."
                  actions={[
                    { label: "Tạo công việc", to: "/tasks" },
                    { label: "Xem tất cả công việc", to: "/tasks" },
                  ]}
                />
              ) : (
                data.myWork.map((t, i) => (
                  <MyWorkRow
                    key={t.id}
                    task={t}
                    selected={i === selectedIdx}
                    completing={completingId === t.id}
                    checked={checkedSet.has(t.id)}
                    onCheckedChange={toggleChecked}
                    onComplete={(task) => complete.mutate(task)}
                  />
                ))
              )}
            </SectionCard>

            <SectionCard title="Sắp tới" action={<ViewAll to="/calendar" />}>
              {partialSet.has("upcoming") ? (
                <PartialNotice
                  label="Không tải được lịch họp/deadline."
                  onRetry={() => homeQuery.refetch()}
                  retrying={homeQuery.isFetching}
                />
              ) : null}
              {homeQuery.isLoading ? (
                <SkeletonRows rows={3} />
              ) : !data?.upcoming.length ? (
                <EmptyState
                  icon={CalendarClock}
                  title="Không có cuộc họp hay deadline"
                  description="Lịch của bạn trống trong hôm nay và ngày mai. Tạo cuộc họp hoặc mở lịch để xem xa hơn."
                  actions={[
                    { label: "Tạo cuộc họp", to: "/meeting" },
                    { label: "Mở lịch", to: "/calendar" },
                  ]}
                />
              ) : (
                data.upcoming.map((u) => <UpcomingRow key={u.id} item={u} />)
              )}
            </SectionCard>
          </div>

          <SectionCard title="Hộp việc" action={<ViewAll to="/notifications" />}>
            {partialSet.has("unread") ? (
              <PartialNotice
                label="Không lấy được số liệu chưa đọc (nhắc đến, email). Danh sách có thể chưa đầy đủ."
                onRetry={() => homeQuery.refetch()}
                retrying={homeQuery.isFetching}
              />
            ) : null}
            {homeQuery.isLoading ? (
              <SkeletonRows rows={4} />
            ) : !data?.inbox.length ? (
              <EmptyState
                icon={Inbox}
                title="Hộp việc trống"
                description="Không có thông báo, nhắc đến hay email nào đang chờ bạn xử lý."
                actions={[
                  { label: "Xem thông báo", to: "/notifications" },
                  { label: "Mở email", to: "/email" },
                ]}
              />
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
              Một số nguồn tạm thời không khả dụng:{" "}
              {data.partial
                .map((p) =>
                  p === "unread"
                    ? "số liệu chưa đọc"
                    : p === "tasks"
                      ? "công việc"
                      : p === "upcoming"
                        ? "lịch sắp tới"
                        : p,
                )
                .join(", ")}
              . Dữ liệu còn lại vẫn hiển thị bình thường.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
