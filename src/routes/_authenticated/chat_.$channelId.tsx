import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

export const Route = createFileRoute("/_authenticated/chat_/$channelId")({
  validateSearch: (s: Record<string, unknown>) => z.object({ m: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Kênh chat · UNIWORK" },
      { name: "description", content: "Xem và gửi tin nhắn trong kênh trò chuyện UNIWORK." },
      { property: "og:title", content: "Kênh chat · UNIWORK" },
      { property: "og:description", content: "Xem và gửi tin nhắn trong kênh trò chuyện UNIWORK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChannelRoute,
});

function ChannelRoute() {
  const { channelId } = Route.useParams();
  const { m } = Route.useSearch();
  return <ChatWorkspace initialChannelId={channelId} highlightMessageId={m} />;
}
