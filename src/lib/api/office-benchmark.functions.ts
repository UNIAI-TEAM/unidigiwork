// Đối chứng bộ máy tạo tệp Office: bộ máy nội bộ (builtin) và GenOffice thật.
// Không ghi đè tệp bàn giao chính thức: mọi tệp sinh ra ở đây gắn vai trò BENCHMARK.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";

const WP_BUCKET = "work-products";

type Provenance = Array<{ type: string; id: string; title: string; stamp?: string | null }>;

async function storeArtifact(args: {
  supabase: { from: (t: string) => any };
  userId: string;
  tenantId: string;
  workProductId: string;
  version: number;
  engine: "builtin" | "genoffice";
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}): Promise<string | null> {
  const objectKey = `${args.tenantId}/${args.workProductId}/v${args.version}/benchmark/${args.engine}-${Date.now()}-${args.fileName}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: upErr } = await supabaseAdmin.storage
    .from(WP_BUCKET)
    .upload(objectKey, args.bytes, { contentType: args.mimeType, upsert: false });
  if (upErr) throw new ApiError({ code: "INTERNAL_ERROR", message: `ARTIFACT_UPLOAD_FAILED: ${upErr.message}` });

  const { data, error } = await args.supabase
    .from("work_product_artifacts")
    .insert({
      tenant_id: args.tenantId,
      work_product_id: args.workProductId,
      format: "DOCX",
      role: "BENCHMARK",
      engine: args.engine,
      storage_ref: objectKey,
      mime_type: args.mimeType,
      size_bytes: args.bytes.byteLength,
      version: args.version,
      generated_by: "SYSTEM",
      created_by: args.userId,
    })
    .select("id")
    .single();
  if (error) {
    await supabaseAdmin.storage.from(WP_BUCKET).remove([objectKey]);
    mapPgError(error);
  }
  return (data?.id as string) ?? null;
}

/**
 * Chạy đối chứng cho một phiên bản Kết quả công việc.
 * Chế độ GENERATE: cả hai bộ máy tạo mới DOCX từ cùng một nội dung.
 * Chế độ ROUND_TRIP: lấy DOCX gốc, cho GenOffice đọc – sửa – ghi lại, rồi đo phần OOXML giữ nguyên.
 */
export const benchmarkOfficeEngines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        workProductId: z.string().uuid(),
        version: z.number().int().positive().optional(),
        format: z.enum(["DOCX"]).default("DOCX"),
        mode: z.enum(["GENERATE", "ROUND_TRIP"]).default("GENERATE"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: product, error: pErr } = await context.supabase
      .from("work_products")
      .select("id, tenant_id, title, content, business_type, current_version")
      .eq("id", data.workProductId)
      .is("deleted_at", null)
      .maybeSingle();
    if (pErr) mapPgError(pErr);
    if (!product) throw new ApiError({ code: "RESOURCE_NOT_FOUND", message: "WORK_PRODUCT_NOT_FOUND" });

    let version = (product.current_version as number) ?? 1;
    let title = (product.title as string) ?? "";
    let content = (product.content as string) ?? "";
    let provenance: Provenance = [];

    const wanted = data.version ?? version;
    const { data: snap } = await context.supabase
      .from("work_product_versions")
      .select("version, title, content, provenance")
      .eq("work_product_id", data.workProductId)
      .eq("version", wanted)
      .maybeSingle();
    if (snap) {
      version = snap.version as number;
      title = (snap.title as string) ?? title;
      content = (snap.content as string) ?? content;
      provenance = Array.isArray(snap.provenance) ? (snap.provenance as Provenance) : [];
    }

    // Bản ghi đối chứng được tạo trước để trạng thái thất bại cũng được lưu lại.
    const { data: row, error: insErr } = await context.supabase
      .from("work_product_engine_benchmarks")
      .insert({
        tenant_id: product.tenant_id,
        work_product_id: data.workProductId,
        version,
        format: data.format,
        mode: data.mode,
        status: "RUNNING",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) mapPgError(insErr);
    const benchmarkId = row!.id as string;

    const finish = async (patch: Record<string, unknown>) => {
      await context.supabase
        .from("work_product_engine_benchmarks")
        .update({ ...patch, completed_at: new Date().toISOString() })
        .eq("id", benchmarkId);
    };

    const { renderOfficeArtifact } = await import("./office-engine.server");
    const { officeFileName } = await import("@/domain/work-products/office-engine");
    const { compareEngines, comparePartPreservation } = await import("./office-compare.server");
    const { GENOFFICE_COMMIT, GENOFFICE_ENGINE_VERSION, roundTripDocxWithGenOffice } = await import(
      "./office-genoffice.server"
    );

    const req = {
      format: "DOCX" as const,
      title: title || "Kết quả công việc",
      content,
      businessType: (product.business_type as string) ?? "DOCUMENT",
      version,
      workProductId: data.workProductId,
      provenance,
    };

    // 1) Bộ máy nội bộ
    const t0 = Date.now();
    const builtin = await renderOfficeArtifact(req, { engine: "BUILTIN" });
    const builtinMs = Date.now() - t0;

    // 2) Bộ máy GenOffice thật
    let genoffice: { bytes: Uint8Array; mimeType: string; engine: string } | null = null;
    let genofficeMs = 0;
    let failureReason: string | null = null;
    try {
      const t1 = Date.now();
      genoffice = await renderOfficeArtifact(req, { engine: "GENOFFICE" });
      genofficeMs = Date.now() - t1;
      if (genoffice.engine !== "genoffice") throw new Error("GENOFFICE_ENGINE_MISMATCH");
    } catch (e) {
      failureReason = e instanceof Error ? e.message : "GENOFFICE_UNAVAILABLE";
    }

    const builtinArtifactId = await storeArtifact({
      supabase: context.supabase as never,
      userId: context.userId,
      tenantId: product.tenant_id as string,
      workProductId: data.workProductId,
      version,
      engine: "builtin",
      bytes: builtin.bytes,
      mimeType: builtin.mimeType,
      fileName: officeFileName(`${title || "work-product"}-builtin`, version, "DOCX"),
    });

    if (!genoffice) {
      const comparison = { error: failureReason ?? "GENOFFICE_UNAVAILABLE", builtinRenderMs: builtinMs };
      await finish({ status: "FAILED", failure_reason: failureReason, comparison_json: comparison, builtin_artifact_id: builtinArtifactId });
      return { id: benchmarkId, status: "FAILED" as const, comparison, builtinArtifactId, genofficeArtifactId: null };
    }

    const genofficeArtifactId = await storeArtifact({
      supabase: context.supabase as never,
      userId: context.userId,
      tenantId: product.tenant_id as string,
      workProductId: data.workProductId,
      version,
      engine: "genoffice",
      bytes: genoffice.bytes,
      mimeType: genoffice.mimeType,
      fileName: officeFileName(`${title || "work-product"}-genoffice`, version, "DOCX"),
    });

    const cmp = await compareEngines(builtin.bytes, genoffice.bytes, content);

    type RoundTripReport = Awaited<ReturnType<typeof comparePartPreservation>> & {
      editedBlocks: number;
      totalBlocks: number;
    };
    let roundTrip: RoundTripReport | null = null;
    if (data.mode === "ROUND_TRIP") {
      // Tài liệu gốc là tệp DOCX do GenOffice tạo ở bước trên; sửa đúng một đoạn rồi ghi lại.
      const firstLine = content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("#") && !l.startsWith("|"));
      const edits = firstLine ? [{ find: firstLine, replaceWith: `${firstLine} [đã sửa]` }] : [];
      const rt = await roundTripDocxWithGenOffice(genoffice.bytes, edits);
      const preservation = await comparePartPreservation(genoffice.bytes, rt.bytes);
      roundTrip = { ...preservation, editedBlocks: rt.editedBlocks, totalBlocks: rt.totalBlocks };
    }

    const comparison = {
      builtinRenderMs: builtinMs,
      genofficeRenderMs: genofficeMs,
      ...cmp,
      roundTrip,
    };

    const passed =
      cmp.builtin.opensSuccessfully &&
      cmp.genoffice.opensSuccessfully &&
      cmp.missingInGenoffice.length === 0;
    const status = passed ? "PASSED" : cmp.genoffice.opensSuccessfully ? "PARTIAL" : "FAILED";

    await finish({
      status,
      builtin_artifact_id: builtinArtifactId,
      genoffice_artifact_id: genofficeArtifactId,
      genoffice_commit_sha: GENOFFICE_COMMIT,
      genoffice_engine_version: GENOFFICE_ENGINE_VERSION,
      comparison_json: comparison,
    });

    return { id: benchmarkId, status, comparison, builtinArtifactId, genofficeArtifactId };
  });

/** Danh sách lần đối chứng gần nhất của một Kết quả công việc. */
export const listOfficeEngineBenchmarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ workProductId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("work_product_engine_benchmarks")
      .select(
        "id, version, format, mode, status, failure_reason, genoffice_commit_sha, genoffice_engine_version, builtin_artifact_id, genoffice_artifact_id, comparison_json, started_at, completed_at",
      )
      .eq("work_product_id", data.workProductId)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) mapPgError(error);
    return { items: rows ?? [] };
  });
