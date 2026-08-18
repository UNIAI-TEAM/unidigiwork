import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Đăng nhập — UNIWORK" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [reset, setReset] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            U
          </div>
          <div>
            <div className="text-base font-bold tracking-wide">UNIWORK</div>
            <div className="text-[10px] text-muted-foreground">Digital Workplace Platform</div>
          </div>
        </div>
        {reset ? (
          <div className="mb-4">
            <div className="text-sm font-semibold">{t("ac.12")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("ac.13")}</p>
          </div>
        ) : (
        <div className="mb-4 flex rounded-lg bg-surface-2 p-0.5">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium ${mode === m ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
            >
              {m === "signin" ? t("ac.1") : t("ac.2")}
            </button>
          ))}
        </div>
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
              autoComplete="email"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          {!reset && (
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
                  : mode === "signin"
                    ? t("ac.1")
                    : t("ac.8")}
          </button>
          <button
            type="button"
            onClick={() => setReset((v) => !v)}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {reset ? t("ac.16") : t("ac.11")}
          </button>
        </form>
      </div>
    </div>
  );
}
