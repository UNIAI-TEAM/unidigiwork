import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/ceo-weekly-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorizedResponse } =
          await import("@/lib/api/cron-auth.server");
        if (!isAuthorizedCronRequest(request)) return cronUnauthorizedResponse();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runCeoWeeklyReports } = await import("@/lib/api/ceo-weekly.server");
        try {
          const result = await runCeoWeeklyReports(supabaseAdmin as never, 20);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
