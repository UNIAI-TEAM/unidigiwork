import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Calculator,
  Check,
  FileSignature,
  FileText,
  LayoutGrid,
  Receipt,
  Scale,
  Server,
  Sparkles,
} from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConsultationForm } from "@/components/marketing/consultation-form";
import { listPublishedCms } from "@/lib/api/cms.functions";
import { useI18n } from "@/lib/i18n";
import { mk } from "@/lib/i18n-locales/marketing";
import kol from "@/assets/uniwork-kol.png.asset.json";

const cmsQuery = (kind: "service" | "pricing" | "article") =>
  queryOptions({
    queryKey: ["cms-public", kind],
    queryFn: () => listPublishedCms({ data: { kind, limit: 12 } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/uniwork")({
  head: () => ({
    meta: [
      { title: "UniWork — Hệ điều hành doanh nghiệp một nền tảng" },
      {
        name: "description",
        content:
          "UniWork gom công việc, dịch vụ thành lập doanh nghiệp, pháp lý, kế toán, chữ ký số, hoá đơn điện tử và uniOffice vào một tài khoản.",
      },
      { property: "og:title", content: "UniWork — Start. Run. Grow. With ONE Business OS" },
      {
        property: "og:description",
        content: "Một tài khoản, một hoá đơn, một đầu mối hỗ trợ cho doanh nghiệp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(cmsQuery("service")),
      context.queryClient.ensureQueryData(cmsQuery("pricing")),
      context.queryClient.ensureQueryData(cmsQuery("article")),
    ]);
  },
  errorComponent: () => (
    <div className="p-10 text-center text-sm text-muted-foreground">Không tải được trang.</div>
  ),
  notFoundComponent: () => <div className="p-10 text-center">404</div>,
  component: UniworkHome,
});

const serviceIcon: Record<string, typeof Building2> = {
  building: Building2,
  scale: Scale,
  calculator: Calculator,
  signature: FileSignature,
  receipt: Receipt,
};
const pillarIcons = [Building2, Server, LayoutGrid, FileText];

function UniworkHome() {
  const { lang } = useI18n();
  const c = mk(lang);
  const { data: services } = useSuspenseQuery(cmsQuery("service"));
  const { data: pricing } = useSuspenseQuery(cmsQuery("pricing"));
  const { data: articles } = useSuspenseQuery(cmsQuery("article"));

  return (
    <PublicShell>
      <main className="brand-uniwork-blue">
        {/* Hero */}
        <section className="bg-gradient-to-b from-primary/5 to-background">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:py-20 lg:grid-cols-2">
            <div>
              <p className="text-xs font-medium tracking-widest text-primary">{c.eyebrow}</p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-6xl">
                {c.heroA}
                <br />
                <span className="text-primary">{c.heroB}</span>
              </h1>
              <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
                {c.heroSub}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild className="h-11 gap-2 px-5">
                  <Link to="/auth">
                    {c.start} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 px-5">
                  <a href="#tu-van">{c.consult}</a>
                </Button>
              </div>
              <dl className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {c.stats.map(([n, l]) => (
                  <div key={l}>
                    <dt className="text-2xl font-bold text-primary">{n}</dt>
                    <dd className="text-xs text-muted-foreground">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <img
              src={kol.url}
              alt="Đội ngũ đại diện UniWork cùng linh vật W"
              className="w-full rounded-3xl"
              width={560}
              height={420}
            />
          </div>
        </section>

        {/* Pillars */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{c.pillarsTitle}</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {c.pillars.map(([t, d], i) => {
              const Icon = pillarIcons[i]!;
              return (
                <div key={t} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{d}</p>
                  {i === 3 && (
                    <Link
                      to="/unioffice"
                      className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"
                    >
                      uniOffice <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Services from CMS */}
        <section className="bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{c.servicesTitle}</h2>
            <p className="mt-2 text-muted-foreground">{c.servicesSub}</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => {
                const Icon = serviceIcon[s.data.icon as string] ?? Sparkles;
                const steps = (s.data.steps as string[] | undefined) ?? [];
                return (
                  <article
                    key={s.id}
                    className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{s.summary}</p>
                    {steps.length > 0 && (
                      <ol className="mt-4 space-y-1 text-sm">
                        {steps.map((st, i) => (
                          <li key={st} className="flex gap-2">
                            <span className="font-semibold text-primary">{i + 1}.</span> {st}
                          </li>
                        ))}
                      </ol>
                    )}
                    {s.body && (
                      <p className="mt-4 rounded-xl bg-primary/5 p-3 text-xs">
                        <span className="font-semibold text-primary">{c.connect}: </span>
                        {s.body}
                      </p>
                    )}
                    <Button asChild variant="outline" className="mt-5 h-11 justify-between">
                      <Link to="/dich-vu/$slug" params={{ slug: s.slug }}>
                        {c.servicePages.viewDetail} <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{c.stepsTitle}</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {c.steps.map((st, i) => (
              <li key={st} className="rounded-2xl border border-border p-6">
                <span className="text-3xl font-bold text-primary">{i + 1}</span>
                <p className="mt-2 font-medium">{st}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing from CMS */}
        {pricing.length > 0 && (
          <section className="bg-muted/30">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                {c.pricingTitle}
              </h2>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                {pricing.map((p) => {
                  const featured = !!p.data.featured;
                  return (
                    <div
                      key={p.id}
                      className={`flex flex-col rounded-2xl border bg-card p-6 shadow-sm ${featured ? "border-primary" : "border-border"}`}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">{p.title}</h3>
                        {featured && <Badge>{c.popular}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{p.summary}</p>
                      <p className="mt-4 text-2xl font-bold">{String(p.data.price ?? "")}</p>
                      <ul className="mt-4 flex-1 space-y-2 text-sm">
                        {((p.data.features as string[] | undefined) ?? []).map((f) => (
                          <li key={f} className="flex gap-2">
                            <Check className="h-4 w-4 shrink-0 text-primary" /> {f}
                          </li>
                        ))}
                      </ul>
                      <Button
                        asChild
                        variant={featured ? "default" : "outline"}
                        className="mt-6 h-11"
                      >
                        <a href="#tu-van">{c.choose}</a>
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Resources */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{c.resourcesTitle}</h2>
          {articles.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{c.resourcesEmpty}</p>
          ) : (
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {articles.map((a) => (
                <article key={a.id} className="rounded-2xl border border-border p-6">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {String(a.data.category ?? "")}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">{a.title}</h3>
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{a.summary}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* One account + form */}
        <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{c.oneTitle}</h2>
            <ul className="mt-6 space-y-3">
              {c.one.map((o) => (
                <li key={o} className="flex gap-2">
                  <Check className="h-5 w-5 text-primary" /> {o}
                </li>
              ))}
            </ul>
          </div>
          <ConsultationForm services={services} />
        </section>
      </main>
    </PublicShell>
  );
}
