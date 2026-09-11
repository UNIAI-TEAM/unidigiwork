// THEO DÕI ĐỀ XUẤT — công việc đã giao từ đề xuất AI: người phụ trách, tiến độ,
// và cập nhật trạng thái. Không ghi thẳng DB: dùng lại command transitionTask
// và updateTaskProgress, nên nhật ký Command Center tự cập nhật theo.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { getProposalTracking, type ProposalTrackingItem } from "@/lib/api/ai-brain.functions";
import { transitionTask } from "@/lib/api/tasks.functions";
import { updateTaskProgress } from "@/lib/api/projects.functions";

export const Route = createFileRoute("/_authenticated/ai-brain_/tracking")({
  head: () => ({
    meta: [
      { title: "Theo dõi đề xuất — UNIWORK" },
      {
        name: "description",
        content:
          "Theo dõi công việc đã giao từ đề xuất AI: người phụ trách, tiến độ và cập nhật trạng thái để nhật ký điều hành tự đổi.",
      },
      { property: "og:title", content: "Theo dõi đề xuất — UNIWORK" },
      {
        property: "og:description",
        content: "Công việc đã giao từ đề xuất AI, người phụ trách, tiến độ và trạng thái.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProposalTrackingPage,
});

const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "canceled"] as const;
const TASK_STATUS_LABEL: Record<string, string> = {
  todo: "Chưa bắt đầu",
  in_progress: "Đang làm",
  blocked: "Bị chặn",
  done: "Hoàn thành",
  canceled: "Đã hủy",
};

function fmt(v: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function ProposalTrackingPage() {
  const [open, setOpen] = useSidebarState();
  const { workspaceId } = useActiveWorkspace();
  const qc = useQueryClient();

  const listFn = useServerFn(getProposalTracking);
  const transitionFn = useServerFn(transitionTask);
  const progressFn = useServerFn(updateTaskProgress);

  const [filter, setFilter] = useState<"all" | "assigned" | "overdue" | "open">("assigned");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [draftProgress, setDraftProgress] = useState<Record<string, string>>({});

  const tracking = useQuery({
    queryKey: ["ai-brain", "tracking", workspaceId],
    queryFn: () => listFn({ data: { workspaceId: workspaceId as string, limit: 60 } }),
    enabled: Boolean(workspaceId),
  });

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["ai-brain"] });
    void qc.invalidateQueries({ queryKey: ["ceo"] });
    void qc.invalidateQueries({ queryKey: ["project"] });
  };

  const transition = useMutation({
    mutationFn: (p: { taskId: string; toStatus: string }) =>
      transitionFn({
        data: {
          taskId: p.taskId,
          toStatus: p.toStatus as never,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: (_d, p) => {
      toast.success(`Đã chuyển sang “${TASK_STATUS_LABEL[p.toStatus] ?? p.toStatus}”`);
      refreshAll();
    },
    onError: () => toast.error("Không cập nhật được trạng thái."),
    onSettled: () => setBusy(null),
  });

  const saveProgress = useMutation({
    mutationFn: (p: { taskId: string; progressPct: number }) =>
      progressFn({ data: { taskId: p.taskId, progressPct: p.progressPct } }),
    onSuccess: () => {
      toast.success("Đã cập nhật tiến độ.");
      refreshAll();
    },
    onError: () => toast.error("Không cập nhật được tiến độ."),
    onSettled: () => setBusy(null),
  });

  const rows = useMemo(() => {
    const all = (tracking.data ?? []) as ProposalTrackingItem[];
    const now = Date.now();
    const term = q.trim().toLowerCase();
    return all.filter((r) => {
      if (filter === "assigned" && !r.taskId) return false;
      if (
        filter === "open" &&
        (!r.taskId || r.taskStatus === "done" || r.taskStatus === "canceled")
      )
        return false;
      if (filter === "overdue") {
        if (!r.taskId || !r.taskDueAt) return false;
        if (r.taskStatus === "done" || r.taskStatus === "canceled") return false;
        if (new Date(r.taskDueAt).getTime() >= now) return false;
      }
      if (!term) return true;
      return [r.title, r.taskTitle, r.workerName, ...r.assignees.map((a) => a.name)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [tracking.data, filter, q]);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar active="ai-brain" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="min-h-11">
              <Link to="/ai-brain">
                <ArrowLeft className="mr-1 h-4 w-4" /> Bộ não AI
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold">Theo dõi đề xuất</h1>
              <p className="text-sm text-muted-foreground">
                Công việc đã giao từ đề xuất, người phụ trách và tiến độ. Cập nhật ở đây sẽ hiện
                ngay trong nhật ký Command Center.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => void tracking.refetch()}
            >
              <RefreshCw className="mr-1 h-4 w-4" /> Làm mới
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo đề xuất, công việc hoặc người phụ trách"
              className="h-11 min-w-0 flex-1"
            />
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="h-11 w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assigned">Đã giao việc</SelectItem>
                <SelectItem value="open">Đang mở</SelectItem>
                <SelectItem value="overdue">Quá hạn</SelectItem>
                <SelectItem value="all">Tất cả đề xuất</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!workspaceId ? (
            <p className="text-sm text-muted-foreground">Hãy chọn một không gian làm việc.</p>
          ) : tracking.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chưa có đề xuất nào khớp bộ lọc.
            </p>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => {
                const overdue =
                  r.taskDueAt &&
                  r.taskStatus !== "done" &&
                  r.taskStatus !== "canceled" &&
                  new Date(r.taskDueAt).getTime() < Date.now();
                const pct = Math.max(0, Math.min(100, r.taskProgress ?? 0));
                const key = r.taskId ?? r.id;
                return (
                  <li key={r.id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.taskTitle ?? r.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          Đề xuất: {r.title} · {fmt(r.createdAt)}
                        </p>
                      </div>
                      <Badge variant="outline">{r.status}</Badge>
                      {overdue ? <Badge variant="destructive">Quá hạn</Badge> : null}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Người phụ trách:{" "}
                        {r.assignees.length
                          ? r.assignees.map((a) => a.name).join(", ")
                          : (r.workerName ?? "Chưa giao")}
                      </span>
                      <span>Hạn: {fmt(r.taskDueAt)}</span>
                      <span>Cập nhật: {fmt(r.taskUpdatedAt)}</span>
                    </div>

                    {r.taskId ? (
                      <>
                        <div className="mt-3">
                          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                            <span>Tiến độ</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Select
                            value={r.taskStatus ?? "todo"}
                            onValueChange={(v) => {
                              setBusy(key);
                              transition.mutate({ taskId: r.taskId as string, toStatus: v });
                            }}
                          >
                            <SelectTrigger className="h-11 w-full sm:w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TASK_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {TASK_STATUS_LABEL[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            inputMode="numeric"
                            value={draftProgress[key] ?? String(pct)}
                            onChange={(e) =>
                              setDraftProgress((p) => ({ ...p, [key]: e.target.value }))
                            }
                            className="h-11 w-24"
                            aria-label="Tiến độ %"
                          />
                          <Button
                            size="sm"
                            className="min-h-11 flex-1 sm:flex-none"
                            disabled={busy === key}
                            onClick={() => {
                              const raw = Number(draftProgress[key] ?? pct);
                              if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
                                toast.error("Tiến độ phải từ 0 đến 100.");
                                return;
                              }
                              setBusy(key);
                              saveProgress.mutate({
                                taskId: r.taskId as string,
                                progressPct: Math.round(raw),
                              });
                            }}
                          >
                            {busy === key ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : null}
                            Cập nhật
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Đề xuất này chưa gắn với công việc nào.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
