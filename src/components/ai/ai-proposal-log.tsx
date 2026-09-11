// Nhật ký đề xuất AI: lịch sử đề xuất, vai trò được giao và công việc đã xử lý.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getProposalLog } from "@/lib/api/ai-brain.functions";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";

const STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Chờ duyệt",
  CONFIRMED: "Đã duyệt",
  SUCCEEDED: "Đã xử lý",
  FAILED: "Lỗi",
  DISMISSED: "Đã bỏ qua",
  EXPIRED: "Hết hạn",
};

export function AiProposalLog() {
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const wsId = workspaceId ?? workspaces?.[0]?.id ?? "";
  const logFn = useServerFn(getProposalLog);

  const log = useQuery({
    queryKey: ["ai-brain", "proposal-log", wsId],
    queryFn: () => logFn({ data: { workspaceId: wsId, limit: 40 } }),
    enabled: !!wsId,
  });

  const items = log.data ?? [];

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Nhật ký đề xuất</h2>
        <span className="text-xs text-muted-foreground">{items.length} bản ghi gần nhất</span>
      </div>

      {log.isLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải nhật ký...
        </div>
      )}
      {!log.isLoading && items.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Chưa có đề xuất nào được ghi nhận.</p>
      )}

      <ul className="mt-4 space-y-2">
        {items.map((it) => (
          <li key={it.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{it.actionType}</Badge>
              <Badge variant="outline">{STATUS_LABEL[it.status] ?? it.status}</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(it.createdAt).toLocaleString("vi-VN")}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-medium">{it.title}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Nguồn: {it.source}</span>
              {it.workerName && <span>Vai trò: {it.workerName}</span>}
              {it.executedAt && (
                <span>Xử lý: {new Date(it.executedAt).toLocaleString("vi-VN")}</span>
              )}
            </div>
            {it.taskTitle && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Công việc: {it.taskTitle}
                {it.taskStatus ? ` · ${it.taskStatus}` : ""}
                {it.taskProgress !== null ? ` · ${it.taskProgress}%` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
