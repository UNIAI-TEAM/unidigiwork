import { createFileRoute } from "@tanstack/react-router";
import { MobileDecisionsPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/decisions")({ component: Page });
function Page() {
  return <MobileDecisionsPage />;
}
