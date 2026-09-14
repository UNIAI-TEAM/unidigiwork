// THEO DÕI TỪNG VIỆC — lịch sử trạng thái, tiến độ và ảnh hưởng KPI, tự cập nhật mỗi sáng.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Loader2, Minus } from "lucide-react";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { listTaskTracking, type TaskTrackingRow } from "@/lib/api/task-tracking.functions";

export const Route = createFileRoute("/_authenticated/ceo_/task-tracking")({
  head: () => ({
    meta: [
      { title: "Theo dõi từng việc — CEO Command Center" },
      {
        name: "description",
        content:
          "Lịch sử trạng thái, tiến độ và mức ảnh hưởng KPI của từng việc, tự cập nhật mỗi sáng.",
      },
      { property: "og:title", content: "Theo dõi từng việc — CEO Command Center" },
      {
        property: "og:description",
        content: "Xem lịch sử trạng thái, tiến độ và ảnh hưởng KPI của từng việc.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaskTrackingPage,
});

const STATUS_LABEL: Record<string, string> = {
  todo: "Chưa bắt đầu",
  in_progress: "Đang làm",
  blocked: "Vướng mắc",
  done: "Hoàn thành",
  canceled: "Đã huỷ",
};

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function Delta({ value }: { value: number | null }) {
  if (value === null) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  if (value === 0) return <span className="text-xs text-muted-foreground">±0</span>;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        value > 0 ? "text-emerald-600" : "text-destructive"
      }`}
    >
      {value > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value)}
    </span>
  );
}

function TaskCard({ row }: { row: TaskTrackingRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-start gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{row.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{STATUS_LABEL[row.status] ?? row.status}</Badge>
            <span>Tiến độ {row.progressPct}%</span>
            <Delta value={row.progressDelta} />
            <span>Hạn {fmt(row.dueAt)}</span>
            {row.isAi ? <Badge variant="outline">AI</Badge> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.kpi.countsOverdue ? (
              <Badge variant="destructive">Tính vào KPI quá hạn</Badge>
            ) : null}
            {row.kpi.countsCompleted ? <Badge variant="outline">Tính vào hoàn thành</Badge> : null}
            {row.kpi.countsAiShare ? <Badge variant="outline">Tính vào tỷ lệ AI</Badge> : null}
            {!row.kpi.inWindow && !row.kpi.countsOverdue && !row.kpi.countsCompleted ? (
              <span className="text-[11px] text-muted-foreground">Ngoài kỳ KPI 7 ngày</span>
            ) : null}
          </div>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="border-t border-border px-4 py-3">
          {row.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có ghi nhận nào. Hệ thống sẽ tự ghi mỗi sáng.
            </p>
          ) : (
            <ol className="space-y-2">
              {row.history.map((e) => (
                <li key={`${row.id}-${e.at}`} className="flex gap-3 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{fmt(e.at)}</span>
                  <span className="min-w-0 flex-1">
                    {e.body}
                    {e.auto ? (
                      <span className="ml-2 text-[11px] text-muted-foreground">(tự động)</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TaskTrackingPage() {
  const [nav, setNav] = useState(false);
  const { workspaceId } = useActiveWorkspace();
  const fn = useServerFn(listTaskTracking);

  const q = useQuery({
    queryKey: ["ceo", "task-tracking", workspaceId ?? ""],
    queryFn: () => fn({ data: { workspaceId: workspaceId ?? null, limit: 30 } }),
  });

  const rows = q.data ?? [];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ceo" open={nav} onClose={() => setNav(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setNav(true)} />

        <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6 sm:px-6">
          <div className="min-w-0">
            <Link
              to="/ceo"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> CEO Command Center
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Theo dõi từng việc</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Lịch sử trạng thái và tiến độ của từng việc do hệ thống ghi tự động mỗi sáng, kèm mức
              ảnh hưởng lên KPI trong kỳ 7 ngày.
            </p>
          </div>

          {q.isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách việc…
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface px-4 py-8 text-sm text-muted-foreground">
              Chưa có việc nào để theo dõi.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <TaskCard key={r.id} row={r} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
