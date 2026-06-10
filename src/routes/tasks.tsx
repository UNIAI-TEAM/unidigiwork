import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Filter,
  Star,
  Settings2,
  MoreHorizontal,
  MessageSquare,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  Calendar,
  BarChart3,
  Users as UsersIcon,
  Upload,
  Download,
  FileText,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks & Projects · UNIWORK" },
      {
        name: "description",
        content:
          "Bảng Kanban quản lý công việc, sprint, burndown và AI Project Copilot trên UNIWORK.",
      },
    ],
  }),
  component: TasksPage,
});

type Status = "todo" | "inprogress" | "review" | "testing" | "done";
type Tag = { label: string; color: string };
type Task = {
  id: string;
  title: string;
  status: Status;
  assignee: { name: string; seed: string };
  tag: Tag;
  comments?: number;
  attachments?: number;
  date: string;
  subtasks?: { done: number; total: number };
  doneMark?: boolean;
};

const tagColors: Record<string, string> = {
  Design: "bg-pink-500/20 text-pink-300 border border-pink-500/30",
  Backend: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  Frontend: "bg-sky-500/20 text-sky-300 border border-sky-500/30",
  Testing: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  DevOps: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
  Database: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
  Docs: "bg-teal-500/20 text-teal-300 border border-teal-500/30",
};

const initialTasks: Task[] = [
  {
    id: "STOS-128",
    title: "Thiết kế giao diện Dashboard",
    status: "todo",
    assignee: { name: "Minh Anh", seed: "minh-anh" },
    tag: { label: "Design", color: tagColors.Design },
    comments: 3,
    attachments: 2,
    date: "May 30",
  },
  {
    id: "STOS-142",
    title: "Tích hợp API Payment Gateway",
    status: "todo",
    assignee: { name: "Quang Minh", seed: "quang-minh" },
    tag: { label: "Backend", color: tagColors.Backend },
    comments: 2,
    date: "May 31",
    subtasks: { done: 2, total: 3 },
  },
  {
    id: "STOS-143",
    title: "Viết tài liệu hướng dẫn sử dụng",
    status: "todo",
    assignee: { name: "Bảo Ngọc", seed: "bao-ngoc" },
    tag: { label: "Docs", color: tagColors.Docs },
    comments: 1,
    date: "",
  },

  {
    id: "STOS-102",
    title: "Phát triển API Gateway",
    status: "inprogress",
    assignee: { name: "Tuấn Nam", seed: "tuan-nam-ba" },
    tag: { label: "Backend", color: tagColors.Backend },
    comments: 5,
    date: "May 24",
    subtasks: { done: 3, total: 5 },
  },
  {
    id: "STOS-115",
    title: "Quản lý người dùng & phân quyền",
    status: "inprogress",
    assignee: { name: "Hoàng Long", seed: "hoang-long" },
    tag: { label: "Backend", color: tagColors.Backend },
    comments: 4,
    date: "May",
    subtasks: { done: 2, total: 4 },
  },
  {
    id: "STOS-117",
    title: "Thiết kế Database Schema",
    status: "inprogress",
    assignee: { name: "Tuấn Nam", seed: "tuan-nam-ba" },
    tag: { label: "Database", color: tagColors.Database },
    comments: 3,
    date: "M",
    subtasks: { done: 1, total: 3 },
  },

  {
    id: "STOS-090",
    title: "Module Quản lý dự án",
    status: "review",
    assignee: { name: "Hương Trần", seed: "huong-tran" },
    tag: { label: "Backend", color: tagColors.Backend },
    comments: 2,
    date: "May 22",
    subtasks: { done: 2, total: 3 },
  },
  {
    id: "STOS-091",
    title: "Báo cáo tiến độ dự án",
    status: "review",
    assignee: { name: "Duy Anh", seed: "duy-anh" },
    tag: { label: "Frontend", color: tagColors.Frontend },
    comments: 1,
    date: "May 23",
    subtasks: { done: 1, total: 2 },
  },

  {
    id: "STOS-081",
    title: "Kiểm thử API Gateway",
    status: "testing",
    assignee: { name: "Phương Linh", seed: "phuong-linh" },
    tag: { label: "Testing", color: tagColors.Testing },
    comments: 3,
    date: "May 21",
    subtasks: { done: 2, total: 4 },
  },
  {
    id: "STOS-082",
    title: "Kiểm thử chức năng đăng nhập",
    status: "testing",
    assignee: { name: "Phương Linh", seed: "phuong-linh" },
    tag: { label: "Testing", color: tagColors.Testing },
    comments: 2,
    date: "",
    subtasks: { done: 1, total: 3 },
  },

  {
    id: "STOS-060",
    title: "Thiết lập môi trường Dev",
    status: "done",
    assignee: { name: "Tuấn Nam", seed: "tuan-nam-ba" },
    tag: { label: "DevOps", color: tagColors.DevOps },
    date: "May 10",
    doneMark: true,
  },
  {
    id: "STOS-061",
    title: "CI/CD Pipeline",
    status: "done",
    assignee: { name: "Minh Anh", seed: "minh-anh" },
    tag: { label: "DevOps", color: tagColors.DevOps },
    date: "May 11",
    doneMark: true,
  },
  {
    id: "STOS-062",
    title: "Thiết kế UI Login",
    status: "done",
    assignee: { name: "Duy Anh", seed: "duy-anh" },
    tag: { label: "Design", color: tagColors.Design },
    date: "May 12",
    doneMark: true,
  },
];

const columns: { status: Status; key: string; count: number; barColor: string }[] = [
  { status: "todo", key: "tasks.col.todo", count: 26, barColor: "bg-muted-foreground" },
  { status: "inprogress", key: "tasks.col.inprogress", count: 28, barColor: "bg-sky-500" },
  { status: "review", key: "tasks.col.review", count: 16, barColor: "bg-violet-500" },
  { status: "testing", key: "tasks.col.testing", count: 14, barColor: "bg-amber-500" },
  { status: "done", key: "tasks.col.done", count: 44, barColor: "bg-success" },
];

function TasksPage() {
  const [open, setOpen] = useSidebarState();
  const { t } = useI18n();
  const [tab, setTab] = useState<
    "overview" | "board" | "list" | "timeline" | "calendar" | "reports" | "files"
  >("board");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [counter, setCounter] = useState(200);

  const addTask = (
    status: Status,
    payload: { title: string; tag: string; assigneeSeed: string; assigneeName: string },
  ) => {
    const id = `STOS-${counter}`;
    setCounter((c) => c + 1);
    setTasks((prev) => [
      {
        id,
        title: payload.title,
        status,
        assignee: { name: payload.assigneeName, seed: payload.assigneeSeed },
        tag: { label: payload.tag, color: tagColors[payload.tag] ?? tagColors.Backend },
        date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      },
      ...prev,
    ]);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="tasks" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TasksTopbar onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            {/* Project header row */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <button className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500 text-[11px] font-semibold text-white">
                  S
                </span>
                {t("tasks.project")}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>

              <nav className="flex items-center gap-5 text-sm">
                {(
                  ["overview", "board", "list", "timeline", "calendar", "reports", "files"] as const
                ).map((id) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`-mb-px border-b-2 py-1.5 transition-colors ${tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  >
                    {t(`tasks.tab.${id}` as any)}
                  </button>
                ))}
              </nav>
              <button className="ml-auto rounded-lg p-2 hover:bg-surface-2">
                <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Title row */}
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">STOS Platform Development</h1>
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t("tasks.sub")}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {["tuan-nam-ba", "huong-tran", "minh-anh", "phuong-linh", "duy-anh"].map((s) => (
                    <img
                      key={s}
                      src={avatar(s)}
                      alt=""
                      className="h-7 w-7 rounded-full border-2 border-bg object-cover"
                    />
                  ))}
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg bg-surface-2 text-[10px] text-muted-foreground">
                    +8
                  </span>
                </div>
                <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
                  <Settings2 className="h-4 w-4" /> {t("tasks.settings")}{" "}
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* KPI row */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                label={t("tasks.kpi.progress")}
                value="72%"
                footer={
                  <div className="h-1.5 w-full rounded-full bg-surface-2">
                    <div className="h-full w-[72%] rounded-full bg-primary" />
                  </div>
                }
              />
              <KpiCard
                label={t("tasks.kpi.tasks")}
                value="128"
                footer={<span className="text-xs text-warning">18 {t("tasks.kpi.overdue")}</span>}
              />
              <KpiCard label={t("tasks.kpi.completed")} value="92" valueClass="text-success" />
              <KpiCard label={t("tasks.kpi.inprogress")} value="28" valueClass="text-sky-400" />
              <KpiCard label={t("tasks.kpi.todo")} value="26" />
              <KpiCard label={t("tasks.kpi.blocked")} value="7" valueClass="text-destructive" />
            </div>

            {/* Board */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              {columns.map((col) => (
                <BoardColumn
                  key={col.status}
                  col={col}
                  tasks={tasks.filter((tk) => tk.status === col.status)}
                  onAdd={(payload) => addTask(col.status, payload)}
                />
              ))}
            </div>

            {/* Bottom panels */}
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ProjectOverview />
              <BurndownChart />
              <MyTasks tasks={tasks} />
            </div>
          </main>

          <CopilotPanel />
        </div>
      </div>
    </div>
  );
}

function TasksTopbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { t } = useI18n();
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-6">
      <AppTopbarStub
        onOpenSidebar={onOpenSidebar}
        newLabel={t("tasks.new")}
        filtersLabel={t("tasks.filters")}
      />
    </header>
  );
}

function AppTopbarStub({
  onOpenSidebar,
  newLabel,
  filtersLabel,
}: {
  onOpenSidebar: () => void;
  newLabel: string;
  filtersLabel: string;
}) {
  // Use shared AppTopbar variant via re-render: simpler — just use AppTopbar variant=documents
  return <AppTopbar variant="documents" onOpenSidebar={onOpenSidebar} />;
}

function KpiCard({
  label,
  value,
  footer,
  valueClass = "",
}: {
  label: string;
  value: string;
  footer?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

type QuickAddPayload = { title: string; tag: string; assigneeSeed: string; assigneeName: string };

function BoardColumn({
  col,
  tasks,
  onAdd,
}: {
  col: (typeof columns)[number];
  tasks: Task[];
  onAdd: (p: QuickAddPayload) => void;
}) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface/40 p-3">
      <div className="flex items-center gap-2 px-1">
        <span className={`h-2 w-2 rounded-full ${col.barColor}`} />
        <span className="text-sm font-semibold">{t(col.key as any)}</span>
        <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted-foreground">
          {col.count}
        </span>
        <button
          onClick={() => setAdding(true)}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-surface-2"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {tasks.map((tk) => (
        <TaskCard key={tk.id} task={tk} />
      ))}
      {adding ? (
        <QuickAddForm
          onCancel={() => setAdding(false)}
          onSubmit={(p) => {
            onAdd(p);
            setAdding(false);
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground hover:bg-surface-2"
        >
          <Plus className="h-3.5 w-3.5" /> {t("tasks.add")}
        </button>
      )}
    </div>
  );
}

const assigneeOptions = [
  { name: "Tuấn Nam", seed: "tuan-nam-ba" },
  { name: "Minh Anh", seed: "minh-anh" },
  { name: "Hương Trần", seed: "huong-tran" },
  { name: "Phương Linh", seed: "phuong-linh" },
  { name: "Duy Anh", seed: "duy-anh" },
  { name: "Bảo Ngọc", seed: "bao-ngoc" },
  { name: "Quang Minh", seed: "quang-minh" },
  { name: "Hoàng Long", seed: "hoang-long" },
];

const tagOptions = Object.keys(tagColors);

function QuickAddForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (p: QuickAddPayload) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState(tagOptions[0]);
  const [assigneeSeed, setAssigneeSeed] = useState(assigneeOptions[0].seed);

  const submit = () => {
    const v = title.trim();
    if (!v) return;
    const a = assigneeOptions.find((x) => x.seed === assigneeSeed) ?? assigneeOptions[0];
    onSubmit({ title: v, tag, assigneeSeed: a.seed, assigneeName: a.name });
    setTitle("");
  };

  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-surface p-3 shadow-sm">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") onCancel();
        }}
        placeholder={t("tasks.quick.title")}
        className="w-full rounded-md bg-surface-2 px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <div className="flex items-center gap-2">
        <select
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className="rounded-md bg-surface-2 px-2 py-1 text-xs hover:bg-surface-3 focus:outline-none"
          aria-label={t("tasks.quick.tag")}
        >
          {tagOptions.map((tg) => (
            <option key={tg} value={tg}>
              {tg}
            </option>
          ))}
        </select>
        <select
          value={assigneeSeed}
          onChange={(e) => setAssigneeSeed(e.target.value)}
          className="flex-1 rounded-md bg-surface-2 px-2 py-1 text-xs hover:bg-surface-3 focus:outline-none"
          aria-label={t("tasks.quick.assignee")}
        >
          {assigneeOptions.map((a) => (
            <option key={a.seed} value={a.seed}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2"
        >
          {t("tasks.quick.cancel")}
        </button>
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t("tasks.quick.save")}
        </button>
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  return (
    <div className="cursor-grab rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{task.id}</span>
        <button className="rounded p-0.5 hover:bg-surface-2">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1 text-sm font-medium leading-snug">{task.title}</div>
      <div className="mt-3 flex items-center gap-2">
        <img
          src={avatar(task.assignee.seed)}
          alt={task.assignee.name}
          className="h-6 w-6 rounded-full object-cover"
        />
        <span className="text-xs text-muted-foreground">{task.assignee.name}</span>
        <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${task.tag.color}`}>
          {task.tag.label}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        {task.comments !== undefined && (
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> {task.comments}
          </span>
        )}
        {task.attachments !== undefined && (
          <span className="flex items-center gap-1">
            <Paperclip className="h-3 w-3" /> {task.attachments}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {task.date && (
            <>
              <Calendar className="h-3 w-3" /> {task.date}
            </>
          )}
        </span>
        {task.doneMark && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
        {task.subtasks && (
          <span className="text-foreground">
            {task.subtasks.done}/{task.subtasks.total}
          </span>
        )}
      </div>
      {task.subtasks && (
        <div className="mt-2 h-1 w-full rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(task.subtasks.done / task.subtasks.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function ProjectOverview() {
  const { t } = useI18n();
  const segs = [
    { label: "Done", value: 92, pct: 72, color: "bg-success" },
    { label: "In Progress", value: 28, pct: 22, color: "bg-sky-500" },
    { label: "To Do", value: 26, pct: 20, color: "bg-muted-foreground" },
    { label: "Blocked", value: 7, pct: 6, color: "bg-destructive" },
  ];
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("tasks.overview")}</h3>
        <button className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:bg-surface-3">
          {t("tasks.sprint")} <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-4 flex items-center gap-5">
        <DonutChart />
        <div className="flex-1 space-y-2 text-xs">
          {segs.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto text-foreground">
                {s.value} ({s.pct}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DonutChart() {
  // simple conic-gradient donut
  const style = {
    background:
      "conic-gradient(hsl(var(--success)) 0% 72%, hsl(var(--primary)) 72% 92%, hsl(var(--muted-foreground)) 92% 96%, hsl(var(--destructive)) 96% 100%)",
  } as React.CSSProperties;
  const { t } = useI18n();
  return (
    <div className="relative h-28 w-28 shrink-0 rounded-full" style={style}>
      <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-surface">
        <div className="text-lg font-bold">128</div>
        <div className="text-[10px] text-muted-foreground">{t("tasks.total")}</div>
      </div>
    </div>
  );
}

function BurndownChart() {
  const { t } = useI18n();
  // SVG burndown
  const w = 320,
    h = 140,
    pad = 24;
  const ideal = [100, 80, 60, 40, 20, 0];
  const remaining = [100, 86, 72, 58, 40, 28];
  const completed = [0, 14, 28, 42, 60, 72];
  const xs = (i: number) => pad + (i * (w - pad * 2)) / (ideal.length - 1);
  const ys = (v: number) => h - pad - (v / 100) * (h - pad * 2);
  const path = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${ys(v)}`).join(" ");
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("tasks.burndown")}</h3>
        <button className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted-foreground hover:bg-surface-3">
          Sprint 6 <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-36 w-full">
        <path
          d={path(ideal)}
          stroke="hsl(var(--muted-foreground))"
          strokeDasharray="4 4"
          fill="none"
        />
        <path d={path(remaining)} stroke="hsl(var(--primary))" strokeWidth="2" fill="none" />
        <path d={path(completed)} stroke="hsl(var(--success))" strokeWidth="2" fill="none" />
      </svg>
      <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 border-t border-dashed border-muted-foreground" />{" "}
          {t("tasks.legend.ideal")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-primary" /> {t("tasks.legend.remaining")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-success" /> {t("tasks.legend.completed")}
        </span>
      </div>
    </section>
  );
}

function MyTasks({ tasks }: { tasks: Task[] }) {
  const { t } = useI18n();
  const list = tasks.slice(0, 5);
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {t("tasks.mytasks")} ({list.length})
        </h3>
        <button className="text-xs text-primary hover:underline">{t("tasks.viewall")}</button>
      </div>
      <div className="mt-2 divide-y divide-border">
        {list.map((tk) => (
          <div key={tk.id} className="flex items-center gap-2 py-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">{tk.id}</span>
            <span className="flex-1 truncate text-foreground">{tk.title}</span>
            <span
              className={`hidden rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline ${tk.tag.color}`}
            >
              {tk.tag.label}
            </span>
            <span className="hidden text-muted-foreground md:inline">{tk.date}</span>
          </div>
        ))}
      </div>
      <button className="mt-2 w-full rounded-lg py-2 text-center text-xs text-primary hover:bg-primary/10">
        {t("tasks.viewalltasks")}
      </button>
    </section>
  );
}

function CopilotPanel() {
  const { t } = useI18n();
  const risks = [
    "API Gateway có thể trễ 2 ngày",
    "Thiếu 1 tester cho sprint hiện tại",
    "Tài liệu API chưa được cập nhật",
  ];
  const suggestions = [
    "Ưu tiên hoàn thành API Gateway",
    "Bổ sung 1 tester cho team",
    "Cập nhật tài liệu API Spec",
  ];
  return (
    <aside className="hidden w-[340px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface xl:flex">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">{t("tasks.copilot")}</h2>
        <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          BETA
        </span>
        <button className="ml-auto rounded p-1 text-muted-foreground hover:bg-surface-2">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <section className="px-5 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{t("tasks.health")}</span>
          <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-medium text-success">
            {t("tasks.health.good")}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("tasks.health.desc")}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-surface-2">
            <div className="h-full w-[75%] rounded-full bg-success" />
          </div>
          <span className="text-xs text-muted-foreground">75%</span>
        </div>
      </section>

      <section className="border-t border-border px-5 py-4">
        <h3 className="mb-2 text-xs font-semibold text-foreground">{t("tasks.risks")}</h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {risks.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" /> {r}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-border px-5 py-4">
        <h3 className="mb-2 text-xs font-semibold text-foreground">{t("tasks.suggest")}</h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {suggestions.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" /> {r}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-border px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold">{t("tasks.activity")}</h3>
          <button className="text-[11px] text-primary hover:underline">{t("tasks.viewall")}</button>
        </div>
        <div className="space-y-3 text-xs">
          <Activity
            seed="phuong-linh"
            name="Phương Linh"
            action="đã cập nhật trạng thái của"
            target="STOS-081 sang Testing"
            time={`2 ${t("tasks.minago")}`}
          />
          <Activity
            seed="tuan-nam-ba"
            name="Tuấn Nam"
            action="đã bình luận vào"
            target="STOS-102"
            time={`15 ${t("tasks.minago")}`}
          />
          <Activity
            seed="duy-anh"
            name="Duy Anh"
            action="đã hoàn thành"
            target="STOS-062"
            time={`1 ${t("tasks.hago")}`}
          />
        </div>
      </section>

      <section className="border-t border-border px-5 py-4">
        <h3 className="mb-3 text-xs font-semibold">{t("tasks.quick")}</h3>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction icon={BarChart3} label={t("tasks.quick.gantt")} />
          <QuickAction icon={UsersIcon} label={t("tasks.quick.resource")} />
          <QuickAction icon={Upload} label={t("tasks.quick.import")} />
          <QuickAction icon={Download} label={t("tasks.quick.export")} />
        </div>
      </section>

      <section className="border-t border-border px-5 py-4">
        <h3 className="mb-2 text-xs font-semibold">{t("tasks.integrations")}</h3>
        <div className="flex items-center gap-2">
          {["G", "Gh", "Fi", "No"].map((s, i) => (
            <div
              key={i}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-xs text-muted-foreground"
            >
              {s}
            </div>
          ))}
          <span className="text-xs text-muted-foreground">+3</span>
        </div>
      </section>
    </aside>
  );
}

function Activity({
  seed,
  name,
  action,
  target,
  time,
}: {
  seed: string;
  name: string;
  action: string;
  target: string;
  time: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <img src={avatar(seed)} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
      <div className="min-w-0">
        <div className="text-foreground">
          <span className="font-medium">{name}</span>{" "}
          <span className="text-muted-foreground">{action}</span>{" "}
          <span className="font-medium">{target}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">{time}</div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button className="flex flex-col items-center gap-1 rounded-lg bg-surface-2 px-2 py-3 text-[10px] text-muted-foreground hover:bg-surface-3 hover:text-foreground">
      <Icon className="h-4 w-4" />
      <span className="text-center leading-tight">{label}</span>
    </button>
  );
}
