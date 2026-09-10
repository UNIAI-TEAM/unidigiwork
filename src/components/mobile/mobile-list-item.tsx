import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface MobileListItemProps {
  title: string;
  subtitle?: string;
  meta?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  onClick?: () => void;
  right?: ReactNode;
  className?: string;
  priorityBar?: "low" | "normal" | "high" | "urgent" | null;
}

const priorityColor = {
  low: "bg-muted-foreground/30",
  normal: "bg-blue-400",
  high: "bg-amber-400",
  urgent: "bg-rose-500",
};

export function MobileListItem({
  title,
  subtitle,
  meta,
  icon,
  badge,
  onClick,
  right,
  className,
  priorityBar,
}: MobileListItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-card transition-colors hover:border-border-strong hover:bg-surface",
        className,
      )}
    >
      {priorityBar && (
        <div
          className={cn("h-10 w-1 shrink-0 rounded-full", priorityColor[priorityBar])}
          aria-hidden="true"
        />
      )}
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {badge}
        </div>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
      </div>
      {right ?? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}
