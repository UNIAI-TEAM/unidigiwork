import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MobileSettings, type MobileSettingsTab } from "@/components/mobile/mobile-settings";

const mobileSettingsSearchSchema = z.object({
  tab: z
    .enum([
      "profile",
      "account",
      "password",
      "notifications",
      "appearance",
      "language",
      "integrations",
      "team",
      "security",
      "billing",
      "data",
    ])
    .optional(),
});

export const Route = createFileRoute("/_authenticated/m/settings")({
  validateSearch: mobileSettingsSearchSchema,
  head: () => ({
    meta: [
      { title: "Cài đặt mobile — UNIWORK" },
      { name: "description", content: "Cài đặt tài khoản UNIWORK trên điện thoại." },
      { property: "og:title", content: "Cài đặt mobile — UNIWORK" },
      {
        property: "og:description",
        content: "Cài đặt tài khoản UNIWORK trên điện thoại.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileSettingsRoute,
});

function MobileSettingsRoute() {
  const search = Route.useSearch();
  return <MobileSettings tab={search.tab as MobileSettingsTab | undefined} />;
}
