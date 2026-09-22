import { createFileRoute, redirect } from "@tanstack/react-router";
import { MeetingRoomExperience } from "@/components/meeting/meeting-room-experience";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/meeting_/$id")({
  validateSearch: (search: Record<string, unknown>): { invite?: string } => ({
    invite: typeof search["invite"] === "string" ? (search["invite"] as string) : undefined,
  }),
  beforeLoad: async ({ params, search }) => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (data.user) return;
    if (search.invite) {
      throw redirect({
        to: "/meeting/$id/guest",
        params: { id: params.id },
        search: { invite: search.invite },
      });
    }
    throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Phòng họp · UNIWORK" },
      { name: "description", content: "Phòng họp trực tuyến UNIWORK." },
      { property: "og:title", content: "Phòng họp · UNIWORK" },
      { property: "og:description", content: "Phòng họp trực tuyến UNIWORK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DesktopMeetingRoom,
});

function DesktopMeetingRoom() {
  const { id } = Route.useParams();
  const { invite } = Route.useSearch();
  return <MeetingRoomExperience id={id} invite={invite} />;
}
