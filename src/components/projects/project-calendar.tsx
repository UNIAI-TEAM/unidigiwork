import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Users, ListChecks, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type CalendarTask = {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  start_at: string | null;
  end_at: string | null;
  progress_pct: number | null;
};

export type CalendarMeeting = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location?: string | null;
  status?: string | null;
};

export type CalendarProposal = {
  id: string;
  title: string;
  createdAt: string;
  handled: "PENDING" | "DONE" | "DISMISSED";
  taskTitle?: string | null;
  workerName?: string | null;
};

const HANDLED_LABEL: Record<CalendarProposal["handled"], string> = {
  PENDING: "Chờ xử lý",
  DONE: "Đã xử lý",
  DISMISSED: "Đã bỏ qua",
};

type DayItem =
  | { kind: "meeting"; id: string; title: string; time: string; location?: string | null }
  | { kind: "task"; id: string; title: string; label: string; progress: number }
  | {
      kind: "proposal";
      id: string;
      title: string;
      handled: CalendarProposal["handled"];
      taskTitle?: string | null;
      workerName?: string | null;
    };


function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function keyOf(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dayKey(d);
}

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Lịch tháng gọn cho điện thoại: chấm xanh = họp, chấm cam = mốc công việc. */
export function ProjectCalendar({
  tasks,
  meetings,
  proposals = [],
}: {
  tasks: CalendarTask[];
  meetings: CalendarMeeting[];
  proposals?: CalendarProposal[];
}) {

  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string>(() => dayKey(today));

  const byDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    const push = (k: string | null, item: DayItem) => {
      if (!k) return;
      const list = map.get(k) ?? [];
      list.push(item);
      map.set(k, list);
    };

    for (const m of meetings) {
      push(keyOf(m.startAt), {
        kind: "meeting",
        id: m.id,
        title: m.title,
        time: new Date(m.startAt).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        location: m.location ?? null,
      });
    }

    for (const t of tasks) {
      const progress = t.progress_pct ?? 0;
      push(keyOf(t.start_at), {
        kind: "task",
        id: `${t.id}-s`,
        title: t.title,
        label: "Bắt đầu",
        progress,
      });
      push(keyOf(t.end_at), {
        kind: "task",
        id: `${t.id}-e`,
        title: t.title,
        label: "Kết thúc",
        progress,
      });
      if (t.due_at && keyOf(t.due_at) !== keyOf(t.end_at)) {
        push(keyOf(t.due_at), {
          kind: "task",
          id: `${t.id}-d`,
          title: t.title,
          label: "Hạn chót",
          progress,
        });
      }
    }

    for (const p of proposals) {
      push(keyOf(p.createdAt), {
        kind: "proposal",
        id: `p-${p.id}`,
        title: p.title,
        handled: p.handled,
        taskTitle: p.taskTitle ?? null,
        workerName: p.workerName ?? null,
      });
    }
    return map;
  }, [tasks, meetings, proposals]);


  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // tuần bắt đầu thứ 2
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const selectedItems = byDay.get(selected) ?? [];
  const monthLabel = cursor.toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
  const todayKey = dayKey(today);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" /> Lịch dự án
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Tháng trước"
            className="h-11 w-11"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium capitalize">{monthLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Tháng sau"
            className="h-11 w-11"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const k = dayKey(d);
          const items = byDay.get(k) ?? [];
          const outside = d.getMonth() !== cursor.getMonth();
          const isSelected = k === selected;
          const hasMeeting = items.some((i) => i.kind === "meeting");
          const hasTask = items.some((i) => i.kind === "task");
          const hasProposal = items.some((i) => i.kind === "proposal");

          return (
            <button
              key={k}
              type="button"
              onClick={() => setSelected(k)}
              aria-label={`Ngày ${d.toLocaleDateString("vi-VN")}`}
              aria-pressed={isSelected}
              className={[
                "flex min-h-11 flex-col items-center justify-center rounded-lg border text-xs transition-colors",
                isSelected
                  ? "border-primary bg-primary/10 font-semibold text-foreground"
                  : "border-transparent hover:bg-muted",
                outside ? "text-muted-foreground/50" : "text-foreground",
                k === todayKey && !isSelected ? "border-border font-semibold" : "",
              ].join(" ")}
            >
              <span>{d.getDate()}</span>
              <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                {hasMeeting && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                {hasTask && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                {hasProposal && <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />}

              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Cuộc họp
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Mốc công việc
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Đề xuất giao việc
        </span>

      </div>

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground">
          {new Date(selected).toLocaleDateString("vi-VN", {
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </p>
        {selectedItems.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Không có lịch trong ngày này.</p>
        )}
        <ul className="mt-2 space-y-2">
          {selectedItems.map((item) => (
            <li key={item.id} className="rounded-lg border border-border p-3">
              {item.kind === "meeting" ? (
                <>
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                      <Users className="h-3.5 w-3.5 text-primary" /> {item.title}
                    </p>
                    <Badge variant="secondary">{item.time}</Badge>
                  </div>
                  {item.location && (
                    <p className="mt-1 text-xs text-muted-foreground">{item.location}</p>
                  )}
                </>
              ) : item.kind === "proposal" ? (
                <>
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                      <Sparkles className="h-3.5 w-3.5 text-violet-500" /> {item.title}
                    </p>
                    <Badge variant={item.handled === "PENDING" ? "default" : "secondary"}>
                      {HANDLED_LABEL[item.handled]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[item.workerName ? `Vai trò: ${item.workerName}` : null, item.taskTitle]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                      <ListChecks className="h-3.5 w-3.5 text-amber-500" /> {item.title}
                    </p>
                    <Badge variant="outline">{item.label}</Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{item.progress}%</span>
                  </div>
                </>
              )}

            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
