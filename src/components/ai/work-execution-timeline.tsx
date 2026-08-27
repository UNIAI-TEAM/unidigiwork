// WEE-1 — Timeline các bước AI đã thực hiện trong một lượt chạy.
// Chỉ hiển thị; mọi hành động ghi vẫn phải đi qua đường xác nhận riêng.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CircleDashed, Clock, Download, Loader2, MinusCircle, RotateCcw, ShieldQuestion, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  WORK_STEP_LABEL,
  WORK_STEP_STATUS_LABEL,
  canRetryStepInPlace,
  type WorkExecutionStepRow,
  type WorkStepKind,
  type WorkStepStatus,
} from "@/domain/work-execution/contracts";
import {
  cancelWorkExecutionStep,
  exportWorkExecutionTimeline,
  listWorkExecutionSteps,
  retryWorkExecutionStep,
} from "@/lib/api/ai-tasks.functions";

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ICONS: Record<WorkStepStatus, typeof Check> = {
  PENDING: CircleDashed,
  RUNNING: Loader2,
  SUCCEEDED: Check,
  FAILED: AlertTriangle,
  SKIPPED: MinusCircle,
  AWAITING_CONFIRMATION: ShieldQuestion,
};

const TONE: Record<WorkStepStatus, string> = {
  PENDING: "text-muted-foreground",
  RUNNING: "text-primary",
  SUCCEEDED: "text-primary",
  FAILED: "text-destructive",
  SKIPPED: "text-muted-foreground",
  AWAITING_CONFIRMATION: "text-warning",
};

export function WorkExecutionTimeline({
  executionId,
  canManage = false,
}: {
  executionId: string;
  canManage?: boolean;
}) {
  const qc = useQueryClient();
  const steps = useQuery({
    queryKey: ["work-execution-steps", executionId],
    queryFn: () => listWorkExecutionSteps({ data: { executionId } }),
    staleTime: 15_000,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["work-execution-steps", executionId] });
    void qc.invalidateQueries({ queryKey: ["ai-task-executions"] });
  };

  const retry = useMutation({
    mutationFn: (kind: WorkStepKind) => retryWorkExecutionStep({ data: { executionId, kind } }),
    onSuccess: () => {
      toast.success("Đã chạy lại bước và cập nhật kết quả tự kiểm.");
      refresh();
    },
    onError: (e: unknown) => {
      const code = (e as { code?: string })?.code;
      toast.error(
        code === "AI_STEP_RETRY_NEEDS_NEW_REVISION"
          ? "Bước này cần chạy lại bằng một lượt mới (nút Chạy lại ở trên)."
          : "Không chạy lại được bước này.",
      );
    },
  });

  const cancel = useMutation({
    mutationFn: (kind: WorkStepKind) => cancelWorkExecutionStep({ data: { executionId, kind } }),
    onSuccess: () => {
      toast.success("Đã huỷ bước và đóng lượt chạy.");
      refresh();
    },
    onError: () => toast.error("Không huỷ được bước này."),
  });

  const exportTimeline = useMutation({
    mutationFn: () => exportWorkExecutionTimeline({ data: { executionId } }),
    onSuccess: (res) => {
      const short = executionId.slice(0, 8);
      downloadJson(`timeline-${short}.json`, res.timeline);
      downloadJson(`timeline-${short}.golden.json`, res.golden);
      toast.success(`Đã tải timeline.json và bản golden (${res.golden.fingerprint}).`);
    },
    onError: () => toast.error("Không xuất được timeline."),
  });

  const busy = retry.isPending || cancel.isPending;
  const rows = (steps.data ?? []) as WorkExecutionStepRow[];
  if (steps.isLoading) {
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải tiến trình thực thi…
      </p>
    );
  }
  if (rows.length === 0) return null;

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Tiến trình AI đã thực hiện</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={exportTimeline.isPending}
          onClick={() => exportTimeline.mutate()}
        >
          {exportTimeline.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Xuất timeline.json
        </Button>
      </div>
      <ol className="space-y-2">
        {rows.map((s) => {
          const status = s.status;
          const Icon = ICONS[status] ?? CircleDashed;
          const duration =
            s.started_at && s.completed_at
              ? Math.max(0, Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000))
              : null;
          return (
            <li key={s.id} className="flex gap-2.5">
              <Icon
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${TONE[status] ?? "text-muted-foreground"} ${status === "RUNNING" ? "animate-spin" : ""}`}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="font-medium text-foreground">{WORK_STEP_LABEL[s.kind] ?? s.title}</span>
                  <span className="text-muted-foreground">· {WORK_STEP_STATUS_LABEL[status] ?? status}</span>
                  {duration !== null ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {duration}s
                    </span>
                  ) : null}
                </p>
                {s.detail ? (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{s.detail}</p>
                ) : null}
                {s.error_code ? (
                  <p className="mt-0.5 text-xs text-destructive">Mã lỗi: {s.error_code}</p>
                ) : null}
                {canManage && status === "FAILED" ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      disabled={busy}
                      onClick={() => retry.mutate(s.kind)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Thử lại bước
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => cancel.mutate(s.kind)}
                    >
                      <XCircle className="h-3 w-3" />
                      Huỷ bước
                    </Button>
                    {!canRetryStepInPlace(s.kind) ? (
                      <span className="text-xs text-muted-foreground">
                        Bước này sẽ cần chạy lại bằng một lượt mới.
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
