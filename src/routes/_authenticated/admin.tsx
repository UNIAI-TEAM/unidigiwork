import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { LayoutGrid, ShieldCheck, Users, ListFilter, ArrowLeft, Activity, Webhook, Inbox, BookOpen, CreditCard, Gauge, Bot, Database } from "lucide-react";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { useAdminAccess } from "@/features/admin/access";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Quản trị — UNIWORK" },
      { name: "description", content: "Cấu hình tài khoản, vai trò và quy tắc hệ thống." },
    ],
  }),
  component: AdminLayout,
});

const TABS = [
  { to: "/admin" as const, label: "Tổng quan", icon: LayoutGrid, exact: true },
  { to: "/admin/users" as const, label: "Tài khoản", icon: Users },
  { to: "/admin/rules" as const, label: "Quy tắc", icon: ListFilter },
  { to: "/admin/plans" as const, label: "Bảng giá", icon: CreditCard },
  { to: "/admin/knowledge" as const, label: "Knowledge", icon: BookOpen },
  { to: "/admin/leads" as const, label: "Lead demo", icon: Inbox },
  { to: "/admin/quota" as const, label: "Quota", icon: Activity },
  { to: "/admin/ai-context" as const, label: "Context Budget", icon: Gauge },
  { to: "/admin/ai-actions" as const, label: "AI Action", icon: Bot },
  { to: "/admin/webhooks" as const, label: "Webhook", icon: Webhook },
  { to: "/admin/backup" as const, label: "Sao lưu", icon: Database },
];

function AdminLayout() {
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { access, isLoading } = useAdminAccess();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="mx-auto w-full max-w-none flex-1 px-4 py-6 sm:px-6">
          <div className="mb-6 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>{t("adm.1")}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("adm.2")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("adm.3")}
            </p>
          </div>

          {isLoading ? (
            <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
              {t("adm.4")}
            </div>
          ) : !access.canRead ? (
            <ForbiddenPanel />
          ) : (
            <>
              <nav className="mb-5 flex gap-1 rounded-xl border border-border bg-surface p-1 text-sm">
                {TABS.map((t) => {
                  const active = t.exact ? path === t.to : path.startsWith(t.to);
                  return (
                    <Link
                      key={t.to}
                      to={t.to}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                      }`}
                    >
                      <t.icon className="h-4 w-4" /> {t.label}
                    </Link>
                  );
                })}
              </nav>
              {access.level === "read" && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-500">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Bạn có quyền <strong className="font-semibold">{t("adm.5")}</strong> {t("adm.6")}
                  {t("adm.7")}
                </div>
              )}
              {access.bootstrapped && (
                <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs text-primary">
                  {t("adm.8")}
                </div>
              )}
              <Outlet />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ForbiddenPanel() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <div className="text-base font-semibold">{t("adm.9")}</div>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("adm.10")}
      </p>
      <Link
        to="/dashboard"
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("adm.11")}
      </Link>
    </div>
  );
}