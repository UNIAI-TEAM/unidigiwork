import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ensureTaskChatChannel,
  listTaskChatMessages,
  sendChatMessage,
} from "@/lib/api/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

/**
 * Cầu nối phòng trò chuyện ↔ dòng thời gian công việc.
 * Chỉ đọc tin nhắn theo RLS, không ghi trùng nguồn dữ liệu.
 */
export function TaskRoomChatCard({ taskId }: { taskId: string }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listTaskChatMessages);
  const ensureFn = useServerFn(ensureTaskChatChannel);

  const room = useQuery({
    queryKey: ["task-room-chat", taskId],
    queryFn: () => listFn({ data: { taskId, limit: 20 } }),
    refetchInterval: 15_000,
  });

  const open = useMutation({
    mutationFn: () => ensureFn({ data: { taskId } }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["task-room-chat", taskId] });
      void queryClient.invalidateQueries({ queryKey: ["mobile-chat-channels"] });
      void navigate({ to: "/m/chat/$id", params: { id: res.channelId } });
    },
    onError: () => toast.error(t("m.tasks.room.error")),
  });

  const messages = room.data?.messages ?? [];
  const localeTag = lang === "vi" ? "vi-VN" : "en-US";

  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="h-4 w-4" />
          {t("m.tasks.room.title")}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={open.isPending}
          onClick={() => open.mutate()}
        >
          {room.data?.channelId ? t("m.tasks.room.open") : t("m.tasks.room.create")}
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {room.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("m.ai.chat.loading")}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("m.tasks.room.empty")}</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="rounded-xl bg-surface-2 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {message.isAi ? <Sparkles className="h-3 w-3" /> : null}
                <span className="font-medium text-foreground">{message.authorName}</span>
                <span>·</span>
                <span>
                  {new Date(message.createdAt).toLocaleString(localeTag, {
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.body}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
