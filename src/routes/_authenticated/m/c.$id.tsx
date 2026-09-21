import { createFileRoute } from "@tanstack/react-router";
import { NativeAiSurface } from "@/components/mobile/native-ai-surface";

export const Route = createFileRoute("/_authenticated/m/c/$id")({
  component: ConversationPage,
});

function ConversationPage() {
  const { id } = Route.useParams();
  return <NativeAiSurface conversationId={id} />;
}