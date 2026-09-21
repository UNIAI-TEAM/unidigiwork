import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { BrandMark } from "@/components/brand-logo";

const description = "Đặt lại mật khẩu tài khoản UNIWORK.";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Đặt lại mật khẩu · UNIWORK" },
      { name: "description", content: description },
      { property: "og:title", content: "Đặt lại mật khẩu · UNIWORK" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const hash = window.location.hash ?? "";
    const isRecovery = hash.includes("type=recovery");
    supabase.auth.getSession().then(({ data }) => {
      setAllowed(Boolean(data.session) || isRecovery);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      toast.error(t("pw.7"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t("pw.6"));
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("ac.10"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-bg min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-4 flex items-center gap-2">
          <BrandMark className="h-9 w-9" />
          <div className="font-heading text-base font-bold">UNIWORK</div>
        </div>
        <div className="rounded-2xl border border-border bg-card/95 p-6 shadow-panel backdrop-blur">
          <div className="mb-4 text-sm font-semibold">{t("ac.12")}</div>
          {allowed === false ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{t("pw.8")}</p>
              <button
                type="button"
                onClick={() => navigate({ to: "/auth" })}
                className="min-h-10 w-full rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("ac.16")}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">{t("pw.3")}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">{t("pw.4")}</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <button
                type="submit"
                disabled={busy || allowed === null}
                className="min-h-10 w-full rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? t("ac.7") : t("pw.5")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
