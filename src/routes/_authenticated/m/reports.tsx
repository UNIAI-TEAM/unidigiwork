import { createFileRoute } from "@tanstack/react-router";
import { MobileReportsPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/reports")({ component: Page });
function Page() { return <MobileReportsPage />; }
