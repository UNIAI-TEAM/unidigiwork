import { createFileRoute } from "@tanstack/react-router";
import { MobileCalendarPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/calendar")({ component: Page });
function Page() {
  return <MobileCalendarPage />;
}
