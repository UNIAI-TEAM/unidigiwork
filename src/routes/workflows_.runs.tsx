import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  History,
  Loader2,
  ChevronRight,
  RotateCw,
  Search as SearchIcon,
  X,
  XCircle,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";
import {
  cancelWorkflowRun,
  getWorkflowRun,
  listWorkflows,
  listWorkflowRuns,
  startWorkflowRun,
} from "@/lib/api/workflows.functions";

export const Route = createFileRoute("/workflows_/runs")({
  head: () => ({
    meta: [
      { title: "Lịch sử chạy quy trình · UNIWORK" },
      {
        name: "description",
        content:
          "Xem lịch sử các lần chạy quy trình: trạng thái thành công, thất bại, đang chạy, lọc theo thời gian và mở chi tiết.",
      },
      { property: "og:title", content: "Lịch sử chạy quy trình · UNIWORK" },
      {
        property: "og:description",
        content: "Theo dõi trạng thái từng lần chạy quy trình và mở chi tiết từng bước.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RunHistoryPage,
});

type RunStatus = "pending" | "running" | "succeeded" | "failed" | "canceled";
type Run = {
  id: string;
  workflow_id: string;
  status: RunStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  row_version?: number;
};
type WF = { id: string; name: string };

const STATUS_META: Record<RunStatus, { label: string; cls: string }> = {
  pending: { label: "Chờ chạy", cls: "bg-muted text-muted-foreground" },
  running: { label: "Đang chạy", cls: "bg-primary/10 text-primary" },
  succeeded: { label: "Thành công", cls: "bg-emerald-500/10 text-emerald-600" },
  failed: { label: "Thất bại", cls: "bg-destructive/10 text-destructive" },
  canceled: { label: "Đã huỷ", cls: "bg-amber-500/10 text-amber-600" },
};

const RANGES = [
  { key: "24h", label: "24 giờ", days: 1 },
  { key: "7d", label: "7 ngày", days: 7 },
  { key: "30d", label: "30 ngày", days: 30 },
  { key: "all", label: "Tất cả", days: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function fmt(v: string | null, tz?: string) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
}

function duration(r: Run) {
  if (!r.started_at) return "—";
  const end = r.ended_at ? new Date(r.ended_at).getTime() : Date.now();
  const ms = end - new Date(r.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function StatusBadge({ status }: { status: RunStatus }) {
  const meta = STATUS_META[status];
  const Icon =
    status === "succeeded"
      ? CheckCircle2
      : status === "failed"
        ? XCircle
        : status === "running"
          ? Loader2
          : status === "canceled"
            ? Ban
            : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}
    >
      <Icon className={`h-3.5 w-3.5 ${status === "running" ? "animate-spin" : ""}`} />
      {meta.label}
    </span>
  );
}

function RunHistoryPage() {
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();
  const [wsId, setWsId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"all" | RunStatus>("all");
  const [range, setRange] = useState<RangeKey>("7d");
  const [q, setQ] = useState("");
  const [wfFilter, setWfFilter] = useState<string>("all");
  const [detailId, setDetailId] = useState<string | null>(null);

  const workspaces = useQuery({ queryKey: ["my-workspaces"], queryFn: () => listMyWorkspaces() });
  const activeWs = wsId ?? (workspaces.data?.[0]?.id as string | undefined);
  const tz = (workspaces.data as { id: string; timezone?: string }[] | undefined)?.find(
    (w) => w.id === activeWs,
  )?.timezone;

  const wfQuery = useQuery({
    queryKey: ["workflows", activeWs],
    enabled: Boolean(activeWs),
    queryFn: async () =>
      (await listWorkflows({ data: { workspaceId: activeWs!, limit: 200 } })) as unknown as WF[],
  });
  const workflows = useMemo(() => wfQuery.data ?? [], [wfQuery.data]);
  const wfName = useMemo(
    () => new Map(workflows.map((w) => [w.id, w.name] as const)),
    [workflows],
  );
  const ids = useMemo(() => workflows.map((w) => w.id), [workflows]);

  const runsQuery = useQuery({
    queryKey: ["workflow-runs", ids],
    enabled: ids.length > 0,
    queryFn: async () =>
      (await listWorkflowRuns({ data: { workflowIds: ids, limit: 500 } })) as unknown as Run[],
  });
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);

  useEffect(() => {
    setWfFilter("all");
  }, [activeWs]);

  const filtered = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? 0;
    const from = days > 0 ? Date.now() - days * 86_400_000 : 0;
    const kw = q.trim().toLowerCase();
    return runs.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (wfFilter !== "all" && r.workflow_id !== wfFilter) return false;
      const at = new Date(r.started_at ?? r.created_at).getTime();
      if (from && (!Number.isFinite(at) || at < from)) return false;
      if (kw) {
        const name = (wfName.get(r.workflow_id) ?? "").toLowerCase();
        if (!name.includes(kw) && !r.id.toLowerCase().includes(kw)) return false;
      }
      return true;
    });
  }, [runs, status, range, wfFilter, q, wfName]);

  const counts = useMemo(() => {
    const c = { succeeded: 0, failed: 0, running: 0, other: 0 };
    for (const r of filtered) {
      if (r.status === "succeeded") c.succeeded++;
      else if (r.status === "failed") c.failed++;
      else if (r.status === "running" || r.status === "pending") c.running++;
      else c.other++;
    }
    return c;
  }, [filtered]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["workflow-runs"] });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-64">
        <AppTopbar onOpenSidebar={() => setOpen(true)} />
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link
                to="/workflows"
                className="mb-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Quy trình
              </Link>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <History className="h-6 w-6 text-primary" /> Lịch sử chạy
              </h1>
              <p className="text-sm text-muted-foreground">
                Theo dõi trạng thái từng lần chạy, lọc theo thời gian và mở chi tiết.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/workflows/calendar"
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface"
              >
                <CalendarRange className="h-4 w-4" /> Lịch chạy
              </Link>
              <button
                onClick={refresh}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface"
              >
                <RotateCw className={`h-4 w-4 ${runsQuery.isFetching ? "animate-spin" : ""}`} /> Làm
                mới
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Tổng run" value={filtered.length} />
            <Kpi label="Thành công" value={counts.succeeded} tone="text-emerald-600" />
            <Kpi label="Thất bại" value={counts.failed} tone="text-destructive" />
            <Kpi label="Đang chạy" value={counts.running} tone="text-primary" />
          </div>

          {/* Bộ lọc */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <Select
              value={activeWs ?? ""}
              onChange={setWsId}
              options={(workspaces.data ?? []).map((w: { id: string; name: string }) => ({
                value: w.id,
                label: w.name,
              }))}
              placeholder="Không gian làm việc"
            />
            <Select
              value={wfFilter}
              onChange={setWfFilter}
              options={[
                { value: "all", label: "Tất cả quy trình" },
                ...workflows.map((w) => ({ value: w.id, label: w.name })),
              ]}
            />
            <div className="flex overflow-hidden rounded-lg border border-border">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`px-3 py-1.5 text-sm ${
                    range === r.key ? "bg-primary text-primary-foreground" : "hover:bg-surface"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-lg border border-border">
              {(
                [
                  ["all", "Tất cả"],
                  ["succeeded", "Thành công"],
                  ["failed", "Thất bại"],
                  ["running", "Đang chạy"],
                  ["canceled", "Đã huỷ"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setStatus(k as "all" | RunStatus)}
                  className={`px-3 py-1.5 text-sm ${
                    status === k ? "bg-primary text-primary-foreground" : "hover:bg-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative min-w-[200px] flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo tên quy trình hoặc mã run"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  aria-label="Xoá từ khoá"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-surface"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Danh sách */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {runsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải lịch sử chạy…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <History className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Không có lần chạy nào</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Thử đổi khoảng thời gian hoặc bỏ bớt bộ lọc.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Quy trình</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Bắt đầu</th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">Kết thúc</th>
                    <th className="px-4 py-3 font-medium">Thời lượng</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setDetailId(r.id)}
                      className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface/60"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{wfName.get(r.workflow_id) ?? "—"}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {r.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {fmt(r.started_at ?? r.created_at, tz)}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                        {fmt(r.ended_at, tz)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{duration(r)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-primary">Chi tiết</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {detailId && (
        <RunDetailModal runId={detailId} tz={tz} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      >
        {placeholder && !value && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

type StepRow = {
  id: string;
  step_key: string;
  status: string;
  error: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

function RunDetailModal({
  runId,
  tz,
  onClose,
}: {
  runId: string;
  tz?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["workflow-run", runId],
    queryFn: async () => await getWorkflowRun({ data: { runId } }),
  });

  const cancelM = useMutation({
    mutationFn: async () =>
      await cancelWorkflowRun({
        data: { runId, idempotencyKey: crypto.randomUUID(), reason: "Huỷ từ lịch sử chạy" },
      }),
    onSuccess: () => {
      toast.success("Đã huỷ lần chạy");
      void qc.invalidateQueries({ queryKey: ["workflow-run", runId] });
      void qc.invalidateQueries({ queryKey: ["workflow-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = detail.data?.run as
    | (Run & { context?: Record<string, unknown> | null })
    | undefined;
  const steps = (detail.data?.steps ?? []) as StepRow[];
  const wfTitle = detail.data?.workflow?.name ?? "Quy trình";

  const retryM = useMutation({
    mutationFn: async () => {
      if (!run) throw new Error("Không tìm thấy lần chạy");
      return await startWorkflowRun({
        data: {
          workflowId: run.workflow_id,
          context: (run.context ?? {}) as Record<string, unknown>,
          idempotencyKey: crypto.randomUUID(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Đã tạo lần chạy mới");
      void qc.invalidateQueries({ queryKey: ["workflow-runs"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canCancel = run?.status === "pending" || run?.status === "running";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-lg font-semibold">{wfTitle}</h2>
            <p className="font-mono text-xs text-muted-foreground">{runId}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 hover:bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {detail.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải chi tiết…
          </div>
        ) : !run ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Không tìm thấy lần chạy này.
          </div>
        ) : (
          <div className="space-y-5 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={run.status} />
              <span className="text-sm text-muted-foreground">
                Bắt đầu {fmt(run.started_at ?? run.created_at, tz)}
              </span>
              <span className="text-sm text-muted-foreground">
                Kết thúc {fmt(run.ended_at, tz)}
              </span>
              <span className="text-sm text-muted-foreground">Thời lượng {duration(run)}</span>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Các bước</h3>
              {steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có bước nào được ghi nhận.</p>
              ) : (
                <ol className="space-y-2">
                  {steps.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-lg border border-border p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{s.step_key}</span>
                        <span className="text-xs text-muted-foreground">{s.status}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {fmt(s.started_at ?? s.created_at, tz)} → {fmt(s.ended_at, tz)}
                      </div>
                      {s.error && (
                        <p className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
                          {s.error}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Link
                to="/workflows/$id"
                params={{ id: run.workflow_id }}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface"
              >
                Mở quy trình
              </Link>
              {canCancel && (
                <button
                  onClick={() => cancelM.mutate()}
                  disabled={cancelM.isPending}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface disabled:opacity-50"
                >
                  <Ban className="h-4 w-4" /> Huỷ run
                </button>
              )}
              <button
                onClick={() => retryM.mutate()}
                disabled={retryM.isPending}
                className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {retryM.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw className="h-4 w-4" />
                )}
                Chạy lại
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}