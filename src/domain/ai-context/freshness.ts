export type SourceFreshness = "fresh" | "recent" | "aging" | "stale" | "unknown";

export interface SourceFreshnessInfo {
  level: SourceFreshness;
  label: string;
  description: string;
  ageDays: number | null;
}

const DAY = 86_400_000;

/** Đánh giá độ "còn hiệu lực" của một nguồn dựa trên thời điểm cập nhật cuối. */
export function getSourceFreshness(
  updatedAt: string | null | undefined,
  now: Date = new Date(),
): SourceFreshnessInfo {
  if (!updatedAt) {
    return {
      level: "unknown",
      label: "Không rõ thời điểm",
      description: "Nguồn không có mốc cập nhật, không xác định được độ mới.",
      ageDays: null,
    };
  }
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) {
    return {
      level: "unknown",
      label: "Không rõ thời điểm",
      description: "Không đọc được mốc cập nhật của nguồn.",
      ageDays: null,
    };
  }
  const ageDays = Math.max(0, Math.floor((now.getTime() - ts) / DAY));
  if (ageDays <= 7) {
    return { level: "fresh", label: "Còn hiệu lực", description: `Cập nhật ${formatAge(ageDays)}.`, ageDays };
  }
  if (ageDays <= 30) {
    return { level: "recent", label: "Khá mới", description: `Cập nhật ${formatAge(ageDays)}.`, ageDays };
  }
  if (ageDays <= 90) {
    return {
      level: "aging",
      label: "Có thể đã thay đổi",
      description: `Cập nhật ${formatAge(ageDays)}, nên kiểm tra lại.`,
      ageDays,
    };
  }
  return {
    level: "stale",
    label: "Có thể lỗi thời",
    description: `Cập nhật ${formatAge(ageDays)}, thông tin có thể không còn đúng.`,
    ageDays,
  };
}

export function formatAge(ageDays: number): string {
  if (ageDays <= 0) return "hôm nay";
  if (ageDays === 1) return "hôm qua";
  if (ageDays < 30) return `${ageDays} ngày trước`;
  if (ageDays < 365) return `${Math.floor(ageDays / 30)} tháng trước`;
  return `${Math.floor(ageDays / 365)} năm trước`;
}
