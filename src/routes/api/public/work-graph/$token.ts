import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/work-graph/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String((params as { token: string }).token ?? "");
        if (!/^[a-z0-9]{16,64}$/.test(token)) {
          return Response.json({ ok: false, error: "INVALID_LINK" }, { status: 404 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { hashShareToken, buildPublicWorkGraph } = await import(
          "@/lib/api/work-graph-share.server"
        );

        const tokenHash = await hashShareToken(token);
        const { data: share } = await (supabaseAdmin as any)
          .from("work_graph_public_shares")
          .select(
            "id, tenant_id, label, include_tasks, include_documents, expires_at, revoked_at, view_count",
          )
          .eq("token_hash", tokenHash)
          .maybeSingle();

        if (!share || share.revoked_at || new Date(share.expires_at).getTime() < Date.now()) {
          return Response.json({ ok: false, error: "LINK_EXPIRED" }, { status: 404 });
        }

        const [{ data: tenant }, graph] = await Promise.all([
          (supabaseAdmin as any)
            .from("tenants")
            .select("name")
            .eq("id", share.tenant_id)
            .maybeSingle(),
          buildPublicWorkGraph(supabaseAdmin, {
            tenantId: share.tenant_id,
            includeTasks: share.include_tasks,
            includeDocuments: share.include_documents,
          }),
        ]);

        await (supabaseAdmin as any)
          .from("work_graph_public_shares")
          .update({
            view_count: (share.view_count ?? 0) + 1,
            last_viewed_at: new Date().toISOString(),
          })
          .eq("id", share.id);

        return Response.json(
          {
            ok: true,
            label: share.label,
            tenantName: tenant?.name ?? null,
            expiresAt: share.expires_at,
            nodes: graph.nodes,
            edges: graph.edges,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
