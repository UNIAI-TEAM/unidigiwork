import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  announceTaskStatusInRoom,
  ensureTaskChatChannel,
  listTaskChatMessages,
  sendChatMessage,
} from "@/lib/api/chat.functions";
import { transitionTask } from "@/lib/api/tasks.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      void navigate({ to: "/chat/$channelId", params: { channelId: res.channelId } });
    },
    onError: () => toast.error(t("m.tasks.room.error")),
  });

  // Đổi trạng thái công việc và tự đăng thông báo vào phòng chat.
  const announceFn = useServerFn(announceTaskStatusInRoom);
  const progress = useMutation({
    mutationFn: async (status: "todo" | "in_progress" | "blocked" | "done" | "canceled") => {
      await transitionTask({
        data: { taskId, toStatus: status, idempotencyKey: crypto.randomUUID() },
      });
      await announceFn({ data: { taskId, status } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["task-room-chat", taskId] });
      void queryClient.invalidateQueries({ queryKey: ["task-detail", taskId] });
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      toast.success(t("m.tasks.room.progressDone"));
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : t("m.tasks.room.error")),
  });

  const [draft, setDraft] = useState("");
  const sendFn = useServerFn(sendChatMessage);
  const channelId = room.data?.channelId ?? null;

  const send = useMutation({
    mutationFn: async (body: string) => {
      const id = channelId ?? (await ensureFn({ data: { taskId } })).channelId;
      await sendFn({ data: { channelId: id, body } });
    },
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["task-room-chat", taskId] });
      void queryClient.invalidateQueries({ queryKey: ["mobile-chat-channels"] });
    },
    onError: () => toast.error(t("m.tasks.room.error")),
  });

  // Đồng bộ tức thì giữa web và điện thoại trong cùng phòng công việc.
  useEffect(() => {
    if (!channelId) return;
    const channel = supabase
      .channel(`task-room-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["task-room-chat", taskId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, queryClient, taskId]);

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

      <div className="mt-3">
        <Select
          disabled={progress.isPending}
          onValueChange={(value) =>
            progress.mutate(value as "todo" | "in_progress" | "blocked" | "done" | "canceled")
          }
        >
          <SelectTrigger className="min-h-11" aria-label={t("m.tasks.room.progress")}>
            <SelectValue placeholder={t("m.tasks.room.progress")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todo">{t("m.tasks.status.todo")}</SelectItem>
            <SelectItem value="in_progress">{t("m.tasks.status.in_progress")}</SelectItem>
            <SelectItem value="blocked">{t("m.tasks.status.blocked")}</SelectItem>
            <SelectItem value="done">{t("m.tasks.status.done")}</SelectItem>
            <SelectItem value="canceled">{t("m.tasks.status.canceled")}</SelectItem>
          </SelectContent>
        </Select>
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

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (draft.trim() && !send.isPending) send.mutate(draft.trim());
            }
          }}
          rows={2}
          placeholder={t("m.chat.placeholder")}
          aria-label={t("m.chat.placeholder")}
          className="min-h-11 resize-none rounded-xl"
        />
        <Button
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl"
          aria-label={t("m.chat.send")}
          disabled={send.isPending || !draft.trim()}
          onClick={() => send.mutate(draft.trim())}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
