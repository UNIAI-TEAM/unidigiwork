import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Clock, Tag, Eye, Pencil } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { getKnowledgeArticle } from "@/lib/api/knowledge.functions";

export const Route = createFileRoute("/knowledge/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${humanize(params.slug)} · Kho tri thức UNIWORK` },
      { name: "description", content: "Bài viết tri thức nội bộ trên UNIWORK Knowledge Hub." },
      { property: "og:title", content: `${humanize(params.slug)} · Kho tri thức UNIWORK` },
      { property: "og:description", content: "Bài viết tri thức nội bộ trên UNIWORK Knowledge Hub." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgeDetailPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  published: "Đã xuất bản",
  archived: "Lưu trữ",
};

function KnowledgeDetailPage() {
  const { slug } = Route.useParams();
  const [open, setOpen] = useSidebarState();

  const q = useQuery({
    queryKey: ["knowledge", "article", slug],
    queryFn: () => getKnowledgeArticle({ data: { slug } }),
    retry: false,
  });
  const article = q.data?.article;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="knowledge" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
            <Link
              to="/knowledge"
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Kho tri thức
            </Link>

            {q.isLoading ? (
              <p className="text-sm text-muted-foreground">Đang tải bài viết…</p>
            ) : !article ? (
              <div className="rounded-2xl border border-border bg-surface p-10 text-center">
                <div className="text-base font-semibold">Không tìm thấy bài viết</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bài viết có thể đã bị xóa hoặc bạn không có quyền truy cập.
                </p>
                <Link
                  to="/knowledge"
                  className="mt-4 inline-flex rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Về kho tri thức
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-primary">
                    <BookOpen className="h-3 w-3" /> {article.category}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-muted-foreground">
                    {STATUS_LABEL[article.status] ?? article.status}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" /> {formatDate(article.publishedAt ?? article.updatedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Eye className="h-3 w-3" /> {article.viewCount} lượt xem
                  </span>
                  {article.tags.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Tag className="h-3 w-3" /> {article.tags.join(", ")}
                    </span>
                  )}
                </div>

                <h1 className="text-4xl font-bold leading-tight tracking-tight">{article.title}</h1>
                {article.summary && (
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">{article.summary}</p>
                )}

                {article.canEdit && (
                  <Link
                    to="/admin/knowledge"
                    className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Chỉnh sửa trong Quản trị
                  </Link>
                )}

                <article className="mt-6 whitespace-pre-wrap border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">
                  {article.content || "Bài viết chưa có nội dung."}
                </article>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

function humanize(slug: string) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
