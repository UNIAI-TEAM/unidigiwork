import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, FileText, MapPin, NotebookPen, Paperclip } from "lucide-react";
import { getMeetingOverview } from "@/lib/api/meetings.functions";

const KIND_LABEL: Record<string, string> = {
  SUMMARY: "Tóm tắt",
  DECISION: "Quyết định",
  ACTION_ITEM: "Việc cần làm",
  RISK: "Rủi ro",
  OPEN_QUESTION: "Câu hỏi mở",
  FOLLOW_UP: "Theo dõi",
  NOTE: "Ghi chú",
};

function formatSize(bytes: number | null) {
  if (!bytes && bytes !== 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Nội dung buổi họp: agenda, ghi chú và tài liệu đính kèm (dữ liệu thật). */
export function MeetingContentPanel({ meetingId }: { meetingId: string }) {
  const q = useQuery({
    queryKey: ["meeting-overview", meetingId],
    staleTime: 15_000,
    queryFn: () => getMeetingOverview({ data: { meetingId } }),
  });

  if (q.isLoading) return <p className="text-xs text-muted-foreground">Đang tải nội dung…</p>;
  if (q.isError)
    return (
      <p className="text-xs text-muted-foreground">
        Không tải được nội dung buổi họp hoặc bạn không có quyền xem.
      </p>
    );

  const m = q.data?.meeting as any;
  const notes = q.data?.notes ?? [];
  const attachments = q.data?.attachments ?? [];

  return (
    <div className="space-y-5">
      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
          <CalendarDays className="h-3.5 w-3.5" /> Thông tin
        </h4>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="text-foreground">{m?.title}</p>
          {m?.start_at && (
            <p>
              {new Date(m.start_at).toLocaleString("vi-VN")}
              {m?.end_at ? ` – ${new Date(m.end_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : ""}
              {m?.timezone ? ` (${m.timezone})` : ""}
            </p>
          )}
          {m?.location && (
            <p className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {m.location}
            </p>
          )}
        </div>
      </section>

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
          <FileText className="h-3.5 w-3.5" /> Agenda
        </h4>
        {m?.agenda ? (
          <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed">
            {m.agenda}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Buổi họp chưa có agenda.</p>
        )}
      </section>

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
          <NotebookPen className="h-3.5 w-3.5" /> Ghi chú ({notes.length})
        </h4>
        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có ghi chú nào cho buổi họp này.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n: any) => (
              <li key={n.id} className="rounded-lg border border-border bg-surface-2 p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {KIND_LABEL[n.kind] ?? n.kind}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {n.created_at ? new Date(n.created_at).toLocaleDateString("vi-VN") : ""}
                  </span>
                </div>
                {n.title && <p className="text-xs font-medium">{n.title}</p>}
                {n.detail && (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{n.detail}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
          <Paperclip className="h-3.5 w-3.5" /> Tài liệu đính kèm ({attachments.length})
        </h4>
        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có tài liệu nào được đính kèm.</p>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((d: any) => (
              <li key={d.id}>
                <Link
                  to="/documents/$id"
                  params={{ id: d.id }}
                  className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-2.5 transition-colors hover:bg-surface-3"
                >
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{d.title}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {[d.folder, d.mimeType, formatSize(d.sizeBytes)].filter(Boolean).join(" · ") || "—"}
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
