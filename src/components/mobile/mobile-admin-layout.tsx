import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function MobileAdminLayout({
  title,
  subtitle,
  backTo,
  children,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 overflow-x-hidden p-4 pb-24">
      <header className="flex min-w-0 items-start gap-2">
        {backTo ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 shrink-0"
            aria-label={t("m.admin.back")}
            onClick={() => void navigate({ to: backTo as never })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : null}
        <div className="min-w-0 pt-1">
          <h1 className="break-words text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </main>
  );
}

export function MobileAdminLoading() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> {t("m.admin.loading")}
    </div>
  );
}

export function MobileAdminMessage({
  children,
  retry,
}: {
  children: ReactNode;
  retry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-center">
      <AlertTriangle className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
      {retry ? (
        <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={retry}>
          {t("m.admin.retry")}
        </Button>
      ) : null}
    </div>
  );
}

export function ReadOnlyNotice() {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm text-foreground">
      {t("m.admin.readOnly")}
    </div>
  );
}