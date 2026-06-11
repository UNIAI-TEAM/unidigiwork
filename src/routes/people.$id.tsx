import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  MessageSquare,
  Video,
  UserPlus,
  Award,
  Activity,
} from "lucide-react";
import { useState } from "react";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/people/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Hồ sơ ${params.id} · UNIWORK` }],
  }),
  component: PeopleDetailPage,
});

function PeopleDetailPage() {
  const { id } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const [tab, setTab] = useState<"overview" | "projects" | "activity" | "files">("overview");

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="people" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
            <Link to="/people" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Nhân sự
            </Link>

            <div className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex flex-wrap items-start gap-5">
                <img
                  src={avatar(id)}
                  alt=""
                  className="h-24 w-24 rounded-full ring-4 ring-surface-2"
                />
                <div className="flex-1 min-w-[200px]">
                  <h1 className="text-2xl font-bold">Nguyễn Minh Anh</h1>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Senior Product Designer · Đội Design
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> minh.anh@uniwork.vn</span>
                    <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> +84 90 123 4567</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Hà Nội</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    <MessageSquare className="h-4 w-4" /> Nhắn tin
                  </button>
                  <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
                    <Video className="h-4 w-4" /> Gọi
                  </button>
                  <button className="rounded-lg bg-surface-2 p-2 hover:bg-surface-3">
                    <UserPlus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Dự án" value="6" icon={Briefcase} />
                <Stat label="Tasks tuần" value="14" icon={Activity} />
                <Stat label="Meeting tháng" value="28" icon={Calendar} />
                <Stat label="Đánh giá" value="4.9" icon={Award} />
              </div>
            </div>

            <div className="mt-6 flex gap-5 border-b border-border text-sm">
              {(
                [
                  ["overview", "Tổng quan"],
                  ["projects", "Dự án"],
                  ["activity", "Hoạt động"],
                  ["files", "Tệp"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`-mb-px border-b-2 py-2.5 transition-colors ${tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="space-y-5 lg:col-span-2">
                <Card title="Giới thiệu">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    8+ năm kinh nghiệm thiết kế sản phẩm B2B SaaS. Đam mê hệ thống
                    thiết kế, accessibility và quy trình cộng tác. Hiện dẫn dắt
                    thiết kế UNIWORK Meeting Copilot và Document AI.
                  </p>
                </Card>
                <Card title="Kỹ năng">
                  <div className="flex flex-wrap gap-2">
                    {["Figma", "Design System", "User Research", "Prototyping", "Accessibility", "Motion"].map((s) => (
                      <span key={s} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">{s}</span>
                    ))}
                  </div>
                </Card>
                <Card title="Hoạt động gần đây">
                  <ul className="space-y-3 text-sm">
                    {[
                      "Cập nhật tài liệu Design System v3",
                      "Hoàn thành task STOS-128",
                      "Tham gia meeting Sprint Review",
                    ].map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
              <div className="space-y-5">
                <Card title="Thông tin">
                  <dl className="space-y-2 text-xs">
                    <Row label="Quản lý" value="Trần Quang Minh" />
                    <Row label="Phòng ban" value="Design" />
                    <Row label="Ngày vào" value="01/03/2023" />
                    <Row label="Múi giờ" value="GMT+7" />
                  </dl>
                </Card>
                <Card title="Đội nhóm">
                  <div className="flex -space-x-2">
                    {["tuan-nam-ba", "huong-tran", "duy-anh", "bao-ngoc"].map((s) => (
                      <img key={s} src={avatar(s)} className="h-8 w-8 rounded-full border-2 border-surface" alt="" />
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </div>
  );
}