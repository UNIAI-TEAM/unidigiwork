// ORCHESTRATION LAYER — hiển thị ai đang thực hiện (Human/Agent), tiến độ từng
// bước, và nút can thiệp khi cần. Chỉ hiện khi có giá trị quan sát.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Circle,
  CircleSlash,
  ExternalLink,
  Loader2,
  Pencil,
  RotateCcw,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  acceptAiTaskExecution,
  cancelWorkExecutionStep,
  listAiTaskExecutions,
  listWorkExecutionSteps,
  requestAiTaskChanges,
  retryWorkExecutionStep,
} from "@/lib/api/ai-tasks.functions";
import { executionProgress, shouldObserveExecution } from "@/domain/ai-orchestration/route";
import { canRetryStepInPlace } from "@/domain/work-execution/contracts";
import type { AiTaskExecutionRow } from "@/domain/ai-tasks/contracts";
import type { WorkExecutionStepRow } from "@/domain/work-execution/contracts";
import { useI18n } from "@/lib/i18n";

function StepIcon({ status }: { status: string }) {
  if (status === "SUCCEEDED") return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (status === "FAILED") return <AlertTriangle className="h-4 w-4 text-destructive" />;
  if (status === "SKIPPED") return <CircleSlash className="h-4 w-4 text-muted-foreground" />;
  if (status === "RUNNING") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

/**
 * Quan sát và can thiệp lượt thực thi của một công việc đã giao.
 * Trả về `null` khi không có lượt nào cần theo dõi — đúng nguyên tắc
 * "chỉ expose execution khi cần quan sát hoặc can thiệp".
 */
export function ExecutionObserver({
  taskId,
  agentName,
  humanName,
}: {
  taskId: string;
  agentName?: string;
  humanName?: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const executionsFn = useServerFn(listAiTaskExecutions);
  const stepsFn = useServerFn(listWorkExecutionSteps);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const executions = useQuery({
    queryKey: ["m-execution", taskId],
    queryFn: () => executionsFn({ data: { taskId } }) as Promise<AiTaskExecutionRow[]>,
    refetchInterval: (query) => {
      const latest = (query.state.data as AiTaskExecutionRow[] | undefined)?.[0];
      return latest && ["QUEUED", "RUNNING"].includes(latest.status) ? 4000 : false;
    },
  });

  const latest = executions.data?.[0];
  const active = shouldObserveExecution(latest?.status);

  const steps = useQuery({
    queryKey: ["m-execution-steps", latest?.id],
    queryFn: () =>
      stepsFn({ data: { executionId: latest!.id } }) as Promise<WorkExecutionStepRow[]>,
    enabled: Boolean(active && latest?.id),
    refetchInterval: latest && ["QUEUED", "RUNNING"].includes(latest.status) ? 4000 : false,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["m-execution", taskId] });
    await queryClient.invalidateQueries({ queryKey: ["m-execution-steps", latest?.id] });
  };

  const accept = useMutation({
    mutationFn: useServerFn(acceptAiTaskExecution),
    onSuccess: async () => {
      toast.success(t("m.exec.approveDone"));
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("m.exec.failed")),
  });

  const requestChanges = useMutation({
    mutationFn: useServerFn(requestAiTaskChanges),
    onSuccess: async () => {
      toast.success(t("m.exec.feedbackSent"));
      setFeedbackOpen(false);
      setFeedback("");
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("m.exec.failed")),
  });

  const retryStep = useMutation({
    mutationFn: useServerFn(retryWorkExecutionStep),
    onSuccess: async () => {
      toast.success(t("m.exec.retryStarted"));
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("m.exec.failed")),
  });

  const cancelStep = useMutation({
    mutationFn: useServerFn(cancelWorkExecutionStep),
    onSuccess: async () => {
      toast.success(t("m.exec.cancelDone"));
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("m.exec.failed")),
  });

  if (!latest || !active) {
    return <HumanExecutionPanel taskId={taskId} humanName={humanName} />;
  }

  const running = latest.status === "QUEUED" || latest.status === "RUNNING";
  const failed = latest.status === "FAILED";
  const stepRows = steps.data ?? [];
  const progress = executionProgress(stepRows, latest.status);
  const failedStep = stepRows.find((s) => s.status === "FAILED");
  const isAgent = Boolean(agentName);
  const actorLabel = agentName ?? humanName ?? t("m.exec.human");
  const busy =
    accept.isPending || requestChanges.isPending || retryStep.isPending || cancelStep.isPending;

  const label =
    latest.status === "WAITING_REVIEW"
      ? t("m.exec.review")
      : latest.status === "CHANGES_REQUESTED"
        ? t("m.exec.changes")
        : failed
          ? t("m.exec.failed")
          : t("m.exec.working");

  return (
    <section
      aria-label={t("m.exec.title")}
      className="rounded-xl border border-border bg-surface px-3 py-3 text-sm"
    >
      {/* Ai đang thực hiện: nhân sự AI hoặc con người */}
      <header className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {failed ? (
            <AlertTriangle className="h-4 w-4" />
          ) : isAgent ? (
            <Bot className="h-4 w-4" />
          ) : (
            <User className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {actorLabel} · {label}
          {running ? ` · ${progress}%` : ""}
        </span>
        {running && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </header>

      {running && (
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <span
            className="block h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Các bước thực hiện */}
      {stepRows.length > 0 && (
        <ol className="mt-3 space-y-1.5">
          {stepRows.map((step) => (
            <li key={step.id} className="flex items-center gap-2 text-xs">
              <StepIcon status={step.status} />
              <span
                className={
                  step.status === "FAILED"
                    ? "min-w-0 flex-1 truncate font-medium text-destructive"
                    : "min-w-0 flex-1 truncate text-muted-foreground"
                }
              >
                {step.title}
              </span>
              {step.status === "RUNNING" && (
                <span className="shrink-0 text-primary">{t("m.exec.working")}</span>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Can thiệp: duyệt / yêu cầu chỉnh sửa khi chờ nghiệm thu */}
      {latest.status === "WAITING_REVIEW" && (
        <div className="mt-3 space-y-2">
          {feedbackOpen ? (
            <div className="space-y-2">
              <Textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder={t("m.exec.feedbackPlaceholder")}
                rows={3}
                className="min-h-20 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="min-h-11 flex-1"
                  disabled={!feedback.trim() || busy}
                  onClick={() =>
                    requestChanges.mutate({
                      data: { executionId: latest.id, feedback: feedback.trim() },
                    } as never)
                  }
                >
                  {requestChanges.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t("m.exec.sendFeedback")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => setFeedbackOpen(false)}
                >
                  {t("m.exec.dismiss")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="min-h-11 flex-1"
                disabled={busy}
                onClick={() =>
                  accept.mutate({ data: { executionId: latest.id, completeTask: true } } as never)
                }
              >
                {accept.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("m.exec.approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 flex-1"
                disabled={busy}
                onClick={() => setFeedbackOpen(true)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t("m.exec.requestChanges")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Can thiệp: thử lại / huỷ bước lỗi */}
      {failed && failedStep && (
        <div className="mt-3 flex gap-2">
          {canRetryStepInPlace(failedStep.kind) && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 flex-1"
              disabled={busy}
              onClick={() =>
                retryStep.mutate({
                  data: { executionId: latest.id, kind: failedStep.kind },
                } as never)
              }
            >
              {retryStep.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t("m.exec.retry")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 flex-1 text-destructive"
            disabled={busy}
            onClick={() =>
              cancelStep.mutate({
                data: { executionId: latest.id, kind: failedStep.kind },
              } as never)
            }
          >
            <CircleSlash className="mr-1.5 h-3.5 w-3.5" /> {t("m.exec.cancelStep")}
          </Button>
        </div>
      )}

      {(latest.status === "WAITING_REVIEW" || latest.status === "CHANGES_REQUESTED" || failed) && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 min-h-11 w-full"
          onClick={() => void navigate({ to: "/tasks/$id", params: { id: taskId } })}
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> {t("m.exec.open")}
        </Button>
      )}
    </section>
  );
}
