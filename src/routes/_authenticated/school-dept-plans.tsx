import { withAppShell } from "@/components/page-shell";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { listSchoolDepartments } from "@/lib/api/school-ops.functions";
import { deleteDeptPlan, listDeptPlans, saveDeptPlan, type DeptPlan, type PlanKind } from "@/lib/api/school-plans.functions";

export const Route = createFileRoute("/_authenticated/school-dept-plans")({
  head: () => ({
    meta: [
      { title: "Kế hoạch của tổ — UniWork" },
      { name: "description", content: "Giáo viên trong tổ đăng lịch dạy, bài tập và kế hoạch tuần." },
      { property: "og:title", content: "Kế hoạch của tổ — UniWork" },
      { property: "og:description", content: "Giáo viên trong tổ đăng lịch dạy, bài tập và kế hoạch tuần." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: withAppShell(DeptPlansPage),
});

const KINDS: PlanKind[] = ["lesson", "assignment", "weekly"];
const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

function DeptPlansPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<PlanKind>("lesson");
  const [dept, setDept] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const monday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
    return d;
  }, [offset]);
  const sunday = new Date(monday.getTime() + 7 * 86400000);

  const listFn = useServerFn(listDeptPlans);
  const q = useQuery({
    queryKey: ["school-dept-plans", dept, monday.toISOString()],
    queryFn: () => listFn({ data: { department: dept, from: monday.toISOString(), to: sunday.toISOString() } }),
  });
  const deptFn = useServerFn(listSchoolDepartments);
  const dq = useQuery({ queryKey: ["school-departments"], queryFn: () => deptFn(), enabled: q.data?.role === "bgh" });

  const delFn = useServerFn(deleteDeptPlan);
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success(t("sdp.deleted")); qc.invalidateQueries({ queryKey: ["school-dept-plans"] }); },
    onError: (e: Error) => toast.error(t(`sdp.err.${e.message}` as "sdp.err.SAVE_FAILED")),
  });

  const d = q.data;
  const current = d?.dept ?? null;
  const items = (d?.items ?? []).filter((i) => i.kind === tab);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <Link to="/school-ops" aria-label={t("smt.close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border hover:bg-accent">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("sdp.title")}{current ? ` · ${current}` : ""}</h1>
          <p className="text-sm text-muted-foreground">{t("sdp.desc")}</p>
        </div>
      </div>

      {d?.role === "bgh" && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {(dq.data?.departments ?? []).map((x) => (
            <button key={x.id} onClick={() => setDept(x.name)} aria-pressed={current === x.name}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm ${current === x.name ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
              {x.name}
            </button>
          ))}
        </div>
      )}

      {d && !d.enabled ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("sdp.disabled")}</p>
      ) : d && !current ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">{d.role === "bgh" ? t("sdp.pickDept") : t("sdp.noDept")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" className="h-11 w-11" aria-label={t("sdc.prev")} onClick={() => setOffset((o) => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" className="h-11" onClick={() => setOffset(0)}>{t("sdc.thisWeek")}</Button>
            <Button variant="outline" size="icon" className="h-11 w-11" aria-label={t("sdc.next")} onClick={() => setOffset((o) => o + 1)}><ChevronRight className="h-4 w-4" /></Button>
            <span className="text-sm text-muted-foreground">
              {monday.toLocaleDateString("vi-VN")} – {new Date(sunday.getTime() - 1).toLocaleDateString("vi-VN")}
            </span>
            <Button className="ml-auto h-11" onClick={() => setOpen(true)} disabled={!current}><Plus className="mr-1 h-4 w-4" />{t(`sdp.add.${tab}`)}</Button>
          </div>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
            {KINDS.map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm ${tab === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                {t(`sdp.kind.${k}`)} <span className="tabular-nums opacity-70">{(d?.items ?? []).filter((i) => i.kind === k).length}</span>
              </button>
            ))}
          </div>

          {q.isLoading && <p className="text-sm text-muted-foreground">…</p>}
          {!q.isLoading && items.length === 0 && <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("sdp.empty")}</p>}
          <ul className="space-y-3">
            {items.map((p) => <PlanRow key={p.id} p={p} onDelete={() => { if (confirm(t("sdp.confirmDelete"))) del.mutate(p.id); }} />)}
          </ul>
        </>
      )}

      {current && <PlanDialog open={open} onClose={() => setOpen(false)} kind={tab} dept={current} monday={monday} />}
    </div>
  );
}

function PlanRow({ p, onDelete }: { p: DeptPlan; onDelete: () => void }) {
  const { t } = useI18n();
  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {p.kind === "lesson" && <span>{fmt(p.starts_at)} – {p.ends_at ? new Date(p.ends_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : ""}</span>}
            {p.kind === "assignment" && <span>{t("sdp.due")}: {fmt(p.starts_at)}</span>}
            {p.class_name && <span className="rounded border px-1.5">{t("sdp.class")} {p.class_name}</span>}
            {p.author_name && <span>· {p.author_name}</span>}
          </div>
          <h2 className="break-words font-medium">{p.title}</h2>
          {p.body && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{p.body}</p>}
          {p.task_id && (
            <Link to="/tasks/$id" params={{ id: p.task_id }} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">
              {t("sdp.openTask")}{p.task_status ? ` · ${t(`sdp.ts.${p.task_status}` as "sdp.ts.todo")}` : ""}
            </Link>
          )}
        </div>
        {p.can_edit && (
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={t("sdp.delete")} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

function PlanDialog({ open, onClose, kind, dept, monday }: { open: boolean; onClose: () => void; kind: PlanKind; dept: string; monday: Date }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const base = new Date(Math.max(monday.getTime(), Date.now()));
  base.setHours(kind === "assignment" ? 17 : 7, 0, 0, 0);
  const [title, setTitle] = useState("");
  const [cls, setCls] = useState("");
  const [body, setBody] = useState("");
  const [start, setStart] = useState(localInput(base));
  const [end, setEnd] = useState(localInput(new Date(base.getTime() + 45 * 60000)));
  const [key, setKey] = useState(() => crypto.randomUUID());
  const saveFn = useServerFn(saveDeptPlan);
  const m = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          department: dept, kind, title, className: cls || undefined, body: body || undefined, idempotencyKey: key,
          startsAt: kind === "weekly" ? monday.toISOString() : new Date(start).toISOString(),
          endsAt: kind === "lesson" ? new Date(end).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success(t(kind === "assignment" ? "sdp.savedTask" : "sdp.saved"));
      qc.invalidateQueries({ queryKey: ["school-dept-plans"] });
      setTitle(""); setCls(""); setBody(""); setKey(crypto.randomUUID());
      onClose();
    },
    onError: (e: Error) => toast.error(t(`sdp.err.${e.message}` as "sdp.err.SAVE_FAILED")),
  });
  const invalid = !title.trim() || (kind === "lesson" && new Date(end) <= new Date(start));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t(`sdp.add.${kind}`)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm"><span className="text-muted-foreground">{t("sdp.f.title")}</span>
            <Input className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></label>
          {kind !== "weekly" && (
            <label className="block space-y-1 text-sm"><span className="text-muted-foreground">{t("sdp.class")}</span>
              <Input className="h-11" value={cls} onChange={(e) => setCls(e.target.value)} maxLength={40} placeholder="7A1" /></label>
          )}
          {kind !== "weekly" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm"><span className="text-muted-foreground">{t(kind === "lesson" ? "sdp.f.start" : "sdp.due")}</span>
                <Input type="datetime-local" className="h-11" value={start} onChange={(e) => setStart(e.target.value)} /></label>
              {kind === "lesson" && (
                <label className="block space-y-1 text-sm"><span className="text-muted-foreground">{t("sdp.f.end")}</span>
                  <Input type="datetime-local" className="h-11" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
              )}
            </div>
          )}
          <label className="block space-y-1 text-sm"><span className="text-muted-foreground">{t(`sdp.f.body.${kind}`)}</span>
            <Textarea rows={kind === "weekly" ? 8 : 4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} /></label>
          {kind === "assignment" && <p className="text-xs text-muted-foreground">{t("sdp.taskNote")}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onClose}>{t("sdp.cancel")}</Button>
          <Button className="h-11" disabled={invalid || m.isPending} onClick={() => m.mutate()}>{t("sdp.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
