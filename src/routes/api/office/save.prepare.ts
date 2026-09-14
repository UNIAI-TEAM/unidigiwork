// GO-2C — POST /api/office/save/prepare
// Chuẩn bị ghi phiên bản mới: kiểm tra quyền, phát hiện xung đột, cấp chỗ tải lên có phạm vi.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  DOCUMENTS_BUCKET,
  OfficeError,
  actorCanAccessDocument,
  authenticateOfficeSession,
  extOf,
  latestVersion,
  officeFail,
  officeJson,
} from "@/lib/api/office-bridge.server";

const bodySchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  fileName: z.string().min(1).max(200).optional(),
  mimeType: z.string().max(200).optional(),
  idempotencyKey: z.string().min(8).max(120),
});

function safeName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);
}

export const Route = createFileRoute("/api/office/save/prepare")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { admin, session } = await authenticateOfficeSession(request);
          let input: z.infer<typeof bodySchema>;
          try {
            input = bodySchema.parse(await request.json());
          } catch {
            throw new OfficeError("BAD_REQUEST", 400);
          }

          const { data: doc } = await admin
            .from("documents")
            .select("id, tenant_id, workspace_id, created_by")
            .eq("id", session.document_id)
            .is("deleted_at", null)
            .maybeSingle();
          if (!doc) throw new OfficeError("DOCUMENT_NOT_FOUND", 404);

          const allowed = await actorCanAccessDocument(admin, session.user_id, doc);
          if (!allowed) throw new OfficeError("PERMISSION_DENIED", 403);

          if (input.baseVersion !== Number(session.base_version)) {
            throw new OfficeError("VERSION_CONFLICT", 409);
          }
          const latest = await latestVersion(admin, doc.id);
          if (latest !== Number(session.base_version)) {
            return officeJson(
              {
                ok: false,
                error: "VERSION_CONFLICT",
                baseVersion: input.baseVersion,
                latestVersion: latest,
              },
              409,
            );
          }

          const fileName = safeName(input.fileName ?? session.file_name ?? "document.docx");
          const ext = extOf(fileName);
          if (!ext) throw new OfficeError("UNSUPPORTED_FORMAT", 415);

          // Idempotency: cùng khoá trong cùng phiên trả lại đúng thao tác cũ.
          const { data: existing } = await admin
            .from("office_save_operations")
            .select("*")
            .eq("session_id", session.id)
            .eq("idempotency_key", input.idempotencyKey)
            .maybeSingle();
          if (existing && existing.status === "COMPLETED") {
            return officeJson({
              ok: true,
              saveOperationId: existing.id,
              alreadyCompleted: true,
              version: Number(existing.result_version ?? 0),
            });
          }

          const objectKey =
            existing?.upload_object_key ??
            `${doc.workspace_id}/${doc.id}/${Date.now()}-${fileName}`;

          const { data: upload, error: upErr } = await admin.storage
            .from(DOCUMENTS_BUCKET)
            .createSignedUploadUrl(objectKey, { upsert: true });
          if (upErr || !upload) throw new OfficeError("UPLOAD_PREPARE_FAILED", 500);

          let operationId = existing?.id;
          if (!operationId) {
            const { data: op, error } = await admin
              .from("office_save_operations")
              .insert({
                session_id: session.id,
                tenant_id: doc.tenant_id,
                document_id: doc.id,
                actor_id: session.user_id,
                base_version: session.base_version,
                idempotency_key: input.idempotencyKey,
                status: "PREPARED",
                upload_bucket: DOCUMENTS_BUCKET,
                upload_object_key: objectKey,
                mime_type: input.mimeType ?? session.mime_type,
              })
              .select("id")
              .single();
            if (error || !op) throw new OfficeError("SAVE_PREPARE_FAILED", 500);
            operationId = op.id;
          }

          return officeJson({
            ok: true,
            saveOperationId: operationId,
            baseVersion: Number(session.base_version),
            nextVersion: Number(session.base_version) + 1,
            upload: { url: upload.signedUrl, token: upload.token, method: "PUT" },
          });
        } catch (e) {
          return officeFail(e);
        }
      },
    },
  },
});
