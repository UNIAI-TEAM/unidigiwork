import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Reply, ReplyAll, Forward, Star, Archive, Trash2, MoreHorizontal, Paperclip, Sparkles } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/email/$id")({
  head: ({ params }) => ({ meta: [{ title: `Email ${params.id} · UNIWORK` }] }),
  component: EmailDetailPage,
});

function EmailDetailPage() {
  const { id } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="email" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
            <div className="mb-4 flex items-center justify-between">
              <Link to="/email" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Hộp thư
              </Link>
              <div className="flex items-center gap-1">
                <IconBtn icon={Archive} />
                <IconBtn icon={Trash2} />
                <IconBtn icon={Star} />
                <IconBtn icon={MoreHorizontal} />
              </div>
            </div>

            <article className="rounded-2xl border border-border bg-surface p-6">
              <h1 className="text-2xl font-bold">Đề xuất hợp tác triển khai UNIWORK Q3</h1>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">#{id}</span>
                <span>30/05/2026 · 09:42</span>
              </div>

              <div className="mt-5 flex items-start gap-3 border-b border-border pb-5">
                <img src={avatar("partner")} className="h-10 w-10 rounded-full" alt="" />
                <div className="flex-1">
                  <div className="text-sm">
                    <span className="font-medium">Lê Thanh Tùng</span>{" "}
                    <span className="text-muted-foreground">&lt;tung.le@partner.vn&gt;</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Tới: tôi · CC: minh.anh@uniwork.vn, tuan.nam@uniwork.vn
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-primary/30 bg-primary/10 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> Tóm tắt AI
                </div>
                <p className="text-xs text-muted-foreground">
                  Đối tác đề xuất pilot UNIWORK cho 200 nhân sự trong Q3, kèm yêu cầu SSO
                  và báo cáo tuỳ chỉnh. Cần phản hồi trước 05/06.
                </p>
              </div>

              <div className="prose prose-invert mt-5 max-w-none text-sm">
                <p>Chào anh/chị,</p>
                <p>
                  Sau buổi demo tuần trước, đội ngũ chúng tôi rất ấn tượng với UNIWORK và
                  mong muốn triển khai pilot cho 200 nhân sự văn phòng trong quý 3.
                </p>
                <p>Các yêu cầu chính:</p>
                <ul>
                  <li>Single Sign-On với AD nội bộ</li>
                  <li>Báo cáo định kỳ tuỳ chỉnh theo phòng ban</li>
                  <li>SLA 99.9% và hỗ trợ giờ hành chính</li>
                </ul>
                <p>Trân trọng,<br />Lê Thanh Tùng</p>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {["Proposal-Q3.pdf", "SSO-Requirements.docx"].map((f) => (
                  <div key={f} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2.5 text-xs">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">{f}</span>
                    <span className="text-muted-foreground">1.2 MB</span>
                  </div>
                ))}
              </div>
            </article>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/email/compose" className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Reply className="h-4 w-4" /> Trả lời
              </Link>
              <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
                <ReplyAll className="h-4 w-4" /> Trả lời tất cả
              </button>
              <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
                <Forward className="h-4 w-4" /> Chuyển tiếp
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function IconBtn({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
      <Icon className="h-4 w-4" />
    </button>
  );
}