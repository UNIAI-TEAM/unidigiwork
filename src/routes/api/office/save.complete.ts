// GO-2C — POST /api/office/save/complete
// Ghi CHÍNH XÁC một document_versions mới. Không bao giờ UPDATE/DELETE phiên bản cũ.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  DOCUMENTS_BUCKET,
  OfficeError,
  SUPPORTED_MIME,
  actorCanAccessDocument,
  authenticateOfficeSession,
  emitOutbox,
  extOf,
  latestVersion,
  logDocumentAccess,
  officeFail,
  officeJson,
} from "@/lib/api/office-bridge.server";

const bodySchema = z.object({
  saveOperationId: z.string().uuid(),
  sizeBytes: z.number().int().nonnegative().optional(),
  checksumSha256: z.string().max(128).optional(),
  comment: z.string().max(500).optional(),
});

export const Route = createFileRoute("/api/office/save/complete")({
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

          const { data: op } = await admin
            .from("office_save_operations")
            .select("*")
            .eq("id", input.saveOperationId)
            .eq("session_id", session.id)
            .maybeSingle();
          if (!op) throw new OfficeError("SAVE_OPERATION_NOT_FOUND", 404);

          // Idempotency: lần gọi lặp trả về đúng kết quả cũ, không tạo phiên bản thừa.
          if (op.status === "COMPLETED") {
            return officeJson({
              ok: true,
              idempotent: true,
              documentId: op.document_id,
              version: Number(op.result_version ?? 0),
              versionId: op.result_version_id,
            });
          }

          const { data: doc } = await admin
            .from("documents")
            .select("id, title, tenant_id, workspace_id, created_by")
            .eq("id", session.document_id)
            .is("deleted_at", null)
            .maybeSingle();
          if (!doc) throw new OfficeError("DOCUMENT_NOT_FOUND", 404);

          const allowed = await actorCanAccessDocument(admin, session.user_id, doc);
          if (!allowed) throw new OfficeError("PERMISSION_DENIED", 403);

          const latest = await latestVersion(admin, doc.id);
          if (latest !== Number(op.base_version)) {
            await admin
              .from("office_save_operations")
              .update({ status: "CONFLICT", error_code: "VERSION_CONFLICT" })
              .eq("id", op.id);
            return officeJson(
              {
                ok: false,
                error: "VERSION_CONFLICT",
                baseVersion: Number(op.base_version),
                latestVersion: latest,
              },
              409,
            );
          }

          const bucket = op.upload_bucket ?? DOCUMENTS_BUCKET;
          const objectKey = op.upload_object_key ?? "";
          const ext = extOf(objectKey);
          if (!ext) throw new OfficeError("UNSUPPORTED_FORMAT", 415);

          // Xác nhận tệp đã thực sự được tải lên.
          const dir = objectKey.split("/").slice(0, -1).join("/");
          const name = objectKey.split("/").pop() ?? "";
          const { data: listed } = await admin.storage.from(bucket).list(dir, { search: name });
          const found = (listed ?? []).find((f) => f.name === name);
          if (!found) throw new OfficeError("UPLOAD_NOT_FOUND", 409);

          const sizeBytes =
            input.sizeBytes ??
            (typeof (found.metadata as Record<string, unknown> | null)?.["size"] === "number"
              ? ((found.metadata as Record<string, number>)["size"] as number)
              : null);
          const mimeType = op.mime_type ?? SUPPORTED_MIME[ext];
          const nextVersion = Number(op.base_version) + 1;

          const { data: created, error: insErr } = await admin
            .from("document_versions")
            .insert({
              document_id: doc.id,
              tenant_id: doc.tenant_id,
              version: nextVersion,
              storage_ref: { provider: "supabase", bucket, objectKey } as never,
              mime_type: mimeType,
              size_bytes: sizeBytes,
              comment: input.comment ?? "UniWork Office",
              author_id: session.user_id,
            })
            .select("id, version, created_at")
            .single();
          if (insErr || !created) {
            await admin
              .from("office_save_operations")
              .update({ status: "FAILED", error_code: "VERSION_INSERT_FAILED" })
              .eq("id", op.id);
            throw new OfficeError("VERSION_INSERT_FAILED", 500);
          }

          // Con trỏ tài liệu trỏ sang phiên bản mới; lịch sử cũ giữ nguyên.
          await admin
            .from("documents")
            .update({
              current_version: nextVersion,
              storage_ref: { provider: "supabase", bucket, objectKey } as never,
              mime_type: mimeType,
              size_bytes: sizeBytes,
              updated_by: session.user_id,
            })
            .eq("id", doc.id);

          await admin
            .from("office_save_operations")
            .update({
              status: "COMPLETED",
              result_version: nextVersion,
              result_version_id: created.id,
              size_bytes: sizeBytes,
              checksum_sha256: input.checksumSha256 ?? null,
              completed_at: new Date().toISOString(),
            })
            .eq("id", op.id);

          await admin
            .from("office_sessions")
            .update({
              base_version: nextVersion,
              last_save_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.id);

          await logDocumentAccess(admin, {
            tenantId: doc.tenant_id,
            workspaceId: doc.workspace_id,
            documentId: doc.id,
            documentTitle: doc.title,
            actorId: session.user_id,
            action: "export",
            version: nextVersion,
            context: { source: "office_bridge", event: "OFFICE_SAVE_COMPLETED" },
          });

          await emitOutbox(admin, {
            tenantId: doc.tenant_id,
            eventType: "document.version.created",
            aggregateId: doc.id,
            idempotencyKey: `office-save:${op.id}`,
            payload: {
              documentId: doc.id,
              workspaceId: doc.workspace_id,
              version: nextVersion,
              versionId: created.id,
              source: "OFFICE_BRIDGE",
              actorId: session.user_id,
            },
          });

          return officeJson({
            ok: true,
            documentId: doc.id,
            version: nextVersion,
            versionId: created.id,
            createdAt: created.created_at,
          });
        } catch (e) {
          return officeFail(e);
        }
      },
    },
  },
});
