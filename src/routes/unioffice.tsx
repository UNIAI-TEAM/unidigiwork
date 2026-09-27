import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, FileSpreadsheet, FileText, FileType2, Presentation } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { ConsultationForm } from "@/components/marketing/consultation-form";
import { listPublishedCms } from "@/lib/api/cms.functions";
import { useI18n } from "@/lib/i18n";
import { mk } from "@/lib/i18n-locales/marketing";
import card from "@/assets/unioffice-card.png.asset.json";

const servicesQuery = queryOptions({
  queryKey: ["cms-public", "service"],
  queryFn: () => listPublishedCms({ data: { kind: "service", limit: 12 } }),
  staleTime: 60_000,
});

export const Route = createFileRoute("/unioffice")({
  head: () => ({
    meta: [
      { title: "uniOffice — Word, Excel, PowerPoint, PDF có AI" },
      {
        name: "description",
        content: "uniOffice thay thế MS Office: soạn thảo, bảng tính, trình chiếu, PDF có AI, mở đúng định dạng Office, lưu trong UniWork.",
      },
      { property: "og:title", content: "uniOffice — bộ văn phòng có AI của UniWork" },
      { property: "og:description", content: "So sánh với MS Office và hướng dẫn chuyển đổi từng bước." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(servicesQuery),
  errorComponent: () => <div className="p-10 text-center text-sm text-muted-foreground">Không tải được trang.</div>,
  notFoundComponent: () => <div className="p-10 text-center">404</div>,
  component: UniOfficePage,
});

const appIcons = [FileText, FileSpreadsheet, Presentation, FileType2];

function UniOfficePage() {
  const { lang } = useI18n();
  const c = mk(lang);
  const { data: services } = useSuspenseQuery(servicesQuery);
  return (
    <PublicShell>
      <main>
        <section className="bg-gradient-to-b from-primary/5 to-background">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:py-20 lg:grid-cols-2">
            <div>
              <p className="text-xs font-medium tracking-widest text-primary">{c.oEyebrow}</p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">{c.oTitle}</h1>
              <p className="mt-5 max-w-xl text-muted-foreground md:text-lg">{c.oSub}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild className="h-11 gap-2 px-5">
                  <Link to="/auth">
                    {c.oCta} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 px-5">
                  <a href="#tu-van">{c.consult}</a>
                </Button>
              </div>
            </div>
            <img src={card.url} alt="uniOffice: Word, Excel, PowerPoint, PDF" className="w-full rounded-3xl shadow-md" width={690} height={400} />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {c.oApps.map(([t, d], i) => {
              const Icon = appIcons[i]!;
              return (
                <div key={t} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h2 className="mt-4 text-lg font-semibold">{t}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{d}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{c.compareTitle}</h2>
            <div className="mt-8 overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    {c.compareCols.map((h) => (
                      <th key={h} className="px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.compare.map(([a, b, d]) => (
                    <tr key={a} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{a}</td>
                      <td className="px-4 py-3 font-medium text-primary">{b}</td>
                      <td className="px-4 py-3 text-muted-foreground">{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{c.migrateTitle}</h2>
          <ol className="mt-8 space-y-4">
            {c.migrate.map(([t, d], i) => (
              <li key={t} className="flex gap-4 rounded-2xl border border-border p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground font-semibold">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{t}</h3>
                  <p className="text-sm text-muted-foreground">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
          <ConsultationForm services={services} defaultService="uniOffice" />
        </section>
      </main>
    </PublicShell>
  );
}
