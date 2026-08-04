// Batch 1D-API — Meetings server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { mapPgError, ensureOk } from "./business.server";
import { ApiError } from "@/contracts/errors";

const rsvpSchema = z.enum(["pending", "accepted", "declined", "tentative"]);

export const getMeeting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ meetingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("meetings")
      .select("*, meeting_participants(user_id, role, rsvp)")
      .eq("id", data.meetingId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    if (!row) throw new ApiError({ code: "MEETING_NOT_FOUND", message: "MEETING_NOT_FOUND" });
    return row;
  });

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

// ---------------------------------------------------------------------------
// Batch LK-API — conferencing (ADR-1E-001)
// ---------------------------------------------------------------------------

export const startMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ ...commandMetadataSchema.shape, meetingId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("start_meeting", {
      _meeting_id: data.meetingId,
      _expected_row_version: data.expectedRowVersion ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND");
  });

export const endMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ ...commandMetadataSchema.shape, meetingId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("end_meeting", {
      _meeting_id: data.meetingId,
      _expected_row_version: data.expectedRowVersion ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND");
  });

/**
 * Issue a LiveKit join token. Server-only signing — the client never holds the
 * API secret. Order of checks lives in the `issue_meeting_join_token` RPC.
 */
export const requestJoinToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        meetingId: z.string().uuid(),
        displayName: z.string().max(200).optional(),
        idempotencyKey: z.string().min(8).max(200).optional(),
        correlationId: z.string().max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { readLiveKitConfig, signJoinToken, fingerprint } = await import("./livekit.server");
    const config = readLiveKitConfig();
    if (!config) {
      throw new ApiError({
        code: "CONFERENCE_PROVIDER_UNAVAILABLE",
        message: "LiveKit is not configured",
      });
    }

    const ttlSeconds = 900;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const identity = context.userId;

    // 1. Authorization / entitlement / quota + audit row are all done in the RPC.
    const gate = await context.supabase.rpc("issue_meeting_join_token", {
      _meeting_id: data.meetingId,
      _token_fingerprint: "pending",
      _expires_at: expiresAt.toISOString(),
      _idempotency_key: data.idempotencyKey ?? `join:${data.meetingId}:${identity}:${Date.now()}`,
      _correlation_id: data.correlationId ?? undefined,
    });
    const info = ensureOk(gate, "MEETING_ACCESS_DENIED") as unknown as {
      room_name: string;
      role: "host" | "moderator" | "participant" | "viewer";
      provider: string;
    };

    // 2. Sign the token only after the gate passed.
    let signed: { token: string; expiresAt: Date };
    try {
      signed = await signJoinToken({
        config,
        identity,
        name: data.displayName ?? undefined,
        room: info.room_name,
        role: info.role,
        ttlSeconds,
      });
    } catch {
      throw new ApiError({ code: "MEETING_TOKEN_ISSUE_FAILED", message: "Failed to sign token" });
    }

    // 3. Replace the placeholder fingerprint with the real one (never the token).
    const fp = await fingerprint(signed.token);
    await context.supabase
      .from("meeting_join_tokens")
      .update({ token_fingerprint: fp })
      .eq("meeting_id", data.meetingId)
      .eq("user_id", identity)
      .eq("token_fingerprint", "pending");

    return {
      serverUrl: config.url,
      token: signed.token,
      roomName: info.room_name,
      participantIdentity: identity,
      role: info.role,
      expiresAt: signed.expiresAt.toISOString(),
    };
  });