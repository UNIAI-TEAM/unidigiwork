import { createFileRoute } from "@tanstack/react-router";
import { MobileAiBrainPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/ai-brain")({ component: Page });
function Page() {
  return <MobileAiBrainPage />;
}
