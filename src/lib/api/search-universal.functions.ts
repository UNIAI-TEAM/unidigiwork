// Universal Search V2 — unified, permission-aware search entry point.
// One server function powers ⌘K, /search and mobile search.
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";
import { resolveWorkEntities, entityKey } from "./work-graph.server";
import {
  SEARCH_KINDS,
  emptyCounts,
  mapRow,
  searchHref,
  toEntityTypes,
  toKind,
  type SearchKind,
  type UniversalSearchItem,
  type UniversalSearchResult,
} from "./search-universal.server";

const TENANT_COOKIE = "uniwork_active_tenant";

/** Cookie is a hint only — the RPC re-validates membership server-side. */
async function resolveTenantId(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<string | null> {
  const hint = getCookie(TENANT_COOKIE);
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active");
  const ids = ((data ?? []) as Array<{ tenant_id: string }>).map((r) => r.tenant_id);
  if (ids.length === 0) return null;
  if (hint && ids.includes(hint)) return hint;
  return ids.length === 1 ? ids[0] : null;
}

const InputSchema = z.object({
  q: z.string().max(200).default(""),
  kinds: z.array(z.enum(SEARCH_KINDS)).max(SEARCH_KINDS.length).optional(),
  workspaceId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
  expandGraph: z.boolean().default(false),
});

export const universalSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i))
  .handler(async ({ data, context }): Promise<UniversalSearchResult> => {
    const started = Date.now();
    const empty: UniversalSearchResult = {
      items: [],
      total: 0,
      counts: emptyCounts(),
      related: [],
      nextOffset: data.offset,
      hasMore: false,
      tookMs: 0,
    };
    const q = data.q.trim();
    if (q.length < 2) return { ...empty, tookMs: Date.now() - started };

    const tenantId = await resolveTenantId(context.supabase as never, context.userId);
    if (!tenantId) return { ...empty, tookMs: Date.now() - started };

    const { data: rows, error } = await context.supabase.rpc("search_universal", {
      _q: q,
      _tenant_id: tenantId,
      _entity_types: toEntityTypes(data.kinds) ?? undefined,
      _workspace_id: data.workspaceId ?? undefined,
      _limit: data.limit,
      _offset: data.offset,
    });
    if (error) mapPgError(error);

    const list = (rows ?? []) as Array<Record<string, unknown>>;
    const items = list.map(mapRow);
    const first = list[0];
    const total = first ? Number(first["total_count"] ?? 0) : 0;

    const counts = emptyCounts();
    const rawCounts = (first?.["kind_counts"] as Record<string, number> | undefined) ?? {};
    for (const [entityType, n] of Object.entries(rawCounts)) {
      counts[toKind(entityType) as SearchKind] = Number(n);
    }

    // Work Graph depth-1 expansion around the strongest hit (bounded, RLS-safe).
    let related: UniversalSearchItem[] = [];
    if (data.expandGraph && data.offset === 0 && items[0] && items[0].entityType !== "PERSON") {
      const top = items[0];
      const graphType = top.entityType === "PROJECT" ? "WORKSPACE" : top.entityType;
      const { data: ctx } = await context.supabase.rpc("get_work_context", {
        _entity_type: graphType,
        _entity_id: top.id,
        _limit: 12,
      });
      const rels =
        ((ctx ?? {}) as { relationships?: Array<{ entityType: string; entityId: string }> })
          .relationships ?? [];
      if (rels.length) {
        const resolved = await resolveWorkEntities(
          context.supabase,
          rels.map((r) => ({ type: r.entityType, id: r.entityId })),
        );
        const seen = new Set(items.map((i) => `${i.entityType}:${i.id}`));
        related = rels
          .map((r) => resolved.get(entityKey(r.entityType, r.entityId)))
          .filter((e): e is NonNullable<typeof e> => Boolean(e))
          .map((e) => {
            const et = (e.type === "WORKSPACE" ? "PROJECT" : e.type) as UniversalSearchItem["entityType"];
            return {
              id: e.id,
              entityType: et,
              kind: toKind(et),
              title: e.title,
              subtitle: e.subtitle ?? "",
              snippet: "",
              href: searchHref(et, e.id),
              workspaceId: null,
              workspaceName: null,
              occurredAt: e.updatedAt ?? null,
              score: 0,
              matchType: "LEXICAL" as const,
            };
          })
          .filter((e) => !seen.has(`${e.entityType}:${e.id}`))
          .slice(0, 6);
      }
    }

    return {
      items,
      total,
      counts,
      related,
      nextOffset: data.offset + items.length,
      hasMore: data.offset + items.length < total,
      tookMs: Date.now() - started,
    };
  });
