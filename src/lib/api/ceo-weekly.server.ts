// BÁO CÁO ĐIỀU HÀNH HẰNG TUẦN — chạy nền, tạo tệp PDF/Excel và thông báo cho quản trị viên.
// Chỉ đọc dữ liệu vận hành; chỉ ghi tệp báo cáo, lịch sử chạy và thông báo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCeoOverview } from "./ceo.server";
import { buildCeoPdf, buildCeoXlsx, ceoReportFileName } from "./ceo-report.server";

const BUCKET = "ceo-reports";
const ADMIN_ROLES = ["tenant_owner", "tenant_admin"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export type WeeklyRunResult = {
  tenants: number;
  generated: number;
  skipped: number;
  errors: string[];
};

/** Tạo báo cáo tuần cho từng tổ chức đang hoạt động, tối đa `limit` tổ chức mỗi lần chạy. */
export async function runCeoWeeklyReports(admin: Client, limit = 20): Promise<WeeklyRunResult> {
  const periodEnd = new Date().toISOString().slice(0, 10);
  const result: WeeklyRunResult = { tenants: 0, generated: 0, skipped: 0, errors: [] };

  const { data: members } = await admin
    .from("tenant_members")
    .select("tenant_id, user_id, role")
    .eq("status", "active")
    .in("role", ADMIN_ROLES);

  const byTenant = new Map<string, string[]>();
  for (const m of (members ?? []) as { tenant_id: string; user_id: string }[]) {
    const list = byTenant.get(m.tenant_id) ?? [];
    list.push(m.user_id);
    byTenant.set(m.tenant_id, list);
  }

  for (const [tenantId, admins] of Array.from(byTenant.entries()).slice(0, limit)) {
    result.tenants += 1;
    try {
      const { data: existing } = await admin
        .from("ceo_report_runs")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("period_end", periodEnd)
        .maybeSingle();
      if (existing) {
        result.skipped += 1;
        continue;
      }

      const overview = await loadCeoOverview(admin as never, tenantId, "week");
      const xlsx = buildCeoXlsx(overview);
      const pdf = await buildCeoPdf(overview, "Tổ chức");

      const xlsxPath = `${tenantId}/${periodEnd}/${ceoReportFileName(overview, "xlsx")}`;
      const pdfPath = `${tenantId}/${periodEnd}/${ceoReportFileName(overview, "pdf")}`;

      const up1 = await admin.storage.from(BUCKET).upload(xlsxPath, xlsx, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
      if (up1.error) throw up1.error;
      const up2 = await admin.storage.from(BUCKET).upload(pdfPath, pdf, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (up2.error) throw up2.error;

      await admin.from("ceo_report_runs").insert({
        tenant_id: tenantId,
        period_end: periodEnd,
        pdf_path: pdfPath,
        xlsx_path: xlsxPath,
        notified_count: admins.length,
      });

      await admin.from("notifications").insert(
        admins.map((userId) => ({
          user_id: userId,
          tenant_id: tenantId,
          scope_type: "TENANT",
          type: "CEO_WEEKLY_REPORT",
          title: "Báo cáo điều hành tuần đã sẵn sàng",
          body: `Tổng hợp tuần đến ngày ${periodEnd}: ${overview.totals.completed.current} việc hoàn thành, ${overview.totals.overdue} việc quá hạn, AI đảm nhiệm ${overview.split.aiSharePct}%.`,
          link: "/ceo?report=weekly",
          meta: { periodEnd, pdfPath, xlsxPath },
        })),
      );

      result.generated += 1;
    } catch (e) {
      result.errors.push(`${tenantId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
