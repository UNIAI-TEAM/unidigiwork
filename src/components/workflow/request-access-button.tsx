import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { requestWorkflowAccess } from "@/lib/api/workflows.functions";
import { toastWorkflowError, type WorkflowAction } from "@/lib/workflow-access";

const ACTION_LABEL: Record<WorkflowAction, string> = {
  edit: "chỉnh sửa",
  publish: "phát hành",
  run: "chạy",
};

interface Props {
  workspaceId: string | null | undefined;
  action: WorkflowAction;
  workflowId?: string | null;
  className?: string;
}

/** Nút "Xin quyền" gửi yêu cầu tới quản trị không gian làm việc. */
export function RequestAccessButton({ workspaceId, action, workflowId, className }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: () =>
      requestWorkflowAccess({
        data: {
          workspaceId: workspaceId!,
          action,
          workflowId: workflowId ?? null,
          message: message.trim() || null,
        },
      }),
    onSuccess: async () => {
      setOpen(false);
      setMessage("");
      // Đồng bộ lại danh sách yêu cầu/quyền từ API thay vì chỉ báo toast.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workflow-access-requests", workspaceId] }),
        qc.invalidateQueries({ queryKey: ["workflow-my-perms", workspaceId] }),
        qc.invalidateQueries({ queryKey: ["workflow-permissions", workspaceId] }),
      ]);
      toast.success("Đã gửi yêu cầu cấp quyền", {
        description: "Quản trị không gian làm việc sẽ xem xét yêu cầu của bạn.",
      });
    },
    onError: (e) => toastWorkflowError(e, "Không gửi được yêu cầu", { workspaceId, workflowId }),
  });

  if (!workspaceId) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-foreground hover:bg-surface-2"
        }
      >
        <KeyRound className="h-3.5 w-3.5" /> Xin quyền
      </button>
    );
  }

  return (
    <div className="w-full max-w-md space-y-2 rounded-lg border border-border bg-surface p-3">
      <p className="text-xs font-medium text-foreground">
        Yêu cầu quyền {ACTION_LABEL[action]} quy trình
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Lý do cần quyền (không bắt buộc)"
        className="w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => send.mutate()}
          disabled={send.isPending}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          Gửi yêu cầu
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs hover:bg-surface-2"
        >
          Huỷ
        </button>
      </div>
    </div>
  );
}
