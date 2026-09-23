// Panel trò chuyện thật trong nút dấu cộng: kênh theo tổ chức đang hoạt động, lịch sử và gửi tin.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUp,
  ChevronLeft,
  Hash,
  Loader2,
  Lock,
  MessageSquare,
  Sparkles,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  listChatChannels,
  listChatMessages,
  sendChatMessage,
  joinChatChannel,
  markChatChannelRead,
  type ChatChannelDTO,
} from "@/lib/api/chat.functions";
import { askChatAi } from "@/lib/api/chat-ai.functions";
import { useI18n } from "@/lib/i18n";

export function TeamChatPanel({
  channelId,
  onOpenChannel,
  onBack,
}: {
  channelId: string | null;
  onOpenChannel: (channel: ChatChannelDTO) => void;
  onBack: () => void;
}) {
  if (!channelId) return <ChannelList onOpenChannel={onOpenChannel} />;
  return <ChannelRoom channelId={channelId} onBack={onBack} />;
}

/** Phòng trò chuyện dùng chung cho panel dấu cộng và các màn /m/chat, /m/meet. */
export function ChatRoomView({ channelId }: { channelId: string }) {
  return <ChannelRoom channelId={channelId} />;
}

function ChannelList({ onOpenChannel }: { onOpenChannel: (channel: ChatChannelDTO) => void }) {
  const { t, lang } = useI18n();
  const listFn = useServerFn(listChatChannels);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["mobile-plus-chat-channels"],
    queryFn: () => listFn(),
    staleTime: 15_000,
  });

  if (isLoading) {
    return <PanelHint>{t("m.ai.chat.loading")}</PanelHint>;
  }
  if (isError) {
    return <PanelHint>{t("m.ai.chat.error")}</PanelHint>;
  }
  const channels = data?.channels ?? [];
  if (channels.length === 0) {
    return <PanelHint>{t("m.ai.chat.emptyChannels")}</PanelHint>;
  }

  return (
    <div className="grid gap-1">
      {channels.map((channel) => (
        <Button
          key={channel.id}
          variant="ghost"
          className="h-auto min-h-14 justify-start gap-3 whitespace-normal rounded-xl px-3 text-left"
          onClick={() => onOpenChannel(channel)}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-foreground">
            {channel.kind === "dm" ? (
              <User className="h-4 w-4" />
            ) : channel.isPrivate ? (
              <Lock className="h-4 w-4" />
            ) : (
              <Hash className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{channel.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {channel.lastMessageAt
                ? new Date(channel.lastMessageAt).toLocaleString(lang === "vi" ? "vi-VN" : "en-US")
                : t("m.ai.chat.noMessages")}
            </span>
          </span>
          {channel.unread > 0 ? (
            <span className="ml-auto shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
              {channel.unread}
            </span>
          ) : null}
        </Button>
      ))}
    </div>
  );
}

function ChannelRoom({ channelId, onBack }: { channelId: string; onBack?: () => void }) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const messagesFn = useServerFn(listChatMessages);
  const sendFn = useServerFn(sendChatMessage);
  const joinFn = useServerFn(joinChatChannel);
  const markReadFn = useServerFn(markChatChannelRead);
  const askAiFn = useServerFn(askChatAi);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<{ id: string; body: string; createdAt: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  const history = useQuery({
    queryKey: ["mobile-plus-chat-messages", channelId],
    queryFn: () => messagesFn({ data: { channelId, limit: 50 } }),
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
  });

  const serverMessages = useMemo(() => history.data?.messages ?? [], [history.data]);
  // Tin đang gửi hiển thị ngay, gỡ khi server đã trả về cùng nội dung.
  const messages = useMemo(() => {
    const serverBodies = new Set(serverMessages.filter((m) => m.isMine).map((m) => m.body));
    const optimistic = pending
      .filter((p) => !serverBodies.has(p.body))
      .map((p) => ({
        id: p.id,
        body: p.body,
        createdAt: p.createdAt,
        isMine: true,
        isAi: false,
        authorName: "",
        optimistic: true as const,
      }));
    return [...serverMessages.map((m) => ({ ...m, optimistic: false as const })), ...optimistic];
  }, [serverMessages, pending]);

  useEffect(() => {
    if (pending.length === 0) return;
    const serverBodies = new Set(serverMessages.filter((m) => m.isMine).map((m) => m.body));
    setPending((current) => current.filter((p) => !serverBodies.has(p.body)));
  }, [serverMessages, pending.length]);

  useEffect(() => {
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    void markReadFn({ data: { channelId } }).catch(() => undefined);
  }, [channelId, markReadFn]);

  const send = useMutation({
    mutationFn: async (input: { id: string; text: string }) => {
      try {
        return await sendFn({ data: { channelId, body: input.text } });
      } catch (error) {
        // Chưa là thành viên kênh công khai → tham gia rồi gửi lại.
        await joinFn({ data: { channelId } });
        return await sendFn({ data: { channelId, body: input.text } });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mobile-plus-chat-messages", channelId] });
      void queryClient.invalidateQueries({ queryKey: ["mobile-plus-chat-channels"] });
    },
    onError: (_error, input) => {
      setPending((current) => current.filter((p) => p.id !== input.id));
      setBody((current) => current || input.text);
      toast.error(t("m.ai.chat.sendFailed"));
    },
  });

  const askAi = useMutation({
    mutationFn: async (question: string) => askAiFn({ data: { channelId, question } }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["mobile-plus-chat-messages", channelId] });
      void queryClient.invalidateQueries({ queryKey: ["mobile-plus-chat-channels"] });
    },
    onError: () => toast.error(t("m.ai.chat.aiFailed")),
  });

  const busy = askAi.isPending;

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    const id = `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setBody("");
    stickToBottom.current = true;
    setPending((current) => [...current, { id, body: text, createdAt: new Date().toISOString() }]);
    send.mutate({ id, text });
  };

  const submitAi = () => {
    const text = body.trim();
    if (!text || busy) return;
    setBody("");
    stickToBottom.current = true;
    askAi.mutate(text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {onBack ? (
        <Button
          variant="ghost"
          className="mb-2 h-11 w-fit justify-start gap-2 px-2 text-sm"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
          {t("m.ai.chat.back")}
        </Button>
      ) : null}

      <div
        ref={listRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2"
      >
        {history.isLoading && messages.length === 0 ? (
          <PanelHint>{t("m.ai.chat.loading")}</PanelHint>
        ) : messages.length === 0 ? (
          <PanelHint>{t("m.ai.chat.noMessages")}</PanelHint>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                (message.optimistic ? "opacity-60 " : "") +
                (message.isAi
                  ? "mr-auto max-w-[92%] rounded-2xl rounded-bl-md border border-primary/30 bg-primary/5 px-3 py-2"
                  : message.isMine
                    ? "ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-secondary px-3 py-2 text-secondary-foreground"
                    : "mr-auto max-w-[86%] rounded-2xl rounded-bl-md border border-border bg-surface px-3 py-2")
              }
            >
              {message.isAi ? (
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("m.ai.chat.aiLabel")}
                </p>
              ) : !message.isMine ? (
                <p className="text-xs font-medium text-muted-foreground">{message.authorName}</p>
              ) : null}
              <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {new Date(message.createdAt).toLocaleTimeString(lang === "vi" ? "vi-VN" : "en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ))
        )}
        {askAi.isPending ? (
          <p className="mr-auto flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("m.ai.chat.aiThinking")}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border pt-2">
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          disabled={!body.trim() || busy}
          onClick={submitAi}
          aria-label={t("m.ai.chat.askAi")}
          title={t("m.ai.chat.askAi")}
        >
          {askAi.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
        </Button>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={1}
          aria-label={t("m.ai.chat.placeholder")}
          placeholder={t("m.ai.chat.placeholder")}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-surface px-3 py-3 text-sm outline-none"
        />
        <Button
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          disabled={!body.trim()}
          onClick={submit}
          aria-label={t("m.ai.chat.send")}
        >
          <ArrowUp className="h-5 w-5" />
          {pending.length > 0 ? <span className="sr-only">{t("m.ai.chat.loading")}</span> : null}
        </Button>
      </div>
    </div>
  );
}

function PanelHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
      <MessageSquare className="h-4 w-4" />
      {children}
    </p>
  );
}
