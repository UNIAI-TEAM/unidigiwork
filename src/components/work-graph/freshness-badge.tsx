// Nhãn độ tươi dùng chung — hiển thị mức freshness (theo temporal-freshness)
// kèm thời điểm commit/cập nhật thực tế để người dùng tự đánh giá độ tin cậy.
import { Clock } from "lucide-react";
import {
  computeTemporalFreshness,
  type FreshnessLevel,
} from "@/domain/ai-context/temporal-freshness";
import type { AiContextEntityType } from "@/domain/ai-context/contracts";
import { cn } from "@/lib/utils";

const LEVEL_STYLE: Record<FreshnessLevel, string> = {
  fresh: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
  recent: "bg-sky-500/10 text-sky-600 border-sky-500/25",
  aging: "bg-amber-500/10 text-amber-600 border-amber-500/25",
  stale: "bg-rose-500/10 text-rose-600 border-rose-500/25",
  unknown: "bg-muted text-muted-foreground border-border",
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Định dạng mốc thời gian commit/cập nhật: dd/mm/yyyy · hh:mm */
export function formatCommitTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface FreshnessBadgeProps {
  entityType: AiContextEntityType;
  /** Mốc cập nhật (commit time) của thực thể. */
  updatedAt: string | null | undefined;
  className?: string;
  /** Hiển thị thêm đồng hồ + giờ cập nhật ngay sau nhãn. */
  showTime?: boolean;
}

export function FreshnessBadge({
  entityType,
  updatedAt,
  className,
  showTime = true,
}: FreshnessBadgeProps) {
  const f = computeTemporalFreshness(entityType, updatedAt);
  const time = formatCommitTime(updatedAt);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span
        title={f.description}
        className={cn(
          "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
          LEVEL_STYLE[f.level],
        )}
      >
        {f.label}
      </span>
      {showTime && time && (
        <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">{time}</span>
        </span>
      )}
    </span>
  );
}
