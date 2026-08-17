// AI MARKET — KPI khách quan của ứng viên AI: dựa trên số việc hoàn thành và tỉ lệ đề xuất được duyệt.
export type AiKpiInput = {
  /** Số việc đã hoàn thành (catalog toàn thị trường). */
  marketCompleted: number;
  /** Số việc hoàn thành thực tế trong tenant hiện tại. */
  tenantCompleted: number;
  /** Số đề xuất đã gửi trong tenant hiện tại. */
  tenantProposals: number;
  /** Số đề xuất được người dùng duyệt / thực thi. */
  tenantApproved: number;
  /** @deprecated Không còn dùng: KPI tính hoàn toàn từ dữ liệu thực thi. */
  rating?: number;
};

export type AiKpi = {
  /** Tổng số việc hoàn thành (thị trường + tenant). */
  completed: number;
  tenantCompleted: number;
  proposals: number;
  approved: number;
  /** Tỉ lệ duyệt 0–100; null khi chưa có đề xuất nào. */
  approvalRate: number | null;
  /** Điểm KPI 0–100. */
  score: number;
  /** Đã có dữ liệu thực thi trong tenant hay chưa. */
  hasEvidence: boolean;
};

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));

/**
 * Điểm KPI tính hoàn toàn tự động từ dữ liệu thực thi — không có thành phần nhập tay:
 * 60% tỉ lệ đề xuất được duyệt + 40% khối lượng việc hoàn thành (log-scale, chuẩn hóa ở mốc 1.000 việc).
 * Khi chưa có đề xuất nào, toàn bộ trọng số dồn về khối lượng việc hoàn thành.
 */
export function computeAiKpi(input: AiKpiInput): AiKpi {
  const marketCompleted = Math.max(0, Number(input.marketCompleted) || 0);
  const tenantCompleted = Math.max(0, Number(input.tenantCompleted) || 0);
  const proposals = Math.max(0, Number(input.tenantProposals) || 0);
  const approved = Math.max(0, Math.min(proposals, Number(input.tenantApproved) || 0));
  const completed = marketCompleted + tenantCompleted;
  const approvalRate = proposals > 0 ? (approved / proposals) * 100 : null;

  // Khối lượng: log scale để không cho ứng viên "cày số" áp đảo hoàn toàn.
  const volume = clamp((Math.log10(1 + completed) / Math.log10(1 + 1000)) * 100);

  const score =
    approvalRate === null ? clamp(volume) : clamp(approvalRate * 0.6 + volume * 0.4);

  return {
    completed,
    tenantCompleted,
    proposals,
    approved,
    approvalRate,
    score: Math.round(score),
    hasEvidence: proposals > 0 || tenantCompleted > 0,
  };
}

export const formatApprovalRate = (rate: number | null) =>
  rate === null ? "Chưa có dữ liệu" : `${Math.round(rate)}%`;
