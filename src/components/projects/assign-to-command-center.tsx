// Giao việc từ trang Dự án sang CEO Command Center: chọn việc, gán người thật hoặc vai trò AI,
// ghi nhật ký và làm mới KPI. Chỉ dùng API sẵn có (RLS + outbox), không đổi nghiệp vụ.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { assignTasksToRole, getRoleWorkload } from "@/lib/api/ai-brain.functions";
import { listWorkspaceMembers } from "@/lib/api/workspaces.functions";
import { assignTask, commentTask } from "@/lib/api/tasks.functions";
import { updateTaskProgress } from "@/lib/api/projects.functions";

type TaskLite = { id: string; title: string; status: string; progress_pct?: number | null };

export function AssignToCommandCenter({
  projectId,
  projectName,
  workspaceId,
  tasks,
}: {
  projectId: string;
  projectName: string;
  workspaceId: string | null;
  tasks: TaskLite[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [progress, setProgress] = useState("");
  const [note, setNote] = useState("");

  const membersFn = useServerFn(listWorkspaceMembers);
  const workloadFn = useServerFn(getRoleWorkload);
  const assignPersonFn = useServerFn(assignTask);
  const assignRoleFn = useServerFn(assignTasksToRole);
  const progressFn = useServerFn(updateTaskProgress);
  const commentFn = useServerFn(commentTask);

  const members = useQuery({
    queryKey: ["project-assign", "members", workspaceId ?? ""],
    queryFn: () => membersFn({ data: { workspaceId: workspaceId! } }),
    enabled: open && Boolean(workspaceId),
  });
  const workers = useQuery({
    queryKey: ["project-assign", "workers", workspaceId ?? ""],
    queryFn: () => workloadFn({ data: { workspaceId: workspaceId! } }),
    enabled: open && Boolean(workspaceId),
  });

  const openTasks = useMemo(
    () => tasks.filter((t) => !["done", "canceled"].includes(t.status)),
    [tasks],
  );

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = useMutation({
    mutationFn: async () => {
      if (!selected.length) throw new Error("Hãy chọn ít nhất một công việc.");
      if (!assigneeId && !workerId) throw new Error("Hãy chọn nhân sự thật hoặc vai trò AI.");
      const pctRaw = progress.trim() === "" ? null : Number(progress);
      const pct =
        pctRaw !== null && Number.isFinite(pctRaw)
          ? Math.max(0, Math.min(100, Math.round(pctRaw)))
          : null;
      const personName = assigneeId
        ? (members.data?.find((m) => m.userId === assigneeId)?.name ?? "nhân sự")
        : null;
      const workerName = workerId
        ? (workers.data?.find((w) => w.workerId === workerId)?.name ?? "vai trò AI")
        : null;

      for (const taskId of selected) {
        if (assigneeId) {
          await assignPersonFn({
            data: {
              taskId,
              assigneeId,
              role: "assignee",
              idempotencyKey: crypto.randomUUID(),
            },
          });
        }
        if (pct !== null) await progressFn({ data: { taskId, progressPct: pct } });
        const who = [personName, workerName].filter(Boolean).join(" + ");
        const body = `[Command Center] Giao việc từ dự án ${projectName} cho ${who}.${
          pct !== null ? ` Tiến độ ghi nhận: ${pct}%.` : ""
        }${note.trim() ? ` Ghi chú: ${note.trim()}` : ""}`;
        await commentFn({ data: { taskId, body, idempotencyKey: crypto.randomUUID() } });
      }
      if (workerId && workspaceId) {
        await assignRoleFn({
          data: { workspaceId, workerId, taskIds: selected.slice(0, 20) },
        });
      }
      return selected.length;
    },
    onSuccess: (count) => {
      toast.success(`Đã giao ${count} công việc sang Command Center.`);
      setOpen(false);
      setSelected([]);
      setNote("");
      setProgress("");
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["project-activity", projectId] });
      void qc.invalidateQueries({ queryKey: ["ceo"] });
      void qc.invalidateQueries({ queryKey: ["ai-brain"] });
    },
    onError: (e: Error) => toast.error(e.message || "Không giao được việc."),
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="min-h-11 gap-1 px-3 text-xs"
        disabled={openTasks.length === 0 || !workspaceId}
        onClick={() => setOpen(true)}
      >
        <Send className="h-3.5 w-3.5" /> Giao việc sang Command Center
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Giao việc sang Command Center</DialogTitle>
            <DialogDescription>
              Chọn công việc, gán nhân sự thật hoặc vai trò AI. Nhật ký và KPI ở Command Center tự
              cập nhật.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">Công việc ({selected.length} đã chọn)</p>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {openTasks.map((t) => (
                  <label
                    key={t.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-2"
                  >
                    <Checkbox
                      checked={selected.includes(t.id)}
                      onCheckedChange={() => toggle(t.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t.progress_pct ?? 0}%
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Nhân sự thật</span>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="min-h-11 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="">— Không chọn —</option>
                  {(members.data ?? []).map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Vai trò AI</span>
                <select
                  value={workerId}
                  onChange={(e) => setWorkerId(e.target.value)}
                  className="min-h-11 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="">— Không chọn —</option>
                  {(workers.data ?? []).map((w) => (
                    <option key={w.workerId} value={w.workerId}>
                      {w.name} · {w.role}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tiến độ ghi nhận (%)</span>
              <Input
                inputMode="numeric"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                placeholder="Bỏ trống nếu giữ nguyên"
                className="min-h-11"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Ghi chú giao việc</span>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Yêu cầu, thời hạn mong muốn…"
              />
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => setOpen(false)}
              disabled={submit.isPending}
            >
              Hủy
            </Button>
            <Button
              className="min-h-11"
              onClick={() => submit.mutate()}
              disabled={submit.isPending}
            >
              {submit.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              Giao việc
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
