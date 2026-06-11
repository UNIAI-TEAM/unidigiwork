import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Bold,
  Clock,
  Download,
  Italic,
  Link2,
  List,
  MessageSquare,
  MoreHorizontal,
  Share2,
  Star,
  Users,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/documents/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Tài liệu ${params.id} · UNIWORK` }],
  }),
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { id } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const [title, setTitle] = useState("Kế hoạch triển khai UNIWORK Q3");

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="documents" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 lg:px-12">
              <Link
                to="/documents"
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Tài liệu
              </Link>

              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>My Documents</span>
                  <span>/</span>
                  <span className="font-mono">{id}</span>
                  <span>·</span>
                  <Clock className="h-3 w-3" />
                  <span>Đã lưu tự động 2 phút trước</span>
                </div>
                <div className="flex items-center gap-1">
                  <IconBtn icon={Star} />
                  <IconBtn icon={Share2} />
                  <IconBtn icon={Download} />
                  <IconBtn icon={MoreHorizontal} />
                </div>
              </div>

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent text-4xl font-bold tracking-tight focus:outline-none"
              />

              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex -space-x-1.5">
                  {["minh-anh", "tuan-nam-ba", "huong-tran"].map((s) => (
                    <img key={s} src={avatar(s)} className="h-5 w-5 rounded-full border-2 border-bg" alt="" />
                  ))}
                </div>
                <span>3 cộng tác viên</span>
                <span>·</span>
                <Users className="h-3.5 w-3.5" />
                <span>Workspace UNIWORK</span>
              </div>

              <div className="my-5 flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
                <TBtn icon={Bold} />
                <TBtn icon={Italic} />
                <TBtn icon={List} />
                <TBtn icon={Link2} />
                <div className="mx-1 h-5 w-px bg-border" />
                <select className="rounded bg-transparent px-2 py-1 text-xs hover:bg-surface-2">
                  <option>Heading 1</option>
                  <option>Heading 2</option>
                  <option>Body</option>
                </select>
              </div>

              <article className="prose prose-invert max-w-none">
                <h2 className="text-xl font-semibold">1. Mục tiêu Q3/2026</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Trong quý 3, đội ngũ UNIWORK tập trung hoàn thiện ba module trụ cột:
                  Meeting Copilot, Document AI và Knowledge Hub — đồng thời triển khai
                  pilot cho 5 khách hàng doanh nghiệp lớn tại Hà Nội và TP. Hồ Chí Minh.
                </p>
                <h2 className="mt-6 text-xl font-semibold">2. Hạng mục chính</h2>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li>• Hoàn thiện 12 user story trong Sprint 14–16</li>
                  <li>• Tích hợp SSO với hệ thống nội bộ khách hàng</li>
                  <li>• Đạt 99.5% uptime cho cụm staging và production</li>
                  <li>• Đào tạo nội bộ về AI Copilot cho 40 nhân sự</li>
                </ul>
                <h2 className="mt-6 text-xl font-semibold">3. Rủi ro & giải pháp</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Rủi ro chính nằm ở khả năng mở rộng hạ tầng inference khi số lượng
                  meeting đồng thời tăng. Đội Platform sẽ chuyển sang hàng đợi GPU
                  pool và áp dụng cơ chế back-pressure để xử lý đỉnh tải.
                </p>
                <blockquote className="mt-4 border-l-2 border-primary pl-4 text-sm italic text-muted-foreground">
                  "Mục tiêu Q3 không chỉ là tính năng, mà là sự tin cậy."
                </blockquote>
              </article>
            </div>
          </main>

          <aside className="hidden w-72 shrink-0 border-l border-border bg-surface/50 p-4 lg:block">
            <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
              Hoạt động
            </h3>
            <ul className="space-y-3 text-sm">
              {[
                { who: "Minh Anh", act: "chỉnh sửa tiêu đề", time: "2 phút" },
                { who: "Tuấn Nam", act: "thêm bình luận", time: "1 giờ" },
                { who: "Hương Trần", act: "chia sẻ tài liệu", time: "3 giờ" },
              ].map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <img src={avatar(a.who)} className="h-6 w-6 rounded-full" alt="" />
                  <div>
                    <div className="text-xs">
                      <span className="font-medium">{a.who}</span>{" "}
                      <span className="text-muted-foreground">{a.act}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{a.time} trước</div>
                  </div>
                </li>
              ))}
            </ul>

            <h3 className="mb-3 mt-6 text-xs font-semibold uppercase text-muted-foreground">
              Bình luận
            </h3>
            <div className="rounded-lg border border-border bg-surface p-3 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                Chưa có bình luận
              </div>
            </div>
          </aside>
        </div>
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
function TBtn({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
      <Icon className="h-4 w-4" />
    </button>
  );
}