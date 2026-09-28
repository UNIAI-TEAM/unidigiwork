import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { inspectSchoolDirective, reviewSchoolDirective, type Directive, type DirectiveState } from "@/lib/api/school-directives.functions";

export const DIRECTIVE_FILTERS: Array<DirectiveState | "all"> = ["all", "decide", "blocked", "overdue", "review", "closed"];
const tone: Record<DirectiveState, string> = {
  decide: "bg-primary/10 text-primary", blocked: "bg-destructive/10 text-destructive", overdue: "bg-destructive/10 text-destructive",
  review: "bg-accent text-foreground", closed: "bg-muted text-muted-foreground", progress: "bg-muted text-foreground",
};
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : null);

export function DirectiveCard({ d, bgh = true }: { d: Directive; bgh?: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewSchoolDirective);
  const inspectFn = useServerFn(inspectSchoolDirective);
  const [note, setNote] = useState("");
  const [ai, setAi] = useState<string | null>(null);
  const review = useMutation({
    mutationFn: (accept: boolean) => reviewFn({ data: { id: d.id, accept, note, idempotencyKey: `dir:${d.id}:${accept ? "a" : "r"}:${Date.now()}` } }),
    onSuccess: (_r, accept) => { toast.success(t(accept ? "sdt.accepted" : "sdt.revised")); setNote(""); void qc.invalidateQueries({ queryKey: ["school-directives"] }); void qc.invalidateQueries({ queryKey: ["school-dept-directives"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("mta.failed")),
  });
  const inspect = useMutation({
    mutationFn: () => inspectFn({ data: { id: d.id } }),
    onSuccess: (r) => setAi(r.text),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("mta.failed")),
  });
  const done = d.tasks.filter((x) => x.status === "done").length;
  const ev = d.tasks.reduce((a, x) => a + x.evidence, 0);
  const lastUpd = d.tasks.map((x) => x.updated_at).filter(Boolean).sort().pop() ?? null;
  const steps = [
    { k: "source" as const, on: true, at: d.meeting?.start_at ?? d.created_at },
    { k: "assign" as const, on: d.tasks.length > 0, at: d.confirmed_at },
    { k: "update" as const, on: !!lastUpd, at: lastUpd },
    { k: "evidence" as const, on: ev > 0, at: null },
    { k: "accept" as const, on: !!d.accepted_at, at: d.accepted_at },
  ];
  return (
    <article className="space-y-4 rounded-xl border bg-card p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-medium">{d.title}</h2>
          {d.detail && <p className="mt-1 break-words text-sm text-muted-foreground">{d.detail}</p>}
        </div>
        <div className="flex flex-wrap gap-1">
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${tone[d.state]}`}>{t(`sdt.f.${d.state}`)}</span>
          {d.missingEvidence && <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">{t("sdt.missingEv")}</span>}
        </div>
      </div>

      <ol className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {steps.map((s, i) => (
          <li key={s.k} className={`flex items-center gap-1 ${s.on ? "text-foreground" : "text-muted-foreground"}`}>
            <span className={`h-2 w-2 rounded-full ${s.on ? "bg-primary" : "bg-border"}`} />
            {t(`sdt.tl.${s.k}`)}{s.at && s.on ? ` · ${fmt(s.at)}` : ""}{i < steps.length - 1 && <span className="ml-3 text-muted-foreground">→</span>}
          </li>
        ))}
      </ol>

      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <span className="font-medium">{t("sdt.next")}:</span> {t(d.next as never)}
        {d.why && <span className="block text-xs text-muted-foreground">{t("sdt.why")}: {d.why}</span>}
      </div>

      {d.note && <p className="text-xs text-muted-foreground break-words">{t("sdt.noteLabel")}: {d.note}</p>}
      {ai && <div className="whitespace-pre-wrap rounded-lg border p-3 text-sm break-words">{ai}</div>}
      {bgh && <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11" disabled={inspect.isPending} onClick={() => inspect.mutate()}>
          {inspect.isPending ? t("sdt.inspecting") : t("sdt.inspect")}
        </Button>
      </div>}
      {(bgh || d.ownDept) && d.state === "review" && (
        <div className="space-y-2 rounded-lg border p-3">
          <Textarea aria-label={t("sdt.reviewNote")} placeholder={t("sdt.reviewNote")} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button className="h-11" disabled={review.isPending} onClick={() => { if (confirm(t("sdt.confirmAccept"))) review.mutate(true); }}>{t("sdt.accept")}</Button>
            <Button variant="outline" className="h-11" disabled={review.isPending || !note.trim()} onClick={() => review.mutate(false)}>{t("sdt.revise")}</Button>
          </div>
        </div>
      )}

      {!bgh && !d.ownDept && d.state === "review" && <p className="text-xs text-muted-foreground">{t("sdd.sharedHint")}</p>}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{t("sdt.tasks")} · <span className="tabular-nums">{done}/{d.tasks.length}</span></span>
          {d.meeting && <Link to="/meeting/$id" params={{ id: d.meeting.id }} className="inline-flex min-h-11 items-center text-xs underline">{t("sdt.openMeeting")}</Link>}
        </div>
        {d.tasks.length === 0 ? <p className="text-xs text-muted-foreground">{t("sdt.noTasks")}</p> : (
          <ul className="divide-y rounded-lg border">
            {d.tasks.map((x) => (
              <li key={x.id}>
                <Link to="/tasks/$id" params={{ id: x.id }} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-accent">
                  <span className={`min-w-0 flex-1 break-words ${x.status === "done" ? "line-through text-muted-foreground" : ""}`}>{x.title}</span>
                  <span className="text-xs text-muted-foreground">{x.owner ?? t("sdt.noOwner")}</span>
                  <span className={`text-xs tabular-nums ${x.overdue ? "text-destructive" : "text-muted-foreground"}`}>{fmt(x.due_at) ?? t("sdt.noDue")}</span>
                  <span className="text-xs text-muted-foreground">{x.evidence} {t("sdt.evidence")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
