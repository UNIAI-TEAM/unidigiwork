import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/m/ai")({
  beforeLoad: () => {
    throw redirect({ to: "/m" as never, replace: true });
  },
});