import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CalendarDays, CheckSquare, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { getSchoolAgenda, type AgendaItem } from "@/lib/api/school-ops.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DAY = 864e5;
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Thời gian biểu tuần: lịch họp, hạn công việc, bản tin — dữ liệu thật theo quyền người xem. */
export function SchoolTimetable({ workspaceId, onOpenBrief }: { workspaceId: string | null; onOpenBrief: (id: string) => void }) {
  const { t, lang } = useI18n();
  const loc = lang === "vi" ? "vi-VN" : "en-GB";
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const end = useMemo(() => new Date(week.getTime() + 7 * DAY), [week]);
  const fetchAgenda = useServerFn(getSchoolAgenda);
  const q = useQuery({
    queryKey: ["school-agenda", workspaceId, week.toISOString()],
    queryFn: () => fetchAgenda({ data: { workspaceId, from: week.toISOString(), to: end.toISOString() } }),
  });
  const days = Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * DAY));
  const byDay = new Map<string, AgendaItem[]>();
  for (const it of q.data ?? []) {
    const k = dayKey(new Date(it.at));
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }
  const today = dayKey(new Date());
  const now = Date.now();
  const time = (s: string) => new Date(s).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm md:p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("sops.tt.title")}</h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {week.toLocaleDateString(loc)} – {new Date(end.getTime() - DAY).toLocaleDateString(loc)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label={t("sops.tt.prev")} onClick={() => setWeek(new Date(week.getTime() - 7 * DAY))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="h-11" onClick={() => setWeek(startOfWeek(new Date()))}>{t("sops.tt.thisWeek")}</Button>
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label={t("sops.tt.next")} onClick={() => setWeek(new Date(week.getTime() + 7 * DAY))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {q.isLoading ? (
        <div className="mt-3 h-40 animate-pulse rounded-lg bg-muted" />
      ) : q.isError ? (
        <p className="mt-3 text-sm text-destructive">{t("sops.tt.error")}</p>
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-7">
          {days.map((d) => {
            const items = byDay.get(dayKey(d)) ?? [];
            return (
              <div key={d.toISOString()} className={cn("min-h-24 min-w-0 rounded-lg border p-2", dayKey(d) === today && "border-primary/50 bg-primary/5")}>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  {d.toLocaleDateString(loc, { weekday: "short", day: "2-digit", month: "2-digit" })}
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70">{t("sops.tt.none")}</p>
                ) : (
                  <ul className="space-y-1">
                    {items.map((it) => {
                      const done = it.kind === "task" && it.status === "done";
                      const overdue = it.kind === "task" && !done && new Date(it.at).getTime() < now;
                      const Icon = it.kind === "meeting" ? CalendarDays : it.kind === "task" ? CheckSquare : FileText;
                      const label =
                        it.kind === "brief"
                          ? `${t("sops.brief")} · ${t(it.title === "scheduled" ? "sops.scheduled" : "sops.manual")}`
                          : it.title;
                      const body = (
                        <span className="flex min-h-11 items-start gap-1.5 rounded-md px-1.5 py-1.5 text-xs hover:bg-accent md:min-h-0">
                          <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", overdue ? "text-destructive" : "text-muted-foreground")} />
                          <span className="min-w-0">
                            <span className="block tabular-nums text-muted-foreground">
                              {time(it.at)}
                              {it.end_at ? `–${time(it.end_at)}` : ""}
                              {overdue && <span className="ml-1 text-destructive">{t("sops.overdue")}</span>}
                              {done && <span className="ml-1">{t("sops.tt.done")}</span>}
                            </span>
                            <span className={cn("block break-words", done && "line-through opacity-70")}>{label}</span>
                          </span>
                        </span>
                      );
                      return (
                        <li key={it.kind + it.id}>
                          {it.kind === "meeting" ? (
                            <Link to="/meeting/$id" params={{ id: it.id }}>{body}</Link>
                          ) : it.kind === "task" ? (
                            <Link to="/tasks/$id" params={{ id: it.id }}>{body}</Link>
                          ) : (
                            <button type="button" className="w-full text-left" onClick={() => onOpenBrief(it.id)}>{body}</button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{t("sops.tt.meeting")}</span>
        <span className="flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" />{t("sops.tt.task")}</span>
        <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{t("sops.brief")}</span>
      </div>
    </section>
  );
}
