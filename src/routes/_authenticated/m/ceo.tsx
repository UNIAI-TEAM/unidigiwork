import { createFileRoute } from "@tanstack/react-router";
import { MobileCeoPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/ceo")({ component: Page });
function Page() { return <MobileCeoPage />; }
