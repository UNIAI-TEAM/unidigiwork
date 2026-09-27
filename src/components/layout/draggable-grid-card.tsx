// Card có thể kéo-thả đổi vị trí và kéo cạnh phải để đổi kích thước bằng chuột.
import { useRef, useState } from "react";
import { GripVertical, MoveDiagonal2, MoveHorizontal, MoveVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export type GridCardSize = "sm" | "md" | "lg" | "full";
export type GridCardHeight = "auto" | "short" | "medium" | "tall";

const SIZE_COLS: Record<GridCardSize, number> = { sm: 4, md: 6, lg: 8, full: 12 };
const COL_SIZES: Array<{ cols: number; size: GridCardSize }> = [
  { cols: 4, size: "sm" },
  { cols: 6, size: "md" },
  { cols: 8, size: "lg" },
  { cols: 12, size: "full" },
];
const HEIGHT_PX: Record<Exclude<GridCardHeight, "auto">, number> = {
  short: 240,
  medium: 360,
  tall: 520,
};
const HEIGHT_SIZES = Object.entries(HEIGHT_PX) as Array<
  [Exclude<GridCardHeight, "auto">, number]
>;

function nearestSize(cols: number): GridCardSize {
  let best = COL_SIZES[0];
  for (const candidate of COL_SIZES) {
    if (Math.abs(candidate.cols - cols) < Math.abs(best.cols - cols)) best = candidate;
  }
  return best.size;
}

function nearestHeight(px: number): GridCardHeight {
  let best = HEIGHT_SIZES[0];
  for (const candidate of HEIGHT_SIZES) {
    if (Math.abs(candidate[1] - px) < Math.abs(best[1] - px)) best = candidate;
  }
  return best[0];
}

export function DraggableGridCard({
  cardKey,
  size,
  height = "auto",
  label,
  className,
  resizable = true,
  onReorder,
  onResize,
  onResizeHeight,
  onResizeEnd,
  children,
}: {
  cardKey: string;
  size: GridCardSize;
  height?: GridCardHeight;
  label: string;
  className?: string;
  resizable?: boolean;
  onReorder: (from: string, to: string) => void;
  onResize: (key: string, size: GridCardSize) => void;
  onResizeHeight?: (key: string, height: GridCardHeight) => void;
  onResizeEnd?: (key: string, size: GridCardSize, height: GridCardHeight) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const lastOverRef = useRef<string | null>(null);

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragging(true);
    const handleMove = (ev: PointerEvent) => {
      const over = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-grid-card-key]");
      const overKey = over?.dataset["gridCardKey"];
      if (overKey && overKey !== cardKey && overKey !== lastOverRef.current) {
        lastOverRef.current = overKey;
        onReorder(cardKey, overKey);
      }
    };
    const handleUp = () => {
      setDragging(false);
      lastOverRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  const startResize =
    (axis: "x" | "y" | "xy") => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const card = ref.current;
    const grid = card?.closest<HTMLElement>("[data-card-grid]");
    if (!card || !grid) return;
    setResizing(true);
    const gridRect = grid.getBoundingClientRect();
    const left = card.getBoundingClientRect().left;
    const top = card.getBoundingClientRect().top;
    const colWidth = gridRect.width / 12;
    let last = size;
    let lastHeight = height;

    const handleMove = (ev: PointerEvent) => {
      if (axis !== "y") {
        const cols = Math.max(1, Math.round((ev.clientX - left) / colWidth));
        const next = nearestSize(cols);
        if (next !== last) {
          last = next;
          onResize(cardKey, next);
        }
      }
      if (axis !== "x" && onResizeHeight) {
        const nextHeight = nearestHeight(Math.max(180, ev.clientY - top));
        if (nextHeight !== lastHeight) {
          lastHeight = nextHeight;
          onResizeHeight(cardKey, nextHeight);
        }
      }
    };
    const handleUp = () => {
      setResizing(false);
      onResizeEnd?.(cardKey, last, lastHeight);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    };

  const heightStyle = height === "auto" ? undefined : { height: HEIGHT_PX[height] };

  return (
    <div
      ref={ref}
      data-grid-card-key={cardKey}
      style={heightStyle}
      className={cn(
        "group/card relative min-w-0",
        (dragging || resizing) &&
          "z-20 ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
        dragging && "opacity-80",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Kéo để đổi vị trí ${label}`}
        onPointerDown={startDrag}
        className="absolute left-2 top-2 z-20 hidden h-10 w-10 cursor-grab touch-none items-center justify-center rounded-md border border-border bg-surface/95 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground active:cursor-grabbing group-hover/card:opacity-100 focus:opacity-100 sm:flex"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {resizable ? (
        <button
          type="button"
          aria-label={`Kéo để đổi kích thước ${label}`}
          onPointerDown={startResize("x")}
          className="absolute -right-2 top-1/2 z-20 hidden h-14 w-7 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-md border border-border bg-surface/95 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground group-hover/card:opacity-100 focus:opacity-100 lg:flex"
        >
          <MoveHorizontal className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {resizable && onResizeHeight ? (
        <>
          <button
            type="button"
            aria-label={`Kéo cạnh dưới để đổi chiều cao ${label}`}
            onPointerDown={startResize("y")}
            className="absolute bottom-0 left-1/2 z-20 hidden h-7 w-14 -translate-x-1/2 translate-y-2 cursor-ns-resize touch-none items-center justify-center rounded-md border border-border bg-surface/95 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/card:opacity-100 focus:opacity-100 lg:flex"
          >
            <MoveVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Kéo góc để đổi chiều rộng và chiều cao ${label}`}
            onPointerDown={startResize("xy")}
            className="absolute -bottom-2 -right-2 z-30 hidden h-9 w-9 cursor-nwse-resize touch-none items-center justify-center rounded-md border border-border bg-surface/95 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/card:opacity-100 focus:opacity-100 lg:flex"
          >
            <MoveDiagonal2 className="h-4 w-4" />
          </button>
        </>
      ) : null}
      <div className={cn("min-h-0", height !== "auto" && "h-full overflow-auto")}>{children}</div>
    </div>
  );
}

export { SIZE_COLS };
