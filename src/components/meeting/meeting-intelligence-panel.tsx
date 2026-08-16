// Meeting Intelligence V1 — biên bản trực tiếp + tóm tắt AI có nguồn trích dẫn.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Gavel, ListTodo, Loader2, Quote, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  formatOffset,
  TRANSCRIPT_SOURCE_LABEL,
  type MeetingSummary,
  type SummarySource,
} from "@/domain/meeting-intelligence/contracts";
import {
  generateMeetingSummary,
  getMeetingSummary,
  listMeetingTranscript,
} from "@/lib/api/meeting-intelligence.functions";

function CitationChips({
  ids,
  sources,
  onPick,
}: {
  ids: string[];
  sources: SummarySource[];
  onPick: (s: SummarySource) => void;
}) {
  const known = ids
    .map((id) => sources.find((s) => s.sourceId === id))
    .filter((s): s is SummarySource => Boolean(s));
  if (known.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {known.map((s) => (
        <button
          key={s.sourceId}
          type="button"
          onClick={() => onPick(s)}
          title={s.excerpt}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
        >
          <Quote className="h-2.5 w-2.5" />
          {formatOffset(s.offsetSeconds)}
        </button>
      ))}
    </div>
  );
}

export function MeetingIntelligencePanel({ meetingId }: { meetingId: string }) {
  const queryClient = useQueryClient();
  const [activeSource, setActiveSource] = useState<SummarySource | null>(null);

  const transcriptQuery = useQuery({
    queryKey: ["meeting-transcript", meetingId],
    staleTime: 10_000,
    queryFn: () => listMeetingTranscript({ data: { meetingId } }),
  });
  const summaryQuery = useQuery({
    queryKey: ["meeting-summary", meetingId],
    staleTime: 30_000,
    queryFn: () => getMeetingSummary({ data: { meetingId } }),
  });

  const generate = useMutation({
    mutationFn: () => generateMeetingSummary({ data: { meetingId } }),
    onSuccess: (data: MeetingSummary) => {
      queryClient.setQueryData(["meeting-summary", meetingId], data);
      toast.success("Đã tạo tóm tắt cuộc họp.");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Không tạo được tóm tắt.";
      toast.error(message);
    },
  });

  const segments = transcriptQuery.data ?? [];
  const summary = summaryQuery.data ?? null;
  const hasTranscript = segments.length > 0;
  const generatedAt = useMemo(
    () => (summary ? new Date(summary.generatedAt).toLocaleString("vi-VN") : null),
    [summary],
  );

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-foreground">Biên bản &amp; tóm tắt AI</div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          disabled={!hasTranscript || generate.isPending}
          onClick={() => generate.mutate()}
        >
          {generate.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {summary ? "Tạo lại tóm tắt" : "Tóm tắt cuộc họp"}
        </Button>
      </div>

      {summary && (
        <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {summary.status === "partial" ? "Tóm tắt một phần" : "Tóm tắt"} ·{" "}
              {summary.segmentCount} đoạn
            </span>
            {generatedAt && <span>{generatedAt}</span>}
          </div>
          {summary.summary && (
            <p className="whitespace-pre-wrap leading-relaxed text-foreground">{summary.summary}</p>
          )}

          {summary.highlights.length > 0 && (
            <ul className="space-y-1">
              {summary.highlights.map((h, i) => (
                <li key={i} className="flex gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}

          {summary.decisions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Gavel className="h-3 w-3" /> Quyết định
              </div>
              {summary.decisions.map((d, i) => (
                <div key={i} className="rounded-md border border-border bg-background p-2">
                  <div className="font-medium text-foreground">{d.title}</div>
                  {d.detail && <div className="mt-0.5 text-muted-foreground">{d.detail}</div>}
                  <CitationChips ids={d.sourceIds} sources={summary.sources} onPick={setActiveSource} />
                </div>
              ))}
            </div>
          )}

          {summary.actionItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <ListTodo className="h-3 w-3" /> Việc cần làm
              </div>
              {summary.actionItems.map((a, i) => (
                <div key={i} className="rounded-md border border-border bg-background p-2">
                  <div className="font-medium text-foreground">{a.title}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {a.owner ? `Phụ trách: ${a.owner}` : "Chưa rõ người phụ trách"}
                    {a.dueHint ? ` · Hạn: ${a.dueHint}` : ""}
                  </div>
                  <CitationChips ids={a.sourceIds} sources={summary.sources} onPick={setActiveSource} />
                </div>
              ))}
            </div>
          )}

          {activeSource && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px]">
              <div className="mb-0.5 text-[10px] text-muted-foreground">
                {activeSource.speakerName ?? "Người nói"} · {formatOffset(activeSource.offsetSeconds)}
              </div>
              <div className="text-foreground">{activeSource.excerpt}</div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {transcriptQuery.isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Đang tải biên bản…
          </div>
        )}
        {!transcriptQuery.isLoading && !hasTranscript && (
          <p className="text-muted-foreground">
            Chưa có biên bản. Bật phụ đề trực tiếp trong cuộc họp để hệ thống lưu lại nội dung.
          </p>
        )}
        {segments.map((s) => (
          <div key={s.id}>
            <div className="text-[10px] text-muted-foreground">
              {s.speakerName ?? "Người nói"} · {formatOffset(s.offsetSeconds)} ·{" "}
              {TRANSCRIPT_SOURCE_LABEL[s.source]}
            </div>
            <div className="text-foreground">{s.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}