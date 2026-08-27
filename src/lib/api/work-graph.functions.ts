// Work Graph Foundation V1 — trusted API surface.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";
import { resolveWorkEntities, entityKey } from "./work-graph.server";
import { WORK_ENTITY_TYPES, WORK_RELATIONSHIP_CODES, isRelationshipAllowed } from "@/domain/work-graph/relationship-types";

const entityTypeSchema = z.enum(WORK_ENTITY_TYPES);
const relationshipSchema = z.enum(WORK_RELATIONSHIP_CODES);

export const getWorkContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        entityType: entityTypeSchema,
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
    // Batched, permission-aware resolution — anything invisible is dropped.
    const resolved = await resolveWorkEntities(
      context.supabase,
      rels.map((r) => ({ type: r.entityType, id: r.entityId })),
    );

    const items = rels
      .map((r) => {
        const target = resolved.get(entityKey(r.entityType, r.entityId));
        if (!target) return null;
        return {
          edgeId: r.edgeId,
          relationship: r.type,
          direction: r.direction,
          origin: r.origin,
          canUnlink: r.origin === "USER",
          entity: target,
          createdAt: r.createdAt,
        };
      })
      .filter(Boolean);

    return {
      entity: { type: data.entityType, id: data.entityId },
      relationships: items as NonNullable<(typeof items)[number]>[],
    };
  });

export const linkWorkEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        sourceType: entityTypeSchema,
        sourceId: z.string().uuid(),
        targetType: entityTypeSchema,
        targetId: z.string().uuid(),
        relationship: relationshipSchema,
      })
      .refine((v) => isRelationshipAllowed(v.relationship, v.sourceType, v.targetType, true), {
        message: "WORK_GRAPH_RELATION_INVALID",
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("link_work_entities", {
      _source_type: data.sourceType,
      _source_id: data.sourceId,
      _target_type: data.targetType,
      _target_id: data.targetId,
      _relationship: data.relationship,
      _metadata: {},
    });
    if (error) mapPgError(error, "WORK_GRAPH_RELATION_INVALID");
    return res as { edgeId: string; created: boolean };
  });

export const unlinkWorkEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ edgeId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("unlink_work_entities", {
      _edge_id: data.edgeId,
    });
    if (error) mapPgError(error, "WORK_GRAPH_EDGE_PROTECTED");
    return res as { deleted: boolean };
  });

/** Permission-aware, tenant-scoped picker search. Bounded per entity type. */
export const searchLinkableEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        query: z.string().min(2).max(120),
        types: z.array(entityTypeSchema).min(1).max(6),
        limit: z.number().int().min(1).max(20).default(10),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const term = `%${data.query.replace(/[%_]/g, "")}%`;
    const results: { type: string; id: string; title: string; subtitle: string | null }[] = [];

    const push = (type: string, rows: any[] | null, titleKey: string, subKey?: string) => {
      (rows ?? []).forEach((r) =>
        results.push({
          type,
          id: r.id,
          title: r[titleKey] ?? "(Không tiêu đề)",
          subtitle: subKey ? (r[subKey] ?? null) : null,
        }),
      );
    };

    const jobs: PromiseLike<void>[] = [];
    for (const t of data.types) {
      switch (t) {
        case "TASK":
          jobs.push(
            context.supabase.from("tasks").select("id,title,status").ilike("title", term)
              .is("deleted_at", null).limit(data.limit)
              .then(({ data: rows }) => push("TASK", rows, "title", "status")),
          );
          break;
        case "WORKSPACE":
          jobs.push(
            context.supabase.from("workspaces").select("id,name").ilike("name", term).limit(data.limit)
              .then(({ data: rows }) => push("WORKSPACE", rows, "name")),
          );
          break;
        case "MEETING":
          jobs.push(
            context.supabase.from("meetings").select("id,title,start_at").ilike("title", term).limit(data.limit)
              .then(({ data: rows }) => push("MEETING", rows, "title", "start_at")),
          );
          break;
        case "DOCUMENT":
          jobs.push(
            context.supabase.from("documents").select("id,title,folder").ilike("title", term)
              .is("deleted_at", null).limit(data.limit)
              .then(({ data: rows }) => push("DOCUMENT", rows, "title", "folder")),
          );
          break;
        case "EMAIL":
          jobs.push(
            context.supabase.from("email_threads").select("id,subject").ilike("subject", term)
              .is("deleted_at", null).limit(data.limit)
              .then(({ data: rows }) => push("EMAIL", rows, "subject")),
          );
          break;
        case "CHAT_CHANNEL":
          jobs.push(
            context.supabase.from("chat_channels").select("id,name").ilike("name", term)
              .is("deleted_at", null).limit(data.limit)
              .then(({ data: rows }) => push("CHAT_CHANNEL", rows, "name")),
          );
          break;
        default:
          break;
      }
    }
    await Promise.all(jobs);
    return results.slice(0, data.limit * data.types.length);
  });