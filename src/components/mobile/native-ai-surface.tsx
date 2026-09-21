import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUp,
  Camera,
  FileText,
  Image,
  Loader2,
  Mic,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { useActiveWorkspace } from "@/lib/active-workspace";
import { useCurrentIdentity } from "@/lib/use-current-identity";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type AddedContext = {
  id: string;
  label: string;
  kind: "file" | "entity";
  root?: { type: AiContextEntityType; id: string };
};

const STARTERS = [
  { key: "plan", icon: Sparkles },
  { key: "catchup", icon: Zap },
  { key: "prepare", icon: Users },
  { key: "create", icon: FileText },
] as const;

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
  EXECUTION: "EXECUTION",
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const messages = useQuery({
    queryKey: ["native-ai-messages", conversationId],
    queryFn: () => getFn({ data: { conversationId: conversationId as string } }),
    enabled: Boolean(conversationId),
  });

  const send = useMutation({
    mutationFn: (text: string) => {
      const root = contexts.find((item) => item.root)?.root;
      return sendFn({
        data: {
          text,
          ...(conversationId ? { conversationId } : {}),
          ...(workspaceId && !conversationId ? { workspaceId } : {}),
          ...(root ? { rootEntity: root } : {}),
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
      await queryClient.invalidateQueries({ queryKey: ["native-ai-messages", result.conversationId] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-ai-conversations"] });
      if (!conversationId) {
        await navigate({ to: "/m/c/$id", params: { id: result.conversationId }, replace: true });
      }
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data?.length, pendingText]);

  const displayMessages = (messages.data ?? []).filter((message) => message.role !== "system");
  const isEmpty = displayMessages.length === 0 && !pendingText;
  const firstName = identity.displayName.trim().split(/\s+/).at(-1) || t("m.ai.user");

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6">
        {messages.isLoading ? (
          <div className="flex min-h-72 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm">{t("m.ai.loading")}</span>
          </div>
        ) : isEmpty ? (
          <EmptyState firstName={firstName} onPick={submit} />
        ) : (
          <div className="space-y-6 pb-4">
            {displayMessages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
            {pendingText && (
              <>
                <UserMessage content={pendingText} />
                <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("m.ai.working")}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
        {contexts.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {contexts.map((item) => (
              <span key={item.id} className="flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs">
                {item.kind === "file" ? <Paperclip className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                <span className="max-w-48 truncate">{item.label}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7"
                  aria-label={t("m.ai.removeContext")}
                  onClick={() => setContexts((current) => current.filter((context) => context.id !== item.id))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </span>
            ))}
          </div>
        )}
        <div className="flex min-h-14 items-end gap-1 rounded-2xl border border-border bg-surface p-1.5 shadow-panel">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            aria-label={t("m.ai.addContext")}
            onClick={() => setContextOpen(true)}
          >
            <Plus className="h-5 w-5" />
          </Button>
          <textarea
            value={input}
            rows={1}
            enterKeyHint="send"
            aria-label={t("m.ai.composer")}
            placeholder={t("m.ai.composer")}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(input);
              }
            }}
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-3 text-base leading-5 outline-none placeholder:text-muted-foreground"
          />
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl" aria-label={t("m.ai.voice")}>
            <Mic className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            aria-label={t("m.ai.send")}
            disabled={!input.trim() || send.isPending}
            onClick={() => submit(input)}
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">{t("m.ai.disclaimer")}</p>
      </div>

      <input ref={fileRef} hidden type="file" multiple onChange={(event) => addFiles(event.currentTarget.files, setContexts)} />
      <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => addFiles(event.currentTarget.files, setContexts)} />
      <AddContextDrawer
        open={contextOpen}
        onOpenChange={setContextOpen}
        onFiles={() => fileRef.current?.click()}
        onCamera={() => cameraRef.current?.click()}
        onAdd={(item) => setContexts((current) => current.some((context) => context.id === item.id) ? current : [...current, item])}
      />
    </div>
  );
}

function EmptyState({ firstName, onPick }: { firstName: string; onPick: (value: string) => void }) {
  const { t } = useI18n();
  return (
    <section className="flex min-h-full flex-col justify-center py-8 sm:py-16">
      <div className="mx-auto w-full max-w-xl text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-border bg-surface text-primary shadow-card">
          <Sparkles className="h-5 w-5" />
        </span>
        <h1 className="mt-6 text-3xl font-semibold leading-tight">{t("m.ai.greeting").replace("{name}", firstName)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("m.ai.question")}</p>
      </div>
      <div className="mx-auto mt-10 grid w-full max-w-xl grid-cols-2 gap-3">
        {STARTERS.map(({ key, icon: Icon }) => (
          <Button
            key={key}
            variant="outline"
            className="h-auto min-h-28 items-start justify-start whitespace-normal rounded-xl p-4 text-left shadow-card"
            onClick={() => onPick(t(`m.ai.starter.${key}.prompt` as never))}
          >
            <span className="flex h-full flex-col items-start gap-2">
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">{t(`m.ai.starter.${key}` as never)}</span>
              <span className="text-xs font-normal leading-relaxed text-muted-foreground">{t(`m.ai.starter.${key}.desc` as never)}</span>
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}

function Message({ message }: { message: AiMessageDTO }) {
  if (message.role === "user") return <UserMessage content={message.content} />;
  return (
    <article className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
        {message.metadata?.sources?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.metadata.sources.slice(0, 4).map((source) => (
              <a key={source.sourceId} href={source.href} className="max-w-full truncate rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                {source.title}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function UserMessage({ content }: { content: string }) {
  return <p className="ml-auto w-fit max-w-[86%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-2 px-4 py-3 text-sm leading-6">{content}</p>;
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
  const [mode, setMode] = useState<"menu" | "uniwork" | "people">("menu");
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
    }
  }, [open]);

  const search = useQuery({
    queryKey: ["native-ai-context-search", mode, debounced, workspaceId],
    queryFn: () => searchFn({ data: { q: debounced, workspaceId: workspaceId ?? undefined, kinds: mode === "people" ? ["person"] : undefined, limit: 20, offset: 0, expandGraph: false } }),
    enabled: open && mode !== "menu" && debounced.length >= 2,
  });

  const options = [
    { id: "files", label: t("m.ai.context.files"), icon: Image, action: onFiles },
    { id: "camera", label: t("m.ai.context.camera"), icon: Camera, action: onCamera },
    { id: "uniwork", label: t("m.ai.context.uniwork"), icon: Search, action: () => setMode("uniwork") },
    { id: "people", label: t("m.ai.context.people"), icon: Users, action: () => setMode("people") },
    { id: "apps", label: t("m.ai.context.apps"), icon: Zap, action: () => void navigate({ to: "/settings", search: { tab: "integrations" } as never }) },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[78dvh] rounded-t-2xl">
        <DrawerHeader className="text-left">
          <DrawerTitle>{mode === "menu" ? t("m.ai.addContext") : t("m.ai.context.search")}</DrawerTitle>
          <DrawerDescription>{t("m.ai.context.description")}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {mode === "menu" ? (
            <div className="grid gap-2">
              {options.map(({ id, label, icon: Icon, action }) => (
                <Button key={id} variant="ghost" className="min-h-14 justify-start rounded-xl px-3" onClick={() => { action(); if (id === "files" || id === "camera" || id === "apps") onOpenChange(false); }}>
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-primary"><Icon className="h-4 w-4" /></span>
                  {label}
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus aria-label={t("m.ai.context.search")} placeholder={t("m.ai.context.searchPlaceholder")} className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </div>
              {search.isFetching && <p className="py-6 text-center text-sm text-muted-foreground">{t("m.ai.loading")}</p>}
              <div className="grid gap-1">
                {(search.data?.items ?? []).map((item) => {
                  const type = ENTITY_MAP[item.entityType];
                  if (!type) return null;
                  return (
                    <Button key={`${item.entityType}:${item.id}`} variant="ghost" className="h-auto min-h-14 justify-start whitespace-normal rounded-xl px-3 text-left" onClick={() => { onAdd({ id: `${type}:${item.id}`, label: item.title, kind: "entity", root: { type, id: item.id } }); onOpenChange(false); }}>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className="block truncate text-xs font-normal text-muted-foreground">{item.subtitle}</span></span>
                    </Button>
                  );
                })}
              </div>
              {debounced.length >= 2 && !search.isFetching && (search.data?.items.length ?? 0) === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("m.ai.context.empty")}</p>}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function addFiles(files: FileList | null, setContexts: React.Dispatch<React.SetStateAction<AddedContext[]>>) {
  if (!files?.length) return;
  const additions = Array.from(files).map((file) => ({ id: `file:${file.name}:${file.lastModified}`, label: file.name, kind: "file" as const }));
  setContexts((current) => [...current, ...additions.filter((item) => !current.some((existing) => existing.id === item.id))].slice(0, 12));
}