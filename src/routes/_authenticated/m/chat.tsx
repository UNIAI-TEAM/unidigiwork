import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { supabase } from "@/integrations/supabase/client";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { MobileFAB } from "@/components/mobile/mobile-fab";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";

type Thread = Database["public"]["Tables"]["email_threads"]["Row"];

export const Route = createFileRoute("/_authenticated/m/chat")({
  head: () => ({
    meta: [
      { title: "Chat · UNIWORK" },
      { name: "description", content: "Danh sách kênh chat và tin nhắn trên UNIWORK mobile." },
      { property: "og:title", content: "Chat · UNIWORK" },
      { property: "og:description", content: "Danh sách kênh chat và tin nhắn trên UNIWORK mobile." },
    ],
  }),
  component: MobileChatPage,
});

function MobileChatPage() {
  const navigate = useNavigate();
  const { workspaceId } = useActiveWorkspace();
  const [search, setSearch] = useState("");

  const { data: channels } = useSuspenseQuery({
    queryKey: ["mobile-chat-channels", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data } = await supabase
        .from("chat_channels")
        .select("id, name, kind, last_message_at, is_private")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = channels.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex min-h-full flex-col gap-3 p-4 pb-24">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kênh hoặc tin nhắn..."
          className="pl-9 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label="Xóa"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
          {search ? "Không tìm thấy kênh nào." : "Chưa có kênh chat nào."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <MobileListItem
              key={c.id}
              title={c.name}
              subtitle={c.kind === "dm" ? "Tin nhắn trực tiếp" : "Kênh công khai"}
              meta={
                c.last_message_at
                  ? formatDistanceToNow(new Date(c.last_message_at), {
                      locale: vi,
                      addSuffix: true,
                    })
                  : "Chưa có tin nhắn"
              }
              icon={
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                  {c.kind === "dm" ? "👤" : "#"}
                </span>
              }
              badge={c.is_private ? <Badge variant="outline">Riêng tư</Badge> : null}
                onClick={() =>
                  navigate({
                    to: "/chat/$channelId",
                    params: { channelId: c.id },
                  })
                }
            />
          ))}
        </div>
      )}

      <MobileFAB label="Tạo kênh" />
    </div>
  );
}
