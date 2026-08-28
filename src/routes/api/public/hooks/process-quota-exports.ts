import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/process-quota-exports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorizedResponse } = await import("@/lib/api/cron-auth.server");
        if (!isAuthorizedCronRequest(request)) return cronUnauthorizedResponse();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { claimAndProcessPending } = await import("@/lib/api/quota-export-processor.server");
        try {
          const processed = await claimAndProcessPending(supabaseAdmin as never, 3);
          return Response.json({ ok: true, processed });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});