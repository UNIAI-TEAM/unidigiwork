// CEO COMMAND CENTER — bức tranh tổng thể cho ban điều hành. Chỉ đọc dữ liệu thật.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  RefreshCcw,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { useActiveWorkspace } from "@/lib/active-workspace";
import {
  exportCeoReport,
  getCeoOverview,
  saveCeoKpiSettings,
  type CeoPeriod,
} from "@/lib/api/ceo.functions";
import type { CeoOverview } from "@/lib/api/ceo.functions";

export const Route = createFileRoute("/_authenticated/ceo")({
  head: () => ({
    meta: [
      { title: "CEO Command Center — UNIWORK" },
      {
        name: "description",
        content:
          "Bức tranh tổng thể cho CEO: chuyển dịch người và AI, thời gian làm việc, chất lượng kết quả và vấn đề cần xử lý.",
      },
      { property: "og:title", content: "CEO Command Center — UNIWORK" },
      {
        property: "og:description",
        content:
          "Bức tranh tổng thể cho CEO: chuyển dịch người và AI, thời gian làm việc, chất lượng kết quả và vấn đề cần xử lý.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CeoPage,
});

const PERIODS: { id: CeoPeriod; label: string }[] = [
  { id: "day", label: "Ngày" },
  { id: "week", label: "Tuần" },
  { id: "month", label: "Tháng" },
  { id: "quarter", label: "Quý" },
  { id: "half", label: "6 tháng" },
  { id: "year", label: "Năm" },
];

const n = (v: number) => v.toLocaleString("vi-VN");

const STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Chờ duyệt",
  PREVIEWED: "Đã xem trước",
  CONFIRMED: "Đã duyệt",
  SUCCEEDED: "Đã thực thi",
  FAILED: "Thất bại",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
  EXPIRED: "Hết hạn",
};

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PROPOSED: "outline",
  PREVIEWED: "outline",
  CONFIRMED: "secondary",
  SUCCEEDED: "default",
  FAILED: "destructive",
  REJECTED: "destructive",
  CANCELLED: "secondary",
  EXPIRED: "secondary",
};

function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-surface p-4 sm:p-5 ${className}`}>
      {title ? <h2 className="text-sm font-semibold tracking-tight">{title}</h2> : null}
      <div className={title ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-emerald-600" : "text-destructive"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {up ? "+" : ""}
      {value}%
    </span>
  );
}

const KPI_FIELDS: {
  key: keyof CeoOverview["kpi"]["targets"];
  label: string;
  hint: string;
}[] = [
  { key: "completed", label: "Việc hoàn thành / kỳ", hint: "việc" },
  { key: "maxOverdue", label: "Việc quá hạn tối đa", hint: "việc" },
  { key: "aiSharePct", label: "Tỉ lệ AI đảm nhiệm", hint: "%" },
  { key: "resultRatePct", label: "Tỉ lệ việc có kết quả", hint: "%" },
  { key: "passRatePct", label: "Tỉ lệ kết quả đạt review", hint: "%" },
];

function ProgressPill({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${v}%` }} />
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{v}%</span>
    </span>
  );
}

function KpiSettings({ data, onSaved }: { data: CeoOverview; onSaved: () => void }) {
  const save = useServerFn(saveCeoKpiSettings);
  const { workspaceId } = useActiveWorkspace();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      KPI_FIELDS.map((f) => [
        f.key,
        data.kpi.targets[f.key] === null ? "" : String(data.kpi.targets[f.key]),
      ]),
    ),
  );
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.departments.map((d) => [d.id, String(d.weight)])),
  );

  const num = (v: string) => {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await save({
        data: {
          workspaceId: workspaceId ?? null,
          targets: {
            completed: num(targets["completed"] ?? ""),
            maxOverdue: num(targets["maxOverdue"] ?? ""),
            aiSharePct: num(targets["aiSharePct"] ?? ""),
            resultRatePct: num(targets["resultRatePct"] ?? ""),
            passRatePct: num(targets["passRatePct"] ?? ""),
          },
          departmentWeights: Object.fromEntries(
            Object.entries(weights)
              .map(([k, v]) => [k, num(v) ?? 1] as const)
              .filter(([, v]) => v >= 0),
          ),
        },
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được KPI.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="KPI mục tiêu do CEO đặt">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data.kpi.configured
            ? `Điểm đạt KPI tổng hợp: ${data.kpi.score ?? "—"}%`
            : "Chưa đặt KPI. Bộ não AI sẽ đề xuất bám theo KPI ngay sau khi bạn lưu."}
        </p>
        <button
          onClick={() => setEditing((v) => !v)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2"
        >
          <Target className="h-4 w-4" />
          {editing ? "Đóng" : "Thiết lập KPI"}
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.kpi.rows.map((r) => (
          <div key={r.key} className="rounded-xl border border-border px-3 py-2">
            <div className="text-xs text-muted-foreground">{r.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums">{r.actual ?? "—"}</span>
              <span className="text-xs text-muted-foreground">
                / mục tiêu{" "}
                {r.target === null ? "chưa đặt" : `${r.target}${r.unit === "%" ? "%" : ""}`}
              </span>
            </div>
            {r.ok === null ? null : (
              <Badge variant={r.ok ? "default" : "destructive"} className="mt-1">
                {r.ok ? "Đạt" : "Chưa đạt"} {r.achievedPct !== null ? `· ${r.achievedPct}%` : ""}
              </Badge>
            )}
          </div>
        ))}
      </div>

      {editing ? (
        <div className="mt-4 space-y-4 rounded-xl border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {KPI_FIELDS.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="text-xs text-muted-foreground">
                  {f.label} ({f.hint})
                </span>
                <input
                  inputMode="numeric"
                  value={targets[f.key] ?? ""}
                  onChange={(e) => setTargets((p) => ({ ...p, [f.key]: e.target.value }))}
                  placeholder="Chưa đặt"
                  className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                />
              </label>
            ))}
          </div>

          {data.departments.length ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                Trọng số từng bộ phận (0 = bỏ qua, 1 = bình thường, cao hơn = ưu tiên)
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.departments.map((d) => (
                  <label key={d.id} className="block text-sm">
                    <span className="block truncate text-xs text-muted-foreground">{d.name}</span>
                    <input
                      inputMode="numeric"
                      value={weights[d.id] ?? "1"}
                      onChange={(e) => setWeights((p) => ({ ...p, [d.id]: e.target.value }))}
                      className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <button
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Lưu KPI
          </button>
        </div>
      ) : null}
    </Card>
  );
}

function CeoPage() {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<CeoPeriod>("month");
  const { workspaceId } = useActiveWorkspace();
  const fn = useServerFn(getCeoOverview);
  const exportFn = useServerFn(exportCeoReport);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const download = async (format: "pdf" | "xlsx") => {
    setExporting(format);
    try {
      const res = await exportFn({ data: { period, workspaceId: workspaceId ?? null, format } });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: res.mimeType }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["ceo", "overview", period, workspaceId ?? ""],
    queryFn: () => fn({ data: { period, workspaceId: workspaceId ?? null } }),
  });

  const today = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const attention = data
    ? [
        {
          tone: "danger" as const,
          tag: "Cần quyết định",
          title: `${data.issues.filter((i) => i.kind === "pending_approval").length} đề xuất chờ duyệt`,
          detail: data.issues.find((i) => i.kind === "pending_approval")?.detail ?? "Không có",
          href: "/ai-brain",
        },
        {
          tone: "warn" as const,
          tag: "Cần can thiệp",
          title: `${n(data.totals.overdue)} việc quá hạn`,
          detail: `${data.issues.filter((i) => i.kind === "stalled").length} việc không cập nhật trên 7 ngày`,
          href: "/tasks",
        },
        {
          tone: "ok" as const,
          tag: "Theo dõi",
          title: `AI đảm nhiệm ${data.split.aiSharePct}% khối lượng`,
          detail: `Kỳ trước ${data.split.aiSharePrevPct}%`,
          href: "/ai-workforce",
        },
      ]
    : [];

  const toneClass = {
    danger: "border-destructive/30 bg-destructive/5",
    warn: "border-amber-500/30 bg-amber-500/5",
    ok: "border-emerald-500/30 bg-emerald-500/5",
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ceo" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">CEO Command Center</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Toàn cảnh hiệu quả tổ chức: người, AI, kết quả và vấn đề cần xử lý.
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>{today}</div>
              <div className="mt-1 flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => void refetch()}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2"
                >
                  <RefreshCcw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Làm
                  mới
                </button>
                <button
                  onClick={() => void download("pdf")}
                  disabled={exporting !== null}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-60"
                >
                  {exporting === "pdf" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}{" "}
                  Tải PDF
                </button>
                <button
                  onClick={() => void download("xlsx")}
                  disabled={exporting !== null}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-60"
                >
                  {exporting === "xlsx" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}{" "}
                  Tải Excel
                </button>
              </div>
              <div className="mt-1 text-[11px]">Báo cáo tự chạy 7h sáng thứ Bảy hằng tuần.</div>
            </div>
          </div>

          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-1 rounded-xl border border-border bg-surface p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`min-h-11 rounded-lg px-4 text-sm font-medium transition-colors ${
                    period === p.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading || !data ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tổng hợp số liệu…
            </div>
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-3">
                {attention.map((a, i) => (
                  <Link
                    key={a.tag}
                    to={a.href}
                    className={`rounded-2xl border p-4 transition-colors hover:bg-surface-2 ${toneClass[a.tone]}`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <span className="tabular-nums">0{i + 1}</span> {a.tag}
                    </div>
                    <div className="mt-2 text-sm font-semibold">{a.title}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">{a.detail}</span>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card>
                  <div className="text-xs text-muted-foreground">Tổng công việc</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight">
                    {n(data.totals.tasks.current)}
                  </div>
                  <Delta value={data.totals.tasks.changePct} />
                </Card>
                <Card>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Hoàn thành
                  </div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight">
                    {n(data.totals.completed.current)}
                  </div>
                  <Delta value={data.totals.completed.changePct} />
                </Card>
                <Card>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Đang thực hiện
                  </div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight">
                    {n(data.totals.inProgress)}
                  </div>
                </Card>
                <Card>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" /> Quá hạn
                  </div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight text-destructive">
                    {n(data.totals.overdue)}
                  </div>
                </Card>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <Card title="Chuyển dịch Người ↔ AI">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <Row
                        label="Con người"
                        value={data.split.human}
                        tone="primary"
                        total={data.split.human + data.split.ai}
                      />
                      <Row
                        label="AI"
                        value={data.split.ai}
                        tone="accent"
                        total={data.split.human + data.split.ai}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex h-24 items-end gap-1">
                    {data.split.trend.map((b) => {
                      const max = Math.max(1, ...data.split.trend.map((x) => x.human + x.ai));
                      return (
                        <div
                          key={b.label}
                          className="flex min-w-0 flex-1 flex-col justify-end gap-0.5"
                          title={`${b.label}: người ${b.human} · AI ${b.ai}`}
                        >
                          <div
                            className="w-full rounded-t bg-violet-500/70"
                            style={{ height: `${(b.ai / max) * 70}%` }}
                          />
                          <div
                            className="w-full bg-primary/70"
                            style={{ height: `${(b.human / max) * 70}%` }}
                          />
                          <span className="truncate text-center text-[9px] text-muted-foreground">
                            {b.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card title="Thời gian làm việc">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border bg-surface-2 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="h-3.5 w-3.5" /> Con người
                      </div>
                      <div className="mt-1 text-2xl font-semibold">
                        {n(data.time.humanHours)} giờ
                      </div>
                      <div className="text-[11px] text-muted-foreground">ước tính</div>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-2 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Bot className="h-3.5 w-3.5" /> AI
                      </div>
                      <div className="mt-1 text-2xl font-semibold">{n(data.time.aiHours)} giờ</div>
                      <div className="text-[11px] text-muted-foreground">đo thật</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Giờ họp thực tế</span>
                      <span className="font-medium">{n(data.time.meetingHours)} giờ</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ước tính tiết kiệm</span>
                      <span className="font-medium">{n(data.time.savedHours)} giờ</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Đòn bẩy AI</span>
                      <span className="font-medium">
                        {data.time.leverage === null ? "—" : `${data.time.leverage}×`}
                      </span>
                    </div>
                  </div>
                </Card>

                <Card title="Chất lượng kết quả">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Việc tạo trong kỳ</span>
                      <span className="font-medium">{n(data.quality.tasksCreated)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Có kết quả</span>
                      <span className="font-medium">{n(data.quality.withResult)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Đã review</span>
                      <span className="font-medium">{n(data.quality.reviewed)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Review đạt</span>
                      <span className="font-medium">{n(data.quality.passed)}</span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Bar label="Tỉ lệ việc có kết quả" value={data.quality.resultRate} />
                    <Bar label="Tỉ lệ kết quả đạt" value={data.quality.passRate} />
                  </div>
                </Card>
              </div>

              <Card title="Thời gian làm việc từng nhân sự (người và AI)">
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2">Nhân sự</th>
                        <th className="pb-2">Loại</th>
                        <th className="pb-2 text-right">Việc</th>
                        <th className="pb-2 text-right">Hoàn thành</th>
                        <th className="pb-2 text-right">Giờ</th>
                        <th className="pb-2 text-right">Đạt review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.people.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">
                            Chưa có dữ liệu trong kỳ này.
                          </td>
                        </tr>
                      ) : (
                        data.people.map((p) => (
                          <tr key={`${p.kind}-${p.id}`} className="border-b border-border/60">
                            <td className="py-2 pr-2 font-medium">{p.name}</td>
                            <td className="py-2 pr-2">
                              <Badge variant={p.kind === "ai" ? "secondary" : "outline"}>
                                {p.kind === "ai" ? "AI" : "Người"}
                              </Badge>
                            </td>
                            <td className="py-2 text-right tabular-nums">{n(p.tasks)}</td>
                            <td className="py-2 text-right tabular-nums">{n(p.completed)}</td>
                            <td className="py-2 text-right tabular-nums">
                              {n(p.hours)}
                              {p.hoursEstimated ? "*" : ""}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {p.reviewPassRate === null ? "—" : `${p.reviewPassRate}%`}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  * Giờ người là ước tính: giờ họp thực tế cộng số việc hoàn thành nhân 2 giờ. Hệ
                  thống chưa có chấm công.
                </p>
              </Card>

              <div className="grid gap-3 lg:grid-cols-2">
                <Card title="Công việc theo bộ phận">
                  {data.departments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {data.departments.map((d) => {
                        const max = Math.max(1, ...data.departments.map((x) => x.total));
                        return (
                          <div key={d.id}>
                            <div className="flex justify-between text-sm">
                              <span className="min-w-0 truncate">{d.name}</span>
                              <span className="tabular-nums text-muted-foreground">
                                {n(d.human)} / {n(d.ai)} · {n(d.total)}
                              </span>
                            </div>
                            <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-2">
                              <div
                                className="bg-primary"
                                style={{ width: `${(d.human / max) * 100}%` }}
                              />
                              <div
                                className="bg-violet-500"
                                style={{ width: `${(d.ai / max) * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                <Card title="Vấn đề cần xử lý">
                  {data.issues.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Không có vấn đề nổi bật.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {data.issues.map((i) => (
                        <li key={i.id}>
                          <Link
                            to={i.href}
                            className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{i.title}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {i.detail}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              {typeof i.progressPct === "number" ? (
                                <ProgressPill value={i.progressPct} />
                              ) : null}
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <KpiSettings data={data} onSaved={() => void refetch()} />

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card>
                  <div className="text-xs text-muted-foreground">Đề xuất trong kỳ</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight">
                    {n(data.proposals.total.current)}
                  </div>
                  <Delta value={data.proposals.total.changePct} />
                </Card>
                <Card>
                  <div className="text-xs text-muted-foreground">Đề xuất giao việc</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight">
                    {n(data.proposals.assignment)}
                  </div>
                  <div className="text-xs text-muted-foreground">gắn với công việc thật</div>
                </Card>
                <Card>
                  <div className="text-xs text-muted-foreground">Đã duyệt & thực thi</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight">
                    {n(data.proposals.executed)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {data.proposals.executionRate === null
                      ? "—"
                      : `${data.proposals.executionRate}% số đề xuất`}
                  </div>
                </Card>
                <Card>
                  <div className="text-xs text-muted-foreground">Chờ duyệt / bị từ chối</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight">
                    {n(data.proposals.pending)} / {n(data.proposals.rejected)}
                  </div>
                  <Link to="/ai-brain" className="text-xs text-primary hover:underline">
                    Mở Bộ não AI
                  </Link>
                </Card>
              </div>

              <Card title="Nhật ký đề xuất giao việc">
                <div className="mb-3 flex items-center gap-2">
                  <label className="text-xs text-muted-foreground" htmlFor="dept-filter">
                    Bộ phận
                  </label>
                  <select
                    id="dept-filter"
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="min-h-11 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="all">Tất cả bộ phận</option>
                    <option value="none">Chưa gắn bộ phận</option>
                    {data.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                {(() => {
                  const filtered =
                    deptFilter === "all"
                      ? data.proposals.entries
                      : deptFilter === "none"
                        ? data.proposals.entries.filter((p) => !p.workspaceId)
                        : data.proposals.entries.filter((p) => p.workspaceId === deptFilter);
                  return filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Chưa có đề xuất nào.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {filtered.map((p) => (
                        <li
                          key={p.id}
                          className="rounded-lg border border-border px-3 py-2 text-sm sm:flex sm:items-center sm:justify-between sm:gap-3"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{p.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {p.actionType}
                              {p.workerName ? ` · ${p.workerName}` : ""}
                              {p.taskTitle ? ` · ${p.taskTitle}` : ""} ·{" "}
                              {new Date(p.createdAt).toLocaleDateString("vi-VN")}
                            </span>
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0 sm:shrink-0">
                            {typeof p.taskProgressPct === "number" ? (
                              <ProgressPill value={p.taskProgressPct} />
                            ) : null}
                            {p.taskDueAt ? (
                              <span className="text-xs text-muted-foreground">
                                hạn {new Date(p.taskDueAt).toLocaleDateString("vi-VN")}
                              </span>
                            ) : null}
                            <Badge variant={STATUS_TONE[p.status] ?? "secondary"}>
                              {STATUS_LABEL[p.status] ?? p.status}
                            </Badge>
                            {p.taskId ? (
                              <Link
                                to="/tasks/$id"
                                params={{ id: p.taskId }}
                                className="inline-flex min-h-11 items-center text-xs text-primary hover:underline"
                              >
                                Xem việc
                              </Link>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </Card>

              <Card title="Bốn câu hỏi của CEO">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Answer
                    icon={User}
                    q="Chúng ta đã bỏ ra những nguồn lực gì?"
                    items={data.answers.resources}
                  />
                  <Answer
                    icon={CheckCircle2}
                    q="Những nguồn lực ấy tạo ra sản phẩm cụ thể nào?"
                    items={data.answers.outputs}
                  />
                  <Answer
                    icon={Timer}
                    q="Sản phẩm đó tạo ra thay đổi và giá trị gì?"
                    items={data.answers.changes}
                  />
                  <Answer
                    icon={Bot}
                    q="Thay đổi ấy tạo ra giá trị kinh tế hay năng lực nào?"
                    items={data.answers.value}
                  />
                </div>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "primary" | "accent";
}) {
  const p = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {value.toLocaleString("vi-VN")} ({p}%)
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={tone === "primary" ? "h-full bg-primary" : "h-full bg-violet-500"}
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value === null ? "—" : `${value}%`}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-primary" style={{ width: `${Math.min(100, value ?? 0)}%` }} />
      </div>
    </div>
  );
}

function Answer({ icon: Icon, q, items }: { icon: typeof User; q: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm font-medium leading-snug">{q}</p>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
