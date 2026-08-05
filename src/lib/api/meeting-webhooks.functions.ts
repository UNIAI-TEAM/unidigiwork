// Batch LK-AUDIT — tra cứu webhook LiveKit theo event.id (chỉ đọc, RLS theo tenant).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";

export const listMeetingWebhookEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        search: z.string().max(200).optional(),
        eventType: z.string().max(64).optional(),
        meetingId: z.string().uuid().optional(),
        status: z.enum(["all", "applied", "duplicate"]).default("all"),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("meeting_provider_events")
      .select(
        "id, provider, event_id, event_type, meeting_id, room_sid, participant_identity, correlation_id, occurred_at, created_at, duplicate_count, last_duplicate_at, payload",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.meetingId) q = q.eq("meeting_id", data.meetingId);
    if (data.eventType) q = q.eq("event_type", data.eventType);
    if (data.status === "duplicate") q = q.gt("duplicate_count", 0);
    if (data.status === "applied") q = q.eq("duplicate_count", 0);
    if (data.search) {
      const s = data.search.trim();
      q = q.or(
        `event_id.ilike.%${s}%,room_sid.ilike.%${s}%,participant_identity.ilike.%${s}%,correlation_id.ilike.%${s}%`,
      );
    }

    const { data: rows, error, count } = await q;
    if (error) mapPgError(error);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const getMeetingWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ eventId: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("meeting_provider_events")
      .select("*")
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (error) mapPgError(error);
    return row ?? null;
  });
