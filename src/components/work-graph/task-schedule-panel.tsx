import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { getWorkGraphTaskSchedule, setWorkGraphTaskSchedule } from "@/lib/api/work-graph.functions";

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

/**
 * Lịch cụ thể của một công việc trong Work Graph: ngày bắt đầu, ngày kết thúc,
 * hạn và các mốc quan trọng (việc con, bước thực thi). Dữ liệu đọc trực tiếp
 * từ nguồn nên tự cập nhật mỗi khi công việc thay đổi.
 */
export function TaskSchedulePanel({ taskId }: { taskId: string }) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [startDraft, setStartDraft] = useState("");
  const [endDraft, setEndDraft] = useState("");

  const schedule = useQuery({
    queryKey: ["work-graph-task-schedule", taskId],
    queryFn: () => getWorkGraphTaskSchedule({ data: { taskId } }),
    refetchInterval: 30000,
  });

  const locale = lang === "vi" ? "vi-VN" : "en-US";
  const fmt = useMemo(
    () => (value: string | null) =>
      value
        ? new Date(value).toLocaleString(locale, {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—",
    [locale],
  );

  const save = useMutation({
    mutationFn: () =>
      setWorkGraphTaskSchedule({
        data: {
          taskId,
          startAt: startDraft ? new Date(startDraft).toISOString() : null,
          endAt: endDraft ? new Date(endDraft).toISOString() : null,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: async () => {
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work-graph-task-schedule", taskId] }),
        queryClient.invalidateQueries({ queryKey: ["work-graph-board"] }),
        queryClient.invalidateQueries({ queryKey: ["m-work-graph"] }),
        queryClient.invalidateQueries({ queryKey: ["task-ops"] }),
      ]);
      toast.success(t("wg.schedule.saved"));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("wg.schedule.error")),
  });

  if (schedule.isLoading) {
    return (
      <div className="mt-1 flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("wg.schedule.loading")}
      </div>
    );
  }
  const data = schedule.data;
  if (!data) return null;

  return (
    <div className="mt-1 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {t("wg.schedule.title")}
        </span>
        <span className="text-muted-foreground">
          {t("wg.schedule.start")}: <span className="text-foreground">{fmt(data.startAt)}</span>
          {!data.startExplicit && data.startAt ? ` (${t("wg.schedule.inferred")})` : ""}
        </span>
        <span className="text-muted-foreground">
          {t("wg.schedule.end")}: <span className="text-foreground">{fmt(data.endAt)}</span>
          {!data.endExplicit && data.endAt ? ` (${t("wg.schedule.inferred")})` : ""}
        </span>
        {data.dueAt ? (
          <span className="text-muted-foreground">
            {t("wg.schedule.due")}: <span className="text-foreground">{fmt(data.dueAt)}</span>
          </span>
        ) : null}
      </div>

      <ul className="mt-2 space-y-1.5">
        {data.milestones.length === 0 ? (
          <li className="text-xs text-muted-foreground">{t("wg.schedule.noMilestones")}</li>
        ) : (
          data.milestones.map((m) => (
            <li key={`${m.kind}:${m.id}`} className="flex items-start gap-2 text-xs">
              {m.done ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{m.title || t("wg.schedule.untitled")}</span>
                <span className="text-muted-foreground">
                  {m.kind === "SUBTASK" ? t("wg.schedule.subtask") : t("wg.schedule.step")}
                  {m.at ? ` · ${fmt(m.at)}` : ""}
                  {m.status ? ` · ${m.status}` : ""}
                </span>
              </span>
            </li>
          ))
        )}
      </ul>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor={`schedule-start-${taskId}`}>
            {t("wg.schedule.start")}
          </label>
          <Input
            id={`schedule-start-${taskId}`}
            type="datetime-local"
            value={startDraft}
            onChange={(event) => setStartDraft(event.target.value)}
            className="h-11 min-w-0 text-sm sm:h-9"
          />
          <label className="sr-only" htmlFor={`schedule-end-${taskId}`}>
            {t("wg.schedule.end")}
          </label>
          <Input
            id={`schedule-end-${taskId}`}
            type="datetime-local"
            value={endDraft}
            onChange={(event) => setEndDraft(event.target.value)}
            className="h-11 min-w-0 text-sm sm:h-9"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              className="h-11 flex-1 sm:h-9 sm:flex-none"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {t("wg.schedule.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 sm:h-9 sm:flex-none"
              onClick={() => setEditing(false)}
            >
              {t("wg.schedule.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="mt-1 min-h-11 px-1.5 text-xs text-muted-foreground sm:min-h-9"
          onClick={() => {
            setStartDraft(toLocalInput(data.startExplicit ? data.startAt : null));
            setEndDraft(toLocalInput(data.endExplicit ? data.endAt : null));
            setEditing(true);
          }}
        >
          <CalendarDays className="h-4 w-4" /> {t("wg.schedule.edit")}
        </Button>
      )}
    </div>
  );
}
