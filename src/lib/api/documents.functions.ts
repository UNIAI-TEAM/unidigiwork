// Batch 1D-API — Documents server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { mapPgError, ensureOk } from "./business.server";
import { withAuthorNames } from "./documents.server";

const storageRefSchema = z.object({
  provider: z.string().min(1),
  bucket: z.string().min(1),
  objectKey: z.string().min(1),
});

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      workspaceId: z.string().uuid(),
      folder: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("documents").select("*")
      .eq("workspace_id", data.workspaceId).is("deleted_at", null)
      .order("updated_at", { ascending: false }).limit(data.limit);
    if (data.folder) q = q.eq("folder", data.folder);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    return rows ?? [];
  });

export const createDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      workspaceId: z.string().uuid(),
      title: z.string().min(1).max(500),
      folder: z.string().max(200).default("My Documents"),
      tags: z.array(z.string().max(50)).max(50).default([]),
      storageRef: storageRefSchema.optional(),
      mimeType: z.string().max(200).optional(),
      sizeBytes: z.number().int().nonnegative().default(0),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("create_document", {
      _workspace_id: data.workspaceId,
      _title: data.title,
      _folder: data.folder,
      _tags: data.tags,
      _storage_ref: data.storageRef ?? undefined,
      _mime_type: data.mimeType ?? undefined,
      _size_bytes: data.sizeBytes,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "DOCUMENT_NOT_FOUND");
  });

// Chi tiết một tài liệu: RLS đảm bảo chỉ thành viên workspace/tenant đọc được.
export const getDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ documentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("documents")
      .select("*")
      .eq("id", data.documentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) mapPgError(error);
    if (!doc) throw new Error("DOCUMENT_NOT_FOUND");

    const [versionsRes, workspaceRes, permsRes] = await Promise.all([
      context.supabase
        .from("document_versions")
        .select("id, version, mime_type, size_bytes, comment, author_id, created_at, storage_ref")
        .eq("document_id", data.documentId)
        .order("version", { ascending: false })
        .limit(20),
      context.supabase.from("workspaces").select("id, name").eq("id", doc.workspace_id).maybeSingle(),
      context.supabase
        .from("document_permissions")
        .select("principal_type, principal_id, level")
        .eq("document_id", data.documentId),
    ]);

    return {
      document: doc,
      versions: await withAuthorNames(context.supabase, versionsRes.data ?? []),
      workspace: workspaceRes.data ?? null,
      permissions: permsRes.data ?? [],
    };
  });
export const updateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      documentId: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      folder: z.string().max(200).optional(),
      tags: z.array(z.string().max(50)).max(50).optional(),
      content: z.string().max(500000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("update_document", {
      _document_id: data.documentId,
      _title: data.title ?? undefined,
      _folder: data.folder ?? undefined,
      _tags: data.tags ?? undefined,
      _content: data.content ?? undefined,
      _expected_row_version: data.expectedRowVersion ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "DOCUMENT_NOT_FOUND");
  });

export const uploadDocumentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      documentId: z.string().uuid(),
      storageRef: storageRefSchema,
      mimeType: z.string().max(200).optional(),
      sizeBytes: z.number().int().nonnegative().default(0),
      comment: z.string().max(1000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("upload_document_version", {
      _document_id: data.documentId,
      _storage_ref: data.storageRef,
      _mime_type: data.mimeType ?? undefined,
      _size_bytes: data.sizeBytes,
      _comment: data.comment ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "DOCUMENT_NOT_FOUND");
  });

export const shareDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      documentId: z.string().uuid(),
      principalType: z.enum(["user", "workspace", "tenant"]),
      principalId: z.string().uuid(),
      level: z.enum(["view", "comment", "edit", "manage"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("share_document", {
      _document_id: data.documentId,
      _principal_type: data.principalType,
      _principal_id: data.principalId,
      _level: data.level,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "DOCUMENT_NOT_FOUND");
  });

export const archiveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      documentId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("archive_document", {
      _document_id: data.documentId,
      _expected_row_version: data.expectedRowVersion ?? undefined,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "DOCUMENT_NOT_FOUND");
  });