// LỊCH CHẠY BỘ NÃO HẰNG NGÀY — chạy nền cho mọi tổ chức đã bật "tự động đào tạo lại".
// Chỉ đọc dữ liệu vận hành của từng tổ chức và ghi kỹ năng mới + dấu vết lần chạy.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { retrainSkillsForTenant } from "./ai-skills-retrain.server";
import { loadCeoOverview } from "./ceo.server";

const ADMIN_ROLES = ["tenant_owner", "tenant_admin"];
const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // tối đa 1 lần / ngày

export type DailyBrainResult = {
  tenants: number;
  retrained: number;
  skipped: number;
  createdSkills: number;
  errors: string[];
};

export async function runDailyBrainRetraining(admin: any, limit = 20): Promise<DailyBrainResult> {
  const result: DailyBrainResult = {
    tenants: 0,
    retrained: 0,
    skipped: 0,
    createdSkills: 0,
    errors: [],
  };

  const { data: settings } = await admin
    .from("ceo_kpi_settings")
    .select("tenant_id, auto_retrain, auto_retrain_at")
    .eq("auto_retrain", true)
    .limit(limit);

  const rows = (settings ?? []) as {
    tenant_id: string;
    auto_retrain_at: string | null;
  }[];

  for (const row of rows) {
    result.tenants += 1;
    if (
      row.auto_retrain_at &&
      Date.now() - new Date(row.auto_retrain_at).getTime() < MIN_INTERVAL_MS
    ) {
      result.skipped += 1;
      continue;
    }

    // Ghi nhận lần chạy dưới danh nghĩa một quản trị viên của chính tổ chức đó.
    const { data: member } = await admin
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", row.tenant_id)
      .eq("status", "active")
      .in("role", ADMIN_ROLES)
      .limit(1)
      .maybeSingle();
    const userId = (member as { user_id?: string } | null)?.user_id;
    if (!userId) {
      result.skipped += 1;
      continue;
    }

    try {
      const res = await retrainSkillsForTenant({ supabase: admin, userId }, row.tenant_id, null);
      result.retrained += 1;
      result.createdSkills += res.created;

      // Sau khi đào tạo, tính lại KPI của tổ chức và lưu ảnh chụp để Command Center
      // hiển thị số liệu mới ngay, không cần bấm "Làm mới".
      try {
        const overview = await loadCeoOverview(admin, row.tenant_id, "week");
        await admin
          .from("ceo_kpi_settings")
          .update({
            kpi_refreshed_at: new Date().toISOString(),
            kpi_snapshot: {
              score: overview.kpi.score ?? null,
              configured: overview.kpi.configured,
              totalTasks: overview.totals.total,
              completed: overview.totals.completed.current,
              overdue: overview.totals.overdue,
              aiSharePct: overview.split.aiSharePct,
            },
          })
          .eq("tenant_id", row.tenant_id);
        result.kpiRefreshed += 1;
      } catch (e) {
        result.errors.push(
          `KPI ${row.tenant_id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200),
        );
      }
    } catch (e) {
      result.errors.push(
        `${row.tenant_id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200),
      );
    }
  }

  return result;
}
