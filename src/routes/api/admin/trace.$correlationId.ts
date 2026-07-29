import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/admin/trace/:correlationId
 *
 * Trả về tất cả quota_check_events, audit_events và outbox_events có cùng
 * correlation_id để truy vết một request end-to-end.
 *
 * Auth: Bearer <supabase_access_token> — caller phải có role admin.
 * Query: ?limit=500 (1..1000, default 500)
 */
export const Route = createFileRoute("/api/admin/trace/$correlationId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const cid = params.correlationId?.trim();
        if (!cid) {
          return Response.json({ error: "correlation_id is required" }, { status: 400 });
        }

        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        if (!token) {
          return Response.json({ error: "Missing bearer token" }, { status: 401 });
        }

        const url = new URL(request.url);
        const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? "500") || 500));

        const supabaseUrl = process.env.SUPABASE_URL!;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;

        // Verify caller identity via anon client + bearer token
        const userClient = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
        if (userErr || !userRes?.user) {
          return Response.json({ error: "Invalid token" }, { status: 401 });
        }
        const userId = userRes.user.id;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Verify admin role
        const { data: roleRow } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();
        if (!roleRow) {
          return Response.json({ error: "Forbidden: admin role required" }, { status: 403 });
        }

        const [quotaRes, auditRes, outboxRes] = await Promise.all([
          supabaseAdmin
            .from("quota_check_events")
            .select("id, tenant_id, meter_key, quota_limit, current_usage, requested_delta, allowed, reason, actor_id, correlation_id, occurred_at")
            .eq("correlation_id", cid)
            .order("occurred_at", { ascending: true })
            .limit(limit),
          (supabaseAdmin as unknown as {
            from: (t: string) => {
              select: (c: string) => {
                eq: (c: string, v: string) => {
                  order: (c: string, o: { ascending: boolean }) => {
                    limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
                  };
                };
              };
            };
          })
            .from("audit_events")
            .select("id, tenant_id, actor_user_id, action, resource_type, resource_id, event_type, aggregate_type, aggregate_id, payload, correlation_id, occurred_at")
            .eq("correlation_id", cid)
            .order("occurred_at", { ascending: true })
            .limit(limit),
          (supabaseAdmin as unknown as {
            from: (t: string) => {
              select: (c: string) => {
                eq: (c: string, v: string) => {
                  order: (c: string, o: { ascending: boolean }) => {
                    limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
                  };
                };
              };
            };
          })
            .from("outbox_events")
            .select("id, tenant_id, event_type, aggregate_type, aggregate_id, status, attempt_count, last_error, correlation_id, occurred_at, processed_at")
            .eq("correlation_id", cid)
            .order("occurred_at", { ascending: true })
            .limit(limit),
        ]);

        if (quotaRes.error) return Response.json({ error: quotaRes.error.message }, { status: 500 });
        if (auditRes.error) return Response.json({ error: auditRes.error.message }, { status: 500 });
        if (outboxRes.error) return Response.json({ error: outboxRes.error.message }, { status: 500 });

        const quota = quotaRes.data ?? [];
        const audit = (auditRes.data ?? []) as Array<{ occurred_at: string }>;
        const outbox = (outboxRes.data ?? []) as Array<{ occurred_at: string }>;

        const timeline = [
          ...quota.map((r) => ({ kind: "quota_check" as const, at: r.occurred_at, data: r })),
          ...audit.map((r) => ({ kind: "audit" as const, at: r.occurred_at, data: r })),
          ...outbox.map((r) => ({ kind: "outbox" as const, at: r.occurred_at, data: r })),
        ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

        return Response.json({
          correlationId: cid,
          counts: {
            quota: quota.length,
            audit: audit.length,
            outbox: outbox.length,
            total: timeline.length,
          },
          quotaEvents: quota,
          auditEvents: audit,
          outboxEvents: outbox,
          timeline,
        });
      },
    },
  },
});