import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Calculator,
  Check,
  FileSignature,
  Receipt,
  Scale,
  Sparkles,
} from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/marketing/markdown";
import { ConsultationForm } from "@/components/marketing/consultation-form";
import { listPublishedCms } from "@/lib/api/cms.functions";
import { useI18n } from "@/lib/i18n";
import { mk } from "@/lib/i18n-locales/marketing";

const servicesQuery = queryOptions({
  queryKey: ["cms-public", "service"],
  queryFn: () => listPublishedCms({ data: { kind: "service", limit: 50 } }),
  staleTime: 60_000,
});

export const Route = createFileRoute("/dich-vu/$slug")({
  loader: async ({ context, params }) => {
    const services = await context.queryClient.ensureQueryData(servicesQuery);
    const service = services.find((item) => item.slug === params.slug);
    if (!service) throw notFound();
    return { service };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Không tìm thấy dịch vụ — UniWork" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const sv = loaderData.service;
    const description = sv.seoDescription || sv.summary || sv.title;
    return {
      meta: [
        { title: sv.seoTitle || `${sv.title} — Dịch vụ UniWork` },
        { name: "description", content: description },
        { property: "og:title", content: `${loaderData.service.title} — UniWork` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: ServiceNotFound,
  component: ServiceDetailPage,
});

const serviceIcons = {
  building: Building2,
  scale: Scale,
  calculator: Calculator,
  signature: FileSignature,
  receipt: Receipt,
} as const;

function ServiceDetailPage() {
  const { service } = Route.useLoaderData();
  const { data: services } = useSuspenseQuery(servicesQuery);
  const { lang } = useI18n();
  const c = mk(lang);
  const steps = (service.data.steps as string[] | undefined) ?? [];
  const iconKey = String(service.data.icon ?? "");
  const Icon = serviceIcons[iconKey as keyof typeof serviceIcons] ?? Sparkles;

  return (
    <PublicShell active="services">
      <main className="brand-uniwork-blue">
        <section className="border-b border-border bg-primary/5">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
            <Link
              to="/dich-vu"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
            >
              <ArrowLeft className="h-4 w-4" /> {c.servicePages.allServices}
            </Link>
            <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div>
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h1 className="mt-5 text-4xl font-bold md:text-5xl">{service.title}</h1>
                <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                  {service.summary}
                </p>
                <Button asChild className="mt-8 h-11 gap-2 px-5">
                  <a href="#tu-van">
                    {c.servicePages.requestAdvice} <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              <div className="border-l-2 border-primary pl-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  {c.servicePages.uniworkConnection}
                </p>
                <Markdown
                  source={service.body ?? ""}
                  className="mt-3 text-sm text-muted-foreground"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <h2 className="text-2xl font-semibold">{c.servicePages.process}</h2>
            <ol className="mt-8 divide-y divide-border border-y border-border">
              {steps.map((step, index) => (
                <li key={step} className="grid grid-cols-[48px_minmax(0,1fr)] gap-4 py-5">
                  <span className="text-2xl font-semibold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-semibold">{step}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {c.servicePages.processDetail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <aside>
            <h2 className="text-lg font-semibold">{c.servicePages.youReceive}</h2>
            <ul className="mt-4 space-y-4 text-sm">
              {c.servicePages.benefits.map((benefit) => (
                <li key={benefit} className="flex gap-3">
                  <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
            <h2 className="text-2xl font-semibold">{c.servicePages.otherServices}</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {services
                .filter((item) => item.id !== service.id)
                .map((item) => (
                  <Link
                    key={item.id}
                    to="/dich-vu/$slug"
                    params={{ slug: item.slug }}
                    className="flex min-h-14 items-center justify-between rounded-lg border border-border bg-card px-4 py-3 font-medium transition-colors hover:border-primary"
                  >
                    {item.title} <ArrowRight className="h-4 w-4 text-primary" />
                  </Link>
                ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <ConsultationForm services={services} defaultService={service.title} />
        </section>
      </main>
    </PublicShell>
  );
}

function ServiceNotFound() {
  return (
    <PublicShell active="services">
      <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-3xl font-semibold">Không tìm thấy dịch vụ</h1>
        <p className="mt-3 text-muted-foreground">Dịch vụ này chưa được xuất bản hoặc không còn tồn tại.</p>
        <Button asChild className="mt-6 h-11">
          <Link to="/dich-vu">Xem tất cả dịch vụ</Link>
        </Button>
      </main>
    </PublicShell>
  );
}