import { withAppShell } from "@/components/page-shell";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarDays, CircleAlert, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { listSchoolDepartments } from "@/lib/api/school-ops.functions";
import { createSchoolDeptTask, listSchoolDeptTasks, transitionSchoolDeptTask, type SchoolDeptTask } from "@/lib/api/school-tasks.functions";

export const Route = createFileRoute("/_authenticated/school-dept-tasks")({
  head: () => ({ meta: [
    { title: "Công việc của tổ — UniWork" },
    { name: "description", content: "Bảng công việc riêng theo tổ chuyên môn dành cho tổ trưởng và Ban Giám hiệu." },
    { property: "og:title", content: "Công việc của tổ — UniWork" },
    { property: "og:description", content: "Theo dõi và quản lý công việc riêng của từng tổ chuyên môn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: withAppShell(SchoolDeptTasksPage),
});

const statuses = ["todo", "in_progress", "blocked", "done"] as const;
type Status = (typeof statuses)[number];
type Priority = "low" | "normal" | "high" | "urgent";

function SchoolDeptTasksPage() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [dept, setDept] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const listFn = useServerFn(listSchoolDeptTasks);
  const q = useQuery({ queryKey: ["school-dept-tasks", dept], queryFn: () => listFn({ data: { department: dept } }) });
  const departmentsFn = useServerFn(listSchoolDepartments);
  const depts = useQuery({ queryKey: ["school-departments"], queryFn: () => departmentsFn(), enabled: q.data?.role === "bgh" });
  const current = q.data?.dept ?? null;
  const tasks = q.data?.tasks ?? [];

  const transitionFn = useServerFn(transitionSchoolDeptTask);
  const transition = useMutation({
    mutationFn: ({ task, status }: { task: SchoolDeptTask; status: Status }) => transitionFn({ data: { department: current ?? "", taskId: task.id, toStatus: status, expectedRowVersion: task.row_version, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["school-dept-tasks", dept] }),
    onError: () => toast.error(t("sdtask.error")),
  });

  if (q.error && (q.error as Error).message === "FORBIDDEN") return <StateMessage title={t("sdtask.forbidden")} />;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start gap-3">
        <Button variant="outline" size="icon" className="h-11 w-11" asChild><Link to="/school-ops" aria-label={t("smt.close")}><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{t("sdtask.title")}{current ? ` · ${current}` : ""}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("sdtask.desc")}</p>
        </div>
        <Button className="min-h-11" onClick={() => setCreateOpen(true)} disabled={!current}><Plus className="h-4 w-4" />{t("sdtask.create")}</Button>
      </header>

      {q.data?.role === "bgh" && <div className="flex gap-2 overflow-x-auto pb-1">
        {(depts.data?.departments ?? []).map((item) => <Button key={item.id} variant={current === item.name ? "default" : "outline"} className="min-h-11 shrink-0" onClick={() => setDept(item.name)}>{item.name}</Button>)}
      </div>}

      {q.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{statuses.map((s) => <Skeleton key={s} className="h-64" />)}</div>
        : !current ? <StateMessage title={q.data?.role === "bgh" ? t("sdtask.pickDept") : t("sdtask.noDept")} />
        : <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 xl:grid xl:grid-cols-4 xl:overflow-visible">
          {statuses.map((status) => <TaskColumn key={status} status={status} tasks={tasks.filter((task) => task.status === status)} lang={lang} onMove={(task, next) => transition.mutate({ task, status: next })} busy={transition.isPending} />)}
        </div>}

      {current && q.data && <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} department={current} members={q.data.members} />}
    </div>
  );
}

function TaskColumn({ status, tasks, lang, onMove, busy }: { status: Status; tasks: SchoolDeptTask[]; lang: string; onMove: (task: SchoolDeptTask, status: Status) => void; busy: boolean }) {
  const { t } = useI18n();
  return <section className="w-[min(84vw,21rem)] shrink-0 snap-start space-y-3 xl:w-auto">
    <div className="flex min-h-11 items-center justify-between border-b px-1"><h2 className="text-sm font-semibold">{t(`sdtask.status.${status}`)}</h2><span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span></div>
    {tasks.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("sdtask.empty")}</p> : tasks.map((task) => <article key={task.id} className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><Link to="/tasks/$id" params={{ id: task.id }} className="min-w-0 break-words text-sm font-semibold hover:text-primary">{task.title}</Link><PriorityDot priority={task.priority} /></div>
      {task.assignees[0] && <p className="flex items-center gap-2 truncate text-xs text-muted-foreground"><UserRound className="h-3.5 w-3.5 shrink-0" />{task.assignees[0].display_name ?? task.assignees[0].email}</p>}
      {task.due_at && <p className={cn("flex items-center gap-2 text-xs text-muted-foreground", task.status !== "done" && new Date(task.due_at) < new Date() && "text-destructive")}><CalendarDays className="h-3.5 w-3.5" />{new Date(task.due_at).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB")}</p>}
      <Select value={task.status} onValueChange={(value) => onMove(task, value as Status)} disabled={busy}><SelectTrigger aria-label={t("sdtask.changeStatus")}><SelectValue /></SelectTrigger><SelectContent>{statuses.map((s) => <SelectItem key={s} value={s}>{t(`sdtask.status.${s}`)}</SelectItem>)}</SelectContent></Select>
    </article>)}
  </section>;
}

function PriorityDot({ priority }: { priority: Priority }) {
  const { t } = useI18n();
  return <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground", priority === "urgent" && "bg-destructive", priority === "high" && "bg-warning", priority === "low" && "bg-success")} title={t(`sdtask.priority.${priority}`)} />;
}

function CreateTaskDialog({ open, onClose, department, members }: { open: boolean; onClose: () => void; department: string; members: Array<{ user_id: string; display_name: string; email: string }> }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [dueAt, setDueAt] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const createFn = useServerFn(createSchoolDeptTask);
  const create = useMutation({ mutationFn: () => createFn({ data: { department, title, description: description || undefined, priority, dueAt: dueAt ? new Date(dueAt).toISOString() : null, assigneeId, idempotencyKey: crypto.randomUUID() } }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["school-dept-tasks"] }); toast.success(t("sdtask.created")); setTitle(""); setDescription(""); setDueAt(""); setAssigneeId(""); onClose(); }, onError: () => toast.error(t("sdtask.error")) });
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>{t("sdtask.createTitle")}</DialogTitle><DialogDescription>{department}</DialogDescription></DialogHeader><div className="space-y-4">
    <Field label={t("sdtask.name")} htmlFor="dept-task-title"><Input id="dept-task-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
    <Field label={t("sdtask.description")} htmlFor="dept-task-description"><Textarea id="dept-task-description" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
    <Field label={t("sdtask.assignee")} htmlFor="dept-task-assignee"><Select value={assigneeId} onValueChange={setAssigneeId}><SelectTrigger id="dept-task-assignee"><SelectValue placeholder={t("sdtask.pickAssignee")} /></SelectTrigger><SelectContent>{members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name || m.email}</SelectItem>)}</SelectContent></Select></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label={t("sdtask.priority")} htmlFor="dept-task-priority"><Select value={priority} onValueChange={(v) => setPriority(v as Priority)}><SelectTrigger id="dept-task-priority"><SelectValue /></SelectTrigger><SelectContent>{(["low", "normal", "high", "urgent"] as Priority[]).map((p) => <SelectItem key={p} value={p}>{t(`sdtask.priority.${p}`)}</SelectItem>)}</SelectContent></Select></Field><Field label={t("sdtask.due")} htmlFor="dept-task-due"><Input id="dept-task-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field></div>
  </div><DialogFooter><Button variant="outline" onClick={onClose}>{t("sdtask.cancel")}</Button><Button onClick={() => create.mutate()} disabled={!title.trim() || !assigneeId || create.isPending}>{t("sdtask.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) { return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>; }
function StateMessage({ title }: { title: string }) { return <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center"><CircleAlert className="h-6 w-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">{title}</p></div>; }