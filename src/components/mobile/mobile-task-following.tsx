import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listTaskFollowingPage, TASK_OPS_STATUSES } from "@/lib/api/task-ops.functions";
import { toggleTaskFollow } from "@/lib/api/tasks.functions";
import { useI18n } from "@/lib/i18n";

const PAGE_SIZE = 25;
type View = "following" | "discover";

export function MobileTaskFollowing() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listTaskFollowingPage);
  const toggleFn = useServerFn(toggleTaskFollow);
  const [view, setView] = useState<View>("following");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [view, status, debounced]);

  const tasks = useQuery({
    queryKey: ["task-following", view, status, debounced, page],
    queryFn: () =>
      listFn({
        data: {
          following: view === "following" ? true : null,
          statuses: status === "all" ? [] : [status as (typeof TASK_OPS_STATUSES)[number]],
          search: debounced,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    staleTime: 20_000,
  });

  const toggle = useMutation({
    mutationFn: ({ taskId, follow }: { taskId: string; follow: boolean }) =>
      toggleFn({ data: { taskId, follow } }),
    onSuccess: async (result, variables) => {
      toast.success(t(result.following ? "m.chat.follow.on" : "m.chat.follow.off"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["task-following"] }),
        queryClient.invalidateQueries({ queryKey: ["task-follow", variables.taskId] }),
      ]);
    },
    onError: () => toast.error(t("m.chat.follow.error")),
  });

  const pages = Math.max(1, Math.ceil((tasks.data?.total ?? 0) / PAGE_SIZE));
  const statusOptions = ["all", "todo", "in_progress", "blocked", "done"] as const;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 overflow-x-hidden px-4 pb-24 pt-3">
      <header className="sticky top-0 z-10 -mx-4 border-b border-border bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <h1 className="text-xl font-semibold">{t("m.following.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("m.following.subtitle")}</p>
      </header>

      <div className="grid grid-cols-2 rounded-xl border border-border bg-surface-2 p-1">
        {(["following", "discover"] as const).map((value) => (
          <Button
            key={value}
            variant={view === value ? "secondary" : "ghost"}
            className="min-h-11 rounded-lg"
            onClick={() => setView(value)}
          >
            {t(`m.following.${value}` as never)}
          </Button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("m.following.search")}
          className="h-11 pl-9 pr-11"
        />
        {search ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-11 w-11"
            onClick={() => setSearch("")}
            aria-label={t("m.tasks.clearSearch")}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {statusOptions.map((value) => (
          <Button
            key={value}
            variant={status === value ? "default" : "outline"}
            className="min-h-11 shrink-0 rounded-full"
            onClick={() => setStatus(value)}
          >
            {t(`m.tasks.status.${value}` as never)}
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("m.following.total").replace("{n}", String(tasks.data?.total ?? 0))}
      </p>

      {tasks.isLoading ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : tasks.isError ? (
        <div className="border-y border-border py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("m.following.error")}</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => void tasks.refetch()}>
            {t("m.tasks.retry")}
          </Button>
        </div>
      ) : !tasks.data?.tasks.length ? (
        <div className="border-y border-dashed border-border py-10 text-center">
          <Bell className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">
            {t(view === "following" ? "m.following.emptyFollowing" : "m.following.emptyDiscover")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("m.following.emptyHint")}</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {tasks.data.tasks.map((task) => {
            const due = task.dueAt
              ? new Date(task.dueAt).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US")
              : t("m.tasks.noDeadline");
            return (
              <li
                key={task.id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border border-border bg-card p-3 shadow-card"
              >
                <button
                  type="button"
                  className="min-h-16 min-w-0 text-left"
                  onClick={() => navigate({ to: "/m/tasks/$id", params: { id: task.id } })}
                >
                  <span className="line-clamp-2 text-sm font-semibold leading-5">{task.title}</span>
                  <span className="mt-1 flex min-w-0 flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {t(`m.tasks.status.${task.status}` as never)}
                    </Badge>
                    <Badge variant="outline" className="max-w-full truncate text-[10px]">
                      {task.assigneeName ?? t("tops.unassigned")}
                    </Badge>
                  </span>
                  <span className="mt-2 block truncate text-xs text-muted-foreground">
                    {task.workspaceName} · {due}
                  </span>
                </button>
                <Button
                  type="button"
                  variant={task.following ? "secondary" : "outline"}
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-full"
                  disabled={toggle.isPending && toggle.variables?.taskId === task.id}
                  aria-label={t(
                    task.following ? "m.chat.follow.unsubscribe" : "m.chat.follow.subscribe",
                  )}
                  aria-pressed={task.following}
                  onClick={() => toggle.mutate({ taskId: task.id, follow: !task.following })}
                >
                  {toggle.isPending && toggle.variables?.taskId === task.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : task.following ? (
                    <BellOff className="h-4 w-4" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                  <span className="sr-only">
                    {t(task.following ? "m.chat.follow.unsubscribe" : "m.chat.follow.subscribe")}
                  </span>
                </Button>
                <p className="col-span-2 text-right text-[11px] text-muted-foreground">
                  {t("m.following.followers").replace("{n}", String(task.followerCount))}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {t("m.tasks.page").replace("{p}", String(page)).replace("{n}", String(pages))}
        </span>
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            aria-label={t("tops.prev")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11"
            disabled={page >= pages}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
            aria-label={t("tops.next")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </main>
  );
}
