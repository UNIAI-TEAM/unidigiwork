// Danh sách phòng trò chuyện của tổ chức đang hoạt động (mobile-native, API thật, RLS).
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Hash, Lock, MessageSquare, Search, User, Video, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { listChatChannels } from "@/lib/api/chat.functions";
import { fmt } from "@/lib/i18n-interpolate";
import { localeTag, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/m/chat/")({
  head: () => ({
    meta: [
      { title: "Trò chuyện — UNIWORK" },
      { name: "description", content: "Phòng trò chuyện theo tổ chức và cuộc họp trên UNIWORK." },
      { property: "og:title", content: "Trò chuyện — UNIWORK" },
      {
        property: "og:description",
        content: "Phòng trò chuyện theo tổ chức và cuộc họp trên UNIWORK.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileChatList,
});

function MobileChatList() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const listFn = useServerFn(listChatChannels);
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mobile-chat-channels"],
    queryFn: () => listFn(),
    staleTime: 15_000,
  });

  const channels = useMemo(() => {
    const all = data?.channels ?? [];
    const q = search.trim().toLowerCase();
    return q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all;
  }, [data, search]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-3 overflow-x-hidden p-4 pb-24">
      <h1 className="text-xl font-semibold">{t("m.chat.title")}</h1>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("m.chat.searchPlaceholder")}
          className="min-h-11 pl-9 pr-10"
          aria-label={t("m.chat.searchPlaceholder")}
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label={t("m.chat.searchPlaceholder")}
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid gap-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : isError ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
          {t("m.ai.chat.error")}
        </p>
      ) : channels.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
          {search ? t("m.chat.empty") : t("m.ai.chat.emptyChannels")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {channels.map((channel) => (
            <MobileListItem
              key={channel.id}
              title={channel.name}
              subtitle={fmt(t("m.chat.members"), { n: channel.memberCount })}
              meta={
                channel.lastMessageAt
                  ? new Date(channel.lastMessageAt).toLocaleString(locale)
                  : t("m.ai.chat.noMessages")
              }
              icon={
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-foreground">
                  {channel.meetingId ? (
                    <Video className="h-4 w-4" />
                  ) : channel.kind === "dm" ? (
                    <User className="h-4 w-4" />
                  ) : channel.isPrivate ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Hash className="h-4 w-4" />
                  )}
                </span>
              }
              badge={
                channel.unread > 0 ? (
                  <Badge>{channel.unread}</Badge>
                ) : channel.meetingId ? (
                  <Badge variant="outline">{t("m.chat.meetingRoom")}</Badge>
                ) : null
              }
              onClick={() => void navigate({ to: "/m/chat/$id", params: { id: channel.id } })}
            />
          ))}
        </div>
      )}

      <p className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        {t("m.chat.meetingOpen")}
      </p>
    </div>
  );
}
