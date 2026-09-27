import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/marketing/markdown";
import { listPublishedCms } from "@/lib/api/cms.functions";
import { useI18n } from "@/lib/i18n";
import { mk } from "@/lib/i18n-locales/marketing";

const articlesQuery = queryOptions({
  queryKey: ["cms-public", "article"],
  queryFn: () => listPublishedCms({ data: { kind: "article", limit: 50 } }),
  staleTime: 60_000,
});

export const Route = createFileRoute("/tai-nguyen/$slug")({
  loader: async ({ context, params }) => {
    const articles = await context.queryClient.ensureQueryData(articlesQuery);
    const article = articles.find((item) => item.slug === params.slug);
    if (!article) throw notFound();
    return { article };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Không tìm thấy bài viết — UniWork" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const a = loaderData.article;
    const description = a.seoDescription || a.summary || a.title;
    const imageMeta = a.coverUrl
      ? [
          { property: "og:image", content: a.coverUrl },
          { name: "twitter:image", content: a.coverUrl },
        ]
      : [];
    return {
      meta: [
        { title: a.seoTitle || `${a.title} — Tài nguyên UniWork` },
        { name: "description", content: description },
        { property: "og:title", content: `${loaderData.article.title} — UniWork` },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
        ...imageMeta,
      ],
    };
  },
  notFoundComponent: ArticleNotFound,
  component: ArticleDetailPage,
});

function ArticleDetailPage() {
  const { article } = Route.useLoaderData();
  const { data: articles } = useSuspenseQuery(articlesQuery);
  const { lang } = useI18n();
  const c = mk(lang);
  const others = articles.filter((item) => item.id !== article.id).slice(0, 4);

  return (
    <PublicShell active="resources">
      <main className="brand-uniwork-blue">
        <section className="border-b border-border bg-primary/5">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16">
            <Link
              to="/tai-nguyen"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
            >
              <ArrowLeft className="h-4 w-4" /> {c.resourcePages.allArticles}
            </Link>
            <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <BookOpen className="h-3 w-3" aria-hidden="true" />
              {String(article.data.category ?? "")}
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight md:text-4xl">{article.title}</h1>
            {article.summary && (
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                {article.summary}
              </p>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          {article.coverUrl && (
            <img
              src={article.coverUrl}
              alt={article.title}
              className="mb-8 aspect-video w-full rounded-2xl object-cover"
            />
          )}
          <Markdown source={article.body || article.summary || ""} className="text-foreground/90" />
          <Button asChild className="mt-10 h-11 gap-2 px-5">
            <Link to="/uniwork">
              {c.resourcePages.exploreUniwork} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>

        {others.length > 0 && (
          <section className="border-t border-border bg-muted/30">
            <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
              <h2 className="text-2xl font-semibold">{c.resourcePages.otherArticles}</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {others.map((item) => (
                  <Link
                    key={item.id}
                    to="/tai-nguyen/$slug"
                    params={{ slug: item.slug }}
                    className="flex min-h-14 items-center justify-between rounded-lg border border-border bg-card px-4 py-3 font-medium transition-colors hover:border-primary"
                  >
                    {item.title} <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </PublicShell>
  );
}

function ArticleNotFound() {
  return (
    <PublicShell active="resources">
      <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-3xl font-semibold">Không tìm thấy bài viết</h1>
        <p className="mt-3 text-muted-foreground">
          Bài viết này chưa được xuất bản hoặc không còn tồn tại.
        </p>
        <Button asChild className="mt-6 h-11">
          <Link to="/tai-nguyen">Xem tất cả bài viết</Link>
        </Button>
      </main>
    </PublicShell>
  );
}
