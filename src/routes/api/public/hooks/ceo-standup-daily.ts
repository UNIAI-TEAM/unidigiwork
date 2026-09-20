import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/ceo-standup-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorizedResponse } =
          await import("@/lib/api/cron-auth.server");
        if (!isAuthorizedCronRequest(request)) return cronUnauthorizedResponse();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runDailyStandup } = await import("@/lib/api/ceo-standup-daily.server");
        try {
          const force = new URL(request.url).searchParams.get("force") === "1";
          const result = await runDailyStandup(supabaseAdmin as never, 20, { force });
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
