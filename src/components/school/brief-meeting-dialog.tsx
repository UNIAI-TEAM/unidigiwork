import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { saveSchoolMeeting, type SchoolBrief } from "@/lib/api/school-ops.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const DURATIONS = [30, 45, 60, 90, 120];
const pad = (n: number) => String(n).padStart(2, "0");

/** Lấy các mục cần xử lý trong bản tin làm nội dung họp. */
function agendaFrom(content: string) {
  const out: string[] = [];
  let take = false;
  for (const line of content.split("\n")) {
    if (line.startsWith("## ")) {
      const h = line.toLowerCase();
      take = /điểm nóng|đề xuất|cần bgh|trễ hạn|rủi ro|hot|proposal|decide|risk/.test(h);
      if (take) out.push(line.slice(3).trim() + ":");
      continue;
    }
    if (take && line.trim()) out.push(line.replace(/\*\*/g, "").trim());
  }
  const text = (out.length ? out.join("\n") : content.replace(/\*\*/g, "")).trim();
  return text.slice(0, 4000);
}

/** Nút tạo lịch họp từ bản tin: điền sẵn tên, tổ, nội dung; người dùng chọn ngày, giờ, thời lượng. */
export function BriefMeetingButton({ brief, department }: { brief: SchoolBrief; department: string | null }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const saveFn = useServerFn(saveSchoolMeeting);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", date: "", time: "14:00", duration: 60, location: "", agenda: "" });

  const openDialog = () => {
    const tmr = new Date(Date.now() + 864e5);
    const d = new Date(brief.created_at).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB");
    setF({
      title: `${t("sbm.titlePrefix")} ${d}${department ? ` · ${department}` : ""}`,
      date: `${tmr.getFullYear()}-${pad(tmr.getMonth() + 1)}-${pad(tmr.getDate())}`,
      time: "14:00",
      duration: 60,
      location: "",
      agenda: agendaFrom(brief.content),
    });
    setOpen(true);
  };

  const m = useMutation({
    mutationFn: () => {
      const s = new Date(`${f.date}T${f.time}`);
      const e = new Date(s.getTime() + f.duration * 60000);
      return saveFn({
        data: {
          meetingId: null, title: f.title, startAt: s.toISOString(), endAt: e.toISOString(),
          location: f.location.trim() || null, agenda: f.agenda.trim() || null,
          department, idempotencyKey: `brief:${brief.id}:${s.toISOString()}`,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("sbm.done"));
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["school-ops"] });
      void qc.invalidateQueries({ queryKey: ["school-agenda"] });
      void qc.invalidateQueries({ queryKey: ["school-meetings"] });
    },
    onError: (e) => {
      const k = `smt.err.${e instanceof Error ? e.message : "FAILED"}`;
      toast.error(t(k as never) === k ? t("smt.err.FAILED") : t(k as never));
    },
  });

  const endAt = f.date ? new Date(new Date(`${f.date}T${f.time}`).getTime() + f.duration * 60000) : null;

  return (
    <>
      <Button variant="outline" className="min-h-11" onClick={openDialog}>
        <CalendarPlus className="mr-2 h-4 w-4" />{t("sbm.btn")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("sbm.btn")}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
            <p className="text-xs text-muted-foreground">{t("sbm.hint")} <b>{department ?? t("smt.all")}</b></p>
            <div><Label>{t("smt.name")}</Label><Input aria-label={t("smt.name")} className="h-11" required maxLength={500} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-1"><Label>{t("smt.date")}</Label><Input aria-label={t("smt.date")} className="h-11" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
              <div><Label>{t("smt.start")}</Label><Input aria-label={t("smt.start")} className="h-11" type="time" required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
              <div>
                <Label>{t("sbm.duration")}</Label>
                <select aria-label={t("sbm.duration")} className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })}>
                  {DURATIONS.map((n) => <option key={n} value={n}>{n} {t("sbm.min")}</option>)}
                </select>
              </div>
            </div>
            {endAt && <p className="text-xs text-muted-foreground tabular-nums">{t("sbm.ends")} {pad(endAt.getHours())}:{pad(endAt.getMinutes())}</p>}
            <div><Label>{t("smt.location")}</Label><Input aria-label={t("smt.location")} className="h-11" maxLength={500} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
            <div><Label>{t("smt.agenda")}</Label><Textarea aria-label={t("smt.agenda")} rows={6} maxLength={10000} value={f.agenda} onChange={(e) => setF({ ...f, agenda: e.target.value })} /></div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>{t("smt.close")}</Button>
              <Button type="submit" className="h-11" disabled={m.isPending}>{t("sbm.create")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
