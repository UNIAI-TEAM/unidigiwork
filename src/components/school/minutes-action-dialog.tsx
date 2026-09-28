import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  generateMeetingSummary,
  getMeetingSummary,
  importMeetingTranscriptText,
} from "@/lib/api/meeting-intelligence.functions";
import { commitMinutesActions, getMinutesContext, type CommitItemResult } from "@/lib/api/school-minutes.functions";
import { getSchoolStaff } from "@/lib/api/school-ops.functions";
import { actionItemKey, type MeetingSummary } from "@/domain/meeting-intelligence/contracts";

type TaskRow = { key: string; on: boolean; title: string; owner: string | null; hint: string | null; due: string; assignee: string; ev: string; desc: string };
type DecRow = { title: string; on: boolean; detail: string; ev: string };

function evidence(s: MeetingSummary, ids: string[]) {
  return ids
    .map((id) => s.sources.find((x) => x.sourceId === id))
    .filter(Boolean)
    .map((x) => `${x!.speakerName ? `${x!.speakerName}: ` : ""}“${x!.excerpt}”`)
    .join(" · ");
}

export function MinutesActionButton({ meetingId, title }: { meetingId: string; title: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={t("mta.btn")}
        className="inline-flex min-h-11 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent md:min-h-8">
        <ListChecks className="h-3 w-3" />{t("mta.short")}
      </button>
      {open && <MinutesActionDialog meetingId={meetingId} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

function MinutesActionDialog({ meetingId, title, onClose }: { meetingId: string; title: string; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const ctxFn = useServerFn(getMinutesContext);
  const sumFn = useServerFn(getMeetingSummary);
  const genFn = useServerFn(generateMeetingSummary);
  const importFn = useServerFn(importMeetingTranscriptText);
  const staffFn = useServerFn(getSchoolStaff);
  const commitFn = useServerFn(commitMinutesActions);

  const [text, setText] = useState("");
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [decs, setDecs] = useState<DecRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [dept, setDept] = useState<string | null>(null);
  const [results, setResults] = useState<CommitItemResult[] | null>(null);

  const ctx = useQuery({ queryKey: ["mta-ctx", meetingId], queryFn: () => ctxFn({ data: { meetingId } }) });
  const existing = useQuery({ queryKey: ["mta-sum", meetingId], queryFn: () => sumFn({ data: { meetingId } }) });
  const staff = useQuery({ queryKey: ["school-staff"], queryFn: () => staffFn() });

  const load = (s: MeetingSummary) => {
    setSummary(s);
    setResults(null);
    setDecs(s.decisions.map((d) => ({ title: d.title, detail: d.detail, on: d.confidence !== "UNCLEAR", ev: evidence(s, d.sourceIds) })));
    setTasks(s.actionItems.map((a) => ({
      key: actionItemKey(a), on: true, title: a.title, owner: a.owner, hint: a.dueHint, due: "", assignee: "", ev: evidence(s, a.sourceIds), desc: "",
    })));
  };
  useEffect(() => { if (existing.data && !summary) load(existing.data); }, [existing.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (dept === null && ctx.data?.department) setDept(ctx.data.department); }, [ctx.data?.department]); // eslint-disable-line react-hooks/exhaustive-deps

  const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : t("mta.failed"));

  const analyze = useMutation({
    mutationFn: async () => {
      if (text.trim()) await importFn({ data: { meetingId, text: text.trim(), source: "MANUAL" } });
      return genFn({ data: { meetingId } });
    },
    onSuccess: (s) => { setText(""); load(s); void ctx.refetch(); },
    onError: (e) => toast.error(errText(e)),
  });

  const commit = useMutation({
    mutationFn: () => commitFn({
      data: {
        meetingId,
        workspaceId: ctx.data!.workspaceId!,
        decisions: decs.filter((d) => d.on).map((d) => d.title),
        tasks: tasks.filter((x) => x.on).map((x) => ({
          itemKey: x.key, title: x.title.trim(), description: [x.desc.trim(), x.ev ? `${t("mta.evidence")}: ${x.ev}` : "", dept ? `${t("mta.dept")}: ${dept}` : ""].filter(Boolean).join("\n\n").slice(0, 2000) || null,
          dueAt: x.due ? new Date(`${x.due}T17:00`).toISOString() : null, assigneeId: x.assignee || null,
        })),
      },
    }),
    onSuccess: (r) => {
      setResults(r.results);
      void qc.invalidateQueries({ queryKey: ["school-agenda"] });
      void qc.invalidateQueries({ queryKey: ["school-ops"] });
      void qc.invalidateQueries({ queryKey: ["school-meetings"] });
      if (r.status === "completed") toast.success(t("mta.done"));
      else toast.error(t(r.status === "partial" ? "mta.partial" : "mta.failed"));
    },
    onError: (e) => toast.error(errText(e)),
  });

  const allPeople = staff.data?.staff ?? [];
  const depts = Array.from(new Set(allPeople.map((p) => p.department).filter(Boolean))) as string[];
  const people = dept ? allPeople.filter((p) => p.department === dept) : allPeople;
  const selected = decs.filter((d) => d.on).length + tasks.filter((x) => x.on && x.title.trim()).length;
  const resFor = (kind: "decision" | "task", key: string) => results?.find((r) => r.kind === kind && r.key === key);
  const badge = (r?: CommitItemResult) =>
    r ? <span className={r.ok ? "text-xs text-primary" : "text-xs text-destructive"}>{r.ok ? t("mta.ok") : t("mta.err")}</span> : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("mta.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground break-words">{title}</p>
        </DialogHeader>

        <section className="space-y-2">
          <label htmlFor="mta-text" className="text-sm font-medium">{t("mta.paste")}</label>
          <Textarea id="mta-text" aria-label={t("mta.paste")} rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("mta.placeholder")} />
          <p className="text-xs text-muted-foreground">{t("mta.hint").replace("{n}", String(ctx.data?.segments ?? 0))}</p>
          <Button className="h-11" disabled={analyze.isPending || (!text.trim() && !ctx.data?.segments)} onClick={() => analyze.mutate()}>
            {analyze.isPending ? t("mta.analyzing") : t("mta.analyze")}
          </Button>
        </section>

        {summary && (
          <div className="space-y-5">
            {summary.summary && (
              <section>
                <h3 className="mb-1 text-sm font-semibold">{t("mta.tab.summary")}</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{summary.summary}</p>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold">{t("mta.tab.decisions")} · {decs.length}</h3>
              {decs.length === 0 && <p className="text-sm text-muted-foreground">{t("mta.none")}</p>}
              <ul className="space-y-2">
                {decs.map((d, i) => (
                  <li key={i} className="rounded-lg border p-3">
                    <label className="flex min-h-11 items-start gap-3">
                      <Checkbox className="mt-1" checked={d.on} disabled={!!results} onCheckedChange={(v) => setDecs((a) => a.map((x, j) => j === i ? { ...x, on: !!v } : x))} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium break-words">{d.title} {badge(resFor("decision", d.title))}</span>
                        {d.detail && <span className="block text-xs text-muted-foreground break-words">{d.detail}</span>}
                        {d.ev && <span className="mt-1 block text-xs italic text-muted-foreground break-words">{d.ev}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-1">
              <label htmlFor="mta-dept" className="text-sm font-medium">{t("mta.dept")}</label>
              <select id="mta-dept" aria-label={t("mta.dept")} className="h-11 w-full rounded-md border bg-background px-2 text-sm" value={dept ?? ""} disabled={!!results}
                onChange={(e) => { const v = e.target.value || null; setDept(v); setTasks((a) => a.map((x) => ({ ...x, assignee: x.assignee && allPeople.find((p) => p.user_id === x.assignee)?.department === v ? x.assignee : "" }))); }}>
                <option value="">{t("mta.allDept")}</option>
                {depts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">{t("mta.deptHint")}</p>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">{t("mta.tab.tasks")} · {tasks.length}</h3>
              {tasks.length === 0 && <p className="text-sm text-muted-foreground">{t("mta.none")}</p>}
              <ul className="space-y-2">
                {tasks.map((x, i) => {
                  const set = (p: Partial<TaskRow>) => setTasks((a) => a.map((y, j) => j === i ? { ...y, ...p } : y));
                  const r = resFor("task", x.key);
                  return (
                    <li key={x.key} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox className="mt-3" aria-label={t("mta.pick")} checked={x.on} disabled={!!results} onCheckedChange={(v) => set({ on: !!v })} />
                        <div className="min-w-0 flex-1 space-y-2">
                          <Input aria-label={t("mta.taskTitle")} className="h-11" value={x.title} disabled={!!results} onChange={(e) => set({ title: e.target.value })} />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <select aria-label={t("mta.owner")} className="h-11 rounded-md border bg-background px-2 text-sm" value={x.assignee} disabled={!!results} onChange={(e) => set({ assignee: e.target.value })}>
                              <option value="">{t("mta.noOwner")}</option>
                              {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name || p.email}{p.department ? ` · ${p.department}` : ""}</option>)}
                            </select>
                            <Input type="date" aria-label={t("mta.due")} className="h-11" value={x.due} disabled={!!results} onChange={(e) => set({ due: e.target.value })} />
                          </div>
                          <Textarea aria-label={t("mta.desc")} rows={2} placeholder={t("mta.desc")} value={x.desc} disabled={!!results} onChange={(e) => set({ desc: e.target.value })} />
                          {x.on && (!x.assignee || !x.due) && <p className="text-xs text-muted-foreground">{t("mta.warnSync")}</p>}
                          {(x.owner || x.hint) && (
                            <p className="text-xs text-muted-foreground">{t("mta.aiSaid")}: {[x.owner, x.hint].filter(Boolean).join(" · ")}</p>
                          )}
                          {x.ev && <p className="text-xs italic text-muted-foreground break-words">{x.ev}</p>}
                          {r && (
                            <div className="flex items-center gap-2">{badge(r)}
                              {r.ok && r.id && <Link to="/tasks/$id" params={{ id: r.id }} className="text-xs underline">{t("mta.openTask")}</Link>}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {summary.openQuestions.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t("mta.tab.open")} · {summary.openQuestions.length}</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {summary.openQuestions.map((q, i) => <li key={i} className="break-words">{q.question}</li>)}
                </ul>
              </section>
            )}
            <p className="text-xs text-muted-foreground">{t("mta.note")}</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose}>{t("smt.close")}</Button>
          {summary && !results && (
            <Button className="h-11" disabled={commit.isPending || selected === 0 || !ctx.data?.workspaceId} onClick={() => commit.mutate()}>
              {commit.isPending ? t("mta.saving") : t("mta.confirm").replace("{n}", String(selected))}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
