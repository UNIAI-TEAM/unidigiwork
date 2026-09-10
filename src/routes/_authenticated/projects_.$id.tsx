// Chi tiết dự án — bảng công việc, tiến độ, ghi chú và gợi ý kỹ năng AI từ Skill Hub.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Folder,
  Loader2,
  ListChecks,
  StickyNote,
  Sparkles,
  AlertTriangle,
  CalendarDays,
  Save,
  GripVertical,
  Search,
  X,
  User,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  getProject,
  updateProject,
  type ProjectRow,
  type ProjectStatus,
} from "@/lib/api/projects.functions";
import { listAiSkills } from "@/lib/api/ai-skills.functions";
import { transitionTask } from "@/lib/api/tasks.functions";

export const Route = createFileRoute("/_authenticated/projects_/$id")({
  component: ProjectDetailPage,
  head: () => ({
    meta: [
      { title: "Chi tiết dự án · UNIWORK" },
      {
        name: "description",
        content: "Xem tiến độ, thời hạn, ghi chú và danh sách công việc thuộc dự án trong UNIWORK.",
      },
      { property: "og:title", content: "Chi tiết dự án · UNIWORK" },
      {
        property: "og:description",
        content: "Tiến độ dự án, công việc liên quan và gợi ý kỹ năng AI trong UNIWORK.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Lập kế hoạch",
  active: "Đang chạy",
  on_hold: "Tạm dừng",
  completed: "Hoàn thành",
  canceled: "Đã hủy",
};

const TASK_GROUPS: { key: string; label: string; dot: string }[] = [
  { key: "in_progress", label: "Đang làm", dot: "bg-primary" },
  { key: "todo", label: "Cần làm", dot: "bg-muted-foreground" },
  { key: "blocked", label: "Bị chặn", dot: "bg-destructive" },
  { key: "done", label: "Hoàn thành", dot: "bg-emerald-500" },
  { key: "canceled", label: "Đã hủy", dot: "bg-muted" },
];

const TASK_STATUS_LABEL: Record<string, string> = {
  todo: "Cần làm",
  in_progress: "Đang làm",
  blocked: "Bị chặn",
  done: "Hoàn thành",
  canceled: "Đã hủy",
};

type SkillRow = {
  id: string;
  name: string;
  description: string;
  kind: string;
  enabled: boolean;
  action_types: string[];
};

const STOPWORDS = new Set([
  "và",
  "của",
  "cho",
  "các",
  "một",
  "dự",
  "án",
  "công",
  "việc",
  "the",
  "for",
  "with",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${tone === "danger" ? "text-destructive" : ""}`}
        suppressHydrationWarning
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ProjectDetailPage() {
  const [open, setOpen] = useSidebarState();
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject({ data: { projectId: id } }),
  });

  const project = query.data?.project as ProjectRow | undefined;
  const tasks = query.data?.tasks ?? [];

  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  useEffect(() => {
    if (project && !notesDirty) setNotes(project.notes ?? "");
  }, [project, notesDirty]);

  const update = useServerFn(updateProject);
  const saveNotes = useMutation({
    mutationFn: async () => update({ data: { projectId: id, notes } }),
    onSuccess: () => {
      setNotesDirty(false);
      toast.success("Đã lưu ghi chú");
      qc.invalidateQueries({ queryKey: ["project", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không lưu được ghi chú"),
  });

  const skillsQuery = useQuery({
    queryKey: ["ai-skills", project?.workspace_id ?? null],
    queryFn: () => listAiSkills({ data: { workspaceId: project?.workspace_id ?? null } }),
    enabled: !!project,
  });

  const stats = useMemo(() => {
    const now = Date.now();
    const done = tasks.filter((t) => t.status === "done").length;
    const overdue = tasks.filter(
      (t) => t.status !== "done" && t.due_at && new Date(t.due_at).getTime() < now,
    ).length;
    const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    return { done, overdue, pct, total: tasks.length };
  }, [tasks]);

  // Bộ lọc + tìm kiếm trong danh sách công việc.
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks)
      for (const a of t.assignees ?? []) map.set(a.id, a.name);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  const hasFilter =
    searchText.trim() !== "" ||
    statusFilter !== "all" ||
    assigneeFilter !== "all" ||
    dueFilter !== "all";

  function clearFilters() {
    setSearchText("");
    setStatusFilter("all");
    setAssigneeFilter("all");
    setDueFilter("all");
  }

  const filteredTasks = useMemo(() => {
    const now = Date.now();
    const weekAhead = now + 7 * 24 * 3600 * 1000;
    const q = searchText.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q && !`${t.title}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (
        assigneeFilter !== "all" &&
        !(t.assignees ?? []).some((a) => a.id === assigneeFilter)
      )
        return false;
      if (dueFilter !== "all") {
        const due = t.due_at ? new Date(t.due_at).getTime() : null;
        if (dueFilter === "overdue" && !(due && due < now && t.status !== "done"))
          return false;
        if (dueFilter === "this_week" && !(due && due >= now && due <= weekAhead))
          return false;
        if (dueFilter === "no_due" && due !== null) return false;
      }
      return true;
    });
  }, [tasks, searchText, statusFilter, assigneeFilter, dueFilter]);

  const grouped = useMemo(() => {
    return TASK_GROUPS.map((g) => ({
      ...g,
      items: filteredTasks.filter((t) => t.status === g.key),
    }));
  }, [filteredTasks]);

  // Kéo thả đổi trạng thái — vẫn đi qua command transitionTask, không ghi thẳng DB.
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const transition = useMutation({
    mutationFn: (p: { taskId: string; toStatus: string }) =>
      transitionTask({
        data: {
          taskId: p.taskId,
          toStatus: p.toStatus as never,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: (_d, p) => {
      toast.success(`Đã chuyển sang “${TASK_STATUS_LABEL[p.toStatus] ?? p.toStatus}”`);
      qc.invalidateQueries({ queryKey: ["project", id] });
    },
    onError: (e: Error) => toast.error(e.message || "Không đổi được trạng thái"),
  });

  function moveTask(taskId: string, toStatus: string) {
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === toStatus) return;
    transition.mutate({ taskId, toStatus });
  }

  const suggestedSkills = useMemo(() => {
    const skills = ((skillsQuery.data ?? []) as unknown as SkillRow[]).filter((s) => s.enabled);
    if (!project || skills.length === 0) return [];
    const corpus = new Set(
      tokenize(
        [project.name, project.description ?? "", ...tasks.slice(0, 40).map((t) => t.title)].join(
          " ",
        ),
      ),
    );
    return skills
      .map((s) => {
        const words = tokenize(`${s.name} ${s.description}`);
        const hits = Array.from(new Set(words.filter((w) => corpus.has(w))));
        return { skill: s, score: hits.length, hits };
      })
      .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
      .slice(0, 5);
  }, [skillsQuery.data, project, tasks]);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar active="projects" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <Link
            to="/projects"
            className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Dự án
          </Link>

          {query.isLoading && (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
            </p>
          )}

          {query.isError && (
            <p className="mt-4 text-sm text-destructive">Không tìm thấy dự án này.</p>
          )}

          {project && (
            <>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="flex items-center gap-2 text-2xl font-bold">
                    <Folder className="h-6 w-6 text-primary" />
                    <span className="min-w-0 break-words">{project.name}</span>
                  </h1>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {project.code && <span className="font-mono">{project.code}</span>}
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {project.start_date ?? "—"} → {project.due_date ?? "—"}
                    </span>
                  </p>
                </div>
                <Badge>{STATUS_LABEL[project.status]}</Badge>
              </div>

              {project.description && (
                <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
                  {project.description}
                </p>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Tiến độ</p>
                  <p className="mt-1 text-xl font-semibold">{stats.pct}%</p>
                  <Progress value={stats.pct} className="mt-2 h-2" />
                </div>
                <StatCard label="Tổng công việc" value={String(stats.total)} />
                <StatCard label="Hoàn thành" value={String(stats.done)} />
                <StatCard
                  label="Quá hạn"
                  value={String(stats.overdue)}
                  tone={stats.overdue > 0 ? "danger" : undefined}
                />
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-3">
                <section className="rounded-xl border border-border bg-card p-4 xl:col-span-2">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <ListChecks className="h-4 w-4 text-primary" /> Công việc (
                    {filteredTasks.length}
                    {hasFilter && `/${tasks.length}`})
                  </h2>
                  {tasks.length === 0 && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Chưa có công việc nào gắn với dự án này.
                    </p>
                  )}
                  {tasks.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                          placeholder="Tìm công việc…"
                          className="pl-9"
                          aria-label="Tìm công việc"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select
                          aria-label="Lọc theo trạng thái"
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="min-h-11 rounded-md border border-border bg-background px-2 text-xs"
                        >
                          <option value="all">Mọi trạng thái</option>
                          {TASK_GROUPS.map((s) => (
                            <option key={s.key} value={s.key}>
                              {TASK_STATUS_LABEL[s.key]}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Lọc theo người phụ trách"
                          value={assigneeFilter}
                          onChange={(e) => setAssigneeFilter(e.target.value)}
                          className="min-h-11 rounded-md border border-border bg-background px-2 text-xs"
                        >
                          <option value="all">Mọi người phụ trách</option>
                          {assigneeOptions.map(([uid, name]) => (
                            <option key={uid} value={uid}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Lọc theo hạn kết thúc"
                          value={dueFilter}
                          onChange={(e) => setDueFilter(e.target.value)}
                          className="min-h-11 rounded-md border border-border bg-background px-2 text-xs"
                        >
                          <option value="all">Mọi hạn</option>
                          <option value="overdue">Quá hạn</option>
                          <option value="this_week">7 ngày tới</option>
                          <option value="no_due">Chưa có hạn</option>
                        </select>
                        {hasFilter && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 gap-1 px-3 text-xs"
                            onClick={clearFilters}
                          >
                            <X className="h-3.5 w-3.5" /> Xóa bộ lọc
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="mt-3 space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Kéo công việc sang nhóm khác để đổi trạng thái. Trên điện thoại, chọn trạng
                      thái trong danh sách thả xuống.
                    </p>
                    {grouped.map((g) => (
                      <div
                        key={g.key}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dropGroup !== g.key) setDropGroup(g.key);
                        }}
                        onDragLeave={() => setDropGroup((c) => (c === g.key ? null : c))}
                        onDrop={(e) => {
                          e.preventDefault();
                          const taskId = dragTaskId || e.dataTransfer.getData("text/plain");
                          setDropGroup(null);
                          setDragTaskId(null);
                          if (taskId) moveTask(taskId, g.key);
                        }}
                        className={`rounded-lg border border-dashed p-2 transition-colors ${
                          dropGroup === g.key ? "border-primary bg-primary/5" : "border-transparent"
                        }`}
                      >
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <span className={`h-2 w-2 rounded-full ${g.dot}`} />
                          {g.label} · {g.items.length}
                        </p>
                        {g.items.length === 0 && (
                          <p className="mt-2 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                            Thả công việc vào đây
                          </p>
                        )}
                        <ul className="mt-2 space-y-2">
                          {g.items.map((t) => {
                            const overdue =
                              t.status !== "done" &&
                              !!t.due_at &&
                              new Date(t.due_at).getTime() < Date.now();
                            return (
                              <li
                                key={t.id}
                                draggable
                                onDragStart={(e) => {
                                  setDragTaskId(t.id);
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", t.id);
                                }}
                                onDragEnd={() => {
                                  setDragTaskId(null);
                                  setDropGroup(null);
                                }}
                                className={`rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40 sm:cursor-grab sm:active:cursor-grabbing ${
                                  dragTaskId === t.id ? "opacity-50" : ""
                                }`}
                              >
                                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                  <Link
                                    to="/tasks/$id"
                                    params={{ id: t.id }}
                                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2"
                                  >
                                    <GripVertical className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                      {t.title}
                                    </span>
                                  </Link>
                                  <span className="flex shrink-0 items-center gap-1.5">
                                    {t.due_at && (
                                      <span
                                        className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}
                                        suppressHydrationWarning
                                      >
                                        {overdue && (
                                          <AlertTriangle className="mr-1 inline h-3 w-3" />
                                        )}
                                        {new Date(t.due_at).toLocaleDateString("vi-VN")}
                                      </span>
                                    )}
                                    <select
                                      aria-label={`Trạng thái: ${t.title}`}
                                      value={t.status}
                                      disabled={transition.isPending}
                                      onChange={(e) => moveTask(t.id, e.target.value)}
                                      className="min-h-11 rounded-md border border-border bg-background px-2 text-xs"
                                    >
                                      {TASK_GROUPS.map((s) => (
                                        <option key={s.key} value={s.key}>
                                          {TASK_STATUS_LABEL[s.key]}
                                        </option>
                                      ))}
                                    </select>
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="space-y-4">
                  <section className="rounded-xl border border-border bg-card p-4">
                    <h2 className="flex items-center gap-2 font-semibold">
                      <StickyNote className="h-4 w-4 text-primary" /> Ghi chú
                    </h2>
                    <Textarea
                      rows={6}
                      className="mt-3"
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setNotesDirty(true);
                      }}
                      placeholder="Ghi chú nội bộ: rủi ro, quyết định, việc cần theo dõi…"
                    />
                    <Button
                      className="mt-3 min-h-11 w-full"
                      disabled={!notesDirty || saveNotes.isPending}
                      onClick={() => saveNotes.mutate()}
                    >
                      {saveNotes.isPending ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-1.5 h-4 w-4" />
                      )}
                      Lưu ghi chú
                    </Button>
                  </section>

                  <section className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="flex items-center gap-2 font-semibold">
                        <Sparkles className="h-4 w-4 text-primary" /> Kỹ năng AI gợi ý
                      </h2>
                      <Link to="/ai-brain/skills" className="text-xs text-primary hover:underline">
                        Skill Hub
                      </Link>
                    </div>
                    {skillsQuery.isLoading && (
                      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Đang tìm kỹ năng…
                      </p>
                    )}
                    {!skillsQuery.isLoading && suggestedSkills.length === 0 && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Chưa có kỹ năng nào đang bật để gợi ý cho dự án này.
                      </p>
                    )}
                    <ul className="mt-3 space-y-2">
                      {suggestedSkills.map(({ skill, score, hits }) => (
                        <li key={skill.id} className="rounded-lg border border-border p-3">
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <p className="min-w-0 flex-1 text-sm font-medium">{skill.name}</p>
                            <Badge variant={score > 0 ? "default" : "outline"} className="shrink-0">
                              {score > 0 ? "Phù hợp" : "Có thể dùng"}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {skill.description}
                          </p>
                          {hits.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Liên quan: {hits.slice(0, 4).join(", ")}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
