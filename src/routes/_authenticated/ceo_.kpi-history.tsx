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
import {
  listKpiHistory,
  listKpiMonthly,
  type KpiHistoryRow,
  type KpiMonthlyRow,
} from "@/lib/api/kpi-history.functions";

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

// Biểu đồ cột KPI theo tháng, so với mốc hiện tại (đường ngang nét đứt).
function MonthlyChart({
  rows,
  current,
}: {
  rows: KpiMonthlyRow[];
  current: { score: number | null; completed: number; overdue: number };
}) {
  const [metric, setMetric] = useState<"score" | "completed" | "overdue">("score");
  const METRICS = [
    { key: "score", label: "Điểm KPI" },
    { key: "completed", label: "Hoàn thành" },
    { key: "overdue", label: "Quá hạn" },
  ] as const;

  const values = rows.map((r) =>
    metric === "score" ? (r.avgScore ?? 0) : metric === "completed" ? r.avgCompleted : r.avgOverdue,
  );
  const max = Math.max(1, ...values, metric === "score" ? (current.score ?? 0) : 0);
  const refValue =
    metric === "score" ? current.score : metric === "completed" ? current.completed : current.overdue;
  const refPct = refValue === null ? null : Math.min(100, Math.round((refValue / max) * 100));

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Xu hướng KPI theo tháng</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Trung bình các mốc trong từng tháng — so với mốc hiện tại (đường nét đứt).
          </p>
        </div>
        <div className="flex gap-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={`min-h-[44px] rounded-xl px-3 text-xs font-medium transition-colors ${
                metric === m.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          Chưa đủ dữ liệu theo tháng. Hệ thống ghi mốc mỗi sáng, biểu đồ sẽ hiện khi có mốc.
        </p>
      ) : (
        <div className="mt-4">
          <div className="relative flex h-44 items-end gap-2 sm:gap-3">
            {refPct !== null ? (
              <div
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-primary/60"
                style={{ bottom: `${refPct}%` }}
              >
                <span className="absolute -top-4 right-0 text-[10px] text-primary">
                  Hiện tại: {refValue}
                </span>
              </div>
            ) : null}
            {rows.map((r, i) => {
              const v =
                metric === "score"
                  ? (r.avgScore ?? 0)
                  : metric === "completed"
                    ? r.avgCompleted
                    : r.avgOverdue;
              const pct = Math.max(2, Math.round((v / max) * 100));
              return (
                <div key={r.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-medium">{v}</span>
                  <div
                    className={`w-full max-w-10 rounded-t-md ${
                      i === rows.length - 1 ? "bg-primary" : "bg-primary/30"
                    }`}
                    style={{ height: `${pct}%` }}
                    title={`${r.label}: ${v} (${r.snapshots} mốc)`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-2 sm:gap-3">
            {rows.map((r) => (
              <div
                key={r.month}
                className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground"
              >
                {r.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiHistoryPage() {
  const [open, setOpen] = useState(false);
  const { workspaceId } = useActiveWorkspace();
  const historyFn = useServerFn(listKpiHistory);
  const overviewFn = useServerFn(getCeoOverview);
  const monthlyFn = useServerFn(listKpiMonthly);

  const history = useQuery({
    queryKey: ["ceo", "kpi-history", workspaceId ?? ""],
    queryFn: () => historyFn({ data: { workspaceId: workspaceId ?? null, limit: 30 } }),
  });

  const monthly = useQuery({
    queryKey: ["ceo", "kpi-monthly", workspaceId ?? ""],
    queryFn: () => monthlyFn({ data: { workspaceId: workspaceId ?? null, months: 6 } }),
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
  const loading = history.isLoading || overview.isLoading || monthly.isLoading;

  // Đề xuất sinh ra mỗi sáng so với số việc quá hạn — để thấy đề xuất có bù đắp kịp không.
  const coverage = useMemo(() => {
    const withProposals = rows.filter((r) => r.proposalsCreated !== null);
    if (withProposals.length === 0) return null;
    const proposals = withProposals.reduce((s, r) => s + (r.proposalsCreated ?? 0), 0);
    const overdue = withProposals.reduce((s, r) => s + r.overdue, 0);
    const last = withProposals[0]!;
    return {
      days: withProposals.length,
      proposals,
      overdue,
      ratio: overdue > 0 ? Math.round((proposals / overdue) * 100) : null,
      lastProposals: last.proposalsCreated ?? 0,
      lastOverdue: last.overdue,
    };
  }, [rows]);

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

              {coverage ? (
                <div className="rounded-2xl border border-border bg-surface p-4">
                  <div className="text-sm font-medium">Đề xuất có bù đắp kịp việc quá hạn?</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Đề xuất sáng gần nhất</div>
                      <div className="mt-1 text-2xl font-semibold tracking-tight">
                        {coverage.lastProposals}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Quá hạn cùng mốc</div>
                      <div className="mt-1 text-2xl font-semibold tracking-tight">
                        {coverage.lastOverdue}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Tổng {coverage.days} mốc gần đây
                      </div>
                      <div className="mt-1 text-2xl font-semibold tracking-tight">
                        {coverage.proposals} / {coverage.overdue}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Mức bù đắp</div>
                      <div
                        className={`mt-1 text-2xl font-semibold tracking-tight ${
                          coverage.ratio === null
                            ? ""
                            : coverage.ratio >= 100
                              ? "text-emerald-600"
                              : "text-destructive"
                        }`}
                      >
                        {coverage.ratio === null ? "—" : `${coverage.ratio}%`}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {coverage.ratio === null
                      ? "Chưa có việc quá hạn trong các mốc này."
                      : coverage.ratio >= 100
                        ? "Số đề xuất sinh ra đang nhiều hơn số việc quá hạn — đủ sức bù đắp."
                        : "Số đề xuất còn ít hơn số việc quá hạn — cần giao thêm người hoặc AI."}
                  </p>
                </div>
              ) : null}

              <MonthlyChart
                rows={monthly.data ?? []}
                current={{
                  score: current?.score ?? null,
                  completed: current?.completed ?? 0,
                  overdue: current?.overdue ?? 0,
                }}
              />

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
                          <th className="px-4 py-2 font-medium text-right">Đề xuất</th>
                          <th className="px-4 py-2 font-medium text-right">Bù đắp</th>
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
                            <td className="px-4 py-3 text-right">
                              {r.proposalsCreated === null ? "—" : r.proposalsCreated}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {r.proposalsCreated === null || r.overdue === 0 ? (
                                "—"
                              ) : (
                                <span
                                  className={
                                    r.proposalsCreated >= r.overdue
                                      ? "text-emerald-600"
                                      : "text-destructive"
                                  }
                                >
                                  {Math.round((r.proposalsCreated / r.overdue) * 100)}%
                                </span>
                              )}
                            </td>
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
