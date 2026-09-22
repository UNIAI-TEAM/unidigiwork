import { createFileRoute } from "@tanstack/react-router";
import { MobileProjectDetail } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/projects/$id")({ component: Page });
function Page() {
  const { id } = Route.useParams();
  return <MobileProjectDetail id={id} />;
}
