// Cam kết (Commitments): trạng thái, người theo dõi, timeline — một writer qua RPC.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "@/lib/api/business.server";

type Ctx = { supabase: any; userId: string };

export type CommitmentStatus = "OPEN" | "IN_PROGRESS" | "FULFILLED" | "BROKEN" | "CANCELED";

export interface CommitmentDTO {
  id: string;
  workspaceId: string | null;
  title: string;
  description: string | null;
  counterparty: string | null;
  status: CommitmentStatus;
  ownerId: string | null;
  dueAt: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceExcerpt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommitmentEventDTO {
  id: string;
  eventType: "CREATED" | "STATUS_CHANGED" | "NOTE";
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  actorId: string | null;
  createdAt: string;
}

function mapCommitment(r: any): CommitmentDTO {
  return {
    id: r.id,
    workspaceId: r.workspace_id ?? null,
    title: r.title,
    description: r.description ?? null,
    counterparty: r.counterparty ?? null,
    status: r.status,
    ownerId: r.owner_id ?? null,
    dueAt: r.due_at ?? null,
    sourceType: r.source_type ?? null,
    sourceId: r.source_id ?? null,
    sourceExcerpt: r.source_excerpt ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const listCommitments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        status: z.enum(["OPEN", "IN_PROGRESS", "FULFILLED", "BROKEN", "CANCELED"]).nullish(),
        ownerId: z.string().uuid().nullish(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("list_commitments", {
      _status: data.status ?? null,
      _owner_id: data.ownerId ?? null,
      _limit: data.limit,
      _offset: data.offset,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return (rows ?? []).map(mapCommitment) as CommitmentDTO[];
  });

export const createCommitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().nullish(),
        title: z.string().min(1).max(500),
        description: z.string().max(4000).nullish(),
        counterparty: z.string().max(200).nullish(),
        ownerId: z.string().uuid().nullish(),
        dueAt: z.string().datetime({ offset: true }).nullish(),
        sourceType: z.string().max(40).nullish(),
        sourceId: z.string().uuid().nullish(),
        sourceExcerpt: z.string().max(2000).nullish(),
        idempotencyKey: z.string().max(120).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: id, error } = await ctx.supabase.rpc("create_commitment", {
      _workspace_id: data.workspaceId ?? null,
      _title: data.title.trim(),
      _description: data.description ?? null,
      _counterparty: data.counterparty ?? null,
      _owner_id: data.ownerId ?? null,
      _due_at: data.dueAt ?? null,
      _source_type: data.sourceType ?? null,
      _source_id: data.sourceId ?? null,
      _source_excerpt: data.sourceExcerpt ?? null,
      _idempotency_key: data.idempotencyKey ?? null,
    });
    if (error) mapPgError(error, "VALIDATION_FAILED");
    if (!id) throw new ApiError({ code: "VALIDATION_FAILED", message: "COMMITMENT_NOT_CREATED" });

    // Nối Work Graph: cam kết thuộc workspace; nguồn hội thoại nội bộ thì nối ngược.
    if (data.workspaceId) {
      await ctx.supabase.rpc("link_work_entities", {
        _source_type: "COMMITMENT",
        _source_id: id,
        _target_type: "WORKSPACE",
        _target_id: data.workspaceId,
        _relationship: "BELONGS_TO",
        _metadata: { origin: "COMMITMENTS" },
      });
    }
    if (data.sourceType === "CHAT_CHANNEL" && data.sourceId) {
      await ctx.supabase.rpc("link_work_entities", {
        _source_type: "COMMITMENT",
        _source_id: id,
        _target_type: "CHAT_CHANNEL",
        _target_id: data.sourceId,
        _relationship: "DISCUSSED_IN",
        _metadata: { origin: "CONVERSATION_TO_WORK" },
      });
    }
    return { id: id as string };
  });

export const setCommitmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        commitmentId: z.string().uuid(),
        status: z.enum(["OPEN", "IN_PROGRESS", "FULFILLED", "BROKEN", "CANCELED"]),
        note: z.string().max(1000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { error } = await ctx.supabase.rpc("set_commitment_status", {
      _commitment_id: data.commitmentId,
      _status: data.status,
      _note: data.note ?? null,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { ok: true };
  });

export const addCommitmentNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ commitmentId: z.string().uuid(), note: z.string().min(1).max(1000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: id, error } = await ctx.supabase.rpc("add_commitment_note", {
      _commitment_id: data.commitmentId,
      _note: data.note.trim(),
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return { id: id as string };
  });

export const listCommitmentEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ commitmentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("list_commitment_events", {
      _commitment_id: data.commitmentId,
    });
    if (error) mapPgError(error, "PERMISSION_DENIED");
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      eventType: r.event_type,
      fromStatus: r.from_status ?? null,
      toStatus: r.to_status ?? null,
      note: r.note ?? null,
      actorId: r.actor_id ?? null,
      createdAt: r.created_at,
    })) as CommitmentEventDTO[];
  });
