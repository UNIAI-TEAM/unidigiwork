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
    async ({
      data,
      context,
    }): Promise<{ fileName: string; mimeType: string; base64: string }> => {
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
      const { buildCeoPdf, buildCeoXlsx, ceoReportFileName, toBase64 } = await import(
        "./ceo-report.server"
      );
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
