import { createFileRoute } from "@tanstack/react-router";
import { MobilePersonDetail } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/people/$id")({ component: Page });
function Page() { const { id } = Route.useParams(); return <MobilePersonDetail id={id} />; }
