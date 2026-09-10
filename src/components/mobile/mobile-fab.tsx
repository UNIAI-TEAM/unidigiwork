import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

interface MobileFABProps {
  onClick?: () => void;
  to?: string;
  icon?: ReactNode;
  label?: string;
}

export function MobileFAB({ onClick, to, icon, label }: MobileFABProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => (onClick ? onClick() : to ? navigate({ to: to as any }) : undefined)}
      className={cn(
        "fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-xl bg-action text-action-foreground shadow-panel",
        "hover:opacity-90 active:scale-95",
      )}
      aria-label={label || "Tạo mới"}
    >
      {icon || <Plus className="h-5 w-5" />}
    </button>
  );
}
