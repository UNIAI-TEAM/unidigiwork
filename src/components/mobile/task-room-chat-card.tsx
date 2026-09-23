import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare, Send, Share2, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  announceTaskStatusInRoom,
  ensureTaskChatChannel,
  listDirectMessagesWith,
  listTaskChatMessages,
  listTaskDirectConversations,
  openDirectMessage,
  sendChatMessage,
  shareDirectMessageToTask,
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
            <div
              key={message.id}
              role="button"
              tabIndex={0}
              title={t("m.tasks.room.open")}
              onClick={() => open.mutate()}
              onKeyDown={(event) => {
                if (event.key === "Enter") open.mutate();
              }}
              className="cursor-pointer rounded-xl bg-surface-2 px-3 py-2 transition-colors hover:bg-surface"
            >
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

      <TaskDirectConversations taskId={taskId} />
    </section>
  );
}

/** Trò chuyện 1-1 gắn với công việc: chỉ hiện DM mà chính tôi tham gia. */
function TaskDirectConversations({ taskId }: { taskId: string }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const listFn = useServerFn(listTaskDirectConversations);
  const openDm = useServerFn(openDirectMessage);
  const localeTag = lang === "vi" ? "vi-VN" : "en-US";

  const dms = useQuery({
    queryKey: ["task-direct-conversations", taskId],
    queryFn: () => listFn({ data: { taskId } }),
    staleTime: 15_000,
  });

  const open = useMutation({
    mutationFn: (userId: string) => openDm({ data: { userId } }),
    onSuccess: (res) => {
      const id = (res as { id?: string } | null)?.id;
      if (id) void navigate({ to: "/chat/$channelId", params: { channelId: id } });
    },
    onError: () => toast.error(t("m.chat.dmError")),
  });

  const people = dms.data?.people ?? [];
  if (people.length === 0) return null;

  return (
    <div className="mt-4 border-t pt-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <UserRound className="h-4 w-4" />
        {t("m.tasks.room.dmTitle")}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("m.tasks.room.dmPrivacy")}</p>
      <ul className="mt-2 space-y-1">
        {people.map((p) => (
          <li key={p.userId} className="rounded-xl hover:bg-surface-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={open.isPending}
                onClick={() => open.mutate(p.userId)}
                className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.preview ?? t("m.tasks.room.dmStart")}
                  </p>
                </div>
                {p.lastMessageAt ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(p.lastMessageAt).toLocaleString(localeTag, {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                ) : null}
              </button>
              {p.channelId ? (
                <ShareDirectMessageDialog
                  taskId={taskId}
                  channelId={p.channelId}
                  personName={p.name}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Chọn một tin nhắn riêng để đưa vào dòng thời gian công việc (người trong việc đều thấy). */
function ShareDirectMessageDialog({
  taskId,
  channelId,
  personName,
}: {
  taskId: string;
  channelId: string;
  personName: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const listFn = useServerFn(listDirectMessagesWith);
  const shareFn = useServerFn(shareDirectMessageToTask);

  const messages = useQuery({
    queryKey: ["dm-messages", channelId],
    queryFn: () => listFn({ data: { channelId } }),
    enabled: open,
    staleTime: 10_000,
  });

  const share = useMutation({
    mutationFn: (messageId: string) => shareFn({ data: { taskId, messageId } }),
    onSuccess: () => {
      toast.success(t("m.tasks.room.dmShared"));
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["task-room-chat", taskId] });
      void queryClient.invalidateQueries({ queryKey: ["task-direct-conversations", taskId] });
    },
    onError: () => toast.error(t("m.tasks.room.dmShareError")),
  });

  const rows = messages.data?.messages ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="mr-1 h-11 w-11 shrink-0"
          aria-label={t("m.tasks.room.dmShare")}
          title={t("m.tasks.room.dmShare")}
        >
          <Share2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t("m.tasks.room.dmShare")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {`${t("m.tasks.room.dmShareHint")} ${personName}`}
        </p>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {rows.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={share.isPending}
              onClick={() => share.mutate(m.id)}
              className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-2"
            >
              <p className="text-xs text-muted-foreground">{m.authorName}</p>
              <p className="mt-0.5 line-clamp-3 break-words text-sm">{m.body}</p>
            </button>
          ))}
          {rows.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t("m.tasks.room.empty")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
