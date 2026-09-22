import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listAiConversations } from "@/lib/api/ai-chat.functions";
import { localeTag, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/m/search")({
  head: () => ({
    meta: [
      { title: "Tìm kiếm · UNIWORK" },
      {
        name: "description",
        content: "Tìm nhanh dự án, công việc, cuộc họp, tài liệu, email và nhân sự trên UNIWORK.",
      },
      { property: "og:title", content: "Tìm kiếm · UNIWORK" },
      {
        property: "og:description",
        content: "Tìm nhanh dự án, công việc, cuộc họp, tài liệu, email và nhân sự trên UNIWORK.",
      },
    ],
  }),
  component: MobileSearchPage,
});

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  project: Briefcase,
  task: ListChecks,
  meeting: Video,
  artifact: Sparkles,
  workproduct: FileText,
  decision: Gavel,
  document: FileText,
  email: Mail,
  chat: MessageSquare,
  person: Users,
};

const KIND_LABEL: Record<SearchKind, string> = {
  project: "Dự án",
  task: "Công việc",
  meeting: "Cuộc họp",
  artifact: "Kết quả họp",
  workproduct: "Kết quả công việc",
  decision: "Quyết định",
  document: "Tài liệu",
  email: "Email",
  chat: "Chat",
  person: "Nhân sự",
};

function MobileSearchPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const listFn = useServerFn(listAiConversations);
  const conversations = useQuery({
    queryKey: ["m-conversation-search", debounced],
    queryFn: () => listFn({ data: { q: debounced || undefined, limit: 50, sort: "recent" } }),
    staleTime: 30_000,
  });

  const relativeTime = (value: string) => {
    const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
    const formatter = new Intl.RelativeTimeFormat(localeTag(lang), { numeric: "auto" });
    if (minutes < 60) return formatter.format(-minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (hours < 24) return formatter.format(-hours, "hour");
    return formatter.format(-Math.round(hours / 24), "day");
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pb-24">
      <div className="sticky top-0 z-10 bg-background pb-4 pt-2">
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2">
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" onClick={() => history.back()} aria-label={t("common.back")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 items-center gap-2 rounded-full bg-muted px-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder={t("m.search.placeholder")}
            aria-label={t("m.search.label")}
            className="h-12 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {conversations.isFetching && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          {q && !conversations.isFetching && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              aria-label={t("m.search.clear")}
              className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          </div>
        </div>
      </div>

      <section className="min-w-0 pt-3">
        <h1 className="mb-3 px-2 text-sm font-semibold">{q ? t("m.search.results") : t("m.nav.recent")}</h1>
        {(conversations.data?.conversations.length ?? 0) === 0 && !conversations.isFetching ? (
          <p className="px-1 py-10 text-center text-sm text-muted-foreground">
            {q ? t("m.search.empty") : t("m.search.noRecent")}
          </p>
        ) : (
          <div className="space-y-0.5">
            {(conversations.data?.conversations ?? []).map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void navigate({ to: "/m/c/$id" as never, params: { id: conversation.id } as never })}
                className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 text-left hover:bg-muted"
              >
                <span className="min-w-0 truncate text-[15px]">{conversation.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(conversation.lastMessageAt)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
