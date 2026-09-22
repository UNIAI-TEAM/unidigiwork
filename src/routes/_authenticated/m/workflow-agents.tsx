import { createFileRoute } from "@tanstack/react-router";
import { MobileWorkflowAgentsPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/workflow-agents")({ component: Page });
function Page() { return <MobileWorkflowAgentsPage />; }
