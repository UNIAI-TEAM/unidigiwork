import { createFileRoute } from "@tanstack/react-router";
import { NativeAiSurface } from "@/components/mobile/native-ai-surface";

export const Route = createFileRoute("/_authenticated/m/")({
  head: () => ({
    meta: [
      { title: "UniWork · Tell UniWork what you want done" },
      {
        name: "description",
        content: "Ask, add work context, execute and receive a Work Product.",
      },
    ],
  }),
  component: () => <NativeAiSurface />,
});
