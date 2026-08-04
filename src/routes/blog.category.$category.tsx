import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { avatar } from "@/components/app-shell";
import { posts, featured, categorySlug } from "./blog";
import { decodeCategory } from "@/lib/blog-categories";

const allPosts = [featured, ...posts];

export const Route = createFileRoute("/blog/category/$category")({
  head: ({ params }) => {
    const catLabel = decodeCategory(params.category);
    return {
      meta: [
        { title: `${catLabel} — Blog UNIWORK` },
        { name: "description", content: `Bài viết thuộc chủ đề ${catLabel} trên blog UNIWORK.` },
        { property: "og:title", content: `${catLabel} — Blog UNIWORK` },
        { property: "og:description", content: `Bài viết thuộc chủ đề ${catLabel} trên blog UNIWORK.` },
      ],
      links: [{ rel: "canonical", href: `https://unidigiwork.lovable.app/blog/category/${params.category}` }],
    };
  },
  component: BlogCategoryPage,
});

function BlogCategoryPage() {
  const { category } = Route.useParams();
  const catLabel = decodeCategory(category);
  const filtered = allPosts.filter((p) => categorySlug(p.cat) === category);

  return (
    <PublicShell active="blog">
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
          <Link
            to="/blog"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
          </Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Chủ đề: {catLabel}
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            {filtered.length} bài viết trong chủ đề này.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 pb-20 sm:px-6">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface py-20 text-center text-muted-foreground">
            Chưa có bài viết nào trong danh mục này
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <Link
                key={p.slug}
                to="/blog/$slug"
                params={{ slug: p.slug }}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="aspect-[16/10] bg-gradient-to-br from-primary/30 via-violet-500/20 to-sky-500/10" />
                <div className="flex flex-1 flex-col p-5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    {p.cat}
                  </span>
                  <h3 className="mt-2 text-base font-semibold leading-snug group-hover:text-primary">
                    {p.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">
                    {p.excerpt}
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <img src={avatar(p.seed)} className="h-5 w-5 rounded-full" alt="" />
                    <span>{p.author}</span>
                    <span>·</span>
                    <span>{p.date}</span>
                    <span>·</span>
                    <span>{p.time}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </PublicShell>
  );
}
