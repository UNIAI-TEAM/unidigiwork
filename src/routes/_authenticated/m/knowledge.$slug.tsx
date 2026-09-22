import { createFileRoute } from "@tanstack/react-router";
import { MobileKnowledgeDetail } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/knowledge/$slug")({
  head: () => ({
    meta: [
      { title: "Chi tiết tri thức · UNIWORK" },
      { name: "description", content: "Đọc bài viết trong kho tri thức UNIWORK trên điện thoại." },
      { property: "og:title", content: "Chi tiết tri thức · UNIWORK" },
      {
        property: "og:description",
        content: "Đọc bài viết trong kho tri thức UNIWORK trên điện thoại.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  return <MobileKnowledgeDetail slug={slug} />;
}
