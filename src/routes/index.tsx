import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BrandWordmark } from "@/components/brand-logo";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  Layers3,
  Loader2,
  LogIn,
  Mail,
  Menu,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Video,
  Workflow,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { assetUrl } from "@/lib/asset-url";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AiSalesChat } from "@/components/landing/ai-sales-chat";
import peopleAi from "@/assets/landing/people-ai.png.asset.json";
import meetings from "@/assets/landing/meetings.png.asset.json";
import emailHub from "@/assets/landing/email-hub.png.asset.json";
import aiWorkforceAlt from "@/assets/landing/ai-workforce-alt.png.asset.json";
import workGraph from "@/assets/landing/work-graph.png.asset.json";
import chatTasksAi from "@/assets/landing/chat-tasks-ai.png.asset.json";
import projectsTasksAi from "@/assets/landing/projects-tasks-ai.png.asset.json";

const seoDescription =
  "UNIWORK kết nối con người, công việc, cuộc họp, email và nhân sự AI trong một không gian làm việc số thống nhất.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UNIWORK — People + AI Workforce" },
      { name: "description", content: seoDescription },
      { property: "og:title", content: "UNIWORK — People + AI Workforce" },
      { property: "og:description", content: seoDescription },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://unidigiwork.lovable.app/" },
      { property: "og:image", content: assetUrl(peopleAi) },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "UNIWORK — People + AI Workforce" },
      { name: "twitter:description", content: seoDescription },
      { name: "twitter:image", content: assetUrl(peopleAi) },
    ],
    links: [{ rel: "canonical", href: "https://unidigiwork.lovable.app/" }],
  }),
  component: Landing,
});

const capabilities = [
  { icon: MessageSquare, key: "land.feat.chat.t", desc: "land.feat.chat.d" },
  { icon: Workflow, key: "land.feat.flow.t", desc: "land.feat.flow.d" },
  { icon: Video, key: "land.feat.meet.t", desc: "land.feat.meet.d" },
  { icon: Mail, key: "land.feat.email.t", desc: "land.feat.email.d" },
  { icon: BrainCircuit, key: "land.feat.kb.t", desc: "land.feat.kb.d" },
  { icon: Bot, key: "land.feat.ai.t", desc: "land.feat.ai.d" },
] as const;

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="UNIWORK">
      <BrandWordmark className="h-8 sm:h-9" />
    </Link>
  );
}

function Landing() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/tasks" });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-landing-canvas font-sans text-landing-ink">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-landing-line bg-landing-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <nav
            className="hidden items-center gap-7 text-sm font-medium text-landing-muted lg:flex"
            aria-label={t("land.nav.features")}
          >
            <a className="transition-colors hover:text-landing-blue" href="#platform">
              {t("land.nav.features")}
            </a>
            <Link className="transition-colors hover:text-landing-blue" to="/pricing">
              {t("land.nav.pricing")}
            </Link>
            <Link className="transition-colors hover:text-landing-blue" to="/about">
              {t("land.nav.about")}
            </Link>
            <Link className="transition-colors hover:text-landing-blue" to="/blog">
              Blog
            </Link>
            <Link className="transition-colors hover:text-landing-blue" to="/contact">
              {t("land.nav.contact")}
            </Link>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageToggle />
            <Button asChild variant="ghost" className="hidden text-landing-ink sm:inline-flex">
              <a href="#login">{t("land.nav.login")}</a>
            </Button>
            <Button
              asChild
              className="hidden rounded-full bg-landing-blue px-5 text-landing-on-accent hover:bg-landing-blue/90 sm:inline-flex"
            >
              <Link to="/auth">{t("land.cta.start")}</Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-landing-ink lg:hidden"
              aria-label={menuOpen ? t("land.nav.close") : t("land.nav.open")}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {menuOpen && (
          <nav
            className="border-t border-landing-line bg-landing-canvas px-4 py-4 lg:hidden"
            aria-label={t("land.nav.open")}
          >
            <div className="mx-auto grid max-w-7xl gap-1 text-sm font-medium">
              <a
                className="rounded-lg px-3 py-3 hover:bg-landing-tint"
                href="#platform"
                onClick={() => setMenuOpen(false)}
              >
                {t("land.nav.features")}
              </a>
              <Link className="rounded-lg px-3 py-3 hover:bg-landing-tint" to="/pricing">
                {t("land.nav.pricing")}
              </Link>
              <Link className="rounded-lg px-3 py-3 hover:bg-landing-tint" to="/about">
                {t("land.nav.about")}
              </Link>
              <Link className="rounded-lg px-3 py-3 hover:bg-landing-tint" to="/blog">
                Blog
              </Link>
              <Link className="rounded-lg px-3 py-3 hover:bg-landing-tint" to="/contact">
                {t("land.nav.contact")}
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section
          className="relative isolate overflow-hidden pt-18 sm:min-h-[820px]"
          aria-labelledby="landing-title"
        >
          <img
            src={assetUrl(peopleAi)}
            alt={t("land.hero.imageAlt")}
            className="absolute inset-y-0 right-0 -z-10 hidden h-full w-[74%] object-cover object-[62%_center] sm:block lg:w-[68%]"
          />
          <div className="absolute inset-0 -z-10 hidden bg-[linear-gradient(90deg,var(--landing-canvas)_0%,var(--landing-canvas)_37%,color-mix(in_oklab,var(--landing-canvas)_88%,transparent)_54%,transparent_80%)] sm:block" />
          <div className="absolute inset-x-0 bottom-0 -z-10 hidden h-40 bg-[linear-gradient(0deg,var(--landing-canvas),transparent)] sm:block" />
          <div className="mx-auto flex max-w-7xl items-center px-4 pb-10 pt-12 sm:min-h-[748px] sm:px-6 sm:py-16">
            <div className="max-w-2xl sm:pt-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-landing-blue/20 bg-landing-canvas/80 px-3 py-1.5 text-xs font-semibold text-landing-blue backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" /> {t("land.hero.eyebrow")}
              </span>
              <h1
                id="landing-title"
                className="mt-5 font-heading text-5xl font-bold leading-[1.05] sm:mt-6 sm:text-6xl lg:text-7xl"
              >
                {t("land.hero.titleA")} <span className="text-landing-blue">+</span>
                <br />
                <span className="text-landing-magenta">{t("land.hero.titleB")}</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-landing-muted sm:mt-6 sm:text-xl">
                {t("land.hero.sub")}
              </p>
              <div className="mt-7 grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 sm:mt-8 sm:flex sm:flex-wrap">
                <Button
                  asChild
                  size="lg"
                  className="h-12 w-full rounded-lg bg-landing-dark px-5 text-landing-on-dark hover:bg-landing-dark/90 sm:w-auto sm:px-6"
                >
                  <Link to="/auth">
                    {t("land.cta.start")} <ArrowRight />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 w-full rounded-lg border-landing-line bg-landing-canvas px-5 text-landing-ink hover:bg-landing-tint sm:w-auto sm:bg-landing-canvas/80 sm:px-6 sm:backdrop-blur"
                >
                  <Link to="/meeting">
                    <Video /> {t("land.cta.demo")}
                  </Link>
                </Button>
              </div>
              <div className="mt-7 grid grid-cols-1 gap-2 text-sm text-landing-muted min-[390px]:grid-cols-2 sm:mt-8 sm:flex sm:flex-wrap sm:gap-x-6">
                {(["land.bullet.security", "land.bullet.vi", "land.bullet.deploy"] as const).map(
                  (key) => (
                    <span key={key} className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-landing-blue" /> {t(key)}
                    </span>
                  ),
                )}
              </div>
            </div>
          </div>
          <figure className="relative h-[410px] overflow-hidden border-t border-landing-line sm:hidden">
            <img
              src={assetUrl(peopleAi)}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover object-[64%_center]"
            />
            <div className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,var(--landing-canvas),transparent)]" />
          </figure>
        </section>

        <section
          id="platform"
          className="border-y border-landing-line bg-landing-soft py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold text-landing-blue">
                {t("land.platform.eyebrow")}
              </p>
              <h2 className="mt-3 font-heading text-4xl font-bold sm:text-5xl">
                {t("land.feat.title")}
              </h2>
              <p className="mt-4 text-lg text-landing-muted">{t("land.feat.sub")}</p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-landing-line bg-landing-line sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((item) => (
                <div key={item.key} className="group bg-landing-canvas p-6 sm:p-8">
                  <item.icon className="h-6 w-6 text-landing-blue transition-transform duration-200 group-hover:translate-x-1" />
                  <h3 className="mt-8 font-heading text-xl font-bold">{t(item.key)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-landing-muted">{t(item.desc)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <ProductBand
          dark
          eyebrow={t("land.preview.meet.tag")}
          title={t("land.meeting.title")}
          description={t("land.preview.meet.p")}
          image={meetings}
          alt={t("land.preview.meet.h")}
          points={[t("land.meeting.point1"), t("land.meeting.point2"), t("land.meeting.point3")]}
        />

        <ProductBand
          reverse
          eyebrow={t("land.projects.eyebrow")}
          title={t("land.projects.title")}
          description={t("land.preview.tasks.p")}
          image={projectsTasksAi}
          alt={t("land.projects.imageAlt")}
          companion={chatTasksAi}
          companionAlt={t("land.chat.imageAlt")}
          action={{ label: t("land.projects.cta"), to: "/auth" }}
        />

        <ProductBand
          eyebrow={t("land.preview.email.tag")}
          title={t("land.email.title")}
          description={t("land.preview.email.p")}
          image={emailHub}
          alt={t("land.preview.email.h")}
          action={{ label: t("land.preview.email.cta"), to: "/auth" }}
        />

        <section className="border-y border-landing-line bg-landing-dark py-20 text-landing-on-dark sm:py-28">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <div>
              <p className="text-sm font-semibold text-landing-blue">{t("land.memory.eyebrow")}</p>
              <h2 className="mt-3 font-heading text-4xl font-bold sm:text-5xl">
                {t("land.memory.title")}
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-landing-on-dark/65">
                {t("land.memory.sub")}
              </p>
              <div className="mt-8 space-y-4">
                {(["land.memory.point1", "land.memory.point2", "land.memory.point3"] as const).map(
                  (key) => (
                    <div
                      key={key}
                      className="flex items-start gap-3 text-sm text-landing-on-dark/80"
                    >
                      <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-landing-magenta" /> {t(key)}
                    </div>
                  ),
                )}
              </div>
            </div>
            <figure className="overflow-hidden rounded-lg border border-landing-on-dark/10 bg-landing-on-dark shadow-2xl shadow-landing-blue/10">
              <img
                src={assetUrl(workGraph)}
                alt={t("land.memory.imageAlt")}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </figure>
          </div>
        </section>

        <section className="py-20 sm:py-28" aria-labelledby="ai-workforce-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold text-landing-magenta">{t("land.hire.badge")}</p>
              <h2
                id="ai-workforce-title"
                className="mt-3 font-heading text-4xl font-bold sm:text-5xl"
              >
                {t("land.hire.title")}
              </h2>
              <p className="mt-4 text-lg text-landing-muted">{t("land.hire.sub")}</p>
            </div>
            <figure className="group mx-auto mt-14 max-w-5xl overflow-hidden rounded-lg border border-landing-line bg-landing-soft shadow-sm">
              <img
                src={assetUrl(aiWorkforceAlt)}
                alt={t("land.workforce.imageAlt")}
                className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.01]"
                loading="lazy"
              />
            </figure>

            <div className="mt-10 flex justify-center">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-lg bg-landing-blue px-7 text-landing-on-accent hover:bg-landing-blue/90"
              >
                <Link to="/pricing">
                  {t("land.hire.cta")} <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="login" className="border-t border-landing-line bg-landing-soft py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20">
            <div>
              <ShieldCheck className="h-9 w-9 text-landing-blue" />
              <h2 className="mt-5 font-heading text-4xl font-bold sm:text-5xl">
                {t("land.cta2.h")}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-landing-muted">{t("land.cta2.p")}</p>
            </div>
            <LoginPanel />
          </div>
        </section>
      </main>

      <footer className="border-t border-landing-line bg-landing-canvas py-12">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
          <div>
            <Brand />
            <p className="mt-4 max-w-sm text-sm text-landing-muted">{t("land.footer.sub")}</p>
          </div>
          <div>
            <div className="text-sm font-semibold">{t("land.footer.product")}</div>
            <div className="mt-3 grid gap-2 text-sm text-landing-muted">
              <Link to="/pricing">{t("land.nav.pricing")}</Link>
              <Link to="/meeting">{t("land.nav.demo")}</Link>
              <Link to="/workflows">Workflow</Link>
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold">{t("land.footer.company")}</div>
            <div className="mt-3 grid gap-2 text-sm text-landing-muted">
              <Link to="/about">{t("land.nav.about")}</Link>
              <Link to="/blog">Blog</Link>
              <Link to="/contact">{t("land.nav.contact")}</Link>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-3 border-t border-landing-line px-4 pt-6 text-xs text-landing-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© 2026 Unicom JSC</span>
          <span className="flex gap-4">
            <Link to="/privacy">{t("land.footer.privacy")}</Link>
            <Link to="/terms">{t("land.footer.terms")}</Link>
          </span>
        </div>
      </footer>
      <AiSalesChat />
    </div>

  );
}

function ProductBand({
  dark = false,
  reverse = false,
  eyebrow,
  title,
  description,
  image,
  alt,
  companion,
  companionAlt,
  points,
  action,
}: {
  dark?: boolean;
  reverse?: boolean;
  eyebrow: string;
  title: string;
  description: string;
  image: { url: string };
  alt: string;
  companion?: { url: string };
  companionAlt?: string;
  points?: string[];
  action?: { label: string; to: "/auth" };
}) {
  return (
    <section
      className={
        dark
          ? "bg-landing-dark py-20 text-landing-on-dark sm:py-28"
          : "bg-landing-canvas py-20 sm:py-28"
      }
    >
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20">
        <div className={reverse ? "lg:order-2" : ""}>
          <p
            className={
              dark
                ? "text-sm font-semibold text-landing-blue"
                : "text-sm font-semibold text-landing-magenta"
            }
          >
            {eyebrow}
          </p>
          <h2 className="mt-3 font-heading text-4xl font-bold sm:text-5xl">{title}</h2>
          <p
            className={
              dark
                ? "mt-5 text-lg leading-relaxed text-landing-on-dark/65"
                : "mt-5 text-lg leading-relaxed text-landing-muted"
            }
          >
            {description}
          </p>
          {points && (
            <ul className="mt-7 space-y-3">
              {points.map((point) => (
                <li key={point} className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-landing-blue/15 text-landing-blue">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          )}
          {action && (
            <Button
              asChild
              variant="ghost"
              className="mt-7 px-0 text-landing-blue hover:bg-transparent hover:text-landing-blue/80"
            >
              <Link to={action.to}>
                {action.label}
                <ChevronRight />
              </Link>
            </Button>
          )}
        </div>
        <div className={reverse ? "relative lg:order-1" : "relative"}>
          <figure className="overflow-hidden rounded-lg border border-landing-line bg-landing-canvas shadow-xl shadow-landing-dark/5">
            <img
              src={assetUrl(image)}
              alt={alt}
              className="aspect-square w-full object-cover"
              loading="lazy"
            />
          </figure>
          {companion && (
            <figure className="absolute -bottom-6 -right-2 hidden w-[42%] overflow-hidden rounded-lg border-4 border-landing-canvas bg-landing-canvas shadow-xl sm:block">
              <img
                src={assetUrl(companion)}
                alt={companionAlt ?? ""}
                className="aspect-[4/5] w-full object-cover"
                loading="lazy"
              />
            </figure>
          )}
        </div>
      </div>
    </section>
  );
}

function LoginPanel() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupMode, setSignupMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password)
      return toast.error(`${t("land.email")} / ${t("land.password")}`);
    setLoading(true);
    try {
      if (signupMode) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: fullName.trim() || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success(t("ac.9"));
        if (!data.session) {
          setSignupMode(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        toast.success(t("land.signin"));
      }
      navigate({ to: "/tasks" });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("ac.10"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-landing-line bg-landing-canvas p-6 shadow-xl shadow-landing-dark/5 sm:p-8"
    >
      <h3 className="font-heading text-2xl font-bold">
        {signupMode ? t("ac.8") : t("land.login.title")}
      </h3>
      <p className="mt-1 text-sm text-landing-muted">{t("land.login.sub")}</p>
      <div className="mt-6 space-y-4">
        {signupMode && (
          <label className="block text-sm font-medium">
            {t("ac.3")}
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-landing-line bg-landing-canvas px-3 outline-none focus:ring-2 focus:ring-landing-blue/30"
            />
          </label>
        )}
        <label className="block text-sm font-medium">
          {t("land.email")}
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className="mt-2 h-11 w-full rounded-lg border border-landing-line bg-landing-canvas px-3 outline-none focus:ring-2 focus:ring-landing-blue/30"
          />
        </label>
        <label className="block text-sm font-medium">
          {t("land.password")}
          <input
            type="password"
            autoComplete={signupMode ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="mt-2 h-11 w-full rounded-lg border border-landing-line bg-landing-canvas px-3 outline-none focus:ring-2 focus:ring-landing-blue/30"
          />
        </label>
      </div>
      <Button
        type="submit"
        disabled={loading}
        className="mt-6 h-11 w-full rounded-lg bg-landing-blue text-landing-on-accent hover:bg-landing-blue/90"
      >
        {loading ? <Loader2 className="animate-spin" /> : <LogIn />}
        {signupMode ? t("ac.8") : t("land.signin")}
      </Button>
      <Button
        type="button"
        variant="link"
        className="mt-2 w-full text-landing-blue"
        onClick={() => setSignupMode((value) => !value)}
      >
        {signupMode ? t("ac.16") : t("land.create.account")}
      </Button>
    </form>
  );
}
