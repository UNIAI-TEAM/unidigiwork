import { createFileRoute } from "@tanstack/react-router";
import { MobileBillingPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/billing")({ component: Page });
function Page() { return <MobileBillingPage />; }
