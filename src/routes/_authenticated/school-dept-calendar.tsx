import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { listDeptDirectives, type Directive } from "@/lib/api/school-directives.functions";

export const Route = createFileRoute("/_authenticated/school-dept-calendar")({
  head: () => ({
    meta: [
      { title: "Lịch chỉ đạo của tổ — UniWork" },
      { name: "description", content: "Tổ trưởng theo dõi tiến độ từng chỉ đạo của tổ theo từng ngày." },
      { property: "og:title", content: "Lịch chỉ đạo của tổ — UniWork" },
      { property: "og:description", content: "Tổ trưởng theo dõi tiến độ từng chỉ đạo của tổ theo từng ngày." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeptCalendarPage,
});

type Ev = { kind: "source" | "due" | "done" | "accept"; label: string; directive: string; taskId?: string; late?: boolean };
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const tone: Record<Ev["kind"], string> = {
  source: "border-l-primary", due: "border-l-border", done: "border-l-muted-foreground", accept: "border-l-primary bg-primary/5",
};

function buildEvents(items: Directive[]) {
  const map = new Map<string, Ev[]>();
  const add = (at: string | null | undefined, e: Ev) => {
    if (!at) return;
    const k = dayKey(new Date(at));
    map.set(k, [...(map.get(k) ?? []), e]);
  };
  for (const d of items) {
    add(d.meeting?.start_at ?? d.created_at, { kind: "source", label: d.title, directive: d.title });
    add(d.accepted_at, { kind: "accept", label: d.title, directive: d.title });
    for (const t of d.tasks) {
      if (t.status === "done") add(t.completed_at ?? t.updated_at, { kind: "done", label: t.title, directive: d.title, taskId: t.id });
      else if (t.status !== "canceled") add(t.due_at, { kind: "due", label: t.title, directive: d.title, taskId: t.id, late: t.overdue });
    }
  }
  return map;
}

function DeptCalendarPage() {
  const { t } = useI18n();
  const fn = useServerFn(listDeptDirectives);
  // Dùng chung khóa với trang Chỉ đạo của tổ để tự làm mới khi nghiệm thu; làm mới định kỳ 60 giây.
  const q = useQuery({ queryKey: ["school-dept-directives"], queryFn: () => fn(), refetchInterval: 60_000 });
  const [offset, setOffset] = useState(0);
  const days = useMemo(() => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const mon = new Date(now); mon.setDate(now.getDate() - dow + offset * 7);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
  }, [offset]);
  const events = useMemo(() => buildEvents(q.data?.items ?? []), [q.data]);
  const today = dayKey(new Date());

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <Link to="/school-dept-directives" aria-label={t("smt.close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border hover:bg-accent">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("sdc.title")}{q.data?.dept ? ` · ${q.data.dept}` : ""}</h1>
          <p className="text-sm text-muted-foreground">{t("sdc.desc")}</p>
        </div>
      </div>

      {q.data && !q.data.allowed ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("sdd.forbidden")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" className="h-11 w-11" aria-label={t("sdc.prev")} onClick={() => setOffset((o) => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" className="h-11" onClick={() => setOffset(0)}>{t("sdc.thisWeek")}</Button>
            <Button variant="outline" size="icon" className="h-11 w-11" aria-label={t("sdc.next")} onClick={() => setOffset((o) => o + 1)}><ChevronRight className="h-4 w-4" /></Button>
            <div className="ml-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
              {(["source", "due", "done", "accept"] as const).map((k) => <span key={k}>{t(`sdc.k.${k}`)}</span>)}
            </div>
          </div>
          {q.isLoading && <p className="text-sm text-muted-foreground">…</p>}
          <div className="grid gap-3 md:grid-cols-7">
            {days.map((d) => {
              const k = dayKey(d);
              const evs = events.get(k) ?? [];
              return (
                <section key={k} className={`min-w-0 rounded-xl border bg-card p-3 ${k === today ? "border-primary" : ""}`}>
                  <h2 className="mb-2 text-xs font-medium text-muted-foreground">
                    {d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  </h2>
                  {evs.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : (
                    <ul className="space-y-2">
                      {evs.map((e, i) => {
                        const body = (
                          <>
                            <span className={`block text-[11px] ${e.late ? "text-destructive" : "text-muted-foreground"}`}>{t(`sdc.k.${e.kind}`)}{e.late ? ` · ${t("sdt.f.overdue")}` : ""}</span>
                            <span className={`block break-words text-sm ${e.kind === "done" ? "line-through text-muted-foreground" : ""}`}>{e.label}</span>
                            {e.taskId && <span className="block break-words text-[11px] text-muted-foreground">{e.directive}</span>}
                          </>
                        );
                        return (
                          <li key={i} className={`rounded-md border border-l-4 ${tone[e.kind]}`}>
                            {e.taskId ? (
                              <Link to="/tasks/$id" params={{ id: e.taskId }} className="block min-h-11 px-2 py-1.5 hover:bg-accent">{body}</Link>
                            ) : <div className="min-h-11 px-2 py-1.5">{body}</div>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
