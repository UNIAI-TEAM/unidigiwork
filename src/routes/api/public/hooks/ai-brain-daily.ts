import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/ai-brain-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorizedResponse } = await import(
          "@/lib/api/cron-auth.server"
        );
        if (!isAuthorizedCronRequest(request)) return cronUnauthorizedResponse();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runDailyBrainRetraining } = await import("@/lib/api/ai-brain-daily.server");
        try {
          const result = await runDailyBrainRetraining(supabaseAdmin as never, 20);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
