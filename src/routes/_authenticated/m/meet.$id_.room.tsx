import { createFileRoute } from "@tanstack/react-router";
import { MeetingRoomExperience } from "@/components/meeting/meeting-room-experience";

export const Route = createFileRoute("/_authenticated/m/meet/$id_/room")({
  head: () => ({
    meta: [
      { title: "Phòng họp mobile · UNIWORK" },
      { name: "description", content: "Phòng họp trực tuyến mobile-native của UNIWORK." },
      { property: "og:title", content: "Phòng họp mobile · UNIWORK" },
      { property: "og:description", content: "Phòng họp trực tuyến mobile-native của UNIWORK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileMeetingRoom,
});

function MobileMeetingRoom() {
  const { id } = Route.useParams();
  return <MeetingRoomExperience id={id} mobile />;
}
