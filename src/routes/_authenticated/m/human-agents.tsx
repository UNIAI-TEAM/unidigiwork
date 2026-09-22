import { createFileRoute } from "@tanstack/react-router";
import { MobileHumanAgentsPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/human-agents")({ component: Page });
function Page() {
  return <MobileHumanAgentsPage />;
}
