import { createFileRoute, Link } from "@tanstack/react-router";
import { Compass, Heart, Target, Users, Award, ArrowRight } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { avatar } from "@/components/app-shell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "Giới thiệu UNIWORK — Đội ngũ và sứ mệnh" },
      { name: "description", content: "UNIWORK là nền tảng làm việc số do Unicom xây dựng, hướng tới mục tiêu nâng tầm năng suất và minh bạch cho doanh nghiệp Việt." },
      { property: "og:title", content: "Giới thiệu UNIWORK" },
      { property: "og:description", content: "Sứ mệnh, giá trị và đội ngũ đứng sau UNIWORK." },
      { property: "og:url", content: "https://unidigiwork.lovable.app/about" },
    ],
    links: [{ rel: "canonical", href: "https://unidigiwork.lovable.app/about" }],
  }),
  component: AboutPage,
});

const values = [
  { icon: Compass, t: "Lấy người dùng làm trung tâm", d: "Mọi quyết định sản phẩm bắt đầu từ một bài toán thật của khách hàng." },
  { icon: Heart, t: "Tinh tế trong từng chi tiết", d: "Một sản phẩm tốt là kết quả của hàng nghìn chi tiết được chăm chút." },
  { icon: Target, t: "Minh bạch và đo lường được", d: "Chúng tôi tin vào dữ liệu, nguyên nhân – kết quả và trách nhiệm rõ ràng." },
  { icon: Users, t: "Cộng tác là siêu năng lực", d: "Khi đội ngũ làm việc cùng nhau hiệu quả, mọi thứ đều khả thi." },
];

const team = [
  { name: "Trần Quang Minh", role: "CEO & Đồng sáng lập", seed: "quang-minh" },
  { name: "Nguyễn Minh Anh", role: "Head of Design", seed: "minh-anh" },
  { name: "Lê Tuấn Nam", role: "CTO", seed: "tuan-nam-ba" },
  { name: "Trần Thu Hương", role: "Head of Customer", seed: "huong-tran" },
];

function AboutPage() {
  return (
    <PublicShell active="about">
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Award className="h-3.5 w-3.5" /> Câu chuyện UNIWORK
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Nâng tầm cách doanh nghiệp Việt làm việc cùng nhau.
          </h1>
          <p className="mt-5 max-w-3xl text-lg text-muted-foreground">
            UNIWORK ra đời năm 2023 tại Hà Nội với một niềm tin đơn giản: doanh
            nghiệp Việt xứng đáng có một nền tảng làm việc số được thiết kế cho
            chính mình — bằng tiếng Việt, theo văn hoá Việt, ở đẳng cấp thế giới.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">Sứ mệnh</h2>
            <p className="mt-4 text-muted-foreground">
              Giúp mọi tổ chức — từ start-up 5 người đến tập đoàn 10.000 nhân
              sự — vận hành nhanh hơn, minh bạch hơn và hạnh phúc hơn nhờ công
              nghệ.
            </p>
          </div>
          <div>
            <h2 className="text-3xl font-bold">Tầm nhìn</h2>
            <p className="mt-4 text-muted-foreground">
              Đến 2030, UNIWORK là nền tảng làm việc số được tin dùng bởi 1
              triệu chuyên gia tại Đông Nam Á, với AI Copilot đa ngôn ngữ và
              hiểu sâu nghiệp vụ địa phương.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-surface/30 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Giá trị cốt lõi</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v) => (
              <div key={v.t} className="rounded-2xl border border-border bg-surface p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <v.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{v.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { n: "120+", l: "Khách hàng doanh nghiệp" },
            { n: "32.000+", l: "Người dùng hàng tháng" },
            { n: "99.95%", l: "Uptime 12 tháng gần nhất" },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl border border-border bg-surface p-8 text-center">
              <div className="text-4xl font-bold tracking-tight text-primary">{s.n}</div>
              <div className="mt-2 text-sm text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border/60 bg-surface/30 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Đội ngũ dẫn dắt</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            Đa dạng kinh nghiệm từ Google, Grab, FPT, VinAI — gặp nhau ở một
            niềm tin chung về công cụ làm việc tử tế.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((m) => (
              <div key={m.seed} className="rounded-2xl border border-border bg-surface p-6 text-center">
                <img src={avatar(m.seed)} alt="" className="mx-auto h-20 w-20 rounded-full ring-4 ring-surface-2" />
                <div className="mt-4 text-base font-semibold">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold sm:text-4xl">Cùng xây dựng tương lai làm việc</h2>
          <p className="text-muted-foreground">
            Chúng tôi đang tuyển các vị trí Engineering, Design và Customer Success.
          </p>
          <Link to="/contact" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Liên hệ tuyển dụng <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}