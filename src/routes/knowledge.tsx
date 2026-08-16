import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Search, Plus, Eye, Tag, Clock, X } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listKnowledgeArticles, type KnowledgeArticleDTO } from "@/lib/api/knowledge.functions";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "Kho tri thức · UNIWORK" },
      {
        name: "description",
        content: "Trung tâm tri thức nội bộ: SOP, playbook, wiki kỹ thuật và chính sách của tổ chức.",
      },
      { property: "og:title", content: "Kho tri thức · UNIWORK" },
      {
        property: "og:description",
        content: "Trung tâm tri thức nội bộ: SOP, playbook, wiki kỹ thuật và chính sách của tổ chức.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgePage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  published: "Đã xuất bản",
  archived: "Lưu trữ",
};

function KnowledgePage() {
  const [open, setOpen] = useSidebarState();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const q = useQuery({
    queryKey: ["knowledge", "list"],
    queryFn: () => listKnowledgeArticles({ data: {} }),
  });

  const canManage = q.data?.canManage ?? false;
  const all = q.data?.articles ?? [];
  const visible = useMemo(
    () => all.filter((a) => (canManage ? a.status !== "archived" : a.status === "published")),
    [all, canManage],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return visible.filter((a) => {
      if (category !== "all" && a.category !== category) return false;
      if (!s) return true;
      return (
        a.title.toLowerCase().includes(s) ||
        a.summary.toLowerCase().includes(s) ||
        a.tags.some((t) => t.toLowerCase().includes(s))
      );
    });
  }, [visible, search, category]);

  const categories = useMemo(
    () => Array.from(new Set(visible.map((a) => a.category).filter(Boolean))).sort(),
    [visible],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="knowledge" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-none px-4 py-8 sm:px-6">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5 text-primary" /> Kho tri thức
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Trung tâm tri thức nội bộ</h1>
                <p className="text-sm text-muted-foreground">
                  SOP, playbook, wiki kỹ thuật và chính sách của tổ chức.
                </p>
              </div>
              {canManage && (
                <Link
                  to="/admin/knowledge"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Quản trị nội dung
                </Link>
              )}
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm bài viết theo tiêu đề, tóm tắt hoặc nhãn…"
                  className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-9 text-sm outline-none focus:border-primary"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="Xóa từ khóa"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
                <CatBtn active={category === "all"} onClick={() => setCategory("all")} label="Tất cả" />
                {categories.map((c) => (
                  <CatBtn key={c} active={category === c} onClick={() => setCategory(c)} label={c} />
                ))}
              </div>
            </div>

            {q.isLoading ? (
              <Empty text="Đang tải kho tri thức…" />
            ) : !q.data?.tenantId ? (
              <Empty text="Chưa có tổ chức hoạt động cho tài khoản này." />
            ) : filtered.length === 0 ? (
              <Empty text="Chưa có bài viết nào. Tạo bài viết đầu tiên trong trang Quản trị." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function CatBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1.5 transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ArticleCard({ article }: { article: KnowledgeArticleDTO }) {
  return (
    <Link
      to="/knowledge/$slug"
      params={{ slug: article.slug }}
      className="flex flex-col rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">{article.category}</span>
        {article.status !== "published" && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground">
            {STATUS_LABEL[article.status] ?? article.status}
          </span>
        )}
      </div>
      <h2 className="mt-2 line-clamp-2 text-base font-semibold leading-snug">{article.title}</h2>
      <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted-foreground">{article.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {formatDate(article.publishedAt ?? article.updatedAt)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3 w-3" /> {article.viewCount}
        </span>
        {article.tags.length > 0 && (
          <span className="inline-flex items-center gap-1 truncate">
            <Tag className="h-3 w-3" /> {article.tags.slice(0, 2).join(", ")}
          </span>
        )}
      </div>
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-12 text-center text-sm text-muted-foreground">
      {text}
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
