import { createFileRoute } from "@tanstack/react-router";
import { MobileNativeRegistryPage } from "@/components/mobile/mobile-native-registry";

export const Route = createFileRoute("/_authenticated/m/$")({
  head: () => ({ meta: [
    { title: "Không gian mobile · UNIWORK" },
    { name: "description", content: "Trải nghiệm quản lý công việc mobile-native của UNIWORK." },
    { property: "og:title", content: "Không gian mobile · UNIWORK" },
    { property: "og:description", content: "Trải nghiệm quản lý công việc mobile-native của UNIWORK." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MobileNativeRegistryPage,
});