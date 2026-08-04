// ADR-1E-001 §2.5.1 — LiveKit self-host gửi webhook trực tiếp tới UNIWORK.
// Bảo mật hoàn toàn dựa vào verify chữ ký trước khi parse body.
import { createFileRoute } from "@tanstack/react-router";

interface LiveKitEvent {
  id?: string;
  event?: string;
  createdAt?: number;
  room?: { name?: string; sid?: string; numParticipants?: number; duration?: number };
  participant?: { identity?: string };
}

const HANDLED = new Set(["room_started", "participant_joined", "participant_left", "room_finished"]);

export const Route = createFileRoute("/api/public/hooks/livekit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LIVEKIT_WEBHOOK_SECRET"] ?? process.env["LIVEKIT_API_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const rawBody = await request.text();
        const { verifyWebhook, meetingIdFromRoom } = await import("@/lib/api/livekit.server");
        const ok = await verifyWebhook(request.headers.get("authorization"), rawBody, secret);
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let event: LiveKitEvent;
        try {
          event = JSON.parse(rawBody) as LiveKitEvent;
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const meetingId = meetingIdFromRoom(event.room?.name);
        // Sự kiện của ứng dụng khác trên cùng cụm ⇒ bỏ qua, không log payload.
        if (!meetingId) return Response.json({ ok: true, ignored: true });

        const eventId = event.id ?? `${event.event ?? "unknown"}:${event.room?.sid ?? ""}:${event.createdAt ?? ""}`;
        const correlationId = `livekit:${event.room?.sid ?? meetingId}`;
        const eventType = event.event ?? "unknown";
        if (!HANDLED.has(eventType)) return Response.json({ ok: true, ignored: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          const { data, error } = await supabaseAdmin.rpc("ingest_meeting_provider_event", {
            _meeting_id: meetingId,
            _event_id: eventId,
            _event_type: eventType,
            _room_sid: event.room?.sid ?? undefined,
            _participant_identity: event.participant?.identity ?? undefined,
            _duration_seconds: event.room?.duration ?? 0,
            _occurred_at: new Date((event.createdAt ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
            _payload: { numParticipants: event.room?.numParticipants ?? null },
            _correlation_id: correlationId,
          });
          if (error) throw new Error(error.message);
          return Response.json({ ok: true, result: data });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});