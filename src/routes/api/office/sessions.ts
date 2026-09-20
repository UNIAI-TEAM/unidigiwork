// GO-2C — POST /api/office/sessions
// Tạo phiên mở tài liệu bằng UniWork Office. Người dùng đăng nhập UniWork là bắt buộc.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  LAUNCH_TTL_MS,
  OfficeError,
  asStorageRef,
  authenticateUser,
  adminClient,
  extOf,
  fileNameOfRef,
  hashToken,
  latestVersion,
  logDocumentAccess,
  newOpaqueToken,
  officeFail,
  officeJson,
} from "@/lib/api/office-bridge.server";

const bodySchema = z.object({ documentId: z.string().uuid() });

export const Route = createFileRoute("/api/office/sessions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabase, userId } = await authenticateUser(request);
          let input: z.infer<typeof bodySchema>;
          try {
            input = bodySchema.parse(await request.json());
          } catch {
            throw new OfficeError("BAD_REQUEST", 400);
          }

          // RLS quyết định quyền đọc; không tin tenant/workspace từ client.
          const { data: doc } = await supabase
            .from("documents")
            .select(
              "id, title, tenant_id, workspace_id, storage_ref, mime_type, created_by, current_version",
            )
            .eq("id", input.documentId)
            .is("deleted_at", null)
            .maybeSingle();
          if (!doc) throw new OfficeError("PERMISSION_DENIED", 403);

          const ref = asStorageRef(doc.storage_ref);
          if (!ref) throw new OfficeError("FILE_NOT_FOUND", 400);
          const fileName = fileNameOfRef(ref);
          const ext = extOf(fileName);
          if (!ext) throw new OfficeError("UNSUPPORTED_FORMAT", 415);

          const admin = await adminClient();
          const base = (await latestVersion(admin, doc.id)) || Number(doc.current_version ?? 1);

          const launchToken = newOpaqueToken();
          const launchHash = await hashToken(launchToken);
          const expiresAt = new Date(Date.now() + LAUNCH_TTL_MS).toISOString();

          const { data: session, error } = await admin
            .from("office_sessions")
            .insert({
              tenant_id: doc.tenant_id,
              workspace_id: doc.workspace_id,
              document_id: doc.id,
              user_id: userId,
              base_version: base,
              mime_type: doc.mime_type,
              file_name: fileName,
              status: "CREATED",
              launch_token_hash: launchHash,
              launch_expires_at: expiresAt,
            })
            .select("id")
            .single();
          if (error || !session) throw new OfficeError("SESSION_FAILED", 500);

          await logDocumentAccess(admin, {
            tenantId: doc.tenant_id,
            workspaceId: doc.workspace_id,
            documentId: doc.id,
            documentTitle: doc.title,
            actorId: userId,
            action: "view",
            version: base,
            context: { source: "office_bridge", event: "OFFICE_SESSION_CREATED" },
          });

          return officeJson({
            ok: true,
            sessionId: session.id,
            launchUrl: `uniwork://office/open?token=${encodeURIComponent(launchToken)}`,
            expiresAt,
            baseVersion: base,
            fileName,
            format: ext.toUpperCase(),
          });
        } catch (e) {
          return officeFail(e);
        }
      },
    },
  },
});
