import { createFileRoute } from "@tanstack/react-router";
import { MobileAiSkillsPage } from "@/components/mobile/mobile-module-pages";

export const Route = createFileRoute("/_authenticated/m/ai-skills")({ component: Page });
function Page() { return <MobileAiSkillsPage />; }
