// Batch 1D-API — Meetings server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { mapPgError, ensureOk } from "./business.server";

const rsvpSchema = z.enum(["pending", "accepted", "declined", "tentative"]);

export const listMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workspaceId: z.string().uuid(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("meetings").select("*")
      .eq("workspace_id", data.workspaceId).is("deleted_at", null)
      .order("start_at", { ascending: true }).limit(data.limit);
    if (data.from) q = q.gte("start_at", data.from);
    if (data.to) q = q.lte("start_at", data.to);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    return rows ?? [];
  });

export const scheduleMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      workspaceId: z.string().uuid(),
      title: z.string().min(1).max(500),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      agenda: z.string().max(10000).optional(),
      timezone: z.string().max(64).default("UTC"),
      rrule: z.string().max(500).optional(),
      location: z.string().max(500).optional(),
      participantIds: z.array(z.string().uuid()).max(200).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("schedule_meeting", {
      _workspace_id: data.workspaceId,
      _title: data.title,
      _start_at: data.startAt,
      _end_at: data.endAt,
      _agenda: data.agenda ?? undefined,
      _timezone: data.timezone,
      _rrule: data.rrule ?? undefined,
      _location: data.location ?? undefined,
      _participant_ids: data.participantIds ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND");
  });

export const updateMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      meetingId: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      agenda: z.string().max(10000).optional(),
      startAt: z.string().datetime().optional(),
      endAt: z.string().datetime().optional(),
      timezone: z.string().max(64).optional(),
      location: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("update_meeting", {
      _meeting_id: data.meetingId,
      _title: data.title ?? undefined,
      _agenda: data.agenda ?? undefined,
      _start_at: data.startAt ?? undefined,
      _end_at: data.endAt ?? undefined,
      _timezone: data.timezone ?? undefined,
      _location: data.location ?? undefined,
      _expected_row_version: data.expectedRowVersion ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND");
  });

export const cancelMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      meetingId: z.string().uuid(),
      reason: z.string().max(1000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("cancel_meeting", {
      _meeting_id: data.meetingId,
      _reason: data.reason ?? undefined,
      _expected_row_version: data.expectedRowVersion ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND");
  });

export const setMeetingRsvp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      meetingId: z.string().uuid(),
      rsvp: rsvpSchema,
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("set_meeting_rsvp", {
      _meeting_id: data.meetingId,
      _rsvp: data.rsvp,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND");
  });