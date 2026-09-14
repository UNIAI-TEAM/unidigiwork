// LƯU LỊCH SỬ KPI — mỗi lần job nền làm mới KPI thì ghi thêm một mốc để so sánh theo ngày.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type KpiSnapshotValues = {
  score: number | null;
  configured: boolean;
  totalTasks: number;
  completed: number;
  overdue: number;
  aiSharePct: number | null;
};

/** Ghi một mốc KPI vào lịch sử. Không ném lỗi để không làm hỏng job nền. */
export async function recordKpiSnapshot(
  admin: any,
  tenantId: string,
  source: "ai_brain" | "standup" | "manual",
  values: KpiSnapshotValues,
): Promise<void> {
  try {
    await admin.from("ceo_kpi_snapshots").insert({
      tenant_id: tenantId,
      source,
      score: values.score,
      configured: values.configured,
      total_tasks: values.totalTasks,
      completed: values.completed,
      overdue: values.overdue,
      ai_share_pct: values.aiSharePct,
      payload: values,
    });
  } catch {
    // bỏ qua: lịch sử KPI là dữ liệu phụ trợ
  }
}
