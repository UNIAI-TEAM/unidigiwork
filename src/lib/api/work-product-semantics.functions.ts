import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";
import { resolveWorkEntities, entityKey } from "./work-graph.server";
import { workProductFromRow, workProductVersionFromRow, type WorkProductDescriptor } from "@/domain/work-product-semantics";

function asWpRow(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    tenant_id: (r.tenant_id as string | null) ?? null,
    workspace_id: (r.workspace_id as string | null) ?? null,
    title: String(r.title ?? ""),
    business_type: (r.business_type as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    current_version: typeof r.current_version === "number" ? r.current_version : Number(r.current_version ?? 0) || null,
    created_by: (r.created_by as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
    updated_at: (r.updated_at as string | null) ?? null,
  };
}

const WP_NEIGHBOR = new Set(["PRODUCES", "REFERENCES", "RELATED_TO", "REALIZED_AS"]);

export const listWorkProductsForEntity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        entityType: z.enum(["TASK", "MEETING", "WORKSPACE", "DOCUMENT", "WORK_PRODUCT"]),
        entityId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: raw, error } = await context.supabase.rpc("get_work_context", {
      _entity_type: data.entityType,
      _entity_id: data.entityId,
      _limit: data.limit,
    });
    if (error) mapPgError(error, "WORK_GRAPH_ENTITY_FORBIDDEN");
    const payload = (raw ?? {}) as {
      relationships?: {
        type: string;
        direction: "IN" | "OUT";
        entityType: string;
        entityId: string;
      }[];
    };
    const rels = payload.relationships ?? [];
    const wpIds = new Set<string>();
    if (data.entityType === "WORK_PRODUCT") wpIds.add(data.entityId);
    for (const r of rels) {
      if (r.entityType !== "WORK_PRODUCT") continue;
      if (!WP_NEIGHBOR.has(r.type)) continue;
      wpIds.add(r.entityId);
    }
    const ids = [...wpIds];
    if (ids.length === 0) return { workProducts: [] as WorkProductDescriptor[] };
    const { data: rows, error: dErr } = await context.supabase
      .from("work_products" as never)
      .select("id,tenant_id,workspace_id,title,business_type,status,current_version,created_by,created_at,updated_at")
      .in("id", ids);
    if (dErr) mapPgError(dErr);
    return { workProducts: (rows ?? []).map((r) => workProductFromRow(asWpRow(r as Record<string, unknown>))) };
  });

/** Semantic Work Product read — distinct from WEE `getWorkProduct` (work_units catalog). */
export const getWorkProductDescriptor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ workProductId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("work_products" as never)
      .select("id,tenant_id,workspace_id,title,business_type,status,current_version,created_by,created_at,updated_at")
      .eq("id", data.workProductId)
      .maybeSingle();
    if (error) mapPgError(error);
    if (!row) return { workProduct: null, versions: [], context: { relationships: [] } };
    const { data: versions, error: vErr } = await context.supabase
      .from("work_product_versions" as never)
      .select("id,work_product_id,version,summary,title,ai_generated,created_at")
      .eq("work_product_id", data.workProductId)
      .order("version", { ascending: true });
    if (vErr) mapPgError(vErr);
    const { data: raw, error: gErr } = await context.supabase.rpc("get_work_context", {
      _entity_type: "WORK_PRODUCT",
      _entity_id: data.workProductId,
      _limit: 50,
    });
    if (gErr) mapPgError(gErr, "WORK_GRAPH_ENTITY_FORBIDDEN");
    const payload = (raw ?? {}) as {
      relationships?: {
        edgeId: string;
        type: string;
        direction: "IN" | "OUT";
        origin: string;
        entityType: string;
        entityId: string;
        createdAt: string;
      }[];
    };
    const rels = payload.relationships ?? [];
    const resolved = await resolveWorkEntities(
      context.supabase,
      rels.map((r) => ({ type: r.entityType, id: r.entityId })),
    );
    const relationships = rels
      .map((r) => {
        const entity = resolved.get(entityKey(r.entityType, r.entityId));
        if (!entity) return null;
        return { relationship: r.type, direction: r.direction, origin: r.origin, entity };
      })
      .filter(Boolean);
    return {
      workProduct: workProductFromRow(asWpRow(row as Record<string, unknown>)),
      versions: (versions ?? []).map((v) =>
        workProductVersionFromRow({
          id: String((v as Record<string, unknown>).id),
          work_product_id: String((v as Record<string, unknown>).work_product_id),
          version: Number((v as Record<string, unknown>).version),
          summary: ((v as Record<string, unknown>).summary as string | null) ?? null,
          title: ((v as Record<string, unknown>).title as string | null) ?? null,
          ai_generated: Boolean((v as Record<string, unknown>).ai_generated),
          created_at: String((v as Record<string, unknown>).created_at ?? ""),
        }),
      ),
      context: { relationships },
    };
  });
