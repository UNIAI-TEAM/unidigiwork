// GO-2C — GET /api/office/download
// Tải tệp theo phiên Office. Desktop không cần biết bucket hay khoá Supabase.
import { createFileRoute } from "@tanstack/react-router";
import {
  DOCUMENTS_BUCKET,
  OfficeError,
  actorCanAccessDocument,
  asStorageRef,
  authenticateOfficeSession,
  logDocumentAccess,
  officeFail,
} from "@/lib/api/office-bridge.server";

async function handle(request: Request) {
  try {
    const { admin, session } = await authenticateOfficeSession(request);

    const { data: doc } = await admin
      .from("documents")
      .select("id, title, tenant_id, workspace_id, created_by, storage_ref")
      .eq("id", session.document_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!doc) throw new OfficeError("DOCUMENT_NOT_FOUND", 404);

    // Quyền có thể đã bị thu hồi sau khi tạo phiên.
    const allowed = await actorCanAccessDocument(admin, session.user_id, doc);
    if (!allowed) throw new OfficeError("PERMISSION_DENIED", 403);

    const { data: version } = await admin
      .from("document_versions")
      .select("storage_ref")
      .eq("document_id", session.document_id)
      .eq("version", session.base_version)
      .maybeSingle();

    const ref = asStorageRef(version?.storage_ref) ?? asStorageRef(doc.storage_ref);
    if (!ref) throw new OfficeError("FILE_NOT_FOUND", 404);

    const { data: signed, error } = await admin.storage
      .from(ref.bucket || DOCUMENTS_BUCKET)
      .createSignedUrl(ref.objectKey, 120, { download: session.file_name ?? true });
    if (error || !signed) throw new OfficeError("FILE_NOT_FOUND", 404);

    await logDocumentAccess(admin, {
      tenantId: doc.tenant_id,
      workspaceId: doc.workspace_id,
      documentId: doc.id,
      documentTitle: doc.title,
      actorId: session.user_id,
      action: "download",
      version: Number(session.base_version),
      context: { source: "office_bridge", event: "OFFICE_DOCUMENT_OPENED" },
    });

    return new Response(null, {
      status: 302,
      headers: { location: signed.signedUrl, "cache-control": "no-store" },
    });
  } catch (e) {
    return officeFail(e);
  }
}

export const Route = createFileRoute("/api/office/download")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
