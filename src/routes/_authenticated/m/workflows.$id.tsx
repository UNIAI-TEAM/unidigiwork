import { createFileRoute } from "@tanstack/react-router";
import { MobileWorkflowDetail } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/workflows/$id")({
  head: () => ({
    meta: [
      { title: "Chi tiết quy trình · UNIWORK" },
      {
        name: "description",
        content: "Theo dõi cấu hình và lịch sử chạy quy trình UNIWORK trên điện thoại.",
      },
      { property: "og:title", content: "Chi tiết quy trình · UNIWORK" },
      {
        property: "og:description",
        content: "Theo dõi cấu hình và lịch sử chạy quy trình UNIWORK trên điện thoại.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  return <MobileWorkflowDetail id={id} />;
}
