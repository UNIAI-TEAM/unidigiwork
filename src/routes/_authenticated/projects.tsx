// Dự án — danh sách dự án theo không gian làm việc (tenant-scoped, RLS).
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Folder, Plus, Search, Loader2, Pencil, Trash2, ChevronRight } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  PROJECT_STATUSES,
  type ProjectStatus,
  type ProjectWithStats,
} from "@/lib/api/projects.functions";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
  head: () => ({
    meta: [
      { title: "Dự án · UNIWORK" },
      {
        name: "description",
        content:
          "Quản lý dự án của tổ chức: tiến độ công việc, trạng thái, thời hạn và người phụ trách.",
      },
      { property: "og:title", content: "Dự án · UNIWORK" },
      {
        property: "og:description",
        content: "Theo dõi tiến độ dự án và công việc liên quan trong UNIWORK.",
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

const STATUS_VARIANT: Record<ProjectStatus, "default" | "secondary" | "outline" | "destructive"> = {
  planning: "outline",
  active: "default",
  on_hold: "secondary",
  completed: "secondary",
  canceled: "destructive",
};

type Draft = {
  id: string | null;
  name: string;
  code: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
  dueDate: string;
};

const emptyDraft = (): Draft => ({
  id: null,
  name: "",
  code: "",
  description: "",
  status: "planning",
  startDate: "",
  dueDate: "",
});

function ProjectsPage() {
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);

  const wsQuery = useQuery({ queryKey: ["my-workspaces"], queryFn: () => listMyWorkspaces() });
  const workspaces = (wsQuery.data ?? []) as { id: string; name: string }[];
  const activeWs = workspaceId || workspaces[0]?.id || "";

  const projectsQuery = useQuery({
    queryKey: ["projects", activeWs],
    queryFn: () => listProjects({ data: { workspaceId: activeWs } }),
    enabled: !!activeWs,
  });
  const projects = (projectsQuery.data ?? []) as unknown as ProjectWithStats[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [projects, search, statusFilter]);

  const create = useServerFn(createProject);
  const update = useServerFn(updateProject);
  const remove = useServerFn(deleteProject);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["projects", activeWs] });

  const saveMutation = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        name: d.name.trim(),
        code: d.code.trim() || null,
        description: d.description.trim() || null,
        status: d.status,
        startDate: d.startDate || null,
        dueDate: d.dueDate || null,
      };
      if (d.id) return update({ data: { projectId: d.id, ...payload } });
      return create({ data: { workspaceId: activeWs, ...payload, tags: [] } });
    },
    onSuccess: () => {
      toast.success("Đã lưu dự án");
      setDraft(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không lưu được dự án"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => remove({ data: { projectId: id } }),
    onSuccess: () => {
      toast.success("Đã xóa dự án");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không xóa được dự án"),
  });

  const summary = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) => p.status === "active").length;
    const overdue = projects.reduce((n, p) => n + p.taskOverdue, 0);
    return { total, active, overdue };
  }, [projects]);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar active="projects" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <Folder className="h-6 w-6 text-primary" /> Dự án
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {summary.total} dự án · {summary.active} đang chạy · {summary.overdue} việc quá hạn
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Select value={activeWs} onValueChange={setWorkspaceId}>
                <SelectTrigger className="min-h-11 w-full sm:w-56">
                  <SelectValue placeholder="Chọn không gian" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="min-h-11 w-full sm:w-auto"
                disabled={!activeWs}
                onClick={() => setDraft(emptyDraft())}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Tạo dự án
              </Button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm dự án…"
                className="min-h-11 pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as ProjectStatus | "all")}
            >
              <SelectTrigger className="min-h-11 w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {projectsQuery.isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải dự án…
            </p>
          )}

          {!projectsQuery.isLoading && filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Folder className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 font-medium">Chưa có dự án nào</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tạo dự án để nhóm công việc theo mục tiêu và theo dõi tiến độ.
              </p>
              <Button
                className="mt-4 min-h-11"
                disabled={!activeWs}
                onClick={() => setDraft(emptyDraft())}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Tạo dự án
              </Button>
            </div>
          )}

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => {
              const pct = p.taskTotal > 0 ? Math.round((p.taskDone / p.taskTotal) * 100) : 0;
              return (
                <li key={p.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <Link
                      to="/projects/$id"
                      params={{ id: p.id }}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-semibold">{p.name}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </span>
                      {p.code && (
                        <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                          {p.code}
                        </span>
                      )}
                    </Link>
                    <Badge variant={STATUS_VARIANT[p.status]} className="shrink-0">
                      {STATUS_LABEL[p.status]}
                    </Badge>
                  </div>

                  {p.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {p.description}
                    </p>
                  )}

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {p.taskDone}/{p.taskTotal} công việc
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <Progress value={pct} className="mt-1.5 h-2" />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {p.due_date && <span>Hạn: {p.due_date}</span>}
                    {p.taskOverdue > 0 && (
                      <Badge variant="destructive">{p.taskOverdue} quá hạn</Badge>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="min-h-11 flex-1"
                      onClick={() =>
                        setDraft({
                          id: p.id,
                          name: p.name,
                          code: p.code ?? "",
                          description: p.description ?? "",
                          status: p.status,
                          startDate: p.start_date ?? "",
                          dueDate: p.due_date ?? "",
                        })
                      }
                    >
                      <Pencil className="mr-1.5 h-4 w-4" /> Sửa
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      aria-label="Xóa dự án"
                      onClick={() => {
                        if (confirm(`Xóa dự án "${p.name}"?`)) deleteMutation.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </main>
      </div>

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Sửa dự án" : "Tạo dự án"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="p-name">Tên dự án</Label>
                <Input
                  id="p-name"
                  className="min-h-11"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Ví dụ: Triển khai UNIWORK Q4"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="p-code">Mã dự án</Label>
                  <Input
                    id="p-code"
                    className="min-h-11"
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                    placeholder="UNI-Q4"
                  />
                </div>
                <div>
                  <Label>Trạng thái</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(v) => setDraft({ ...draft, status: v as ProjectStatus })}
                  >
                    <SelectTrigger className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="p-start">Ngày bắt đầu</Label>
                  <Input
                    id="p-start"
                    type="date"
                    className="min-h-11"
                    value={draft.startDate}
                    onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="p-due">Hạn hoàn thành</Label>
                  <Input
                    id="p-due"
                    type="date"
                    className="min-h-11"
                    value={draft.dueDate}
                    onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="p-desc">Mô tả</Label>
                <Textarea
                  id="p-desc"
                  rows={3}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Mục tiêu, phạm vi, kết quả mong đợi…"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setDraft(null)}>
              Hủy
            </Button>
            <Button
              className="min-h-11"
              disabled={!draft?.name.trim() || saveMutation.isPending}
              onClick={() => draft && saveMutation.mutate(draft)}
            >
              {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
