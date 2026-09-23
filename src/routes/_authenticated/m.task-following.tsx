import { createFileRoute } from "@tanstack/react-router";
import { MobileTaskFollowing } from "@/components/mobile/mobile-task-following";

export const Route = createFileRoute("/_authenticated/m/task-following")({
  head: () => ({
    meta: [
      { title: "Theo dõi công việc · UNIWORK" },
      { name: "description", content: "Đăng ký và quản lý các công việc đang theo dõi." },
      { property: "og:title", content: "Theo dõi công việc · UNIWORK" },
      {
        property: "og:description",
        content: "Đăng ký và quản lý các công việc đang theo dõi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileTaskFollowing,
});