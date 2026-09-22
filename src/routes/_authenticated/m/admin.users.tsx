import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/m/admin/users")({
  beforeLoad: () => {
    throw redirect({ to: "/m/admin/accounts", replace: true });
  },
});
