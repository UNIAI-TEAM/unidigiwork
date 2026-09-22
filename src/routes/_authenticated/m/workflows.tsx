import { createFileRoute } from "@tanstack/react-router";
import { MobileWorkflowsPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/workflows")({ component: Page });
function Page() {
  return <MobileWorkflowsPage />;
}
