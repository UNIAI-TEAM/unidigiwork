// Giao việc từ CEO Command Center sang Dự án: chọn đề xuất đã gắn công việc, đưa vào dự án,
// gán nhân sự thật hoặc vai trò AI, ghi nhật ký và làm mới KPI. Chỉ dùng API sẵn có.
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
import { assignTasksToRole, type RoleWorkload } from "@/lib/api/ai-brain.functions";
import { listWorkspaceMembers } from "@/lib/api/workspaces.functions";
import { assignTask, commentTask } from "@/lib/api/tasks.functions";
import { listProjects, setTaskProject, updateTaskProgress } from "@/lib/api/projects.functions";
import type { CeoProposalEntry } from "@/lib/api/ceo.functions";

export function AssignProposalsToProject({
  entries,
  workers,
  workspaceId,
  onDone,
}: {
  entries: CeoProposalEntry[];
  workers: RoleWorkload[];
  workspaceId: string | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [progress, setProgress] = useState("");
  const [note, setNote] = useState("");

  const projectsFn = useServerFn(listProjects);
  const membersFn = useServerFn(listWorkspaceMembers);
  const setProjectFn = useServerFn(setTaskProject);
  const assignPersonFn = useServerFn(assignTask);
  const assignRoleFn = useServerFn(assignTasksToRole);
  const progressFn = useServerFn(updateTaskProgress);
  const commentFn = useServerFn(commentTask);

  const candidates = useMemo(
    () => entries.filter((e) => Boolean(e.taskId)),
    [entries],
  );

  const projects = useQuery({
    queryKey: ["ceo", "assign-projects", workspaceId ?? ""],
    queryFn: () => projectsFn({ data: { workspaceId: workspaceId!, limit: 100 } }),
    enabled: open && Boolean(workspaceId),
  });
  const members = useQuery({
    queryKey: ["ceo", "assign-members", workspaceId ?? ""],
    queryFn: () => membersFn({ data: { workspaceId: workspaceId! } }),
    enabled: open && Boolean(workspaceId),
  });

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = useMutation({
    mutationFn: async () => {
      if (!selected.length) throw new Error("Hãy chọn ít nhất một đề xuất.");
      if (!projectId) throw new Error("Hãy chọn dự án đích.");
      if (!assigneeId && !workerId) throw new Error("Hãy chọn nhân sự thật hoặc vai trò AI.");
      const pctRaw = progress.trim() === "" ? null : Number(progress);
      const pct =
        pctRaw !== null && Number.isFinite(pctRaw)
          ? Math.max(0, Math.min(100, Math.round(pctRaw)))
          : null;
      const projectName =
        projects.data?.find((p) => p.id === projectId)?.name ?? "dự án";
      const personName = assigneeId
        ? (members.data?.find((m) => m.userId === assigneeId)?.name ?? "nhân sự")
        : null;
      const workerName = workerId
        ? (workers.find((w) => w.workerId === workerId)?.name ?? "vai trò AI")
        : null;
      const who = [personName, workerName].filter(Boolean).join(" + ");

      const taskIds = candidates
        .filter((e) => selected.includes(e.id))
        .map((e) => e.taskId!)
        .filter((v, i, a) => a.indexOf(v) === i);

      for (const taskId of taskIds) {
        await setProjectFn({ data: { taskId, projectId } });
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
        const body = `[Command Center] Giao việc sang dự án ${projectName} cho ${who}.${
          pct !== null ? ` Tiến độ ghi nhận: ${pct}%.` : ""
        }${note.trim() ? ` Ghi chú: ${note.trim()}` : ""}`;
        await commentFn({ data: { taskId, body, idempotencyKey: crypto.randomUUID() } });
      }
      if (workerId && workspaceId && taskIds.length) {
        await assignRoleFn({
          data: { workspaceId, workerId, taskIds: taskIds.slice(0, 20) },
        });
      }
      return taskIds.length;
    },
    onSuccess: (count) => {
      toast.success(`Đã giao ${count} công việc sang dự án.`);
      setOpen(false);
      setSelected([]);
      setNote("");
      setProgress("");
      onDone();
      void qc.invalidateQueries({ queryKey: ["ceo"] });
      void qc.invalidateQueries({ queryKey: ["ai-brain"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message || "Không giao được việc."),
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="min-h-11 gap-1 px-3 text-xs"
        disabled={candidates.length === 0 || !workspaceId}
        onClick={() => setOpen(true)}
      >
        <Send className="h-3.5 w-3.5" /> Giao việc sang Dự án
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Giao việc sang Dự án</DialogTitle>
            <DialogDescription>
              Chọn đề xuất, đưa công việc vào dự án và gán nhân sự thật hoặc vai trò AI. Nhật ký và
              KPI tự cập nhật.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">Đề xuất ({selected.length} đã chọn)</p>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {candidates.map((e) => (
                  <label
                    key={e.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-2"
                  >
                    <Checkbox
                      checked={selected.includes(e.id)}
                      onCheckedChange={() => toggle(e.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {e.taskTitle ?? e.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {e.taskProgressPct ?? 0}%
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Dự án đích</span>
              <select
                value={projectId}
                onChange={(ev) => setProjectId(ev.target.value)}
                className="min-h-11 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">— Chọn dự án —</option>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Nhân sự thật</span>
                <select
                  value={assigneeId}
                  onChange={(ev) => setAssigneeId(ev.target.value)}
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
                  onChange={(ev) => setWorkerId(ev.target.value)}
                  className="min-h-11 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="">— Không chọn —</option>
                  {workers.map((w) => (
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
                onChange={(ev) => setProgress(ev.target.value)}
                placeholder="Bỏ trống nếu giữ nguyên"
                className="min-h-11"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Ghi chú giao việc</span>
              <Textarea
                value={note}
                onChange={(ev) => setNote(ev.target.value)}
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
