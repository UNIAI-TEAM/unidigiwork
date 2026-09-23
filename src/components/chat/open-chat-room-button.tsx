import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ensureMeetingChatChannel, ensureTaskChatChannel } from "@/lib/api/chat.functions";
import { useI18n } from "@/lib/i18n";

/**
 * Nút mở (hoặc tạo) phòng chat gắn với một công việc hoặc cuộc họp.
 * Dùng span role="button" để nhúng an toàn trong các mục danh sách là <button>.
 */
export function OpenChatRoomButton({
  kind,
  entityId,
  className,
}: {
  kind: "task" | "meeting";
  entityId: string;
  className?: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const ensureTask = useServerFn(ensureTaskChatChannel);
  const ensureMeeting = useServerFn(ensureMeetingChatChannel);

  const open = useMutation({
    mutationFn: async () =>
      kind === "task"
        ? (await ensureTask({ data: { taskId: entityId } })).channelId
        : (await ensureMeeting({ data: { meetingId: entityId } })).channelId,
    onSuccess: (channelId) => void navigate({ to: "/chat/$channelId", params: { channelId } }),
    onError: () => toast.error(t("m.tasks.room.error")),
  });

  return (
    <span
      role="button"
      tabIndex={0}
      data-row-action=""
      aria-label={t("m.tasks.room.open")}
      title={t("m.tasks.room.open")}
      aria-disabled={open.isPending}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-surface hover:text-foreground",
        open.isPending && "opacity-60",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        if (!open.isPending) open.mutate();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.stopPropagation();
          event.preventDefault();
          if (!open.isPending) open.mutate();
        }
      }}
    >
      <MessageSquare className="h-4 w-4" />
    </span>
  );
}
