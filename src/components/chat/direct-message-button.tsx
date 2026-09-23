import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { openDirectMessage } from "@/lib/api/chat.functions";
import { useI18n } from "@/lib/i18n";

/**
 * Nút "Nhắn riêng": mở (hoặc tạo) cuộc trò chuyện 1-1 với một người,
 * rồi điều hướng tới phòng chat dùng chung cho desktop và mobile.
 * Dùng span role="button" để nhúng an toàn trong hàng danh sách là <button>.
 */
export function DirectMessageButton({
  userId,
  personName,
  className,
}: {
  userId: string;
  personName?: string | null;
  className?: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const openDm = useServerFn(openDirectMessage);

  const open = useMutation({
    mutationFn: async () => (await openDm({ data: { userId } })).id,
    onSuccess: (channelId) => void navigate({ to: "/chat/$channelId", params: { channelId } }),
    onError: (err) => toast.error(err instanceof Error ? err.message : t("m.chat.dmError")),
  });

  const label = personName ? `${t("m.chat.newDm")} · ${personName}` : t("m.chat.newDm");

  return (
    <span
      role="button"
      tabIndex={0}
      data-row-action=""
      aria-label={label}
      title={label}
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
      <Send className="h-4 w-4" />
    </span>
  );
}
