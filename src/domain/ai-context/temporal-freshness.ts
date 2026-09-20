// AI CONTEXT ENGINE — Temporal Freshness (client-safe, thuần hàm, không I/O).
// Độ tươi là tín hiệu hạng nhất của context: mỗi loại thực thể có tốc độ "cũ đi"
// khác nhau (chat cũ rất nhanh, tài liệu/quyết định cũ chậm hơn nhiều).
import type { AiContextEntityType } from "./contracts";
import { formatAge, getSourceFreshness, type SourceFreshness } from "./freshness";

export type FreshnessLevel = SourceFreshness;

export interface TemporalFreshness {
  /** Mức hiển thị cho người dùng và cho model. */
  level: FreshnessLevel;
  /** Nhãn tiếng Việt ngắn gọn. */
  label: string;
  /** Diễn giải đầy đủ (dùng cho tooltip / prompt). */
  description: string;
  /** Tuổi tính theo ngày, null nếu không có mốc thời gian. */
  ageDays: number | null;
  /** Điểm suy giảm theo thời gian trong [0,1]; 1 = vừa cập nhật. */
  decay: number;
  /** Chu kỳ bán rã (ngày) áp dụng cho loại thực thể này. */
  halfLifeDays: number;
}

/**
 * Chu kỳ bán rã theo loại thực thể (ngày).
 * Nguồn: vòng đời nghiệp vụ thực tế của từng authority trong UNIWORK.
 */
export const FRESHNESS_HALF_LIFE_DAYS: Record<AiContextEntityType, number> = {
  CHAT_CHANNEL: 3,
  EMAIL: 5,
  TASK: 7,
  EXECUTION: 7,
  MEETING: 14,
  MEETING_ARTIFACT: 21,
  DOCUMENT: 45,
  WORK_PRODUCT: 45,
  DECISION: 120,
  WORKSPACE: 60,
  PERSON: 180,
  TENANT: 365,
};

/** Ngưỡng chuyển mức theo bội số của chu kỳ bán rã. */
const LEVEL_BY_HALF_LIVES: { max: number; level: FreshnessLevel }[] = [
  { max: 1, level: "fresh" },
  { max: 2, level: "recent" },
  { max: 4, level: "aging" },
];

const DAY = 86_400_000;

const LEVEL_LABEL: Record<FreshnessLevel, string> = {
  fresh: "Mới",
  recent: "Khá mới",
  aging: "Có thể đã thay đổi",
  stale: "Có thể lỗi thời",
  unknown: "Không rõ thời điểm",
};

/**
 * Tính độ tươi của một nguồn theo loại thực thể.
 * Deterministic: cùng input + cùng `now` luôn cho cùng kết quả.
 */
export function computeTemporalFreshness(
  entityType: AiContextEntityType,
  updatedAt: string | null | undefined,
  now: Date = new Date(),
): TemporalFreshness {
  const halfLifeDays = FRESHNESS_HALF_LIFE_DAYS[entityType] ?? 14;

  if (!updatedAt) {
    return {
      level: "unknown",
      label: LEVEL_LABEL.unknown,
      description: "Nguồn không có mốc cập nhật nên không xác định được độ mới.",
      ageDays: null,
      // Không rõ thời điểm => không thưởng, không phạt quá nặng.
      decay: 0.35,
      halfLifeDays,
    };
  }

  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) {
    return {
      level: "unknown",
      label: LEVEL_LABEL.unknown,
      description: "Không đọc được mốc cập nhật của nguồn.",
      ageDays: null,
      decay: 0.35,
      halfLifeDays,
    };
  }

  const ageDays = Math.max(0, (now.getTime() - ts) / DAY);
  const halfLives = ageDays / halfLifeDays;
  const decay = Math.min(1, Math.max(0, 0.5 ** halfLives));
  const level =
    LEVEL_BY_HALF_LIVES.find((r) => halfLives <= r.max)?.level ?? ("stale" as FreshnessLevel);
  const rounded = Math.floor(ageDays);

  return {
    level,
    label: LEVEL_LABEL[level],
    description:
      level === "fresh"
        ? `Cập nhật ${formatAge(rounded)}.`
        : level === "recent"
          ? `Cập nhật ${formatAge(rounded)}, vẫn dùng được.`
          : level === "aging"
            ? `Cập nhật ${formatAge(rounded)}, nên kiểm tra lại.`
            : `Cập nhật ${formatAge(rounded)}, thông tin có thể không còn đúng.`,
    ageDays: rounded,
    decay,
    halfLifeDays,
  };
}

/** Nhãn ngắn để nhúng vào prompt: "Mới · 2 ngày trước". */
export function freshnessTag(f: TemporalFreshness): string {
  if (f.ageDays === null) return f.label;
  return `${f.label} · ${formatAge(f.ageDays)}`;
}

// Giữ lại API cũ cho UI đã dùng freshness theo thời gian tuyệt đối.
export { getSourceFreshness };
