import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { Key } from "@/lib/i18n";
import { useState } from "react";
import {
  Plus,
  Calendar,
  Settings,
  MoreHorizontal,
  ArrowUpRight,
  Users as UsersIcon,
  Activity,
  Folder,
  CheckCircle2,
  Video,
  TrendingUp,
  AlertTriangle,
  Info,
  Sparkles,
  FileText,
  BarChart3,
  Database,
  Globe,
  Cpu,
  ChevronDown,
  FileImage,
  FileSpreadsheet,
  TrendingDown,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getReportOverview,
  getReportDepartments,
  type ReportOverview,
} from "@/lib/api/reports.functions";
import { exportReportCsv, exportReportPdf } from "@/lib/reports-export";
import { toast } from "sonner";
import { Table2, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/reports/")({
  head: () => ({
    meta: [
      { title: "Reports · UNIWORK" },
      { name: "description", content: "Báo cáo và phân tích hiệu suất trên UNIWORK." },
    ],
  }),
  component: ReportsPage,
});

const TABS = [
  "overview",
  "projects",
  "team",
  "productivity",
  "collab",
  "workflows",
  "system",
  "custom",
] as const;
type Tab = (typeof TABS)[number];

const todayKey = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const shiftDay = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayCount = (from: string, to: string) =>
  Math.max(
    1,
    Math.round(
      (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000,
    ) + 1,
  );
const fmtDay = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

function RangePicker({
  range,
  onChange,
  compare,
  onCompareChange,
  prev,
  days,
  t,
}: {
  range: { from: string; to: string };
  onChange: (r: { from: string; to: string }) => void;
  compare: boolean;
  onCompareChange: (v: boolean) => void;
  prev: { from: string; to: string };
  days: number;
  t: (k: Key) => string;
}) {
  const [open, setOpen] = useState(false);
  const presets = [7, 30, 90];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <Calendar className="h-4 w-4" />
        <span className="text-foreground">
          {fmtDay(range.from)} – {fmtDay(range.to)}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-border bg-surface p-3 shadow-lg">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("rp.range.custom")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">
                {t("rp.range.from")}
                <input
                  type="date"
                  value={range.from}
                  max={range.to}
                  onChange={(e) => e.target.value && onChange({ ...range, from: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                {t("rp.range.to")}
                <input
                  type="date"
                  value={range.to}
                  min={range.from}
                  max={todayKey()}
                  onChange={(e) => e.target.value && onChange({ ...range, to: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t("rp.range.preset")}:</span>
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => onChange({ from: shiftDay(todayKey(), -(p - 1)), to: todayKey() })}
                  className={`rounded-md px-2 py-1 text-xs ${
                    days === p ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p} {t("rp.dd.days")}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm">
              <input
                type="checkbox"
                checked={compare}
                onChange={(e) => onCompareChange(e.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span className="text-muted-foreground">{t("rp.range.compare")}</span>
            </label>
            {compare && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {fmtDay(prev.from)} – {fmtDay(prev.to)} ({days} {t("rp.dd.days")})
              </p>
            )}
            <button
              onClick={() => setOpen(false)}
              className="mt-3 w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t("rp.range.apply")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ReportsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useSidebarState();
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState(() => ({ from: shiftDay(todayKey(), -29), to: todayKey() }));
  const [compare, setCompare] = useState(true);
  const days = dayCount(range.from, range.to);
  const fromISO = new Date(`${range.from}T00:00:00`).toISOString();
  const toISO = new Date(`${range.to}T23:59:59.999`).toISOString();
  const prev = { from: shiftDay(range.from, -days), to: shiftDay(range.to, -days) };
  const drill = (s?: "todo" | "in_progress" | "blocked" | "done" | "canceled", wsId?: string) =>
    navigate({ to: "/reports/detail", search: { from: fromISO, to: toISO, status: s, workspaceId: wsId } });
  const fetchOverview = useServerFn(getReportOverview);
  const {
    data: report,
    isPending,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["report-overview", fromISO, toISO],
    queryFn: () => fetchOverview({ data: { from: fromISO, to: toISO } }),
    staleTime: 60_000,
  });
  const k = report?.kpis;
  const st = report?.tasks_by_status;
  const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const delta = (cur = 0, prev = 0) =>
    prev === 0 ? (cur > 0 ? "+100%" : "0%") : `${cur - prev >= 0 ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}%`;
  const cmp = (cur = 0, previous = 0) => (compare ? delta(cur, previous) : "—");
  const nf = (n?: number) => (n ?? 0).toLocaleString("vi-VN");
  const wsRows = report?.workspaces ?? [];
  const health = {
    ontrack: wsRows.filter((w) => w.status === "ontrack").length,
    risk: wsRows.filter((w) => w.status === "risk").length,
    not: wsRows.filter((w) => w.status === "not_started").length,
  };
  const wsTotal = wsRows.length;

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="reports" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {/* Header */}
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">{t("rp.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("rp.sub")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RangePicker
                  range={range}
                  onChange={setRange}
                  compare={compare}
                  onCompareChange={setCompare}
                  prev={prev}
                  days={days}
                  t={t}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                      <Settings className="h-4 w-4" /> {t("rp.customize")}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuCheckboxItem
                      checked={compare}
                      onCheckedChange={(v) => setCompare(Boolean(v))}
                    >
                      So sánh kỳ trước
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    {[7, 30, 90].map((d) => (
                      <DropdownMenuItem
                        key={d}
                        onSelect={() =>
                          setRange({ from: shiftDay(todayKey(), -(d - 1)), to: todayKey() })
                        }
                      >
                        {d} ngày gần nhất
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  disabled={isFetching}
                  onClick={async () => {
                    const r = await refetch();
                    if (r.error) toast.error(t("rp.refresh.error"));
                    else toast.success(t("rp.refresh.done"));
                  }}
                  className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                  {isFetching ? t("rp.refresh.loading") : t("rp.refresh")}
                </button>
                <button
                  disabled={!report}
                  onClick={() => {
                    if (!report) return;
                    exportReportCsv(report, exportMeta());
                    toast.success(t("rp.export.done"));
                  }}
                  className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <Table2 className="h-4 w-4" /> {t("rp.export.csv")}
                </button>
                <button
                  disabled={!report}
                  onClick={() => {
                    if (!report) return;
                    const ok = exportReportPdf(report, exportMeta());
                    if (!ok) toast.error(t("rp.export.blocked"));
                  }}
                  className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <FileText className="h-4 w-4" /> {t("rp.export.pdf")}
                </button>
                <Link
                  to="/reports/$type"
                  params={{ type: tab }}
                  className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <ArrowUpRight className="h-4 w-4" /> {t("rp.drill")}
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Thao tác khác"
                      className="rounded-lg bg-surface p-2 text-muted-foreground hover:text-foreground"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      onSelect={() => {
                        void refetch();
                        toast.success(t("rp.refresh.done"));
                      }}
                    >
                      {t("rp.refresh")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!report}
                      onSelect={() => {
                        if (!report) return;
                        exportReportCsv(report, exportMeta());
                        toast.success(t("rp.export.done"));
                      }}
                    >
                      {t("rp.export.csv")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!report}
                      onSelect={() => {
                        if (!report) return;
                        const ok = exportReportPdf(report, exportMeta());
                        if (!ok) toast.error(t("rp.export.blocked"));
                      }}
                    >
                      {t("rp.export.pdf")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => drill()}>{t("rp.drill")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Tabs */}
            <div className="mb-5 flex flex-wrap gap-1 overflow-x-auto border-b border-border">
              {TABS.map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                    tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(`rp.tab.${k}` as Key)}
                  {tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
                </button>
              ))}
            </div>

            {/* KPI cards */}
            {compare && (
              <p className="mb-2 text-xs text-muted-foreground">
                {t("rp.range.compareOn")}: {fmtDay(prev.from)} – {fmtDay(prev.to)} ({days} {t("rp.dd.days")})
              </p>
            )}
            {dataUpdatedAt > 0 && (
              <p className="mb-2 text-xs text-muted-foreground">
                {t("rp.refresh.at")}: {new Date(dataUpdatedAt).toLocaleTimeString("vi-VN")}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Kpi
                icon={UsersIcon}
                label={t("rp.kpi.users")}
                value={isPending ? "…" : nf(k?.users)}
                delta="—"
                tone="text-primary"
                t={t}
              />
              <Kpi
                icon={Activity}
                label={t("rp.kpi.active")}
                value={isPending ? "…" : nf(k?.active_users)}
                delta="—"
                tone="text-emerald-300"
                t={t}
              />
              <Kpi
                icon={Folder}
                label={t("rp.kpi.projects")}
                value={isPending ? "…" : nf(k?.workspaces)}
                delta={cmp(k?.ws_cur, k?.ws_prev)}
                tone="text-sky-300"
                t={t}
              />
              <Kpi
                icon={CheckCircle2}
                label={t("rp.kpi.tasks")}
                value={isPending ? "…" : nf(st?.done)}
                delta={cmp(k?.tasks_cur, k?.tasks_prev)}
                tone="text-amber-300"
                t={t}
              />
              <Kpi
                icon={Video}
                label={t("rp.kpi.meetings")}
                value={isPending ? "…" : nf(k?.meetings)}
                delta={cmp(k?.meetings_cur, k?.meetings_prev)}
                tone="text-violet-300"
                t={t}
              />
            </div>

            {/* Activity / Tasks / Health row */}
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-1">
                <CardHeader
                  title={t("rp.act.title")}
                  right={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted-foreground">
                          {days} {t("rp.dd.days")} <ChevronDown className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {[7, 30, 90].map((d) => (
                          <DropdownMenuItem
                            key={d}
                            onSelect={() =>
                              setRange({ from: shiftDay(todayKey(), -(d - 1)), to: todayKey() })
                            }
                          >
                            {d} {t("rp.dd.days")}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
                <LineChart data={report?.activity ?? []} />
                <Legend
                  items={[
                    { c: "bg-violet-400", l: t("rp.tasks.title") },
                    { c: "bg-emerald-400", l: t("rp.act.tasks") },
                    { c: "bg-sky-400", l: t("rp.act.meet") },
                    { c: "bg-amber-400", l: t("rp.act.files") },
                  ]}
                />
              </Card>

              <Card>
                <CardHeader title={t("rp.tasks.title")} />
                <div className="flex items-center gap-4">
                  <Donut
                    total={st?.total ?? 0}
                    totalLabel={t("rp.tasks.total")}
                    segments={[
                      { color: "#22c55e", pct: pct(st?.done ?? 0, st?.total ?? 0), title: t("rp.tasks.completed"), onClick: () => drill("done") },
                      { color: "#3b82f6", pct: pct(st?.in_progress ?? 0, st?.total ?? 0), title: t("rp.tasks.progress"), onClick: () => drill("in_progress") },
                      { color: "#f59e0b", pct: pct(st?.todo ?? 0, st?.total ?? 0), title: t("rp.tasks.todo"), onClick: () => drill("todo") },
                      { color: "#ef4444", pct: pct(st?.blocked ?? 0, st?.total ?? 0), title: t("rp.tasks.blocked"), onClick: () => drill("blocked") },
                    ]}
                  />
                  <div className="flex-1 space-y-2 text-sm">
                    <DonutRow
                      color="bg-emerald-500"
                      label={t("rp.tasks.completed")}
                      onClick={() => drill("done")}
                      value={`${pct(st?.done ?? 0, st?.total ?? 0)}% (${st?.done ?? 0})`}
                    />
                    <DonutRow
                      color="bg-sky-500"
                      label={t("rp.tasks.progress")}
                      onClick={() => drill("in_progress")}
                      value={`${pct(st?.in_progress ?? 0, st?.total ?? 0)}% (${st?.in_progress ?? 0})`}
                    />
                    <DonutRow
                      color="bg-amber-500"
                      label={t("rp.tasks.todo")}
                      onClick={() => drill("todo")}
                      value={`${pct(st?.todo ?? 0, st?.total ?? 0)}% (${st?.todo ?? 0})`}
                    />
                    <DonutRow
                      color="bg-rose-500"
                      label={t("rp.tasks.blocked")}
                      onClick={() => drill("blocked")}
                      value={`${pct(st?.blocked ?? 0, st?.total ?? 0)}% (${st?.blocked ?? 0})`}
                    />
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title={t("rp.health.title")} />
                <div className="flex items-center gap-4">
                  <Donut
                    total={wsTotal}
                    totalLabel={t("rp.health.total")}
                    segments={[
                      { color: "#22c55e", pct: pct(health.ontrack, wsTotal) },
                      { color: "#f59e0b", pct: pct(health.risk, wsTotal) },
                      { color: "#ef4444", pct: 0 },
                      { color: "#64748b", pct: pct(health.not, wsTotal) },
                    ]}
                  />
                  <div className="flex-1 space-y-2 text-sm">
                    <DonutRow
                      color="bg-emerald-500"
                      label={t("rp.health.ontrack")}
                      value={`${pct(health.ontrack, wsTotal)}% (${health.ontrack})`}
                    />
                    <DonutRow
                      color="bg-amber-500"
                      label={t("rp.health.risk")}
                      value={`${pct(health.risk, wsTotal)}% (${health.risk})`}
                    />
                    <DonutRow
                      color="bg-slate-500"
                      label={t("rp.health.not")}
                      value={`${pct(health.not, wsTotal)}% (${health.not})`}
                    />
                  </div>
                </div>
              </Card>
            </div>

            {/* Top projects / collab / workload */}
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card>
                <CardHeader title={t("rp.top.title")} />
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 text-left font-medium">{t("rp.top.project")}</th>
                      <th className="pb-2 text-left font-medium">{t("rp.top.progress")}</th>
                      <th className="pb-2 text-left font-medium">{t("rp.top.tasks")}</th>
                      <th className="pb-2 text-left font-medium">{t("rp.top.members")}</th>
                      <th className="pb-2 text-left font-medium">{t("rp.top.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wsRows.slice(0, 6).map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => drill(undefined, p.id)}
                        className="cursor-pointer border-t border-border transition-colors hover:bg-surface-2"
                      >
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[11px] font-semibold text-primary-foreground">
                              {p.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="whitespace-nowrap font-medium">{p.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${p.progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{p.progress}%</span>
                          </div>
                        </td>
                        <td className="py-2.5">{p.tasks}</td>
                        <td className="py-2.5">
                          <div className="flex items-center -space-x-1.5">
                            {Array.from({ length: Math.min(3, p.members) }).map((_, i) => (
                              <img
                                key={i}
                                src={avatar(`${p.id}-${i}`)}
                                className="h-6 w-6 rounded-full border-2 border-surface object-cover"
                                alt=""
                              />
                            ))}
                            {p.members > 3 && (
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                +{p.members - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${p.status === "ontrack" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/15 text-amber-300 border border-amber-500/30"}`}
                          >
                            {p.status === "not_started"
                              ? t("rp.health.not")
                              : t(`rp.status.${p.status}` as Key)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  onClick={() => drill()}
                  className="mt-3 text-xs text-primary hover:underline"
                >
                  {t("rp.top.viewall")}
                </button>
              </Card>

              <Card>
                <CardHeader title={t("rp.collab.title")} />
                <div className="space-y-3">
                  <CollabRow
                    icon={Activity}
                    color="bg-violet-500/20 text-violet-300"
                    label={t("rp.collab.msg")}
                    value="2,512"
                    delta="+18.6%"
                  />
                  <CollabRow
                    icon={FileText}
                    color="bg-sky-500/20 text-sky-300"
                    label={t("rp.collab.files")}
                    value="624"
                    delta="+12.3%"
                  />
                  <CollabRow
                    icon={Video}
                    color="bg-emerald-500/20 text-emerald-300"
                    label={t("rp.collab.meetings")}
                    value="48"
                    delta="+6.1%"
                  />
                  <CollabRow
                    icon={Calendar}
                    color="bg-amber-500/20 text-amber-300"
                    label={t("rp.collab.hours")}
                    value="96.5"
                    delta="+8.4%"
                  />
                  <CollabRow
                    icon={UsersIcon}
                    color="bg-rose-500/20 text-rose-300"
                    label={t("rp.collab.participants")}
                    value="320"
                    delta="+10.7%"
                  />
                </div>
              </Card>

              <Card>
                <CardHeader title={t("rp.workload.title")} />
                <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <LegendDot c="bg-rose-500" l={t("rp.workload.high")} />
                  <LegendDot c="bg-amber-500" l={t("rp.workload.medium")} />
                  <LegendDot c="bg-emerald-500" l={t("rp.workload.normal")} />
                  <LegendDot c="bg-sky-500" l={t("rp.workload.low")} />
                </div>
                <div className="space-y-2.5 text-sm">
                  {[
                    { dep: "Engineering", parts: [40, 40, 15, 5] },
                    { dep: "Product", parts: [25, 41, 20, 10] },
                    { dep: "Design", parts: [20, 40, 25, 15] },
                    { dep: "Marketing", parts: [15, 35, 30, 20] },
                    { dep: "Sales", parts: [10, 30, 30, 30] },
                    { dep: "HR", parts: [5, 25, 40, 30] },
                  ].map((r) => (
                    <div key={r.dep} className="flex items-center gap-3">
                      <div className="w-24 shrink-0 text-xs text-muted-foreground">{r.dep}</div>
                      <div className="flex h-5 flex-1 overflow-hidden rounded">
                        <div
                          className="flex h-full items-center justify-center bg-rose-500 text-[10px] font-semibold text-white"
                          style={{ width: `${r.parts[0]}%` }}
                        >
                          {r.parts[0]}%
                        </div>
                        <div
                          className="flex h-full items-center justify-center bg-amber-500 text-[10px] font-semibold text-white"
                          style={{ width: `${r.parts[1]}%` }}
                        >
                          {r.parts[1]}%
                        </div>
                        <div
                          className="flex h-full items-center justify-center bg-emerald-500 text-[10px] font-semibold text-white"
                          style={{ width: `${r.parts[2]}%` }}
                        >
                          {r.parts[2]}%
                        </div>
                        <div
                          className="flex h-full items-center justify-center bg-sky-500 text-[10px] font-semibold text-white"
                          style={{ width: `${r.parts[3]}%` }}
                        >
                          {r.parts[3]}%
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pl-24 text-[10px] text-muted-foreground">
                    <span>0%</span>
                    <span className="ml-auto">25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* System / Heatmap / Shortcuts */}
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card>
                <CardHeader title={t("rp.sys.title")} />
                <div className="grid grid-cols-2 gap-3">
                  <SysCard
                    icon={Database}
                    color="bg-violet-500/20 text-violet-300"
                    label={t("rp.sys.storage")}
                    value="2.4"
                    unit="TB"
                    sub="of 10 TB"
                    pct={24}
                  />
                  <SysCard
                    icon={Globe}
                    color="bg-sky-500/20 text-sky-300"
                    label={t("rp.sys.bw")}
                    value="1.2"
                    unit="TB"
                    sub="of 5 TB"
                    pct={24}
                  />
                  <SysCard
                    icon={UsersIcon}
                    color="bg-emerald-500/20 text-emerald-300"
                    label={t("rp.sys.sessions")}
                    value="320"
                    delta="+11.3%"
                  />
                  <SysCard
                    icon={Cpu}
                    color="bg-amber-500/20 text-amber-300"
                    label={t("rp.sys.api")}
                    value="24,512"
                    delta="+16.8%"
                  />
                </div>
              </Card>

              <Card>
                <CardHeader title={t("rp.heat.title")} />
                <Heatmap />
                <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
                  <span>{t("rp.heat.low")}</span>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span
                      key={i}
                      className="h-2.5 w-4 rounded-sm"
                      style={{ background: `rgba(59,130,246,${i * 0.2})` }}
                    />
                  ))}
                  <span>{t("rp.heat.high")}</span>
                </div>
              </Card>

              <Card>
                <CardHeader title={t("rp.short.title")} />
                <div className="space-y-2">
                  <ShortcutRow
                    icon={FileText}
                    color="bg-emerald-500/20 text-emerald-300"
                    title={t("rp.short.exec")}
                    sub={t("rp.short.execd")}
                    onClick={() => navigate({ to: "/reports/$type", params: { type: "overview" } })}
                  />
                  <ShortcutRow
                    icon={BarChart3}
                    color="bg-violet-500/20 text-violet-300"
                    title={t("rp.short.team")}
                    sub={t("rp.short.teamd")}
                    onClick={() => navigate({ to: "/reports/$type", params: { type: "team" } })}
                  />
                  <ShortcutRow
                    icon={Folder}
                    color="bg-sky-500/20 text-sky-300"
                    title={t("rp.short.proj")}
                    sub={t("rp.short.projd")}
                    onClick={() => navigate({ to: "/reports/$type", params: { type: "projects" } })}
                  />
                  <ShortcutRow
                    icon={UsersIcon}
                    color="bg-amber-500/20 text-amber-300"
                    title={t("rp.short.user")}
                    sub={t("rp.short.userd")}
                    onClick={() =>
                      navigate({ to: "/reports/$type", params: { type: "productivity" } })
                    }
                  />
                </div>
                <button
                  onClick={() => navigate({ to: "/reports/$type", params: { type: tab } })}
                  className="mt-3 block w-full text-center text-xs text-primary hover:underline"
                >
                  {t("rp.short.viewall")}
                </button>
              </Card>
            </div>
          </main>

          {/* Right panel */}
          <aside className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface xl:flex">
            <div className="border-b border-border px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">{t("rp.ai.title")}</h3>
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                    Beta
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <Insight
                  icon={TrendingUp}
                  color="text-emerald-300"
                  title={t("rp.ai.i1.t")}
                  sub={t("rp.ai.i1.s")}
                  t={t}
                  onClick={() => drill("done")}
                />
                <Insight
                  icon={AlertTriangle}
                  color="text-amber-300"
                  title={t("rp.ai.i2.t")}
                  sub={t("rp.ai.i2.s")}
                  t={t}
                  onClick={() => drill("blocked")}
                />
                <Insight
                  icon={Info}
                  color="text-sky-300"
                  title={t("rp.ai.i3.t")}
                  sub={t("rp.ai.i3.s")}
                  t={t}
                  onClick={() => drill("in_progress")}
                />
                <Insight
                  icon={UsersIcon}
                  color="text-violet-300"
                  title={t("rp.ai.i4.t")}
                  sub={t("rp.ai.i4.s")}
                  t={t}
                  onClick={() => drill("todo")}
                />
              </div>
            </div>

            <div className="border-b border-border px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("rp.flt.title")}</h3>
                <button
                  onClick={() => {
                    setRange({ from: shiftDay(todayKey(), -6), to: todayKey() });
                    setCompare(true);
                    toast.success("Đã đặt lại bộ lọc");
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  {t("rp.flt.clear")}
                </button>
              </div>
              <FilterField
                label={t("rp.flt.time")}
                value={`${fmtDay(range.from)} – ${fmtDay(range.to)}`}
              />
              <FilterField
                label={t("rp.flt.ws")}
                value={wsTotal ? `${wsTotal} workspace` : t("rp.flt.allws")}
              />
              <FilterField
                label={t("rp.flt.dep")}
                value={compare ? "So sánh kỳ trước: Bật" : "So sánh kỳ trước: Tắt"}
              />
              <button
                onClick={() => {
                  void refetch();
                  toast.success(t("rp.refresh.done"));
                }}
                className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("rp.flt.apply")}
              </button>
            </div>

            <div className="px-4 py-4">
              <h3 className="text-sm font-semibold">{t("rp.exp.title")}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t("rp.exp.sub")}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <ExportBtn
                  icon={FileImage}
                  label="PDF"
                  color="text-rose-300"
                  onClick={() => {
                    if (!report) return toast.error(t("rp.export.blocked"));
                    const ok = exportReportPdf(report, exportMeta());
                    if (!ok) toast.error(t("rp.export.blocked"));
                  }}
                />
                <ExportBtn
                  icon={FileSpreadsheet}
                  label="Excel"
                  color="text-emerald-300"
                  onClick={() => {
                    if (!report) return toast.error(t("rp.export.blocked"));
                    exportReportCsv(report, exportMeta());
                    toast.success(t("rp.export.done"));
                  }}
                />
                <ExportBtn
                  icon={FileText}
                  label="CSV"
                  color="text-sky-300"
                  onClick={() => {
                    if (!report) return toast.error(t("rp.export.blocked"));
                    exportReportCsv(report, exportMeta());
                    toast.success(t("rp.export.done"));
                  }}
                />
              </div>
              <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{t("rp.exp.sched")}</div>
                    <div className="text-[11px] text-muted-foreground">{t("rp.exp.schedsub")}</div>
                  </div>
                  <button
                    onClick={() => navigate({ to: "/workflows" })}
                    className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-3 w-3" /> {t("rp.schedule")}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  delta,
  tone,
  t,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta: string;
  tone: string;
  t: (k: Key) => string;
}) {
  const up = !delta.startsWith("-");
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div
        className={`mt-1 flex items-center gap-1 text-[11px] ${up ? "text-success" : "text-destructive"}`}
      >
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        <span>{delta}</span>
        <span className="text-muted-foreground">{t("rp.kpi.vs")}</span>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-4 ${className}`}>{children}</div>
  );
}

function CardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold">{title}</h3>
      {right}
    </div>
  );
}

function Legend({ items }: { items: { c: string; l: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {items.map((i) => (
        <div key={i.l} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${i.c}`} />
          {i.l}
        </div>
      ))}
    </div>
  );
}
function LegendDot({ c, l }: { c: string; l: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${c}`} />
      {l}
    </span>
  );
}

function LineChart({ data }: { data: ReportOverview["activity"] }) {
  const rows = data.length > 0 ? data : [{ day: "", tasks: 0, meetings: 0, documents: 0, completed: 0 }];
  const days = rows.map((r) => (r.day ? new Date(r.day).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : ""));
  const series = [
    { color: "#a78bfa", points: rows.map((r) => r.tasks) },
    { color: "#34d399", points: rows.map((r) => r.completed) },
    { color: "#60a5fa", points: rows.map((r) => r.meetings) },
    { color: "#fbbf24", points: rows.map((r) => r.documents) },
  ];
  const W = 600,
    H = 220;
  const peak = Math.max(1, ...series.flatMap((s) => s.points));
  const step = Math.max(1, Math.ceil(peak / 5));
  const max = step * 5;
  const gridValues = [0, 1, 2, 3, 4, 5].map((i) => i * step);
  const labelEvery = Math.ceil(days.length / 7);
  const x = (i: number) => (days.length > 1 ? (i / (days.length - 1)) * (W - 40) + 30 : 30);
  const y = (v: number) => H - 30 - (v / max) * (H - 50);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full">
      {gridValues.map((v) => (
        <g key={v}>
          <line
            x1={30}
            x2={W - 10}
            y1={y(v)}
            y2={y(v)}
            stroke="hsl(var(--border))"
            strokeDasharray="2 4"
          />
          <text x={4} y={y(v) + 3} fontSize="9" fill="hsl(var(--muted-foreground))">
            {v}
          </text>
        </g>
      ))}
      {series.map((s, si) => (
        <g key={si}>
          <polyline
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            points={s.points.map((p, i) => `${x(i)},${y(p)}`).join(" ")}
          />
          {s.points.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p)} r="2.5" fill={s.color} />
          ))}
        </g>
      ))}
      {days.map((d, i) => (
        i % labelEvery !== 0 ? null : (
        <text
          key={i}
          x={x(i)}
          y={H - 8}
          fontSize="9"
          fill="hsl(var(--muted-foreground))"
          textAnchor="middle"
        >
          {d}
        </text>
        )
      ))}
    </svg>
  );
}

function Donut({
  total,
  totalLabel,
  segments,
}: {
  total: number;
  totalLabel: string;
  segments: { color: string; pct: number; onClick?: () => void; title?: string }[];
}) {
  let acc = 0;
  const stops = segments
    .map((s) => {
      const start = acc;
      acc += s.pct;
      return `${s.color} ${start}% ${acc}%`;
    })
    .join(", ");
  let acc2 = 0;
  return (
    <div
      className="relative h-36 w-36 shrink-0 rounded-full"
      style={{ background: `conic-gradient(${stops})` }}
    >
      {segments.map((s, i) => {
        const start = acc2;
        acc2 += s.pct;
        if (!s.onClick || s.pct <= 0) return null;
        const end = acc2;
        const pt = (p: number) => {
          const a = (p / 100) * 2 * Math.PI - Math.PI / 2;
          return `${50 + 50 * Math.cos(a)}% ${50 + 50 * Math.sin(a)}%`;
        };
        const steps = Math.max(2, Math.ceil((end - start) / 5));
        const pts = Array.from({ length: steps + 1 }, (_, j) =>
          pt(start + ((end - start) * j) / steps),
        );
        return (
          <button
            key={i}
            onClick={s.onClick}
            title={s.title}
            aria-label={s.title}
            className="absolute inset-0 rounded-full transition-opacity hover:opacity-80"
            style={{ clipPath: `polygon(50% 50%, ${pts.join(", ")})` }}
          />
        );
      })}
      <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-surface text-center">
        <div className="text-xl font-bold">{total.toLocaleString()}</div>
        <div className="text-[10px] text-muted-foreground">{totalLabel}</div>
      </div>
    </div>
  );
}

function DonutRow({
  color,
  label,
  value,
  onClick,
}: {
  color: string;
  label: string;
  value: string;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-xs transition-colors hover:bg-surface-2"
      >
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${color}`} />
          {label}
        </span>
        <span className="text-muted-foreground">{value}</span>
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        {label}
      </span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}

function CollabRow({
  icon: Icon,
  color,
  label,
  value,
  delta,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  delta: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 text-sm">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      <div className="w-12 text-right text-[11px] text-success">{delta}</div>
      <Sparkline />
    </div>
  );
}

function Sparkline() {
  const pts = [4, 6, 5, 9, 7, 10, 8, 12].map((v, i) => `${i * 7},${20 - v * 1.2}`).join(" ");
  return (
    <svg viewBox="0 0 56 20" className="h-5 w-14">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-success"
        points={pts}
      />
    </svg>
  );
}

function SysCard({
  icon: Icon,
  color,
  label,
  value,
  unit,
  sub,
  pct,
  delta,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  pct?: number;
  delta?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold">{value}</span>
        {unit && <span className="text-[11px] text-muted-foreground">{unit}</span>}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
      {pct !== undefined && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface">
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">{pct}%</span>
        </div>
      )}
      {delta && <div className="mt-1 text-[10px] text-success">{delta}</div>}
    </div>
  );
}

function Heatmap() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const cols = 24;
  return (
    <div className="space-y-1.5">
      {days.map((d, di) => (
        <div key={d} className="flex items-center gap-1.5">
          <span className="w-8 text-[10px] text-muted-foreground">{d}</span>
          <div
            className="grid flex-1 gap-0.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, i) => {
              const peak = i > 7 && i < 19 && di < 5;
              const intensity = peak ? 0.4 + Math.random() * 0.6 : Math.random() * 0.3;
              return (
                <span
                  key={i}
                  className="h-3 rounded-sm"
                  style={{ background: `rgba(59,130,246,${intensity.toFixed(2)})` }}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex gap-1.5 pl-9 text-[9px] text-muted-foreground">
        {["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"].map((h) => (
          <span key={h} className="flex-1">
            {h}
          </span>
        ))}
      </div>
    </div>
  );
}

function ShortcutRow({
  icon: Icon,
  color,
  title,
  sub,
  onClick,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-primary/40">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{sub}</div>
      </div>
    </button>
  );
}

function Insight({
  icon: Icon,
  color,
  title,
  sub,
  t,
  onClick,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  sub: string;
  t: (k: Key) => string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="block w-full rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-primary/40">
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-4 w-4 ${color}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-snug">{title}</div>
          {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
          <div className="mt-1 text-[11px] text-primary">{t("rp.ai.detail")} →</div>
        </div>
      </div>
    </button>
  );
}

function FilterField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <div className="flex w-full items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

function ExportBtn({
  icon: Icon,
  label,
  color,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 py-2 text-xs font-medium hover:border-primary/40">
      <Icon className={`h-3.5 w-3.5 ${color}`} /> {label}
    </button>
  );
}
