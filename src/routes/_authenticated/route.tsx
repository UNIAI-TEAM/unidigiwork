import { useEffect, useState } from "react";
import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CommandPalette } from "@/components/command-palette";
import { UniCopilot, openUniCopilot } from "@/components/ai/uni-copilot";
import { useActiveTenant } from "@/features/tenants/hooks";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Ngoại tuyến: tin vào phiên đã lưu để ứng dụng vẫn mở được khi mất mạng.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const { data: local } = await supabase.auth.getSession();
        if (local.session?.user) return { user: local.session.user };
      }
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },

  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const active = useActiveTenant();
  const location = useLocation();
  const navigate = useNavigate();
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" && navigator.onLine === false,
  );

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Ngoại tuyến: không chờ dữ liệu mạng, vẫn mở giao diện đã lưu đệm.
  if (active.isLoading && !offline) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No tenant → onboarding (unless already there, hoặc đang ngoại tuyến).
  if (!active.data && !offline && !location.pathname.startsWith("/onboarding")) {
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

  return (
    <>
      {banner && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-1.5 text-xs ${
            banner.tone === "danger"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-500/40 bg-amber-500/10 text-amber-500"
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{banner.text}</span>
          </div>
          <Link to="/admin/tenant" className="rounded-md px-2 py-1 hover:bg-surface">
            Quản trị tenant
          </Link>
        </div>
      )}
      <Outlet />
      <CommandPalette />
      <UniCopilot />
      <button
        type="button"
        onClick={() => openUniCopilot()}
        title="Hỏi UNI (⌘J)"
        aria-label="Hỏi UNI"
        className="fixed bottom-5 right-5 z-30 hidden h-11 w-11 items-center justify-center rounded-full border border-border bg-background shadow-lg transition hover:bg-surface md:flex"
      >
        <Sparkles className="h-5 w-5 text-primary" />
      </button>
    </>
  );
}
