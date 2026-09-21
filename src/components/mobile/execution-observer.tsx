// ORCHESTRATION LAYER — chỉ hiển thị execution khi có giá trị quan sát.
// Không phải destination: không chọn agent trước, không mở panel khi mọi thứ đang ổn.
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listAiTaskExecutions, listWorkExecutionSteps } from "@/lib/api/ai-tasks.functions";
import { executionProgress, shouldObserveExecution } from "@/domain/ai-orchestration/route";
import type { AiTaskExecutionRow } from "@/domain/ai-tasks/contracts";
import type { WorkExecutionStepRow } from "@/domain/work-execution/contracts";
import { useI18n } from "@/lib/i18n";

/**
 * Quan sát lượt thực thi của một công việc đã giao.
 * Trả về `null` khi không có lượt nào cần theo dõi — đúng nguyên tắc
 * "chỉ expose execution khi cần quan sát hoặc can thiệp".
 */
export function ExecutionObserver({ taskId, agentName }: { taskId: string; agentName?: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const executionsFn = useServerFn(listAiTaskExecutions);
  const stepsFn = useServerFn(listWorkExecutionSteps);

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

  if (!latest || !active) return null;

  const running = latest.status === "QUEUED" || latest.status === "RUNNING";
  const failed = latest.status === "FAILED";
  const progress = executionProgress(steps.data ?? [], latest.status);
  const currentStep = (steps.data ?? []).find((s) => s.status === "RUNNING");
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
      <header className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {failed ? <AlertTriangle className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {agentName ?? t("m.exec.agent")} · {label}
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

      {currentStep?.title && (
        <p className="mt-2 truncate text-xs text-muted-foreground">{currentStep.title}</p>
      )}

      {(latest.status === "WAITING_REVIEW" || latest.status === "CHANGES_REQUESTED" || failed) && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3 min-h-11 w-full"
          onClick={() => void navigate({ to: "/tasks/$id", params: { id: taskId } })}
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> {t("m.exec.open")}
        </Button>
      )}
    </section>
  );
}
