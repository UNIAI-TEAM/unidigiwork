// Khung nhận webhook cho kênh nhắn tin ngoài (Zalo/WhatsApp/Telegram/Viber).
// Chỉ bật khi tổ chức đã có kết nối thật với credential + secret đã xác minh.
// Chưa có kết nối nào được bật => trả 501 thay vì tạo dữ liệu giả.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

const SUPPORTED = new Set(["zalo", "whatsapp", "telegram", "viber"]);

function verifySignature(secret: string, rawBody: string, signature: string | null) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/messaging/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const provider = params.provider;
        if (!SUPPORTED.has(provider)) {
          return new Response("Unknown provider", { status: 404 });
        }

        const secret = process.env[`MESSAGING_WEBHOOK_SECRET_${provider.toUpperCase()}`];
        if (!secret) {
          // Không có secret => kênh chưa được cấu hình thật.
          return new Response(JSON.stringify({ error: "connector_not_configured", provider }), {
            status: 501,
            headers: { "Content-Type": "application/json" },
          });
        }

        const rawBody = await request.text();
        const signature =
          request.headers.get("x-signature") ?? request.headers.get("x-hub-signature-256");
        if (!verifySignature(secret, rawBody, signature)) {
          return new Response("Invalid signature", { status: 401 });
        }

        // Idempotency: sự kiện lặp phải bị bỏ qua dựa trên id sự kiện của nhà cung cấp.
        // Ingest thật sẽ dùng RPC SECURITY DEFINER (unique theo tenant + provider_event_id).
        return new Response(JSON.stringify({ ok: true, ignored: "ingest_not_enabled" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
