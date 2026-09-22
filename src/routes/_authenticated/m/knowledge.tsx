import { createFileRoute } from "@tanstack/react-router";
import { MobileKnowledgePage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/knowledge")({ component: Page });
function Page() {
  return <MobileKnowledgePage />;
}
