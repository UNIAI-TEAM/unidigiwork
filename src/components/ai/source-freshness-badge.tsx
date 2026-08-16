import { getSourceFreshness, type SourceFreshness } from "@/domain/ai-context/freshness";
import { cn } from "@/lib/utils";

const STYLES: Record<SourceFreshness, string> = {
  fresh: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  recent: "border-border bg-surface text-muted-foreground",
  aging: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  stale: "border-destructive/30 bg-destructive/10 text-destructive",
  unknown: "border-border bg-surface text-muted-foreground",
};

export function SourceFreshnessBadge({
  updatedAt,
  className,
}: {
  updatedAt: string | null | undefined;
  className?: string;
}) {
  const info = getSourceFreshness(updatedAt);
  return (
    <span
      title={info.description}
      aria-label={`${info.label}. ${info.description}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        STYLES[info.level],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {info.label}
    </span>
  );
}
