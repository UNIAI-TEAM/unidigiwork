// Meeting Intelligence V1 — biên bản trực tiếp + tóm tắt AI có nguồn trích dẫn.
import { useMemo, useState } from "react";
import { usePanelCollapse } from "@/hooks/use-panel-collapse";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Gavel,
  HelpCircle,
  ListTodo,
  Loader2,
  Mail,
  Quote,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  formatOffset,
  summaryProgressPercent,
  transcriptChecksum,
  type MeetingActionItem,
  type MeetingSummary,
  type SummaryProgress,
  type SummarySource,
} from "@/domain/meeting-intelligence/contracts";
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
import { localeTag, useI18n, type Key } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

type Translate = (k: Key) => string;

type TranscriptImportStep = "READ" | "STT" | "SAVE";
type TranscriptStepStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
type TranscriptImportJob = {
  kind: "AUDIO" | "PASTE";
  label: string;
  startedAt: number;
  error: string | null;
  steps: Array<{ step: TranscriptImportStep; status: TranscriptStepStatus; detail: string | null }>;
};

const IMPORT_STEP_KEY: Record<TranscriptImportStep, Key> = {
  READ: "mtg.mi.step.read",
  STT: "mtg.mi.step.stt",
  SAVE: "mtg.mi.step.save",
};
const IMPORT_STATUS_KEY: Record<TranscriptStepStatus, Key> = {
  PENDING: "mtg.mi.st.pending",
  RUNNING: "mtg.mi.st.running",
  DONE: "mtg.mi.st.done",
  FAILED: "mtg.mi.st.failed",
  SKIPPED: "mtg.mi.st.skipped",
};
// Nhãn enum của domain được dịch ở tầng UI; giá trị lạ thì hiện nguyên giá trị.
const PHASE_KEY: Record<string, Key> = {
  PREPARING: "mtg.mi.phase.preparing",
  MAPPING: "mtg.mi.phase.mapping",
  SYNTHESIS: "mtg.mi.phase.synthesis",
  DONE: "mtg.mi.phase.done",
  FAILED: "mtg.mi.phase.failed",
};
const CHUNK_KEY: Record<string, Key> = {
  PENDING: "mtg.mi.chunk.pending",
  RUNNING: "mtg.mi.chunk.running",
  DONE: "mtg.mi.chunk.done",
  FAILED: "mtg.mi.chunk.failed",
};
const CONFIDENCE_KEY: Record<string, Key> = {
  EXPLICIT: "mtg.mi.conf.explicit",
  LIKELY: "mtg.mi.conf.likely",
  UNCLEAR: "mtg.mi.conf.unclear",
};
const SOURCE_KEY: Record<string, Key> = {
  LIVE_CAPTION: "mtg.mi.src.live",
  RECORDING: "mtg.mi.src.recording",
  MANUAL: "mtg.mi.src.manual",
};

function tl(map: Record<string, Key>, value: string, t: Translate) {
  const key = map[value];
  return key ? t(key) : value;
}

/** Đọc file thành base64 bằng API gốc của trình duyệt — không dựng chuỗi nhị phân trên main thread. */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

function TranscriptImportStatusCard({
  job,
  onDismiss,
}: {
  job: TranscriptImportJob;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const failed = job.steps.some((s) => s.status === "FAILED");
  const done = !failed && job.steps.every((s) => s.status === "DONE");
  return (
    <div
      role="status"
      className={`rounded-lg border p-2.5 ${
        failed ? "border-destructive/40 bg-destructive/5" : "border-border bg-surface-2"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground">
            {job.kind === "AUDIO" ? t("mtg.mi.import.audio") : t("mtg.mi.import.paste")}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{job.label}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-8 shrink-0 px-0 text-muted-foreground"
          onClick={onDismiss}
          aria-label={t("mtg.mi.import.dismiss")}
        >
          <X />
        </Button>
      </div>
      <ol className="space-y-1.5">
        {job.steps.map((s) => (
          <li key={s.step} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              {s.status === "RUNNING" ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : s.status === "DONE" ? (
                <CheckCircle2 className="h-3 w-3 text-success" />
              ) : s.status === "FAILED" ? (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              ) : (
                <span className="block h-3 w-3 rounded-full border border-border" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
                {t(IMPORT_STEP_KEY[s.step])}
                <span className="text-[11px] text-muted-foreground">
                  · {t(IMPORT_STATUS_KEY[s.status])}
                </span>
              </div>
              {s.detail && (
                <div
                  className={`text-[11px] ${
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
        <div className="mt-2 text-[11px] text-muted-foreground">{t("mtg.mi.import.done")}</div>
      )}
      {job.error && (
        <div className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-1.5 text-[11px] text-destructive">
          {fmt(t("mtg.mi.import.errorDetail"), { error: job.error })}
        </div>
      )}
    </div>
  );
}

function CitationChips({
  ids,
  sources,
  onPick,
}: {
  ids: string[];
  sources: SummarySource[];
  onPick: (s: SummarySource) => void;
}) {
  const { t } = useI18n();
  const known = ids
    .map((id) => sources.find((s) => s.sourceId === id))
    .filter((s): s is SummarySource => Boolean(s));
  if (known.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {known.map((s) => {
        const time = formatOffset(s.offsetSeconds);
        return (
          <button
            key={s.sourceId}
            type="button"
            onClick={() => onPick(s)}
            title={s.excerpt}
            aria-label={fmt(t("mtg.mi.citation"), { time })}
            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Quote className="h-2.5 w-2.5" aria-hidden="true" />
            {time}
          </button>
        );
      })}
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
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const percent = running || progress.phase !== "DONE" ? summaryProgressPercent(progress) : 100;
  const active = progress.phase === "MAPPING" || progress.phase === "SYNTHESIS";
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          {active && <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />}
          {tl(PHASE_KEY, progress.phase, t)}
          {progress.staged && (
            <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {t("mtg.mi.progress.staged")}
            </span>
          )}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {progress.totalChunks > 0
            ? fmt(t("mtg.mi.progress.parts"), {
                done: progress.completedChunks + progress.failedChunks,
                total: progress.totalChunks,
                percent,
              })
            : `${percent}%`}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={t("mtg.mi.progress.label")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className="h-full origin-left rounded-full bg-primary transition-transform duration-300 ease-out"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>

      {progress.chunks.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {progress.chunks.map((c) => (
            <span
              key={c.index}
              title={fmt(t("mtg.mi.progress.chunkTitle"), {
                n: c.index + 1,
                from: formatOffset(c.startOffsetSeconds),
                to: formatOffset(c.endOffsetSeconds),
                segments: c.segmentCount,
                chars: c.charCount.toLocaleString(locale),
                status: tl(CHUNK_KEY, c.status, t),
              })}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${
                CHUNK_STATUS_CLASS[c.status] ?? CHUNK_STATUS_CLASS.PENDING
              }`}
            >
              {c.status === "RUNNING" && (
                <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
              )}
              #{c.index + 1} · {formatOffset(c.startOffsetSeconds)}
            </span>
          ))}
        </div>
      )}

      {progress.failedChunks > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
          {fmt(t("mtg.mi.progress.failedChunks"), { n: progress.failedChunks })}
        </div>
      )}
      {progress.truncated && (
        <div className="text-[11px] text-muted-foreground">{t("mtg.mi.progress.truncated")}</div>
      )}
    </div>
  );
}

function SectionHeading({ icon: Icon, children }: { icon: typeof Gavel; children: string }) {
  return (
    <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> {children}
    </h4>
  );
}

export function MeetingIntelligencePanel({ meetingId }: { meetingId: string }) {
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = usePanelCollapse("meeting-intelligence");
  const [activeSource, setActiveSource] = useState<SummarySource | null>(null);
  const [pending, setPending] = useState<{ item: MeetingActionItem; key: string } | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formWorkspace, setFormWorkspace] = useState("");
  const [formDue, setFormDue] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importJob, setImportJob] = useState<TranscriptImportJob | null>(null);
  const audioInputId = `meeting-audio-${meetingId}`;
  const pasteId = `meeting-paste-${meetingId}`;
  const taskTitleId = `meeting-task-title-${meetingId}`;
  const taskWorkspaceId = `meeting-task-workspace-${meetingId}`;
  const taskDueId = `meeting-task-due-${meetingId}`;
  const setStep = (step: TranscriptImportStep, status: TranscriptStepStatus, detail?: string) =>
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
      toast.success(t("mtg.mi.generated"));
    },
    onError: (err: unknown) => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-summary-progress", meetingId] });
      toast.error(err instanceof Error ? err.message : t("mtg.mi.generateError"));
    },
  });

  const invalidateTranscript = () => {
    void queryClient.invalidateQueries({ queryKey: ["meeting-transcript", meetingId] });
  };

  const importText = useMutation({
    mutationFn: (text: string) => {
      const chars = fmt(t("mtg.mi.import.chars"), { n: text.length.toLocaleString(locale) });
      setImportJob({
        kind: "PASTE",
        label: fmt(t("mtg.mi.import.pasteLabel"), { n: text.length.toLocaleString(locale) }),
        startedAt: Date.now(),
        error: null,
        steps: [
          { step: "READ", status: "DONE", detail: chars },
          { step: "SAVE", status: "RUNNING", detail: t("mtg.mi.import.saving") },
        ],
      });
      return importMeetingTranscriptText({ data: { meetingId, text, source: "MANUAL" } });
    },
    onSuccess: (r: { inserted: number }) => {
      invalidateTranscript();
      setPasteOpen(false);
      setPasteText("");
      setStep("SAVE", "DONE", fmt(t("mtg.mi.import.saved"), { n: r.inserted }));
      toast.success(fmt(t("mtg.mi.import.savedToast"), { n: r.inserted }));
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("mtg.mi.import.saveError");
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
          { step: "READ", status: "RUNNING", detail: t("mtg.mi.import.reading") },
          { step: "STT", status: "PENDING", detail: null },
          { step: "SAVE", status: "PENDING", detail: null },
        ],
      });
      if (file.size > 12 * 1024 * 1024) {
        const msg = t("mtg.mi.import.tooLarge");
        setStep("READ", "FAILED", msg);
        throw new Error(msg);
      }
      let base64: string;
      try {
        base64 = await readFileAsBase64(file);
      } catch {
        throw new Error(t("mtg.mi.import.readError"));
      }
      setStep(
        "READ",
        "DONE",
        fmt(t("mtg.mi.import.bytes"), { n: file.size.toLocaleString(locale) }),
      );
      setStep("STT", "RUNNING", t("mtg.mi.import.sending"));
      return transcribeMeetingRecording({
        data: {
          meetingId,
          fileName: file.name || "recording.wav",
          mimeType: file.type || "audio/wav",
          base64,
        },
      });
    },
    onSuccess: (r: { inserted: number; characters: number }) => {
      invalidateTranscript();
      setStep(
        "STT",
        "DONE",
        fmt(t("mtg.mi.import.received"), { n: r.characters.toLocaleString(locale) }),
      );
      setStep("SAVE", "DONE", fmt(t("mtg.mi.import.saved"), { n: r.inserted }));
      toast.success(fmt(t("mtg.mi.import.transcribedToast"), { n: r.inserted }));
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("mtg.mi.import.transcribeError");
      setImportJob((prev) =>
        prev
          ? {
              ...prev,
              error: msg,
              steps: prev.steps.map((s) =>
                s.status === "RUNNING"
                  ? { ...s, status: "FAILED", detail: msg }
                  : s.status === "PENDING"
                    ? { ...s, status: "SKIPPED", detail: t("mtg.mi.import.skippedDetail") }
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
    mutationFn: (input: {
      itemKey: string;
      title: string;
      workspaceId: string;
      dueAt: string | null;
    }) =>
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
      toast.success(t("mtg.mi.action.createdToast"));
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : t("mtg.mi.action.createError")),
  });

  const dismissItem = useMutation({
    mutationFn: (input: { itemKey: string; title: string }) =>
      dismissMeetingActionItem({ data: { meetingId, itemKey: input.itemKey, title: input.title } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-action-item-states", meetingId] });
      toast.success(t("mtg.mi.action.dismissedToast"));
    },
    onError: () => toast.error(t("mtg.mi.action.dismissError")),
  });

  // Giữ nguyên tham chiếu mảng giữa các lần render để các useMemo phía dưới không tính lại vô ích.
  const segments = useMemo(() => transcriptQuery.data ?? [], [transcriptQuery.data]);
  const summary = summaryQuery.data ?? null;
  const hasTranscript = segments.length > 0;
  const workspaces = workspacesQuery.data ?? [];
  const stateByKey = useMemo(
    () => new Map((statesQuery.data ?? []).map((s) => [s.itemKey, s])),
    [statesQuery.data],
  );
  const checksum = useMemo(() => (segments.length ? transcriptChecksum(segments) : ""), [segments]);
  const isStale =
    !!summary?.transcriptChecksum && segments.length > 0 && summary.transcriptChecksum !== checksum;
  const sourceCounts = useMemo(
    () =>
      Object.entries(
        segments.reduce<Record<string, number>>((acc, s) => {
          acc[s.source] = (acc[s.source] ?? 0) + 1;
          return acc;
        }, {}),
      ),
    [segments],
  );
  const totalChars = useMemo(() => segments.reduce((n, s) => n + s.content.length, 0), [segments]);

  const exportTranscriptCsv = () => {
    if (segments.length === 0) return;
    const esc = (v: string | number | null | undefined) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["stt", "offset_seconds", "timestamp", "speaker", "source", "content", "segment_id"],
      ...segments.map((s, i) => [
        i + 1,
        s.offsetSeconds,
        formatOffset(s.offsetSeconds),
        s.speakerName ?? "",
        tl(SOURCE_KEY, s.source, t),
        s.content,
        s.id,
      ]),
    ];
    const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${meetingId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(fmt(t("mtg.mi.exported"), { n: segments.length }));
  };

  const copyFollowUp = async () => {
    try {
      await navigator.clipboard.writeText(
        `${summary?.followUp?.subject ?? ""}\n\n${summary?.followUp?.body ?? ""}`,
      );
      toast.success(t("mtg.mi.copied"));
    } catch {
      toast.error(t("mtg.mi.copyError"));
    }
  };

  const openConfirm = (item: MeetingActionItem) => {
    setPending({ item, key: actionItemKey(item) });
    setFormTitle(item.title);
    setFormWorkspace(workspaces[0]?.id ?? "");
    setFormDue("");
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-foreground">{t("mtg.mi.title")}</h3>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasTranscript || generate.isPending}
            title={!hasTranscript ? t("mtg.mi.needTranscript") : undefined}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {summary ? t("mtg.mi.regenerate") : t("mtg.mi.generate")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-8 px-0 text-muted-foreground"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("mtg.mi.expand") : t("mtg.mi.collapse")}
          >
            {collapsed ? <ChevronDown /> : <ChevronUp />}
          </Button>
        </div>
      </div>

      {collapsed ? null : (
        <>
          {progress && <StagedProgress progress={progress} running={generate.isPending} />}
          {generate.isPending && !progress && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3 text-muted-foreground"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />{" "}
              {t("mtg.mi.preparing")}
            </div>
          )}

          {summary && (
            <div className="space-y-4 rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>
                  {fmt(t("mtg.mi.summary.meta"), {
                    kind:
                      summary.status === "partial"
                        ? t("mtg.mi.summary.partial")
                        : t("mtg.mi.summary.full"),
                    n: summary.segmentCount,
                    version: summary.version,
                  })}
                </span>
                <span>{new Date(summary.generatedAt).toLocaleString(locale)}</span>
              </div>
              {isStale && (
                <div className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-foreground">
                  <AlertTriangle
                    className="mt-0.5 h-3 w-3 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  <span>{t("mtg.mi.stale")}</span>
                </div>
              )}
              {summary.summary && (
                <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                  {summary.summary}
                </p>
              )}

              {summary.highlights.length > 0 && (
                <ul className="space-y-1">
                  {summary.highlights.map((h, i) => (
                    <li key={i} className="flex gap-1.5 text-foreground">
                      <CheckCircle2
                        className="mt-0.5 h-3 w-3 shrink-0 text-success"
                        aria-hidden="true"
                      />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              )}

              {summary.decisions.length > 0 && (
                <section className="space-y-2">
                  <SectionHeading icon={Gavel}>{t("mtg.mi.decisions")}</SectionHeading>
                  <ul className="space-y-2">
                    {summary.decisions.map((d, i) => (
                      <li key={i} className="rounded-md bg-background p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-foreground">{d.title}</div>
                          <span
                            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] ${
                              d.confidence === "EXPLICIT"
                                ? "bg-success/15 text-success"
                                : d.confidence === "LIKELY"
                                  ? "bg-warning/15 text-foreground"
                                  : "bg-surface-3 text-muted-foreground"
                            }`}
                          >
                            {tl(CONFIDENCE_KEY, d.confidence ?? "UNCLEAR", t)}
                          </span>
                        </div>
                        {d.detail && <div className="mt-0.5 text-muted-foreground">{d.detail}</div>}
                        <CitationChips
                          ids={d.sourceIds}
                          sources={summary.sources}
                          onPick={setActiveSource}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {summary.actionItems.length > 0 && (
                <section className="space-y-2">
                  <SectionHeading icon={ListTodo}>{t("mtg.mi.actions")}</SectionHeading>
                  <ul className="space-y-2">
                    {summary.actionItems.map((a, i) => {
                      const key = actionItemKey(a);
                      const state = stateByKey.get(key);
                      return (
                        <li key={i} className="rounded-md bg-background p-2">
                          <div className="font-medium text-foreground">{a.title}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {a.owner
                              ? fmt(t("mtg.mi.action.owner"), { owner: a.owner })
                              : t("mtg.mi.action.noOwner")}
                            {a.dueHint
                              ? ` · ${fmt(t("mtg.mi.action.due"), { due: a.dueHint })}`
                              : ""}
                          </div>
                          <CitationChips
                            ids={a.sourceIds}
                            sources={summary.sources}
                            onPick={setActiveSource}
                          />
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {state?.status === "CONVERTED_TO_TASK" ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-success">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />{" "}
                                {t("mtg.mi.action.converted")}
                              </span>
                            ) : state?.status === "DISMISSED" ? (
                              <span className="text-[11px] text-muted-foreground">
                                {t("mtg.mi.action.dismissed")}
                              </span>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={workspaces.length === 0}
                                  title={
                                    workspaces.length === 0
                                      ? t("mtg.mi.action.noWorkspace")
                                      : undefined
                                  }
                                  onClick={() => openConfirm(a)}
                                >
                                  {t("mtg.mi.action.create")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-muted-foreground"
                                  disabled={dismissItem.isPending}
                                  onClick={() =>
                                    dismissItem.mutate({ itemKey: key, title: a.title })
                                  }
                                >
                                  <X /> {t("mtg.mi.action.dismiss")}
                                </Button>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {summary.risks.length > 0 && (
                <section className="space-y-2">
                  <SectionHeading icon={AlertTriangle}>{t("mtg.mi.risks")}</SectionHeading>
                  <ul className="space-y-2">
                    {summary.risks.map((r, i) => (
                      <li key={i} className="rounded-md bg-background p-2">
                        <div className="text-foreground">{r.title}</div>
                        <CitationChips
                          ids={r.sourceIds}
                          sources={summary.sources}
                          onPick={setActiveSource}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {summary.openQuestions.length > 0 && (
                <section className="space-y-2">
                  <SectionHeading icon={HelpCircle}>{t("mtg.mi.questions")}</SectionHeading>
                  <ul className="space-y-2">
                    {summary.openQuestions.map((q, i) => (
                      <li key={i} className="rounded-md bg-background p-2">
                        <div className="text-foreground">{q.question}</div>
                        <CitationChips
                          ids={q.sourceIds}
                          sources={summary.sources}
                          onPick={setActiveSource}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {summary.followUp && (
                <section className="space-y-1.5 rounded-md bg-background p-2">
                  <div className="flex items-center justify-between gap-2">
                    <SectionHeading icon={Mail}>{t("mtg.mi.followUp")}</SectionHeading>
                    <Button size="sm" variant="ghost" onClick={() => void copyFollowUp()}>
                      <Copy /> {t("mtg.mi.copy")}
                    </Button>
                  </div>
                  <div className="font-medium text-foreground">{summary.followUp.subject}</div>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {summary.followUp.body}
                  </p>
                </section>
              )}

              {activeSource && (
                <div
                  aria-live="polite"
                  className="rounded-md border border-primary/30 bg-background p-2"
                >
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {activeSource.speakerName ?? t("mtg.mi.speaker")} ·{" "}
                      {formatOffset(activeSource.offsetSeconds)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 px-0"
                      onClick={() => setActiveSource(null)}
                      aria-label={t("mtg.close")}
                    >
                      <X />
                    </Button>
                  </div>
                  <div className="text-foreground">{activeSource.excerpt}</div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
            <span className="text-[11px] text-muted-foreground">{t("mtg.mi.sources")}</span>
            <input
              id={audioInputId}
              data-testid="meeting-transcript-audio-input"
              type="file"
              accept="audio/*"
              className="peer sr-only"
              disabled={transcribe.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f && !transcribe.isPending) transcribe.mutate(f);
              }}
            />
            <label
              htmlFor={audioInputId}
              data-testid="meeting-transcript-audio-label"
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
            >
              {transcribe.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {transcribe.isPending ? t("mtg.mi.transcribing") : t("mtg.mi.upload")}
            </label>
            <Button
              size="sm"
              variant="ghost"
              data-testid="meeting-transcript-paste-open"
              onClick={() => setPasteOpen(true)}
            >
              <FileText /> {t("mtg.mi.paste")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="meeting-transcript-export-csv"
              disabled={!hasTranscript}
              onClick={() => exportTranscriptCsv()}
            >
              <Download /> {t("mtg.mi.exportCsv")}
            </Button>
          </div>

          <div className="space-y-3">
            {importJob && (
              <TranscriptImportStatusCard job={importJob} onDismiss={() => setImportJob(null)} />
            )}
            {transcriptQuery.isLoading && (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-8 rounded-lg" />
                <Skeleton className="h-24 rounded-lg" />
              </div>
            )}
            {transcriptQuery.isError && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-foreground">{t("mtg.mi.transcriptError")}</p>
                <Button variant="outline" size="sm" onClick={() => void transcriptQuery.refetch()}>
                  {t("mtg.retry")}
                </Button>
              </div>
            )}
            {transcriptQuery.isSuccess && !hasTranscript && (
              <p className="text-muted-foreground">{t("mtg.mi.empty")}</p>
            )}
            {hasTranscript && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {fmt(t("mtg.mi.stats.segments"), { n: segments.length })}
                </span>
                <span>
                  {fmt(t("mtg.mi.stats.last"), {
                    time: formatOffset(segments.at(-1)?.offsetSeconds ?? 0),
                  })}
                </span>
                <span>
                  {fmt(t("mtg.mi.import.chars"), { n: totalChars.toLocaleString(locale) })}
                </span>
                {sourceCounts.map(([source, count]) => (
                  <span key={source} className="rounded-full border border-border px-1.5 py-0.5">
                    {tl(SOURCE_KEY, source, t)}: {count}
                  </span>
                ))}
                <span className="font-mono">checksum {checksum.slice(0, 10)}</span>
              </div>
            )}
            {hasTranscript && (
              <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {segments.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex gap-2.5 px-2.5 py-2 [contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]"
                  >
                    <div className="w-6 shrink-0 pt-0.5 text-right font-mono text-[11px] text-muted-foreground">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="rounded border border-border bg-surface-2 px-1 py-0.5 font-mono text-foreground">
                          {formatOffset(s.offsetSeconds)}
                        </span>
                        <span className="font-medium text-foreground">
                          {s.speakerName ?? t("mtg.mi.speaker")}
                        </span>
                        <span>· {tl(SOURCE_KEY, s.source, t)}</span>
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap break-words text-foreground">
                        {s.content}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <Dialog open={pasteOpen} onOpenChange={(o) => setPasteOpen(o)}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("mtg.mi.pasteDialog.title")}</DialogTitle>
                <DialogDescription>{t("mtg.mi.pasteDialog.desc")}</DialogDescription>
              </DialogHeader>
              <form
                id={`${pasteId}-form`}
                className="space-y-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pasteText.trim() && !importText.isPending)
                    importText.mutate(pasteText.trim());
                }}
              >
                <Label htmlFor={pasteId}>{t("mtg.mi.pasteDialog.label")}</Label>
                <Textarea
                  id={pasteId}
                  value={pasteText}
                  data-testid="meeting-transcript-paste-textarea"
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={10}
                  placeholder={t("mtg.mi.pasteDialog.placeholder")}
                  className="text-sm"
                />
              </form>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPasteOpen(false)}>
                  {t("mtg.cancelAction")}
                </Button>
                <Button
                  type="submit"
                  form={`${pasteId}-form`}
                  data-testid="meeting-transcript-paste-save"
                  disabled={!pasteText.trim() || importText.isPending}
                >
                  {importText.isPending && <Loader2 className="animate-spin" />}
                  {t("mtg.mi.pasteDialog.save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && setPending(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("mtg.mi.confirm.title")}</DialogTitle>
                <DialogDescription>{t("mtg.mi.confirm.desc")}</DialogDescription>
              </DialogHeader>
              <form
                id={`${taskTitleId}-form`}
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!pending || !formTitle.trim() || !formWorkspace || confirmItem.isPending)
                    return;
                  confirmItem.mutate({
                    itemKey: pending.key,
                    title: formTitle.trim(),
                    workspaceId: formWorkspace,
                    dueAt: formDue ? new Date(`${formDue}T17:00:00`).toISOString() : null,
                  });
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor={taskTitleId}>{t("mtg.form.title")}</Label>
                  <Input
                    id={taskTitleId}
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={taskWorkspaceId}>{t("mtg.mi.confirm.workspace")}</Label>
                  <Select value={formWorkspace} onValueChange={setFormWorkspace}>
                    <SelectTrigger id={taskWorkspaceId}>
                      <SelectValue placeholder={t("mtg.mi.confirm.workspacePlaceholder")} />
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
                <div className="space-y-1.5">
                  <Label htmlFor={taskDueId}>{t("mtg.mi.confirm.due")}</Label>
                  <Input
                    id={taskDueId}
                    type="date"
                    value={formDue}
                    onChange={(e) => setFormDue(e.target.value)}
                    aria-describedby={pending?.item.dueHint ? `${taskDueId}-hint` : undefined}
                  />
                  {pending?.item.dueHint && (
                    <p id={`${taskDueId}-hint`} className="text-xs text-muted-foreground">
                      {fmt(t("mtg.mi.confirm.dueHint"), { hint: pending.item.dueHint })}
                    </p>
                  )}
                </div>
              </form>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPending(null)}>
                  {t("mtg.cancelAction")}
                </Button>
                <Button
                  type="submit"
                  form={`${taskTitleId}-form`}
                  disabled={!formTitle.trim() || !formWorkspace || confirmItem.isPending}
                >
                  {confirmItem.isPending && <Loader2 className="animate-spin" />}
                  {t("mtg.mi.confirm.submit")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
