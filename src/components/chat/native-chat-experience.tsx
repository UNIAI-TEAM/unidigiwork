// Chat native dùng chung cho desktop và mobile (một trải nghiệm duy nhất, API thật, RLS).
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Hash, ListTodo, Lock, MessageSquare, Search, User, Users, Video } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatRoomView } from "@/components/mobile/team-chat-panel";
import { ensureTenantGeneralChannel, listChatChannels } from "@/lib/api/chat.functions";
import { localeTag, useI18n } from "@/lib/i18n";

export function NativeChatExperience({
  initialChannelId,
}: {
  initialChannelId?: string | undefined;
}) {
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listChatChannels);
  const ensureGeneralFn = useServerFn(ensureTenantGeneralChannel);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(initialChannelId ?? null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["native-chat-channels"],
    queryFn: () => listFn(),
    staleTime: 15_000,
  });

  const channels = useMemo(() => {
    const all = data?.channels ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all;
    return [...filtered].sort((a, b) => Number(!!b.isGeneral) - Number(!!a.isGeneral));
  }, [data, search]);

  const hasGeneral = (data?.channels ?? []).some((c) => c.isGeneral);
  const openGeneral = useMutation({
    mutationFn: () => ensureGeneralFn(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["native-chat-channels"] });
      const id = (result as { channelId?: string } | null)?.channelId;
      if (id) select(id);
    },
    onError: () => toast.error(t("m.chat.generalError")),
  });

  // Tự tạo phòng chung của tổ chức ngay lần đầu vào chat (idempotent, tenant-scoped).
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (isLoading || isError || hasGeneral || ensuredRef.current) return;
    ensuredRef.current = true;
    void ensureGeneralFn()
      .then(() => queryClient.invalidateQueries({ queryKey: ["native-chat-channels"] }))
      .catch(() => undefined);
  }, [isLoading, isError, hasGeneral, ensureGeneralFn, queryClient]);

  const select = (id: string) => {
    setSelected(id);
    void navigate({ to: "/chat/$channelId", params: { channelId: id } });
  };

  const active = channels.find((c) => c.id === selected) ?? null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-6xl gap-0 overflow-hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:gap-4 md:px-4">
      {/* Danh sách phòng — ẩn trên điện thoại khi đang mở phòng */}
      <aside
        className={`${selected ? "hidden md:flex" : "flex"} w-full flex-col gap-3 md:w-72 md:shrink-0`}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("m.chat.searchPlaceholder")}
            className="h-11 rounded-2xl pl-9"
          />
        </div>
        {!hasGeneral && (
          <Button
            variant="secondary"
            className="h-11 justify-start gap-2 rounded-2xl"
            disabled={openGeneral.isPending}
            onClick={() => openGeneral.mutate()}
          >
            <Users className="h-4 w-4" />
            {t("m.chat.openGeneral")}
          </Button>
        )}
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {isLoading &&
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-2xl" />)}
          {isError && <p className="px-2 text-sm text-muted-foreground">{t("m.chat.error")}</p>}
          {!isLoading && !isError && channels.length === 0 && (
            <p className="px-2 text-sm text-muted-foreground">{t("m.chat.empty")}</p>
          )}
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => select(channel.id)}
              className={`flex w-full min-h-14 items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-surface-2 ${
                channel.id === selected ? "bg-surface-2" : ""
              }`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-foreground">
                {channel.meetingId ? (
                  <Video className="h-4 w-4" />
                ) : channel.taskId ? (
                  <ListTodo className="h-4 w-4" />
                ) : channel.kind === "dm" ? (
                  <User className="h-4 w-4" />
                ) : channel.isPrivate ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Hash className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{channel.name}</span>
                  {channel.isGeneral && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {t("m.chat.badgeGeneral")}
                    </Badge>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {channel.lastMessageAt
                    ? new Date(channel.lastMessageAt).toLocaleString(locale)
                    : t("m.chat.noMessages")}
                </span>
              </span>
              {channel.unread > 0 && (
                <span className="ml-auto shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  {channel.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Phòng đang mở */}
      <section
        className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col rounded-3xl border border-border bg-surface p-3`}
      >
        {selected ? (
          <>
            <div className="mb-2 flex items-center gap-2 md:hidden">
              <Button
                variant="ghost"
                className="h-10 px-2 text-sm"
                onClick={() => setSelected(null)}
              >
                {t("m.chat.backList")}
              </Button>
              <span className="truncate text-sm font-medium">{active?.name}</span>
            </div>
            <ChatRoomView channelId={selected} />
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-center text-sm text-muted-foreground">
            <span className="grid gap-2">
              <MessageSquare className="mx-auto h-6 w-6" />
              {t("m.chat.pickRoom")}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
