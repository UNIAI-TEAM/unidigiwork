import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Clock, Tag, ThumbsUp, MessageSquare, Share2, Bookmark } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/knowledge/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} · Kho tri thức UNIWORK` },
      { name: "description", content: "Bài viết tri thức trên UNIWORK Knowledge Hub" },
    ],
  }),
  component: KnowledgeDetailPage,
});

function KnowledgeDetailPage() {
  const { slug } = Route.useParams();
  const [open, setOpen] = useSidebarStateHook();
  const title = humanize(slug);

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="knowledge" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
              <Link to="/knowledge" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Kho tri thức
              </Link>

              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-primary">
                  <BookOpen className="h-3 w-3" /> Hướng dẫn
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" /> 8 phút đọc
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Tag className="h-3 w-3" /> Onboarding, Best Practice
                </span>
              </div>

              <h1 className="text-4xl font-bold leading-tight tracking-tight">{title}</h1>

              <div className="mt-5 flex items-center justify-between border-b border-border pb-5">
                <div className="flex items-center gap-3">
                  <img src={avatar("huong-tran")} className="h-10 w-10 rounded-full" alt="" />
                  <div>
                    <div className="text-sm font-medium">Trần Thu Hương</div>
                    <div className="text-xs text-muted-foreground">12/05/2026 · cập nhật 2 ngày trước</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <ActBtn icon={ThumbsUp} label="124" />
                  <ActBtn icon={MessageSquare} label="18" />
                  <ActBtn icon={Bookmark} />
                  <ActBtn icon={Share2} />
                </div>
              </div>

              <article className="prose prose-invert mt-6 max-w-none">
                <p className="text-base leading-relaxed text-muted-foreground">
                  Bài viết hướng dẫn từng bước cách thiết lập một quy trình cộng tác
                  hiệu quả trong UNIWORK — từ việc tạo workspace, mời thành viên, đến
                  tổ chức tài liệu và tự động hoá bằng workflow.
                </p>

                <h2 className="mt-8 text-xl font-semibold">1. Tạo workspace đầu tiên</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Đăng nhập vào UNIWORK, mở menu workspace ở góc trái và chọn
                  "Workspace mới". Đặt tên gắn với tên dự án hoặc đội nhóm để dễ
                  nhận diện.
                </p>

                <h2 className="mt-6 text-xl font-semibold">2. Mời thành viên</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Trong Settings · Members, dán danh sách email cùng vai trò. UNIWORK
                  sẽ gửi email mời kèm liên kết one-click sign-in.
                </p>

                <h2 className="mt-6 text-xl font-semibold">3. Tổ chức tài liệu</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Sử dụng cấu trúc thư mục phẳng tối đa 2 tầng. Mọi tài liệu nên có
                  chủ sở hữu rõ ràng và một dòng mô tả ngắn.
                </p>

                <blockquote className="mt-4 border-l-2 border-primary pl-4 text-sm italic text-muted-foreground">
                  Mẹo: gắn thẻ "draft", "review", "final" để AI Copilot lọc nhanh hơn.
                </blockquote>
              </article>

              <div className="mt-10 rounded-xl border border-border bg-surface p-5">
                <h3 className="mb-3 text-sm font-semibold">Bài liên quan</h3>
                <ul className="space-y-2 text-sm">
                  {["huong-dan-su-dung-ai-copilot", "tao-workflow-tu-dong-hoa", "best-practice-meeting"].map((s) => (
                    <li key={s}>
                      <Link to="/knowledge/$slug" params={{ slug: s }} className="text-primary hover:underline">
                        {humanize(s)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </main>

          <aside className="hidden w-60 shrink-0 border-l border-border bg-surface/40 p-4 xl:block">
            <div className="sticky top-4">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Mục lục</div>
              <ul className="space-y-1.5 text-xs">
                <li className="text-primary">1. Tạo workspace đầu tiên</li>
                <li className="text-muted-foreground hover:text-foreground">2. Mời thành viên</li>
                <li className="text-muted-foreground hover:text-foreground">3. Tổ chức tài liệu</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

import { useSidebarState as useSidebarStateHook } from "@/components/app-shell";

function ActBtn({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label?: string }) {
  return (
    <button className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground">
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