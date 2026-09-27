import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Calculator,
  FileSignature,
  Receipt,
  Scale,
  Sparkles,
} from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { ConsultationForm } from "@/components/marketing/consultation-form";
import { listPublishedCms } from "@/lib/api/cms.functions";
import { useI18n } from "@/lib/i18n";
import { mk } from "@/lib/i18n-locales/marketing";
import kol from "@/assets/uniwork-kol.png.asset.json";

const servicesQuery = queryOptions({
  queryKey: ["cms-public", "service"],
  queryFn: () => listPublishedCms({ data: { kind: "service", limit: 50 } }),
  staleTime: 60_000,
});

export const Route = createFileRoute("/dich-vu")({
  head: () => ({
    meta: [
      { title: "Dịch vụ doanh nghiệp — UniWork" },
      {
        name: "description",
        content:
          "Dịch vụ thành lập doanh nghiệp, tư vấn pháp lý, kế toán – thuế, chữ ký số và hoá đơn điện tử kết nối trực tiếp với UniWork.",
      },
      { property: "og:title", content: "Dịch vụ doanh nghiệp — UniWork" },
      {
        property: "og:description",
        content: "Từ hồ sơ pháp lý đến vận hành hằng ngày trên một nền tảng.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(servicesQuery),
  errorComponent: () => (
    <div className="p-10 text-center text-sm text-muted-foreground">Không tải được dịch vụ.</div>
  ),
  component: ServicesPage,
});

const serviceIcons = {
  building: Building2,
  scale: Scale,
  calculator: Calculator,
  signature: FileSignature,
  receipt: Receipt,
} as const;

function ServicesPage() {
  const { lang } = useI18n();
  const c = mk(lang);
  const { data: services } = useSuspenseQuery(servicesQuery);

  return (
    <PublicShell active="services">
      <main className="brand-uniwork-blue">
        <section className="border-b border-border bg-primary/5">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-primary">
                {c.servicePages.eyebrow}
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-bold md:text-5xl">
                {c.servicePages.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                {c.servicePages.intro}
              </p>
              <Button asChild className="mt-8 h-11 gap-2 px-5">
                <a href="#tu-van">
                  {c.consult} <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <img
              src={kol.url}
              alt="Đội ngũ đại diện UniWork cùng linh vật W"
              className="w-full rounded-2xl"
              width={420}
              height={315}
            />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => {
              const iconKey = String(service.data.icon ?? "");
              const Icon = serviceIcons[iconKey as keyof typeof serviceIcons] ?? Sparkles;
              const steps = (service.data.steps as string[] | undefined) ?? [];
              return (
                <article
                  key={service.id}
                  className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="mt-5 text-xl font-semibold">{service.title}</h2>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{service.summary}</p>
                  {steps.length > 0 && (
                    <ul className="mt-5 flex-1 space-y-2 text-sm">
                      {steps.map((step) => (
                        <li key={step} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button asChild variant="outline" className="mt-6 h-11 justify-between">
                    <Link to="/dich-vu/$slug" params={{ slug: service.slug }}>
                      {c.servicePages.viewDetail} <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
          <ConsultationForm services={services} />
        </section>
      </main>
    </PublicShell>
  );
}