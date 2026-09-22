import { createFileRoute } from "@tanstack/react-router";
import { MobileTaskDetail } from "@/components/mobile/mobile-task-detail";

export const Route = createFileRoute("/_authenticated/m/tasks_/$id")({
  head: () => ({
    meta: [
      { title: "Chi tiết công việc · UNIWORK" },
      { name: "description", content: "Theo dõi tiến độ, chỉnh sửa và chia sẻ công việc." },
      { property: "og:title", content: "Chi tiết công việc · UNIWORK" },
      { property: "og:description", content: "Theo dõi tiến độ, chỉnh sửa và chia sẻ công việc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileTaskDetailRoute,
});

function MobileTaskDetailRoute() {
  const { id } = Route.useParams();
  return <MobileTaskDetail id={id} />;
}
