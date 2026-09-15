import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * POST /api/admin/work-product-graph-backfill
 *
 * Tenant-scoped Work Product graph replay. Non-public.
 * Auth: Bearer <supabase_access_token> with role admin.
 * Body: { tenantId: uuid, limit?: 1..2000 }
 */
export const Route = createFileRoute("/api/admin/work-product-graph-backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        if (!token) {
          return Response.json({ error: "Missing bearer token" }, { status: 401 });
        }

        const supabaseUrl = process.env.SUPABASE_URL!;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const userClient = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
        if (userErr || !userRes?.user) {
          return Response.json({ error: "Invalid token" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: roleRow } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userRes.user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (!roleRow) {
          return Response.json({ error: "Forbidden: admin role required" }, { status: 403 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON body required" }, { status: 400 });
        }
        const parsed = z
          .object({
            tenantId: z.string().uuid(),
            limit: z.number().int().min(1).max(2000).optional(),
          })
          .safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "tenantId uuid required" }, { status: 400 });
        }

        const { backfillWorkProductGraph } = await import("@/lib/api/work-graph-projector.server");
        try {
          const result = await backfillWorkProductGraph(
            supabaseAdmin as never,
            parsed.data.tenantId,
            parsed.data.limit ?? 200,
          );
          return Response.json({
            ok: result.ok,
            tenantId: parsed.data.tenantId,
            documentsProjected: result.documentsProjected ?? 0,
            workProductsProjected: result.workProductsProjected ?? 0,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
