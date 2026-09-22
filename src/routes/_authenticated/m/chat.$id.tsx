// Phòng trò chuyện mobile-native: lịch sử thật, gửi tin, quyền theo tổ chức (RLS).
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatRoomView } from "@/components/mobile/team-chat-panel";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/m/chat/$id")({
  head: () => ({
    meta: [
      { title: "Phòng trò chuyện — UNIWORK" },
      { name: "description", content: "Tin nhắn của phòng trò chuyện trong tổ chức." },
      { property: "og:title", content: "Phòng trò chuyện — UNIWORK" },
      { property: "og:description", content: "Tin nhắn của phòng trò chuyện trong tổ chức." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileChatRoom,
});

function MobileChatRoom() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col overflow-x-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <Button
        variant="ghost"
        className="mb-2 h-11 w-fit justify-start gap-2 px-2 text-sm"
        onClick={() => void navigate({ to: "/m/chat" })}
      >
        <ChevronLeft className="h-4 w-4" />
        {t("m.chat.backList")}
      </Button>
      <ChatRoomView channelId={id} />
    </div>
  );
}
