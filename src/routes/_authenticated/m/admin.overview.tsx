import { createFileRoute } from "@tanstack/react-router";
import { MobileAdminPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/admin/overview")({ component: Page });
function Page() {
  return <MobileAdminPage />;
}
