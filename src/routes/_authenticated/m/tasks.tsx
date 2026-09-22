import { createFileRoute } from "@tanstack/react-router";
import { MobileTaskList } from "@/components/mobile/mobile-task-list";

export const Route = createFileRoute("/_authenticated/m/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · UNIWORK" },
      { name: "description", content: "Quản lý công việc trên UNIWORK mobile." },
      { property: "og:title", content: "Tasks · UNIWORK" },
      { property: "og:description", content: "Quản lý công việc trên UNIWORK mobile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileTaskList,
});
