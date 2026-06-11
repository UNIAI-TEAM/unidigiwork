import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/public-shell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Chính sách bảo mật — UNIWORK" },
      { name: "description", content: "Chính sách bảo mật của UNIWORK: cách chúng tôi thu thập, sử dụng và bảo vệ dữ liệu của khách hàng." },
      { property: "og:title", content: "Chính sách bảo mật — UNIWORK" },
      { property: "og:description", content: "Cách UNIWORK thu thập, sử dụng và bảo vệ dữ liệu của khách hàng." },
      { property: "og:url", content: "https://unidigiwork.lovable.app/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://unidigiwork.lovable.app/privacy" }],
  }),
  component: PrivacyPage,
});

const sections = [
  {
    h: "1. Thông tin chúng tôi thu thập",
    body: [
      "Thông tin tài khoản: họ tên, email, số điện thoại, ảnh đại diện, vai trò trong tổ chức.",
      "Nội dung do bạn cung cấp: tài liệu, tin nhắn, file đính kèm, biên bản meeting và metadata liên quan.",
      "Dữ liệu sử dụng: nhật ký đăng nhập, sự kiện thao tác, thông tin thiết bị và trình duyệt phục vụ bảo mật và cải thiện sản phẩm.",
    ],
  },
  {
    h: "2. Mục đích sử dụng",
    body: [
      "Cung cấp, vận hành và cải tiến dịch vụ UNIWORK.",
      "Bảo mật tài khoản, phát hiện gian lận và phòng chống lạm dụng.",
      "Giao tiếp với khách hàng về thay đổi quan trọng, hoá đơn và hỗ trợ kỹ thuật.",
      "Thực hiện nghĩa vụ pháp lý tại Việt Nam và quốc gia khách hàng đang vận hành.",
    ],
  },
  {
    h: "3. Chia sẻ dữ liệu",
    body: [
      "UNIWORK không bán dữ liệu khách hàng cho bên thứ ba.",
      "Chúng tôi chỉ chia sẻ dữ liệu với nhà cung cấp hạ tầng (lưu trữ, email, thanh toán) trên cơ sở hợp đồng xử lý dữ liệu (DPA) chặt chẽ.",
      "Chia sẻ với cơ quan nhà nước có thẩm quyền khi có yêu cầu hợp pháp bằng văn bản.",
    ],
  },
  {
    h: "4. Lưu trữ và bảo mật",
    body: [
      "Dữ liệu mặc định lưu tại trung tâm dữ liệu Tier-3 ở Hà Nội và TP. Hồ Chí Minh, mã hoá khi nghỉ (AES-256) và khi truyền (TLS 1.2+).",
      "Truy cập nội bộ tuân thủ nguyên tắc least-privilege, có audit log và xác thực đa yếu tố.",
      "Khách hàng Enterprise có thể yêu cầu triển khai on-premise hoặc private cloud.",
    ],
  },
  {
    h: "5. Quyền của bạn",
    body: [
      "Truy cập, sửa, xuất hoặc xoá dữ liệu cá nhân bất kỳ lúc nào trong Settings · Privacy.",
      "Khiếu nại tới Data Protection Officer của UNIWORK qua email dpo@uniwork.vn.",
      "Rút lại sự đồng ý đối với các xử lý dựa trên cơ sở đồng thuận.",
    ],
  },
  {
    h: "6. Lưu trữ và xoá",
    body: [
      "Dữ liệu của tổ chức được giữ trong suốt thời gian hợp đồng còn hiệu lực.",
      "Sau khi hợp đồng kết thúc, dữ liệu được xoá vĩnh viễn trong vòng 30 ngày trừ khi có yêu cầu khác bằng văn bản.",
    ],
  },
  {
    h: "7. Thay đổi chính sách",
    body: [
      "Chính sách này có thể được cập nhật để phản ánh thay đổi pháp luật hoặc dịch vụ. Mọi thay đổi đáng kể sẽ được thông báo qua email và trong sản phẩm trước ít nhất 30 ngày.",
    ],
  },
];

function PrivacyPage() {
  return (
    <PublicShell>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Pháp lý
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Chính sách bảo mật</h1>
          <p className="mt-3 text-sm text-muted-foreground">Cập nhật lần cuối: 01/06/2026</p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <article className="prose prose-invert max-w-none">
          <p className="text-base text-muted-foreground">
            UNIWORK ("chúng tôi") cam kết bảo vệ dữ liệu cá nhân của bạn. Chính
            sách này mô tả cách chúng tôi thu thập, sử dụng và bảo vệ thông tin
            khi bạn sử dụng nền tảng UNIWORK.
          </p>
          {sections.map((s) => (
            <section key={s.h} className="mt-8">
              <h2 className="text-xl font-semibold">{s.h}</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {s.body.map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>
            </section>
          ))}

          <div className="mt-10 rounded-2xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold">Liên hệ DPO</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Mọi yêu cầu liên quan đến quyền dữ liệu cá nhân xin gửi về{" "}
              <a className="text-primary hover:underline" href="mailto:dpo@uniwork.vn">
                dpo@uniwork.vn
              </a>
              . Chúng tôi sẽ phản hồi trong vòng 15 ngày làm việc.
            </p>
          </div>
        </article>
      </section>
    </PublicShell>
  );
}