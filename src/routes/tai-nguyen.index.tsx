import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { listPublishedCms } from "@/lib/api/cms.functions";
import { useI18n } from "@/lib/i18n";
import { mk } from "@/lib/i18n-locales/marketing";

const articlesQuery = queryOptions({
  queryKey: ["cms-public", "article"],
  queryFn: () => listPublishedCms({ data: { kind: "article", limit: 50 } }),
  staleTime: 60_000,
});

export const Route = createFileRoute("/tai-nguyen/")({
  head: () => ({
    meta: [
      { title: "Tài nguyên — UniWork" },
      {
        name: "description",
        content:
          "Bài viết, hướng dẫn và kinh nghiệm vận hành doanh nghiệp với UniWork: quản trị công việc, dịch vụ doanh nghiệp và chuyển đổi số.",
      },
      { property: "og:title", content: "Tài nguyên — UniWork" },
      {
        property: "og:description",
        content: "Bài viết và hướng dẫn vận hành doanh nghiệp với UniWork.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(articlesQuery),
  errorComponent: () => (
    <div className="p-10 text-center text-sm text-muted-foreground">Không tải được bài viết.</div>
  ),
  component: ResourcesPage,
});

function ResourcesPage() {
  const { lang } = useI18n();
  const c = mk(lang);
  const { data: articles } = useSuspenseQuery(articlesQuery);

  return (
    <PublicShell active="resources">
      <main className="brand-uniwork-blue">
        <section className="border-b border-border bg-primary/5">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">
              {c.resourcePages.eyebrow}
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold md:text-5xl">
              {c.resourcePages.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              {c.resourcePages.intro}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
          {articles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{c.resourcesEmpty}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {articles.map((a) => (
                <article
                  key={a.id}
                  className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm"
                >
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <BookOpen className="h-3 w-3" aria-hidden="true" />
                    {String(a.data.category ?? "")}
                  </span>
                  <h2 className="mt-4 text-lg font-semibold">{a.title}</h2>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {a.summary}
                  </p>
                  <Link
                    to="/tai-nguyen/$slug"
                    params={{ slug: a.slug }}
                    className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
                  >
                    {c.resourcePages.readMore} <ArrowRight className="h-4 w-4" />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
