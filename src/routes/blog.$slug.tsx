import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, BookOpen, ThumbsUp, MessageSquare, Share2, Bookmark, Tag, Loader2 } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { avatar } from "@/components/app-shell";
import { getBlogPost } from "@/lib/api/blog.functions";
import { categorySlug } from "@/lib/blog-categories";
import { formatDate } from "./blog";
import { notifyComingSoon } from "@/lib/coming-soon";

export const Route = createFileRoute("/blog/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${humanize(params.slug)} · Blog UNIWORK` },
      { name: "description", content: "Bài viết chi tiết trên Blog UNIWORK" },
      { property: "og:title", content: `${humanize(params.slug)} · Blog UNIWORK` },
      { property: "og:description", content: "Bài viết chi tiết trên Blog UNIWORK" },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: `https://unidigiwork.lovable.app/blog/${params.slug}` },
    ],
    links: [{ rel: "canonical", href: `https://unidigiwork.lovable.app/blog/${params.slug}` }],
  }),
  component: BlogDetailPage,
});

function BlogDetailPage() {
  const { slug } = Route.useParams();
  const q = useQuery({ queryKey: ["blog", "post", slug], queryFn: () => getBlogPost({ data: { slug } }) });
  const post = q.data?.post ?? null;
  const related = q.data?.related ?? [];

  return (
    <PublicShell active="blog">
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <Link to="/blog" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Quay lại danh sách
        </Link>

        {q.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bài viết…
          </div>
        ) : !post ? (
          <div className="rounded-2xl border border-border bg-surface py-20 text-center text-muted-foreground">
            Không tìm thấy bài viết này.
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              <Link
                to="/blog/category/$category"
                params={{ category: categorySlug(post.category) }}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-medium text-primary hover:underline"
              >
                <BookOpen className="h-3 w-3" />
                {post.category}
              </Link>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {post.readTime}
              </span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Tag className="h-3 w-3" />
                UNIWORK
              </span>
            </div>

            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>

            <div className="mt-5 flex items-center justify-between border-b border-border pb-5">
              <div className="flex items-center gap-3">
                <img src={avatar(post.authorSeed)} className="h-10 w-10 rounded-full" alt="" />
                <div>
                  <div className="text-sm font-medium">{post.authorName}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(post.publishedAt)}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <ActionBtn icon={ThumbsUp} />
                <ActionBtn icon={MessageSquare} />
                <ActionBtn icon={Bookmark} />
                <ActionBtn icon={Share2} />
              </div>
            </div>

            <div className="mt-8 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary/30 via-violet-500/20 to-sky-500/10">
              {post.coverUrl && <img src={post.coverUrl} alt={post.title} className="h-full w-full object-cover" />}
            </div>

            <div className="mt-8 max-w-none">
              <p className="text-base leading-relaxed text-muted-foreground">{post.excerpt}</p>
              {post.content
                .split(/\n{2,}/)
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i} className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {para}
                  </p>
                ))}
            </div>

            {related.length > 0 && (
              <div className="mt-10 rounded-xl border border-border bg-surface p-5">
                <h2 className="mb-3 text-sm font-semibold">Bài viết liên quan</h2>
                <ul className="space-y-2 text-sm">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link to="/blog/$slug" params={{ slug: r.slug }} className="text-primary hover:underline">
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </article>
    </PublicShell>
  );
}

function ActionBtn({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label?: string }) {
  return (
    <button onClick={() => notifyComingSoon()} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function humanize(slug: string) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
