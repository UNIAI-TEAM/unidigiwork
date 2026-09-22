import { createFileRoute } from "@tanstack/react-router";
import { MobilePeoplePage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/people/")({ component: Page });
function Page() { return <MobilePeoplePage />; }
