// Giao việc theo vai trò AI ngay trong Bộ não AI — trình bày; logic ở ai-brain.functions.ts.
// Đề xuất xử lý việc ì ạch đi qua lớp hành động AI (propose → duyệt), AI không tự thực thi.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  assignTasksToRole,
  getRoleWorkload,
  listUnassignedTasksForRoles,
} from "@/lib/api/ai-brain.functions";
import { proposeAiAction } from "@/lib/api/ai-actions.functions";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";

export function AiBrainRoles() {
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const wsId = workspaceId ?? workspaces?.[0]?.id ?? "";
  const qc = useQueryClient();

  const workloadFn = useServerFn(getRoleWorkload);
  const tasksFn = useServerFn(listUnassignedTasksForRoles);
  const assignFn = useServerFn(assignTasksToRole);
  const proposeFn = useServerFn(proposeAiAction);

  const [openRole, setOpenRole] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const workload = useQuery({
    queryKey: ["ai-brain", "roles", wsId],
    queryFn: () => workloadFn({ data: { workspaceId: wsId } }),
    enabled: !!wsId,
  });

  const unassigned = useQuery({
    queryKey: ["ai-brain", "roles", "unassigned", wsId],
    queryFn: () => tasksFn({ data: { workspaceId: wsId } }),
    enabled: !!wsId && !!openRole,
  });

  const assign = useMutation({
    mutationFn: (workerId: string) =>
      assignFn({ data: { workspaceId: wsId, workerId, taskIds: selected } }),
    onSuccess: (r) => {
      toast.success(`Đã giao ${r.assigned} công việc cho vai trò này.`);
      setSelected([]);
      setOpenRole(null);
      void qc.invalidateQueries({ queryKey: ["ai-brain"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không giao được công việc"),
  });

  const proposeFix = useMutation({
    mutationFn: (input: { taskId: string; title: string; reason: string }) =>
      proposeFn({
        data: {
          query: `Cập nhật công việc "${input.title}": ${input.reason}. Hãy đề xuất hạn mới và ghi chú xử lý để đưa việc trở lại đúng tiến độ.`,
          actionType: "UPDATE_TASK_FIELDS",
          workspaceId: wsId || null,
          targetTaskId: input.taskId,
        },
      }),
    onSuccess: () => {
      toast.success("Đã tạo đề xuất xử lý, chờ bạn duyệt.");
      void qc.invalidateQueries({ queryKey: ["ai-brain"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không tạo được đề xuất"),
  });

  const roles = (workload.data ?? []).filter((r) => r.status !== "INACTIVE");

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Giao việc theo vai trò</h2>
        <span className="text-xs text-muted-foreground">{roles.length} vai trò AI</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Tiến độ được đồng bộ từ công việc thật. Việc quá hạn hoặc lâu không cập nhật sẽ được đề xuất
        xử lý và chờ bạn duyệt.
      </p>

      {workload.isLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải vai trò...
        </div>
      )}
      {!workload.isLoading && roles.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Chưa có vai trò AI nào. Hãy thêm nhân sự AI trước.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {roles.map((r) => (
          <li key={r.workerId} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.role}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {r.done}/{r.total} xong
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    setSelected([]);
                    setOpenRole(openRole === r.workerId ? null : r.workerId);
                  }}
                >
                  <UserPlus className="mr-1.5 h-4 w-4" /> Giao việc
                </Button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Progress value={r.avgProgress} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground">{r.avgProgress}%</span>
            </div>

            {r.stalled.length > 0 && (
              <ul className="mt-3 space-y-2">
                {r.stalled.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                      <span className="min-w-0 truncate">{t.title}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.reason} · {t.progressPct}%
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={proposeFix.isPending}
                      onClick={() =>
                        proposeFix.mutate({ taskId: t.id, title: t.title, reason: t.reason })
                      }
                    >
                      Đề xuất xử lý
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {openRole === r.workerId && (
              <div className="mt-3 rounded-lg border border-dashed border-border p-3">
                {unassigned.isLoading && (
                  <p className="text-sm text-muted-foreground">Đang tải công việc...</p>
                )}
                {!unassigned.isLoading && (unassigned.data ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Không còn việc chưa giao.</p>
                )}
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {(unassigned.data ?? []).map((t) => (
                    <li key={t.id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-surface-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selected.includes(t.id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked
                                ? [...prev, t.id].slice(0, 20)
                                : prev.filter((x) => x !== t.id),
                            )
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        {t.due_at && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {new Date(t.due_at).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  className="mt-2 min-h-11 w-full"
                  disabled={selected.length === 0 || assign.isPending}
                  onClick={() => assign.mutate(r.workerId)}
                >
                  {assign.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Giao {selected.length} việc cho {r.name}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
