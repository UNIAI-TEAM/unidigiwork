import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Bộ chọn workspace trong sidebar — đổi ngữ cảnh làm việc cho toàn app. */
export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { workspaceId, workspaceName, workspaces, isLoading, select } = useActiveWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onSelect = (id: string | null) => {
    select(id);
    setOpen(false);
    // PERF-005: chỉ nạp lại các nhóm query phụ thuộc workspace, không xoá toàn cache.
    for (const key of [
      ["dashboard"],
      ["tasks"],
      ["documents"],
      ["calendar"],
      ["chat"],
      ["workspace-overview"],
      ["people"],
      ["notifications"],
    ]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };

  const label = isLoading ? "Đang tải…" : (workspaceName ?? "Tất cả workspace");

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-label="Chọn workspace"
      aria-haspopup="listbox"
      aria-expanded={open}
      className={cn(
        "flex items-center rounded-lg border border-border bg-surface-2 text-sm transition hover:bg-surface",
        collapsed ? "h-9 w-9 justify-center" : "w-full gap-2 px-2.5 py-2",
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-semibold text-primary">
        {workspaceName ? workspaceName.trim().charAt(0).toUpperCase() : <LayoutGrid className="h-3 w-3" />}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate text-left font-medium">{label}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </>
      )}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      {collapsed ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}

      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute z-50 mt-2 overflow-hidden rounded-lg border border-border bg-surface shadow-xl",
            collapsed ? "left-full top-0 ml-2 w-64" : "left-0 right-0 w-full min-w-[15rem]",
          )}
        >
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ngữ cảnh làm việc
          </div>
          <div className="max-h-72 overflow-y-auto">
            <button
              type="button"
              onClick={() => onSelect(null)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2",
                !workspaceId && "bg-surface-2",
              )}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded bg-surface-2 text-muted-foreground">
                <LayoutGrid className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 font-medium">Tất cả workspace</span>
              {!workspaceId && <Check className="h-4 w-4 text-primary" />}
            </button>
            {workspaces.map((w) => {
              const selected = w.id === workspaceId;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onSelect(w.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2",
                    selected && "bg-surface-2",
                  )}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded bg-primary/10 text-[11px] font-semibold text-primary">
                    {w.name.trim().charAt(0).toUpperCase() || "W"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
            {workspaces.length === 0 && !isLoading && (
              <div className="px-3 py-3 text-sm text-muted-foreground">Chưa có workspace nào.</div>
            )}
          </div>
          <div className="border-t border-border p-1">
            <Link
              to="/workspace"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-surface-2"
            >
              <Plus className="h-4 w-4" /> Quản lý workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
