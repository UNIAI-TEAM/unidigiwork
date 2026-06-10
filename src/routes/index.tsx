import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles,
  MessageSquare,
  Video,
  FileText,
  BookOpen,
  Workflow,
  Bot,
  ShieldCheck,
  ArrowRight,
  Check,
  LogIn,
  Loader2,
  KanbanSquare,
  Mail,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import shotMeeting from "@/assets/shot-meeting.png.asset.json";
import shotKnowledge from "@/assets/shot-knowledge.png.asset.json";
import shotTasks from "@/assets/shot-tasks.png.asset.json";
import shotEmail from "@/assets/shot-email.png.asset.json";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { ThemeToggle } from "@/lib/theme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UNIWORK — Digital Workplace Platform cho doanh nghiệp" },
      {
        name: "description",
        content: "Họp video, tài liệu, knowledge base và workflow trong một nền tảng duy nhất.",
      },
      { property: "og:title", content: "UNIWORK — Digital Workplace Platform" },
      {
        property: "og:description",
        content: "Tất cả trong một nơi làm việc số: meeting, documents, knowledge, AI copilot.",
      },
      { property: "og:url", content: "https://unidigiwork.lovable.app/" },
      { property: "og:image", content: shotKnowledge.url },
    ],
    links: [{ rel: "canonical", href: "https://unidigiwork.lovable.app/" }],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useI18n();
  const features = [
    { icon: Video, title: t("land.feat.meet.t"), desc: t("land.feat.meet.d") },
    { icon: FileText, title: t("land.feat.docs.t"), desc: t("land.feat.docs.d") },
    { icon: BookOpen, title: t("land.feat.kb.t"), desc: t("land.feat.kb.d") },
    { icon: MessageSquare, title: t("land.feat.chat.t"), desc: t("land.feat.chat.d") },
    { icon: Workflow, title: t("land.feat.flow.t"), desc: t("land.feat.flow.d") },
    { icon: Bot, title: t("land.feat.ai.t"), desc: t("land.feat.ai.d") },
    { icon: Mail, title: t("land.feat.email.t"), desc: t("land.feat.email.d") },
  ];
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // If already signed in, jump straight to the app
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error(t("land.email") + " / " + t("land.password"));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("land.signin"));
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
              U
            </div>
            <div className="leading-tight">
              <div className="text-base font-bold tracking-wide">UNIWORK</div>
              <div className="text-[10px] text-muted-foreground">Digital Workplace Platform</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              {t("land.nav.features")}
            </a>
            <a href="#preview" className="hover:text-foreground">
              {t("land.nav.preview")}
            </a>
            <a href="#login" className="hover:text-foreground">
              {t("land.nav.login")}
            </a>
            <Link to="/meeting" className="hover:text-foreground">
              {t("land.nav.demo")}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
            <Link
              to="/auth"
              className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              {t("land.nav.signup")}
            </Link>
            <a
              href="#login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <LogIn className="h-4 w-4" /> {t("land.nav.login")}
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,theme(colors.primary/20),transparent_60%)]" />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="flex flex-col justify-center">
            <span className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> {t("land.tagline")}
            </span>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {t("land.h1.a")}
              <br />
              <span className="bg-gradient-to-r from-primary to-violet-400 bg-clip-text text-transparent">
                {t("land.h1.b")}
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              {t("land.sub")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#login"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("land.cta.start")} <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                to="/meeting"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-3 text-sm hover:bg-surface-2"
              >
                <Video className="h-4 w-4" /> {t("land.cta.demo")}
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" /> {t("land.bullet.security")}
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" /> {t("land.bullet.vi")}
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" /> {t("land.bullet.deploy")}
              </span>
            </div>
          </div>

          {/* Inline login card */}
          <div id="login" className="flex items-center justify-center">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface/80 p-6 shadow-2xl shadow-primary/5 backdrop-blur">
              <h2 className="text-xl font-semibold">{t("land.login.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("land.login.sub")}</p>
              <form onSubmit={handleLogin} className="mt-5 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("land.email")}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("land.password")}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )}
                  {t("land.signin")}
                </button>
              </form>
              <div className="mt-4 text-center text-xs text-muted-foreground">
                {t("land.no.account")}{" "}
                <Link to="/auth" className="text-primary hover:underline">
                  {t("land.create.account")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Preview screenshots */}
      <section id="preview" className="border-t border-border/60 bg-surface/30 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">{t("land.preview.title")}</h2>
            <p className="mt-3 text-muted-foreground">{t("land.preview.sub")}</p>
          </div>

          <div className="mt-12 space-y-16">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  <Video className="h-3.5 w-3.5" /> {t("land.preview.meet.tag")}
                </span>
                <h3 className="mt-3 text-2xl font-semibold">{t("land.preview.meet.h")}</h3>
                <p className="mt-2 text-muted-foreground">{t("land.preview.meet.p")}</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-primary/10">
                <img
                  src={shotMeeting.url}
                  alt={t("land.preview.meet.h")}
                  className="w-full"
                  loading="lazy"
                />
              </div>
            </div>

            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div className="group overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-primary/10 transition-all duration-500 ease-out hover:border-primary/30 hover:shadow-primary/20 lg:order-first">
                <img
                  src={shotKnowledge.url}
                  alt={t("land.preview.kb.tag")}
                  className="w-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div className="lg:order-last">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-300">
                  <BookOpen className="h-3.5 w-3.5" /> {t("land.preview.kb.tag")}
                </span>
                <h3 className="mt-3 text-2xl font-semibold">{t("land.preview.kb.h")}</h3>
                <p className="mt-2 text-muted-foreground">{t("land.preview.kb.p")}</p>
              </div>
            </div>

            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-300">
                  <KanbanSquare className="h-3.5 w-3.5" /> {t("land.preview.tasks.tag")}
                </span>
                <h3 className="mt-3 text-2xl font-semibold">{t("land.preview.tasks.h")}</h3>
                <p className="mt-2 text-muted-foreground">{t("land.preview.tasks.p")}</p>
              </div>
              <div className="group overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-primary/10 transition-all duration-500 ease-out hover:border-primary/30 hover:shadow-primary/20">
                <img
                  src={shotTasks.url}
                  alt={t("land.preview.tasks.tag")}
                  className="w-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                  loading="lazy"
                />
              </div>
            </div>

            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div className="group overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-primary/10 transition-all duration-500 ease-out hover:border-primary/30 hover:shadow-primary/20 lg:order-first">
                <img
                  src={shotEmail.url}
                  alt={t("land.preview.email.tag")}
                  className="w-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div className="lg:order-last">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300">
                  <Mail className="h-3.5 w-3.5" /> {t("land.preview.email.tag")}
                </span>
                <h3 className="mt-3 text-2xl font-semibold">{t("land.preview.email.h")}</h3>
                <p className="mt-2 text-muted-foreground">{t("land.preview.email.p")}</p>
                <Link
                  to="/auth"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {t("land.preview.email.cta")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/60 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">{t("land.feat.title")}</h2>
            <p className="mt-3 text-muted-foreground">{t("land.feat.sub")}</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/60 bg-gradient-to-br from-primary/15 via-violet-500/10 to-transparent py-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 text-center sm:px-6">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-bold sm:text-4xl">{t("land.cta2.h")}</h2>
          <p className="max-w-2xl text-muted-foreground">{t("land.cta2.p")}</p>
          <a
            href="#login"
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("land.cta2.btn")} <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
              U
            </div>
            <span className="font-semibold text-foreground">UNIWORK</span>
            <span>— Digital Workplace Platform</span>
          </div>
          <div>Unicom @2026</div>
        </div>
      </footer>
    </div>
  );
}
