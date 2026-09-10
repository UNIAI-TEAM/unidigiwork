// Kết quả công việc — nhập file Word, thay đổi chờ duyệt và vá tài liệu bằng GenOffice.
// Bản gốc là điểm neo trung thực: không bao giờ bị ghi đè hay dựng lại từ văn bản thường.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commandMetadataSchema } from "@/contracts/common/base";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";

const WP_BUCKET = "work-products";
const MAX_BASE64 = 34 * 1024 * 1024;

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-\s]+/g, "").slice(0, 120) || "document.docx";
}

/* ------------------------------------------------------------ nhập DOCX */

export const importWorkDeliverableDocx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        fileName: z.string().min(1).max(300),
        mimeType: z.string().max(200),
        base64: z.string().min(1).max(MAX_BASE64),
        title: z.string().min(1).max(300).optional(),
        businessType: z
          .enum([
            "PROPOSAL",
            "REPORT",
            "ANALYSIS",
            "CONTRACT",
            "PLAN",
            "PRESENTATION",
            "MEMO",
            "DOCUMENT",
            "OTHER",
          ])
          .default("DOCUMENT"),
        workspaceId: z.string().uuid().nullable().optional(),
        primaryContextType: z
          .enum(["WORKSPACE", "MEETING", "TASK", "DOCUMENT", "EMAIL"])
          .nullable()
          .optional(),
        primaryContextId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { DOCX_MIME, DOCX_MAX_BYTES, sha256Hex, parseDocxToBlocks, GENOFFICE_ENGINE_VERSION } =
      await import("./docx-import.server");

    if (!/\.docx$/i.test(data.fileName)) {
      throw new ApiError({ code: "VALIDATION_FAILED", message: "DOCX_ONLY" });
    }
    if (
      data.mimeType &&
      data.mimeType !== DOCX_MIME &&
      data.mimeType !== "application/octet-stream"
    ) {
      throw new ApiError({ code: "VALIDATION_FAILED", message: "DOCX_MIME_INVALID" });
    }

    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(data.base64);
    } catch {
      throw new ApiError({ code: "VALIDATION_FAILED", message: "FILE_DECODE_FAILED" });
    }
    if (!bytes.byteLength) throw new ApiError({ code: "VALIDATION_FAILED", message: "FILE_EMPTY" });
    if (bytes.byteLength > DOCX_MAX_BYTES)
      throw new ApiError({ code: "VALIDATION_FAILED", message: "FILE_TOO_LARGE" });
    // Chữ ký gói OOXML (ZIP).
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
      throw new ApiError({ code: "VALIDATION_FAILED", message: "DOCX_SIGNATURE_INVALID" });
    }

    const { resolveTenantId } = await import("./work-deliverables.server");
    const { readActiveTenantCookie } = await import("./active-tenant.server");
    const tenantId = await resolveTenantId(
      context.supabase as never,
      context.userId,
      data.workspaceId ?? null,
      readActiveTenantCookie(),
    );

    // Đọc tài liệu bằng bộ máy GenOffice thật trước khi tạo bản ghi.
    // Trọng số nhận diện lấy theo hồ sơ của tổ chức đang làm việc.
    const { loadTenantDocxProfile } = await import("./docx-profile.server");
    const tenantProfile = await loadTenantDocxProfile(context.supabase as never, tenantId);
    let parsed;
    try {
      parsed = await parseDocxToBlocks(bytes, tenantProfile.weights);
    } catch (e) {
      throw new ApiError({
        code: "VALIDATION_FAILED",
        message: `DOCX_PARSE_FAILED: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }

    const sha256 = await sha256Hex(bytes);
    const fileName = safeName(data.fileName);
    const title = data.title ?? fileName.replace(/\.docx$/i, "");
    const importedAt = new Date().toISOString();

    const { data: product, error: pErr } = await context.supabase
      .from("work_products")
      .insert({
        tenant_id: tenantId,
        workspace_id: data.workspaceId ?? null,
        title,
        business_type: data.businessType,
        content: parsed.content,
        owner_id: context.userId,
        created_by: context.userId,
        origin: "IMPORTED_DOCX",
        source_sha256: sha256,
        source_filename: fileName,
        source_mime_type: DOCX_MIME,
        source_engine: GENOFFICE_ENGINE_VERSION,
        source_imported_at: importedAt,
        primary_context_type: data.primaryContextType ?? null,
        primary_context_id: data.primaryContextId ?? null,
      })
      .select("id")
      .single();
    if (pErr) mapPgError(pErr);
    const productId = product.id as string;

    const objectKey = `${tenantId}/${productId}/source/${Date.now()}-${fileName}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from(WP_BUCKET)
      .upload(objectKey, bytes, { contentType: DOCX_MIME, upsert: false });
    if (upErr) {
      await context.supabase
        .from("work_products")
        .update({ deleted_at: importedAt })
        .eq("id", productId);
      throw new ApiError({
        code: "INTERNAL_ERROR",
        message: `SOURCE_UPLOAD_FAILED: ${upErr.message}`,
      });
    }

    const { data: artifact, error: aErr } = await context.supabase
      .from("work_product_artifacts")
      .insert({
        tenant_id: tenantId,
        work_product_id: productId,
        format: "DOCX",
        role: "SOURCE_ORIGINAL",
        storage_ref: objectKey,
        mime_type: DOCX_MIME,
        size_bytes: bytes.byteLength,
        version: 1,
        generated_by: "USER",
        created_by: context.userId,
        engine: "ORIGINAL",
        sha256,
        immutable: true,
      })
      .select("id")
      .single();
    if (aErr) {
      await supabaseAdmin.storage.from(WP_BUCKET).remove([objectKey]);
      await context.supabase
        .from("work_products")
        .update({ deleted_at: importedAt })
        .eq("id", productId);
      mapPgError(aErr);
    }
    const sourceArtifactId = artifact.id as string;

    await context.supabase
      .from("work_products")
      .update({ source_artifact_id: sourceArtifactId })
      .eq("id", productId);

    const rows = parsed.blocks.map((b) => ({
      tenant_id: tenantId,
      work_product_id: productId,
      source_artifact_id: sourceArtifactId,
      source_version: 1,
      block_key: b.blockKey,
      ordinal: b.ordinal,
      block_type: b.blockType,
      text: b.text,
      source_anchor: b.sourceAnchor as unknown as never,
      editability: b.editability,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: bErr } = await context.supabase
        .from("work_product_blocks")
        .insert(rows.slice(i, i + 500));
      if (bErr) mapPgError(bErr);
    }

    // Phiên bản 1 = ảnh chụp nội dung lúc nhập, kèm nguồn gốc nhập.
    await context.supabase.from("work_product_versions").insert({
      tenant_id: tenantId,
      work_product_id: productId,
      version: 1,
      title,
      content: parsed.content,
      summary: `Nhập từ tệp Word ${fileName}`,
      author_id: context.userId,
      ai_generated: false,
      provenance: [
        {
          type: "IMPORT_DOCX",
          id: sourceArtifactId,
          title: fileName,
          stamp: `sha256:${sha256.slice(0, 16)}`,
          capturedAt: importedAt,
        },
      ],
    });

    if (
      data.primaryContextType &&
      data.primaryContextId &&
      data.primaryContextType !== "WORKSPACE"
    ) {
      await context.supabase.rpc("link_work_entities", {
        _source_type: "WORK_PRODUCT",
        _source_id: productId,
        _target_type: data.primaryContextType,
        _target_id: data.primaryContextId,
        _relationship: "REFERENCES",
      });
    }

    return {
      id: productId,
      sourceArtifactId,
      sha256,
      totalBlocks: parsed.totalBlocks,
      editableBlocks: parsed.editableBlocks,
    };
  });

/* ------------------------------------------------------------ đọc khối */

export const listWorkProductBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("work_product_blocks")
      .select(
        "id, block_key, ordinal, block_type, text, source_anchor, editability, source_version",
      )
      .eq("work_product_id", data.id)
      .order("ordinal", { ascending: true })
      .limit(2000);
    if (error) mapPgError(error);
    return rows ?? [];
  });

/* -------------------------------------------------- thay đổi chờ duyệt */

const changeInputSchema = z.object({
  blockId: z.string().uuid(),
  after: z.string().max(20000),
});

export const proposeWorkProductChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        changes: z.array(changeInputSchema).min(1).max(50),
        origin: z.enum(["HUMAN", "AI"]).default("HUMAN"),
        proposalId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: product, error: pErr } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, current_version, origin")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (pErr) mapPgError(pErr);
    if (!product)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    const ids = data.changes.map((c) => c.blockId);
    const { data: blocks, error: bErr } = await context.supabase
      .from("work_product_blocks")
      .select("id, block_key, text, source_anchor, editability")
      .eq("work_product_id", data.id)
      .in("id", ids);
    if (bErr) mapPgError(bErr);
    const map = new Map((blocks ?? []).map((b: any) => [b.id as string, b]));

    const rows = data.changes.map((c) => {
      const b = map.get(c.blockId);
      if (!b) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "BLOCK_NOT_FOUND" });
      if (b.editability !== "EDITABLE")
        throw new ApiError({ code: "VALIDATION_FAILED", message: "PATCH_UNSAFE" });
      return {
        tenant_id: product.tenant_id,
        work_product_id: data.id,
        proposal_id: data.proposalId ?? null,
        block_id: b.id,
        block_key: b.block_key,
        source_anchor: b.source_anchor,
        before_text: b.text ?? "",
        after_text: c.after,
        origin: data.origin,
        status: "PENDING",
        base_version: product.current_version ?? 1,
        author_id: context.userId,
      };
    });

    const { data: inserted, error: iErr } = await context.supabase
      .from("work_product_change_ops")
      .insert(rows)
      .select("id, block_key, before_text, after_text, origin, status");
    if (iErr) mapPgError(iErr);
    return inserted ?? [];
  });

export const listWorkProductChangeOps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["PENDING", "ACCEPTED", "REJECTED", "APPLIED"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("work_product_change_ops")
      .select(
        "id, block_id, block_key, before_text, after_text, origin, status, base_version, applied_version, proposal_id, author_id, created_at",
      )
      .eq("work_product_id", data.id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);
    return rows ?? [];
  });

export const decideWorkProductChangeOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        changeIds: z.array(z.string().uuid()).max(200).optional(),
        decision: z.enum(["ACCEPTED", "REJECTED"]),
        all: z.boolean().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("work_product_change_ops")
      .update({
        status: data.decision,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("work_product_id", data.id)
      .eq("status", "PENDING");
    if (!data.all) {
      if (!data.changeIds?.length)
        throw new ApiError({ code: "VALIDATION_FAILED", message: "NO_CHANGES_SELECTED" });
      q = q.in("id", data.changeIds);
    }
    const { data: rows, error } = await q.select("id");
    if (error) mapPgError(error);
    return { decided: (rows ?? []).length, decision: data.decision };
  });

/* ------------------------------------------- vá tài liệu bằng GenOffice */

/**
 * Áp các thay đổi đã được chấp nhận lên chính tệp Word gốc bằng GenOffice.
 * Không đi qua bộ máy nội bộ, không dựng lại tài liệu từ văn bản thường.
 * Không vá an toàn được → dừng, giữ nguyên bản gốc.
 */
export const applyWorkProductAcceptedChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        note: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: product, error: pErr } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, title, current_version, origin, source_artifact_id, source_filename")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (pErr) mapPgError(pErr);
    if (!product)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });
    if (product.origin !== "IMPORTED_DOCX" || !product.source_artifact_id) {
      throw new ApiError({ code: "VALIDATION_FAILED", message: "NOT_IMPORTED_DOCX" });
    }

    const { data: ops, error: oErr } = await context.supabase
      .from("work_product_change_ops")
      .select(
        "id, block_key, source_anchor, before_text, after_text, origin, proposal_id, author_id",
      )
      .eq("work_product_id", data.id)
      .eq("status", "ACCEPTED")
      .order("created_at", { ascending: true })
      .limit(200);
    if (oErr) mapPgError(oErr);
    if (!ops?.length)
      throw new ApiError({ code: "VALIDATION_FAILED", message: "NO_ACCEPTED_CHANGES" });

    // Tệp nguồn hiện hành: phiên bản mới nhất, nếu chưa có thì bản gốc.
    const { data: artifacts } = await context.supabase
      .from("work_product_artifacts")
      .select("id, storage_ref, role, version, engine")
      .eq("work_product_id", data.id)
      .in("role", ["SOURCE_ORIGINAL", "SOURCE_VERSION"])
      .order("version", { ascending: false })
      .limit(1);
    const base = artifacts?.[0];
    if (!base?.storage_ref)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "SOURCE_ARTIFACT_NOT_FOUND" });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error: dErr } = await supabaseAdmin.storage
      .from(WP_BUCKET)
      .download(base.storage_ref as string);
    if (dErr || !blob)
      throw new ApiError({ code: "INTERNAL_ERROR", message: "SOURCE_DOWNLOAD_FAILED" });
    const original = new Uint8Array(await blob.arrayBuffer());

    const {
      patchDocxAnchored,
      PatchUnsafeError,
      DOCX_MIME,
      sha256Hex,
      GENOFFICE_ENGINE_VERSION,
      GENOFFICE_COMMIT,
    } = await import("./docx-import.server");

    const edits = ops.map((o: any) => {
      const idx = (o.source_anchor ?? {}).docxIndex;
      if (typeof idx !== "number")
        throw new ApiError({ code: "VALIDATION_FAILED", message: "PATCH_UNSAFE" });
      return {
        blockKey: o.block_key as string,
        docxIndex: idx,
        before: o.before_text ?? "",
        after: o.after_text ?? "",
      };
    });

    let patched;
    try {
      patched = await patchDocxAnchored(original, edits);
    } catch (e) {
      if (e instanceof PatchUnsafeError) {
        throw new ApiError({ code: "VALIDATION_FAILED", message: `PATCH_UNSAFE: ${e.detail}` });
      }
      throw new ApiError({
        code: "INTERNAL_ERROR",
        message: `GENOFFICE_UNAVAILABLE: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }

    // Kiểm chứng giữ nguyên gói tài liệu.
    const { comparePartPreservation, inspectDocx } = await import("./office-compare.server");
    const preservation = await comparePartPreservation(original, patched.bytes);
    const inspection = await inspectDocx(patched.bytes);
    if (!inspection.opensSuccessfully || inspection.missingRequiredParts.length > 0) {
      throw new ApiError({ code: "INTERNAL_ERROR", message: "PATCH_VERIFICATION_FAILED" });
    }

    const nextVersion = (product.current_version ?? 1) + 1;
    const sha256 = await sha256Hex(patched.bytes);
    const fileName = safeName(
      (product.source_filename as string | null)?.replace(/\.docx$/i, "") ||
        (product.title as string) ||
        "document",
    );
    const objectKey = `${product.tenant_id}/${data.id}/v${nextVersion}/${Date.now()}-${fileName}-v${nextVersion}.docx`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(WP_BUCKET)
      .upload(objectKey, patched.bytes, { contentType: DOCX_MIME, upsert: false });
    if (upErr)
      throw new ApiError({
        code: "INTERNAL_ERROR",
        message: `ARTIFACT_UPLOAD_FAILED: ${upErr.message}`,
      });

    const { data: artifact, error: aErr } = await context.supabase
      .from("work_product_artifacts")
      .insert({
        tenant_id: product.tenant_id,
        work_product_id: data.id,
        format: "DOCX",
        role: "SOURCE_VERSION",
        storage_ref: objectKey,
        mime_type: DOCX_MIME,
        size_bytes: patched.bytes.byteLength,
        version: nextVersion,
        generated_by: ops.some((o: any) => o.origin === "AI") ? "AI" : "USER",
        created_by: context.userId,
        engine: "GENOFFICE",
        sha256,
        immutable: true,
      })
      .select("id")
      .single();
    if (aErr) {
      await supabaseAdmin.storage.from(WP_BUCKET).remove([objectKey]);
      mapPgError(aErr);
    }

    // Nội dung native theo khối mới (chỉ để hiển thị/tìm kiếm).
    const afterByKey = new Map(
      ops.map((o: any) => [o.block_key as string, o.after_text as string]),
    );
    const { data: blocks } = await context.supabase
      .from("work_product_blocks")
      .select("id, block_key, text, ordinal")
      .eq("work_product_id", data.id)
      .order("ordinal", { ascending: true })
      .limit(2000);
    const content = (blocks ?? [])
      .map((b: any) => afterByKey.get(b.block_key) ?? b.text ?? "")
      .filter(Boolean)
      .join("\n\n");

    const now = new Date().toISOString();
    const aiOps = ops.filter((o: any) => o.origin === "AI");
    const proposalIds = [
      ...new Set(aiOps.map((o: any) => o.proposal_id).filter(Boolean)),
    ] as string[];
    let contextSources: unknown[] = [];
    if (proposalIds.length) {
      const { data: props } = await context.supabase
        .from("work_product_ai_proposals")
        .select("id, instruction, model, agent_id, context_sources")
        .in("id", proposalIds);
      for (const p of props ?? []) {
        const src = Array.isArray((p as any).context_sources) ? (p as any).context_sources : [];
        contextSources = contextSources.concat(src);
      }
      await context.supabase
        .from("work_product_ai_proposals")
        .update({ status: "APPLIED" })
        .in("id", proposalIds);
    }

    const provenance = [
      ...(contextSources as Array<Record<string, unknown>>).slice(0, 30),
      {
        type: "DOCX_PATCH",
        id: artifact.id as string,
        title: `GenOffice ${GENOFFICE_ENGINE_VERSION}`,
        stamp: GENOFFICE_COMMIT.slice(0, 12),
        capturedAt: now,
      },
    ];

    const { error: vErr } = await context.supabase.from("work_product_versions").insert({
      tenant_id: product.tenant_id,
      work_product_id: data.id,
      version: nextVersion,
      title: product.title,
      content,
      summary:
        data.note ??
        `Vá ${patched.editedBlocks} khối trên tệp Word gốc (${aiOps.length ? "có AI hỗ trợ" : "người dùng sửa"})`,
      author_id: context.userId,
      ai_generated: aiOps.length > 0,
      provenance: provenance as unknown as never,
    });
    if (vErr) mapPgError(vErr);

    await context.supabase
      .from("work_products")
      .update({ current_version: nextVersion, content })
      .eq("id", data.id);

    // Cập nhật khối theo nội dung mới để lần sửa sau vẫn khớp neo.
    for (const o of ops as any[]) {
      await context.supabase
        .from("work_product_blocks")
        .update({ text: o.after_text })
        .eq("work_product_id", data.id)
        .eq("block_key", o.block_key);
    }
    await context.supabase
      .from("work_product_change_ops")
      .update({ status: "APPLIED", applied_version: nextVersion })
      .eq("work_product_id", data.id)
      .eq("status", "ACCEPTED");

    return {
      version: nextVersion,
      artifactId: artifact.id as string,
      editedBlocks: patched.editedBlocks,
      totalBlocks: patched.totalBlocks,
      preservation,
      engine: "GENOFFICE",
      engineVersion: GENOFFICE_ENGINE_VERSION,
      engineCommit: GENOFFICE_COMMIT,
    };
  });

/* ---------------------------------------------- AI đề xuất sửa theo khối */

/**
 * AI đề xuất chỉnh sửa cho các khối được chọn. AI không bao giờ tự ghi vào tài
 * liệu: kết quả chỉ là thay đổi chờ người duyệt. Ngữ cảnh do máy chủ tự nạp.
 */
export const proposeAiWorkProductBlockEdits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        blockKeys: z.array(z.string().max(80)).min(1).max(20),
        instruction: z.string().min(1).max(2000),
        locale: z.string().max(8).default("vi"),
        sources: z
          .array(z.object({ type: z.string().max(40), id: z.string().max(80) }))
          .max(20)
          .default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ApiError({ code: "INTERNAL_ERROR", message: "AI_UNAVAILABLE" });

    const { data: product } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, workspace_id, title, business_type, current_version")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!product)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    const { data: blocks } = await context.supabase
      .from("work_product_blocks")
      .select("id, block_key, text, editability, source_anchor, ordinal")
      .eq("work_product_id", data.id)
      .in("block_key", data.blockKeys)
      .order("ordinal", { ascending: true });
    const targets = (blocks ?? []).filter((b: any) => b.editability === "EDITABLE");
    if (!targets.length)
      throw new ApiError({ code: "VALIDATION_FAILED", message: "NO_EDITABLE_BLOCKS" });

    // Ngữ cảnh chuẩn do máy chủ nạp theo quyền người dùng.
    const { collectContextSources } = await import("./work-deliverables.server");
    const allowed = await collectContextSources(context.supabase as never, product as never);
    const wanted = new Set(data.sources.map((s) => `${s.type}:${s.id}`));
    const resolved = allowed.filter((s) => wanted.has(`${s.type}:${s.id}`));
    const contextBlock = resolved.length
      ? resolved
          .map((s) => `- [${s.type}] ${s.title}${s.stamp ? ` (${s.stamp})` : ""}: ${s.snippet}`)
          .join("\n")
      : "(không bật nguồn ngữ cảnh nào)";

    const model = "openai/gpt-5.6-sol";
    const { streamText } = await import("ai");
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");

    const roleLabel: Record<string, string> = {
      TITLE: "tiêu đề tài liệu",
      HEADING: "tiêu đề mục",
      LIST_ITEM: "gạch đầu dòng",
      QUOTE: "trích dẫn",
      CAPTION: "chú thích",
      TABLE: "bảng",
      PARAGRAPH: "đoạn văn",
    };
    const numbered = targets
      .map((b: any, i: number) => {
        const a = (b.source_anchor ?? {}) as Record<string, any>;
        const kind = roleLabel[String(a.role ?? "PARAGRAPH")] ?? "đoạn văn";
        const lvl = a.role === "HEADING" && a.headingLevel ? ` cấp ${a.headingLevel}` : "";
        const sec = a.section ? ` | thuộc mục: ${a.section}` : "";
        return `[${i + 1}] (${kind}${lvl}${sec})\n${b.text}`;
      })
      .join("\n\n");
    const { loadTenantDocxProfile, tenantGuidanceBlock } = await import("./docx-profile.server");
    const tenantProfile = await loadTenantDocxProfile(
      context.supabase as never,
      product.tenant_id as string,
    );
    const result = streamText({
      model: createLovableResponsesProvider(apiKey).responses(model),
      system:
        "Bạn là trợ lý biên tập tài liệu nghiệp vụ trong UNIWORK. " +
        "Chỉ dùng dữ kiện trong nội dung và nguồn ngữ cảnh được cung cấp; không bịa số liệu hay cam kết. " +
        "Mỗi đoạn có ghi rõ loại (tiêu đề, gạch đầu dòng, trích dẫn, chú thích, bảng) và mục chứa nó: " +
        "giữ đúng loại đó khi viết lại — tiêu đề vẫn ngắn gọn, gạch đầu dòng vẫn một ý, trích dẫn giữ nguyên ý người nói. " +
        tenantGuidanceBlock(tenantProfile.aiGuidance) +
        `Trả lời bằng ngôn ngữ locale ${data.locale}.`,

      messages: [
        {
          role: "user",
          content:
            `Tài liệu: ${product.title} (${product.business_type})\n\nNGUỒN NGỮ CẢNH:\n${contextBlock}\n\n` +
            `CÁC ĐOẠN CẦN SỬA:\n${numbered}\n\nYÊU CẦU: ${data.instruction}\n\n` +
            "Trả về đúng số dòng bằng số đoạn, mỗi dòng theo mẫu `[số] nội dung đã sửa`. Không thêm giải thích.",
        },
      ],
      providerOptions: { lovable: { max_completion_tokens: 2000 } },
    });
    const text = (await result.text).trim();

    const proposed = new Map<number, string>();
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*\[(\d+)\]\s*(.+)$/.exec(line);
      if (m) proposed.set(Number(m[1]), m[2].trim());
    }
    if (!proposed.size)
      throw new ApiError({ code: "INTERNAL_ERROR", message: "AI_EMPTY_PROPOSAL" });

    const baseVersion = (product.current_version as number | null) ?? 1;
    const { data: proposal, error: prErr } = await context.supabase
      .from("work_product_ai_proposals")
      .insert({
        tenant_id: product.tenant_id,
        work_product_id: data.id,
        base_version: baseVersion,
        instruction: data.instruction,
        model,
        context_sources: resolved.map((s) => ({
          type: s.type,
          id: s.id,
          title: s.title,
          stamp: s.stamp ?? null,
        })) as unknown as never,
        created_by: context.userId,
        status: "PENDING",
      })
      .select("id")
      .single();
    if (prErr) mapPgError(prErr);

    const rows = targets
      .map((b: any, i: number) => {
        const after = proposed.get(i + 1);
        if (!after || after === b.text) return null;
        return {
          tenant_id: product.tenant_id,
          work_product_id: data.id,
          block_id: b.id,
          block_key: b.block_key,
          source_anchor: b.source_anchor,
          before_text: b.text ?? "",
          after_text: after,
          origin: "AI",
          proposal_id: proposal.id,
          author_id: context.userId,
          base_version: baseVersion,
          status: "PENDING",
        };
      })
      .filter(Boolean);
    if (!rows.length)
      throw new ApiError({ code: "VALIDATION_FAILED", message: "NO_CHANGES_PROPOSED" });

    const { data: created, error: cErr } = await context.supabase
      .from("work_product_change_ops")
      .insert(rows as never)
      .select("id, block_key, before_text, after_text");
    if (cErr) mapPgError(cErr);

    return {
      proposalId: proposal.id as string,
      model,
      changes: created ?? [],
      usedSources: resolved.map((s) => ({
        type: s.type,
        id: s.id,
        title: s.title,
        stamp: s.stamp ?? null,
      })),
    };
  });

/* ------------------------------------- tạo công việc từ tài liệu đã nhập */

/** Đề xuất danh sách công việc từ nội dung tài liệu (chỉ gợi ý, không tạo). */
export const proposeTasksFromWorkProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        locale: z.string().max(8).default("vi"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ApiError({ code: "INTERNAL_ERROR", message: "AI_UNAVAILABLE" });

    // RLS quyết định khả năng đọc: người ngoài tổ chức không thấy tài liệu này.
    const { data: product } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, workspace_id, title, business_type")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!product)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    const { data: blocks } = await context.supabase
      .from("work_product_blocks")
      .select("text, ordinal")
      .eq("work_product_id", data.id)
      .order("ordinal", { ascending: true })
      .limit(200);
    const body = (blocks ?? [])
      .map((b: any) => (b.text ?? "").trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, 12000);
    if (!body) throw new ApiError({ code: "VALIDATION_FAILED", message: "NO_CONTENT" });

    const model = "openai/gpt-5.6-sol";
    const { streamText } = await import("ai");
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
    const result = streamText({
      model: createLovableResponsesProvider(apiKey).responses(model),
      system:
        "Bạn trích xuất công việc cần làm từ tài liệu nghiệp vụ trong UNIWORK. " +
        "Chỉ dùng dữ kiện có trong tài liệu, không bịa deadline hay người phụ trách. " +
        `Trả lời bằng ngôn ngữ locale ${data.locale}.`,
      messages: [
        {
          role: "user",
          content:
            `Tài liệu: ${product.title} (${product.business_type})\n\nNỘI DUNG:\n${body}\n\n` +
            "Liệt kê tối đa 10 công việc cần làm. Mỗi dòng theo mẫu `- [mức độ] tiêu đề` " +
            "với mức độ thuộc low|normal|high|urgent. Không thêm giải thích.",
        },
      ],
      providerOptions: { lovable: { max_completion_tokens: 800 } },
    });
    const text = (await result.text).trim();

    const priorities = new Set(["low", "normal", "high", "urgent"]);
    const suggestions: Array<{ title: string; priority: string }> = [];
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*[-*]?\s*\[(\w+)\]\s*(.+)$/.exec(line);
      if (!m) continue;
      const priority = priorities.has(m[1].toLowerCase()) ? m[1].toLowerCase() : "normal";
      const title = m[2].trim().slice(0, 300);
      if (title) suggestions.push({ title, priority });
      if (suggestions.length >= 10) break;
    }
    if (!suggestions.length)
      throw new ApiError({ code: "INTERNAL_ERROR", message: "AI_EMPTY_PROPOSAL" });

    return { model, workspaceId: product.workspace_id as string | null, suggestions };
  });

/** Tạo công việc thật sau khi người dùng xác nhận và liên kết vào Work Graph. */
export const createTasksFromWorkProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        workspaceId: z.string().uuid().optional(),
        tasks: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(300),
              priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: product } = await context.supabase
      .from("work_products")
      .select("id, title, workspace_id")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!product)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    const workspaceId = (data.workspaceId ?? product.workspace_id) as string | null;
    if (!workspaceId)
      throw new ApiError({ code: "VALIDATION_FAILED", message: "WORKSPACE_REQUIRED" });

    const created: Array<{ id: string; title: string; linked: boolean }> = [];
    for (let idx = 0; idx < data.tasks.length; idx += 1) {
      const t = data.tasks[idx];
      // create_task chạy dưới RLS người dùng → sai tổ chức sẽ bị từ chối.
      const res = await context.supabase.rpc("create_task", {
        _workspace_id: workspaceId,
        _title: t.title,
        _description: `Tạo từ tài liệu: ${product.title}`,
        _priority: t.priority,
        _idempotency_key: `${data.idempotencyKey}:${idx}`,
        _correlation_id: data.correlationId ?? undefined,
      });
      if (res.error) mapPgError(res.error);
      const row: any = Array.isArray(res.data) ? (res.data as any[])[0] : res.data;
      const taskId = row?.id as string | undefined;
      if (!taskId) continue;
      const link = await context.supabase.rpc("link_work_entities", {
        _source_type: "WORK_PRODUCT",
        _source_id: data.id,
        _target_type: "TASK",
        _target_id: taskId,
        _relationship: "GENERATES",
      });
      created.push({ id: taskId, title: t.title, linked: !link.error });
    }
    if (!created.length)
      throw new ApiError({ code: "INTERNAL_ERROR", message: "TASKS_NOT_CREATED" });
    return { created };
  });

/* ------------------ đề xuất tiếp theo từ nội dung vừa thay đổi (sau khi chấp nhận) */

type FollowUpKind = "TASK" | "DECISION" | "MEETING";

/**
 * Sau khi vá bản Word, đọc đúng các thay đổi đã áp dụng của phiên bản đó và
 * đề xuất công việc / quyết định / cuộc họp. Chỉ gợi ý, không tạo gì.
 */
export const proposeFollowUpsFromDocxChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        version: z.number().int().positive().optional(),
        locale: z.string().max(8).default("vi"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ApiError({ code: "INTERNAL_ERROR", message: "AI_UNAVAILABLE" });

    const { data: product } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, workspace_id, title, business_type, current_version")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!product)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    const version = data.version ?? (product.current_version as number | null) ?? 1;
    const { data: ops, error: oErr } = await context.supabase
      .from("work_product_change_ops")
      .select("block_key, before_text, after_text, origin, applied_version")
      .eq("work_product_id", data.id)
      .eq("status", "APPLIED")
      .eq("applied_version", version)
      .order("created_at", { ascending: true })
      .limit(100);
    if (oErr) mapPgError(oErr);
    if (!ops?.length)
      throw new ApiError({ code: "VALIDATION_FAILED", message: "NO_APPLIED_CHANGES" });

    // Ngữ cảnh cấu trúc: vai trò đoạn (tiêu đề, bảng, trích dẫn...) giúp đề xuất sát nội dung hơn.
    const keys = Array.from(
      new Set((ops as any[]).map((o) => o.block_key).filter(Boolean)),
    ) as string[];
    const { data: blockRows } = keys.length
      ? await context.supabase
          .from("work_product_blocks")
          .select("block_key, block_type, ordinal, source_anchor")
          .eq("work_product_id", data.id)
          .in("block_key", keys)
      : { data: [] as any[] };
    const blockMap = new Map<string, any>();
    for (const b of (blockRows ?? []) as any[]) blockMap.set(b.block_key, b);

    const evidence = (ops as any[]).map((o, idx) => {
      const b = blockMap.get(o.block_key);
      const anchor = (b?.source_anchor ?? {}) as any;
      return {
        index: idx + 1,
        blockKey: o.block_key as string,
        role: (anchor.role as string) ?? (b?.block_type as string) ?? "PARAGRAPH",
        heading: (anchor.heading as string) ?? null,
        section: (anchor.section as string) ?? null,
        origin: o.origin === "AI" ? "AI" : "HUMAN",
        before: (o.before_text ?? "").slice(0, 1200),
        after: (o.after_text ?? "").slice(0, 1200),
      };
    });

    const diff = evidence
      .map(
        (e) =>
          `#${e.index} [${e.role}${e.heading ? ` · ${e.heading}` : ""}] (${e.origin === "AI" ? "AI" : "người dùng"})\n` +
          `TRƯỚC: ${e.before.slice(0, 800)}\n` +
          `SAU: ${e.after.slice(0, 800)}`,
      )
      .join("\n\n")
      .slice(0, 14000);

    const model = "openai/gpt-5.6-sol";
    const { streamText } = await import("ai");
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
    // Hồ sơ nhận diện riêng của tổ chức: cùng một tệp có thể cho đề xuất khác nhau.
    const { loadTenantDocxProfile, tenantGuidanceBlock } = await import("./docx-profile.server");
    const tenantProfile = await loadTenantDocxProfile(
      context.supabase as never,
      product.tenant_id as string,
    );
    const result = streamText({
      model: createLovableResponsesProvider(apiKey).responses(model),
      system:
        "Bạn phân tích phần NỘI DUNG VỪA THAY ĐỔI của một tài liệu nghiệp vụ trong UNIWORK " +
        "và đề xuất hành động tiếp theo. Chỉ dựa trên thay đổi, không bịa số liệu, deadline hay người phụ trách. " +
        "Phân loại đúng bản chất: việc phải làm = TASK; điều cần chốt/phê duyệt = DECISION; " +
        "việc cần nhiều bên bàn bạc = MEETING. Bỏ qua thay đổi chỉ sửa chính tả hoặc định dạng. " +
        tenantGuidanceBlock(tenantProfile.aiGuidance) +
        `Trả lời bằng ngôn ngữ locale ${data.locale}.`,

      messages: [
        {
          role: "user",
          content:
            `Tài liệu: ${product.title} (${product.business_type}) — phiên bản ${version}\n\n` +
            `THAY ĐỔI ĐÃ ÁP DỤNG (có vai trò đoạn):\n${diff}\n\n` +
            "Đề xuất tối đa 6 công việc, 4 quyết định cần chốt và 3 cuộc họp cần tổ chức. " +
            "Mỗi dòng theo đúng mẫu:\n" +
            "- [TASK|DECISION|MEETING] tiêu đề :: mô tả ngắn :: LÝ DO: vì sao thay đổi này dẫn tới đề xuất :: CĂN CỨ: #1,#3 :: (low|normal|high|urgent) :: 0-100\n" +
            "Số cuối là mức độ tin cậy. CĂN CỨ chỉ dùng số hiệu thay đổi có trong danh sách trên. " +
            "Không thêm giải thích ngoài các dòng đó.",
        },
      ],
      providerOptions: { lovable: { max_completion_tokens: 1400 } },
    });
    const text = (await result.text).trim();

    const priorities = new Set(["low", "normal", "high", "urgent"]);
    const suggestions: Array<{
      kind: FollowUpKind;
      title: string;
      detail: string;
      reason: string;
      priority: string;
      confidence: number;
      evidenceIndexes: number[];
    }> = [];
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*[-*]?\s*\[(TASK|DECISION|MEETING)\]\s*(.+)$/i.exec(line);
      if (!m) continue;
      const kind = m[1].toUpperCase() as FollowUpKind;
      const parts = m[2].split("::").map((p) => p.trim());
      const title = (parts.shift() ?? "").slice(0, 300);
      if (!title) continue;

      let detail = "";
      let reason = "";
      let priority = "normal";
      let confidence = 60;
      const evidenceIndexes: number[] = [];
      for (const raw of parts) {
        const part = raw.trim();
        if (!part) continue;
        const rm = /^(LÝ DO|LY DO|REASON)\s*:\s*(.+)$/i.exec(part);
        if (rm) {
          reason = rm[2].slice(0, 500);
          continue;
        }
        const em = /^(CĂN CỨ|CAN CU|EVIDENCE)\s*:\s*(.+)$/i.exec(part);
        if (em) {
          for (const n of em[2].match(/\d+/g) ?? []) {
            const idx = Number(n);
            if (idx >= 1 && idx <= evidence.length && !evidenceIndexes.includes(idx))
              evidenceIndexes.push(idx);
          }
          continue;
        }
        const pm = /^\((low|normal|high|urgent)\)$/i.exec(part);
        if (pm) {
          const value = pm[1].toLowerCase();
          if (priorities.has(value)) priority = value;
          continue;
        }
        const cm = /^(\d{1,3})%?$/.exec(part);
        if (cm) {
          confidence = Math.max(0, Math.min(100, Number(cm[1])));
          continue;
        }
        if (!detail) detail = part.slice(0, 500);
      }

      suggestions.push({
        kind,
        title,
        detail,
        reason,
        priority,
        confidence,
        evidenceIndexes: evidenceIndexes.length ? evidenceIndexes : [1],
      });
      if (suggestions.length >= 13) break;
    }
    if (!suggestions.length)
      throw new ApiError({ code: "INTERNAL_ERROR", message: "AI_EMPTY_PROPOSAL" });

    return {
      model,
      version,
      changedBlocks: ops.length,
      workspaceId: product.workspace_id as string | null,
      evidence,
      suggestions,
    };
  });

/** Tạo thật các mục đã chọn: công việc, cuộc họp và ghi nhận quyết định. */
export const createFollowUpsFromWorkProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        workspaceId: z.string().uuid().optional(),
        items: z
          .array(
            z.object({
              kind: z.enum(["TASK", "DECISION", "MEETING"]),
              title: z.string().trim().min(1).max(300),
              detail: z.string().trim().max(500).default(""),
              priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
            }),
          )
          .min(1)
          .max(13),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: product } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, title, workspace_id, current_version")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!product)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    const workspaceId = (data.workspaceId ?? product.workspace_id) as string | null;
    const source = `Tạo từ thay đổi tài liệu: ${product.title} (v${product.current_version ?? 1})`;
    const created: Array<{ kind: FollowUpKind; id: string; title: string; linked: boolean }> = [];

    const link = async (targetType: "TASK" | "MEETING", targetId: string) => {
      const res = await context.supabase.rpc("link_work_entities", {
        _source_type: "WORK_PRODUCT",
        _source_id: data.id,
        _target_type: targetType,
        _target_id: targetId,
        _relationship: "GENERATES",
      });
      return !res.error;
    };

    for (let idx = 0; idx < data.items.length; idx += 1) {
      const item = data.items[idx];

      if (item.kind === "TASK") {
        if (!workspaceId)
          throw new ApiError({ code: "VALIDATION_FAILED", message: "WORKSPACE_REQUIRED" });
        const res = await context.supabase.rpc("create_task", {
          _workspace_id: workspaceId,
          _title: item.title,
          _description: item.detail ? `${item.detail}\n\n${source}` : source,
          _priority: item.priority,
          _idempotency_key: `${data.idempotencyKey}:${idx}`,
          _correlation_id: data.correlationId ?? undefined,
        });
        if (res.error) mapPgError(res.error);
        const row: any = Array.isArray(res.data) ? (res.data as any[])[0] : res.data;
        if (!row?.id) continue;
        created.push({
          kind: "TASK",
          id: row.id as string,
          title: item.title,
          linked: await link("TASK", row.id as string),
        });
        continue;
      }

      if (item.kind === "MEETING") {
        if (!workspaceId)
          throw new ApiError({ code: "VALIDATION_FAILED", message: "WORKSPACE_REQUIRED" });
        const start = new Date(Date.now() + (idx + 2) * 24 * 60 * 60 * 1000);
        start.setUTCHours(2, 0, 0, 0); // 09:00 giờ Việt Nam
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        const { data: meeting, error: mErr } = await context.supabase
          .from("meetings")
          .insert({
            tenant_id: product.tenant_id,
            workspace_id: workspaceId,
            title: item.title,
            agenda: item.detail ? `${item.detail}\n\n${source}` : source,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            created_by: context.userId,
          })
          .select("id")
          .single();
        if (mErr) mapPgError(mErr);
        created.push({
          kind: "MEETING",
          id: meeting.id as string,
          title: item.title,
          linked: await link("MEETING", meeting.id as string),
        });
        continue;
      }

      // DECISION: chưa có bảng quyết định độc lập → ghi nhận vào nhật ký tài liệu.
      const { data: comment, error: cErr } = await context.supabase
        .from("work_product_comments")
        .insert({
          tenant_id: product.tenant_id,
          work_product_id: data.id,
          author_id: context.userId,
          body: `**Quyết định cần chốt:** ${item.title}${item.detail ? `\n\n${item.detail}` : ""}\n\n_${source}_`,
          anchor: {
            kind: "DECISION",
            version: product.current_version ?? 1,
          } as unknown as never,
        })
        .select("id")
        .single();
      if (cErr) mapPgError(cErr);
      created.push({
        kind: "DECISION",
        id: comment.id as string,
        title: item.title,
        linked: false,
      });
    }

    if (!created.length)
      throw new ApiError({ code: "INTERNAL_ERROR", message: "FOLLOW_UPS_NOT_CREATED" });
    return { created };
  });

/* ------------------------------------------- so sánh bản gốc và bản đã sửa */

/** Liệt kê các bản Word (gốc + từng phiên bản) để chọn so sánh. */
export const listWorkProductDocxVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("work_product_artifacts")
      .select("id, role, version, engine, created_at")
      .eq("work_product_id", data.id)
      .in("role", ["SOURCE_ORIGINAL", "SOURCE_VERSION"])
      .order("version", { ascending: true })
      .limit(50);
    if (error) mapPgError(error);
    return rows ?? [];
  });

/** So sánh nội dung hai bản Word theo từng đoạn: thêm, xoá, sửa. */
export const compareWorkProductDocxVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        baseArtifactId: z.string().uuid().optional(),
        targetArtifactId: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // RLS: chỉ đọc được artifact của tài liệu mà người dùng có quyền xem.
    const { data: rows, error } = await context.supabase
      .from("work_product_artifacts")
      .select("id, storage_ref, role, version, engine, created_at")
      .eq("work_product_id", data.id)
      .in("role", ["SOURCE_ORIGINAL", "SOURCE_VERSION"])
      .order("version", { ascending: true })
      .limit(50);
    if (error) mapPgError(error);
    const list = rows ?? [];
    if (list.length < 2)
      throw new ApiError({ code: "VALIDATION_FAILED", message: "NOT_ENOUGH_VERSIONS" });

    const base = data.baseArtifactId
      ? list.find((r: any) => r.id === data.baseArtifactId)
      : list.find((r: any) => r.role === "SOURCE_ORIGINAL") || list[0];
    const target = data.targetArtifactId
      ? list.find((r: any) => r.id === data.targetArtifactId)
      : list[list.length - 1];
    if (!base?.storage_ref || !target?.storage_ref || base.id === target.id)
      throw new ApiError({ code: "VALIDATION_FAILED", message: "INVALID_COMPARE_SELECTION" });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const read = async (ref: string) => {
      const { data: blob, error: dErr } = await supabaseAdmin.storage.from(WP_BUCKET).download(ref);
      if (dErr || !blob)
        throw new ApiError({ code: "INTERNAL_ERROR", message: "SOURCE_DOWNLOAD_FAILED" });
      return new Uint8Array(await blob.arrayBuffer());
    };

    const { parseDocxToBlocks } = await import("./docx-import.server");
    const [aBytes, bBytes] = await Promise.all([
      read(base.storage_ref as string),
      read(target.storage_ref as string),
    ]);
    const [aDoc, bDoc] = await Promise.all([parseDocxToBlocks(aBytes), parseDocxToBlocks(bBytes)]);

    const key = (b: any) => String(b.sourceAnchor?.docxIndex ?? b.blockKey);
    const aMap = new Map(aDoc.blocks.map((b: any) => [key(b), b]));
    const bMap = new Map(bDoc.blocks.map((b: any) => [key(b), b]));
    const keys = Array.from(new Set([...aMap.keys(), ...bMap.keys()]));

    const diffs = keys
      .map((k) => {
        const a = aMap.get(k);
        const b = bMap.get(k);
        const beforeText = (a?.text ?? "").trim();
        const afterText = (b?.text ?? "").trim();
        if (beforeText === afterText) return null;
        const change = !a || !beforeText ? "ADDED" : !b || !afterText ? "REMOVED" : "MODIFIED";
        return {
          key: k,
          ordinal: (b?.ordinal ?? a?.ordinal ?? 0) as number,
          blockType: (b?.blockType ?? a?.blockType ?? "paragraph") as string,
          change,
          before: beforeText,
          after: afterText,
          words: wordDiff(beforeText, afterText),
        };
      })
      .filter(Boolean)
      .sort((x: any, y: any) => x.ordinal - y.ordinal);

    return {
      base: { id: base.id, role: base.role, version: base.version, createdAt: base.created_at },
      target: {
        id: target.id,
        role: target.role,
        version: target.version,
        createdAt: target.created_at,
      },
      totals: {
        blocksBase: aDoc.totalBlocks,
        blocksTarget: bDoc.totalBlocks,
        changed: diffs.length,
        added: diffs.filter((d: any) => d.change === "ADDED").length,
        removed: diffs.filter((d: any) => d.change === "REMOVED").length,
        modified: diffs.filter((d: any) => d.change === "MODIFIED").length,
      },
      diffs,
    };
  });

/** Đối chiếu theo từ để hiển thị rõ chữ nào bị thay đổi (LCS đơn giản). */
function wordDiff(
  before: string,
  after: string,
): Array<{ op: "same" | "del" | "ins"; text: string }> {
  const a = before.split(/(\s+)/).filter((s) => s !== "");
  const b = after.split(/(\s+)/).filter((s) => s !== "");
  const MAX = 400;
  if (a.length > MAX || b.length > MAX) {
    return [
      ...(before ? [{ op: "del" as const, text: before }] : []),
      ...(after ? [{ op: "ins" as const, text: after }] : []),
    ];
  }
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: Array<{ op: "same" | "del" | "ins"; text: string }> = [];
  const push = (op: "same" | "del" | "ins", text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", a[i]);
      i += 1;
    } else {
      push("ins", b[j]);
      j += 1;
    }
  }
  while (i < a.length) {
    push("del", a[i]);
    i += 1;
  }
  while (j < b.length) {
    push("ins", b[j]);
    j += 1;
  }
  return out;
}

/* ------------------------------------------- phân tích lại theo trọng số */

const weightsSchema = z
  .object({
    title: z.number().min(0).max(3),
    heading: z.number().min(0).max(3),
    listItem: z.number().min(0).max(3),
    quote: z.number().min(0).max(3),
    caption: z.number().min(0).max(3),
    table: z.number().min(0).max(3),
  })
  .partial();

/**
 * Đọc lại tệp Word gốc với trọng số nhận diện mới và cập nhật metadata từng đoạn.
 * Không đụng tới tệp gốc, không tạo phiên bản mới; chỉ làm rõ vai trò của đoạn.
 */
export const reanalyzeWorkProductDocx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        weights: weightsSchema.optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: product, error: pErr } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, origin, source_artifact_id")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (pErr) mapPgError(pErr);
    if (!product)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });
    if (product.origin !== "IMPORTED_DOCX")
      throw new ApiError({ code: "VALIDATION_FAILED", message: "NOT_IMPORTED_DOCX" });

    const { data: art, error: aErr } = await context.supabase
      .from("work_product_artifacts")
      .select("id, storage_ref")
      .eq("work_product_id", data.id)
      .eq("role", "SOURCE_ORIGINAL")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (aErr) mapPgError(aErr);
    if (!art?.storage_ref)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "SOURCE_ARTIFACT_NOT_FOUND" });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error: dErr } = await supabaseAdmin.storage
      .from(WP_BUCKET)
      .download(art.storage_ref as string);
    if (dErr || !blob)
      throw new ApiError({ code: "INTERNAL_ERROR", message: "SOURCE_DOWNLOAD_FAILED" });

    const { parseDocxToBlocks } = await import("./docx-import.server");
    // Không truyền trọng số thì dùng hồ sơ nhận diện của tổ chức sở hữu tài liệu.
    const { loadTenantDocxProfile } = await import("./docx-profile.server");
    const effectiveWeights =
      data.weights ??
      (await loadTenantDocxProfile(context.supabase as never, product.tenant_id as string)).weights;
    const parsed = await parseDocxToBlocks(
      new Uint8Array(await blob.arrayBuffer()),
      effectiveWeights,
    );

    const { data: existing, error: bErr } = await context.supabase
      .from("work_product_blocks")
      .select("id, block_key")
      .eq("work_product_id", data.id)
      .limit(2000);
    if (bErr) mapPgError(bErr);
    const byKey = new Map(
      (existing ?? []).map((b: any) => [b.block_key as string, b.id as string]),
    );

    const counts: Record<string, number> = {};
    let updated = 0;
    for (const b of parsed.blocks) {
      const role = b.sourceAnchor.role ?? "PARAGRAPH";
      counts[role] = (counts[role] ?? 0) + 1;
      const id = byKey.get(b.blockKey);
      if (!id) continue;
      // Chỉ cập nhật metadata nhận diện — nội dung gốc giữ nguyên.
      const { error: uErr } = await context.supabase
        .from("work_product_blocks")
        .update({ source_anchor: b.sourceAnchor as unknown as never })
        .eq("id", id);
      if (uErr) mapPgError(uErr);
      updated += 1;
    }

    return { updated, totalBlocks: parsed.totalBlocks, counts };
  });

/* ------------------------------- độ chính xác của đề xuất AI so với bản gốc */

/** Tỉ lệ giống nhau theo từ giữa hai đoạn (0..1) — dùng LCS đơn giản. */
function wordSimilarity(a: string, b: string): number {
  const x = a.trim().split(/\s+/).filter(Boolean);
  const y = b.trim().split(/\s+/).filter(Boolean);
  if (!x.length && !y.length) return 1;
  if (!x.length || !y.length) return 0;
  let prev = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = new Array(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j += 1) {
      cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return (2 * prev[y.length]) / (x.length + y.length);
}

/**
 * Nhật ký đề xuất AI: đối chiếu từng đề xuất với đoạn gốc, tính độ chính xác
 * trung bình (tỉ lệ được người duyệt chấp nhận) và loại thay đổi hay bị từ chối.
 */
export const getAiProposalAccuracyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        limit: z.number().int().min(10).max(500).default(300),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // RLS giới hạn theo tổ chức: không đọc được đề xuất của tổ chức khác.
    let q = context.supabase
      .from("work_product_change_ops")
      .select(
        "id, work_product_id, block_key, source_anchor, before_text, after_text, status, created_at, decided_at, proposal_id",
      )
      .eq("origin", "AI")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.id) q = q.eq("work_product_id", data.id);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);

    const ops = (rows ?? []) as any[];
    const accepted = (s: string) => s === "ACCEPTED" || s === "APPLIED";

    type Bucket = {
      role: string;
      total: number;
      accepted: number;
      rejected: number;
      pending: number;
      similaritySum: number;
    };
    const byRole = new Map<string, Bucket>();
    const recent: Array<{
      id: string;
      workProductId: string;
      role: string;
      status: string;
      similarity: number;
      before: string;
      after: string;
      createdAt: string;
    }> = [];

    for (const o of ops) {
      const role = (o.source_anchor?.role as string) || "PARAGRAPH";
      const b = byRole.get(role) ?? {
        role,
        total: 0,
        accepted: 0,
        rejected: 0,
        pending: 0,
        similaritySum: 0,
      };
      const sim = wordSimilarity(o.before_text ?? "", o.after_text ?? "");
      b.total += 1;
      b.similaritySum += sim;
      if (accepted(o.status)) b.accepted += 1;
      else if (o.status === "REJECTED") b.rejected += 1;
      else b.pending += 1;
      byRole.set(role, b);

      if (recent.length < 20) {
        recent.push({
          id: o.id,
          workProductId: o.work_product_id,
          role,
          status: o.status,
          similarity: Math.round(sim * 100),
          before: (o.before_text ?? "").slice(0, 240),
          after: (o.after_text ?? "").slice(0, 240),
          createdAt: o.created_at,
        });
      }
    }

    // Thống kê theo từng tài liệu để so sánh chất lượng đề xuất giữa nhiều tài liệu Word.
    type DocBucket = {
      workProductId: string;
      total: number;
      accepted: number;
      rejected: number;
      pending: number;
      similaritySum: number;
      worstRole: Map<string, { rejected: number; decided: number }>;
    };
    const byDoc = new Map<string, DocBucket>();
    for (const o of ops) {
      const role = (o.source_anchor?.role as string) || "PARAGRAPH";
      const d = byDoc.get(o.work_product_id) ?? {
        workProductId: o.work_product_id,
        total: 0,
        accepted: 0,
        rejected: 0,
        pending: 0,
        similaritySum: 0,
        worstRole: new Map(),
      };
      d.total += 1;
      d.similaritySum += wordSimilarity(o.before_text ?? "", o.after_text ?? "");
      const r = d.worstRole.get(role) ?? { rejected: 0, decided: 0 };
      if (accepted(o.status)) {
        d.accepted += 1;
        r.decided += 1;
      } else if (o.status === "REJECTED") {
        d.rejected += 1;
        r.decided += 1;
        r.rejected += 1;
      } else d.pending += 1;
      d.worstRole.set(role, r);
      byDoc.set(o.work_product_id, d);
    }

    const docIds = [...byDoc.keys()];
    const titles = new Map<string, { title: string; businessType: string | null }>();
    if (docIds.length) {
      const { data: prods } = await context.supabase
        .from("work_products")
        .select("id, title, business_type")
        .in("id", docIds);
      for (const p of (prods ?? []) as any[])
        titles.set(p.id, { title: p.title, businessType: p.business_type ?? null });
    }

    const documents = [...byDoc.values()]
      .map((d) => {
        const decidedDoc = d.accepted + d.rejected;
        let worst: { role: string; rejected: number } | null = null;
        for (const [role, r] of d.worstRole)
          if (r.rejected > 0 && (!worst || r.rejected > worst.rejected))
            worst = { role, rejected: r.rejected };
        const meta = titles.get(d.workProductId);
        return {
          workProductId: d.workProductId,
          title: meta?.title ?? "(không đọc được tiêu đề)",
          businessType: meta?.businessType ?? null,
          total: d.total,
          accepted: d.accepted,
          rejected: d.rejected,
          pending: d.pending,
          accuracy: decidedDoc ? Math.round((d.accepted / decidedDoc) * 100) : null,
          avgSimilarity: d.total ? Math.round((d.similaritySum / d.total) * 100) : 0,
          worstRole: worst,
        };
      })
      .sort((a, b) => b.total - a.total);

    const total = ops.length;
    const acceptedTotal = ops.filter((o) => accepted(o.status)).length;
    const rejectedTotal = ops.filter((o) => o.status === "REJECTED").length;
    const decided = acceptedTotal + rejectedTotal;
    const roles = [...byRole.values()]
      .map((b) => {
        const d = b.accepted + b.rejected;
        return {
          role: b.role,
          total: b.total,
          accepted: b.accepted,
          rejected: b.rejected,
          pending: b.pending,
          accuracy: d ? Math.round((b.accepted / d) * 100) : null,
          avgSimilarity: b.total ? Math.round((b.similaritySum / b.total) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    // Loại thay đổi hay sai: có ít nhất 2 lần bị duyệt và tỉ lệ chấp nhận thấp nhất.
    const weakest = roles
      .filter((r) => r.accuracy !== null && r.accepted + r.rejected >= 2)
      .sort((a, b) => (a.accuracy as number) - (b.accuracy as number))
      .slice(0, 3);

    return {
      scope: data.id ? "PRODUCT" : "TENANT",
      total,
      accepted: acceptedTotal,
      rejected: rejectedTotal,
      pending: total - decided,
      accuracy: decided ? Math.round((acceptedTotal / decided) * 100) : null,
      avgSimilarity: total
        ? Math.round(([...byRole.values()].reduce((s, b) => s + b.similaritySum, 0) / total) * 100)
        : 0,
      roles,
      documents,
      weakest,
      recent,
    };
  });

/**
 * Báo cáo nhận diện Word theo tổ chức: từng loại nhận diện, trọng số đang dùng,
 * điểm tin cậy khi đọc hiểu và độ chính xác thực tế từ đề xuất AI đã được duyệt.
 */
export const getDocxRecognitionReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        weights: z.record(z.string(), z.number().min(0).max(2)).optional(),
        limit: z.number().int().min(100).max(5000).default(3000),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    // RLS giới hạn theo tổ chức: chỉ đọc block và đề xuất của tổ chức hiện tại.
    const { data: blockRows, error: bErr } = await context.supabase
      .from("work_product_blocks")
      .select("work_product_id, block_type, source_anchor")
      .limit(data.limit);
    if (bErr) mapPgError(bErr);

    type RoleStat = {
      role: string;
      blocks: number;
      scored: number;
      scoreSum: number;
      lowConfidence: number;
      docs: Set<string>;
      accepted: number;
      rejected: number;
      pending: number;
    };
    const stats = new Map<string, RoleStat>();
    const bucket = (role: string) => {
      const s = stats.get(role) ?? {
        role,
        blocks: 0,
        scored: 0,
        scoreSum: 0,
        lowConfidence: 0,
        docs: new Set<string>(),
        accepted: 0,
        rejected: 0,
        pending: 0,
      };
      stats.set(role, s);
      return s;
    };

    for (const b of (blockRows ?? []) as any[]) {
      const anchor = (b.source_anchor ?? {}) as any;
      const role = (anchor.role as string) || (b.block_type as string) || "PARAGRAPH";
      const s = bucket(role);
      s.blocks += 1;
      s.docs.add(b.work_product_id);
      const score = typeof anchor.score === "number" ? anchor.score : null;
      if (score !== null) {
        s.scored += 1;
        s.scoreSum += score;
        if (score < 1) s.lowConfidence += 1;
      }
    }

    const { data: opRows, error: oErr } = await context.supabase
      .from("work_product_change_ops")
      .select("source_anchor, status")
      .eq("origin", "AI")
      .limit(1000);
    if (oErr) mapPgError(oErr);
    for (const o of (opRows ?? []) as any[]) {
      const role = ((o.source_anchor ?? {}).role as string) || "PARAGRAPH";
      const s = bucket(role);
      if (o.status === "ACCEPTED" || o.status === "APPLIED") s.accepted += 1;
      else if (o.status === "REJECTED") s.rejected += 1;
      else s.pending += 1;
    }

    const weights = (data.weights ?? {}) as Record<string, number>;
    const weightKeyByRole: Record<string, string> = {
      TITLE: "title",
      HEADING: "heading",
      LIST_ITEM: "listItem",
      QUOTE: "quote",
      CAPTION: "caption",
      TABLE: "table",
    };

    const roles = [...stats.values()]
      .map((s) => {
        const decided = s.accepted + s.rejected;
        const accuracy = decided ? Math.round((s.accepted / decided) * 100) : null;
        const avgScore = s.scored ? Math.round((s.scoreSum / s.scored) * 100) / 100 : null;
        const weightKey = weightKeyByRole[s.role] ?? null;
        const weight = weightKey ? (weights[weightKey] ?? 1) : null;
        // Gợi ý chỉnh trọng số: nhận diện yếu hoặc AI hay sai → tăng; rất chắc và luôn đúng → có thể giảm.
        let advice: "INCREASE" | "DECREASE" | "KEEP" = "KEEP";
        if (weightKey) {
          const weak = (avgScore !== null && avgScore < 1.2) || s.lowConfidence > s.blocks * 0.3;
          const wrong = accuracy !== null && decided >= 2 && accuracy < 60;
          const solid = avgScore !== null && avgScore >= 2 && (accuracy === null || accuracy >= 90);
          if (weak || wrong) advice = "INCREASE";
          else if (solid && (weight ?? 1) > 1) advice = "DECREASE";
        }
        return {
          role: s.role,
          weightKey,
          weight,
          blocks: s.blocks,
          documents: s.docs.size,
          avgScore,
          lowConfidence: s.lowConfidence,
          accepted: s.accepted,
          rejected: s.rejected,
          pending: s.pending,
          accuracy,
          advice,
        };
      })
      .sort((a, b) => b.blocks - a.blocks);

    const totalBlocks = roles.reduce((n, r) => n + r.blocks, 0);
    const decidedAll = roles.reduce((n, r) => n + r.accepted + r.rejected, 0);
    const acceptedAll = roles.reduce((n, r) => n + r.accepted, 0);

    return {
      totalBlocks,
      totalDocuments: new Set(((blockRows ?? []) as any[]).map((b) => b.work_product_id)).size,
      overallAccuracy: decidedAll ? Math.round((acceptedAll / decidedAll) * 100) : null,
      roles,
    };
  });

/**
 * Tự tính trọng số nhận diện từ nội dung tài liệu Word thật của tổ chức.
 * Đọc các đoạn đã nhận diện, tìm dấu hiệu bị bỏ sót hoặc nhận diện quá tay,
 * rồi trả về bộ trọng số đề xuất kèm lý do cho từng loại.
 */
export const suggestDocxWeightsFromContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid().optional(),
        weights: weightsSchema.optional(),
        limit: z.number().int().min(100).max(5000).default(3000),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    // RLS giới hạn theo tổ chức. Có id thì chỉ học từ tài liệu đó.
    let q = context.supabase
      .from("work_product_blocks")
      .select("work_product_id, block_type, text, source_anchor")
      .limit(data.limit);
    if (data.id) q = q.eq("work_product_id", data.id);
    const { data: rows, error } = await q;
    if (error) mapPgError(error);

    const blocks = ((rows ?? []) as any[]).map((b) => ({
      productId: String(b.work_product_id),
      role: String((b.source_anchor ?? {}).role ?? b.block_type ?? "PARAGRAPH"),
      score:
        typeof (b.source_anchor ?? {}).score === "number"
          ? (b.source_anchor.score as number)
          : null,
      text: String(b.text ?? ""),
    }));
    if (!blocks.length)
      throw new ApiError({ code: "VALIDATION_FAILED", message: "NO_DOCX_CONTENT" });

    const current = (await import("./docx-profile.server")).normalizeProfileWeights(data.weights);

    type Key = keyof typeof current;
    const roleOfKey: Record<Key, string> = {
      title: "TITLE",
      heading: "HEADING",
      listItem: "LIST_ITEM",
      quote: "QUOTE",
      caption: "CAPTION",
      table: "TABLE",
    };

    // Dấu hiệu nội dung: đoạn nào "trông giống" loại nào nhưng lại bị xếp là đoạn văn.
    const looksLike: Record<Key, (t: string) => boolean> = {
      title: (t) => t.length <= 90 && /^[^a-zà-ỹ]{6,}$/u.test(t.replace(/\s+/g, " ").trim()),
      heading: (t) =>
        t.length <= 120 &&
        /^(\d+(\.\d+)*[.)]?\s+|(chương|phần|mục|điều|section|chapter)\s)/iu.test(t.trim()),
      listItem: (t) => /^\s*([-–—•*+]|\(?\d{1,2}[.)]|[a-zà-ỹ][.)])\s+/iu.test(t),
      quote: (t) => /^\s*[">“«]/u.test(t) || /^\s*(trích|theo\s+\w+\s+cho\s+biết)/iu.test(t),
      caption: (t) =>
        t.length <= 160 &&
        /^\s*(hình|bảng|biểu|sơ đồ|ảnh|figure|table|chart)\s*\d*\s*[:.\-–]/iu.test(t),
      table: (t) => (t.match(/\|/g) ?? []).length >= 2 || /\t.*\t/.test(t),
    };

    const counts = new Map<
      string,
      { blocks: number; scored: number; scoreSum: number; low: number }
    >();
    for (const b of blocks) {
      const c = counts.get(b.role) ?? { blocks: 0, scored: 0, scoreSum: 0, low: 0 };
      c.blocks += 1;
      if (b.score !== null) {
        c.scored += 1;
        c.scoreSum += b.score;
        if (b.score < 1) c.low += 1;
      }
      counts.set(b.role, c);
    }

    const paragraphs = blocks.filter((b) => b.role === "PARAGRAPH" || b.role === "OTHER");
    const missed: Record<string, number> = {};
    for (const p of paragraphs) {
      for (const key of Object.keys(current) as Key[]) {
        if (looksLike[key](p.text)) missed[key] = (missed[key] ?? 0) + 1;
      }
    }

    // Đề xuất AI đã được duyệt hay bị từ chối theo từng loại: dấu hiệu nhận diện đúng hay sai.
    const opsQuery = context.supabase
      .from("work_product_change_ops")
      .select("source_anchor, status, work_product_id")
      .eq("origin", "AI")
      .limit(1000);
    const { data: opRows } = data.id
      ? await opsQuery.eq("work_product_id", data.id)
      : await opsQuery;
    const decided = new Map<string, { ok: number; bad: number }>();
    for (const o of (opRows ?? []) as any[]) {
      const role = String((o.source_anchor ?? {}).role ?? "PARAGRAPH");
      const d = decided.get(role) ?? { ok: 0, bad: 0 };
      if (o.status === "ACCEPTED" || o.status === "APPLIED") d.ok += 1;
      else if (o.status === "REJECTED") d.bad += 1;
      decided.set(role, d);
    }

    const round1 = (n: number) => Math.round(Math.min(2, Math.max(0, n)) * 10) / 10;
    const changes: Array<{
      key: string;
      role: string;
      from: number;
      to: number;
      reason: string;
    }> = [];
    const next = { ...current };

    for (const key of Object.keys(current) as Key[]) {
      const role = roleOfKey[key];
      const stat = counts.get(role) ?? { blocks: 0, scored: 0, scoreSum: 0, low: 0 };
      const avg = stat.scored ? stat.scoreSum / stat.scored : null;
      const miss = missed[key] ?? 0;
      const dec = decided.get(role) ?? { ok: 0, bad: 0 };
      const total = dec.ok + dec.bad;
      const accuracy = total >= 2 ? dec.ok / total : null;

      let delta = 0;
      const reasons: string[] = [];

      // Bỏ sót: nhiều đoạn trông giống loại này nhưng vẫn bị xếp là đoạn văn → tăng trọng số.
      if (miss >= 3 || (miss >= 1 && stat.blocks === 0)) {
        delta += miss >= 8 ? 0.4 : 0.2;
        reasons.push(`${miss} đoạn có dấu hiệu ${role} nhưng đang bị đọc là đoạn văn`);
      }
      // Nhận diện yếu (điểm thấp) → tăng nhẹ.
      if (avg !== null && avg < 1.2 && stat.blocks > 0) {
        delta += 0.1;
        reasons.push(`điểm nhận diện trung bình thấp (${Math.round(avg * 100) / 100})`);
      }
      // AI hay bị từ chối ở loại này → tăng để nhận diện chắc hơn.
      if (accuracy !== null && accuracy < 0.6) {
        delta += 0.1;
        reasons.push(
          `đề xuất trên loại này bị từ chối nhiều (${Math.round(accuracy * 100)}% đúng)`,
        );
      }
      // Nhận diện quá tay: rất nhiều đoạn được gán loại này mà điểm rất cao và không bỏ sót → giảm.
      if (
        miss === 0 &&
        avg !== null &&
        avg >= 2 &&
        stat.blocks > blocks.length * 0.4 &&
        current[key] > 0.6
      ) {
        delta -= 0.2;
        reasons.push("loại này chiếm phần lớn tài liệu, có thể đang nhận diện quá rộng");
      }

      const to = round1(current[key] + delta);
      if (to !== current[key]) {
        next[key] = to;
        changes.push({
          key,
          role,
          from: current[key],
          to,
          reason: reasons.join("; ") || "điều chỉnh theo nội dung tài liệu",
        });
      }
    }

    return {
      weights: next,
      changes,
      analyzedBlocks: blocks.length,
      analyzedDocuments: new Set(blocks.map((b) => b.productId)).size,
      scope: data.id ? ("THIS" as const) : ("ALL" as const),
    };
  });

/* ------------------------------------- hồ sơ nhận diện Word theo tổ chức */

/** Đọc hồ sơ nhận diện của tổ chức đang làm việc, kèm quyền chỉnh sửa. */
export const getTenantDocxProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ ...commandMetadataSchema.shape, workspaceId: z.string().uuid().optional() })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { resolveTenantId } = await import("./work-deliverables.server");
    const { readActiveTenantCookie } = await import("./active-tenant.server");
    const tenantId = await resolveTenantId(
      context.supabase as never,
      context.userId,
      data.workspaceId ?? null,
      readActiveTenantCookie(),
    );
    const { loadTenantDocxProfile } = await import("./docx-profile.server");
    const profile = await loadTenantDocxProfile(context.supabase as never, tenantId);

    const { data: member } = await context.supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();
    const canEdit = ["tenant_owner", "tenant_admin"].includes(String(member?.role ?? ""));

    return { tenantId, canEdit, ...profile };
  });

/** Lưu hồ sơ nhận diện của tổ chức. Chỉ chủ sở hữu và quản trị viên được lưu. */
export const saveTenantDocxProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        workspaceId: z.string().uuid().optional(),
        weights: weightsSchema.optional(),
        aiGuidance: z.string().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { resolveTenantId } = await import("./work-deliverables.server");
    const { readActiveTenantCookie } = await import("./active-tenant.server");
    const tenantId = await resolveTenantId(
      context.supabase as never,
      context.userId,
      data.workspaceId ?? null,
      readActiveTenantCookie(),
    );

    const { data: member } = await context.supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();
    if (!["tenant_owner", "tenant_admin"].includes(String(member?.role ?? "")))
      throw new ApiError({ code: "DOCX_PROFILE_FORBIDDEN", message: "DOCX_PROFILE_FORBIDDEN" });

    const { loadTenantDocxProfile, normalizeProfileWeights } =
      await import("./docx-profile.server");
    const current = await loadTenantDocxProfile(context.supabase as never, tenantId);
    const weights = normalizeProfileWeights({ ...current.weights, ...(data.weights ?? {}) });
    const aiGuidance = (data.aiGuidance ?? current.aiGuidance).slice(0, 2000);

    const { error } = await context.supabase.from("work_docx_recognition_profiles").upsert(
      {
        tenant_id: tenantId,
        weights,
        ai_guidance: aiGuidance,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (error) mapPgError(error);

    return { tenantId, weights, aiGuidance };
  });

/* -------------------------------------------- lịch sử thay đổi từng bản Word */

/**
 * Lịch sử thay đổi theo từng phiên bản Word: ai thay đổi, do người hay AI,
 * và cụ thể những khối nào đã đổi (trước → sau). Chỉ đọc qua RLS.
 */
export const getWorkProductDocxChangeHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const [versionsRes, opsRes, blocksRes] = await Promise.all([
      context.supabase
        .from("work_product_versions")
        .select("version, title, summary, author_id, ai_generated, created_at")
        .eq("work_product_id", data.id)
        .order("version", { ascending: false })
        .limit(50),
      context.supabase
        .from("work_product_change_ops")
        .select(
          "id, block_key, before_text, after_text, origin, status, applied_version, author_id, decided_by, decided_at, created_at, source_anchor",
        )
        .eq("work_product_id", data.id)
        .order("created_at", { ascending: true })
        .limit(1000),
      context.supabase
        .from("work_product_blocks")
        .select("block_key, ordinal, block_type, source_anchor")
        .eq("work_product_id", data.id)
        .limit(1000),
    ]);
    if (versionsRes.error) mapPgError(versionsRes.error);
    if (opsRes.error) mapPgError(opsRes.error);

    const versions = (versionsRes.data ?? []) as any[];
    const ops = (opsRes.data ?? []) as any[];
    const blockMeta = new Map<string, any>();
    for (const b of (blocksRes.data ?? []) as any[]) blockMeta.set(b.block_key as string, b);

    const userIds = [
      ...new Set(
        [
          ...versions.map((v) => v.author_id),
          ...ops.map((o) => o.author_id),
          ...ops.map((o) => o.decided_by),
        ].filter(Boolean),
      ),
    ] as string[];
    const nameById = new Map<string, string>();
    if (userIds.length) {
      const { data: people } = await context.supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);
      for (const p of (people ?? []) as any[])
        nameById.set(p.id as string, (p.display_name as string) || (p.email as string) || "—");
    }
    const who = (id: string | null) => (id ? (nameById.get(id) ?? "—") : "—");

    const excerpt = (s: string | null) => (s ?? "").trim().slice(0, 300);
    const toEntry = (o: any) => {
      const meta = blockMeta.get(o.block_key as string);
      const role =
        (o.source_anchor as any)?.semanticRole ??
        (meta?.source_anchor as any)?.semanticRole ??
        null;
      return {
        id: o.id as string,
        blockKey: o.block_key as string,
        ordinal: (meta?.ordinal ?? null) as number | null,
        blockType: (meta?.block_type ?? null) as string | null,
        semanticRole: role as string | null,
        origin: (o.origin as string) ?? "HUMAN",
        status: (o.status as string) ?? "PENDING",
        before: excerpt(o.before_text),
        after: excerpt(o.after_text),
        editorId: (o.author_id as string) ?? null,
        editor: who(o.author_id as string | null),
        decidedById: (o.decided_by as string) ?? null,
        decidedBy: who(o.decided_by as string | null),
        decidedAt: (o.decided_at as string) ?? null,
        createdAt: o.created_at as string,
      };
    };

    const byVersion = new Map<number, any[]>();
    const pending: any[] = [];
    for (const o of ops) {
      const entry = toEntry(o);
      if (o.status === "APPLIED" && typeof o.applied_version === "number") {
        const list = byVersion.get(o.applied_version) ?? [];
        list.push(entry);
        byVersion.set(o.applied_version, list);
      } else if (o.status !== "REJECTED") {
        pending.push(entry);
      }
    }

    const items = versions.map((v) => {
      const changes = (byVersion.get(v.version as number) ?? []).sort(
        (a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0),
      );
      const editors = [...new Set(changes.map((c) => c.editor).filter((n) => n !== "—"))];
      return {
        version: v.version as number,
        title: v.title as string,
        summary: (v.summary as string) ?? "",
        createdAt: v.created_at as string,
        aiGenerated: Boolean(v.ai_generated),
        author: who(v.author_id as string | null),
        editors,
        counts: {
          total: changes.length,
          ai: changes.filter((c) => c.origin === "AI").length,
          human: changes.filter((c) => c.origin !== "AI").length,
        },
        changes,
      };
    });

    return {
      items,
      pending,
      totals: {
        versions: items.length,
        changes: ops.filter((o) => o.status === "APPLIED").length,
        ai: ops.filter((o) => o.status === "APPLIED" && o.origin === "AI").length,
        human: ops.filter((o) => o.status === "APPLIED" && o.origin !== "AI").length,
      },
    };
  });

/* ---------- Gợi ý ghép tài liệu Word vào công việc/cuộc họp đã có trong bản đồ ---------- */

export type WorkGraphMatchSuggestion = {
  targetType: "TASK" | "MEETING" | "MEETING_ARTIFACT";
  targetId: string;
  title: string;
  subtitle: string | null;
  reason: string;
  confidence: number;
  alreadyLinked: boolean;
};

/**
 * Đọc nội dung tài liệu (ưu tiên phần đã thay đổi) và đối chiếu với công việc,
 * cuộc họp, biên bản/quyết định đang có của tổ chức để đề xuất liên kết.
 * Không tự tạo liên kết — người dùng duyệt rồi mới gắn.
 */
export const proposeWorkGraphMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        locale: z.string().max(8).default("vi"),
      })
      .parse(i),
  )
  .handler(
    async ({ data, context }): Promise<WorkGraphMatchSuggestion[]> =>
      computeWorkGraphMatches(context.supabase as any, data.id, data.locale),
  );

/** Lõi đối chiếu nội dung tài liệu với công việc, cuộc họp, biên bản đang có của tổ chức. */
async function computeWorkGraphMatches(
  supabase: any,
  productId: string,
  locale: string,
): Promise<WorkGraphMatchSuggestion[]> {
  {
    const apiKey = process.env["LOVABLE_API_KEY"];

    if (!apiKey) throw new ApiError({ code: "INTERNAL_ERROR", message: "AI_UNAVAILABLE" });

    const { data: product } = await supabase
      .from("work_products")
      .select("id, tenant_id, title, business_type, content")
      .eq("id", productId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!product)
      throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    const { data: blocks } = await supabase
      .from("work_product_blocks")
      .select("text, ordinal, source_anchor")
      .eq("work_product_id", productId)
      .order("ordinal", { ascending: true })
      .limit(400);
    const blockContent = ((blocks ?? []) as any[])
      .map((b) => String(b.text ?? "").trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, 12000);
    // Tài liệu soạn trực tiếp (NATIVE) chưa có block: dùng nội dung hiện tại của tài liệu.
    const content = (
      blockContent.trim() ? blockContent : String((product as any).content ?? "")
    ).slice(0, 12000);
    if (!content.trim())
      throw new ApiError({ code: "VALIDATION_FAILED", message: "WORK_PRODUCT_EMPTY" });

    const tenantId = product.tenant_id as string;
    const [tasksRes, meetingsRes, artifactsRes, linksRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, status, description, updated_at")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(60),
      supabase
        .from("meetings")
        .select("id, title, status, start_at")
        .eq("tenant_id", tenantId)
        .order("start_at", { ascending: false })
        .limit(40),
      supabase
        .from("meeting_artifacts")
        .select("id, title, kind, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase.rpc("get_work_context", {
        _entity_type: "WORK_PRODUCT",
        _entity_id: productId,
        _limit: 200,
      }),
    ]);

    const linked = new Set<string>();
    const rels = ((linksRes?.data as any)?.relationships ?? []) as any[];
    for (const r of rels) linked.add(`${r.entityType}:${r.entityId}`);

    type Cand = WorkGraphMatchSuggestion & { extra: string };
    const candidates: Cand[] = [];
    for (const t of ((tasksRes.data ?? []) as any[]).filter(Boolean))
      candidates.push({
        targetType: "TASK",
        targetId: t.id,
        title: t.title ?? "(Không tiêu đề)",
        subtitle: t.status ?? null,
        reason: "",
        confidence: 0,
        alreadyLinked: linked.has(`TASK:${t.id}`),
        extra: String(t.description ?? "").slice(0, 300),
      });
    for (const m of ((meetingsRes.data ?? []) as any[]).filter(Boolean))
      candidates.push({
        targetType: "MEETING",
        targetId: m.id,
        title: m.title ?? "(Không tiêu đề)",
        subtitle: m.start_at ? new Date(m.start_at).toLocaleString("vi-VN") : (m.status ?? null),
        reason: "",
        confidence: 0,
        alreadyLinked: linked.has(`MEETING:${m.id}`),
        extra: "",
      });
    for (const a of ((artifactsRes.data ?? []) as any[]).filter(Boolean))
      candidates.push({
        targetType: "MEETING_ARTIFACT",
        targetId: a.id,
        title: a.title ?? a.kind ?? "(Không tiêu đề)",
        subtitle: a.kind ?? null,
        reason: "",
        confidence: 0,
        alreadyLinked: linked.has(`MEETING_ARTIFACT:${a.id}`),
        extra: "",
      });
    const open = candidates.filter((c) => !c.alreadyLinked);
    if (!open.length) return [];

    const list = open
      .map(
        (c, idx) =>
          `#${idx + 1} [${c.targetType}] ${c.title}${c.subtitle ? ` (${c.subtitle})` : ""}` +
          (c.extra ? `\n   mô tả: ${c.extra}` : ""),
      )
      .join("\n")
      .slice(0, 12000);

    const { streamText } = await import("ai");
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
    const systemPrompt =
      "Bạn đối chiếu nội dung một tài liệu nghiệp vụ với danh sách công việc, cuộc họp và biên bản " +
      "đang có trong tổ chức, rồi xếp hạng những mục liên quan nhất để liên kết. " +
      "Không bịa mục mới, chỉ dùng số hiệu trong danh sách. " +
      "Luôn trả về từ 3 đến 8 dòng, kể cả khi mức tin cậy thấp; dùng điểm tin cậy để thể hiện mức chắc chắn. " +
      `Trả lời bằng ngôn ngữ locale ${locale}.`;
    const userPrompt =
      `TÀI LIỆU: ${product.title} (${product.business_type})\n` +
      `NỘI DUNG:\n${content}\n\n` +
      `DANH SÁCH MỤC CÓ THỂ LIÊN KẾT:\n${list}\n\n` +
      "Chọn tối đa 8 mục liên quan nhất (ít nhất 3 mục). Mỗi dòng theo đúng mẫu:\n" +
      "- #số :: LÝ DO: căn cứ trong tài liệu :: 0-100\n" +
      "Số cuối là mức độ tin cậy. Không thêm giải thích ngoài các dòng đó.";

    const runModel = async (effort: "medium" | "high") => {
      const result = streamText({
        model: createLovableResponsesProvider(apiKey).responses("openai/gpt-6-astra"),
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: effort,
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      return (await result.text).trim();
    };

    // Mô hình suy luận có thể trả về nội dung rỗng; thử lại một lần với mức suy luận cao hơn.
    let text = await runModel("medium");
    if (!text) text = await runModel("high");

    const out: WorkGraphMatchSuggestion[] = [];
    const seen = new Set<string>();
    for (const raw of text.split("\n")) {
      const line = raw.replace(/^[-*\s]+/, "").trim();
      if (!line) continue;
      // Ưu tiên đúng mẫu "#n :: lý do :: 0-100", nếu khác thì đọc mềm.
      const strict =
        /^#?(\d+)\s*::\s*(?:LÝ DO:|LY DO:|REASON:)?\s*(.+?)\s*::\s*(\d{1,3})\s*$/i.exec(line);
      let idxRaw: number | null = null;
      let reason = "";
      let conf = 60;
      if (strict) {
        idxRaw = Number(strict[1]);
        reason = strict[2];
        conf = Number(strict[3]);
      } else {
        const hash = /#\s*(\d+)/.exec(line);
        if (!hash) continue;
        idxRaw = Number(hash[1]);
        const nums = line.match(/(\d{1,3})\s*%?\s*$/);
        if (nums) conf = Number(nums[1]);
        reason = line
          .replace(/#\s*\d+/, "")
          .replace(/(\d{1,3})\s*%?\s*$/, "")
          .replace(/(LÝ DO:|LY DO:|REASON:)/i, "")
          .replace(/^[\s:|\-–—.]+|[\s:|\-–—.]+$/g, "")
          .trim();
      }
      const idx = (idxRaw ?? 0) - 1;
      const cand = open[idx];
      if (!cand) continue;
      const key = `${cand.targetType}:${cand.targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        targetType: cand.targetType,
        targetId: cand.targetId,
        title: cand.title,
        subtitle: cand.subtitle,
        reason: (reason || "AI đánh giá có liên quan tới nội dung tài liệu.").slice(0, 400),
        confidence: Math.max(0, Math.min(100, conf)),
        alreadyLinked: false,
      });
      if (out.length >= 8) break;
    }
    if (out.length) return out.sort((a, b) => b.confidence - a.confidence);

    // Dự phòng: khi AI không đưa ra dòng nào, xếp hạng theo trùng từ khoá để người dùng vẫn chọn được.
    const stop = new Set([
      "và",
      "của",
      "cho",
      "các",
      "một",
      "trong",
      "với",
      "về",
      "theo",
      "được",
      "là",
      "có",
      "đã",
      "tại",
      "từ",
      "này",
      "đó",
      "the",
      "and",
      "for",
      "with",
      "from",
      "that",
      "this",
      "task",
      "công",
      "việc",
    ]);
    const tokenize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stop.has(w));
    const docTokens = new Set(tokenize(content));
    const scored = open
      .map((c) => {
        const words = tokenize(`${c.title} ${c.extra}`);
        const hits = Array.from(new Set(words.filter((w) => docTokens.has(w))));
        return { c, hits, score: hits.length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    return scored.map(({ c, hits, score }) => ({
      targetType: c.targetType,
      targetId: c.targetId,
      title: c.title,
      subtitle: c.subtitle,
      reason: `Trùng từ khoá với tài liệu: ${hits.slice(0, 6).join(", ")}`,
      confidence: Math.min(75, 30 + score * 8),
      alreadyLinked: false,
    }));
  }
}


/**
 * Gắn thật tài liệu vào công việc / cuộc họp / biên bản đã có trong bản đồ công việc,
 * dựa trên đối chiếu nội dung thật. Chỉ gắn khi mức tin cậy đạt ngưỡng.
 */
export const autoLinkWorkGraphMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        ...commandMetadataSchema.shape,
        id: z.string().uuid(),
        locale: z.string().max(8).default("vi"),
        minConfidence: z.number().int().min(0).max(100).default(55),
        maxLinks: z.number().int().min(1).max(8).default(5),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const matches = await computeWorkGraphMatches(
      context.supabase as any,
      data.id,
      data.locale,
    );
    const chosen = matches
      .filter((m) => !m.alreadyLinked && m.confidence >= data.minConfidence)
      .slice(0, data.maxLinks);

    const linked: WorkGraphMatchSuggestion[] = [];
    const failed: Array<{ title: string; message: string }> = [];
    for (const m of chosen) {
      // link_work_entities là idempotent theo cặp nguồn/đích và chạy dưới quyền người gọi (RLS).
      const res = await context.supabase.rpc("link_work_entities", {
        _source_type: "WORK_PRODUCT",
        _source_id: data.id,
        _target_type: m.targetType,
        _target_id: m.targetId,
        _relationship: "REFERENCES",
      });
      if (res.error) failed.push({ title: m.title, message: res.error.message });
      else linked.push(m);
    }

    return {
      linked,
      skipped: matches.filter((m) => !chosen.includes(m)),
      failed,
      minConfidence: data.minConfidence,
      evaluated: matches.length,
    };
  });

