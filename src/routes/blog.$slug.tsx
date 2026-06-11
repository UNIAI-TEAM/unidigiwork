import { createFileRoute, Link } from "@tanstack/react-router";
import { categorySlug } from "./blog";
import { ArrowLeft, Clock, BookOpen, ThumbsUp, MessageSquare, Share2, Bookmark, Tag } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { avatar } from "@/components/app-shell";

export const Route = createFileRoute("/blog/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${humanize(params.slug)} · Blog UNIWORK` },
      { name: "description", content: "Bài viết chi tiết trên Blog UNIWORK" },
      { property: "og:title", content: `${humanize(params.slug)} · Blog UNIWORK` },
      { property: "og:description", content: "Bài viết chi tiết trên Blog UNIWORK" },
      { property: "og:url", content: `https://unidigiwork.lovable.app/blog/${params.slug}` },
    ],
    links: [{ rel: "canonical", href: `https://unidigiwork.lovable.app/blog/${params.slug}` }],
  }),
  component: BlogDetailPage,
});

const allPosts = [
  {
    slug: "ra-mat-uniwork-meeting-copilot",
    cat: "Sản phẩm",
    title: "Ra mắt UNIWORK Meeting Copilot — biên bản tự động bằng tiếng Việt",
    excerpt:
      "Meeting Copilot ghi nhận, tóm tắt và sinh action items theo thời gian thực, hiểu sâu ngữ cảnh tiếng Việt từ giọng nói tự nhiên.",
    author: "Trần Quang Minh",
    seed: "quang-minh",
    time: "5 phút đọc",
    date: "08/06/2026",
  },
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

function BlogDetailPage() {
  const { slug } = Route.useParams();
  const post = allPosts.find((p) => p.slug === slug) ?? allPosts[0];
  const related = allPosts.filter((p) => p.slug !== slug).slice(0, 3);

  return (
    <PublicShell active="blog">
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <Link
          to="/blog"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại danh sách
        </Link>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
            <BookOpen className="h-3 w-3" />
            {post.cat}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {post.time}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Tag className="h-3 w-3" />
            UNIWORK
          </span>
        </div>

        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {post.title}
        </h1>

        <div className="mt-5 flex items-center justify-between border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <img src={avatar(post.seed)} className="h-10 w-10 rounded-full" alt="" />
            <div>
              <div className="text-sm font-medium">{post.author}</div>
              <div className="text-xs text-muted-foreground">
                {post.date} · cập nhật 2 ngày trước
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ActionBtn icon={ThumbsUp} label="124" />
            <ActionBtn icon={MessageSquare} label="18" />
            <ActionBtn icon={Bookmark} />
            <ActionBtn icon={Share2} />
          </div>
        </div>

        <div className="mt-8 aspect-[16/9] w-full rounded-2xl bg-gradient-to-br from-primary/30 via-violet-500/20 to-sky-500/10" />

        <div className="prose prose-invert mt-8 max-w-none">
          <p className="text-base leading-relaxed text-muted-foreground">
            {post.excerpt} Đây là nội dung mẫu cho bài viết chi tiết. Trong phiên bản đầy đủ,
            nội dung sẽ được lấy từ hệ thống quản lý bài viết và bao gồm đầy đủ hình ảnh,
            video cũng như các liên kết tham khảo.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-foreground">1. Bối cảnh và thách thức</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Mỗi doanh nghiệp đều đối mặt với những thách thức riêng trong việc quản lý thông tin,
            cộng tác nhóm và duy trì hiệu suất làm việc. UNIWORK được xây dựng để giải quyết
            chính xác những điểm đau này — từ việc tích hợp công cụ, tự động hóa quy trình
            đến hỗ trợ quyết định bằng AI.
          </p>

          <h2 className="mt-6 text-xl font-semibold text-foreground">2. Giải pháp cốt lõi</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Nền tảng cung cấp một bộ công cụ toàn diện: quản lý tài liệu thời gian thực,
            họp trực tuyến với AI Copilot, workflow tự động hóa và trung tâm tri thức.
            Mọi tính năng đều được thiết kế với trải nghiệm người dùng làm trọng tâm.
          </p>

          <blockquote className="mt-4 border-l-2 border-primary pl-4 text-sm italic text-muted-foreground">
            "Mục tiêu của chúng tôi là giảm 50% thời gian chuyển đổi giữa các công cụ
            và tăng 30% thời gian tập trung vào công việc có giá trị."
          </blockquote>

          <h2 className="mt-6 text-xl font-semibold text-foreground">3. Kết quả đạt được</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Sau 3 tháng triển khai, các khách hàng đầu tiên ghi nhận sự cải thiện rõ rệt
            trong tốc độ phê duyệt, chất lượng biên bản họp và khả năng theo dõi tiến độ dự án.
            Đội ngũ cũng đánh giá cao giao diện trực quan và khả năng tùy biến linh hoạt.
          </p>
        </div>

        <div className="mt-10 rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold">Bài viết liên quan</h3>
          <ul className="space-y-2 text-sm">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  to="/blog/$slug"
                  params={{ slug: r.slug }}
                  className="text-primary hover:underline"
                >
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </article>
    </PublicShell>
  );
}

function ActionBtn({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label?: string }) {
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
