import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Check, Clock } from "lucide-react";

interface SwipeRowProps {
  children: ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  disabled?: boolean;
  className?: string;
}

const THRESHOLD = 96;
const MAX = 132;

/**
 * Hàng danh sách có thao tác vuốt trên di động.
 * Vuốt phải → hành động duyệt/hoàn tất. Vuốt trái → hoãn.
 */
export function SwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = "Duyệt",
  leftLabel = "Hoãn",
  disabled,
  className,
}: SwipeRowProps) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const locked = useRef<"x" | "y" | null>(null);

  const reset = () => {
    start.current = null;
    locked.current = null;
    setDragging(false);
    setDx(0);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    const t = e.touches[0];
    if (!t) return;
    start.current = { x: t.clientX, y: t.clientY };
    locked.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    const t = e.touches[0];
    if (!s || !t) return;
    const deltaX = t.clientX - s.x;
    const deltaY = t.clientY - s.y;
    if (!locked.current) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      locked.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
    }
    if (locked.current !== "x") return;
    if (deltaX > 0 && !onSwipeRight) return;
    if (deltaX < 0 && !onSwipeLeft) return;
    setDragging(true);
    setDx(Math.max(-MAX, Math.min(MAX, deltaX)));
  };

  const onTouchEnd = () => {
    if (locked.current === "x") {
      if (dx >= THRESHOLD && onSwipeRight) onSwipeRight();
      else if (dx <= -THRESHOLD && onSwipeLeft) onSwipeLeft();
    }
    reset();
  };

  const revealRight = dx > 0;
  const active = Math.abs(dx) >= THRESHOLD;

  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      {dx !== 0 && (
        <div
          className={cn(
            "absolute inset-0 flex items-center px-5 text-sm font-medium",
            revealRight
              ? "justify-start bg-success/15 text-success"
              : "justify-end bg-warning/15 text-warning",
          )}
          aria-hidden="true"
        >
          <span className={cn("inline-flex items-center gap-2", active && "font-semibold")}>
            {revealRight ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {revealRight ? rightLabel : leftLabel}
          </span>
        </div>
      )}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={reset}
        style={{ transform: `translateX(${dx}px)` }}
        className={cn("relative touch-pan-y", !dragging && "transition-transform duration-200")}
      >
        {children}
      </div>
    </div>
  );
}
