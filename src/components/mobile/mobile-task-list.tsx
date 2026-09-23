import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MobileFAB } from "@/components/mobile/mobile-fab";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { listTaskOpsBoard } from "@/lib/api/task-ops.functions";
import { createTask } from "@/lib/api/tasks.functions";
import { useI18n } from "@/lib/i18n";

type Priority = "all" | "low" | "normal" | "high" | "urgent";
type DueFilter = "all" | "overdue" | "today" | "week" | "none";
const PAGE_SIZE = 25;

export function MobileTaskList() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId, workspaces } = useActiveWorkspace();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState<Priority>("all");
  const [due, setDue] = useState<DueFilter>("all");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [createPriority, setCreatePriority] = useState<Exclude<Priority, "all">>("normal");
  const [dueAt, setDueAt] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [debounced, status, priority, due]);

  const board = useQuery({
    queryKey: ["task-ops-board", status, debounced, page],
    queryFn: () =>
      listTaskOpsBoard({
        data: {
          includeDone: status === "all" || status === "done",
          statuses:
            status === "all"
              ? []
              : [status as "todo" | "in_progress" | "blocked" | "done" | "canceled"],
          search: debounced,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const tasks = useMemo(() => {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return (board.data?.tasks ?? []).filter((task) => {
      if (workspaceId && task.workspaceId !== workspaceId) return false;
      if (priority !== "all" && task.priority !== priority) return false;
      if (due === "none" && task.dueAt) return false;
      if (due === "overdue" && !task.overdue) return false;
      if (due === "today" && (!task.dueAt || new Date(task.dueAt) > todayEnd)) return false;
      if (due === "week" && (!task.dueAt || new Date(task.dueAt) > weekEnd)) return false;
      return true;
    });
  }, [board.data?.tasks, due, priority, workspaceId]);

  const createMutation = useMutation({
    mutationFn: () => {
      const targetWorkspace = workspaceId ?? workspaces[0]?.id;
      if (!targetWorkspace) throw new Error(t("m.tasks.noWorkspace"));
      return createTask({
        data: {
          workspaceId: targetWorkspace,
          title: title.trim(),
          description: description.trim() || undefined,
          priority: createPriority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          idempotencyKey: crypto.randomUUID(),
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task-ops-board"] });
      setTitle("");
      setDescription("");
      setDueAt("");
      setCreatePriority("normal");
      setCreateOpen(false);
      toast.success(t("m.tasks.created"));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("m.tasks.createError")),
  });

  const pages = Math.max(1, Math.ceil((board.data?.total ?? 0) / PAGE_SIZE));
  const statusOptions = ["all", "todo", "in_progress", "blocked", "done"] as const;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 overflow-x-hidden px-4 pb-24 pt-3">
      <header className="sticky top-0 z-10 -mx-4 border-b border-border bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <h1 className="text-xl font-semibold">{t("m.tasks.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("m.tasks.subtitle")}</p>
      </header>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("m.tasks.search")}
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
        <Button
          variant={priority !== "all" || due !== "all" ? "default" : "outline"}
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => setFiltersOpen((value) => !value)}
          aria-label={t("m.tasks.filters")}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
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

      {filtersOpen ? (
        <section className="grid gap-3 border-y border-border py-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            {t("m.tasks.priority")}
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              {["all", "low", "normal", "high", "urgent"].map((value) => (
                <option key={value} value={value}>
                  {t(`m.tasks.priority.${value}` as never)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            {t("m.tasks.deadline")}
            <select
              value={due}
              onChange={(event) => setDue(event.target.value as DueFilter)}
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              {["all", "overdue", "today", "week", "none"].map((value) => (
                <option key={value} value={value}>
                  {t(`m.tasks.due.${value}` as never)}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {t("m.tasks.total").replace("{n}", String(board.data?.total ?? 0))}
      </p>
      {board.isLoading ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((value) => (
            <Skeleton key={value} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : board.isError ? (
        <div className="border-y border-border py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("m.tasks.loadError")}</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => void board.refetch()}>
            {t("m.tasks.retry")}
          </Button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="border-y border-dashed border-border py-10 text-center">
          <p className="text-sm font-medium">{t("m.tasks.empty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("m.tasks.emptyHint")}</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {tasks.map((task) => {
            const assignee = task.assignees[0]?.name ?? t("tops.unassigned");
            const dueLabel = task.dueAt
              ? new Date(task.dueAt).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US")
              : t("m.tasks.noDeadline");
            return (
              <MobileListItem
                key={task.id}
                title={task.title}
                subtitle={`${t(`m.tasks.status.${task.status}` as never)} · ${assignee}`}
                meta={`${task.workspaceName} · ${task.overdue ? t("m.tasks.due.overdue") : dueLabel}`}
                priorityBar={task.priority as Exclude<Priority, "all">}
                badge={
                  task.overdue ? (
                    <Badge variant="destructive">{t("m.tasks.due.overdue")}</Badge>
                  ) : undefined
                }
                right={<OpenChatRoomButton kind="task" entityId={task.id} />}
                onClick={() => navigate({ to: "/m/tasks/$id", params: { id: task.id } })}
              />
            );
          })}
        </div>
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

      <MobileFAB label={t("m.tasks.create")} onClick={() => setCreateOpen(true)} />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("m.tasks.create")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t("m.tasks.taskTitle")}
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-11"
                autoFocus
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t("m.tasks.description")}
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-24"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t("m.tasks.priority")}
              <select
                value={createPriority}
                onChange={(event) =>
                  setCreatePriority(event.target.value as Exclude<Priority, "all">)
                }
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              >
                {["low", "normal", "high", "urgent"].map((value) => (
                  <option key={value} value={value}>
                    {t(`m.tasks.priority.${value}` as never)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t("m.tasks.deadline")}
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="h-11"
              />
            </label>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            <Button variant="outline" className="min-h-11" onClick={() => setCreateOpen(false)}>
              {t("m.tasks.cancel")}
            </Button>
            <Button
              className="min-h-11"
              disabled={!title.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {t("m.tasks.createAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
