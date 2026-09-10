import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, LogIn } from "lucide-react";
import welcomeIllustration from "@/assets/mobile-welcome.png";
import { BrandWordmark } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import { ThemeToggle } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";

const description =
  "Bắt đầu với không gian làm việc số kết nối con người, công việc và đồng đội AI trên UNIWORK.";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Chào mừng · UNIWORK" },
      { name: "description", content: description },
      { property: "og:title", content: "Chào mừng · UNIWORK" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) navigate({ to: "/m/home", replace: true });
      else setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-background px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-foreground">
      <header className="flex items-center justify-between">
        <BrandWordmark className="h-8" />
        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-5 text-center">
        <div className="relative mx-auto w-full max-w-[21rem] overflow-hidden rounded-3xl border border-border bg-surface shadow-xl">
          <img
            src={welcomeIllustration}
            alt={t("land.hero.imageAlt")}
            width={1024}
            height={1024}
            className="aspect-square w-full object-cover dark:brightness-90"
            loading="eager"
            decoding="async"
          />
        </div>

        <p className="mt-6 text-xs font-semibold uppercase text-primary">
          {t("land.hero.eyebrow")}
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold leading-tight">
          {t("land.hero.titleA")} + {t("land.hero.titleB")}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("land.hero.sub")}
        </p>
      </section>

      <div className="mx-auto grid w-full max-w-md gap-3">
        <Button
          size="lg"
          className="min-h-12 w-full rounded-xl"
          disabled={checking}
          onClick={() => navigate({ to: "/auth" })}
        >
          {t("land.cta.start")}
          <ArrowRight />
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="min-h-12 w-full rounded-xl bg-surface"
          disabled={checking}
          onClick={() => navigate({ to: "/auth" })}
        >
          <LogIn />
          {t("land.signin")}
        </Button>
      </div>
    </main>
  );
}
