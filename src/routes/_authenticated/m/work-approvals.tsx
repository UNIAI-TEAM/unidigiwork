import { createFileRoute } from "@tanstack/react-router";
import { MobileApprovalsPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/work-approvals")({ component: Page });
function Page() { return <MobileApprovalsPage />; }
