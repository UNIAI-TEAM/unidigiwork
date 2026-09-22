import { createFileRoute } from "@tanstack/react-router";
import { MobileModuleHub } from "@/components/mobile/mobile-module-pages";
export const Route = createFileRoute("/_authenticated/m/hr")({
  component: () => <MobileModuleHub kind="hr" />,
});
