import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/school-brief-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorizedResponse } = await import("@/lib/api/cron-auth.server");
        if (!isAuthorizedCronRequest(request)) return cronUnauthorizedResponse();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runScheduledBriefs } = await import("@/lib/api/school-ops.server");
        try {
          return Response.json({ ok: true, ...(await runScheduledBriefs(supabaseAdmin as never)) });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
