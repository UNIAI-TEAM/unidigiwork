// Card có thể kéo-thả đổi vị trí và kéo cạnh phải để đổi kích thước bằng chuột.
import { useRef, useState } from "react";
import { GripVertical, MoveHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type GridCardSize = "sm" | "md" | "lg" | "full";

const SIZE_COLS: Record<GridCardSize, number> = { sm: 4, md: 6, lg: 8, full: 12 };
const COL_SIZES: Array<{ cols: number; size: GridCardSize }> = [
  { cols: 4, size: "sm" },
  { cols: 6, size: "md" },
  { cols: 8, size: "lg" },
  { cols: 12, size: "full" },
];

function nearestSize(cols: number): GridCardSize {
  let best = COL_SIZES[0];
  for (const candidate of COL_SIZES) {
    if (Math.abs(candidate.cols - cols) < Math.abs(best.cols - cols)) best = candidate;
  }
  return best.size;
}

export function DraggableGridCard({
  cardKey,
  size,
  label,
  className,
  resizable = true,
  onReorder,
  onResize,
  children,
}: {
  cardKey: string;
  size: GridCardSize;
  label: string;
  className?: string;
  resizable?: boolean;
  onReorder: (from: string, to: string) => void;
  onResize: (key: string, size: GridCardSize) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragging(true);
    const handleMove = (ev: PointerEvent) => {
      const over = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-grid-card-key]");
      const overKey = over?.dataset["gridCardKey"];
      if (overKey && overKey !== cardKey) onReorder(cardKey, overKey);
    };
    const handleUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  const startResize = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const card = ref.current;
    const grid = card?.closest<HTMLElement>("[data-card-grid]");
    if (!card || !grid) return;
    setResizing(true);
    const gridRect = grid.getBoundingClientRect();
    const left = card.getBoundingClientRect().left;
    const colWidth = gridRect.width / 12;
    let last = size;

    const handleMove = (ev: PointerEvent) => {
      const cols = Math.max(1, Math.round((ev.clientX - left) / colWidth));
      const next = nearestSize(cols);
      if (next !== last) {
        last = next;
        onResize(cardKey, next);
      }
    };
    const handleUp = () => {
      setResizing(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  return (
    <div
      ref={ref}
      data-grid-card-key={cardKey}
      className={cn(
        "group/card relative min-w-0",
        (dragging || resizing) && "z-20 ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
        dragging && "opacity-80",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Kéo để đổi vị trí ${label}`}
        onPointerDown={startDrag}
        className="absolute left-1.5 top-1.5 z-10 hidden h-8 w-8 cursor-grab touch-none items-center justify-center rounded-md border border-border bg-surface/90 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground active:cursor-grabbing group-hover/card:opacity-100 sm:flex"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {resizable ? (
        <button
          type="button"
          aria-label={`Kéo để đổi kích thước ${label}`}
          onPointerDown={startResize}
          className="absolute -right-1 top-1/2 z-10 hidden h-10 w-5 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-md border border-border bg-surface/90 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover/card:opacity-100 lg:flex"
        >
          <MoveHorizontal className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {children}
    </div>
  );
}

export { SIZE_COLS };
