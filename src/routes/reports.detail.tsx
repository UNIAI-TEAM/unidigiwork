import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { useI18n, type Key } from "@/lib/i18n";
import {
  getReportOverview,
  listReportTasks,
  type ReportTaskRow,
} from "@/lib/api/reports.functions";

const searchSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).catch(30),
  status: z.enum(["todo", "in_progress", "blocked", "done", "canceled"]).optional().catch(undefined),
  workspaceId: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/reports/detail")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Report drill-down · UNIWORK" },
      { name: "description", content: "Chi tiết báo cáo lọc theo trạng thái, workspace và thời gian." },
      { property: "og:title", content: "Report drill-down · UNIWORK" },
      { property: "og:description", content: "Chi tiết báo cáo lọc theo trạng thái, workspace và thời gian." },
    ],
  }),
  component: ReportDrilldownPage,
});

const STATUS_STYLE: Record<string, string> = {
  done: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  in_progress: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  todo: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  blocked: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  canceled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const STATUS_KEY: Record<string, Key> = {
  done: "rp.tasks.completed",
  in_progress: "rp.tasks.progress",
  todo: "rp.tasks.todo",
  blocked: "rp.tasks.blocked",
  canceled: "rp.dd.all",
};

function ReportDrilldownPage() {
  const { t } = useI18n();
  const [open, setOpen] = useSidebarState();
  const navigate = useNavigate({ from: "/reports/detail" });
  const { days, status, workspaceId } = Route.useSearch();

  const fetchTasks = useServerFn(listReportTasks);
  const fetchOverview = useServerFn(getReportOverview);

  const { data: rows, isPending } = useQuery({
    queryKey: ["report-tasks", days, status ?? null, workspaceId ?? null],
    queryFn: () => fetchTasks({ data: { days, status, workspaceId } }),
    staleTime: 30_000,
  });
  const { data: report } = useQuery({
    queryKey: ["report-overview", days],
    queryFn: () => fetchOverview({ data: { days } }),
    staleTime: 60_000,
  });

  const wsName = report?.workspaces.find((w) => w.id === workspaceId)?.name ?? workspaceId;
  const list: ReportTaskRow[] = rows ?? [];
  const fmt = (v: string | null) =>
    v ? new Date(v).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : "—";

  const setSearch = (patch: { status?: undefined; workspaceId?: undefined }) =>
    navigate({ search: { days, status, workspaceId, ...patch } });

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="reports" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <Link
            to="/reports"
            className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("rp.det.back")}
          </Link>

          <h1 className="text-2xl font-bold">{t("rp.dd.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("rp.dd.sub")}</p>

          {/* Filter chips */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("rp.dd.filters")}
            </span>
            <Chip label={`${t("rp.dd.range")}: ${days} ${t("rp.dd.days")}`} />
            {status && (
              <Chip
                label={`${t("rp.dd.status")}: ${t(STATUS_KEY[status] ?? "rp.dd.all")}`}
                onClear={() => setSearch({ status: undefined })}
              />
            )}
            {workspaceId && (
              <Chip
                label={`${t("rp.dd.workspace")}: ${wsName}`}
                onClear={() => setSearch({ workspaceId: undefined })}
              />
            )}
            {(status || workspaceId) && (
              <button
                onClick={() => setSearch({ status: undefined, workspaceId: undefined })}
                className="text-xs text-primary hover:underline"
              >
                {t("rp.dd.clear")}
              </button>
            )}
            <span className="ml-auto text-sm text-muted-foreground">
              {list.length} {t("rp.dd.count")}
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-surface p-4">
            {isPending ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("rp.dd.loading")}</p>
            ) : list.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">{t("rp.dd.empty")}</p>
                <Link to="/reports" className="mt-3 inline-block text-sm text-primary hover:underline">
                  {t("rp.det.back")}
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 text-left font-medium">{t("rp.dd.col.title")}</th>
                      <th className="pb-2 text-left font-medium">{t("rp.dd.col.status")}</th>
                      <th className="pb-2 text-left font-medium">{t("rp.dd.col.priority")}</th>
                      <th className="pb-2 text-left font-medium">{t("rp.dd.col.due")}</th>
                      <th className="pb-2 text-left font-medium">{t("rp.dd.col.updated")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-surface-2">
                        <td className="py-2.5 pr-3">
                          <Link
                            to="/tasks/$id"
                            params={{ id: r.id }}
                            className="font-medium hover:text-primary"
                          >
                            {r.title}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status] ?? ""}`}
                          >
                            {t(STATUS_KEY[r.status] ?? "rp.dd.all")}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{r.priority}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{fmt(r.due_at)}</td>
                        <td className="py-2.5 text-muted-foreground">{fmt(r.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs">
      {label}
      {onClear && (
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
