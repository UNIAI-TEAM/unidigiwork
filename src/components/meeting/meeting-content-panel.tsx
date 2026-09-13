import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, FileText, MapPin, NotebookPen, Paperclip } from "lucide-react";
import { getMeetingOverview } from "@/lib/api/meetings.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { localeTag, useI18n, type Key } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

const KIND_KEY: Record<string, Key> = {
  SUMMARY: "mtg.ct.kind.summary",
  DECISION: "mtg.ct.kind.decision",
  ACTION_ITEM: "mtg.ct.kind.action",
  RISK: "mtg.ct.kind.risk",
  OPEN_QUESTION: "mtg.ct.kind.question",
  FOLLOW_UP: "mtg.ct.kind.followUp",
  NOTE: "mtg.ct.kind.note",
};

type OverviewMeeting = {
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  timezone?: string | null;
  location?: string | null;
  agenda?: string | null;
};
type OverviewNote = {
  id: string;
  kind: string;
  title?: string | null;
  detail?: string | null;
  created_at?: string | null;
};
type OverviewAttachment = {
  id: string;
  title: string;
  folder?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

function formatSize(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Nội dung buổi họp: chương trình, ghi chú và tài liệu đính kèm (dữ liệu thật). */
export function MeetingContentPanel({ meetingId }: { meetingId: string }) {
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const q = useQuery({
    queryKey: ["meeting-overview", meetingId],
    staleTime: 15_000,
    queryFn: () => getMeetingOverview({ data: { meetingId } }),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-4 w-1/4" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-foreground">{t("mtg.ct.loadError")}</p>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          {t("mtg.retry")}
        </Button>
      </div>
    );
  }

  const m = q.data?.meeting as unknown as OverviewMeeting | undefined;
  const notes = (q.data?.notes ?? []) as unknown as OverviewNote[];
  const attachments = (q.data?.attachments ?? []) as unknown as OverviewAttachment[];

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> {t("mtg.ct.info")}
        </h3>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="text-foreground">{m?.title}</p>
          {m?.start_at && (
            <p>
              {new Date(m.start_at).toLocaleString(locale)}
              {m.end_at
                ? ` – ${new Date(m.end_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`
                : ""}
              {m.timezone ? ` (${m.timezone})` : ""}
            </p>
          )}
          {m?.location && (
            <p className="flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" /> {m.location}
            </p>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" /> {t("mtg.ct.agenda")}
        </h3>
        {m?.agenda ? (
          <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed">
            {m.agenda}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("mtg.ct.noAgenda")}</p>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
          <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />{" "}
          {fmt(t("mtg.ct.notes"), { n: notes.length })}
        </h3>
        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("mtg.ct.noNotes")}</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-border bg-surface-2 p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {KIND_KEY[n.kind] ? t(KIND_KEY[n.kind]!) : n.kind}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {n.created_at ? new Date(n.created_at).toLocaleDateString(locale) : ""}
                  </span>
                </div>
                {n.title && <p className="text-xs font-medium">{n.title}</p>}
                {n.detail && (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                    {n.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />{" "}
          {fmt(t("mtg.ct.attachments"), { n: attachments.length })}
        </h3>
        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("mtg.ct.noAttachments")}</p>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((d) => (
              <li key={d.id}>
                <Link
                  to="/documents/$id"
                  params={{ id: d.id }}
                  className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-2.5 transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FileText
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{d.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[d.folder, d.mimeType, formatSize(d.sizeBytes)]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
