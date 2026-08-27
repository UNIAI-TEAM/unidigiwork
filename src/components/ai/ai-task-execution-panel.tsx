// AI TASK EXECUTION V1 — UI giao việc cho nhân sự AI và duyệt bản bàn giao.
// Bất biến UX: nút "Nghiệm thu" chỉ xuất hiện cho con người, khi lượt chạy ở CHỜ DUYỆT.
import { useMemo, useState } from "react";
import { usePanelCollapse } from "@/hooks/use-panel-collapse";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Loader2, Lock, Play, PlayCircle, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import {
  AI_EXECUTION_STATUS_LABEL,
  DELIVERABLE_TEMPLATES,
  type AiTaskExecutionRow,
  type AiWorkerRow,
} from "@/domain/ai-tasks/contracts";
import {
  acceptAiTaskExecution,
  assignTaskToAi,
  getAiTaskAccess,
  listAiTaskExecutions,
  listAiWorkers,
  requestAiTaskChanges,
  resumeAiTask,
  runAiTask,
} from "@/lib/api/ai-tasks.functions";
import { WorkExecutionTimeline } from "./work-execution-timeline";

interface TaskLike {
  id: string;
  tenant_id: string;
  execution_mode?: string | null;
  ai_worker_id?: string | null;
  expected_deliverable?: string | null;
  acceptance_criteria?: string | null;
  ai_execution_status?: string | null;
}

const input =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

export function AiTaskExecutionPanel({ task, onChanged }: { task: TaskLike; onChanged: () => void }) {
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = usePanelCollapse("ai-task-execution");
  const [workerId, setWorkerId] = useState(task.ai_worker_id ?? "");
  const [deliverable, setDeliverable] = useState(task.expected_deliverable ?? "");
  const [criteria, setCriteria] = useState(task.acceptance_criteria ?? "");
  const [templateCode, setTemplateCode] = useState(DELIVERABLE_TEMPLATES[0]!.code);
  const [feedback, setFeedback] = useState("");

  // RLS/RBAC: chỉ tải dữ liệu AI khi người dùng thực sự có quyền xem công việc.
  const access = useQuery({
    queryKey: ["ai-task-access", task.id],
    queryFn: () => getAiTaskAccess({ data: { taskId: task.id } }),
    staleTime: 60_000,
  });
  const canView = access.data?.canView === true;
  const canManage = access.data?.canManage === true;
  const canReview = access.data?.canReview === true;

  const workers = useQuery({
    queryKey: ["ai-workers", task.tenant_id],
    queryFn: () => listAiWorkers({ data: { tenantId: task.tenant_id } }),
    staleTime: 5 * 60_000,
    enabled: canManage,
  });

  const executions = useQuery({
    queryKey: ["ai-task-executions", task.id],
    queryFn: () => listAiTaskExecutions({ data: { taskId: task.id } }),
    enabled: canView,
  });

  const rows = (executions.data ?? []) as AiTaskExecutionRow[];
  const latest = rows[0] ?? null;
  const workerList = (workers.data ?? []) as AiWorkerRow[];
  const assignedWorker = useMemo(
    () => workerList.find((w) => w.id === (task.ai_worker_id ?? workerId)) ?? null,
    [workerList, task.ai_worker_id, workerId],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ai-task-executions", task.id] });
    onChanged();
  };

  const assign = useMutation({
    mutationFn: () =>
      assignTaskToAi({
        data: {
          taskId: task.id,
          aiWorkerId: workerId,
          expectedDeliverable: deliverable.trim(),
          acceptanceCriteria: criteria.trim(),
        },
      }),
    onSuccess: () => { refresh(); toast.success("Đã giao công việc cho nhân sự AI"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = useMutation({
    mutationFn: () => runAiTask({ data: { taskId: task.id, templateCode } }),
    onSuccess: () => { refresh(); toast.success("Nhân sự AI đã nộp bản bàn giao, đang chờ bạn duyệt"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestChanges = useMutation({
    mutationFn: (executionId: string) => requestAiTaskChanges({ data: { executionId, feedback: feedback.trim() } }),
    onSuccess: () => { setFeedback(""); refresh(); toast.success("Đã gửi yêu cầu chỉnh sửa cho AI"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const accept = useMutation({
    mutationFn: (executionId: string) => acceptAiTaskExecution({ data: { executionId, completeTask: true } }),
    onSuccess: () => { refresh(); toast.success("Đã nghiệm thu và hoàn tất công việc"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resume = useMutation({
    mutationFn: (executionId: string) => resumeAiTask({ data: { executionId } }),
    onSuccess: () => { refresh(); toast.success("Đã tiếp tục thực thi và hoàn tất tự kiểm"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = (task.ai_execution_status ?? "NOT_STARTED") as keyof typeof AI_EXECUTION_STATUS_LABEL;
  const isAi = task.execution_mode === "AI_ASSISTED" && Boolean(task.ai_worker_id);

  if (access.isLoading) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra quyền truy cập…
        </p>
      </section>
    );
  }

  if (!canView) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Lock className="h-4 w-4 text-muted-foreground" /> Nhân sự AI thực thi
        </h2>
        <p className="text-sm text-muted-foreground">
          Bạn không có quyền xem dữ liệu thực thi AI của công việc này. Công việc thuộc tổ chức hoặc workspace khác.
          Hãy liên hệ quản trị viên workspace nếu bạn cần quyền truy cập.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-4 w-4 text-primary" /> Nhân sự AI thực thi
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-muted-foreground">
            {AI_EXECUTION_STATUS_LABEL[status] ?? status}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Mở rộng panel AI" : "Thu gọn panel AI"}
            title={collapsed ? "Mở rộng" : "Thu gọn"}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <>
          {!canManage ? (
            <p className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Bạn chỉ có quyền xem. Giao việc cho nhân sự AI và nghiệm thu bản bàn giao thuộc về chủ sở hữu công việc hoặc quản trị viên.
            </p>
          ) : null}

          {/* Giao việc / cập nhật đặc tả */}
          <div className={canManage ? "space-y-3" : "hidden"}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted-foreground">
            Nhân sự AI
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className={`${input} mt-1`}
              disabled={workers.isLoading}
            >
              <option value="">— Chọn nhân sự AI —</option>
              {workerList.map((w) => (
                <option key={w.id} value={w.id}>{w.name} · {w.role}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Mẫu bản bàn giao
            <select value={templateCode} onChange={(e) => setTemplateCode(e.target.value)} className={`${input} mt-1`}>
              {DELIVERABLE_TEMPLATES.map((t) => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs font-medium text-muted-foreground">
          Sản phẩm bàn giao mong đợi
          <textarea value={deliverable} onChange={(e) => setDeliverable(e.target.value)} rows={2}
            placeholder="Ví dụ: Báo cáo tiến độ dự án kèm rủi ro và đề xuất." className={`${input} mt-1 resize-y`} />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Tiêu chí nghiệm thu
          <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={2}
            placeholder="Ví dụ: Có trích dẫn nguồn, nêu tối thiểu 3 rủi ro, đề xuất hành động rõ ràng." className={`${input} mt-1 resize-y`} />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => assign.mutate()}
            disabled={assign.isPending || !workerId || !deliverable.trim() || !criteria.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
          >
            {assign.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {isAi ? "Cập nhật giao việc" : "Giao cho nhân sự AI"}
          </button>
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending || !isAi}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {rows.length ? "Chạy lại (bản mới)" : "Cho AI bắt đầu"}
          </button>
          <button
            onClick={() => executions.refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-surface-2"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Làm mới
          </button>
        </div>
        {assignedWorker ? (
          <p className="text-xs text-muted-foreground">
            Kỹ năng được cấp: {assignedWorker.skills.join(", ") || "—"} · Phạm vi quyền: {assignedWorker.permission_scope}
          </p>
        ) : null}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> AI chỉ tạo bản nháp có trích dẫn nguồn. Công việc chỉ hoàn thành khi con người nghiệm thu.
        </p>
      </div>

      {/* Bản bàn giao mới nhất */}
      {latest ? (
        <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Bản #{latest.revision}</span>
            <span>· {AI_EXECUTION_STATUS_LABEL[latest.status]}</span>
            {latest.completed_at ? <span>· {new Date(latest.completed_at).toLocaleString("vi-VN")}</span> : null}
          </div>
          {latest.deliverable_title ? <h3 className="text-sm font-semibold">{latest.deliverable_title}</h3> : null}
          {latest.status === "RUNNING" || latest.status === "QUEUED" ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Nhân sự AI đang thực hiện…
            </p>
          ) : (
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
              {latest.deliverable_content ?? "Không có nội dung."}
            </pre>
          )}

          {latest.source_refs?.length ? (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Nguồn dữ liệu đã dùng</p>
              <ul className="space-y-1 text-xs">
                {latest.source_refs.map((s) => (
                  <li key={s.sourceId}>
                    <a href={s.href} className="inline-flex items-center gap-1 text-primary hover:underline">
                      [{s.sourceId}] {s.title} <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {latest.evidence ? (
            <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
              <span>Bằng chứng: mô hình {latest.evidence.model ?? "—"} · {latest.evidence.sourceCount ?? 0} nguồn · {latest.evidence.outputTokens ?? 0} token đầu ra</span>
              {latest.evidence.limitations?.length ? <span>Giới hạn: {latest.evidence.limitations.join("; ")}</span> : null}
              {latest.evidence.assumptions?.length ? <span>Giả định: {latest.evidence.assumptions.join("; ")}</span> : null}
            </div>
          ) : null}

          {latest.change_request ? (
            <p className="mt-3 rounded-md border border-border bg-surface p-2 text-xs text-muted-foreground">
              Yêu cầu chỉnh sửa: {latest.change_request}
            </p>
          ) : null}

          {typeof latest.evidence?.validationScore === "number" ? (
            <p
              className={`mt-3 rounded-md border p-2 text-xs ${
                latest.evidence.validationPassed
                  ? "border-border bg-surface text-muted-foreground"
                  : "border-destructive/40 bg-destructive/5 text-destructive"
              }`}
            >
              Tự kiểm theo tiêu chí nghiệm thu: {latest.evidence.validationScore}/100
              {latest.evidence.validationPassed ? " · đạt" : " · chưa đạt, hãy xem kỹ trước khi nghiệm thu"}
              {latest.evidence.proposedActionCount
                ? ` · ${latest.evidence.proposedActionCount} đề xuất hành động đang chờ bạn xác nhận`
                : ""}
            </p>
          ) : null}

          {latest.evidence?.awaitingActionConfirmation ? (
            <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
              <p className="text-muted-foreground">
                Pipeline đang tạm dừng ở bước “Đề xuất hành động”. Hãy xác nhận hoặc huỷ
                {" "}{latest.evidence.proposedActionCount ?? 0} đề xuất trong Trung tâm hành động AI, rồi bấm tiếp tục.
              </p>
              {canManage ? (
                <button
                  onClick={() => resume.mutate(latest.id)}
                  disabled={resume.isPending}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {resume.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                  Tiếp tục thực thi
                </button>
              ) : null}
            </div>
          ) : null}

          <WorkExecutionTimeline executionId={latest.id} canManage={canManage} />

          {latest.status === "WAITING_REVIEW" && canReview ? (
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={2}
                placeholder="Nêu rõ cần chỉnh sửa gì (bắt buộc nếu yêu cầu làm lại)…"
                className={`${input} resize-y`}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => accept.mutate(latest.id)}
                  disabled={accept.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {accept.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Nghiệm thu & hoàn tất
                </button>
                <button
                  onClick={() => requestChanges.mutate(latest.id)}
                  disabled={requestChanges.isPending || !feedback.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-surface disabled:opacity-50"
                >
                  {requestChanges.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Yêu cầu chỉnh sửa
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Lịch sử phiên bản */}
      {rows.length > 1 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Lịch sử bản làm việc của AI</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {rows.slice(1).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">#{r.revision}</span>
                <span>{AI_EXECUTION_STATUS_LABEL[r.status]}</span>
                {r.completed_at ? <span>· {new Date(r.completed_at).toLocaleString("vi-VN")}</span> : null}
                {r.change_request ? <span>· phản hồi: {r.change_request.slice(0, 80)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
        </>
      )}
    </section>
  );
}
