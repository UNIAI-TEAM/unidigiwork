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
        "fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md",
        "hover:opacity-90 active:scale-95",
      )}
      aria-label={label || "Tạo mới"}
    >
      {icon || <Plus className="h-5 w-5" />}
    </button>
  );
}
