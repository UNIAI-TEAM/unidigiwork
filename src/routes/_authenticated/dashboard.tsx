import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Users, Activity, FolderKanban, CheckCircle2, Video, Calendar, Settings2,
  ArrowUpRight, MoreHorizontal, FileText, MessageCircle, GitBranch, Workflow,
  Sparkles, ChevronRight, Send, BookOpen, AlertTriangle, ShieldCheck, X,
  TrendingUp, Clock, Bell,
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
});

const KPIS = [
  { key: "users", label: "Total Users", value: "1,248", delta: "+12.5%", icon: Users, tint: "bg-violet-500/15 text-violet-300" },
  { key: "active", label: "Active Users", value: "856", delta: "+8.3%", icon: Activity, tint: "bg-emerald-500/15 text-emerald-300" },
  { key: "projects", label: "Total Projects", value: "72", delta: "+9.7%", icon: FolderKanban, tint: "bg-sky-500/15 text-sky-300" },
  { key: "tasks", label: "Tasks Completed", value: "1,026", delta: "+15.2%", icon: CheckCircle2, tint: "bg-amber-500/15 text-amber-300" },
  { key: "meetings", label: "Meetings", value: "48", delta: "+6.1%", icon: Video, tint: "bg-rose-500/15 text-rose-300" },
];

const ACTIVITY = {
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  series: [
    { name: "Tin nhắn", color: "#a78bfa", total: "2,512", delta: "+18.6%", data: [320, 480, 410, 620, 700, 760, 820] },
    { name: "Cuộc họp", color: "#34d399", total: "48", delta: "+6.1%", data: [260, 380, 340, 460, 540, 600, 660] },
    { name: "Nhiệm vụ hoàn thành", color: "#fbbf24", total: "1,026", delta: "+15.2%", data: [180, 220, 260, 290, 320, 340, 360] },
    { name: "Tài liệu cập nhật", color: "#60a5fa", total: "342", delta: "+11.3%", data: [120, 150, 200, 240, 280, 300, 340] },
  ],
};

const DONUT = [
  { label: "Hoàn thành", value: 1026, pct: 52, color: "#10b981" },
  { label: "Đang thực hiện", value: 624, pct: 31, color: "#3b82f6" },
  { label: "Chờ xử lý", value: 284, pct: 14, color: "#f59e0b" },
  { label: "Bị tạm dừng", value: 86, pct: 3, color: "#ef4444" },
];

const PROJECTS = [
  { letter: "S", color: "bg-emerald-500", name: "STOS Platform Development", progress: 72 },
  { letter: "U", color: "bg-sky-500", name: "Smart University Portal", progress: 65 },
  { letter: "H", color: "bg-violet-500", name: "UNI-HRM System", progress: 48 },
  { letter: "D", color: "bg-orange-500", name: "DevOps Infrastructure", progress: 81 },
];

const RECENT = [
  { who: "Phạm Minh C", what: "đã cập nhật tài liệu", target: "API_Gateway_Spec_v2.1.docx", area: "Documents", time: "10:30 AM", icon: FileText, tint: "text-sky-300" },
  { who: "Trần Thị B", what: "đã hoàn thành nhiệm vụ", target: "Thiết kế UI Dashboard", area: "STOS Project", time: "09:45 AM", icon: CheckCircle2, tint: "text-emerald-300" },
  { who: "Bạn", what: "đã tham gia cuộc họp", target: "Sprint 6 Daily Standup", area: "Meetings", time: "09:30 AM", icon: Video, tint: "text-rose-300" },
  { who: "Lê Hoàng D", what: "đã tạo mới quy trình", target: "Approval - Leave Request", area: "Workflows", time: "08:15 AM", icon: Workflow, tint: "text-violet-300" },
  { who: "Nguyễn Hương", what: "đã bình luận trong", target: "#dev-team", area: "Chat", time: "07:50 AM", icon: MessageCircle, tint: "text-amber-300" },
];

const MEETINGS = [
  { time: "09:30 AM", dur: "30m", title: "Sprint 6 Daily Standup", count: 5 },
  { time: "10:30 AM", dur: "1h", title: "Review API Gateway", count: 3 },
  { time: "02:00 PM", dur: "45m", title: "Project Sync - STOS", count: 4 },
  { time: "04:00 PM", dur: "1h", title: "HR Weekly Meeting", count: 2 },
];

const WORKSPACES = [
  { letter: "S", color: "bg-emerald-500", name: "STOS Project", members: 325, projects: 24, trend: [10, 14, 12, 18, 22, 26, 32], stroke: "#34d399" },
  { letter: "Y", color: "bg-amber-500", name: "Y tế xã", members: 128, projects: 12, trend: [8, 10, 9, 12, 14, 18, 22], stroke: "#fbbf24" },
  { letter: "U", color: "bg-sky-500", name: "Smart University", members: 248, projects: 18, trend: [12, 14, 18, 16, 20, 24, 28], stroke: "#38bdf8" },
  { letter: "M", color: "bg-rose-500", name: "UNI-HRM", members: 96, projects: 8, trend: [6, 9, 8, 11, 13, 15, 18], stroke: "#fb7185" },
  { letter: "H", color: "bg-violet-500", name: "Marketing & PM", members: 74, projects: 6, trend: [5, 7, 9, 8, 11, 13, 15], stroke: "#a78bfa" },
];

const AI_ITEMS = [
  { icon: FileText, tint: "bg-sky-500/20 text-sky-300", title: "15 tài liệu cần cập nhật", action: "Xem chi tiết" },
  { icon: AlertTriangle, tint: "bg-rose-500/20 text-rose-300", title: "3 nhiệm vụ đang quá hạn", action: "Xem chi tiết" },
  { icon: Video, tint: "bg-emerald-500/20 text-emerald-300", title: "5 cuộc họp trong hôm nay", action: "Xem lịch" },
  { icon: Workflow, tint: "bg-amber-500/20 text-amber-300", title: "2 quy trình cần phê duyệt", action: "Xem chi tiết" },
];

function KpiCard({ k }: { k: typeof KPIS[number] }) {
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
      <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
        <ArrowUpRight className="h-3.5 w-3.5" />
        <span>{k.delta}</span>
        <span className="text-muted-foreground">so với tuần trước</span>
      </div>
    </div>
  );
}

function ActivityChart() {
  const W = 640, H = 240, padL = 32, padR = 12, padT = 16, padB = 28;
  const max = 1000;
  const step = (W - padL - padR) / (ACTIVITY.labels.length - 1);
  const yFor = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const yTicks = [0, 200, 400, 600, 800, 1000];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[240px] w-full">
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)} stroke="hsl(var(--border))" strokeDasharray="3 4" />
          <text x={padL - 6} y={yFor(t) + 3} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">{t}</text>
        </g>
      ))}
      {ACTIVITY.labels.map((l, i) => (
        <text key={l} x={padL + i * step} y={H - 8} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">{l}</text>
      ))}
      {ACTIVITY.series.map((s) => {
        const d = s.data.map((v, i) => `${i === 0 ? "M" : "L"} ${padL + i * step} ${yFor(v)}`).join(" ");
        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            {s.data.map((v, i) => (
              <circle key={i} cx={padL + i * step} cy={yFor(v)} r="3" fill={s.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function Donut() {
  const R = 70, r = 48, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 180 180" className="h-44 w-44 -rotate-90">
        <circle cx="90" cy="90" r={R} fill="none" stroke="hsl(var(--surface-2))" strokeWidth="16" />
        {DONUT.map((d) => {
          const len = (d.pct / 100) * C;
          const dash = `${len} ${C - len}`;
          const offset = -acc;
          acc += len;
          return (
            <circle key={d.label} cx="90" cy="90" r={R} fill="none" stroke={d.color} strokeWidth="16"
              strokeDasharray={dash} strokeDashoffset={offset} strokeLinecap="butt" />
          );
        })}
        <circle cx="90" cy="90" r={r} fill="hsl(var(--surface))" />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-semibold">1,248</div>
        <div className="text-[11px] text-muted-foreground">Total tasks</div>
      </div>
    </div>
  );
}

function Sparkline({ data, stroke }: { data: number[]; stroke: string }) {
  const W = 120, H = 36;
  const max = Math.max(...data), min = Math.min(...data);
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
        <img key={i} src={avatar(`${seed}-${i}`)} alt="" className="h-7 w-7 rounded-full border-2 border-surface object-cover" />
      ))}
      {count > 3 && (
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-2 px-1.5 text-[10px] font-medium text-muted-foreground">+{count - 3}</span>
      )}
    </div>
  );
}

function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAI, setShowAI] = useState(true);

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
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" /> This week <ChevronRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
                </button>
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" /> Customize
                </button>
              </div>
            </div>

            {/* KPI grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {KPIS.map((k) => <KpiCard key={k.key} k={k} />)}
            </div>

            {/* Activity + Donut */}
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Hoạt động tổng quan</h2>
                  <button className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs hover:bg-surface">
                    7 ngày qua <ChevronRight className="h-3 w-3 rotate-90" />
                  </button>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_180px]">
                  <ActivityChart />
                  <ul className="space-y-3 text-sm">
                    {ACTIVITY.series.map((s) => (
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

              <div className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-sm font-semibold">Phân bổ công việc</h2>
                <div className="mt-4 flex flex-col items-center gap-4">
                  <Donut />
                  <ul className="w-full space-y-2 text-sm">
                    {DONUT.map((d) => (
                      <li key={d.label} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full" style={{ background: d.color }} /> {d.label}
                        </span>
                        <span className="tabular-nums">{d.value.toLocaleString()} <span className="text-muted-foreground">({d.pct}%)</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Three column row */}
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {/* Projects */}
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Dự án nổi bật</h2>
                  <button className="text-xs text-primary hover:underline">Xem tất cả</button>
                </div>
                <ul className="mt-4 space-y-3">
                  {PROJECTS.map((p) => (
                    <li key={p.name} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-white ${p.color}`}>{p.letter}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{p.name}</div>
                          <div className="text-[11px] text-muted-foreground">Tiến độ: {p.progress}%</div>
                        </div>
                        <button className="rounded p-1 text-muted-foreground hover:bg-surface"><MoreHorizontal className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400" style={{ width: `${p.progress}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recent activity */}
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Hoạt động gần đây</h2>
                  <button className="text-xs text-primary hover:underline">Xem tất cả</button>
                </div>
                <ul className="mt-4 space-y-3">
                  {RECENT.map((r, i) => {
                    const Icon = r.icon;
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <div className="relative">
                          <img src={avatar(r.who)} alt="" className="h-9 w-9 rounded-full object-cover" />
                          <span className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-surface-2 ${r.tint}`}>
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
                            <span>{r.area}</span><span>·</span><span>{r.time}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Meetings today */}
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Lịch họp hôm nay</h2>
                  <button className="text-xs text-primary hover:underline">Xem lịch đầy đủ</button>
                </div>
                <ul className="mt-4 space-y-3">
                  {MEETINGS.map((m) => (
                    <li key={m.title} className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 p-3">
                      <div className="w-14 shrink-0">
                        <div className="text-sm font-semibold tabular-nums">{m.time}</div>
                        <div className="text-[11px] text-muted-foreground">{m.dur}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m.title}</div>
                        <div className="mt-1"><AvatarStack count={m.count} seed={m.title} /></div>
                      </div>
                      <button className="rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20">Join</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Workspaces overview */}
            <div className="mt-5 rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Tổng quan theo không gian làm việc</h2>
                <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <TrendingUp className="h-3.5 w-3.5" /> So sánh
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {WORKSPACES.map((w) => (
                  <div key={w.name} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded text-[12px] font-semibold text-white ${w.color}`}>{w.letter}</span>
                      <div className="truncate text-sm font-medium">{w.name}</div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-1 text-xs">
                      <div>
                        <div className="text-base font-semibold tabular-nums">{w.members}</div>
                        <div className="text-[10px] text-muted-foreground">thành viên</div>
                      </div>
                      <div>
                        <div className="text-base font-semibold tabular-nums">{w.projects}</div>
                        <div className="text-[10px] text-muted-foreground">dự án</div>
                      </div>
                    </div>
                    <div className="mt-2"><Sparkline data={w.trend} stroke={w.stroke} /></div>
                  </div>
                ))}
              </div>
            </div>
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
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">Beta</span>
                </div>
                <button onClick={() => setShowAI(false)} className="rounded p-1 text-muted-foreground hover:bg-surface-2"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-4">
                <div className="text-sm font-medium">Chào Nguyễn Văn A,</div>
                <p className="mt-1 text-xs text-muted-foreground">Đây là những thông tin AI tổng hợp cho bạn hôm nay.</p>
              </div>
              <ul className="mt-4 space-y-2">
                {AI_ITEMS.map((it) => {
                  const Icon = it.icon;
                  return (
                    <li key={it.title}>
                      <button className="group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-surface-2/40 p-3 text-left hover:border-primary/40">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${it.tint}`}>
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
                <input placeholder="Ask AI anything..." className="flex-1 bg-transparent text-sm placeholder:text-primary/70 focus:outline-none" />
                <button className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90"><Send className="h-3.5 w-3.5" /></button>
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