import { createFileRoute } from "@tanstack/react-router";
import { MobileAiTrackingPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/ai-brain_/tracking")({
  head: () => ({
    meta: [
      { title: "Theo dõi đề xuất AI · UNIWORK" },
      {
        name: "description",
        content: "Theo dõi đề xuất AI, công việc, người phụ trách và tiến độ trên điện thoại.",
      },
      { property: "og:title", content: "Theo dõi đề xuất AI · UNIWORK" },
      {
        property: "og:description",
        content: "Theo dõi đề xuất AI, công việc, người phụ trách và tiến độ trên điện thoại.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileAiTrackingPage,
});
