import { withAppShell } from "@/components/page-shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronDown, CircleAlert, Clock3, GraduationCap, MessageSquare, Sparkles, Users } from "lucide-react";
import { createSchoolBrief, getSchoolOps, type SchoolBrief } from "@/lib/api/school-ops.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SchoolTimetable } from "@/components/school/school-timetable";
import { BriefMeetingButton } from "@/components/school/brief-meeting-dialog";
import { SchoolOrgDialogButton } from "@/components/school/school-org-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/school-ops")({
  head: () => ({
    meta: [
      { title: "Điều hành trường học — UNIWORK" },
      { name: "description", content: "Bảng tổng hợp tổ chuyên môn và bản tin điều hành cho Ban Giám hiệu." },
      { property: "og:title", content: "Điều hành trường học — UNIWORK" },
      { property: "og:description", content: "Bảng tổng hợp tổ chuyên môn và bản tin điều hành cho Ban Giám hiệu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: withAppShell(SchoolOps),
});

function SchoolOps() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [ws, setWs] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const fetchOps = useServerFn(getSchoolOps);
  const gen = useServerFn(createSchoolBrief);
  const q = useQuery({ queryKey: ["school-ops", ws], queryFn: () => fetchOps({ data: { department: ws } }) });
  const m = useMutation({
    mutationFn: () => gen({ data: { department: effDept, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: (r) => {
      if (r.status === "no_data") toast.info(t("sops.noData"));
      else if (r.status === "error") toast.error(t("sops.error"));
      setPick(null);
      qc.invalidateQueries({ queryKey: ["school-ops"] });
      qc.invalidateQueries({ queryKey: ["school-agenda"] });
    },
    onError: (e) => toast.error(e instanceof Error && e.message === "FORBIDDEN" ? t("sops.forbidden") : t("sops.error")),
  });

  const d = q.data;
  const effDept = d && !d.isLeader ? d.myDept : ws;
  const latest = (pick && d?.briefs.find((b) => b.id === pick)) || d?.briefs.find((b) => b.status === "ok");
  const canGen = !!d && (d.isLeader || (d.role === "lead" && !!d.myDept));
  const totals = d?.depts.reduce(
    (a, r) => ({ open: a.open + r.open_tasks, overdue: a.overdue + r.overdue, blocked: a.blocked + r.blocked, done: a.done + r.done_7d, meetings: a.meetings + r.meetings_7d }),
    { open: 0, overdue: 0, blocked: 0, done: 0, meetings: 0 },
  ) ?? { open: 0, overdue: 0, blocked: 0, done: 0, meetings: 0 };
  const attention = d?.depts.filter((r) => r.overdue > 0 || r.blocked > 0).slice(0, 3) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 md:px-8 md:py-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold">{t("sops.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("sops.desc")}</p>
          </div>
        </div>
        {d?.enabled && (
          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={() => document.getElementById("sops-brief")?.scrollIntoView({ behavior: "smooth" })}>
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">{t("sops.generate")}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label={t("sops.moreActions")}><span className="hidden sm:inline">{t("sops.moreActions")}</span><ChevronDown className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild><Link to="/school-meetings">{t("smt.open")}</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/school-my-directives">{t("smd.open")}</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/school-policies">{t("spl.open")}</Link></DropdownMenuItem>
                {d.role === "bgh" && <DropdownMenuItem asChild><Link to="/school-directives">{t("sdt.open")}</Link></DropdownMenuItem>}
                {d.isLeader && <DropdownMenuItem asChild><Link to="/school-pack">{t("spa.open")}</Link></DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      {q.isLoading && <div className="h-40 animate-pulse rounded-xl bg-muted" />}
      {d && !d.enabled && <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{t("sops.disabled")}</p>}

      {d?.enabled && (
        <>
          <section aria-labelledby="school-snapshot">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 id="school-snapshot" className="text-base font-semibold">{t("sops.schoolSnapshot")}</h2>
              <span className="text-xs text-muted-foreground">{t("sops.activeDepartments")}: {d.depts.length}</span>
            </div>
            <div className="flex snap-x snap-mandatory divide-x divide-border overflow-x-auto rounded-lg border bg-card shadow-sm">
              <Metric icon={Clock3} label={t("sops.open")} value={totals.open} />
              <Metric icon={CircleAlert} label={t("sops.overdue")} value={totals.overdue} alert={totals.overdue > 0} />
              <Metric icon={CheckCircle2} label={t("sops.done7")} value={totals.done} />
              <Metric icon={CalendarDays} label={t("sops.meet7")} value={totals.meetings} />
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <section>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h2 className="text-base font-semibold">{t("sops.focus")}</h2>
                  <Link to="/school-dept-progress" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">{t("sops.viewDetails")}<ArrowRight className="h-4 w-4" /></Link>
                </div>
                <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
                  {attention.length === 0 ? <p className="p-5 text-sm text-muted-foreground">{t("sops.focusEmpty")}</p> : attention.map((r) => (
                    <button key={r.department} type="button" onClick={() => { setWs(r.department); setPick(null); }} className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-3 text-left last:border-0 hover:bg-accent/50">
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{r.department}</span><span className="mt-0.5 block text-xs text-muted-foreground">{r.members} {t("sops.members")} · {r.open_tasks} {t("sops.open").toLocaleLowerCase()}</span></span>
                      <span className="text-right text-xs font-medium text-destructive">{r.overdue > 0 ? `${r.overdue} ${t("sops.overdue").toLocaleLowerCase()}` : `${r.blocked} ${t("sops.blocked").toLocaleLowerCase()}`}</span>
                    </button>
                  ))}
                </div>
              </section>

              {(d.isLeader || d.myDept) ? <SchoolTimetable department={effDept} onOpenBrief={(id) => { setPick(id); document.getElementById("sops-brief")?.scrollIntoView({ behavior: "smooth" }); }} /> : <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">{t("sst.noDept")}</p>}
            </div>

            <aside className="space-y-6">
              <section className="rounded-lg border bg-card p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold">{t("sops.quickAccess")}</h2>
                <nav className="space-y-1">
                  <QuickLink to="/school-staff" icon={Users} label={t("sst.open")} />
                  <QuickLink to="/school-dept-plans" icon={CalendarDays} label={t("sdp.open")} />
                  {(d.role === "bgh" || d.role === "lead") && <QuickLink to="/school-dept-tasks" icon={BriefcaseBusiness} label={t("sdtask.open")} />}
                  {(d.role === "bgh" || d.role === "lead") && <QuickLink to="/school-dept-progress" icon={CheckCircle2} label={t("sdg.open")} />}
                  {d.role === "bgh" && <QuickLink to="/school-chat-groups" icon={MessageSquare} label={t("scg.open")} />}
                </nav>
                {d.role === "bgh" && <div className="mt-3 border-t pt-3"><SchoolOrgDialogButton /></div>}
              </section>

              <section aria-labelledby="department-health" className="rounded-lg border bg-card p-4 shadow-sm">
                <h2 id="department-health" className="mb-3 text-sm font-semibold">{t("sops.departmentHealth")}</h2>
                {d.depts.length === 0 ? <p className="text-sm text-muted-foreground">{t("sops.noDepts")}</p> : <div className="space-y-1">{d.depts.map((r) => (
                  <button key={r.department} type="button" onClick={() => { if (d.isLeader) { setWs(r.department); setPick(null); } }} className={cn("grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 text-left hover:bg-accent", effDept === r.department && "bg-primary/5")}>
                    <span className="truncate text-sm font-medium">{r.department}</span><span className={cn("text-xs tabular-nums text-muted-foreground", r.overdue > 0 && "text-destructive")}>{r.open_tasks} / {r.done_7d}</span>
                  </button>
                ))}</div>}
              </section>
            </aside>
          </div>

          <section id="sops-brief" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="rounded-lg border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold">
                  {t("sops.latestBrief")} · {effDept ?? t("sops.all")}
                </h2>
                <div className="flex flex-wrap gap-2">
                {canGen && latest?.status === "ok" && <BriefMeetingButton brief={latest} department={effDept} />}
                <Button className="min-h-11" disabled={!canGen || m.isPending} onClick={() => m.mutate()}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {m.isPending ? t("sops.generating") : t("sops.generate")}
                </Button>
                </div>
              </div>
              {latest ? <BriefBody b={latest} lang={lang} /> : <p className="text-sm text-muted-foreground">{t("sops.empty")}</p>}
            </div>
            <aside className="rounded-lg border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-medium">{t("sops.history")}</h3>
              <ul className="space-y-2 text-sm">
                {d.briefs.map((b) => (
                  <li key={b.id}>
                  <button type="button" onClick={() => setPick(b.id)} className={cn("flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left hover:bg-accent", latest?.id === b.id && "border-primary/50 bg-primary/5")}>
                    <span className="tabular-nums">{new Date(b.created_at).toLocaleString(lang === "vi" ? "vi-VN" : "en-GB")}</span>
                    <span className={cn("text-xs", b.status === "ok" ? "text-muted-foreground" : "text-destructive")}>
                      {b.status === "ok" ? t(b.trigger === "scheduled" ? "sops.scheduled" : "sops.manual") : t(b.status === "no_data" ? "sops.noData" : "sops.error")}
                    </span>
                  </button>
                  </li>
                ))}
              </ul>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, alert }: { icon: typeof Clock3; label: string; value: number; alert?: boolean }) {
  return (
    <div className="min-w-32 flex-1 snap-start px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", alert && "text-destructive")}>{value}</p>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: "/school-staff" | "/school-dept-plans" | "/school-dept-tasks" | "/school-dept-progress" | "/school-chat-groups"; icon: typeof Users; label: string }) {
  return <Link to={to} className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 text-sm font-medium hover:bg-accent"><Icon className="h-4 w-4 text-muted-foreground" /><span className="truncate">{label}</span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>;
}

function BriefBody({ b, lang }: { b: SchoolBrief; lang: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      <p className="text-xs text-muted-foreground tabular-nums">{new Date(b.created_at).toLocaleString(lang === "vi" ? "vi-VN" : "en-GB")}</p>
      {b.content.split("\n").map((line, i) =>
        line.startsWith("## ") ? (
          <h3 key={i} className="pt-2 font-semibold">{line.slice(3)}</h3>
        ) : line.trim() ? (
          <p key={i}>{line.replace(/\*\*/g, "")}</p>
        ) : null,
      )}
    </div>
  );
}
