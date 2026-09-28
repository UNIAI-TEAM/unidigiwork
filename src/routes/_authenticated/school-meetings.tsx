import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarPlus, ChevronLeft, ChevronRight, MapPin, Video } from "lucide-react";
import { toast } from "sonner";
import {
  cancelSchoolMeeting,
  getSchoolOps,
  listSchoolMeetings,
  saveSchoolMeeting,
  type SchoolMeeting,
} from "@/lib/api/school-ops.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/school-meetings")({
  head: () => ({
    meta: [
      { title: "Lịch họp trường học · UniWork" },
      { name: "description", content: "Tạo, sửa, hủy lịch họp tổ và toàn trường, đồng bộ với bản tin điều hành." },
    ],
  }),
  component: SchoolMeetingsPage,
});

const DAY = 864e5;
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const key = () => crypto.randomUUID();

type Draft = { id: string | null; title: string; date: string; start: string; end: string; location: string; agenda: string; department: string };

function SchoolMeetingsPage() {
  const { t, lang } = useI18n();
  const loc = lang === "vi" ? "vi-VN" : "en-GB";
  const qc = useQueryClient();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const end = useMemo(() => new Date(week.getTime() + 7 * DAY), [week]);
  const [scope, setScope] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cancelling, setCancelling] = useState<SchoolMeeting | null>(null);
  const [reason, setReason] = useState("");

  const opsFn = useServerFn(getSchoolOps);
  const listFn = useServerFn(listSchoolMeetings);
  const saveFn = useServerFn(saveSchoolMeeting);
  const cancelFn = useServerFn(cancelSchoolMeeting);

  const ops = useQuery({ queryKey: ["school-ops", null], queryFn: () => opsFn({ data: { department: null } }) });
  const isBgh = ops.data?.role === "bgh";
  const effScope = isBgh ? scope : (ops.data?.myDept ?? null);
  const depts = (ops.data?.depts ?? []).map((d) => d.department).filter(Boolean);

  const q = useQuery({
    queryKey: ["school-meetings", effScope, week.toISOString()],
    enabled: !!ops.data?.enabled,
    queryFn: () => listFn({ data: { department: effScope, from: week.toISOString(), to: end.toISOString() } }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["school-meetings"] });
    void qc.invalidateQueries({ queryKey: ["school-agenda"] });
    void qc.invalidateQueries({ queryKey: ["school-ops"] });
  };
  const errMsg = (e: unknown) => {
    const c = e instanceof Error ? e.message : "FAILED";
    const k = `smt.err.${c}`;
    return t(k) === k ? t("smt.err.FAILED") : t(k);
  };

  const save = useMutation({
    mutationFn: (d: Draft & { idem: string }) => {
      const s = new Date(`${d.date}T${d.start}`);
      const e = new Date(`${d.date}T${d.end}`);
      return saveFn({
        data: {
          meetingId: d.id, title: d.title, startAt: s.toISOString(), endAt: e.toISOString(),
          location: d.location.trim() || null, agenda: d.agenda.trim() || null,
          department: d.department.trim() || null, idempotencyKey: d.idem,
        },
      });
    },
    onSuccess: () => { toast.success(t("smt.saved")); setDraft(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const cancel = useMutation({
    mutationFn: (m: SchoolMeeting) => cancelFn({ data: { meetingId: m.id, reason: reason.trim() || null, idempotencyKey: key() } }),
    onSuccess: () => { toast.success(t("smt.cancelDone")); setCancelling(null); setReason(""); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const openNew = (day?: Date) => {
    const d = day ?? new Date();
    setDraft({ id: null, title: "", date: toDate(d), start: "08:00", end: "09:00", location: "", agenda: "", department: effScope ?? "" });
  };
  const openEdit = (m: SchoolMeeting) => {
    const s = new Date(m.start_at), e = new Date(m.end_at);
    setDraft({ id: m.id, title: m.title, date: toDate(s), start: toTime(s), end: toTime(e), location: m.location ?? "", agenda: m.agenda ?? "", department: m.department ?? "" });
  };

  const days = Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * DAY));
  const meetings = q.data?.meetings ?? [];
  const canCreate = isBgh || ops.data?.role === "lead";
  const time = (s: string) => new Date(s).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  const today = toDate(new Date());

  if (ops.data && !ops.data.enabled) return <div className="p-6 text-sm text-muted-foreground">{t("sops.disabled")}</div>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{t("smt.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("smt.desc")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/school-ops" className="inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm hover:bg-accent">
            <ArrowLeft className="h-4 w-4" />{t("nav.schoolOps")}
          </Link>
          {canCreate && (
            <Button className="h-11" onClick={() => openNew()}><CalendarPlus className="mr-2 h-4 w-4" />{t("smt.new")}</Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {isBgh ? (
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {[null, ...depts].map((d) => (
              <button key={d ?? "_all"} onClick={() => setScope(d)}
                className={cn("min-h-11 shrink-0 rounded-full border px-4 text-sm", effScope === d ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>
                {d ?? t("smt.all")}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{effScope ?? t("smt.noDept")}</p>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label={t("sops.tt.prev")} onClick={() => setWeek(new Date(week.getTime() - 7 * DAY))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" className="h-11 tabular-nums" onClick={() => setWeek(startOfWeek(new Date()))}>
            {week.toLocaleDateString(loc, { day: "2-digit", month: "2-digit" })} – {new Date(end.getTime() - DAY).toLocaleDateString(loc, { day: "2-digit", month: "2-digit" })}
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label={t("sops.tt.next")} onClick={() => setWeek(new Date(week.getTime() + 7 * DAY))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("smt.syncHint")}</p>

      {q.isLoading || ops.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : q.isError ? (
        <p className="text-sm text-destructive">{t("smt.err.load")}</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-7">
          {days.map((d) => {
            const items = meetings.filter((m) => toDate(new Date(m.start_at)) === toDate(d));
            return (
              <div key={d.toISOString()} className={cn("min-w-0 rounded-xl border bg-card p-2 md:min-h-40", toDate(d) === today && "border-primary/50 bg-primary/5")}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{d.toLocaleDateString(loc, { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                  {canCreate && (
                    <button aria-label={t("smt.new")} onClick={() => openNew(d)} className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-accent md:h-8 md:w-8">
                      <CalendarPlus className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {items.map((m) => {
                    const off = m.status === "canceled";
                    return (
                      <li key={m.id}>
                        <button onClick={() => (m.can_manage && !off && m.status !== "ended" ? openEdit(m) : undefined)}
                          className={cn("w-full rounded-lg border p-2 text-left text-xs", off ? "opacity-60" : "hover:bg-accent", !m.can_manage && "cursor-default")}>
                          <div className="tabular-nums text-muted-foreground">{time(m.start_at)}–{time(m.end_at)}</div>
                          <div className={cn("font-medium break-words", off && "line-through")}>{m.title}</div>
                          {m.location && <div className="mt-0.5 flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" />{m.location}</div>}
                          <div className="mt-1 text-muted-foreground">{off ? t("smt.canceled") : (m.department ?? t("smt.all"))}</div>
                        </button>
                        {!off && (
                          <div className="mt-1 flex gap-1">
                            <Link to="/meeting/$id" params={{ id: m.id }} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-md border text-xs hover:bg-accent md:min-h-8">
                              <Video className="h-3 w-3" />{t("smt.openRoom")}
                            </Link>
                            {m.can_manage && m.status !== "ended" && (
                              <button onClick={() => setCancelling(m)} className="min-h-11 rounded-md border px-2 text-xs text-destructive hover:bg-destructive/10 md:min-h-8">{t("smt.cancel")}</button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      {!q.isLoading && meetings.length === 0 && <p className="text-sm text-muted-foreground">{t("smt.empty")}</p>}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{draft?.id ? t("smt.edit") : t("smt.new")}</DialogTitle></DialogHeader>
          {draft && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ ...draft, idem: key() }); }}>
              <div><Label>{t("smt.name")}</Label><Input className="h-11" required maxLength={500} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3 sm:col-span-1"><Label>{t("smt.date")}</Label><Input className="h-11" type="date" required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></div>
                <div className="col-span-3/2 sm:col-span-1"><Label>{t("smt.start")}</Label><Input className="h-11" type="time" required value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></div>
                <div className="sm:col-span-1"><Label>{t("smt.end")}</Label><Input className="h-11" type="time" required value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></div>
              </div>
              <div><Label>{t("smt.location")}</Label><Input className="h-11" maxLength={500} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></div>
              <div>
                <Label>{t("smt.dept")}</Label>
                {isBgh ? (
                  <>
                    <Input className="h-11" list="smt-depts" placeholder={t("smt.deptAll")} maxLength={80} value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
                    <datalist id="smt-depts">{depts.map((d) => <option key={d} value={d} />)}</datalist>
                  </>
                ) : (
                  <Input className="h-11" disabled value={draft.department} />
                )}
              </div>
              <div><Label>{t("smt.agenda")}</Label><Textarea rows={4} maxLength={10000} value={draft.agenda} onChange={(e) => setDraft({ ...draft, agenda: e.target.value })} /></div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" className="h-11" onClick={() => setDraft(null)}>{t("smt.close")}</Button>
                <Button type="submit" className="h-11" disabled={save.isPending}>{t("smt.save")}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("smt.cancel")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("smt.cancelConfirm")}</p>
          <p className="text-sm font-medium">{cancelling?.title}</p>
          <div><Label>{t("smt.reason")}</Label><Input className="h-11" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setCancelling(null)}>{t("smt.close")}</Button>
            <Button variant="destructive" className="h-11" disabled={cancel.isPending} onClick={() => cancelling && cancel.mutate(cancelling)}>{t("smt.cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
