import { createFileRoute } from "@tanstack/react-router";

async function run(batch: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { drainOutbox } = await import("@/lib/api/outbox-processor.server");
  return drainOutbox(supabaseAdmin as never, { batch });
}

async function authorized(request: Request): Promise<boolean> {
  const { isAuthorizedCronRequest } = await import("@/lib/api/cron-auth.server");
  return isAuthorizedCronRequest(request);
}


export const Route = createFileRoute("/api/public/hooks/process-outbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        let batch = 20;
        try {
          const body = (await request.json()) as { batch?: number };
          if (typeof body?.batch === "number") batch = body.batch;
        } catch {
          /* empty body is fine */
        }
        try {
          const result = await run(batch);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
