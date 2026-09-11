import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-logo";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import authHero from "@/assets/auth-hero.png";

const authDescription = "Đăng nhập hoặc tạo tài khoản UNIWORK bằng email.";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Đăng nhập · UNIWORK" },
      { name: "description", content: authDescription },
      { property: "og:title", content: "Đăng nhập · UNIWORK" },
      { property: "og:description", content: authDescription },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "code">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [reset, setReset] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    setReady(true);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/tasks" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (reset) {
        if (!email.trim()) throw new Error(t("ac.17"));
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success(t("ac.15"));
        setReset(false);
        return;
      }
      if (mode === "code") {
        if (!codeSent) {
          if (!email.trim()) throw new Error(t("ac.17"));
          const { error } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { shouldCreateUser: false },
          });
          if (error) throw error;
          setCodeSent(true);
          toast.success(t("otp.4"));
          return;
        }
        const digits = code.replace(/\D/g, "");
        if (digits.length !== 6) throw new Error(t("otp.8"));
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: digits,
          type: "email",
        });
        if (error) throw error;
        navigate({ to: "/tasks" });
        return;
      }
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { display_name: name } },
        });
        if (error) throw error;
        toast.success(t("ac.9"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/tasks" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("ac.10"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-panel sm:p-8">
        <div className="mb-4 flex items-center gap-2">
          <BrandMark className="h-9 w-9" />
          <div>
            <div className="font-heading text-base font-bold">UNIWORK</div>
            <div className="module-label text-muted-foreground">Digital Workplace Platform</div>
          </div>
        </div>
        {reset ? (
          <div className="mb-4">
            <div className="text-sm font-semibold">{t("ac.12")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("ac.13")}</p>
          </div>
        ) : (
          <div className="mb-5 flex rounded-xl bg-surface-2 p-1">
            {(["signin", "code", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setCodeSent(false);
                  setCode("");
                }}
                className={`min-h-10 flex-1 rounded-lg px-1 py-1.5 text-xs font-semibold sm:text-sm ${mode === m ? "bg-background text-foreground shadow-card" : "text-muted-foreground"}`}
              >
                {m === "signin" ? t("ac.1") : m === "code" ? t("otp.1") : t("ac.2")}
              </button>
            ))}
          </div>
        )}
        {!reset && mode === "code" && (
          <p className="mb-3 text-xs text-muted-foreground">{t("otp.2")}</p>
        )}
        <form onSubmit={submit} noValidate={false} className="space-y-3">
          {!reset && mode === "signup" && (
            <div>
              <label className="mb-1 block text-xs font-medium">{t("ac.3")}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium">{t("ac.4")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={mode === "code" && codeSent}
              autoComplete="email"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
            />
          </div>
          {mode === "code" && codeSent && (
            <div>
              <label className="mb-1 block text-xs font-medium">{t("otp.5")}</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-center text-lg tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          )}
          {!reset && mode !== "code" && (
            <div>
              <label className="mb-1 block text-xs font-medium">{t("ac.5")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !ready}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {!ready
              ? t("ac.6")
              : busy
                ? t("ac.7")
                : reset
                  ? t("ac.14")
                  : mode === "code"
                    ? codeSent
                      ? t("otp.6")
                      : t("otp.3")
                    : mode === "signin"
                      ? t("ac.1")
                      : t("ac.8")}
          </button>
          {mode === "code" && codeSent ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => {
                  setCodeSent(false);
                  setCode("");
                }}
                className="hover:text-foreground"
              >
                {t("otp.9")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const { error } = await supabase.auth.signInWithOtp({
                      email: email.trim(),
                      options: { shouldCreateUser: false },
                    });
                    if (error) throw error;
                    toast.success(t("otp.4"));
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : t("ac.10"));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="hover:text-foreground disabled:opacity-50"
              >
                {t("otp.7")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setReset((v) => !v)}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              {reset ? t("ac.16") : t("ac.11")}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
