// GO-2C — POST /api/office/sessions/exchange
// Đổi token khởi chạy dùng-một-lần lấy chứng thư phiên Office (chỉ phạm vi 1 tài liệu).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  OfficeError,
  SESSION_TTL_MS,
  adminClient,
  hashToken,
  newOpaqueToken,
  officeFail,
  officeJson,
  originOf,
} from "@/lib/api/office-bridge.server";

const bodySchema = z.object({ token: z.string().min(10).max(200) });

export const Route = createFileRoute("/api/office/sessions/exchange")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let input: z.infer<typeof bodySchema>;
          try {
            input = bodySchema.parse(await request.json());
          } catch {
            throw new OfficeError("BAD_REQUEST", 400);
          }

          const admin = await adminClient();
          const launchHash = await hashToken(input.token);
          const { data: session } = await admin
            .from("office_sessions")
            .select("*")
            .eq("launch_token_hash", launchHash)
            .maybeSingle();
          if (!session) throw new OfficeError("INVALID_TOKEN", 401);
          if (session.status !== "CREATED") throw new OfficeError("TOKEN_ALREADY_USED", 409);
          if (new Date(session.launch_expires_at).getTime() < Date.now()) {
            await admin.from("office_sessions").update({ status: "EXPIRED" }).eq("id", session.id);
            throw new OfficeError("TOKEN_EXPIRED", 401);
          }

          const sessionToken = newOpaqueToken();
          const sessionHash = await hashToken(sessionToken);
          const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

          // Dùng-một-lần: chỉ đổi được khi vẫn còn ở trạng thái CREATED.
          const { data: updated } = await admin
            .from("office_sessions")
            .update({
              status: "ACTIVE",
              session_token_hash: sessionHash,
              session_expires_at: sessionExpiresAt,
              consumed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.id)
            .eq("status", "CREATED")
            .select("id")
            .maybeSingle();
          if (!updated) throw new OfficeError("TOKEN_ALREADY_USED", 409);

          const { data: doc } = await admin
            .from("documents")
            .select("id, title")
            .eq("id", session.document_id)
            .maybeSingle();

          const origin = originOf(request);
          return officeJson({
            ok: true,
            sessionId: session.id,
            sessionToken,
            expiresAt: sessionExpiresAt,
            document: {
              id: session.document_id,
              title: doc?.title ?? null,
              fileName: session.file_name,
              mimeType: session.mime_type,
              baseVersion: Number(session.base_version),
            },
            endpoints: {
              download: `${origin}/api/office/download`,
              savePrepare: `${origin}/api/office/save/prepare`,
              saveComplete: `${origin}/api/office/save/complete`,
            },
          });
        } catch (e) {
          return officeFail(e);
        }
      },
    },
  },
});
