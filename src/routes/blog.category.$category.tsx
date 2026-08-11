import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { BlogCard } from "./blog";
import { listBlogPosts } from "@/lib/api/blog.functions";
import { categorySlug, decodeCategory } from "@/lib/blog-categories";

export const Route = createFileRoute("/blog/category/$category")({
  head: ({ params }) => {
    const catLabel = decodeCategory(params.category);
    return {
      meta: [
        { title: `${catLabel} — Blog UNIWORK` },
        { name: "description", content: `Bài viết thuộc chủ đề ${catLabel} trên blog UNIWORK.` },
        { property: "og:title", content: `${catLabel} — Blog UNIWORK` },
        { property: "og:description", content: `Bài viết thuộc chủ đề ${catLabel} trên blog UNIWORK.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `https://unidigiwork.lovable.app/blog/category/${params.category}` }],
    };
  },
  component: BlogCategoryPage,
});

function BlogCategoryPage() {
  const { category } = Route.useParams();
  const q = useQuery({ queryKey: ["blog", "list"], queryFn: () => listBlogPosts() });
  const all = q.data ?? [];
  const filtered = all.filter((p) => categorySlug(p.category) === category);
  const catLabel = filtered[0]?.category ?? decodeCategory(category);

  return (
    <PublicShell active="blog">
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
          <Link to="/blog" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
          </Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Chủ đề: {catLabel}</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            {q.isLoading ? "Đang tải…" : `${filtered.length} bài viết trong chủ đề này.`}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 pb-20 sm:px-6">
        {q.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bài viết…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface py-20 text-center text-muted-foreground">
            Chưa có bài viết nào trong danh mục này
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <BlogCard key={p.slug} post={p} />
            ))}
          </div>
        )}
      </section>
    </PublicShell>
  );
}
