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
        const idempotencyKey = `livekit:${eventId}`;
        const correlationId = `livekit:${event.room?.sid ?? meetingId}`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          if (event.event === "room_finished") {
            const minutes = Math.ceil((event.room?.duration ?? 0) / 60);
            if (minutes > 0) {
              await supabaseAdmin.rpc("record_meeting_usage", {
                _meeting_id: meetingId,
                _participant_minutes: minutes,
                _idempotency_key: idempotencyKey,
                _correlation_id: correlationId,
              });
            }
            await supabaseAdmin.rpc("finalize_meeting_from_provider", {
              _meeting_id: meetingId,
              _idempotency_key: idempotencyKey,
              _correlation_id: correlationId,
            });
          }
          return Response.json({ ok: true });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});