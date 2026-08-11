import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendAiMessage } from "@/lib/api/ai-chat.functions";
import { listNotifications, markNotificationsRead } from "@/lib/api/notifications.functions";
import { toast } from "sonner";
import {
  queryOptions,
  useSuspenseQuery,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  getDashboardPrefs,
  saveDashboardPrefs,
  resetDashboardPrefs,
} from "@/lib/api/dashboard-prefs.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { getDashboardOverview, getDashboardAiSummary } from "@/lib/api/dashboard.functions";
import type {
  DashboardOverview as DashboardData,
  DashboardAiSummary,
} from "@/lib/api/dashboard.functions";
import { localDayKey } from "@/lib/metrics";
import { Link } from "@tanstack/react-router";
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
  GripVertical,
  RefreshCw,
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

const REFRESH_INTERVALS = [
  { value: 0, label: "Tắt tự động" },
  { value: 60_000, label: "Mỗi 1 phút" },
  { value: 300_000, label: "Mỗi 5 phút" },
  { value: 900_000, label: "Mỗi 15 phút" },
] as const;
const REFRESH_STORAGE_KEY = "uniwork:dashboard:refresh-interval";
const DEFAULT_REFRESH_MS = 300_000;

const dashboardQuery = (
  rangeDays: number,
  workspaceId?: string | null,
  refreshMs: number = DEFAULT_REFRESH_MS,
) =>
  queryOptions({
    queryKey: ["dashboard-overview", rangeDays, workspaceId ?? "all"],
    queryFn: () =>
      getDashboardOverview({
        data: { rangeDays, ...(workspaceId ? { workspaceId } : {}) },
      }),
    staleTime: 30_000,
    refetchInterval: refreshMs > 0 ? refreshMs : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
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

function buildAiItems(s: DashboardAiSummary | undefined, ws?: string) {
  const today = localDayKey();
  return [
    {
      icon: FileText,
      tint: "bg-sky-500/20 text-sky-300",
      title: `${s?.staleDocuments ?? 0} tài liệu cần cập nhật`,
      action: "Xem chi tiết",
      to: "/documents",
      search: { filter: "stale" as const, ...(ws ? { ws } : {}) },
    },
    {
      icon: AlertTriangle,
      tint: "bg-rose-500/20 text-rose-300",
      title: `${s?.overdueTasks ?? 0} nhiệm vụ đang quá hạn`,
      action: "Xem chi tiết",
      to: "/tasks",
      search: { filter: "overdue" as const, ...(ws ? { ws } : {}) },
    },
    {
      icon: Video,
      tint: "bg-emerald-500/20 text-emerald-300",
      title: `${s?.meetingsToday ?? 0} cuộc họp trong hôm nay`,
      action: "Xem lịch",
      to: "/calendar",
      search: { view: "week" as const, kind: "meeting" as const, day: today },
    },
    {
      icon: Workflow,
      tint: "bg-amber-500/20 text-amber-300",
      title: `${s?.pendingWorkflowApprovals ?? 0} quy trình cần phê duyệt`,
      action: "Xem chi tiết",
      to: "/workflows/permissions",
      search: {},
    },
  ];
}

function KpiCard({ k, rangeDays }: { k: Kpi; rangeDays: number }) {
  const Icon = k.icon;
  const now = new Date();
  const from = new Date(now.getTime() - rangeDays * 86400_000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const target =
    k.key === "tasks"
      ? ({ to: "/tasks", search: { range: rangeDays } } as const)
      : k.key === "meetings"
        ? ({ to: "/meeting", search: { from, to } } as const)
        : k.key === "projects"
          ? ({ to: "/workspace" } as const)
          : ({ to: "/people" } as const);
  const body = (
    <>
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
        <div className="mt-2 text-xs text-muted-foreground">{rangeDays} ngày qua</div>
      )}
    </>
  );
  return (
    <Link
      {...target}
      preload="intent"
      className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/40"
    >
      {body}
    </Link>
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

const DEFAULT_ORDER = SECTION_OPTIONS.map((o) => o.key) as SectionKey[];
const ORDER_STORAGE_KEY = "uniwork.dashboard.order.v1";

// Chiều rộng mặc định của từng khối trong lưới 3 cột.
const SECTION_SPAN: Record<SectionKey, string> = {
  kpis: "lg:col-span-3",
  activity: "lg:col-span-2",
  donut: "lg:col-span-1",
  projects: "lg:col-span-1",
  recent: "lg:col-span-1",
  meetings: "lg:col-span-1",
  workspaces: "lg:col-span-3",
  ai: "lg:col-span-1",
};

function normalizeOrder(input: unknown): SectionKey[] {
  const arr = Array.isArray(input) ? (input as string[]) : [];
  const valid = arr.filter((k): k is SectionKey => DEFAULT_ORDER.includes(k as SectionKey));
  const seen = new Set(valid);
  return [...valid, ...DEFAULT_ORDER.filter((k) => !seen.has(k))];
}

function DashboardInner() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rangeDays, setRangeDays] = useState(7);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(DEFAULT_SECTIONS);
  const [order, setOrder] = useState<SectionKey[]>(DEFAULT_ORDER);
  const [dragKey, setDragKey] = useState<SectionKey | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const queryClient = useQueryClient();
  const userName = useMemo(
    () =>
      (user?.user_metadata as { full_name?: string; display_name?: string } | undefined)?.full_name ||
      (user?.user_metadata as { full_name?: string; display_name?: string } | undefined)?.display_name ||
      user?.email?.split("@")[0] ||
      "bạn",
    [user],
  );
  const prefsQuery = useQuery({
    queryKey: ["dashboard-prefs"],
    queryFn: () => getDashboardPrefs(),
    staleTime: 60_000,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SECTIONS_STORAGE_KEY);
      if (raw) setSections({ ...DEFAULT_SECTIONS, ...JSON.parse(raw) });
    } catch {
      handleStorageFailure();
    }
    try {
      const rawOrder = localStorage.getItem(ORDER_STORAGE_KEY);
      if (rawOrder) setOrder(normalizeOrder(JSON.parse(rawOrder)));
    } catch {
      setOrder(DEFAULT_ORDER);
    }
    setHydrated(true);
  }, []);

  // Cấu hình từ server (đồng bộ đa thiết bị) luôn thắng cache cục bộ.
  useEffect(() => {
    const remote = prefsQuery.data?.sections;
    const remoteOrder = prefsQuery.data?.order;
    if (remoteOrder) {
      const nextOrder = normalizeOrder(remoteOrder);
      setOrder(nextOrder);
      try {
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
      } catch {
        /* ignore */
      }
    }
    if (!remote) return;
    const merged = { ...DEFAULT_SECTIONS, ...remote } as Record<SectionKey, boolean>;
    setSections(merged);
    try {
      localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      handleStorageFailure();
    }
  }, [prefsQuery.data]);

  // Không ghi được localStorage → báo lỗi và đưa bố cục về mặc định.
  function handleStorageFailure() {
    toast.error("Không lưu được tuỳ chỉnh bảng điều khiển", {
      description: "Bộ nhớ trình duyệt không khả dụng. Đã khôi phục bố cục mặc định.",
    });
    setSections(DEFAULT_SECTIONS);
    try {
      localStorage.removeItem(SECTIONS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  const toggleSection = (key: SectionKey) => {
    const next = { ...sections, [key]: !sections[key] };
    try {
      localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      handleStorageFailure();
      return;
    }
    setSections(next);
    void saveDashboardPrefs({ data: { sections: next, order } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["dashboard-prefs"] }))
      .catch(() => {
        toast.error("Không đồng bộ được tuỳ chỉnh lên tài khoản");
      });
  };

  // Kéo-thả sắp xếp thứ tự khối.
  const moveSection = (from: SectionKey, to: SectionKey) => {
    if (from === to) return;
    const next = order.filter((k) => k !== from);
    next.splice(next.indexOf(to), 0, from);
    setOrder(next);
    try {
      localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    void saveDashboardPrefs({ data: { sections, order: next } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["dashboard-prefs"] }))
      .catch(() => {
        toast.error("Không đồng bộ được thứ tự khối lên tài khoản");
      });
  };

  const resetSections = () => {
    setSections(DEFAULT_SECTIONS);
    setOrder(DEFAULT_ORDER);
    try {
      localStorage.removeItem(SECTIONS_STORAGE_KEY);
      localStorage.removeItem(ORDER_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    void resetDashboardPrefs()
      .then(() => queryClient.invalidateQueries({ queryKey: ["dashboard-prefs"] }))
      .catch(() => {});
  };

  const visible = hydrated ? sections : DEFAULT_SECTIONS;
  const layoutOrder = hydrated ? order : DEFAULT_ORDER;
  const showAI = visible.ai;
  const { workspaceId: activeWorkspaceId, workspaceName: activeWorkspaceName } =
    useActiveWorkspace();
  const [refreshMs, setRefreshMs] = useState<number>(DEFAULT_REFRESH_MS);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REFRESH_STORAGE_KEY);
      if (saved !== null && !Number.isNaN(Number(saved))) setRefreshMs(Number(saved));
    } catch {
      /* ignore */
    }
  }, []);
  const changeRefreshMs = (ms: number) => {
    setRefreshMs(ms);
    try {
      localStorage.setItem(REFRESH_STORAGE_KEY, String(ms));
    } catch {
      /* ignore */
    }
  };
  const overviewQuery = useSuspenseQuery(dashboardQuery(rangeDays, activeWorkspaceId, refreshMs));
  const { data } = overviewQuery;

  const kpis = useMemo(() => buildKpis(data.overview), [data.overview]);
  const aiSummaryQuery = useQuery({
    queryKey: ["dashboard-ai-summary", activeWorkspaceId ?? "all"],
    queryFn: () => {
      const s = new Date();
      s.setHours(0, 0, 0, 0);
      const e = new Date(s.getTime() + 86400_000);
      return getDashboardAiSummary({
        data: {
          ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
          dayStart: s.toISOString(),
          dayEnd: e.toISOString(),
        },
      });
    },
    staleTime: 30_000,
    refetchInterval: refreshMs > 0 ? refreshMs : false,
    refetchOnWindowFocus: true,
  });
  const aiItems = useMemo(
    () => buildAiItems(aiSummaryQuery.data, activeWorkspaceId ?? undefined),
    [aiSummaryQuery.data, activeWorkspaceId],
  );
  const notificationsQuery = useQuery({
    queryKey: ["dashboard-notifications"],
    queryFn: () => listNotifications(),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: refreshMs > 0 ? refreshMs : false,
    refetchOnWindowFocus: true,
  });
  const isRefreshing =
    overviewQuery.isFetching || aiSummaryQuery.isFetching || notificationsQuery.isFetching;
  const lastUpdatedAt = overviewQuery.dataUpdatedAt;
  const refreshAll = () => {
    void overviewQuery.refetch();
    void aiSummaryQuery.refetch();
    void notificationsQuery.refetch();
  };
  const importantNotifications = useMemo(() => {
    const rows = notificationsQuery.data ?? [];
    const unread = rows.filter((n: any) => !n.is_read);
    const base = [...(unread.length ? unread : rows)];
    const time = (n: any) => new Date(n.created_at ?? 0).getTime();
    if (notifSort === "priority") {
      base.sort(
        (a: any, b: any) => notifPriorityRank(b) - notifPriorityRank(a) || time(b) - time(a),
      );
    } else {
      base.sort((a: any, b: any) => time(b) - time(a));
    }
    return base.slice(0, 3);
  }, [notificationsQuery.data, notifSort]);
  const markReadFn = useServerFn(markNotificationsRead);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const handleMarkRead = async (id: string) => {
    if (markingId) return;
    setMarkingId(id);
    try {
      await markReadFn({ data: { ids: [id] } });
      await notificationsQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Đã đánh dấu là đã đọc");
    } catch (e) {
      toast.error((e as Error)?.message ?? "Không đánh dấu được thông báo");
    } finally {
      setMarkingId(null);
    }
  };
  const sendAiFn = useServerFn(sendAiMessage);
  const [aiInput, setAiInput] = useState("");
  const [openedLinks, setOpenedLinks] = useState<
    Array<{ label: string; path: string; filters?: Record<string, string | number | boolean>; at: string }>
  >([]);
  const recordOpenedLink = (
    label: string,
    path: string,
    filters?: Record<string, unknown>,
  ) => {
    const safe: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(filters ?? {})) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") safe[k] = v;
    }
    setOpenedLinks((prev) =>
      [
        { label, path, ...(Object.keys(safe).length ? { filters: safe } : {}), at: new Date().toISOString() },
        ...prev.filter((l) => l.path !== path || JSON.stringify(l.filters ?? {}) !== JSON.stringify(safe)),
      ].slice(0, 5),
    );
  };
  const [aiSending, setAiSending] = useState(false);
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);
  const [aiThread, setAiThread] = useState<Array<{ role: "user" | "assistant"; content: string }>>(
    [],
  );
  const aiThreadRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    aiThreadRef.current?.scrollTo({ top: aiThreadRef.current.scrollHeight });
  }, [aiThread, aiSending]);

  const handleAskAi = async () => {
    const text = aiInput.trim();
    if (!text || aiSending) return;
    const s = aiSummaryQuery.data;
    const contextNote = [
      `Workspace: ${activeWorkspaceName ?? (activeWorkspaceId ? activeWorkspaceId : "Tất cả workspace")}`,
      `Khoảng thời gian đang xem: ${rangeDays} ngày qua`,
      s
        ? `Số liệu hiện tại — tài liệu cần cập nhật (>30 ngày): ${s.staleDocuments ?? 0}; nhiệm vụ quá hạn: ${s.overdueTasks ?? 0}; cuộc họp hôm nay: ${s.meetingsToday ?? 0}; quy trình chờ duyệt: ${s.pendingWorkflowApprovals ?? 0}`
        : "Số liệu hiện tại: chưa tải được",
      openedLinks.length
        ? `Trang đã mở từ AI Assistant: ${openedLinks
            .map(
              (l) =>
                `${l.label} (${l.path}${
                  l.filters && Object.keys(l.filters).length
                    ? "?" + new URLSearchParams(Object.entries(l.filters).map(([k, v]) => [k, String(v)])).toString()
                    : ""
                })`,
            )
            .join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    setAiInput("");
    setAiThread((prev) => [...prev, { role: "user", content: text }]);
    setAiSending(true);
    try {
      const res = await sendAiFn({
        data: {
          text,
          contextNote,
          metadata: {
            source: "dashboard_ai_assistant",
            workspaceId: activeWorkspaceId ?? null,
            workspaceName: activeWorkspaceName ?? null,
            rangeDays,
            openedLinks,
          },
          ...(aiConversationId ? { conversationId: aiConversationId } : {}),
          ...(activeWorkspaceId && !aiConversationId ? { workspaceId: activeWorkspaceId } : {}),
        },
      });
      setAiConversationId(res.conversationId);
      setAiThread((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setAiThread((prev) => prev.slice(0, -1));
      setAiInput(text);
      toast.error(err instanceof Error ? err.message : "Không gửi được câu hỏi tới AI");
    } finally {
      setAiSending(false);
    }
  };
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
                    <option value={30}>30 ngày qua</option>
                    <option value={90}>90 ngày qua</option>
                  </select>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                  <RefreshCw
                    className={`h-4 w-4 text-muted-foreground ${isRefreshing ? "animate-spin" : ""}`}
                  />
                  <select
                    value={refreshMs}
                    onChange={(e) => changeRefreshMs(Number(e.target.value))}
                    className="bg-transparent text-sm focus:outline-none"
                    aria-label="Tần suất tự động làm mới"
                  >
                    {REFRESH_INTERVALS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={refreshAll}
                    disabled={isRefreshing}
                    className="ml-1 border-l border-border pl-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
                    title={
                      lastUpdatedAt
                        ? `Cập nhật lúc ${new Date(lastUpdatedAt).toLocaleTimeString("vi-VN")}`
                        : undefined
                    }
                  >
                    Làm mới
                  </button>
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
                        Chọn khối muốn hiển thị và kéo-thả để đổi thứ tự. Thiết lập đồng bộ theo
                        tài khoản của bạn.
                      </p>
                    </div>
                    <ul className="max-h-80 space-y-1 overflow-y-auto p-2">
                      {layoutOrder.map((key) => {
                        const opt = SECTION_OPTIONS.find((o) => o.key === key)!;
                        return (
                          <li
                            key={key}
                            draggable
                            onDragStart={() => setDragKey(key)}
                            onDragEnd={() => setDragKey(null)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (dragKey) moveSection(dragKey, key);
                              setDragKey(null);
                            }}
                            className={`rounded-lg ${dragKey === key ? "opacity-50" : ""}`}
                          >
                            <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                              <span className="flex min-w-0 items-center gap-2">
                                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                                <span className="truncate">{opt.label}</span>
                              </span>
                              <Switch
                                checked={visible[key]}
                                onCheckedChange={() => toggleSection(key)}
                                aria-label={opt.label}
                              />
                            </div>
                          </li>
                        );
                      })}
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

            {(() => {
              const blocks: Partial<Record<SectionKey, ReactNode>> = {
                kpis: (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {kpis.map((k) => (
                  <KpiCard key={k.key} k={k} rangeDays={rangeDays} />
                ))}
              </div>
                ),
                activity: (
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
                ),
                donut: (
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
                ),
                projects: (
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
                ),
                recent: (
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
                ),
                meetings: (
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
                ),
                workspaces: (
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
                ),
              };
              return (
                <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {layoutOrder
                    .filter((k) => k !== "ai" && visible[k] && blocks[k])
                    .map((k) => (
                      <div key={k} className={`min-w-0 ${SECTION_SPAN[k]}`}>
                        {blocks[k]}
                      </div>
                    ))}
                </div>
              );
            })()}
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
                <div className="text-sm font-medium">Chào {userName},</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Đây là những thông tin AI tổng hợp cho bạn hôm nay.
                </p>
              </div>
              {aiSummaryQuery.isPending ? (
                <ul className="mt-4 space-y-2" aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 p-3"
                    >
                      <span className="h-9 w-9 animate-pulse rounded-lg bg-surface-2" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
                        <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-2" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : aiSummaryQuery.isError ? (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-destructive" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-destructive">
                        Không tải được số liệu tổng hợp
                      </div>
                      <div className="mt-0.5 break-words text-muted-foreground">
                        {(aiSummaryQuery.error as Error)?.message ?? "Lỗi không xác định"}
                      </div>
                      <button
                        onClick={() => aiSummaryQuery.refetch()}
                        disabled={aiSummaryQuery.isFetching}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] hover:bg-surface-2 disabled:opacity-60"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${aiSummaryQuery.isFetching ? "animate-spin" : ""}`}
                        />
                        Thử lại
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
              <ul className="mt-4 space-y-2">
                {aiItems.map((it) => {
                  const Icon = it.icon;
                  return (
                    <li key={it.title}>
                      <Link
                        to={it.to}
                        search={it.search as never}
                        preload="intent"
                        onClick={() =>
                          recordOpenedLink(
                            it.title,
                            it.to,
                            (it.search ?? {}) as Record<string, unknown>,
                          )
                        }
                        className="group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 p-3 text-left hover:border-primary/40"
                      >
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
                      </Link>
                    </li>
                  );
                })}
              </ul>
              )}

              {(aiThread.length > 0 || aiSending) && (
                <div
                  ref={aiThreadRef}
                  className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-surface-2/40 p-3"
                >
                  {aiThread.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.role === "user"
                          ? "ml-6 rounded-lg bg-primary px-2.5 py-1.5 text-xs text-primary-foreground"
                          : "text-xs whitespace-pre-wrap text-foreground"
                      }
                    >
                      {m.content}
                    </div>
                  ))}
                  {aiSending && (
                    <div className="text-xs text-muted-foreground">AI đang trả lời…</div>
                  )}
                </div>
              )}

              {openedLinks.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {openedLinks.map((l) => (
                    <span
                      key={`${l.path}-${l.at}`}
                      title={`${l.path}${l.filters ? " · " + Object.entries(l.filters).map(([k, v]) => `${k}=${v}`).join(", ") : ""}`}
                      className="rounded-full border border-border/60 bg-surface-2/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      Đã mở: {l.label}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2">
                <input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleAskAi();
                    }
                  }}
                  disabled={aiSending}
                  placeholder="Ask AI anything..."
                  className="flex-1 bg-transparent text-sm placeholder:text-primary/70 focus:outline-none disabled:opacity-60"
                />
                <button
                  onClick={() => void handleAskAi()}
                  disabled={aiSending || !aiInput.trim()}
                  className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              {aiConversationId && (
                <Link
                  to="/ai"
                  className="mt-2 block text-[11px] text-primary hover:underline"
                >
                  Mở hội thoại đầy đủ trong AI Workspace →
                </Link>
              )}

              <div className="mt-5 rounded-xl border border-border/60 bg-surface-2/40 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Thông báo quan trọng
                </div>
                {notificationsQuery.isPending ? (
                  <div className="mt-2 space-y-2" aria-busy="true">
                    {[0, 1].map((i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
                        <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-2" />
                      </div>
                    ))}
                  </div>
                ) : notificationsQuery.isError ? (
                  <div role="alert" className="mt-2 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-destructive" />
                      <div className="min-w-0">
                        <div className="font-medium text-destructive">
                          Không tải được thông báo
                        </div>
                        <div className="break-words text-muted-foreground">
                          {(notificationsQuery.error as Error)?.message ?? "Lỗi không xác định"}
                        </div>
                        <button
                          onClick={() => notificationsQuery.refetch()}
                          disabled={notificationsQuery.isFetching}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] hover:bg-surface-2 disabled:opacity-60"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${notificationsQuery.isFetching ? "animate-spin" : ""}`}
                          />
                          Thử lại
                        </button>
                      </div>
                    </div>
                  </div>
                ) : importantNotifications.length === 0 ? (
                  <div className="mt-2 text-xs text-muted-foreground">Không có thông báo mới</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {importantNotifications.map((n: any) => (
                      <div key={n.id} className="flex items-start gap-2 text-xs">
                        <button
                          type="button"
                          disabled={n.is_read || markingId === n.id}
                          onClick={() => handleMarkRead(n.id)}
                          title={n.is_read ? "Đã đọc" : "Đánh dấu đã đọc"}
                          aria-label={n.is_read ? "Đã đọc" : "Đánh dấu đã đọc"}
                          className="mt-0.5 shrink-0 disabled:opacity-60"
                        >
                          <Bell
                            className={`h-3.5 w-3.5 ${n.is_read ? "text-muted-foreground" : "text-amber-300"}`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMarkRead(n.id)}
                          className="min-w-0 flex-1 text-left hover:opacity-80 disabled:opacity-60"
                          disabled={markingId === n.id}
                        >
                          <div
                            className={`truncate ${n.is_read ? "font-normal text-muted-foreground" : "font-medium"}`}
                          >
                            {n.title}
                          </div>
                          {n.body && (
                            <div className="truncate text-muted-foreground">{n.body}</div>
                          )}
                          <div className="text-muted-foreground">
                            {new Intl.DateTimeFormat("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              timeZone: "Asia/Ho_Chi_Minh",
                            }).format(new Date(n.created_at))}{" "}
                            (GMT+7)
                          </div>
                        </button>
                        <Link
                          to="/notifications"
                          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Mở trang thông báo"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
                <Link
                  to="/notifications"
                  preload="intent"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Xem tất cả thông báo <ArrowUpRight className="h-3 w-3" />
                </Link>
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
