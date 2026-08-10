// Lịch sử phiên bản của một tin nhắn AI + chỉnh sửa nội dung.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listAiMessageVersions, updateAiMessage } from "@/lib/api/ai-chat.functions";

export function MessageHistoryDialog({
  messageId,
  conversationId,
  initialContent,
  editable,
  onOpenChange,
}: {
  messageId: string | null;
  conversationId: string | null;
  initialContent: string;
  editable: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAiMessageVersions);
  const updateFn = useServerFn(updateAiMessage);
  const [draft, setDraft] = useState(initialContent);

  useEffect(() => setDraft(initialContent), [initialContent, messageId]);

  const versions = useQuery({
    queryKey: ["ai-message-versions", messageId],
    queryFn: () => listFn({ data: { messageId: messageId as string } }),
    enabled: !!messageId,
  });

  const save = useMutation({
    mutationFn: () => updateFn({ data: { messageId: messageId as string, content: draft.trim() } }),
    onSuccess: async () => {
      toast.success("Đã lưu phiên bản mới của tin nhắn");
      await qc.invalidateQueries({ queryKey: ["ai-messages", conversationId] });
      await qc.invalidateQueries({ queryKey: ["ai-message-versions", messageId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Không cập nhật được tin nhắn"),
  });

  return (
    <Dialog open={!!messageId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Lịch sử phiên bản tin nhắn
          </DialogTitle>
          <DialogDescription>
            Mỗi lần chỉnh sửa nội dung, phiên bản trước đó được lưu lại để đối chiếu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Nội dung hiện tại</label>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={!editable}
              rows={4}
              className="w-full rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            {editable && (
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending || !draft.trim() || draft.trim() === initialContent}
                className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Lưu chỉnh sửa
              </button>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Phiên bản trước</div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {versions.isLoading && (
                <p className="text-xs text-muted-foreground">Đang tải lịch sử…</p>
              )}
              {!versions.isLoading && (versions.data?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground">Tin nhắn này chưa từng được chỉnh sửa.</p>
              )}
              {versions.data?.map((v) => (
                <div key={v.id} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Phiên bản {v.version}</span>
                    <span>{new Date(v.createdAt).toLocaleString("vi-VN")}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-xs">{v.content}</p>
                  {editable && (
                    <button
                      onClick={() => setDraft(v.content)}
                      className="mt-2 text-[11px] text-primary hover:underline"
                    >
                      Khôi phục nội dung này
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
