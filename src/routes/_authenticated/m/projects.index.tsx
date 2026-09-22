import { createFileRoute } from "@tanstack/react-router";
import { MobileProjectsPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/projects/")({ component: Page });
function Page() { return <MobileProjectsPage />; }
