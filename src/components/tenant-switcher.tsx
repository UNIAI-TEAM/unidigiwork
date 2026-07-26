import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useActiveTenant, useAvailableTenants, useSetActiveTenant } from "@/features/tenants/hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function TenantSwitcher({ compact = false }: { compact?: boolean }) {
  const active = useActiveTenant();
  const list = useAvailableTenants();
  const setActive = useSetActiveTenant();
  const [open, setOpen] = useState(false);

  const current = active.data;
  const tenants = list.data ?? [];

  const onSelect = async (tenantId: string) => {
    if (tenantId === current?.tenantId) {
      setOpen(false);
      return;
    }
    try {
      await setActive.mutateAsync(tenantId);
      setOpen(false);
      toast.success("Đã chuyển tenant");
      // Force fresh SSR-less data for the new tenant.
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể chuyển tenant");
    }
  };

  if (active.isLoading) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" /> Đang tải…
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium transition hover:bg-surface-2",
          compact && "h-8 px-2 text-xs",
        )}
        aria-label="Chuyển tenant"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="max-w-[160px] truncate">
          {current?.tenantName ?? "Chọn tenant"}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
          role="listbox"
        >
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tenant của bạn
          </div>
          <div className="max-h-72 overflow-y-auto">
            {tenants.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                Bạn chưa thuộc tenant nào.
              </div>
            )}
            {tenants.map((t) => {
              const selected = t.tenantId === current?.tenantId;
              return (
                <button
                  key={t.tenantId}
                  type="button"
                  onClick={() => onSelect(t.tenantId)}
                  disabled={setActive.isPending || t.tenantStatus !== "active"}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60",
                    selected && "bg-surface-2",
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                    {t.tenantName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.tenantName}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {t.tenantSlug} · {t.role}
                      {t.tenantStatus !== "active" && ` · ${t.tenantStatus}`}
                    </div>
                  </div>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
          <div className="border-t border-border p-1">
            <Link
              to="/onboarding"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-surface-2"
            >
              <Plus className="h-4 w-4" /> Tạo tenant mới
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}