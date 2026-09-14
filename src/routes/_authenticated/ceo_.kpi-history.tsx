// LỊCH SỬ KPI — xem các mốc KPI do job nền ghi lại và so sánh với KPI hiện tại.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Minus } from "lucide-react";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { getCeoOverview } from "@/lib/api/ceo.functions";
import { listKpiHistory, type KpiHistoryRow } from "@/lib/api/kpi-history.functions";

export const Route = createFileRoute("/_authenticated/ceo_/kpi-history")({
  head: () => ({
    meta: [
      { title: "Lịch sử KPI — CEO Command Center" },
      {
        name: "description",
        content: "Xem các mốc KPI được ghi lại mỗi ngày và so sánh với KPI hiện tại của tổ chức.",
      },
      { property: "og:title", content: "Lịch sử KPI — CEO Command Center" },
      {
        property: "og:description",
        content: "So sánh KPI hiện tại với các mốc được ghi lại mỗi ngày.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KpiHistoryPage,
});

const SOURCE_LABEL: Record<string, string> = {
  ai_brain: "Bộ não AI",
  standup: "Giao ban tự động",
  manual: "Thủ công",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const num = (v: number | null) => (v === null ? "—" : `${Math.round(v)}`);

function Delta({
  current,
  past,
  inverse,
}: {
  current: number | null;
  past: number | null;
  inverse?: boolean;
}) {
  if (current === null || past === null)
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  const d = Math.round(current - past);
  if (d === 0) return <span className="text-xs text-muted-foreground">±0</span>;
  const good = inverse ? d < 0 : d > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        good ? "text-emerald-600" : "text-destructive"
      }`}
    >
      {d > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(d)}
    </span>
  );
}

function KpiHistoryPage() {
  const [open, setOpen] = useState(false);
  const { workspaceId } = useActiveWorkspace();
  const historyFn = useServerFn(listKpiHistory);
  const overviewFn = useServerFn(getCeoOverview);

  const history = useQuery({
    queryKey: ["ceo", "kpi-history", workspaceId ?? ""],
    queryFn: () => historyFn({ data: { workspaceId: workspaceId ?? null, limit: 30 } }),
  });

  const overview = useQuery({
    queryKey: ["ceo", "kpi-history-current", workspaceId ?? ""],
    queryFn: () => overviewFn({ data: { period: "week", workspaceId: workspaceId ?? null } }),
  });

  const current = useMemo(() => {
    const o = overview.data;
    if (!o) return null;
    return {
      score: o.kpi.score ?? null,
      totalTasks: o.totals.tasks.current,
      completed: o.totals.completed.current,
      overdue: o.totals.overdue,
      aiSharePct: o.split.aiSharePct,
    };
  }, [overview.data]);

  const rows: KpiHistoryRow[] = history.data ?? [];
  const latest = rows[0] ?? null;
  const loading = history.isLoading || overview.isLoading;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ceo" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6 sm:px-6">
          <div className="min-w-0">
            <Link
              to="/ceo"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> CEO Command Center
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Lịch sử KPI</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Mỗi lần hệ thống tự làm mới KPI sẽ lưu lại một mốc. So sánh mốc gần nhất với số liệu
              hiện tại để thấy thay đổi.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải lịch sử KPI…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {[
                  {
                    label: "Điểm KPI",
                    value: num(current?.score ?? null),
                    past: latest?.score ?? null,
                    cur: current?.score ?? null,
                  },
                  {
                    label: "Việc trong kỳ",
                    value: num(current?.totalTasks ?? null),
                    past: latest?.totalTasks ?? null,
                    cur: current?.totalTasks ?? null,
                  },
                  {
                    label: "Hoàn thành",
                    value: num(current?.completed ?? null),
                    past: latest?.completed ?? null,
                    cur: current?.completed ?? null,
                  },
                  {
                    label: "Quá hạn",
                    value: num(current?.overdue ?? null),
                    past: latest?.overdue ?? null,
                    cur: current?.overdue ?? null,
                    inverse: true,
                  },
                  {
                    label: "Tỷ lệ AI (%)",
                    value: num(current?.aiSharePct ?? null),
                    past: latest?.aiSharePct ?? null,
                    cur: current?.aiSharePct ?? null,
                  },
                ].map((c) => (
                  <div key={c.label} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tracking-tight">{c.value}</span>
                      <Delta current={c.cur} past={c.past} inverse={c.inverse} />
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      so với mốc gần nhất
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-border bg-surface">
                <div className="border-b border-border px-4 py-3 text-sm font-medium">
                  Các mốc đã ghi ({rows.length})
                </div>
                {rows.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-muted-foreground">
                    Chưa có mốc nào. Hệ thống sẽ tự ghi lại mỗi sáng khi làm mới KPI.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr className="border-b border-border">
                          <th className="px-4 py-2 font-medium">Thời điểm</th>
                          <th className="px-4 py-2 font-medium">Nguồn</th>
                          <th className="px-4 py-2 font-medium text-right">Điểm</th>
                          <th className="px-4 py-2 font-medium text-right">Việc</th>
                          <th className="px-4 py-2 font-medium text-right">Hoàn thành</th>
                          <th className="px-4 py-2 font-medium text-right">Quá hạn</th>
                          <th className="px-4 py-2 font-medium text-right">AI (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className="border-b border-border/60 last:border-0">
                            <td className="px-4 py-3 whitespace-nowrap">{fmt(r.capturedAt)}</td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary">
                                {SOURCE_LABEL[r.source] ?? r.source}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">{num(r.score)}</td>
                            <td className="px-4 py-3 text-right">{r.totalTasks}</td>
                            <td className="px-4 py-3 text-right">{r.completed}</td>
                            <td className="px-4 py-3 text-right">{r.overdue}</td>
                            <td className="px-4 py-3 text-right">{num(r.aiSharePct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
