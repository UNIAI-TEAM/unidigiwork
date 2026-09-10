// Chi tiết dự án — thông tin, tiến độ và công việc thuộc dự án.
import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Folder, Loader2, ListChecks } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getProject, type ProjectRow, type ProjectStatus } from "@/lib/api/projects.functions";

export const Route = createFileRoute("/_authenticated/projects_/$id")({
  component: ProjectDetailPage,
  head: () => ({
    meta: [
      { title: "Chi tiết dự án · UNIWORK" },
      {
        name: "description",
        content: "Xem tiến độ, thời hạn và danh sách công việc thuộc dự án trong UNIWORK.",
      },
      { property: "og:title", content: "Chi tiết dự án · UNIWORK" },
      {
        property: "og:description",
        content: "Tiến độ dự án và công việc liên quan trong UNIWORK.",
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

const TASK_STATUS_LABEL: Record<string, string> = {
  todo: "Cần làm",
  in_progress: "Đang làm",
  blocked: "Bị chặn",
  done: "Hoàn thành",
  canceled: "Đã hủy",
};

function ProjectDetailPage() {
  const [open, setOpen] = useSidebarState();
  const { id } = Route.useParams();

  const query = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject({ data: { projectId: id } }),
  });

  const project = query.data?.project as ProjectRow | undefined;
  const tasks = query.data?.tasks ?? [];

  const pct = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100);
  }, [tasks]);

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
                  {project.code && (
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{project.code}</p>
                  )}
                </div>
                <Badge>{STATUS_LABEL[project.status]}</Badge>
              </div>

              {project.description && (
                <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
                  {project.description}
                </p>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Tiến độ</p>
                  <p className="mt-1 text-xl font-semibold">{pct}%</p>
                  <Progress value={pct} className="mt-2 h-2" />
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Ngày bắt đầu</p>
                  <p className="mt-1 text-xl font-semibold">{project.start_date ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Hạn hoàn thành</p>
                  <p className="mt-1 text-xl font-semibold">{project.due_date ?? "—"}</p>
                </div>
              </div>

              <section className="mt-6 rounded-xl border border-border bg-card p-4">
                <h2 className="flex items-center gap-2 font-semibold">
                  <ListChecks className="h-4 w-4 text-primary" /> Công việc ({tasks.length})
                </h2>
                {tasks.length === 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Chưa có công việc nào gắn với dự án này.
                  </p>
                )}
                <ul className="mt-3 space-y-2">
                  {tasks.map((t) => (
                    <li key={t.id} className="rounded-lg border border-border p-3">
                      <Link
                        to="/tasks/$id"
                        params={{ id: t.id }}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-2 hover:underline"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {t.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Badge variant="outline">
                            {TASK_STATUS_LABEL[t.status] ?? t.status}
                          </Badge>
                          {t.due_at && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(t.due_at).toLocaleDateString("vi-VN")}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
