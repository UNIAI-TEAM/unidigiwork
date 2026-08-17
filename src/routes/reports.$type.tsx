import { createFileRoute, Link } from "@tanstack/react-router";
import type { Key } from "@/lib/i18n";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Filter,
  Download,
  Share2,
  Save,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Sparkles,
  FileSpreadsheet,
  FileImage,
  FileText,
  ChevronDown,
  BarChart3,
  PieChart,
  Table as TableIcon,
  Folder,
  Users as UsersIcon,
  Activity,
  CheckCircle2,
  Video,
  GitBranch,
  Cpu,
  Settings,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";
import { notifyComingSoon } from "@/lib/coming-soon";

const TYPES = [
  "overview",
  "projects",
  "team",
  "productivity",
  "collab",
  "workflows",
  "system",
  "custom",
] as const;
type RType = (typeof TYPES)[number];

export const Route = createFileRoute("/reports/$type")({
  head: ({ params }) => ({
    meta: [
      { title: `Report · ${params.type} · UNIWORK` },
      { name: "description", content: "Chi tiết báo cáo với bộ lọc và drill-down." },
    ],
  }),
  component: ReportDetailPage,
});

const TYPE_META: Record<
  RType,
  { icon: LucideIcon; metric: string; unit: string; total: number; delta: number }
> = {
  overview: { icon: BarChart3, metric: "Active sessions", unit: "", total: 12480, delta: 12.5 },
  projects: { icon: Folder, metric: "Projects", unit: "", total: 72, delta: 9.7 },
  team: { icon: UsersIcon, metric: "Team members", unit: "", total: 248, delta: 4.2 },
  productivity: { icon: Activity, metric: "Tasks / user", unit: "", total: 14.2, delta: 6.8 },
  collab: { icon: Video, metric: "Meetings", unit: "", total: 482, delta: -2.3 },
  workflows: { icon: GitBranch, metric: "Workflow runs", unit: "", total: 1832, delta: 18.4 },
  system: { icon: Cpu, metric: "Uptime", unit: "%", total: 99.94, delta: 0.02 },
  custom: { icon: Settings, metric: "Custom metric", unit: "", total: 0, delta: 0 },
};

const BREAKDOWN: Record<RType, { name: string; value: number; delta: number; color: string }[]> = {
  overview: [
    { name: "Engineering", value: 4820, delta: 14.2, color: "#3b82f6" },
    { name: "Product", value: 3110, delta: 8.7, color: "#22c55e" },
    { name: "Marketing", value: 1980, delta: -3.1, color: "#f59e0b" },
    { name: "Sales", value: 1640, delta: 11.5, color: "#a855f7" },
    { name: "Operations", value: 930, delta: 4.4, color: "#ef4444" },
  ],
  projects: [
    { name: "On track", value: 28, delta: 7.7, color: "#22c55e" },
    { name: "At risk", value: 26, delta: -4.2, color: "#f59e0b" },
    { name: "Delayed", value: 12, delta: -8.0, color: "#ef4444" },
    { name: "Completed", value: 6, delta: 20.0, color: "#3b82f6" },
  ],
  team: [
    { name: "Engineering", value: 86, delta: 5.2, color: "#3b82f6" },
    { name: "Product", value: 42, delta: 2.4, color: "#22c55e" },
    { name: "Design", value: 28, delta: 3.6, color: "#a855f7" },
    { name: "Marketing", value: 36, delta: 1.1, color: "#f59e0b" },
    { name: "Sales", value: 38, delta: 6.6, color: "#ef4444" },
    { name: "Ops", value: 18, delta: 0.0, color: "#06b6d4" },
  ],
  productivity: [
    { name: "Engineering", value: 18.4, delta: 9.2, color: "#3b82f6" },
    { name: "Product", value: 15.1, delta: 6.0, color: "#22c55e" },
    { name: "Marketing", value: 11.3, delta: 2.4, color: "#f59e0b" },
    { name: "Sales", value: 13.7, delta: 7.8, color: "#a855f7" },
    { name: "Ops", value: 9.6, delta: -1.2, color: "#ef4444" },
  ],
  collab: [
    { name: "Stand-ups", value: 184, delta: 2.1, color: "#3b82f6" },
    { name: "1:1s", value: 132, delta: 4.8, color: "#22c55e" },
    { name: "Reviews", value: 98, delta: -3.4, color: "#f59e0b" },
    { name: "Workshops", value: 68, delta: 12.0, color: "#a855f7" },
  ],
  workflows: [
    { name: "HR", value: 620, delta: 22.4, color: "#22c55e" },
    { name: "IT", value: 480, delta: 16.1, color: "#3b82f6" },
    { name: "Finance", value: 360, delta: 8.7, color: "#f59e0b" },
    { name: "Sales", value: 230, delta: 11.2, color: "#a855f7" },
    { name: "Other", value: 142, delta: 2.0, color: "#ef4444" },
  ],
  system: [
    { name: "API", value: 99.98, delta: 0.01, color: "#22c55e" },
    { name: "Realtime", value: 99.92, delta: 0.04, color: "#3b82f6" },
    { name: "Storage", value: 99.96, delta: 0.0, color: "#a855f7" },
    { name: "AI Gateway", value: 99.88, delta: -0.05, color: "#f59e0b" },
  ],
  custom: [],
};

function ReportDetailPage() {
  const { t } = useI18n();
  const { type } = Route.useParams();
  const rtype = (TYPES.includes(type as RType) ? type : "overview") as RType;
  const meta = TYPE_META[rtype];
  const data = BREAKDOWN[rtype];

  const [open, setOpen] = useSidebarState();
  const [gran, setGran] = useState<"d" | "w" | "m">("w");
  const [compare, setCompare] = useState(true);
  const [workspace, setWorkspace] = useState("all");
  const [dept, setDept] = useState("all");
  const [team, setTeam] = useState("all");
  const [dim, setDim] = useState<"dept" | "team" | "user">("dept");

  // Generate synthetic time series based on granularity
  const series = useMemo(() => {
    const n = gran === "d" ? 14 : gran === "w" ? 12 : 6;
    const labels = Array.from({ length: n }, (_, i) =>
      gran === "d" ? `D${i + 1}` : gran === "w" ? `W${i + 1}` : `M${i + 1}`,
    );
    const base = meta.total / 10;
    const cur = labels.map(
      (_, i) =>
        Math.round(base * (0.7 + Math.sin(i / 1.5 + (rtype.length % 3)) * 0.18 + i * 0.04) * 10) /
        10,
    );
    const prev = labels.map((_, i) => Math.round(cur[i] * (0.78 + ((i * 7) % 11) / 60) * 10) / 10);
    return { labels, cur, prev };
  }, [gran, rtype, meta.total]);

  const Icon = meta.icon;
  const total = data.reduce((s, d) => s + d.value, 0) || meta.total;

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="reports" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {/* Breadcrumb + header */}
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Link to="/reports" className="flex items-center gap-1 hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> {t("rp.det.back")}
              </Link>
              <span>/</span>
              <Link to="/reports" className="hover:text-foreground">
                {t("rp.det.crumb")}
              </Link>
              <span>/</span>
              <span className="text-foreground">{t(`rp.tab.${rtype}` as Key)}</span>
            </div>

            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{t(`rp.tab.${rtype}` as Key)}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">{t("rp.det.sub")}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => notifyComingSoon()} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                  <Save className="h-4 w-4" /> {t("rp.det.save")}
                </button>
                <button onClick={() => notifyComingSoon()} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                  <Share2 className="h-4 w-4" /> {t("rp.det.share")}
                </button>
                <button onClick={() => notifyComingSoon()} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                  <Download className="h-4 w-4" /> {t("rp.det.export")}
                </button>
              </div>
            </div>

            {/* Filter bar */}
            <div className="mb-4 rounded-2xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" /> {t("rp.det.filters")}
                </span>
                <button onClick={() => notifyComingSoon()} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:text-foreground">
                  <Calendar className="h-3.5 w-3.5" /> 01/06/2026 – 10/06/2026
                </button>
                <Select
                  value={gran}
                  onChange={(v) => setGran(v as "d" | "w" | "m")}
                  options={[
                    { value: "d", label: t("rp.det.gran.d") },
                    { value: "w", label: t("rp.det.gran.w") },
                    { value: "m", label: t("rp.det.gran.m") },
                  ]}
                  label={t("rp.det.gran")}
                />
                <Select
                  value={workspace}
                  onChange={setWorkspace}
                  options={[
                    { value: "all", label: t("rp.flt.allws") },
                    { value: "uniwork", label: "UNIWORK" },
                    { value: "lab", label: "Innovation Lab" },
                  ]}
                />
                <Select
                  value={dept}
                  onChange={setDept}
                  options={[
                    { value: "all", label: t("rp.flt.alldep") },
                    { value: "eng", label: "Engineering" },
                    { value: "prod", label: "Product" },
                    { value: "mkt", label: "Marketing" },
                  ]}
                />
                <Select
                  value={team}
                  onChange={setTeam}
                  options={[
                    { value: "all", label: t("rp.flt.allteam") },
                    { value: "a", label: "Team A" },
                    { value: "b", label: "Team B" },
                  ]}
                />
                <label className="ml-1 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={compare}
                    onChange={(e) => setCompare(e.target.checked)}
                    className="accent-primary"
                  />
                  {t("rp.det.compare")}
                </label>
                <button onClick={() => notifyComingSoon()} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                  <RefreshCw className="h-3.5 w-3.5" /> {t("rp.det.reset")}
                </button>
              </div>
            </div>

            {/* KPI summary */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryKpi
                label={meta.metric}
                value={`${meta.total.toLocaleString()}${meta.unit}`}
                delta={meta.delta}
              />
              <SummaryKpi
                label={t("rp.det.this")}
                value={series.cur.reduce((a, b) => a + b, 0).toFixed(0)}
                delta={meta.delta}
              />
              <SummaryKpi
                label={t("rp.det.prev")}
                value={series.prev.reduce((a, b) => a + b, 0).toFixed(0)}
                delta={-Math.abs(meta.delta / 2)}
              />
              <SummaryKpi
                label={t("rp.det.summary")}
                value={`${data.length} ${t("rp.det.col.name").toLowerCase()}`}
                delta={0}
              />
            </div>

            {/* Trend + Distribution */}
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader
                  title={t("rp.det.trend")}
                  right={
                    <span className="text-xs text-muted-foreground">
                      {t(`rp.det.gran.${gran}` as Key)}
                    </span>
                  }
                />
                <TrendChart
                  labels={series.labels}
                  cur={series.cur}
                  prev={compare ? series.prev : null}
                />
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <Legend color="bg-primary" label={t("rp.det.this")} />
                  {compare && <Legend color="bg-muted-foreground/60" label={t("rp.det.prev")} />}
                </div>
              </Card>

              <Card>
                <CardHeader title={t("rp.det.dist")} />
                <Donut
                  total={total}
                  segments={data.map((d) => ({ color: d.color, pct: (d.value / total) * 100 }))}
                />
                <div className="mt-3 space-y-1.5">
                  {data.slice(0, 5).map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                        <span className="truncate">{d.name}</span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {((d.value / total) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Breakdown bar + table */}
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader
                  title={t("rp.det.break")}
                  right={
                    <Select
                      value={dim}
                      onChange={(v) => setDim(v as "dept" | "team" | "user")}
                      options={[
                        { value: "dept", label: "Department" },
                        { value: "team", label: "Team" },
                        { value: "user", label: "User" },
                      ]}
                      label={t("rp.det.dim")}
                    />
                  }
                />
                <BarBreakdown data={data} />
              </Card>

              <Card>
                <CardHeader
                  title={t("rp.det.top")}
                  right={
                    <button onClick={() => notifyComingSoon()} className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                      <TableIcon className="h-3 w-3" /> {t("rp.det.viewraw")}
                    </button>
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">{t("rp.det.col.name")}</th>
                        <th className="py-2 pr-2 text-right font-medium">
                          {t("rp.det.col.value")}
                        </th>
                        <th className="py-2 pr-2 text-right font-medium">
                          {t("rp.det.col.share")}
                        </th>
                        <th className="py-2 text-right font-medium">{t("rp.det.col.delta")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-6 text-center text-sm text-muted-foreground"
                          >
                            {t("rp.det.empty")}
                          </td>
                        </tr>
                      ) : (
                        data.map((d) => (
                          <tr
                            key={d.name}
                            className="border-b border-border/50 last:border-0 hover:bg-surface-2/40"
                          >
                            <td className="py-2 pr-2">
                              <span className="flex items-center gap-2">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: d.color }}
                                />
                                {d.name}
                              </span>
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {d.value.toLocaleString()}
                              {meta.unit}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
                              {((d.value / total) * 100).toFixed(1)}%
                            </td>
                            <td className="py-2 text-right">
                              <span
                                className={`inline-flex items-center gap-0.5 tabular-nums ${d.delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                              >
                                {d.delta >= 0 ? (
                                  <TrendingUp className="h-3 w-3" />
                                ) : (
                                  <TrendingDown className="h-3 w-3" />
                                )}
                                {Math.abs(d.delta).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </main>

          {/* Right panel */}
          <aside className="hidden w-80 shrink-0 border-l border-border bg-surface/40 px-4 py-5 lg:block">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("rp.det.ai")}</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("rp.det.aisub")}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {data.slice(0, 3).map((d) => (
                  <li key={d.name} className="rounded-lg bg-surface-2 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{d.name}</span>
                      <span
                        className={`text-xs ${d.delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                      >
                        {d.delta >= 0 ? "+" : ""}
                        {d.delta.toFixed(1)}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {d.delta >= 0
                        ? `Tăng trưởng tốt so với kỳ trước.`
                        : `Cần theo dõi — có dấu hiệu suy giảm.`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold">{t("rp.det.export")}</h3>
              <div className="mt-3 space-y-2">
                <ExportBtn icon={FileImage} label="PDF" />
                <ExportBtn icon={FileSpreadsheet} label="Excel" />
                <ExportBtn icon={FileText} label="CSV" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ---------- Small components ---------- */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>{children}</div>
  );
}
function CardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {right}
    </div>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
function SummaryKpi({ label, value, delta }: { label: string; value: string; delta: number }) {
  const up = delta >= 0;
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {delta !== 0 && (
        <div
          className={`mt-1 inline-flex items-center gap-0.5 text-xs ${up ? "text-emerald-400" : "text-rose-400"}`}
        >
          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(delta).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg bg-surface-2 px-3 py-1.5 pr-7 text-sm text-foreground focus:outline-none"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
function ExportBtn({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button onClick={() => notifyComingSoon()} className="flex w-full items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-2/70">
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      <Download className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

/* ---------- Charts ---------- */

function TrendChart({
  labels,
  cur,
  prev,
}: {
  labels: string[];
  cur: number[];
  prev: number[] | null;
}) {
  const W = 600,
    H = 180,
    P = 24;
  const all = [...cur, ...(prev ?? [])];
  const max = Math.max(...all) * 1.15 || 1;
  const min = 0;
  const step = (W - P * 2) / Math.max(labels.length - 1, 1);
  const toPath = (arr: number[]) =>
    arr
      .map((v, i) => {
        const x = P + i * step;
        const y = H - P - ((v - min) / (max - min)) * (H - P * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  const areaPath = (arr: number[]) =>
    `${toPath(arr)} L ${P + (arr.length - 1) * step},${H - P} L ${P},${H - P} Z`;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full">
        <defs>
          <linearGradient id="rd-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={P}
            x2={W - P}
            y1={P + g * (H - P * 2)}
            y2={P + g * (H - P * 2)}
            stroke="currentColor"
            strokeOpacity="0.08"
          />
        ))}
        {prev && (
          <path
            d={toPath(prev)}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
        )}
        <path d={areaPath(cur)} fill="url(#rd-grad)" />
        <path d={toPath(cur)} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
        {cur.map((v, i) => {
          const x = P + i * step;
          const y = H - P - ((v - min) / (max - min)) * (H - P * 2);
          return <circle key={i} cx={x} cy={y} r="2.5" fill="hsl(var(--primary))" />;
        })}
        {labels.map((l, i) => (
          <text
            key={l}
            x={P + i * step}
            y={H - 6}
            textAnchor="middle"
            fontSize="9"
            fill="currentColor"
            fillOpacity="0.5"
          >
            {l}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Donut({ total, segments }: { total: number; segments: { color: string; pct: number }[] }) {
  let acc = 0;
  const stops = segments
    .map((s) => {
      const start = acc;
      acc += s.pct;
      return `${s.color} ${start}% ${acc}%`;
    })
    .join(", ");
  return (
    <div className="flex items-center justify-center">
      <div
        className="relative h-36 w-36 rounded-full"
        style={{ background: `conic-gradient(${stops || "hsl(var(--muted)) 0% 100%"})` }}
      >
        <div className="absolute inset-3 grid place-items-center rounded-full bg-surface">
          <div className="text-center">
            <div className="text-lg font-semibold tabular-nums">
              {Math.round(total).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">total</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BarBreakdown({
  data,
}: {
  data: { name: string; value: number; color: string; delta: number }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">—</div>;
  }
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.name}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="truncate">{d.name}</span>
            <span className="tabular-nums text-muted-foreground">{d.value.toLocaleString()}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
