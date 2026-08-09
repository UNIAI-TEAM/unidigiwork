import { createFileRoute } from "@tanstack/react-router";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat nội bộ · UNIWORK" },
      { name: "description", content: "Kênh trò chuyện nhóm theo thời gian thực cho đội ngũ UNIWORK." },
      { property: "og:title", content: "Chat nội bộ · UNIWORK" },
      { property: "og:description", content: "Kênh trò chuyện nhóm theo thời gian thực cho đội ngũ UNIWORK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ChatWorkspace />,
});
