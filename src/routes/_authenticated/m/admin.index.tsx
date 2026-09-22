import { createFileRoute } from "@tanstack/react-router";
import { MobileAdminHub } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/admin/")({ component: Page });
function Page() { return <MobileAdminHub />; }
