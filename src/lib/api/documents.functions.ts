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
// Danh sách người dùng có thể được chia sẻ: thành viên đang hoạt động của cùng tổ chức.
export const listDocumentShareCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ documentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: doc, error: docErr } = await context.supabase
      .from("documents").select("id, tenant_id, workspace_id")
      .eq("id", data.documentId).is("deleted_at", null).maybeSingle();
    if (docErr) mapPgError(docErr);
    if (!doc) throw new Error("DOCUMENT_NOT_FOUND");

    const [membersRes, wsMembersRes] = await Promise.all([
      context.supabase.from("tenant_members")
        .select("user_id, role, status").eq("tenant_id", doc.tenant_id).eq("status", "active").limit(500),
      context.supabase.from("workspace_members").select("user_id").eq("workspace_id", doc.workspace_id),
    ]);
    const rows = membersRes.data ?? [];
    const inWorkspace = new Set((wsMembersRes.data ?? []).map((m) => m.user_id));
    const ids = rows.map((r) => r.user_id);
    const { data: profiles } = ids.length
      ? await context.supabase.from("profiles").select("id, email, display_name").in("id", ids)
      : { data: [] as Array<{ id: string; email: string | null; display_name: string | null }> };
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return rows.map((r) => ({
      userId: r.user_id,
      role: r.role as string,
      email: pmap.get(r.user_id)?.email ?? null,
      displayName: pmap.get(r.user_id)?.display_name ?? null,
      inWorkspace: inWorkspace.has(r.user_id),
    }));
  });

// Danh sách quyền chia sẻ hiện tại của tài liệu (kèm tên người/workspace/tổ chức).
export const listDocumentShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ documentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const [permsRes, canManageRes] = await Promise.all([
      context.supabase.from("document_permissions")
        .select("principal_type, principal_id, level, created_at, updated_at")
        .eq("document_id", data.documentId)
        .order("created_at", { ascending: true }),
      context.supabase.rpc("can_manage_document_shares", { _document_id: data.documentId }),
    ]);
    if (permsRes.error) mapPgError(permsRes.error);
    const perms = permsRes.data ?? [];
    const userIds = perms.filter((p) => p.principal_type === "user").map((p) => p.principal_id);
    const wsIds = perms.filter((p) => p.principal_type === "workspace").map((p) => p.principal_id);
    const tenantIds = perms.filter((p) => p.principal_type === "tenant").map((p) => p.principal_id);
    const [profiles, workspaces, tenants] = await Promise.all([
      userIds.length ? context.supabase.from("profiles").select("id, email, display_name").in("id", userIds) : Promise.resolve({ data: [] }),
      wsIds.length ? context.supabase.from("workspaces").select("id, name").in("id", wsIds) : Promise.resolve({ data: [] }),
      tenantIds.length ? context.supabase.from("tenants").select("id, name").in("id", tenantIds) : Promise.resolve({ data: [] }),
    ]);
    const pmap = new Map(((profiles.data ?? []) as Array<{ id: string; email: string | null; display_name: string | null }>).map((p) => [p.id, p]));
    const wmap = new Map(((workspaces.data ?? []) as Array<{ id: string; name: string }>).map((w) => [w.id, w.name]));
    const tmap = new Map(((tenants.data ?? []) as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));
    return {
      canManage: canManageRes.data === true,
      shares: perms.map((p) => ({
        principalType: p.principal_type as "user" | "workspace" | "tenant",
        principalId: p.principal_id as string,
        level: p.level as string,
        label:
          p.principal_type === "user"
            ? (pmap.get(p.principal_id)?.display_name ?? pmap.get(p.principal_id)?.email ?? p.principal_id)
            : p.principal_type === "workspace"
              ? (wmap.get(p.principal_id) ?? p.principal_id)
              : (tmap.get(p.principal_id) ?? p.principal_id),
        sublabel: p.principal_type === "user" ? (pmap.get(p.principal_id)?.email ?? null) : null,
      })),
    };
  });

export const revokeDocumentShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ...commandMetadataSchema.shape,
      documentId: z.string().uuid(),
      principalType: z.enum(["user", "workspace", "tenant"]),
      principalId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("revoke_document_share", {
      _document_id: data.documentId,
      _principal_type: data.principalType,
      _principal_id: data.principalId,
      _idempotency_key: data.idempotencyKey,
      _correlation_id: data.correlationId ?? undefined,
    });
    if (res.error) mapPgError(res.error);
    return { revoked: res.data === true };
  });

// Nhật ký truy cập tài liệu (ai xem/tải, thuộc tổ chức/workspace nào).
export const logDocumentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      documentId: z.string().uuid(),
      action: z.enum(["view", "download", "print", "export", "share_view"]),
      context: z.record(z.string(), z.unknown()).default({}),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("log_document_access", {
      _document_id: data.documentId,
      _action: data.action,
      _context: data.context as never,
    });
    if (res.error) mapPgError(res.error);
    return { logged: true };
  });

export const listDocumentAccessLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      documentId: z.string().uuid(),
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("document_access_logs")
      .select("id, action, actor_id, occurred_at, tenant_id, workspace_id, version")
      .eq("document_id", data.documentId)
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (error) mapPgError(error);
    const list = rows ?? [];
    const actorIds = [...new Set(list.map((r) => r.actor_id))];
    const wsIds = [...new Set(list.map((r) => r.workspace_id))];
    const tenantIds = [...new Set(list.map((r) => r.tenant_id))];
    const [profiles, workspaces, tenants] = await Promise.all([
      actorIds.length
        ? context.supabase.from("profiles").select("id, display_name, email").in("id", actorIds)
        : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null; email: string | null }> }),
      wsIds.length
        ? context.supabase.from("workspaces").select("id, name").in("id", wsIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      tenantIds.length
        ? context.supabase.from("tenants").select("id, name").in("id", tenantIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);
    const pmap = new Map((profiles.data ?? []).map((p) => [p.id, p]));
    const wmap = new Map((workspaces.data ?? []).map((w) => [w.id, w.name]));
    const tmap = new Map((tenants.data ?? []).map((t) => [t.id, t.name]));
    return list.map((r) => ({
      id: r.id,
      action: r.action as string,
      occurredAt: r.occurred_at as string,
      version: r.version as number | null,
      actorName: pmap.get(r.actor_id)?.display_name ?? pmap.get(r.actor_id)?.email ?? r.actor_id,
      actorEmail: pmap.get(r.actor_id)?.email ?? null,
      workspaceName: wmap.get(r.workspace_id) ?? r.workspace_id,
      tenantName: tmap.get(r.tenant_id) ?? r.tenant_id,
    }));
  });
