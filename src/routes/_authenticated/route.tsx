import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CommandPalette } from "@/components/command-palette";
import { useActiveTenant } from "@/features/tenants/hooks";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const active = useActiveTenant();
  const location = useLocation();
  const navigate = useNavigate();

  if (active.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No tenant → onboarding (unless already there).
  if (!active.data && !location.pathname.startsWith("/onboarding")) {
    navigate({ to: "/onboarding" });
    return null;
  }

  const tenant = active.data;
  const banner =
    tenant?.tenantStatus === "suspended"
      ? { tone: "warning" as const, text: "Tenant đang bị tạm ngưng. Chỉ đọc." }
      : tenant?.tenantStatus === "archived"
        ? { tone: "danger" as const, text: "Tenant đã lưu trữ." }
        : null;

  const showMultiTenantBar = (tenant?.availableCount ?? 0) > 1;

  return (
    <>
      {(banner || showMultiTenantBar) && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-1.5 text-xs ${
            banner?.tone === "danger"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : banner
                ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                : "border-border bg-surface-2 text-muted-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            {banner && <AlertTriangle className="h-3.5 w-3.5" />}
            <span>{banner?.text ?? `Đang làm việc tại: ${tenant?.tenantName}`}</span>
          </div>
          <div className="flex items-center gap-2">
            {showMultiTenantBar && <TenantSwitcher compact />}
            <Link to="/admin/tenant" className="rounded-md px-2 py-1 hover:bg-surface">
              Quản trị tenant
            </Link>
          </div>
        </div>
      )}
      <Outlet />
      <CommandPalette />
    </>
  );
}
