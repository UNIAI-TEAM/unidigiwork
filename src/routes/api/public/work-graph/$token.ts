import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/work-graph/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = String((params as { token: string }).token ?? "");
        if (!/^[a-z0-9]{16,64}$/.test(token)) {
          return Response.json({ ok: false, error: "INVALID_LINK" }, { status: 404 });
        }

        // Liên kết chia sẻ chỉ mở cho thành viên đã đăng nhập bằng email.
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
        }
        const bearer = authHeader.slice("Bearer ".length).trim();
        if (!bearer) {
          return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
        }
        const { createClient } = await import("@supabase/supabase-js");
        const authClient = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );
        const { data: userData, error: userError } = await authClient.auth.getUser(bearer);
        const viewerId = userData?.user?.id;
        if (userError || !viewerId) {
          return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { hashShareToken, buildPublicWorkGraph } =
          await import("@/lib/api/work-graph-share.server");

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

        const { data: membership } = await (supabaseAdmin as any)
          .from("tenant_members")
          .select("user_id")
          .eq("tenant_id", share.tenant_id)
          .eq("user_id", viewerId)
          .eq("status", "active")
          .maybeSingle();
        if (!membership) {
          return Response.json({ ok: false, error: "NOT_A_MEMBER" }, { status: 403 });
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
