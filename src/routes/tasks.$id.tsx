import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  Tag,
  User,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/tasks/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Task ${params.id} · UNIWORK` },
      { name: "description", content: `Chi tiết công việc ${params.id}` },
    ],
  }),
  component: TaskDetailPage,
});

function TaskDetailPage() {
  const { id } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const [comment, setComment] = useState("");

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="tasks" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            <Link
              to="/tasks"
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Quay lại Bảng công việc
            </Link>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
              <div className="space-y-6">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{id}</span>
                    <span>·</span>
                    <span>Dự án STOS Platform</span>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    Thiết kế giao diện Dashboard tổng quan
                  </h1>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge color="sky">Đang thực hiện</Badge>
                    <Badge color="amber">Ưu tiên cao</Badge>
                    <span className="rounded-full bg-pink-500/20 px-2.5 py-0.5 text-xs text-pink-300 border border-pink-500/30">
                      Design
                    </span>
                  </div>
                </div>

                <Section title="Mô tả">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Thiết kế lại giao diện Dashboard với các widget KPI, biểu đồ tiến độ
                    sprint, danh sách hoạt động gần đây và panel AI Copilot. Tuân thủ
                    design system, hỗ trợ mobile và dark mode.
                  </p>
                </Section>

                <Section title="Tiêu chí hoàn thành">
                  <ul className="space-y-2 text-sm">
                    {[
                      "Wireframe cho desktop và mobile",
                      "High-fidelity mockup trong Figma",
                      "Prototype tương tác cho stakeholder review",
                      "Tài liệu design tokens & spacing",
                      "Handoff sang đội Frontend",
                    ].map((s, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          defaultChecked={i < 2}
                          className="h-4 w-4 rounded border-border bg-surface-2"
                        />
                        <span className={i < 2 ? "text-muted-foreground line-through" : ""}>
                          {s}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>

                <Section title="Tệp đính kèm">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {["Dashboard-v3.fig", "User-research.pdf", "Color-tokens.png"].map((f) => (
                      <div
                        key={f}
                        className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm hover:bg-surface-2"
                      >
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{f}</span>
                        <span className="text-xs text-muted-foreground">2.4 MB</span>
                      </div>
                    ))}
                    <button className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-3 text-xs text-muted-foreground hover:bg-surface-2">
                      <Plus className="h-3.5 w-3.5" /> Thêm tệp
                    </button>
                  </div>
                </Section>

                <Section title="Bình luận (4)">
                  <div className="space-y-4">
                    {[
                      { who: "Minh Anh", seed: "minh-anh", time: "2 giờ trước", text: "Mình đã đẩy bản v3 lên Figma, mọi người review giúp nhé." },
                      { who: "Tuấn Nam", seed: "tuan-nam-ba", time: "1 giờ trước", text: "Phần header trông gọn hơn rồi. Có thể tăng contrast cho KPI numbers không?" },
                      { who: "Bảo Ngọc", seed: "bao-ngoc", time: "30 phút trước", text: "Mobile breakpoint hiển thị đẹp. 👍" },
                    ].map((c, i) => (
                      <div key={i} className="flex gap-3">
                        <img src={avatar(c.seed)} alt="" className="h-8 w-8 rounded-full" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{c.who}</span>
                            <span>{c.time}</span>
                          </div>
                          <p className="mt-1 text-sm">{c.text}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-3">
                      <img src={avatar("me")} alt="" className="h-8 w-8 rounded-full" />
                      <div className="flex flex-1 items-end gap-2 rounded-lg border border-border bg-surface p-2">
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          rows={2}
                          placeholder="Viết bình luận…"
                          className="flex-1 resize-none bg-transparent text-sm focus:outline-none"
                        />
                        <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </Section>
              </div>

              <aside className="space-y-4">
                <Field icon={User} label="Người thực hiện">
                  <div className="flex items-center gap-2">
                    <img src={avatar("minh-anh")} className="h-6 w-6 rounded-full" alt="" />
                    <span className="text-sm">Minh Anh</span>
                  </div>
                </Field>
                <Field icon={Flag} label="Mức ưu tiên">
                  <span className="text-sm text-amber-400">Cao</span>
                </Field>
                <Field icon={Calendar} label="Hạn chót">
                  <span className="text-sm">30/05/2026</span>
                </Field>
                <Field icon={Clock} label="Thời gian ước tính">
                  <span className="text-sm">16 giờ</span>
                </Field>
                <Field icon={Tag} label="Sprint">
                  <span className="text-sm">Sprint 14</span>
                </Field>
                <Field icon={Link2} label="Liên kết">
                  <Link to="/tasks" className="text-sm text-primary hover:underline">
                    STOS-127 (cha)
                  </Link>
                </Field>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-success/20 px-3 py-2 text-sm font-medium text-success hover:bg-success/30">
                  <CheckCircle2 className="h-4 w-4" /> Đánh dấu hoàn thành
                </button>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button className="rounded p-1 text-muted-foreground hover:bg-surface-2">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      {children}
    </section>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {children}
    </div>
  );
}

function Badge({ color, children }: { color: "sky" | "amber" | "emerald"; children: React.ReactNode }) {
  const map = {
    sky: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    amber: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  } as const;
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${map[color]}`}>{children}</span>
  );
}