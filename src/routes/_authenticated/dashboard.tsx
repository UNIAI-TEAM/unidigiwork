import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { getDashboardOverview } from "@/lib/api/dashboard.functions";
import type { DashboardOverview as DashboardData } from "@/lib/api/dashboard.functions";
import {
  Users,
  Activity,
  FolderKanban,
  CheckCircle2,
  Video,
  Calendar,
  Settings2,
  ArrowUpRight,
  MoreHorizontal,
  FileText,
  MessageCircle,
  GitBranch,
  Workflow,
  Sparkles,
  ChevronRight,
  Send,
  BookOpen,
  AlertTriangle,
  ShieldCheck,
  X,
  TrendingUp,
  Clock,
  Bell,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Bảng điều khiển — UNIWORK" },
      { name: "description", content: "Tổng quan hoạt động của tổ chức trên UNIWORK." },
    ],
  }),
  component: DashboardPage,
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Đang tải bảng điều khiển…
    </div>
  ),
  errorComponent: ({ error }) => (
    <div role="alert" className="flex min-h-screen items-center justify-center p-6 text-sm">
      Không tải được dữ liệu bảng điều khiển: {error.message}
    </div>
  ),
});

const dashboardQuery = (rangeDays: number, workspaceId?: string | null) =>
  queryOptions({
    queryKey: ["dashboard-overview", rangeDays, workspaceId ?? "all"],
    queryFn: () =>
      getDashboardOverview({
        data: { rangeDays, ...(workspaceId ? { workspaceId } : {}) },
      }),
    staleTime: 30_000,
  });

type Kpi = {
  key: string;
  label: string;
  value: string;
  delta: string;
  icon: typeof Users;
  tint: string;
};

const nf = new Intl.NumberFormat("vi-VN");

function pctDelta(cur: number, prev: number) {
  if (!prev) return cur > 0 ? "+100%" : "0%";
  const d = ((cur - prev) / prev) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

function buildKpis(o: DashboardData["overview"]): Kpi[] {
  const k = o?.kpis;
  return [
    {
      key: "users",
      label: "Tổng người dùng",
      value: nf.format(k?.users ?? 0),
      delta: "",
      icon: Users,
      tint: "bg-violet-500/15 text-violet-300",
    },
    {
      key: "active",
      label: "Người dùng hoạt động",
      value: nf.format(k?.active_users ?? 0),
      delta: "",
      icon: Activity,
      tint: "bg-emerald-500/15 text-emerald-300",
    },
    {
      key: "projects",
      label: "Không gian làm việc",
      value: nf.format(k?.workspaces ?? 0),
      delta: pctDelta(k?.ws_cur ?? 0, k?.ws_prev ?? 0),
      icon: FolderKanban,
      tint: "bg-sky-500/15 text-sky-300",
    },
    {
      key: "tasks",
      label: "Nhiệm vụ",
      value: nf.format(k?.tasks ?? 0),
      delta: pctDelta(k?.tasks_cur ?? 0, k?.tasks_prev ?? 0),
      icon: CheckCircle2,
      tint: "bg-amber-500/15 text-amber-300",
    },
    {
      key: "meetings",
      label: "Cuộc họp",
      value: nf.format(k?.meetings ?? 0),
      delta: pctDelta(k?.meetings_cur ?? 0, k?.meetings_prev ?? 0),
      icon: Video,
      tint: "bg-rose-500/15 text-rose-300",
    },
  ];
}

type ActivityData = {
  labels: string[];
  series: { name: string; color: string; total: string; delta: string; data: number[] }[];
};

function buildActivity(o: DashboardData["overview"]): ActivityData {
  const rows = o?.activity ?? [];
  const labels = rows.map((r) =>
    new Date(r.day).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
  );
  const mk = (name: string, color: string, pick: (r: (typeof rows)[number]) => number) => {
    const data = rows.map(pick);
    const total = data.reduce((a, b) => a + b, 0);
    const half = Math.floor(data.length / 2) || 1;
    const prev = data.slice(0, half).reduce((a, b) => a + b, 0);
    const cur = data.slice(half).reduce((a, b) => a + b, 0);
    return { name, color, data, total: nf.format(total), delta: pctDelta(cur, prev) };
  };
  return {
    labels: labels.length ? labels : ["—"],
    series: [
      mk("Nhiệm vụ tạo mới", "#a78bfa", (r) => r.tasks),
      mk("Cuộc họp", "#34d399", (r) => r.meetings),
      mk("Nhiệm vụ hoàn thành", "#fbbf24", (r) => r.completed),
      mk("Tài liệu cập nhật", "#60a5fa", (r) => r.documents),
    ],
  };
}

type DonutSlice = { label: string; value: number; pct: number; color: string };

function buildDonut(o: DashboardData["overview"]): { slices: DonutSlice[]; total: number } {
  const t = o?.tasks_by_status;
  const total = t?.total ?? 0;
  const defs: Array<[string, number, string]> = [
    ["Hoàn thành", t?.done ?? 0, "#10b981"],
    ["Đang thực hiện", t?.in_progress ?? 0, "#3b82f6"],
    ["Chờ xử lý", t?.todo ?? 0, "#f59e0b"],
    ["Bị chặn", t?.blocked ?? 0, "#ef4444"],
    ["Đã hủy", t?.canceled ?? 0, "#94a3b8"],
  ];
  return {
    total,
    slices: defs.map(([label, value, color]) => ({
      label,
      value,
      pct: total ? Math.round((value / total) * 100) : 0,
      color,
    })),
  };
}

const PROJECT_COLORS = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-orange-500",
  "bg-rose-500",
];

const AREA_META: Record<string, { icon: typeof FileText; tint: string }> = {
  Documents: { icon: FileText, tint: "text-sky-300" },
  Tasks: { icon: CheckCircle2, tint: "text-emerald-300" },
  Meetings: { icon: Video, tint: "text-rose-300" },
  Workflows: { icon: Workflow, tint: "text-violet-300" },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function fmtDur(start: string, end: string) {
  const m = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
}

const AI_ITEMS = [
  {
    icon: FileText,
    tint: "bg-sky-500/20 text-sky-300",
    title: "15 tài liệu cần cập nhật",
    action: "Xem chi tiết",
  },
  {
    icon: AlertTriangle,
    tint: "bg-rose-500/20 text-rose-300",
    title: "3 nhiệm vụ đang quá hạn",
    action: "Xem chi tiết",
  },
  {
    icon: Video,
    tint: "bg-emerald-500/20 text-emerald-300",
    title: "5 cuộc họp trong hôm nay",
    action: "Xem lịch",
  },
  {
    icon: Workflow,
    tint: "bg-amber-500/20 text-amber-300",
    title: "2 quy trình cần phê duyệt",
    action: "Xem chi tiết",
  },
];

function KpiCard({ k }: { k: Kpi }) {
  const Icon = k.icon;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${k.tint}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{k.value}</div>
      {k.delta ? (
        <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
          <ArrowUpRight className="h-3.5 w-3.5" />
          <span>{k.delta}</span>
          <span className="text-muted-foreground">so với kỳ trước</span>
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">Tổng hiện tại</div>
      )}
    </div>
  );
}

function ActivityChart({ activity }: { activity: ActivityData }) {
  const W = 640,
    H = 240,
    padL = 32,
    padR = 12,
    padT = 16,
    padB = 28;
  const peak = Math.max(1, ...activity.series.flatMap((s) => s.data));
  const max = Math.ceil(peak / 5) * 5 || 5;
  const step = (W - padL - padR) / Math.max(1, activity.labels.length - 1);
  const yFor = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[240px] w-full">
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={padL}
            x2={W - padR}
            y1={yFor(t)}
            y2={yFor(t)}
            stroke="hsl(var(--border))"
            strokeDasharray="3 4"
          />
          <text
            x={padL - 6}
            y={yFor(t) + 3}
            textAnchor="end"
            fontSize="10"
            fill="hsl(var(--muted-foreground))"
          >
            {t}
          </text>
        </g>
      ))}
      {activity.labels.map((l, i) => (
        <text
          key={l}
          x={padL + i * step}
          y={H - 8}
          textAnchor="middle"
          fontSize="10"
          fill="hsl(var(--muted-foreground))"
        >
          {l}
        </text>
      ))}
      {activity.series.map((s) => {
        const d = s.data
          .map((v, i) => `${i === 0 ? "M" : "L"} ${padL + i * step} ${yFor(v)}`)
          .join(" ");
        return (
          <g key={s.name}>
            <path
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {s.data.map((v, i) => (
              <circle key={i} cx={padL + i * step} cy={yFor(v)} r="3" fill={s.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ slices, total }: { slices: DonutSlice[]; total: number }) {
  const R = 70,
    r = 48,
    C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 180 180" className="h-44 w-44 -rotate-90">
        <circle cx="90" cy="90" r={R} fill="none" stroke="hsl(var(--surface-2))" strokeWidth="16" />
        {slices.map((d) => {
          const len = (d.pct / 100) * C;
          const dash = `${len} ${C - len}`;
          const offset = -acc;
          acc += len;
          return (
            <circle
              key={d.label}
              cx="90"
              cy="90"
              r={R}
              fill="none"
              stroke={d.color}
              strokeWidth="16"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              strokeLinecap="butt"
            />
          );
        })}
        <circle cx="90" cy="90" r={r} fill="hsl(var(--surface))" />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-semibold">{nf.format(total)}</div>
        <div className="text-[11px] text-muted-foreground">Tổng nhiệm vụ</div>
      </div>
    </div>
  );
}

function Sparkline({ data, stroke }: { data: number[]; stroke: string }) {
  const W = 120,
    H = 36;
  const max = Math.max(...data),
    min = Math.min(...data);
  const step = W / (data.length - 1);
  const yFor = (v: number) => H - ((v - min) / Math.max(1, max - min)) * (H - 4) - 2;
  const d = data.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${yFor(v)}`).join(" ");
  const area = `${d} L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-full">
      <path d={area} fill={stroke} opacity="0.15" />
      <path d={d} stroke={stroke} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function AvatarStack({ count, seed }: { count: number; seed: string }) {
  const items = Array.from({ length: Math.min(count, 3) });
  return (
    <div className="flex -space-x-2">
      {items.map((_, i) => (
        <img
          key={i}
          src={avatar(`${seed}-${i}`)}
          alt=""
          className="h-7 w-7 rounded-full border-2 border-surface object-cover"
        />
      ))}
      {count > 3 && (
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-2 px-1.5 text-[10px] font-medium text-muted-foreground">
          +{count - 3}
        </span>
      )}
    </div>
  );
}

function DashboardPage() {
  return <DashboardInner />;
}

const SECTIONS_STORAGE_KEY = "uniwork.dashboard.sections";

const SECTION_OPTIONS = [
  { key: "kpis", label: "Chỉ số KPI" },
  { key: "activity", label: "Hoạt động tổng quan" },
  { key: "donut", label: "Phân bổ công việc" },
  { key: "projects", label: "Dự án nổi bật" },
  { key: "recent", label: "Hoạt động gần đây" },
  { key: "meetings", label: "Lịch họp hôm nay" },
  { key: "workspaces", label: "Tổng quan không gian làm việc" },
  { key: "ai", label: "Trợ lý AI (cột phải)" },
] as const;

type SectionKey = (typeof SECTION_OPTIONS)[number]["key"];

const DEFAULT_SECTIONS = Object.fromEntries(
  SECTION_OPTIONS.map((o) => [o.key, true]),
) as Record<SectionKey, boolean>;

function DashboardInner() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rangeDays, setRangeDays] = useState(7);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(DEFAULT_SECTIONS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SECTIONS_STORAGE_KEY);
      if (raw) setSections({ ...DEFAULT_SECTIONS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const toggleSection = (key: SectionKey) => {
    setSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const resetSections = () => {
    setSections(DEFAULT_SECTIONS);
    try {
      localStorage.removeItem(SECTIONS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const visible = hydrated ? sections : DEFAULT_SECTIONS;
  const showAI = visible.ai;
  const { workspaceId: activeWorkspaceId } = useActiveWorkspace();
  const { data } = useSuspenseQuery(dashboardQuery(rangeDays, activeWorkspaceId));

  const kpis = useMemo(() => buildKpis(data.overview), [data.overview]);
  const activity = useMemo(() => buildActivity(data.overview), [data.overview]);
  const donut = useMemo(() => buildDonut(data.overview), [data.overview]);
  const projects = data.projects;
  const recent = data.recent;
  const meetings = data.meetings;
  const workspaces = data.overview?.workspaces ?? [];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {/* Heading */}
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard</h1>
                <p className="text-sm text-muted-foreground">Tổng quan hoạt động của tổ chức</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <select
                    value={rangeDays}
                    onChange={(e) => setRangeDays(Number(e.target.value))}
                    className="bg-transparent text-sm focus:outline-none"
                    aria-label="Khoảng thời gian"
                  >
                    <option value={7}>7 ngày qua</option>
                    <option value={14}>14 ngày qua</option>
                    <option value={30}>30 ngày qua</option>
                  </select>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2"
                    >
                      <Settings2 className="h-4 w-4 text-muted-foreground" /> Tuỳ chỉnh
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-0">
                    <div className="border-b border-border px-4 py-3">
                      <div className="text-sm font-semibold">Tuỳ chỉnh bảng điều khiển</div>
                      <p className="text-xs text-muted-foreground">
                        Chọn các khối muốn hiển thị. Thiết lập được lưu trên thiết bị này.
                      </p>
                    </div>
                    <ul className="max-h-80 space-y-1 overflow-y-auto p-2">
                      {SECTION_OPTIONS.map((opt) => (
                        <li key={opt.key}>
                          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                            <span>{opt.label}</span>
                            <Switch
                              checked={visible[opt.key]}
                              onCheckedChange={() => toggleSection(opt.key)}
                              aria-label={opt.label}
                            />
                          </label>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-border px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={resetSections}
                        className="text-xs text-primary hover:underline"
                      >
                        Khôi phục mặc định
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* KPI grid */}
            {visible.kpis && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {kpis.map((k) => (
                  <KpiCard key={k.key} k={k} />
                ))}
              </div>
            )}

            {/* Activity + Donut */}
            {(visible.activity || visible.donut) && (
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {visible.activity && (
              <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Hoạt động tổng quan</h2>
                  <span className="rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground">
                    {rangeDays} ngày qua
                  </span>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_180px]">
                  <ActivityChart activity={activity} />
                  <ul className="space-y-3 text-sm">
                    {activity.series.map((s) => (
                      <li key={s.name}>
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                          <span className="text-muted-foreground">{s.name}</span>
                        </div>
                        <div className="ml-4 flex items-baseline justify-between">
                          <span className="text-base font-semibold tabular-nums">{s.total}</span>
                          <span className="text-xs text-emerald-400">{s.delta}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              )}

              {visible.donut && (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-sm font-semibold">Phân bổ công việc</h2>
                <div className="mt-4 flex flex-col items-center gap-4">
                  <Donut slices={donut.slices} total={donut.total} />
                  <ul className="w-full space-y-2 text-sm">
                    {donut.slices.map((d) => (
                      <li key={d.label} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />{" "}
                          {d.label}
                        </span>
                        <span className="tabular-nums">
                          {d.value.toLocaleString()}{" "}
                          <span className="text-muted-foreground">({d.pct}%)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              )}
            </div>
            )}

            {/* Three column row */}
            {(visible.projects || visible.recent || visible.meetings) && (
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {/* Projects */}
              {visible.projects && (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Dự án nổi bật</h2>
                  <button className="text-xs text-primary hover:underline">Xem tất cả</button>
                </div>
                {projects.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">Chưa có dự án nào.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {projects.map((p, idx) => (
                      <li
                        key={p.id}
                        className="rounded-xl border border-border/60 bg-surface-2/40 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-white ${PROJECT_COLORS[idx % PROJECT_COLORS.length]}`}
                          >
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{p.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              Tiến độ: {p.progress}% · {p.tasks} nhiệm vụ · {p.members} thành viên
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400"
                            style={{ width: `${p.progress}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              )}

              {/* Recent activity */}
              {visible.recent && (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Hoạt động gần đây</h2>
                  <button className="text-xs text-primary hover:underline">Xem tất cả</button>
                </div>
                {recent.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">Chưa có hoạt động nào.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {recent.map((r) => {
                      const meta = AREA_META[r.area] ?? AREA_META.Tasks;
                      const Icon = meta.icon;
                      return (
                        <li key={r.id} className="flex items-start gap-3">
                          <div className="relative">
                            <img
                              src={avatar(r.who)}
                              alt=""
                              className="h-9 w-9 rounded-full object-cover"
                            />
                            <span
                              className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-surface-2 ${meta.tint}`}
                            >
                              <Icon className="h-2.5 w-2.5" />
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 text-sm">
                            <div className="leading-snug">
                              <span className="font-medium">{r.who}</span>{" "}
                              <span className="text-muted-foreground">{r.what}</span>{" "}
                              <span className="font-medium">{r.target}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span>{r.area}</span>
                              <span>·</span>
                              <span>{fmtTime(r.at)}</span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              )}

              {/* Meetings today */}
              {visible.meetings && (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Lịch họp hôm nay</h2>
                  <button className="text-xs text-primary hover:underline">Xem lịch đầy đủ</button>
                </div>
                {meetings.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">Hôm nay không có cuộc họp.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {meetings.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 p-3"
                      >
                        <div className="w-14 shrink-0">
                          <div className="text-sm font-semibold tabular-nums">
                            {fmtTime(m.start_at)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {fmtDur(m.start_at, m.end_at)}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{m.title}</div>
                          <div className="mt-1">
                            <AvatarStack count={m.participants} seed={m.id} />
                          </div>
                        </div>
                        <button className="rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20">
                          Tham gia
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              )}
            </div>
            )}

            {/* Workspaces overview */}
            {visible.workspaces && (
            <div className="mt-5 rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Tổng quan theo không gian làm việc</h2>
                <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <TrendingUp className="h-3.5 w-3.5" /> So sánh
                </button>
              </div>
              {workspaces.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Chưa có không gian làm việc.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {workspaces.slice(0, 5).map((w, idx) => (
                    <div
                      key={w.id}
                      className="rounded-xl border border-border/60 bg-surface-2/40 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded text-[12px] font-semibold text-white ${PROJECT_COLORS[idx % PROJECT_COLORS.length]}`}
                        >
                          {w.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="truncate text-sm font-medium">{w.name}</div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-1 text-xs">
                        <div>
                          <div className="text-base font-semibold tabular-nums">{w.members}</div>
                          <div className="text-[10px] text-muted-foreground">thành viên</div>
                        </div>
                        <div>
                          <div className="text-base font-semibold tabular-nums">{w.tasks}</div>
                          <div className="text-[10px] text-muted-foreground">nhiệm vụ</div>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${w.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>

          {/* Right rail: AI Assistant */}
          {showAI && (
            <aside className="hidden w-[320px] shrink-0 border-l border-border bg-surface/60 px-4 py-5 xl:block">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="text-sm font-semibold">AI Assistant</div>
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    Beta
                  </span>
                </div>
                <button
                  onClick={() => toggleSection("ai")}
                  className="rounded p-1 text-muted-foreground hover:bg-surface-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4">
                <div className="text-sm font-medium">Chào Nguyễn Văn A,</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Đây là những thông tin AI tổng hợp cho bạn hôm nay.
                </p>
              </div>
              <ul className="mt-4 space-y-2">
                {AI_ITEMS.map((it) => {
                  const Icon = it.icon;
                  return (
                    <li key={it.title}>
                      <button className="group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 p-3 text-left hover:border-primary/40">
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-lg ${it.tint}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{it.title}</div>
                          <div className="text-[11px] text-primary">{it.action} →</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2">
                <input
                  placeholder="Ask AI anything..."
                  className="flex-1 bg-transparent text-sm placeholder:text-primary/70 focus:outline-none"
                />
                <button className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-5 rounded-xl border border-border/60 bg-surface-2/40 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Thông báo quan trọng
                </div>
                <div className="mt-2 flex items-start gap-2 text-xs">
                  <Bell className="mt-0.5 h-3.5 w-3.5 text-amber-300" />
                  <div>
                    <div className="font-medium">Bảo mật: Hệ thống sẽ bảo trì định kỳ</div>
                    <div className="text-muted-foreground">Vào 22:00 ngày 25/05/2026 (GMT+7)</div>
                  </div>
                </div>
              </div>

              <button className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground hover:bg-surface-2">
                <BookOpen className="h-3.5 w-3.5" /> Hướng dẫn sử dụng
              </button>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
