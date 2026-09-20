import { useQuery } from "@tanstack/react-query";
import { History, Ban, Play, Square, CalendarPlus, RefreshCw } from "lucide-react";
import { getMeetingStatusHistory } from "@/lib/api/meetings.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { localeTag, useI18n, type Key } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

const META: Record<string, { label: Key; icon: typeof History; tone: string }> = {
  scheduled: { label: "mtg.sh.scheduled", icon: CalendarPlus, tone: "text-muted-foreground" },
  updated: { label: "mtg.sh.updated", icon: RefreshCw, tone: "text-muted-foreground" },
  started: { label: "mtg.sh.started", icon: Play, tone: "text-primary" },
  ended: { label: "mtg.sh.ended", icon: Square, tone: "text-muted-foreground" },
  canceled: { label: "mtg.sh.canceled", icon: Ban, tone: "text-destructive" },
};

/** Lịch sử trạng thái buổi họp kèm lý do hủy. */
export function MeetingStatusHistoryPanel({ meetingId }: { meetingId: string }) {
  const { t, lang } = useI18n();
  const q = useQuery({
    queryKey: ["meeting-status-history", meetingId],
    staleTime: 15_000,
    queryFn: () => getMeetingStatusHistory({ data: { meetingId } }),
  });

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
        <History className="h-3.5 w-3.5" aria-hidden="true" /> {t("mtg.sh.title")}
      </h3>
      {q.isLoading && <Skeleton className="h-12 rounded-lg" />}
      {q.isError && <p className="text-xs text-muted-foreground">{t("mtg.sh.loadError")}</p>}
      {q.data && q.data.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("mtg.sh.empty")}</p>
      )}
      {q.data && q.data.length > 0 && (
        <ol className="space-y-2">
          {q.data.map((e) => {
            const meta = META[e.status];
            const Icon = meta?.icon ?? History;
            return (
              <li key={e.id} className="rounded-lg border border-border bg-surface-2 p-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <Icon
                    className={`h-3.5 w-3.5 ${meta?.tone ?? "text-muted-foreground"}`}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-foreground">
                    {meta ? t(meta.label) : e.status}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(e.occurredAt).toLocaleString(localeTag(lang))}
                  </span>
                </div>
                {e.actorName && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {fmt(t("mtg.sh.by"), { name: e.actorName })}
                  </p>
                )}
                {e.status === "canceled" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {fmt(t("mtg.sh.reason"), { reason: e.reason ?? t("mtg.sh.noReason") })}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
