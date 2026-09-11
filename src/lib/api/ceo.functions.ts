// CEO COMMAND CENTER — server function chỉ đọc, phạm vi theo tổ chức.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";
import { loadCeoOverview, resolveTenantId, type CeoOverview } from "./ceo.server";

const Input = z.object({
  period: z.enum(["day", "week", "month", "quarter", "half", "year"]).default("month"),
  workspaceId: z.string().uuid().nullable().optional(),
});

export type { CeoOverview, CeoPeriod, CeoPersonRow, CeoIssue } from "./ceo.server";

export const getCeoOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i ?? {}))
  .handler(async ({ data, context }): Promise<CeoOverview> => {
    const tenantId = await resolveTenantId(context.supabase, context.userId, data.workspaceId);
    if (!tenantId)
      throw new ApiError({
        code: "WORKSPACE_NOT_FOUND" as never,
        message: "Không tìm thấy tổ chức đang hoạt động.",
      });
    return loadCeoOverview(context.supabase, tenantId, data.period, data.workspaceId);
  });

const ExportInput = Input.extend({ format: z.enum(["pdf", "xlsx"]) });

/** Xuất báo cáo điều hành thành PDF hoặc Excel để tải về. Chỉ đọc. */
export const exportCeoReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ExportInput.parse(i ?? {}))
  .handler(
    async ({ data, context }): Promise<{ fileName: string; mimeType: string; base64: string }> => {
      const tenantId = await resolveTenantId(context.supabase, context.userId, data.workspaceId);
      if (!tenantId)
        throw new ApiError({
          code: "WORKSPACE_NOT_FOUND" as never,
          message: "Không tìm thấy tổ chức đang hoạt động.",
        });
      const overview = await loadCeoOverview(
        context.supabase,
        tenantId,
        data.period,
        data.workspaceId,
      );
      const { buildCeoPdf, buildCeoXlsx, ceoReportFileName, toBase64 } =
        await import("./ceo-report.server");
      if (data.format === "xlsx") {
        return {
          fileName: ceoReportFileName(overview, "xlsx"),
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          base64: toBase64(buildCeoXlsx(overview)),
        };
      }
      const bytes = await buildCeoPdf(overview, "Tổ chức của bạn");
      return {
        fileName: ceoReportFileName(overview, "pdf"),
        mimeType: "application/pdf",
        base64: toBase64(bytes),
      };
    },
  );

// ===== KPI DO CEO TỰ ĐẶT =====

const TargetsSchema = z.object({
  completed: z.number().min(0).max(100000).nullable(),
  maxOverdue: z.number().min(0).max(100000).nullable(),
  aiSharePct: z.number().min(0).max(100).nullable(),
  resultRatePct: z.number().min(0).max(100).nullable(),
  passRatePct: z.number().min(0).max(100).nullable(),
});

const SaveKpiInput = z.object({
  workspaceId: z.string().uuid().nullable().optional(),
  targets: TargetsSchema,
  departmentWeights: z.record(z.string(), z.number().min(0).max(100)).default({}),
});

/** CEO/quản trị viên tổ chức đặt mục tiêu KPI và trọng số từng bộ phận. */
export const saveCeoKpiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SaveKpiInput.parse(i ?? {}))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const tenantId = await resolveTenantId(context.supabase, context.userId, data.workspaceId);
    if (!tenantId)
      throw new ApiError({
        code: "WORKSPACE_NOT_FOUND" as never,
        message: "Không tìm thấy tổ chức đang hoạt động.",
      });
    const { data: member } = await context.supabase
      .from("tenant_members")
      .select("role, status")
      .eq("tenant_id", tenantId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const role = member?.status === "active" ? member?.role : null;
    if (role !== "tenant_owner" && role !== "tenant_admin") {
      throw new ApiError({
        code: "FORBIDDEN" as never,
        message: "Chỉ chủ sở hữu hoặc quản trị viên tổ chức được đặt KPI.",
      });
    }
    const { error } = await context.supabase.from("ceo_kpi_settings").upsert(
      {
        tenant_id: tenantId,
        targets: data.targets,
        department_weights: data.departmentWeights,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (error)
      throw new ApiError({
        code: "INTERNAL" as never,
        message: `Không lưu được KPI: ${error.message}`,
      });
    return { ok: true };
  });
