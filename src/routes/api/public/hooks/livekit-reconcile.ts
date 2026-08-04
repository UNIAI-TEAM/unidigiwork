// ADR-1E-001 — Đối soát định kỳ (2 phút, grace 5 phút): meeting còn `live` trong DB
// nhưng phòng đã biến mất trên cụm LiveKit ⇒ phát một `room_finished` tổng hợp
// qua đúng RPC `ingest_meeting_provider_event` (một writer duy nhất, idempotent).
import { createFileRoute } from "@tanstack/react-router";

const GRACE_SECONDS = 300;

export const Route = createFileRoute("/api/public/hooks/livekit-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { readLiveKitConfig, listRooms } = await import("@/lib/api/livekit.server");
        const config = readLiveKitConfig();
        if (!config) return new Response("Not configured", { status: 503 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - GRACE_SECONDS * 1000).toISOString();

        const { data: stale, error } = await supabaseAdmin
          .from("meetings")
          .select("id, start_at, updated_at, conference_ref")
          .eq("status", "live")
          .lt("updated_at", cutoff)
          .limit(200);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!stale || stale.length === 0) return Response.json({ ok: true, checked: 0, finalized: 0 });

        let activeNames: Set<string>;
        try {
          const rooms = await listRooms(config);
          activeNames = new Set(rooms.map((r) => r.name).filter((n): n is string => Boolean(n)));
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          // Cụm không trả lời ⇒ không finalize gì cả, tránh cắt nhầm phòng đang chạy.
          return Response.json({ ok: false, error: message }, { status: 502 });
        }

        const finalized: string[] = [];
        for (const meeting of stale) {
          if (activeNames.has(`mtg_${meeting.id}`)) continue;

          const { data: events } = await supabaseAdmin
            .from("meeting_provider_events")
            .select("occurred_at, room_sid")
            .eq("meeting_id", meeting.id)
            .order("occurred_at", { ascending: true });

          const first = events?.[0]?.occurred_at ?? meeting.start_at;
          const last = events?.[events.length - 1]?.occurred_at ?? meeting.updated_at;
          const durationSeconds = Math.max(
            0,
            Math.floor((new Date(last).getTime() - new Date(first).getTime()) / 1000),
          );
          const roomSid = events?.find((e) => e.room_sid)?.room_sid ?? null;

          const { data, error: rpcError } = await supabaseAdmin.rpc("ingest_meeting_provider_event", {
            _meeting_id: meeting.id,
            _event_id: `reconcile:${meeting.id}`,
            _event_type: "room_finished",
            _room_sid: roomSid ?? undefined,
            _duration_seconds: durationSeconds,
            _occurred_at: new Date().toISOString(),
            _payload: { source: "reconciliation", graceSeconds: GRACE_SECONDS },
            _correlation_id: `livekit-reconcile:${meeting.id}`,
          });
          if (!rpcError && data) finalized.push(meeting.id);
        }

        return Response.json({ ok: true, checked: stale.length, finalized: finalized.length, ids: finalized });
      },
    },
  },
});