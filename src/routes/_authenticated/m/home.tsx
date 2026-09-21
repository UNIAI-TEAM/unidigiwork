import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/m/home")({
  beforeLoad: () => {
    throw redirect({ to: "/m" as never, replace: true });
  },
});
