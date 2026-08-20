// Meeting Intelligence V1 — biên bản trực tiếp + tóm tắt AI có nguồn trích dẫn.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Gavel,
  HelpCircle,
  ListTodo,
  Loader2,
  Mail,
  Quote,
  Sparkles,
  Upload,
  FileText,
  Download,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  actionItemKey,
  DECISION_CONFIDENCE_LABEL,
  formatOffset,
  summaryProgressPercent,
  SUMMARY_CHUNK_STATUS_LABEL,
  SUMMARY_PHASE_LABEL,
  transcriptChecksum,
  TRANSCRIPT_SOURCE_LABEL,
  type MeetingActionItem,
  type MeetingSummary,
  type SummaryProgress,
  type SummarySource,
} from "@/domain/meeting-intelligence/contracts";

type TranscriptImportStep = "READ" | "STT" | "SAVE";
type TranscriptStepStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
type TranscriptImportJob = {
  kind: "AUDIO" | "PASTE";
  label: string;
  startedAt: number;
  error: string | null;
  steps: Array<{ step: TranscriptImportStep; status: TranscriptStepStatus; detail: string | null }>;
};
const IMPORT_STEP_LABEL: Record<TranscriptImportStep, string> = {
  READ: "Đọc & tải nội dung",
  STT: "Phiên âm bằng AI (STT)",
  SAVE: "Cắt đoạn & lưu segments",
};
const IMPORT_STATUS_LABEL: Record<TranscriptStepStatus, string> = {
  PENDING: "Chờ",
  RUNNING: "Đang chạy",
  DONE: "Xong",
  FAILED: "Lỗi",
  SKIPPED: "Bỏ qua",
};

function TranscriptImportStatusCard({
  job,
  onDismiss,
}: {
  job: TranscriptImportJob;
  onDismiss: () => void;
}) {
  const failed = job.steps.some((s) => s.status === "FAILED");
  const done = !failed && job.steps.every((s) => s.status === "DONE");
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        failed ? "border-destructive/40 bg-destructive/5" : "border-border bg-surface-2"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-foreground">
            {job.kind === "AUDIO" ? "Nhập biên bản từ file ghi âm" : "Nhập biên bản dán tay"}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">{job.label}</div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Đóng trạng thái nhập biên bản"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <ol className="space-y-1.5">
        {job.steps.map((s) => (
          <li key={s.step} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">
              {s.status === "RUNNING" ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : s.status === "DONE" ? (
                <CheckCircle2 className="h-3 w-3 text-success" />
              ) : s.status === "FAILED" ? (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              ) : (
                <div className="h-3 w-3 rounded-full border border-border" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] text-foreground">
                {IMPORT_STEP_LABEL[s.step]}
                <span className="text-[10px] text-muted-foreground">
                  · {IMPORT_STATUS_LABEL[s.status]}
                </span>
              </div>
              {s.detail && (
                <div
                  className={`text-[10px] ${
                    s.status === "FAILED" ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {s.detail}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {done && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Hoàn tất — kiểm tra danh sách đoạn bên dưới để đối chiếu mốc thời gian.
        </div>
      )}
      {job.error && (
        <div className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-1.5 text-[10px] text-destructive">
          Chi tiết lỗi: {job.error}
        </div>
      )}
    </div>
  );
}
import {
  confirmMeetingActionItem,
  dismissMeetingActionItem,
  generateMeetingSummary,
  getMeetingSummary,
  getMeetingSummaryProgress,
  listMeetingActionItemStates,
  listMeetingTranscript,
  importMeetingTranscriptText,
  transcribeMeetingRecording,
} from "@/lib/api/meeting-intelligence.functions";
import { listMyWorkspaces } from "@/lib/api/meeting-rooms.functions";

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

const CHUNK_STATUS_CLASS: Record<string, string> = {
  PENDING: "border-border bg-surface-2 text-muted-foreground",
  RUNNING: "border-primary/40 bg-primary/10 text-primary",
  DONE: "border-success/40 bg-success/10 text-success",
  FAILED: "border-destructive/40 bg-destructive/10 text-destructive",
};

function StagedProgress({ progress, running }: { progress: SummaryProgress; running: boolean }) {
  const percent = running || progress.phase !== "DONE" ? summaryProgressPercent(progress) : 100;
  const active = progress.phase === "MAPPING" || progress.phase === "SYNTHESIS";
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          {active && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
          {SUMMARY_PHASE_LABEL[progress.phase]}
          {progress.staged && (
            <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Chia giai đoạn
            </span>
          )}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {progress.totalChunks > 0
            ? `${progress.completedChunks + progress.failedChunks}/${progress.totalChunks} phần · ${percent}%`
            : `${percent}%`}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      {progress.chunks.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {progress.chunks.map((c) => (
            <span
              key={c.index}
              title={`Phần ${c.index + 1} · ${formatOffset(c.startOffsetSeconds)}–${formatOffset(
                c.endOffsetSeconds,
              )} · ${c.segmentCount} đoạn · ${c.charCount.toLocaleString("vi-VN")} ký tự · ${
                SUMMARY_CHUNK_STATUS_LABEL[c.status]
              }`}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${
                CHUNK_STATUS_CLASS[c.status] ?? CHUNK_STATUS_CLASS.PENDING
              }`}
            >
              {c.status === "RUNNING" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              #{c.index + 1} · {formatOffset(c.startOffsetSeconds)}
            </span>
          ))}
        </div>
      )}

      {progress.failedChunks > 0 && (
        <div className="text-[10px] text-warning">
          {progress.failedChunks} phần transcript xử lý lỗi — kết quả có thể thiếu nội dung của các phần đó.
        </div>
      )}
      {progress.truncated && (
        <div className="text-[10px] text-muted-foreground">
          Transcript quá dài: hệ thống ưu tiên các phần cuối cuộc họp.
        </div>
      )}
    </div>
  );
}

export function MeetingIntelligencePanel({ meetingId }: { meetingId: string }) {
  const queryClient = useQueryClient();
  const [activeSource, setActiveSource] = useState<SummarySource | null>(null);
  const [pending, setPending] = useState<{ item: MeetingActionItem; key: string } | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formWorkspace, setFormWorkspace] = useState("");
  const [formDue, setFormDue] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importJob, setImportJob] = useState<TranscriptImportJob | null>(null);
  const audioInputId = `meeting-audio-${meetingId}`;
  const setStep = (
    step: TranscriptImportStep,
    status: TranscriptStepStatus,
    detail?: string,
  ) =>
    setImportJob((prev) =>
      prev
        ? {
            ...prev,
            steps: prev.steps.map((s) =>
              s.step === step ? { ...s, status, detail: detail ?? s.detail } : s,
            ),
          }
        : prev,
    );

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
  const statesQuery = useQuery({
    queryKey: ["meeting-action-item-states", meetingId],
    staleTime: 10_000,
    queryFn: () => listMeetingActionItemStates({ data: { meetingId } }),
  });
  const workspacesQuery = useQuery({
    queryKey: ["my-workspaces"],
    staleTime: 300_000,
    queryFn: () => listMyWorkspaces(),
  });

  const generate = useMutation({
    mutationFn: () => generateMeetingSummary({ data: { meetingId } }),
    onSuccess: (data: MeetingSummary) => {
      queryClient.setQueryData(["meeting-summary", meetingId], data);
      void queryClient.invalidateQueries({ queryKey: ["meeting-summary-progress", meetingId] });
      toast.success("Đã tạo tóm tắt cuộc họp.");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Không tạo được tóm tắt.";
      void queryClient.invalidateQueries({ queryKey: ["meeting-summary-progress", meetingId] });
      toast.error(message);
    },
  });

  const invalidateTranscript = () => {
    void queryClient.invalidateQueries({ queryKey: ["meeting-transcript", meetingId] });
  };

  const importText = useMutation({
    mutationFn: (text: string) => {
      setImportJob({
        kind: "PASTE",
        label: `Dán biên bản · ${text.length.toLocaleString("vi-VN")} ký tự`,
        startedAt: Date.now(),
        error: null,
        steps: [
          { step: "READ", status: "DONE", detail: `${text.length.toLocaleString("vi-VN")} ký tự` },
          { step: "SAVE", status: "RUNNING", detail: "Đang cắt đoạn và lưu vào biên bản…" },
        ],
      });
      return importMeetingTranscriptText({ data: { meetingId, text, source: "MANUAL" } });
    },
    onSuccess: (r: { inserted: number }) => {
      invalidateTranscript();
      setPasteOpen(false);
      setPasteText("");
      setStep("SAVE", "DONE", `Đã lưu ${r.inserted} đoạn`);
      toast.success(`Đã lưu ${r.inserted} đoạn biên bản.`);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Không lưu được biên bản.";
      setStep("SAVE", "FAILED", msg);
      setImportJob((prev) => (prev ? { ...prev, error: msg } : prev));
      toast.error(msg);
    },
  });

  const transcribe = useMutation({
    mutationFn: async (file: File) => {
      setImportJob({
        kind: "AUDIO",
        label: `${file.name || "recording"} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        startedAt: Date.now(),
        error: null,
        steps: [
          { step: "READ", status: "RUNNING", detail: "Đang đọc file ghi âm…" },
          { step: "STT", status: "PENDING", detail: null },
          { step: "SAVE", status: "PENDING", detail: null },
        ],
      });
      if (file.size > 12 * 1024 * 1024) {
        const msg = "File ghi âm vượt quá 12MB. Hãy cắt ngắn hoặc nén lại.";
        setStep("READ", "FAILED", msg);
        throw new Error(msg);
      }
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      }
      setStep("READ", "DONE", `${buf.byteLength.toLocaleString("vi-VN")} byte`);
      setStep("STT", "RUNNING", "Đang gửi lên AI để phiên âm…");
      return transcribeMeetingRecording({
        data: {
          meetingId,
          fileName: file.name || "recording.wav",
          mimeType: file.type || "audio/wav",
          base64: btoa(bin),
        },
      });
    },
    onSuccess: (r: { inserted: number; characters: number }) => {
      invalidateTranscript();
      setStep("STT", "DONE", `${r.characters.toLocaleString("vi-VN")} ký tự nhận được`);
      setStep("SAVE", "DONE", `Đã lưu ${r.inserted} đoạn`);
      toast.success(`Đã phiên âm và lưu ${r.inserted} đoạn biên bản.`);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Không phiên âm được.";
      setImportJob((prev) =>
        prev
          ? {
              ...prev,
              error: msg,
              steps: prev.steps.map((s) =>
                s.status === "RUNNING"
                  ? { ...s, status: "FAILED", detail: msg }
                  : s.status === "PENDING"
                    ? { ...s, status: "SKIPPED", detail: "Không chạy do bước trước lỗi" }
                    : s,
              ),
            }
          : prev,
      );
      toast.error(msg);
    },
  });

  const progressQuery = useQuery({
    queryKey: ["meeting-summary-progress", meetingId],
    queryFn: () => getMeetingSummaryProgress({ data: { meetingId } }),
    refetchInterval: generate.isPending ? 1500 : false,
    staleTime: 0,
  });
  const progress = progressQuery.data ?? null;

  const confirmItem = useMutation({
    mutationFn: (input: { itemKey: string; title: string; workspaceId: string; dueAt: string | null }) =>
      confirmMeetingActionItem({
        data: {
          meetingId,
          itemKey: input.itemKey,
          title: input.title,
          workspaceId: input.workspaceId,
          dueAt: input.dueAt,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-action-item-states", meetingId] });
      setPending(null);
      toast.success("Đã tạo công việc từ cuộc họp.");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Không tạo được công việc."),
  });

  const dismissItem = useMutation({
    mutationFn: (input: { itemKey: string; title: string }) =>
      dismissMeetingActionItem({ data: { meetingId, itemKey: input.itemKey, title: input.title } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-action-item-states", meetingId] });
      toast.success("Đã bỏ qua đề xuất.");
    },
  });

  const segments = transcriptQuery.data ?? [];
  const summary = summaryQuery.data ?? null;
  const hasTranscript = segments.length > 0;
  const workspaces = workspacesQuery.data ?? [];
  const stateByKey = useMemo(
    () => new Map((statesQuery.data ?? []).map((s) => [s.itemKey, s])),
    [statesQuery.data],
  );
  const isStale = useMemo(() => {
    if (!summary?.transcriptChecksum || segments.length === 0) return false;
    return summary.transcriptChecksum !== transcriptChecksum(segments);
  }, [summary, segments]);
  const generatedAt = useMemo(
    () => (summary ? new Date(summary.generatedAt).toLocaleString("vi-VN") : null),
    [summary],
  );

  const openConfirm = (item: MeetingActionItem) => {
    setPending({ item, key: actionItemKey(item) });
    setFormTitle(item.title);
    setFormWorkspace(workspaces[0]?.id ?? "");
    setFormDue("");
  };

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

      {(generate.isPending || progress) && progress && (
        <StagedProgress progress={progress} running={generate.isPending} />
      )}
      {generate.isPending && !progress && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Đang chuẩn bị tóm tắt…
        </div>
      )}

      {summary && (
        <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {summary.status === "partial" ? "Tóm tắt một phần" : "Tóm tắt"} ·{" "}
              {summary.segmentCount} đoạn · v{summary.version}
            </span>
            {generatedAt && <span>{generatedAt}</span>}
          </div>
          {isStale && (
            <div className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] text-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
              <span>Biên bản đã thay đổi sau lần tổng hợp này. Hãy tạo lại tóm tắt để cập nhật.</span>
            </div>
          )}
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-foreground">{d.title}</div>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${
                        d.confidence === "EXPLICIT"
                          ? "bg-success/15 text-success"
                          : d.confidence === "LIKELY"
                            ? "bg-warning/15 text-warning"
                            : "bg-surface-3 text-muted-foreground"
                      }`}
                    >
                      {DECISION_CONFIDENCE_LABEL[d.confidence ?? "UNCLEAR"]}
                    </span>
                  </div>
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
              {summary.actionItems.map((a, i) => {
                const key = actionItemKey(a);
                const state = stateByKey.get(key);
                return (
                  <div key={i} className="rounded-md border border-border bg-background p-2">
                    <div className="font-medium text-foreground">{a.title}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {a.owner ? `Đề xuất: ${a.owner}` : "Chưa rõ người phụ trách"}
                      {a.dueHint ? ` · Hạn: ${a.dueHint}` : ""}
                    </div>
                    <CitationChips ids={a.sourceIds} sources={summary.sources} onPick={setActiveSource} />
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {state?.status === "CONVERTED_TO_TASK" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-success">
                          <CheckCircle2 className="h-3 w-3" /> Đã tạo công việc
                        </span>
                      ) : state?.status === "DISMISSED" ? (
                        <span className="text-[10px] text-muted-foreground">Đã bỏ qua</span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px]"
                            disabled={workspaces.length === 0}
                            onClick={() => openConfirm(a)}
                          >
                            Tạo công việc
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 gap-1 text-[10px] text-muted-foreground"
                            onClick={() => dismissItem.mutate({ itemKey: key, title: a.title })}
                          >
                            <X className="h-3 w-3" /> Bỏ qua
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {summary.risks.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <AlertTriangle className="h-3 w-3" /> Rủi ro (nhận định)
              </div>
              {summary.risks.map((r, i) => (
                <div key={i} className="rounded-md border border-border bg-background p-2">
                  <div className="text-foreground">{r.title}</div>
                  <CitationChips ids={r.sourceIds} sources={summary.sources} onPick={setActiveSource} />
                </div>
              ))}
            </div>
          )}

          {summary.openQuestions.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <HelpCircle className="h-3 w-3" /> Chưa thống nhất
              </div>
              {summary.openQuestions.map((q, i) => (
                <div key={i} className="rounded-md border border-border bg-background p-2">
                  <div className="text-foreground">{q.question}</div>
                  <CitationChips ids={q.sourceIds} sources={summary.sources} onPick={setActiveSource} />
                </div>
              ))}
            </div>
          )}

          {summary.followUp && (
            <div className="space-y-1 rounded-md border border-border bg-background p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Mail className="h-3 w-3" /> Thư theo dõi (bản nháp)
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 text-[10px]"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `${summary.followUp?.subject ?? ""}\n\n${summary.followUp?.body ?? ""}`,
                    );
                    toast.success("Đã sao chép bản nháp. Hệ thống không tự gửi thư.");
                  }}
                >
                  <Copy className="h-3 w-3" /> Sao chép
                </Button>
              </div>
              <div className="font-medium text-foreground">{summary.followUp.subject}</div>
              <p className="whitespace-pre-wrap text-muted-foreground">{summary.followUp.body}</p>
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

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
        <span className="text-[10px] text-muted-foreground">Nguồn biên bản:</span>
        <input
          id={audioInputId}
          data-testid="meeting-transcript-audio-input"
          type="file"
          accept="audio/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f && !transcribe.isPending) transcribe.mutate(f);
          }}
        />
        <label
          htmlFor={audioInputId}
          data-testid="meeting-transcript-audio-label"
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-surface-3"
        >
          {transcribe.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {transcribe.isPending ? "Đang phiên âm…" : "Tải file ghi âm"}
        </label>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-[11px]"
          data-testid="meeting-transcript-paste-open"
          onClick={() => setPasteOpen(true)}
        >
          <FileText className="h-3 w-3" /> Dán biên bản
        </Button>
      </div>

      <div className="space-y-3">
        {importJob && (
          <TranscriptImportStatusCard job={importJob} onDismiss={() => setImportJob(null)} />
        )}
        {transcriptQuery.isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Đang tải biên bản…
          </div>
        )}
        {!transcriptQuery.isLoading && !hasTranscript && (
          <p className="text-muted-foreground">
            Chưa có biên bản. Bật phụ đề trực tiếp trong cuộc họp, tải file ghi âm để AI phiên âm,
            hoặc dán biên bản có sẵn.
          </p>
        )}
        {hasTranscript && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[10px] text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{segments.length}</span> đoạn
            </span>
            <span>
              Mốc cuối:{" "}
              <span className="font-medium text-foreground">
                {formatOffset(segments.at(-1)?.offsetSeconds ?? 0)}
              </span>
            </span>
            <span>
              <span className="font-medium text-foreground">
                {segments.reduce((n, s) => n + s.content.length, 0).toLocaleString("vi-VN")}
              </span>{" "}
              ký tự
            </span>
            {Object.entries(
              segments.reduce<Record<string, number>>((acc, s) => {
                acc[s.source] = (acc[s.source] ?? 0) + 1;
                return acc;
              }, {}),
            ).map(([source, count]) => (
              <span key={source} className="rounded-full border border-border px-1.5 py-0.5">
                {(TRANSCRIPT_SOURCE_LABEL as Record<string, string>)[source] ?? source}: {count}
              </span>
            ))}
            <span className="font-mono">checksum {transcriptChecksum(segments).slice(0, 10)}</span>
          </div>
        )}
        {hasTranscript && (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {segments.map((s, i) => (
              <div key={s.id} className="flex gap-2.5 px-2.5 py-2">
                <div className="w-6 shrink-0 pt-0.5 text-right font-mono text-[10px] text-muted-foreground">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="rounded border border-border bg-surface-2 px-1 py-0.5 font-mono text-foreground">
                      {formatOffset(s.offsetSeconds)}
                    </span>
                    <span className="font-medium text-foreground">
                      {s.speakerName ?? "Người nói"}
                    </span>
                    <span>· {TRANSCRIPT_SOURCE_LABEL[s.source]}</span>
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap break-words text-foreground">
                    {s.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={pasteOpen} onOpenChange={(o) => setPasteOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Dán biên bản cuộc họp</DialogTitle>
            <DialogDescription>
              Hỗ trợ dạng &quot;Người nói: nội dung&quot; theo từng dòng hoặc văn bản liền mạch. Hệ thống
              tự cắt đoạn và gán mốc thời gian ước lượng.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={pasteText}
            data-testid="meeting-transcript-paste-textarea"
            onChange={(e) => setPasteText(e.target.value)}
            rows={10}
            placeholder="An: Chúng ta chốt ngân sách quý 3...&#10;Bình: Tôi sẽ gửi báo cáo trước thứ Sáu."
            className="w-full rounded-lg border border-border bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>
              Huỷ
            </Button>
            <Button
              data-testid="meeting-transcript-paste-save"
              disabled={!pasteText.trim() || importText.isPending}
              onClick={() => importText.mutate(pasteText.trim())}
            >
              {importText.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Lưu biên bản
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận tạo công việc</DialogTitle>
            <DialogDescription>
              Công việc được tạo từ cuộc họp này và giữ liên kết nguồn. Bấm hai lần cũng chỉ tạo một
              công việc.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Tiêu đề</label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Không gian làm việc</label>
              <Select value={formWorkspace} onValueChange={setFormWorkspace}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn không gian làm việc" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">
                Hạn hoàn thành (tuỳ chọn){pending?.item.dueHint ? ` · gợi ý: ${pending.item.dueHint}` : ""}
              </label>
              <Input type="date" value={formDue} onChange={(e) => setFormDue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Huỷ
            </Button>
            <Button
              disabled={!formTitle.trim() || !formWorkspace || confirmItem.isPending}
              onClick={() =>
                pending &&
                confirmItem.mutate({
                  itemKey: pending.key,
                  title: formTitle.trim(),
                  workspaceId: formWorkspace,
                  dueAt: formDue ? new Date(`${formDue}T17:00:00`).toISOString() : null,
                })
              }
            >
              {confirmItem.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Xác nhận tạo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}