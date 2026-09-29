import { withAppShell } from "@/components/page-shell";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { listMyDirectives, completeMyDirectiveTask, type Directive } from "@/lib/api/school-directives.functions";

export const Route = createFileRoute("/_authenticated/school-my-directives")({
  head: () => ({
    meta: [
      { title: "Việc được giao từ chỉ đạo — UniWork" },
      { name: "description", content: "Giáo viên theo dõi các việc mình phụ trách trong từng chỉ đạo của nhà trường." },
      { property: "og:title", content: "Việc được giao từ chỉ đạo — UniWork" },
      { property: "og:description", content: "Giáo viên theo dõi các việc mình phụ trách trong từng chỉ đạo của nhà trường." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: withAppShell(MyDirectivesPage),
});

const mineDone = (d: Directive) => d.tasks.length > 0 && d.tasks.every((t) => t.status === "done" || t.status === "canceled");

function MyDirectivesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const fn = useServerFn(listMyDirectives);
  const complete = useServerFn(completeMyDirectiveTask);
  const q = useQuery({ queryKey: ["school-my-directives"], queryFn: () => fn() });
  const [tab, setTab] = useState<"open" | "done">("open");
  const m = useMutation({
    mutationFn: (taskId: string) => complete({ data: { taskId, idempotencyKey: `mydir:${taskId}:done` } }),
    onSuccess: () => {
      toast.success(t("smd.completed"));
      for (const k of ["school-my-directives", "school-dept-directives", "school-directives", "school-agenda", "school-ops"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: Error) => toast.error(t("smd.err"), { description: e.message }),
  });
  const items = q.data?.items ?? [];
  const open = items.filter((d) => !mineDone(d));
  const done = items.filter(mineDone);
  const shown = tab === "open" ? open : done;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <Link to="/school-ops" aria-label={t("smt.close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border hover:bg-accent"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("smd.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("smd.desc")}</p>
        </div>
      </div>
      {q.data && !q.data.allowed ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("sops.disabled")}</p>
      ) : (
        <>
          <div className="flex gap-2">
            {(["open", "done"] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${tab === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                {t(`smd.tab.${k}`)} <span className="tabular-nums opacity-70">{k === "open" ? open.length : done.length}</span>
              </button>
            ))}
          </div>
          {q.isLoading && <p className="text-sm text-muted-foreground">…</p>}
          {!q.isLoading && shown.length === 0 && <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("smd.empty")}</p>}
          <div className="grid gap-4">
            {shown.map((d) => (
              <article key={d.id} className="rounded-xl border bg-card p-4 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="min-w-0 break-words font-medium">{d.title}</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {d.accepted_at ? t("sdt.f.closed") : mineDone(d) ? t("smd.myPartDone") : t(`sdt.f.${d.state}`)}
                  </span>
                </div>
                {d.meeting && <Link to="/meeting/$id" params={{ id: d.meeting.id }} className="mt-1 inline-block text-xs text-muted-foreground underline">{d.meeting.title}</Link>}
                <ul className="mt-4 space-y-2">
                  {d.tasks.map((task) => {
                    const isDone = task.status === "done" || task.status === "canceled";
                    return (
                      <li key={task.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                        <Link to="/tasks/$id" params={{ id: task.id }} className={`min-w-0 flex-1 break-words text-sm ${isDone ? "text-muted-foreground line-through" : ""}`}>{task.title}</Link>
                        <span className={`text-xs tabular-nums ${task.overdue ? "text-destructive" : "text-muted-foreground"}`}>
                          {task.due_at ? new Date(task.due_at).toLocaleDateString("vi-VN") : t("sdt.noDue")}
                        </span>
                        {!isDone && (
                          <Button size="sm" className="h-11" disabled={m.isPending} onClick={() => m.mutate(task.id)}>
                            <Check className="mr-1 h-4 w-4" />{t("smd.complete")}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {mineDone(d) && !d.accepted_at && <p className="mt-3 text-xs text-muted-foreground">{t("smd.waitAccept")}</p>}
              </article>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("smd.note")}</p>
        </>
      )}
    </div>
  );
}
