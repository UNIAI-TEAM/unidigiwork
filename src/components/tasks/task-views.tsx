// Các chế độ xem của trang Công việc: Danh sách, Timeline, Lịch, Báo cáo, Tệp.
// Chỉ đọc dữ liệu thật của workspace đang chọn; không có dữ liệu giả.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, FileText, Paperclip } from "lucide-react";
import { listWorkspaceTaskAttachments } from "@/lib/api/tasks.functions";
import { getTaskAttachmentUrl, formatBytes } from "@/lib/tasks-storage";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "canceled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  updated_at: string;
  row_version: number;
  tags?: string[] | null;
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Cần làm",
  in_progress: "Đang thực hiện",
  blocked: "Bị chặn",
  done: "Hoàn thành",
  canceled: "Đã huỷ",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Thấp",
  normal: "Bình thường",
  high: "Cao",
  urgent: "Khẩn cấp",
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground",
  in_progress: "bg-sky-500",
  blocked: "bg-destructive",
  done: "bg-success",
  canceled: "bg-muted",
};

function fmt(v: string | null) {
  return v ? new Date(v).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : "—";
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

/* ---------------- Danh sách ---------------- */

export function TaskListView({
  tasks,
  statuses,
  onMove,
}: {
  tasks: TaskRow[];
  statuses: readonly TaskStatus[];
  onMove: (taskId: string, toStatus: TaskStatus) => void;
}) {
  if (tasks.length === 0) return <EmptyState text="Chưa có công việc nào khớp bộ lọc." />;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-border text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Công việc</th>
            <th className="px-4 py-3 font-medium">Trạng thái</th>
            <th className="px-4 py-3 font-medium">Ưu tiên</th>
            <th className="px-4 py-3 font-medium">Hạn</th>
            <th className="px-4 py-3 font-medium">Nhãn</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tasks.map((tk) => (
            <tr key={tk.id} className="hover:bg-surface-2/60">
              <td className="px-4 py-3">
                <Link
                  to="/tasks/$id"
                  params={{ id: tk.id }}
                  className="font-medium text-foreground hover:text-primary hover:underline"
                >
                  {tk.title}
                </Link>
              </td>
              <td className="px-4 py-2">
                <select
                  aria-label={`Trạng thái của ${tk.title}`}
                  value={tk.status}
                  onChange={(e) => onMove(tk.id, e.target.value as TaskStatus)}
                  className="min-h-11 rounded-md bg-surface-2 px-2 py-1 text-xs hover:bg-surface-3 focus:outline-none"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {PRIORITY_LABEL[tk.priority]}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(tk.due_at)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {(tk.tags ?? []).map((tg) => (
                    <span
                      key={tg}
                      className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                    >
                      {tg}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Timeline ---------------- */

export function TaskTimelineView({ tasks }: { tasks: TaskRow[] }) {
  const items = useMemo(
    () => tasks.filter((t) => t.due_at).sort((a, b) => (a.due_at! < b.due_at! ? -1 : 1)),
    [tasks],
  );
  if (items.length === 0)
    return <EmptyState text="Chưa có công việc nào có hạn chót để dựng timeline." />;

  const times = items.map((t) => new Date(t.due_at!).getTime());
  const min = Math.min(...times, Date.now());
  const max = Math.max(...times, Date.now());
  const span = Math.max(max - min, 86_400_000);
  const nowPct = ((Date.now() - min) / span) * 100;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{new Date(min).toLocaleDateString("vi-VN")}</span>
        <span>Hôm nay</span>
        <span>{new Date(max).toLocaleDateString("vi-VN")}</span>
      </div>
      <div className="relative space-y-2">
        <div
          className="pointer-events-none absolute top-0 z-10 h-full w-px bg-primary/60"
          style={{ left: `calc(40% + ${(nowPct / 100) * 60}%)` }}
        />
        {items.map((tk) => {
          const pct = ((new Date(tk.due_at!).getTime() - min) / span) * 100;
          return (
            <div key={tk.id} className="flex items-center gap-2">
              <Link
                to="/tasks/$id"
                params={{ id: tk.id }}
                className="w-[40%] truncate text-xs hover:text-primary hover:underline"
              >
                {tk.title}
              </Link>
              <div className="relative h-6 w-[60%] rounded-md bg-surface-2">
                <div
                  className={`absolute top-1 h-4 min-w-[8%] rounded ${STATUS_COLOR[tk.status]}`}
                  style={{ left: `${Math.max(0, Math.min(92, pct))}%` }}
                  title={`${STATUS_LABEL[tk.status]} · hạn ${fmt(tk.due_at)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Lịch ---------------- */

export function TaskCalendarView({ tasks }: { tasks: TaskRow[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const byDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const tk of tasks) {
      if (!tk.due_at) continue;
      const d = new Date(tk.due_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map.set(key, [...(map.get(key) ?? []), tk]);
    }
    return map;
  }, [tasks]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // thứ 2 đầu tuần
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const today = new Date();

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Tháng trước"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          Tháng {month + 1}/{year}
        </span>
        <button
          type="button"
          aria-label="Tháng sau"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="min-h-20 rounded-lg" />;
          const list = byDay.get(`${year}-${month}-${day}`) ?? [];
          const isToday =
            today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
          return (
            <div
              key={day}
              className={`min-h-20 rounded-lg border p-1 text-left ${
                isToday ? "border-primary bg-primary/5" : "border-border bg-surface-2/40"
              }`}
            >
              <div className="text-[11px] text-muted-foreground">{day}</div>
              <div className="mt-0.5 space-y-0.5">
                {list.slice(0, 3).map((tk) => (
                  <Link
                    key={tk.id}
                    to="/tasks/$id"
                    params={{ id: tk.id }}
                    className="block truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary hover:bg-primary/20"
                    title={tk.title}
                  >
                    {tk.title}
                  </Link>
                ))}
                {list.length > 3 && (
                  <div className="px-1 text-[10px] text-muted-foreground">
                    +{list.length - 3} việc
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Báo cáo ---------------- */

export function TaskReportsView({ tasks }: { tasks: TaskRow[] }) {
  const stats = useMemo(() => {
    const byPriority: Record<TaskPriority, number> = { low: 0, normal: 0, high: 0, urgent: 0 };
    const byTag = new Map<string, number>();
    let overdue = 0;
    let done = 0;
    let dueThisWeek = 0;
    const weekAhead = Date.now() + 7 * 86_400_000;
    for (const tk of tasks) {
      byPriority[tk.priority] += 1;
      for (const tg of tk.tags ?? []) byTag.set(tg, (byTag.get(tg) ?? 0) + 1);
      if (tk.status === "done") done += 1;
      if (tk.due_at && tk.status !== "done" && tk.status !== "canceled") {
        const d = new Date(tk.due_at).getTime();
        if (d < Date.now()) overdue += 1;
        else if (d <= weekAhead) dueThisWeek += 1;
      }
    }
    return {
      byPriority,
      byTag: [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      overdue,
      done,
      dueThisWeek,
      total: tasks.length,
    };
  }, [tasks]);

  if (stats.total === 0) return <EmptyState text="Chưa có dữ liệu để lập báo cáo." />;

  const bar = (n: number) => `${Math.round((n / stats.total) * 100)}%`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Phân bổ theo mức ưu tiên</h3>
        <div className="mt-3 space-y-2">
          {(["urgent", "high", "normal", "low"] as TaskPriority[]).map((p) => (
            <div key={p} className="text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>{PRIORITY_LABEL[p]}</span>
                <span className="tabular-nums text-foreground">{stats.byPriority[p]}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: bar(stats.byPriority[p]) }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Chỉ số vận hành</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-surface-2 p-3">
            <dt className="text-xs text-muted-foreground">Tỷ lệ hoàn thành</dt>
            <dd className="mt-1 text-xl font-bold text-success">
              {Math.round((stats.done / stats.total) * 100)}%
            </dd>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <dt className="text-xs text-muted-foreground">Quá hạn</dt>
            <dd className="mt-1 text-xl font-bold text-warning">{stats.overdue}</dd>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <dt className="text-xs text-muted-foreground">Đến hạn trong 7 ngày</dt>
            <dd className="mt-1 text-xl font-bold">{stats.dueThisWeek}</dd>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <dt className="text-xs text-muted-foreground">Tổng công việc</dt>
            <dd className="mt-1 text-xl font-bold">{stats.total}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold">Khối lượng theo nhãn</h3>
        {stats.byTag.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Chưa gắn nhãn cho công việc nào.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {stats.byTag.map(([tag, n]) => (
              <div key={tag} className="text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>{tag}</span>
                  <span className="tabular-nums text-foreground">{n}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-success" style={{ width: bar(n) }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Tệp ---------------- */

export function TaskFilesView({ workspaceId }: { workspaceId: string | undefined }) {
  const q = useQuery({
    queryKey: ["task-attachments", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => listWorkspaceTaskAttachments({ data: { workspaceId: workspaceId! } }),
  });

  const open = async (path: string, download: boolean) => {
    try {
      const url = await getTaskAttachmentUrl(path, download);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (q.isLoading) return <EmptyState text="Đang tải danh sách tệp..." />;
  if (q.isError) return <EmptyState text="Không tải được danh sách tệp." />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <EmptyState text="Chưa có tệp đính kèm nào trong workspace này." />;

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface">
      {rows.map((f) => (
        <div key={f.id} className="flex items-center gap-3 p-3">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => void open(f.storagePath, false)}
              className="block max-w-full truncate text-left text-sm font-medium hover:text-primary hover:underline"
            >
              {f.fileName}
            </button>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <Link
                to="/tasks/$id"
                params={{ id: f.taskId }}
                className="inline-flex items-center gap-1 hover:text-primary hover:underline"
              >
                <Paperclip className="h-3 w-3" /> {f.taskTitle || "Công việc"}
              </Link>
              <span>{f.sizeBytes ? formatBytes(f.sizeBytes) : ""}</span>
              <span>{new Date(f.createdAt).toLocaleDateString("vi-VN")}</span>
            </div>
          </div>
          <button
            type="button"
            aria-label={`Tải ${f.fileName}`}
            onClick={() => void open(f.storagePath, true)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-2"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
