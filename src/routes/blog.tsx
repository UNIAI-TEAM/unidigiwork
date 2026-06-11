import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, ArrowRight, Search } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { avatar } from "@/components/app-shell";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog UNIWORK — Câu chuyện về làm việc số" },
      { name: "description", content: "Bài viết, hướng dẫn và case study về cách doanh nghiệp Việt cộng tác hiệu quả hơn với UNIWORK." },
      { property: "og:title", content: "Blog UNIWORK" },
      { property: "og:description", content: "Bài viết, hướng dẫn và case study từ đội ngũ UNIWORK." },
      { property: "og:url", content: "https://unidigiwork.lovable.app/blog" },
    ],
    links: [{ rel: "canonical", href: "https://unidigiwork.lovable.app/blog" }],
  }),
  component: BlogPage,
});

export const categories = ["Tất cả", "Sản phẩm", "Hướng dẫn", "Case study", "Văn hoá"];

export function categorySlug(cat: string) {
  return cat.toLowerCase().replace(/\s+/g, "-");
}

export const featured = {
  slug: "ra-mat-uniwork-meeting-copilot",
  cat: "Sản phẩm",
  title: "Ra mắt UNIWORK Meeting Copilot — biên bản tự động bằng tiếng Việt",
  excerpt:
    "Meeting Copilot ghi nhận, tóm tắt và sinh action items theo thời gian thực, hiểu sâu ngữ cảnh tiếng Việt từ giọng nói tự nhiên.",
  author: "Trần Quang Minh",
  seed: "quang-minh",
  time: "5 phút đọc",
  date: "08/06/2026",
};

const posts = [
  {
    slug: "huong-dan-su-dung-ai-copilot",
    cat: "Hướng dẫn",
    title: "Hướng dẫn sử dụng AI Copilot hiệu quả trong UNIWORK",
    excerpt: "5 mẹo giúp đội ngũ của bạn tận dụng AI Copilot để soạn tài liệu, tóm tắt meeting và tự động hoá báo cáo.",
    author: "Nguyễn Minh Anh",
    seed: "minh-anh",
    time: "8 phút đọc",
    date: "02/06/2026",
  },
  {
    slug: "case-study-xyz-tang-30-nang-suat",
    cat: "Case study",
    title: "Công ty XYZ tăng 30% năng suất sau 3 tháng triển khai UNIWORK",
    excerpt: "Câu chuyện chuyển đổi số của một doanh nghiệp 200 nhân sự — từ email và Excel sang một nền tảng duy nhất.",
    author: "Trần Thu Hương",
    seed: "huong-tran",
    time: "6 phút đọc",
    date: "28/05/2026",
  },
  {
    slug: "tao-workflow-tu-dong-hoa",
    cat: "Hướng dẫn",
    title: "Tạo workflow tự động hoá phê duyệt trong 10 phút",
    excerpt: "Hướng dẫn từng bước thiết lập quy trình phê duyệt nghỉ phép, hợp đồng và đề xuất chi phí bằng workflow builder.",
    author: "Lê Tuấn Nam",
    seed: "tuan-nam-ba",
    time: "7 phút đọc",
    date: "20/05/2026",
  },
  {
    slug: "best-practice-meeting",
    cat: "Văn hoá",
    title: "5 best practice để mỗi cuộc họp đều có giá trị",
    excerpt: "Meeting không cần dài. Bài viết tổng hợp những nguyên tắc giúp đội ngũ chúng tôi cắt giảm 40% thời gian họp.",
    author: "Nguyễn Minh Anh",
    seed: "minh-anh",
    time: "4 phút đọc",
    date: "12/05/2026",
  },
  {
    slug: "kien-truc-da-ten-ant-uniwork",
    cat: "Sản phẩm",
    title: "Kiến trúc multi-tenant của UNIWORK — bảo mật từ tầng dữ liệu",
    excerpt: "Một bài viết kỹ thuật về cách UNIWORK cô lập dữ liệu giữa các tổ chức và đảm bảo bảo mật theo chuẩn ISO 27001.",
    author: "Lê Tuấn Nam",
    seed: "tuan-nam-ba",
    time: "10 phút đọc",
    date: "05/05/2026",
  },
  {
    slug: "van-hoa-remote-tai-uniwork",
    cat: "Văn hoá",
    title: "Văn hoá làm việc từ xa tại UNIWORK",
    excerpt: "Cách chúng tôi giữ cho 60 thành viên ở 3 thành phố luôn đồng bộ, gắn kết và làm việc hiệu quả.",
    author: "Trần Quang Minh",
    seed: "quang-minh",
    time: "5 phút đọc",
    date: "28/04/2026",
  },
];

function BlogPage() {
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

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {categories.map((c, i) => (
              <button
                key={c}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${i === 0 ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted-foreground hover:text-foreground"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Tìm bài viết…"
              className="w-64 rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Featured */}
        <Link
          to="/blog/$slug"
          params={{ slug: featured.slug }}
          className="mt-8 grid gap-6 overflow-hidden rounded-2xl border border-border bg-surface p-6 transition-all hover:shadow-2xl hover:shadow-primary/10 lg:grid-cols-2 lg:p-8"
        >
          <div className="aspect-[16/10] rounded-xl bg-gradient-to-br from-primary/40 via-violet-500/30 to-sky-500/20" />
          <div className="flex flex-col justify-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">{featured.cat}</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{featured.title}</h2>
            <p className="mt-3 text-muted-foreground">{featured.excerpt}</p>
            <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
              <img src={avatar(featured.seed)} className="h-7 w-7 rounded-full" alt="" />
              <span className="font-medium text-foreground">{featured.author}</span>
              <span>·</span>
              <span>{featured.date}</span>
              <span>·</span>
              <Clock className="h-3 w-3" />
              <span>{featured.time}</span>
            </div>
            <div className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Đọc tiếp <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </Link>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link
              key={p.slug}
              to="/blog/$slug"
              params={{ slug: p.slug }}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all hover:shadow-xl hover:shadow-primary/5"
            >
              <div className="aspect-[16/10] bg-gradient-to-br from-primary/30 via-violet-500/20 to-sky-500/10" />
              <div className="flex flex-1 flex-col p-5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">{p.cat}</span>
                <h3 className="mt-2 text-base font-semibold leading-snug group-hover:text-primary">{p.title}</h3>
                <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">{p.excerpt}</p>
                <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <img src={avatar(p.seed)} className="h-5 w-5 rounded-full" alt="" />
                  <span>{p.author}</span>
                  <span>·</span>
                  <span>{p.date}</span>
                  <span>·</span>
                  <span>{p.time}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 flex items-center justify-center">
          <button className="rounded-lg border border-border bg-surface px-5 py-2.5 text-sm hover:bg-surface-2">
            Xem thêm bài viết
          </button>
        </div>
      </section>
    </PublicShell>
  );
}