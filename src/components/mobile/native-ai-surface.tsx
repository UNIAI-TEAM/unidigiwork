import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  ArrowUp,
  CalendarClock,
  Camera,
  ChevronRight,
  FileText,
  Image,
  Loader2,
  MessageSquare,
  Mic,
  Paperclip,
  Plus,
  Search,
  Users,
  UsersRound,
  X,
  Zap,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message as AiMessage,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { getAiConversation, sendAiMessage, type AiMessageDTO } from "@/lib/api/ai-chat.functions";
import { universalSearch } from "@/lib/api/search-universal.functions";
import type { UniversalSearchItem } from "@/lib/api/search-universal.server";
import type { AiContextEntityType } from "@/domain/ai-context/contracts";
import { WORK_ENTITY_TYPES } from "@/domain/work-graph/relationship-types";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { useCurrentIdentity } from "@/lib/use-current-identity";
import { useI18n } from "@/lib/i18n";
import { CollapsibleChatContent } from "@/components/mobile/collapsible-chat-content";
import { TeamChatPanel } from "@/components/mobile/team-chat-panel";

type AddedContext = {
  id: string;
  label: string;
  kind: "file" | "entity";
  root?: { type: AiContextEntityType; id: string };
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const ENTITY_MAP: Partial<Record<UniversalSearchItem["entityType"], AiContextEntityType>> = {
  PROJECT: "WORKSPACE",
  TASK: "TASK",
  MEETING: "MEETING",
  DOCUMENT: "DOCUMENT",
  EMAIL: "EMAIL",
  CHAT_CHANNEL: "CHAT_CHANNEL",
  MEETING_ARTIFACT: "MEETING_ARTIFACT",
  PERSON: "PERSON",
  WORK_PRODUCT: "WORK_PRODUCT",
  DECISION: "DECISION",
};

export function NativeAiSurface({ conversationId }: { conversationId?: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sendFn = useServerFn(sendAiMessage);
  const getFn = useServerFn(getAiConversation);
  const { workspaceId } = useActiveWorkspace();
  const identity = useCurrentIdentity();
  const [input, setInput] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [contexts, setContexts] = useState<AddedContext[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor =
      (
        window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }
      ).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      toast.error(t("m.ai.voiceUnsupported"));
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "vi-VN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event: { results: ArrayLike<SpeechRecognitionResultLike> }) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }
      const text = transcript.trim();
      if (text) setInput(text);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
    },
    [],
  );

  const messages = useQuery({
    queryKey: ["native-ai-messages", conversationId],
    queryFn: () => getFn({ data: { conversationId: conversationId as string } }),
    enabled: Boolean(conversationId),
  });

  const send = useMutation({
    mutationFn: (text: string) => {
      const root = contexts.find((item) => item.root)?.root;
      // Work Graph: mọi thực thể đã đính kèm (task / quyết định / tài liệu / Work Product)
      // được gửi kèm và lưu cùng tin nhắn, không chỉ nhãn văn bản.
      const contextEntities = contexts
        .filter((item) => item.root)
        .slice(0, 8)
        .map((item) => ({ type: item.root!.type, id: item.root!.id, label: item.label }));
      return sendFn({
        data: {
          text,
          ...(conversationId ? { conversationId } : {}),
          ...(workspaceId && !conversationId ? { workspaceId } : {}),
          ...(root ? { rootEntity: root } : {}),
          ...(contextEntities.length ? { contextEntities } : {}),
          ...(contexts.length
            ? {
                contextNote: contexts.map((item) => item.label).join(" · "),
                metadata: { contextLabels: contexts.map((item) => item.label) },
              }
            : {}),
        },
      });
    },
    onSuccess: async (result) => {
      setPendingText(null);
      setContexts([]);
      await queryClient.invalidateQueries({
        queryKey: ["native-ai-messages", result.conversationId],
      });
      await queryClient.invalidateQueries({ queryKey: ["mobile-ai-conversations"] });
      if (!conversationId) {
        await navigate({
          to: "/m/c/$id" as never,
          params: { id: result.conversationId } as never,
          replace: true,
        });
      }
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    onError: (error) => {
      setPendingText(null);
      toast.error(error instanceof Error ? error.message : t("m.ai.error"));
    },
  });

  const submit = (raw: string) => {
    const value = raw.trim();
    if (!value || send.isPending) return;
    setInput("");
    setPendingText(value);
    send.mutate(value);
  };

  useEffect(() => {
    composerRef.current?.focus();
  }, [conversationId, send.isPending]);

  const displayMessages = (messages.data ?? []).filter((message) => message.role !== "system");
  const isEmpty = displayMessages.length === 0 && !pendingText;
  const firstName = identity.displayName.trim().split(/\s+/).at(-1) || t("m.ai.user");

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="min-h-full gap-6 px-4 pb-3 pt-1 sm:px-6 sm:pt-2">
          {messages.isLoading ? (
            <div className="flex min-h-72 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="ml-2 text-sm">{t("m.ai.loading")}</span>
            </div>
          ) : isEmpty ? (
            <EmptyState firstName={firstName} onPick={submit} />
          ) : (
            <div className="mx-auto w-full max-w-2xl space-y-7 pb-4">
              {displayMessages.map((message, index) => (
                <Message
                  key={message.id}
                  message={message}
                  latest={index >= Math.max(0, displayMessages.length - 2)}
                />
              ))}
              {pendingText && (
                <>
                  <UserMessage content={pendingText} />
                  <div className="text-sm text-muted-foreground" role="status">
                    <Shimmer className="text-sm">{t("m.ai.working")}</Shimmer>
                  </div>
                </>
              )}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label={t("m.ai.scrollLatest")} />
      </Conversation>

      <div className="shrink-0 bg-background px-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          {contexts.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {contexts.map((item) => (
                <span
                  key={item.id}
                  className="flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 text-xs"
                >
                  {item.kind === "file" ? (
                    <Paperclip className="h-3.5 w-3.5" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-primary" />
                  )}
                  <span className="max-w-48 truncate">{item.label}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7"
                    aria-label={t("m.ai.removeContext")}
                    onClick={() =>
                      setContexts((current) => current.filter((context) => context.id !== item.id))
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </span>
              ))}
            </div>
          )}
          <PromptInput className="mobile-ai-composer" onSubmit={({ text }) => submit(text)}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-full"
              aria-label={t("m.ai.addContext")}
              onClick={() => setContextOpen(true)}
            >
              <Plus className="!h-6 !w-6" />
            </Button>
            <PromptInputTextarea
              ref={composerRef}
              value={input}
              aria-label={t("m.ai.composer")}
              placeholder={t("m.ai.composer")}
              onChange={(event) => setInput(event.currentTarget.value)}
              rows={1}
              wrap="off"
              className="min-w-0 flex-1 self-center px-2 py-3 text-base leading-6"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`h-12 w-12 shrink-0 rounded-full ${listening ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
              aria-label={listening ? t("m.ai.listening") : t("m.ai.voice")}
              aria-pressed={listening}
              onClick={toggleVoice}
            >
              <Mic className={`!h-6 !w-6 ${listening ? "animate-pulse" : ""}`} />
            </Button>
            <PromptInputSubmit
              className="h-12 w-12 shrink-0 rounded-full bg-action text-action-foreground hover:bg-action/90 disabled:bg-muted disabled:text-muted-foreground"
              aria-label={t("m.ai.send")}
              disabled={!input.trim() || send.isPending}
              status={send.isPending ? "submitted" : "ready"}
            >
              {send.isPending ? (
                <Loader2 className="!h-5 !w-5 animate-spin" />
              ) : (
                <ArrowUp className="!h-6 !w-6" />
              )}
            </PromptInputSubmit>
          </PromptInput>
          <p className="mt-1 text-center text-[11px] leading-4 text-muted-foreground">
            {t("m.ai.disclaimer")}
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        hidden
        type="file"
        multiple
        onChange={(event) => addFiles(event.currentTarget.files, setContexts)}
      />
      <input
        ref={cameraRef}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => addFiles(event.currentTarget.files, setContexts)}
      />
      <AddContextDrawer
        open={contextOpen}
        onOpenChange={setContextOpen}
        onFiles={() => fileRef.current?.click()}
        onCamera={() => cameraRef.current?.click()}
        onAdd={(item) =>
          setContexts((current) =>
            current.some((context) => context.id === item.id) ? current : [...current, item],
          )
        }
      />
    </div>
  );
}

const STARTER_CARDS = [
  { key: "plan", icon: CalendarClock, tone: "text-primary" },
  { key: "catchup", icon: Activity, tone: "text-primary" },
  { key: "prepare", icon: UsersRound, tone: "text-success" },
  { key: "create", icon: FileText, tone: "text-warning" },
] as const;

function EmptyState({
  firstName,
  onPick,
}: {
  firstName: string;
  onPick: (prompt: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="flex min-h-full flex-col justify-end pb-4 sm:justify-center sm:pb-0">
      <div className="mx-auto w-full max-w-xl text-center">
        <h1 className="text-2xl font-semibold leading-tight">
          {t("m.ai.greeting").replace("{name}", firstName)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("m.ai.question")}</p>
        <div className="mt-6 grid grid-cols-2 gap-2.5 text-left">
          {STARTER_CARDS.map(({ key, icon: Icon, tone }) => (
            <button
              key={key}
              type="button"
              onClick={() => onPick(t(`m.ai.starter.${key}.prompt` as never))}
              className="group flex min-h-44 flex-col gap-2 rounded-2xl border border-border bg-surface p-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring sm:min-h-40"
            >
              <span className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted">
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="text-sm font-semibold leading-snug">
                {t(`m.ai.starter.${key}` as never)}
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                {t(`m.ai.starter.${key}.desc` as never)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Message({ message, latest = false }: { message: AiMessageDTO; latest?: boolean }) {
  const { t } = useI18n();
  if (message.role === "user") return <UserMessage content={message.content} />;
  return (
    <AiMessage from="assistant" className={latest ? "max-w-full" : "max-w-full"}>
      <MessageContent className="min-w-0 flex-1 overflow-visible">
        <CollapsibleChatContent content={message.content}>
          <MessageResponse className="executive-brief text-sm leading-7 [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:text-muted-foreground [&_li]:my-1 [&_ul]:my-2">
            {message.content}
          </MessageResponse>
        </CollapsibleChatContent>
        {message.metadata?.sources?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.metadata.sources.slice(0, 4).map((source) => (
              <a
                key={source.sourceId}
                href={source.href}
                className="max-w-full truncate rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {source.title}
              </a>
            ))}
          </div>
        ) : null}
        {message.metadata?.workProductStatus === "CREATED" && message.metadata.workProductHref ? (
          <a
            href={message.metadata.workProductHref}
            className="mt-3 flex min-h-11 w-fit max-w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-muted"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{t("m.ai.executiveBriefReady")}</span>
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
          </a>
        ) : null}
        {message.metadata?.workProductStatus === "FAILED" ? (
          <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {t("m.ai.executiveBriefFailed")}
          </p>
        ) : null}
      </MessageContent>
    </AiMessage>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <AiMessage from="user">
      <MessageContent className="max-w-[86%] rounded-[1.5rem] rounded-br-lg bg-secondary px-4 py-3 text-secondary-foreground">
        <p className="whitespace-pre-wrap text-sm leading-6">{content}</p>
      </MessageContent>
    </AiMessage>
  );
}

function AddContextDrawer({
  open,
  onOpenChange,
  onFiles,
  onCamera,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFiles: () => void;
  onCamera: () => void;
  onAdd: (item: AddedContext) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const searchFn = useServerFn(universalSearch);
  const { workspaceId } = useActiveWorkspace();
  const [mode, setMode] = useState<"menu" | "uniwork" | "people" | "chat">("menu");
  const [chatChannelId, setChatChannelId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setMode("menu");
      setQuery("");
      setChatChannelId(null);
    }
  }, [open]);

  const search = useQuery({
    queryKey: ["native-ai-context-search", mode, debounced, workspaceId],
    queryFn: () =>
      searchFn({
        data: {
          q: debounced,
          workspaceId: workspaceId ?? undefined,
          kinds: mode === "people" ? ["person"] : undefined,
          limit: 20,
          offset: 0,
          expandGraph: false,
        },
      }),
    enabled: open && (mode === "uniwork" || mode === "people") && debounced.length >= 2,
  });

  const options = [
    { id: "files", label: t("m.ai.context.files"), icon: Image, action: onFiles },
    { id: "camera", label: t("m.ai.context.camera"), icon: Camera, action: onCamera },
    {
      id: "chat",
      label: t("m.ai.context.chat"),
      icon: MessageSquare,
      action: () => {
        setChatChannelId(null);
        setMode("chat");
      },
    },
    {
      id: "uniwork",
      label: t("m.ai.context.uniwork"),
      icon: Search,
      action: () => setMode("uniwork"),
    },
    { id: "people", label: t("m.ai.context.people"), icon: Users, action: () => setMode("people") },
    {
      id: "apps",
      label: t("m.ai.context.apps"),
      icon: Zap,
      action: () => void navigate({ to: "/m/settings", search: { tab: "integrations" } as never }),
    },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={
          mode === "menu"
            ? "mx-auto mb-[max(1rem,env(safe-area-inset-bottom))] w-[calc(100%-2.75rem)] max-w-[340px] max-h-[70dvh] rounded-[1.75rem] border border-border-strong bg-surface p-2.5 pb-2.5 shadow-card after:hidden"
            : mode === "chat"
              ? "flex h-[86dvh] flex-col rounded-t-3xl"
              : "max-h-[78dvh] rounded-t-3xl"
        }
      >
        <DrawerHeader className={mode === "menu" ? "sr-only" : "text-left"}>
          <DrawerTitle>
            {mode === "menu"
              ? t("m.ai.addContext")
              : mode === "chat"
                ? t("m.ai.chat.title")
                : t("m.ai.context.search")}
          </DrawerTitle>
          <DrawerDescription>{t("m.ai.context.description")}</DrawerDescription>
        </DrawerHeader>
        <div
          className={
            mode === "menu"
              ? "flex flex-col overflow-y-auto px-2 py-1"
              : mode === "chat"
                ? "flex min-h-0 flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                : "overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          }
        >
          {mode === "menu" ? (
            <div className="grid gap-0.5">
              {options.map(({ id, label, icon: Icon, action }) => (
                <Button
                  key={id}
                  variant="ghost"
                  className="min-h-12 justify-start gap-3 rounded-full px-2.5 text-[15px] font-normal"
                  onClick={() => {
                    action();
                    if (id === "files" || id === "camera" || id === "apps") onOpenChange(false);
                  }}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-foreground">
                    <Icon className="!h-[18px] !w-[18px]" />
                  </span>
                  {label}
                </Button>
              ))}
            </div>
          ) : mode === "chat" ? (
            <TeamChatPanel
              channelId={chatChannelId}
              onOpenChannel={(channel) => setChatChannelId(channel.id)}
              onBack={() => setChatChannelId(null)}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                  aria-label={t("m.ai.context.search")}
                  placeholder={t("m.ai.context.searchPlaceholder")}
                  className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              {search.isFetching && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("m.ai.loading")}
                </p>
              )}
              <div className="grid gap-1">
                {(search.data?.items ?? []).map((item) => {
                  const type = ENTITY_MAP[item.entityType];
                  if (!type) return null;
                  return (
                    <Button
                      key={`${item.entityType}:${item.id}`}
                      variant="ghost"
                      className="h-auto min-h-14 justify-start whitespace-normal rounded-xl px-3 text-left"
                      onClick={() => {
                        onAdd({
                          id: `${type}:${item.id}`,
                          label: item.title,
                          kind: "entity",
                          root: { type, id: item.id },
                        });
                        onOpenChange(false);
                      }}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          {item.subtitle}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
              {debounced.length >= 2 &&
                !search.isFetching &&
                (search.data?.items.length ?? 0) === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("m.ai.context.empty")}
                  </p>
                )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function addFiles(
  files: FileList | null,
  setContexts: React.Dispatch<React.SetStateAction<AddedContext[]>>,
) {
  if (!files?.length) return;
  const additions = Array.from(files).map((file) => ({
    id: `file:${file.name}:${file.lastModified}`,
    label: file.name,
    kind: "file" as const,
  }));
  setContexts((current) =>
    [
      ...current,
      ...additions.filter((item) => !current.some((existing) => existing.id === item.id)),
    ].slice(0, 12),
  );
}
