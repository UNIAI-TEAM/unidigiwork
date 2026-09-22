import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  Link2,
  Loader2,
  MessageSquare,
  Search,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { getTaskConversations, sendAiMessage } from "@/lib/api/ai-chat.functions";
import {
  getTaskDetail,
  listTaskMessageRecipients,
  sendTaskMessage,
} from "@/lib/api/tasks.functions";
import { getWorkContext, listWorkGraphBoard } from "@/lib/api/work-graph.functions";
import { localeTag, useI18n } from "@/lib/i18n";
import { CollapsibleChatContent } from "@/components/mobile/collapsible-chat-content";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentIdentity } from "@/lib/use-current-identity";

export function TaskChatHub() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);
  const board = useQuery({
    queryKey: ["task-chat-hub", query],
    queryFn: () =>
      listWorkGraphBoard({ data: { tab: "all", search: query, page: 1, pageSize: 100 } }),
  });
  if (selected) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3 sm:px-6">
        <Button variant="ghost" className="mb-2 min-h-11 px-2" onClick={() => setSelected(null)}>
          <ArrowLeft className="h-4 w-4" /> {t("m.taskChat.back")}
        </Button>
        <TaskChatSummary taskId={selected.id} taskTitle={selected.title} />
      </div>
    );
  }
  const tasks = (board.data?.items ?? []).filter((item) => item.type === "TASK");
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3 sm:px-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("m.taskChat.search")}
          className="h-11 pl-9 text-base"
        />
      </div>
      {board.isLoading ? (
        <div className="flex min-h-48 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : tasks.length ? (
        <div className="mt-3 grid gap-2">
          {tasks.map((task) => (
            <button
              key={task.id}
              className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-left"
              onClick={() => setSelected({ id: task.id, title: task.title })}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary">
                <MessageSquare className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-sm font-semibold">{task.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("m.taskChat.openSummary")}
                </span>
              </span>
              {task.status ? <Badge variant="outline">{task.status}</Badge> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">{t("m.taskChat.empty")}</p>
      )}
    </div>
  );
}

export function TaskChatSummary({ taskId, taskTitle }: { taskId: string; taskTitle?: string }) {
  const { t, lang } = useI18n();
  const identity = useCurrentIdentity();
  const queryClient = useQueryClient();
  const chatFn = useServerFn(getTaskConversations);
  const detailFn = useServerFn(getTaskDetail);
  const graphFn = useServerFn(getWorkContext);
  const sendAiFn = useServerFn(sendAiMessage);
  const recipientsFn = useServerFn(listTaskMessageRecipients);
  const sendTeamFn = useServerFn(sendTaskMessage);
  const [draft, setDraft] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const chats = useQuery({
    queryKey: ["task-conversations", taskId],
    queryFn: () => chatFn({ data: { taskId } }),
  });
  const detail = useQuery({
    queryKey: ["task-chat-detail", taskId],
    queryFn: () => detailFn({ data: { taskId } }),
  });
  const graph = useQuery({
    queryKey: ["task-chat-graph", taskId],
    queryFn: () => graphFn({ data: { entityType: "TASK", entityId: taskId, limit: 30 } }),
  });
  const recipients = useQuery({
    queryKey: ["task-message-recipients", taskId],
    queryFn: () => recipientsFn({ data: { taskId } }),
  });
  const title = taskTitle ?? detail.data?.task?.title ?? t("m.taskChat.task");
  const comments = detail.data?.comments ?? [];
  const related = graph.data?.relationships ?? [];
  const loading = chats.isLoading || detail.isLoading || graph.isLoading;
  const latestConversation = chats.data?.[0] ?? null;

  const sendTeam = useMutation({
    mutationFn: ({ body, recipientId }: { body: string; recipientId: string }) =>
      sendTeamFn({
        data: { taskId, recipientId, body, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["task-chat-detail", taskId] });
      await queryClient.invalidateQueries({ queryKey: ["m-task-detail", taskId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("m.taskChat.sendError")),
  });

  const sendAi = useMutation({
    mutationFn: (text: string) =>
      sendAiFn({
        data: {
          text,
          ...(latestConversation ? { conversationId: latestConversation.id } : {}),
          rootEntity: { type: "TASK", id: taskId },
          contextEntities: [{ type: "TASK", id: taskId, label: title }],
          metadata: { contextLabels: [title] },
        },
      }),
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["task-conversations", taskId] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-ai-conversations"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("m.taskChat.sendError")),
  });

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {t("m.taskChat.title")}
          </p>
          <h2 className="mt-1 break-words text-lg font-semibold">{title}</h2>
        </div>
        <Button asChild variant="outline" className="min-h-11 shrink-0 px-3">
          <Link to="/work-graph" search={{ task: taskId }}>
            <ExternalLink className="h-4 w-4" /> {t("m.taskChat.graph")}
          </Link>
        </Button>
      </div>
      {loading ? (
        <div className="flex min-h-36 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          <Tabs defaultValue="team" className="min-w-0">
            <TabsList className="grid h-11 w-full grid-cols-2">
              <TabsTrigger value="team" className="min-h-9 gap-2">
                <Users className="h-4 w-4" /> {t("m.taskChat.team")}
              </TabsTrigger>
              <TabsTrigger value="ai" className="min-h-9 gap-2">
                <Bot className="h-4 w-4" /> {t("m.taskChat.askAi")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="team" className="mt-3 min-w-0">
              <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-border bg-background p-3">
                {comments.length ? (
                  comments.map((comment: any) => (
                    <Message
                      key={comment.id}
                      from={comment.author_id === identity.userId ? "user" : "assistant"}
                    >
                      <MessageContent className="max-w-[92%]">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {comment.author_name ?? t("m.taskChat.member")}
                          </span>
                          <span>
                            {new Date(comment.created_at).toLocaleString(localeTag(lang), {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap break-words leading-6">{comment.body}</p>
                      </MessageContent>
                    </Message>
                  ))
                ) : (
                  <Empty text={t("m.taskChat.noTeamMessages")} />
                )}
              </div>
              <TaskMessageComposer
                value={draft}
                onChange={setDraft}
                onSubmit={(text) => {
                  if (recipientId) sendTeam.mutate({ body: text, recipientId });
                }}
                pending={sendTeam.isPending}
                placeholder={t("m.taskChat.teamPlaceholder")}
                sendLabel={t("m.taskChat.sendTeam")}
                recipients={recipients.data ?? []}
                recipientId={recipientId}
                onRecipientChange={setRecipientId}
                recipientPlaceholder={t("m.taskChat.selectRecipient")}
                noRecipientsLabel={t("m.taskChat.noRecipients")}
                recipientsLoading={recipients.isLoading}
              />
            </TabsContent>
            <TabsContent value="ai" className="mt-3 min-w-0">
              <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-border bg-background p-3">
                {latestConversation?.messages.length ? (
                  latestConversation.messages.map((message) => (
                    <Message key={message.id} from={message.role}>
                      <MessageContent className="max-w-[92%]">
                        {message.role === "assistant" ? (
                          <MessageResponse className="text-sm leading-6 [&_h2]:my-2 [&_h2]:text-xs [&_h2]:uppercase [&_h2]:text-muted-foreground">
                            {message.content}
                          </MessageResponse>
                        ) : (
                          <p className="whitespace-pre-wrap break-words leading-6">
                            {message.content}
                          </p>
                        )}
                      </MessageContent>
                    </Message>
                  ))
                ) : (
                  <Empty text={t("m.taskChat.noAiMessages")} />
                )}
                {sendAi.isPending ? (
                  <div className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("m.ai.working")}
                  </div>
                ) : null}
              </div>
              <TaskMessageComposer
                value={draft}
                onChange={setDraft}
                onSubmit={(text) => sendAi.mutate(text)}
                pending={sendAi.isPending}
                placeholder={t("m.taskChat.aiPlaceholder")}
                sendLabel={t("m.taskChat.sendAi")}
              />
            </TabsContent>
          </Tabs>
          <SummarySection title={t("m.taskChat.history")} count={chats.data?.length ?? 0}>
            {(chats.data ?? []).length ? (
              chats.data?.map((conversation) => (
                <article
                  key={conversation.id}
                  className="rounded-xl border border-border bg-surface p-3"
                >
                  <Link
                    to="/m/c/$id"
                    params={{ id: conversation.id }}
                    className="flex min-h-11 items-center justify-between gap-2 font-semibold"
                  >
                    <span className="min-w-0 truncate text-sm">{conversation.title}</span>
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                      {new Date(conversation.lastMessageAt).toLocaleDateString(localeTag(lang))}
                    </span>
                  </Link>
                  <div className="mt-2 space-y-2 border-t border-border pt-2">
                    {conversation.messages.slice(-4).map((message) => (
                      <div key={message.id} className="text-sm leading-6">
                        <span className="mr-2 text-xs font-semibold text-muted-foreground">
                          {message.role === "assistant" ? "UNI" : t("m.taskChat.you")}
                        </span>
                        {message.role === "assistant" ? (
                          <CollapsibleChatContent content={message.content} className="mt-1">
                            <MessageResponse className="text-sm leading-6 [&_h2]:my-2 [&_h2]:text-xs [&_h2]:uppercase [&_h2]:text-muted-foreground">
                              {message.content}
                            </MessageResponse>
                          </CollapsibleChatContent>
                        ) : (
                          <p className="mt-1 whitespace-pre-wrap break-words">{message.content}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <Empty text={t("m.taskChat.noHistory")} />
            )}
          </SummarySection>
          <SummarySection title={t("m.taskChat.feedback")} count={comments.length}>
            {comments.length ? (
              <ul className="grid gap-2">
                {comments.map((comment: any) => (
                  <li key={comment.id} className="rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate font-semibold text-foreground">
                        {comment.author_name ?? t("m.taskChat.member")}
                      </span>
                      <span className="shrink-0">
                        {new Date(comment.created_at).toLocaleDateString(localeTag(lang))}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-sm leading-6">{comment.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text={t("m.taskChat.noFeedback")} />
            )}
          </SummarySection>
          <SummarySection title={t("m.taskChat.related")} count={related.length}>
            {related.length ? (
              <div className="grid gap-2">
                {related.map((item) => (
                  <Link
                    key={item.edgeId}
                    to={item.entity.href as never}
                    className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface px-3"
                  >
                    <Link2 className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {item.entity.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.relationship} · {item.entity.type}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty text={t("m.taskChat.noRelated")} />
            )}
          </SummarySection>
        </>
      )}
    </section>
  );
}

function TaskMessageComposer({
  value,
  onChange,
  onSubmit,
  pending,
  placeholder,
  sendLabel,
  recipients,
  recipientId,
  onRecipientChange,
  recipientPlaceholder,
  noRecipientsLabel,
  recipientsLoading,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  pending: boolean;
  placeholder: string;
  sendLabel: string;
  recipients?: Array<{ id: string; name: string; email: string }>;
  recipientId?: string;
  onRecipientChange?: (value: string) => void;
  recipientPlaceholder?: string;
  noRecipientsLabel?: string;
  recipientsLoading?: boolean;
}) {
  const needsRecipient = Boolean(recipients);
  return (
    <PromptInput
      className="mt-2 rounded-xl border-border bg-surface"
      onSubmit={({ text }) => {
        const clean = text.trim();
        if (clean && !pending) onSubmit(clean);
      }}
    >
      <PromptInputTextarea
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="max-h-28 min-h-14 px-3 pt-3 text-base leading-6"
      />
      <PromptInputFooter className="flex-col items-stretch gap-2 px-1.5 pb-1.5 sm:flex-row sm:items-center sm:justify-between">
        {recipients ? (
          recipientsLoading ? (
            <span className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {recipientPlaceholder}
            </span>
          ) : recipients.length ? (
            <Select value={recipientId} onValueChange={onRecipientChange}>
              <SelectTrigger className="h-11 min-w-0 sm:max-w-64">
                <SelectValue placeholder={recipientPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {recipients.map((person) => (
                  <SelectItem key={person.id} value={person.id} className="min-h-11">
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="flex min-h-11 items-center text-xs text-muted-foreground">
              {noRecipientsLabel}
            </span>
          )
        ) : (
          <span />
        )}
        <PromptInputSubmit
          status={pending ? "submitted" : "ready"}
          disabled={!value.trim() || pending || (needsRecipient && !recipientId)}
          aria-label={sendLabel}
          className="h-10 w-10"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </PromptInputSubmit>
      </PromptInputFooter>
    </PromptInput>
  );
}

function SummarySection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary">{count}</Badge>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      {text}
    </p>
  );
}
