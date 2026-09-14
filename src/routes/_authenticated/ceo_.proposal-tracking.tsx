// THEO DÕI ĐỀ XUẤT — phân loại đề xuất đang chờ / đã gán / đã xong, kèm tiến độ và ảnh hưởng KPI.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { useActiveWorkspace } from "@/lib/active-workspace";
import {
  listProposalTracking,
  type ProposalBucket,
  type ProposalTrackingRow,
} from "@/lib/api/proposal-tracking.functions";

export const Route = createFileRoute("/_authenticated/ceo_/proposal-tracking")({
  head: () => ({
    meta: [
      { title: "Theo dõi đề xuất — CEO Command Center" },
      {
        name: "description",
        content:
          "Theo dõi đề xuất đang chờ, đã gán và đã hoàn thành, kèm tiến độ công việc và ảnh hưởng KPI.",
      },
      { property: "og:title", content: "Theo dõi đề xuất — CEO Command Center" },
      {
        property: "og:description",
        content: "Trạng thái từng đề xuất, người phụ trách, tiến độ và KPI phát sinh.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProposalTrackingPage,
});

const BUCKET_LABEL: Record<ProposalBucket, string> = {
  pending: "Đang chờ",
  assigned: "Đã gán",
  done: "Đã xong",
  closed: "Đã đóng",
};

const TASK_STATUS_LABEL: Record<string, string> = {
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

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function ProposalCard({ row }: { row: ProposalTrackingRow }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{row.title}</div>
          {row.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.description}</p>
          ) : null}
        </div>
        <Badge variant={row.bucket === "pending" ? "secondary" : "outline"} className="shrink-0">
          {BUCKET_LABEL[row.bucket]}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {row.urgencyLevel ? <Badge variant="outline">{row.urgencyLevel}</Badge> : null}
        {row.priorityRank ? <span>Ưu tiên #{row.priorityRank}</span> : null}
        <span>Tạo {fmt(row.createdAt)}</span>
        {row.assigneeName ? <span>Phụ trách: {row.assigneeName}</span> : null}
        {row.aiWorkerName ? <Badge variant="outline">AI: {row.aiWorkerName}</Badge> : null}
        {row.auto ? <span>(tự động)</span> : null}
      </div>

      {row.task ? (
        <div className="mt-2 rounded-xl bg-muted/40 px-3 py-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0 truncate text-xs">{row.task.title}</div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {TASK_STATUS_LABEL[row.task.status] ?? row.task.status} · {row.task.progressPct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full bg-primary" style={{ width: `${row.task.progressPct}%` }} />
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
      ) : null}
    </div>
  );
}

const FILTERS: Array<{ key: ProposalBucket | "all"; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "pending", label: "Đang chờ" },
  { key: "assigned", label: "Đã gán" },
  { key: "done", label: "Đã xong" },
  { key: "closed", label: "Đã đóng" },
];

function ProposalTrackingPage() {
  const [nav, setNav] = useState(false);
  const [filter, setFilter] = useState<ProposalBucket | "all">("all");
  const { workspaceId } = useActiveWorkspace();
  const fn = useServerFn(listProposalTracking);

  const q = useQuery({
    queryKey: ["ceo", "proposal-tracking", workspaceId ?? ""],
    queryFn: () => fn({ data: { workspaceId: workspaceId ?? null, limit: 50 } }),
  });

  const rows = useMemo(
    () => (q.data?.rows ?? []).filter((r) => filter === "all" || r.bucket === filter),
    [q.data, filter],
  );
  const s = q.data?.summary;

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
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Theo dõi đề xuất</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Đề xuất nào đang chờ xử lý, đã gán người phụ trách và đã hoàn thành, kèm tiến độ công
              việc và mức ảnh hưởng KPI trong kỳ 7 ngày.
            </p>
          </div>

          {s ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Đang chờ" value={s.pending} />
              <StatCard label="Đã gán" value={s.assigned} />
              <StatCard label="Đã xong" value={s.done} />
              <StatCard label="Tiến độ trung bình" value={`${s.avgProgressPct}%`} />
              <StatCard label="KPI quá hạn / hoàn thành" value={`${s.kpiOverdue}/${s.kpiCompleted}`} />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`min-h-[44px] rounded-full border px-4 text-sm ${
                  filter === f.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {q.isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải đề xuất…
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface px-4 py-8 text-sm text-muted-foreground">
              Chưa có đề xuất nào trong nhóm này.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <ProposalCard key={r.id} row={r} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
