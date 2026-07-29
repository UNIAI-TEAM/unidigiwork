import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/process-quota-exports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
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