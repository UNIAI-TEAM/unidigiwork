import { useStickySearch } from "@/lib/sticky-search";
import { FilterPageHeader } from "@/components/filter-page-header";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { Key } from "@/lib/i18n";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import { listTasks, createTask, transitionTask } from "@/lib/api/tasks.functions";
import { suggestCandidatesForTask } from "@/lib/api/ai-market.functions";
import {
  listTaskViews,
  saveTaskView,
  deleteTaskView,
} from "@/lib/api/task-views.functions";
import {
  Plus,
  Filter,
  Star,
  Settings2,
  MoreHorizontal,
  MessageSquare,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  Calendar,
  BarChart3,
  Users as UsersIcon,
  Upload,
  Download,
  FileText,
  Loader2,
  BookmarkPlus,
  X,
  PanelRightClose,
  Maximize2,
  Minimize2,
  PanelRightOpen,
} from "lucide-react";
import { usePanelCollapse } from "@/hooks/use-panel-collapse";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { isOverdueTask } from "@/lib/metrics";
import { notifyComingSoon } from "@/lib/coming-soon";

type TasksSearch = { filter?: "overdue"; range?: number; ws?: string };

export const Route = createFileRoute("/tasks")({
  validateSearch: (search: Record<string, unknown>): TasksSearch => ({
    filter: search['filter'] === "overdue" ? ("overdue" as const) : undefined,
    range: [7, 30, 90].includes(Number(search['range'])) ? Number(search['range']) : undefined,
    ws: typeof search['ws'] === "string" ? (search['ws'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Tasks & Projects · UNIWORK" },
      {
        name: "description",
        content:
          "Bảng Kanban quản lý công việc, sprint, burndown và AI Project Copilot trên UNIWORK.",
      },
    ],
  }),
  component: TasksPage,
});

// Trạng thái công việc khớp enum task_status trong CSDL.
type Status = "todo" | "in_progress" | "blocked" | "done" | "canceled";
type Priority = "low" | "normal" | "high" | "urgent";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  due_at: string | null;
  updated_at: string;
  row_version: number;
  tags?: string[] | null;
};

const priorityColors: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground border border-border",
  normal: "bg-sky-500/20 text-sky-300 border border-sky-500/30",
  high: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  urgent: "bg-destructive/20 text-destructive border border-destructive/30",
};

const columns: { status: Status; key: Key; barColor: string }[] = [
  { status: "todo", key: "tasks.col.todo", barColor: "bg-muted-foreground" },
  { status: "in_progress", key: "tasks.col.inprogress", barColor: "bg-sky-500" },
  { status: "blocked", key: "tasks.col.blocked", barColor: "bg-destructive" },
  { status: "done", key: "tasks.col.done", barColor: "bg-success" },
  { status: "canceled", key: "tasks.col.canceled", barColor: "bg-muted" },
];

function fmtDate(v: string | null) {
  if (!v) return "";
  return new Date(v).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

// Xuất danh sách công việc đang hiển thị ra CSV (dữ liệu thật, không mock).
function exportTasksCsv(rows: Task[]) {
  if (!rows.length) {
    toast.error("Không có công việc để xuất");
    return;
  }
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["id", "title", "status", "priority", "due_at", "tags", "updated_at"];
  const csv = [
    header.join(","),
    ...rows.map((r) =>
      [r.id, r.title, r.status, r.priority, r.due_at ?? "", (r.tags ?? []).join("|"), r.updated_at]
        .map(esc)
        .join(","),
    ),
  ].join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `tasks-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Đã xuất ${rows.length} công việc`);
}

function TasksPage() {
  const [open, setOpen] = useSidebarState();
  const { t } = useI18n();
  const [tab, setTab] = useState<
    "overview" | "board" | "list" | "timeline" | "calendar" | "reports" | "files"
  >("board");
  const queryClient = useQueryClient();

  const workspaces = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
  });
  const { filter: urlFilter, range: rangeDays, ws: urlWs } = Route.useSearch();
  const tasksSearch = Route.useSearch();
  useStickySearch("tasks", tasksSearch, (saved) =>
    navigateTasks({ to: "/tasks", search: () => saved, replace: true }),
  );
  const [wsId, setWsId] = useState<string | undefined>(undefined);
  // Ưu tiên workspace do dashboard truyền sang để số liệu khớp với thẻ thống kê.
  const activeWs = wsId ?? urlWs ?? workspaces.data?.[0]?.id;
  const activeWsName = (workspaces.data ?? []).find((w) => w.id === activeWs)?.name ?? "";

  const tasksQuery = useQuery({
    queryKey: ["tasks", activeWs],
    enabled: Boolean(activeWs),
    queryFn: async () =>
      (await listTasks({ data: { workspaceId: activeWs!, limit: 200 } })) as unknown as Task[],
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const allTasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);

  // Bộ lọc phân loại: nhãn (tags) + mức ưu tiên
  const navigateTasks = useNavigate();
  const overdueOnly = urlFilter === "overdue";
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [sortBy, setSortBy] = useState<"default" | "priority-desc" | "priority-asc" | "tag-asc" | "tag-desc">(
    "default",
  );
  const allTags = useMemo(
    () => Array.from(new Set(allTasks.flatMap((tk) => tk.tags ?? []))).sort(),
    [allTasks],
  );
  const tasks = useMemo(
    () => {
      const filtered = allTasks.filter(
        (tk) =>
          (!priorityFilter || tk.priority === priorityFilter) &&
          (tagFilter.length === 0 || (tk.tags ?? []).some((x) => tagFilter.includes(x))) &&
          (!rangeDays ||
            Date.now() - new Date(tk.updated_at).getTime() <= rangeDays * 86400_000) &&
          (!overdueOnly || isOverdueTask(tk)),
      );
      if (sortBy === "default") return filtered;
      const rank: Record<Priority, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
      const firstTag = (t: Task) => ((t.tags ?? []).slice().sort()[0] ?? "\uffff").toLowerCase();
      return filtered.slice().sort((a, b) => {
        switch (sortBy) {
          case "priority-desc":
            return rank[b.priority] - rank[a.priority];
          case "priority-asc":
            return rank[a.priority] - rank[b.priority];
          case "tag-asc":
            return firstTag(a).localeCompare(firstTag(b), "vi");
          case "tag-desc":
            return firstTag(b).localeCompare(firstTag(a), "vi");
          default:
            return 0;
        }
      });
    },
    [allTasks, priorityFilter, tagFilter, sortBy, overdueOnly, rangeDays],
  );

  // Bộ lọc đã lưu ("view") theo người dùng
  const viewsQuery = useQuery({ queryKey: ["task-views"], queryFn: () => listTaskViews() });
  const savedViews = viewsQuery.data ?? [];
  const [activeViewId, setActiveViewId] = useState<string>("");
  const saveViewM = useMutation({
    mutationFn: (name: string) =>
      saveTaskView({ data: { name, tags: tagFilter, priority: priorityFilter } }),
    onSuccess: () => {
      toast.success("Đã lưu bộ lọc");
      void queryClient.invalidateQueries({ queryKey: ["task-views"] });
    },
    onError: (e: Error) => toast.error(e.message || "Không lưu được bộ lọc"),
  });
  const deleteViewM = useMutation({
    mutationFn: (viewId: string) => deleteTaskView({ data: { viewId } }),
    onSuccess: () => {
      setActiveViewId("");
      toast.success("Đã xóa bộ lọc");
      void queryClient.invalidateQueries({ queryKey: ["task-views"] });
    },
    onError: (e: Error) => toast.error(e.message || "Không xóa được bộ lọc"),
  });

  // Realtime: mọi thay đổi trên tasks của workspace đang xem sẽ làm mới bảng.
  useEffect(() => {
    if (!activeWs) return;
    const channel = supabase
      .channel(`tasks-board-${activeWs}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${activeWs}` },
        () => queryClient.invalidateQueries({ queryKey: ["tasks", activeWs] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeWs, queryClient]);

  const createMutation = useMutation({
    mutationFn: (p: { status: Status; title: string; priority: Priority }) =>
      createTask({
        data: {
          workspaceId: activeWs!,
          title: p.title,
          priority: p.priority,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: async (_r, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["tasks", activeWs] });
      // Công việc mới → tự động đề xuất ứng viên AI phù hợp theo hồ sơ & kỹ năng.
      const row: any = Array.isArray(_r) ? (_r as any[])[0] : _r;
      if (row?.id) {
        try {
          const res = await suggestCandidatesForTask({ data: { taskId: row.id, limit: 1 } });
          const top = res.suggestions[0];
          if (top) {
            toast.success(`Gợi ý nhân sự AI: ${top.name}`, {
              description: top.reasons.join(" · "),
              action: {
                label: "Xem hồ sơ",
                onClick: () => navigateTasks({ to: "/ai-market/$id", params: { id: top.id } }),
              },
            });
          }
        } catch {
          /* gợi ý là phụ trợ — không chặn luồng tạo việc */
        }
      }
      if (vars.status !== "todo") return;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transitionMutation = useMutation({
    mutationFn: (p: { taskId: string; toStatus: Status }) =>
      transitionTask({
        data: { taskId: p.taskId, toStatus: p.toStatus, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", activeWs] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      todo: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
      canceled: 0,
    };
    for (const tk of tasks) c[tk.status] += 1;
    return c;
  }, [tasks]);
  const total = tasks.length;
  const overdue = tasks.filter(
    (tk) => tk.due_at && tk.status !== "done" && new Date(tk.due_at) < new Date(),
  ).length;
  const progress = total ? Math.round((counts.done / total) * 100) : 0;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="tasks" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TasksTopbar onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            {/* Project header row */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500 text-[11px] font-semibold text-white">
                      {(activeWsName || "S").slice(0, 1).toUpperCase()}
                    </span>
                    {activeWsName || t("tasks.project")}
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  {(workspaces.data ?? []).map((w) => (
                    <DropdownMenuItem
                      key={w.id}
                      onSelect={() => {
                        setWsId(w.id);
                        navigateTasks({
                          to: "/tasks",
                          search: { ...tasksSearch, ws: w.id },
                        });
                      }}
                    >
                      {w.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => navigateTasks({ to: "/workspace" })}>
                    Quản lý workspace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <nav className="flex items-center gap-5 text-sm">
                {(
                  ["overview", "board", "list", "timeline", "calendar", "reports", "files"] as const
                ).map((id) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`-mb-px border-b-2 py-1.5 transition-colors ${tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  >
                    {t(`tasks.tab.${id}` as Key)}
                  </button>
                ))}
              </nav>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-auto rounded-lg p-2 hover:bg-surface-2">
                    <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onSelect={() => {
                      void queryClient.invalidateQueries({ queryKey: ["tasks", activeWs] });
                      toast.success("Đã làm mới danh sách công việc");
                    }}
                  >
                    Làm mới dữ liệu
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exportTasksCsv(tasks)}>
                    Xuất CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => navigateTasks({ to: "/workspace/settings" })}>
                    Cài đặt dự án
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigateTasks({ to: "/workspace/members" })}>
                    Thành viên
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Title row */}
            <FilterPageHeader
              crumbs={[
                { label: "Trang chủ", to: "/tasks" },
                { label: "Công việc", to: "/tasks" },
                {
                  label: overdueOnly
                    ? "Quá hạn"
                    : rangeDays
                      ? `${rangeDays} ngày qua`
                      : "Tất cả",
                },
              ]}
              title={
                overdueOnly
                  ? "Công việc quá hạn"
                  : rangeDays
                    ? `Công việc ${rangeDays} ngày qua`
                    : "Tất cả công việc"
              }
              description={
                overdueOnly
                  ? "Chỉ hiển thị việc đã quá hạn và chưa hoàn thành/huỷ"
                  : rangeDays
                    ? `Việc được cập nhật trong ${rangeDays} ngày gần nhất`
                    : undefined
              }
              chips={[
                ...(overdueOnly
                  ? [
                      {
                        label: "Quá hạn",
                        onClear: () =>
                          navigateTasks({
                            to: "/tasks",
                            search: (p) => ({ range: p.range, ws: p.ws, filter: undefined }),
                          }),
                      },
                    ]
                  : []),
                ...(rangeDays
                  ? [
                      {
                        label: `${rangeDays} ngày qua`,
                        onClear: () =>
                          navigateTasks({
                            to: "/tasks",
                            search: (p) => ({ filter: p.filter === "overdue" ? ("overdue" as const) : undefined, ws: p.ws, range: undefined }),
                          }),
                      },
                    ]
                  : []),
              ]}
            />
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">
                    {workspaces.data?.find((w) => w.id === activeWs)?.name ?? t("tasks.project")}
                  </h1>
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t("tasks.sub")}</p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={activeWs ?? ""}
                  onChange={(e) => setWsId(e.target.value)}
                  disabled={workspaces.isLoading}
                  aria-label="Workspace"
                  className="rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3 focus:outline-none"
                >
                  {workspaces.data?.length ? (
                    workspaces.data.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))
                  ) : (
                    <option value="">Chưa có workspace</option>
                  )}
                </select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={!activeWs}
                      className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3 disabled:opacity-50"
                    >
                      <Settings2 className="h-4 w-4" /> {t("tasks.settings")}{" "}
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onSelect={() =>
                        activeWs && navigateTasks({ to: "/workspace/settings", search: { ws: activeWs } })
                      }
                    >
                      {t("tasks.settings.general")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        activeWs && navigateTasks({ to: "/workspace/members", search: { ws: activeWs } })
                      }
                    >
                      {t("tasks.settings.members")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigateTasks({ to: "/workspace/audit" })}>
                      {t("tasks.settings.audit")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() =>
                        activeWs && navigateTasks({ to: "/workspace/$id", params: { id: activeWs } })
                      }
                    >
                      {t("tasks.settings.overview")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* KPI row */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                label={t("tasks.kpi.progress")}
                value={`${progress}%`}
                footer={
                  <div className="h-1.5 w-full rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                }
              />
              <KpiCard
                label={t("tasks.kpi.tasks")}
                value={String(total)}
                footer={
                  <span className="text-xs text-warning">
                    {overdue} {t("tasks.kpi.overdue")}
                  </span>
                }
              />
              <KpiCard
                label={t("tasks.kpi.completed")}
                value={String(counts.done)}
                valueClass="text-success"
              />
              <KpiCard
                label={t("tasks.kpi.inprogress")}
                value={String(counts.in_progress)}
                valueClass="text-sky-400"
              />
              <KpiCard label={t("tasks.kpi.todo")} value={String(counts.todo)} />
              <KpiCard
                label={t("tasks.kpi.blocked")}
                value={String(counts.blocked)}
                valueClass="text-destructive"
              />
            </div>

            {/* Board */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
              <span className="text-xs font-medium text-muted-foreground">Bộ lọc đã lưu:</span>
              {savedViews.length === 0 ? (
                <span className="text-xs text-muted-foreground">Chưa có view nào</span>
              ) : (
                savedViews.map((v) => {
                  const on = activeViewId === v.id;
                  return (
                    <span
                      key={v.id}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveViewId(v.id);
                          setTagFilter(v.tags);
                          setPriorityFilter((v.priority || "") as Priority | "");
                        }}
                        className="font-medium"
                      >
                        {v.name}
                      </button>
                      <button
                        type="button"
                        aria-label={`Xóa bộ lọc ${v.name}`}
                        disabled={deleteViewM.isPending}
                        onClick={() => deleteViewM.mutate(v.id)}
                        className="opacity-70 hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })
              )}
              <button
                type="button"
                disabled={
                  saveViewM.isPending || (tagFilter.length === 0 && !priorityFilter)
                }
                onClick={() => {
                  const name = window.prompt("Tên bộ lọc:")?.trim();
                  if (name) saveViewM.mutate(name);
                }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                <BookmarkPlus className="h-3.5 w-3.5" /> Lưu bộ lọc hiện tại
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
              <span className="text-xs font-medium text-muted-foreground">Lọc:</span>
              <select
                aria-label="Lọc theo mức ưu tiên"
                value={priorityFilter}
                onChange={(e) => {
                  setActiveViewId("");
                  setPriorityFilter(e.target.value as Priority | "");
                }}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Mọi mức ưu tiên</option>
                <option value="low">Thấp</option>
                <option value="normal">Bình thường</option>
                <option value="high">Cao</option>
                <option value="urgent">Khẩn cấp</option>
              </select>
              <span className="text-xs font-medium text-muted-foreground">Sắp xếp:</span>
              <select
                aria-label="Sắp xếp công việc"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="default">Mặc định</option>
                <option value="priority-desc">Ưu tiên: cao → thấp</option>
                <option value="priority-asc">Ưu tiên: thấp → cao</option>
                <option value="tag-asc">Nhãn: A → Z</option>
                <option value="tag-desc">Nhãn: Z → A</option>
              </select>
              {allTags.length === 0 ? (
                <span className="text-xs text-muted-foreground">Chưa có nhãn nào</span>
              ) : (
                allTags.map((tg) => {
                  const on = tagFilter.includes(tg);
                  return (
                    <button
                      key={tg}
                      onClick={() => {
                        setActiveViewId("");
                        setTagFilter(on ? tagFilter.filter((x) => x !== tg) : [...tagFilter, tg]);
                      }}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                        on
                          ? "bg-primary text-primary-foreground"
                          : "border border-border text-muted-foreground hover:border-primary hover:text-primary"
                      }`}
                    >
                      {tg}
                    </button>
                  );
                })
              )}
              {overdueOnly && (
                <button
                  onClick={() => navigateTasks({ to: "/tasks", search: (p) => ({ range: p.range, ws: p.ws, filter: undefined }) })}
                  className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs text-warning hover:bg-warning/25"
                >
                  Chỉ hiển thị quá hạn <X className="h-3 w-3" />
                </button>
              )}
              {rangeDays && (
                <button
                  onClick={() => navigateTasks({ to: "/tasks", search: (p) => ({ filter: p.filter === "overdue" ? ("overdue" as const) : undefined, ws: p.ws, range: undefined }) })}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs text-primary hover:bg-primary/25"
                >
                  {rangeDays} ngày qua <X className="h-3 w-3" />
                </button>
              )}
              {(tagFilter.length > 0 || priorityFilter) && (
                <button
                  onClick={() => {
                    setTagFilter([]);
                    setPriorityFilter("");
                    setActiveViewId("");
                  }}
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>

            {tasksQuery.isLoading && !tasksQuery.data ? (
              <BoardSkeleton />
            ) : tasksQuery.isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                Không tải được danh sách công việc. Vui lòng thử lại.
              </div>
            ) : (
              <div
                className={`grid grid-cols-1 gap-4 transition-opacity duration-200 md:grid-cols-2 xl:grid-cols-5 ${
                  tasksQuery.isFetching ? "opacity-70" : "opacity-100"
                }`}
              >
                {columns.map((col) => (
                  <BoardColumn
                    key={col.status}
                    col={col}
                    count={counts[col.status]}
                    tasks={tasks.filter((tk) => tk.status === col.status)}
                    disabled={!activeWs || createMutation.isPending}
                    onAdd={(payload) =>
                      createMutation.mutate({ status: col.status, ...payload }, {
                        onSuccess: (res: unknown) => {
                          const id = (res as { task_id?: string } | null)?.task_id;
                          if (id && col.status !== "todo") {
                            transitionMutation.mutate({ taskId: id, toStatus: col.status });
                          }
                        },
                      })
                    }
                    onMove={(taskId, toStatus) => transitionMutation.mutate({ taskId, toStatus })}
                  />
                ))}
              </div>
            )}

            {/* Bottom panels */}
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ProjectOverview
                counts={counts}
                total={total}
                rangeDays={rangeDays}
                onRangeChange={(d) =>
                  navigateTasks({ to: "/tasks", search: { ...tasksSearch, range: d } })
                }
              />
              <BurndownChart tasks={allTasks} />
              <MyTasks tasks={tasks} onViewAll={() => setTab("list")} />
            </div>
          </main>

          <CopilotPanel
            onGantt={() => setTab("timeline")}
            onResource={() => navigateTasks({ to: "/people" })}
            onExport={() => exportTasksCsv(tasks)}
            onImport={() => navigateTasks({ to: "/documents" })}
            onNewTask={() => setTab("board")}
            onViewActivity={() => navigateTasks({ to: "/workspace/audit" })}
          />
        </div>
      </div>
    </div>
  );
}

function TasksTopbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { t } = useI18n();
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-6">
      <AppTopbarStub
        onOpenSidebar={onOpenSidebar}
        newLabel={t("tasks.new")}
        filtersLabel={t("tasks.filters")}
      />
    </header>
  );
}

function AppTopbarStub({
  onOpenSidebar,
  newLabel,
  filtersLabel,
}: {
  onOpenSidebar: () => void;
  newLabel: string;
  filtersLabel: string;
}) {
  // Use shared AppTopbar variant via re-render: simpler — just use AppTopbar variant=documents
  return <AppTopbar variant="documents" onOpenSidebar={onOpenSidebar} />;
}

function KpiCard({
  label,
  value,
  footer,
  valueClass = "",
}: {
  label: string;
  value: string;
  footer?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

type QuickAddPayload = { title: string; priority: Priority };

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface p-3">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j} className="rounded-lg border border-border/60 bg-surface-2/40 p-3">
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardColumn({
  col,
  count,
  tasks,
  disabled,
  onAdd,
  onMove,
}: {
  col: (typeof columns)[number];
  count: number;
  tasks: Task[];
  disabled: boolean;
  onAdd: (p: QuickAddPayload) => void;
  onMove: (taskId: string, toStatus: Status) => void;
}) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface/40 p-3">
      <div className="flex items-center gap-2 px-1">
        <span className={`h-2 w-2 rounded-full ${col.barColor}`} />
        <span className="text-sm font-semibold">{t(col.key)}</span>
        <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted-foreground">
          {count}
        </span>
        <button
          onClick={() => setAdding(true)}
          disabled={disabled}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-surface-2"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {tasks.map((tk) => (
        <TaskCard key={tk.id} task={tk} onMove={onMove} />
      ))}
      {adding ? (
        <QuickAddForm
          onCancel={() => setAdding(false)}
          onSubmit={(p) => {
            onAdd(p);
            setAdding(false);
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          disabled={disabled}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground hover:bg-surface-2"
        >
          <Plus className="h-3.5 w-3.5" /> {t("tasks.add")}
        </button>
      )}
    </div>
  );
}

const priorityOptions: Priority[] = ["low", "normal", "high", "urgent"];

function QuickAddForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (p: QuickAddPayload) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");

  const submit = () => {
    const v = title.trim();
    if (!v) return;
    onSubmit({ title: v, priority });
    setTitle("");
  };

  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-surface p-3 shadow-sm">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") onCancel();
        }}
        placeholder={t("tasks.quick.title")}
        className="w-full rounded-md bg-surface-2 px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <div className="flex items-center gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="flex-1 rounded-md bg-surface-2 px-2 py-1 text-xs hover:bg-surface-3 focus:outline-none"
          aria-label={t("tasks.quick.tag")}
        >
          {priorityOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2"
        >
          {t("tasks.quick.cancel")}
        </button>
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t("tasks.quick.save")}
        </button>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onMove,
}: {
  task: Task;
  onMove: (taskId: string, toStatus: Status) => void;
}) {
  const { t } = useI18n();
  const overdue = task.due_at && task.status !== "done" && new Date(task.due_at) < new Date();
  return (
    <div className="rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-mono">{task.id.slice(0, 8)}</span>
        {task.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
      </div>
      <div className="mt-1 text-sm font-medium leading-snug">{task.title}</div>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
      )}
      {(task.tags?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.tags!.map((tg) => (
            <span
              key={tg}
              className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            >
              {tg}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityColors[task.priority]}`}
        >
          {task.priority}
        </span>
        {task.due_at && (
          <span
            className={`ml-auto flex items-center gap-1 text-[11px] ${overdue ? "text-warning" : "text-muted-foreground"}`}
          >
            <Calendar className="h-3 w-3" /> {fmtDate(task.due_at)}
          </span>
        )}
      </div>
      <select
        value={task.status}
        onChange={(e) => onMove(task.id, e.target.value as Status)}
        aria-label="Chuyển trạng thái"
        className="mt-2 w-full rounded-md bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground hover:bg-surface-3 focus:outline-none"
      >
        {columns.map((c) => (
          <option key={c.status} value={c.status}>
            {t(c.key)}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProjectOverview({
  counts,
  total,
  rangeDays,
  onRangeChange,
}: {
  counts: Record<Status, number>;
  total: number;
  rangeDays?: number | undefined;
  onRangeChange: (d: number | undefined) => void;
}) {
  const { t } = useI18n();
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const segs = [
    { label: t("tasks.col.done"), value: counts.done, pct: pct(counts.done), color: "bg-success" },
    {
      label: t("tasks.col.inprogress"),
      value: counts.in_progress,
      pct: pct(counts.in_progress),
      color: "bg-sky-500",
    },
    {
      label: t("tasks.col.todo"),
      value: counts.todo,
      pct: pct(counts.todo),
      color: "bg-muted-foreground",
    },
    {
      label: t("tasks.col.blocked"),
      value: counts.blocked,
      pct: pct(counts.blocked),
      color: "bg-destructive",
    },
  ];
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("tasks.overview")}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:bg-surface-3">
              {rangeDays ? `${rangeDays} ngày` : t("tasks.sprint")}{" "}
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onRangeChange(undefined)}>Tất cả</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRangeChange(7)}>7 ngày</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRangeChange(30)}>30 ngày</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRangeChange(90)}>90 ngày</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4 flex items-center gap-5">
        <DonutChart segments={segs} total={total} />
        <div className="flex-1 space-y-2 text-xs">
          {segs.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto text-foreground">
                {s.value} ({s.pct}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DonutChart({
  segments,
  total,
}: {
  segments: { pct: number; color: string }[];
  total: number;
}) {
  const { t } = useI18n();
  // Donut dựng từ số liệu thật của workspace đang chọn.
  const varOf: Record<string, string> = {
    "bg-success": "hsl(var(--success))",
    "bg-sky-500": "hsl(var(--primary))",
    "bg-muted-foreground": "hsl(var(--muted-foreground))",
    "bg-destructive": "hsl(var(--destructive))",
  };
  let acc = 0;
  const stops = segments
    .map((s) => {
      const from = acc;
      acc += s.pct;
      return `${varOf[s.color] ?? "hsl(var(--muted))"} ${from}% ${acc}%`;
    })
    .concat(`hsl(var(--surface-2)) ${acc}% 100%`)
    .join(", ");
  const style = { background: `conic-gradient(${stops})` } as React.CSSProperties;
  return (
    <div className="relative h-28 w-28 shrink-0 rounded-full" style={style}>
      <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-surface">
        <div className="text-lg font-bold tabular-nums">{total}</div>
        <div className="text-[10px] text-muted-foreground">{t("tasks.total")}</div>
      </div>
    </div>
  );
}

function BurndownChart({ tasks }: { tasks: Task[] }) {
  const { t } = useI18n();
  // SVG burndown dựng từ dữ liệu thật: 6 mốc theo 6 tuần gần nhất.
  const w = 320,
    h = 140,
    pad = 24;
  const steps = 6;
  const totalCount = tasks.length || 1;
  const now = Date.now();
  const week = 7 * 86_400_000;
  const ideal = Array.from({ length: steps }, (_, i) => 100 - (i * 100) / (steps - 1));
  const completed = Array.from({ length: steps }, (_, i) => {
    const cutoff = now - (steps - 1 - i) * week;
    const done = tasks.filter(
      (tk) => tk.status === "done" && new Date(tk.updated_at).getTime() <= cutoff,
    ).length;
    return Math.round((done / totalCount) * 100);
  });
  const remaining = completed.map((c) => 100 - c);
  const xs = (i: number) => pad + (i * (w - pad * 2)) / (ideal.length - 1);
  const ys = (v: number) => h - pad - (v / 100) * (h - pad * 2);
  const path = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${ys(v)}`).join(" ");
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("tasks.burndown")}</h3>
        <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted-foreground">
          6 tuần gần nhất
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-36 w-full">
        <path
          d={path(ideal)}
          stroke="hsl(var(--muted-foreground))"
          strokeDasharray="4 4"
          fill="none"
        />
        <path d={path(remaining)} stroke="hsl(var(--primary))" strokeWidth="2" fill="none" />
        <path d={path(completed)} stroke="hsl(var(--success))" strokeWidth="2" fill="none" />
      </svg>
      <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 border-t border-dashed border-muted-foreground" />{" "}
          {t("tasks.legend.ideal")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-primary" /> {t("tasks.legend.remaining")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-success" /> {t("tasks.legend.completed")}
        </span>
      </div>
    </section>
  );
}

function MyTasks({ tasks, onViewAll }: { tasks: Task[]; onViewAll: () => void }) {
  const { t } = useI18n();
  const list = tasks.slice(0, 5);
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {t("tasks.mytasks")} ({list.length})
        </h3>
        <button onClick={onViewAll} className="text-xs text-primary hover:underline">
          {t("tasks.viewall")}
        </button>
      </div>
      <div className="mt-2 divide-y divide-border">
        {list.map((tk) => (
          <div key={tk.id} className="flex items-center gap-2 py-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">{tk.id}</span>
            <span className="flex-1 truncate text-foreground">{tk.title}</span>
            <span
              className={`hidden rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline ${priorityColors[tk.priority]}`}
            >
              {tk.priority}
            </span>
            <span className="hidden text-muted-foreground md:inline">{fmtDate(tk.due_at)}</span>
          </div>
        ))}
      </div>
      <button onClick={onViewAll} className="mt-2 w-full rounded-lg py-2 text-center text-xs text-primary hover:bg-primary/10">
        {t("tasks.viewalltasks")}
      </button>
    </section>
  );
}

function CopilotPanel({
  onGantt,
  onResource,
  onExport,
  onImport,
  onNewTask,
  onViewActivity,
}: {
  onGantt: () => void;
  onResource: () => void;
  onExport: () => void;
  onImport: () => void;
  onNewTask: () => void;
  onViewActivity: () => void;
}) {
  const { t } = useI18n();
  const risks = [
    "API Gateway có thể trễ 2 ngày",
    "Thiếu 1 tester cho sprint hiện tại",
    "Tài liệu API chưa được cập nhật",
  ];
  const suggestions = [
    "Ưu tiên hoàn thành API Gateway",
    "Bổ sung 1 tester cho team",
    "Cập nhật tài liệu API Spec",
  ];
  const [collapsed, setCollapsed] = usePanelCollapse("tasks-copilot");

  if (collapsed) {
    return (
      <aside className="hidden w-12 shrink-0 flex-col items-center gap-3 border-l border-border bg-surface py-4 xl:flex">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-expanded={false}
          aria-label="Mở rộng panel AI"
          title="Mở rộng panel AI"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        <Sparkles className="h-4 w-4 text-primary" />
      </aside>
    );
  }

  return (
    <aside className="hidden w-[340px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface xl:flex">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">{t("tasks.copilot")}</h2>
        <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          BETA
        </span>
        <button
          onClick={onNewTask}
          aria-label="Tạo công việc mới"
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-surface-2"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-expanded
          aria-label="Thu gọn panel AI"
          title="Thu gọn panel AI"
          className="rounded p-1 text-muted-foreground hover:bg-surface-2"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>


      <section className="px-5 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{t("tasks.health")}</span>
          <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-medium text-success">
            {t("tasks.health.good")}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("tasks.health.desc")}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-surface-2">
            <div className="h-full w-[75%] rounded-full bg-success" />
          </div>
          <span className="text-xs text-muted-foreground">75%</span>
        </div>
      </section>

      <section className="border-t border-border px-5 py-4">
        <h3 className="mb-2 text-xs font-semibold text-foreground">{t("tasks.risks")}</h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {risks.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" /> {r}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-border px-5 py-4">
        <h3 className="mb-2 text-xs font-semibold text-foreground">{t("tasks.suggest")}</h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {suggestions.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" /> {r}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-border px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold">{t("tasks.activity")}</h3>
          <button onClick={onViewActivity} className="text-[11px] text-primary hover:underline">
            {t("tasks.viewall")}
          </button>
        </div>
        <div className="space-y-3 text-xs">
          <Activity
            seed="phuong-linh"
            name="Phương Linh"
            action="đã cập nhật trạng thái của"
            target="STOS-081 sang Testing"
            time={`2 ${t("tasks.minago")}`}
          />
          <Activity
            seed="tuan-nam-ba"
            name="Tuấn Nam"
            action="đã bình luận vào"
            target="STOS-102"
            time={`15 ${t("tasks.minago")}`}
          />
          <Activity
            seed="duy-anh"
            name="Duy Anh"
            action="đã hoàn thành"
            target="STOS-062"
            time={`1 ${t("tasks.hago")}`}
          />
        </div>
      </section>

      <section className="border-t border-border px-5 py-4">
        <h3 className="mb-3 text-xs font-semibold">{t("tasks.quick")}</h3>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction icon={BarChart3} label={t("tasks.quick.gantt")} onClick={onGantt} />
          <QuickAction icon={UsersIcon} label={t("tasks.quick.resource")} onClick={onResource} />
          <QuickAction icon={Upload} label={t("tasks.quick.import")} onClick={onImport} />
          <QuickAction icon={Download} label={t("tasks.quick.export")} onClick={onExport} />
        </div>
      </section>

      <section className="border-t border-border px-5 py-4">
        <h3 className="mb-2 text-xs font-semibold">{t("tasks.integrations")}</h3>
        <div className="flex items-center gap-2">
          {["G", "Gh", "Fi", "No"].map((s, i) => (
            <div
              key={i}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-xs text-muted-foreground"
            >
              {s}
            </div>
          ))}
          <span className="text-xs text-muted-foreground">+3</span>
        </div>
      </section>
    </aside>
  );
}

function Activity({
  seed,
  name,
  action,
  target,
  time,
}: {
  seed: string;
  name: string;
  action: string;
  target: string;
  time: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <img src={avatar(seed)} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
      <div className="min-w-0">
        <div className="text-foreground">
          <span className="font-medium">{name}</span>{" "}
          <span className="text-muted-foreground">{action}</span>{" "}
          <span className="font-medium">{target}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">{time}</div>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 rounded-lg bg-surface-2 px-2 py-3 text-[10px] text-muted-foreground hover:bg-surface-3 hover:text-foreground">
      <Icon className="h-4 w-4" />
      <span className="text-center leading-tight">{label}</span>
    </button>
  );
}
