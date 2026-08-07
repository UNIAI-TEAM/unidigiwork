// Global Search — server functions backed by public.global_search RPC.
// RLS applies (SECURITY INVOKER), so users only see data in their workspaces.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";

export const searchAll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        q: z.string().max(200).optional(),
        kind: z
          .enum(["all", "meeting", "task", "deadline", "document", "person"])
          .default("all"),
        workspaceId: z.string().uuid().optional(),
        assigneeId: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        sort: z.enum(["relevance", "time"]).default("relevance"),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("global_search", {
      _q: data.q ?? undefined,
      _kinds: data.kind === "all" ? undefined : [data.kind],
      _workspace_id: data.workspaceId ?? undefined,
      _assignee_id: data.assigneeId ?? undefined,
      _from: data.from ? `${data.from}T00:00:00Z` : undefined,
      _to: data.to ? `${data.to}T23:59:59Z` : undefined,
      _sort: data.sort,
      _limit: data.limit,
      _offset: data.offset,
    });
    if (error) mapPgError(error);
    const list = (rows ?? []) as Array<Record<string, unknown>>;
    const first = list[0];
    return {
      items: list.map((r) => ({
        id: String(r["id"]),
        kind: String(r["kind"]),
        title: String(r["title"] ?? ""),
        snippet: String(r["snippet"] ?? ""),
        occurredAt: (r["occurred_at"] as string | null) ?? null,
        workspaceId: (r["workspace_id"] as string | null) ?? null,
        workspaceName: (r["workspace_name"] as string | null) ?? null,
        ownerId: (r["owner_id"] as string | null) ?? null,
        ownerName: (r["owner_name"] as string | null) ?? null,
      })),
      total: first ? Number(first["total_count"] ?? 0) : 0,
      counts: (first?.["kind_counts"] as Record<string, number> | undefined) ?? {},
      nextOffset: data.offset + list.length,
      hasMore: first ? data.offset + list.length < Number(first["total_count"] ?? 0) : false,
    };
  });

export const getSearchFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: memberships } = await context.supabase
      .from("workspace_members")
      .select("workspace_id, workspaces(id, name)");
    const workspaces = Array.from(
      new Map(
        ((memberships ?? []) as Array<{ workspaces: { id: string; name: string } | null }>)
          .map((m) => m.workspaces)
          .filter((w): w is { id: string; name: string } => Boolean(w))
          .map((w) => [w.id, w]),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name));

    const { data: people } = await context.supabase
      .from("users")
      .select("id, display_name, primary_email")
      .limit(200);
    const assignees = ((people ?? []) as Array<{
      id: string;
      display_name: string | null;
      primary_email: string | null;
    }>)
      .map((u) => ({ id: u.id, name: u.display_name ?? u.primary_email ?? "Người dùng" }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { workspaces, assignees };
  });
