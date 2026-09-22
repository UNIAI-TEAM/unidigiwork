import { createFileRoute } from "@tanstack/react-router";
import { MobileAdminHubNative } from "@/components/mobile/mobile-admin-hub";

export const Route = createFileRoute("/_authenticated/m/admin/")({
  head: () => ({
    meta: [
      { title: "Quản trị mobile — UNIWORK" },
      { name: "description", content: "Quản trị tài khoản, quyền và tổ chức trên điện thoại." },
      { property: "og:title", content: "Quản trị mobile — UNIWORK" },
      { property: "og:description", content: "Quản trị tài khoản, quyền và tổ chức trên điện thoại." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
function Page() {
  return <MobileAdminHubNative />;
}
