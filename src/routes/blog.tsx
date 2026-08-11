import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, ArrowRight, Search, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PublicShell } from "@/components/public-shell";
import { avatar } from "@/components/app-shell";
import { listBlogPosts, type BlogPostDto } from "@/lib/api/blog.functions";
import { categorySlug } from "@/lib/blog-categories";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog UNIWORK — Câu chuyện về làm việc số" },
      { name: "description", content: "Bài viết, hướng dẫn và case study về cách doanh nghiệp Việt cộng tác hiệu quả hơn với UNIWORK." },
      { property: "og:title", content: "Blog UNIWORK" },
      { property: "og:description", content: "Bài viết, hướng dẫn và case study từ đội ngũ UNIWORK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://unidigiwork.lovable.app/blog" },
    ],
    links: [{ rel: "canonical", href: "https://unidigiwork.lovable.app/blog" }],
  }),
  component: BlogPage,
});

export function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("vi-VN");
}

function BlogPage() {
  const [q, setQ] = useState("");
  const postsQuery = useQuery({ queryKey: ["blog", "list"], queryFn: () => listBlogPosts() });
  const all = postsQuery.data ?? [];

  const featured = all.find((p) => p.isFeatured) ?? all[0] ?? null;
  const rest = useMemo(() => all.filter((p) => p.slug !== featured?.slug), [all, featured]);

  const categories = useMemo(
    () => ["Tất cả", ...Array.from(new Set(all.map((p) => p.category)))],
    [all],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rest;
    return rest.filter(
      (p) =>
        p.title.toLowerCase().includes(s) ||
        p.excerpt.toLowerCase().includes(s) ||
        p.category.toLowerCase().includes(s),
    );
  }, [rest, q]);

  return (
    <PublicShell active="blog">
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Blog
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Câu chuyện về cách doanh nghiệp Việt làm việc cùng nhau
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Bài viết, hướng dẫn và case study từ đội ngũ UNIWORK — cập nhật hàng tuần.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 pb-20 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {categories.map((c, i) => {
              const isAll = i === 0;
              const cls = `rounded-full px-3 py-1.5 text-xs font-medium ${isAll ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted-foreground hover:text-foreground"}`;
              if (isAll) {
                return (
                  <Link key={c} to="/blog" className={cls}>
                    {c}
                  </Link>
                );
              }
              return (
                <Link key={c} to="/blog/category/$category" params={{ category: categorySlug(c) }} className={cls}>
                  {c}
                </Link>
              );
            })}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm bài viết…"
              className="w-64 rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {postsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bài viết…
          </div>
        ) : postsQuery.isError ? (
          <p className="py-20 text-center text-sm text-muted-foreground">Không tải được bài viết.</p>
        ) : all.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted-foreground">Chưa có bài viết nào được xuất bản.</p>
        ) : (
          <>
            {featured && (
              <Link
                to="/blog/$slug"
                params={{ slug: featured.slug }}
                className="mt-8 grid gap-6 overflow-hidden rounded-2xl border border-border bg-surface p-6 transition-all hover:shadow-2xl hover:shadow-primary/10 lg:grid-cols-2 lg:p-8"
              >
                <div className="aspect-[16/10] overflow-hidden rounded-xl bg-gradient-to-br from-primary/40 via-violet-500/30 to-sky-500/20">
                  {featured.coverUrl && (
                    <img src={featured.coverUrl} alt={featured.title} className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <div className="flex flex-col justify-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">{featured.category}</span>
                  <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{featured.title}</h2>
                  <p className="mt-3 text-muted-foreground">{featured.excerpt}</p>
                  <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
                    <img src={avatar(featured.authorSeed)} className="h-7 w-7 rounded-full" alt="" />
                    <span className="font-medium text-foreground">{featured.authorName}</span>
                    <span>·</span>
                    <span>{formatDate(featured.publishedAt)}</span>
                    <span>·</span>
                    <Clock className="h-3 w-3" />
                    <span>{featured.readTime}</span>
                  </div>
                  <div className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Đọc tiếp <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            )}

            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Không tìm thấy bài viết phù hợp với “{q}”.
              </p>
            ) : (
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((p) => (
                  <BlogCard key={p.slug} post={p} />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </PublicShell>
  );
}

export function BlogCard({ post: p }: { post: BlogPostDto }) {
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: p.slug }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all hover:shadow-xl hover:shadow-primary/5"
    >
      <div className="aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary/30 via-violet-500/20 to-sky-500/10">
        {p.coverUrl && <img src={p.coverUrl} alt={p.title} className="h-full w-full object-cover" loading="lazy" />}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">{p.category}</span>
        <h3 className="mt-2 text-base font-semibold leading-snug group-hover:text-primary">{p.title}</h3>
        <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">{p.excerpt}</p>
        <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <img src={avatar(p.authorSeed)} className="h-5 w-5 rounded-full" alt="" />
          <span>{p.authorName}</span>
          <span>·</span>
          <span>{formatDate(p.publishedAt)}</span>
          <span>·</span>
          <span>{p.readTime}</span>
        </div>
      </div>
    </Link>
  );
}
