import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { PublicShell } from "@/components/public-shell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Điều khoản dịch vụ — UNIWORK" },
      { name: "description", content: "Điều khoản dịch vụ áp dụng khi bạn sử dụng nền tảng UNIWORK." },
      { property: "og:title", content: "Điều khoản dịch vụ — UNIWORK" },
      { property: "og:description", content: "Điều khoản pháp lý khi sử dụng UNIWORK." },
      { property: "og:url", content: "https://unidigiwork.lovable.app/terms" },
    ],
    links: [{ rel: "canonical", href: "https://unidigiwork.lovable.app/terms" }],
  }),
  component: TermsPage,
});

const sections = [
  {
    h: "1. Chấp nhận điều khoản",
    body: [
      "Bằng việc tạo tài khoản hoặc sử dụng UNIWORK, bạn xác nhận đã đọc, hiểu và đồng ý với các điều khoản này.",
      "Nếu bạn sử dụng dịch vụ thay mặt cho một tổ chức, bạn cam kết có thẩm quyền ràng buộc tổ chức đó với các điều khoản này.",
    ],
  },
  {
    h: "2. Tài khoản và bảo mật",
    body: [
      "Bạn chịu trách nhiệm bảo mật thông tin đăng nhập và toàn bộ hoạt động dưới tài khoản của mình.",
      "Thông báo cho UNIWORK ngay khi phát hiện truy cập trái phép qua security@uniwork.vn.",
    ],
  },
  {
    h: "3. Sử dụng được phép",
    body: [
      "Không sử dụng dịch vụ để vi phạm pháp luật, xâm phạm quyền sở hữu trí tuệ hoặc gây hại cho người khác.",
      "Không cố gắng tấn công, can thiệp hoặc gây gián đoạn hoạt động của UNIWORK và người dùng khác.",
      "Không thực hiện reverse-engineering hoặc khai thác lỗ hổng bảo mật ngoài chương trình bug bounty chính thức.",
    ],
  },
  {
    h: "4. Nội dung của khách hàng",
    body: [
      "Bạn giữ toàn bộ quyền sở hữu đối với dữ liệu và nội dung bạn đưa vào UNIWORK.",
      "Bạn cấp cho UNIWORK quyền sử dụng hạn chế, chỉ nhằm mục đích cung cấp dịch vụ theo hợp đồng.",
    ],
  },
  {
    h: "5. Thanh toán",
    body: [
      "Phí dịch vụ được tính theo gói đã chọn, thanh toán định kỳ tháng hoặc năm.",
      "Khoản phí đã thanh toán không được hoàn lại, trừ trường hợp UNIWORK chấm dứt dịch vụ ngoài lỗi của bạn.",
      "UNIWORK có thể điều chỉnh giá với thông báo trước ít nhất 30 ngày.",
    ],
  },
  {
    h: "6. Chấm dứt",
    body: [
      "Bạn có thể huỷ tài khoản bất cứ lúc nào trong Settings · Billing.",
      "UNIWORK có quyền đình chỉ hoặc chấm dứt tài khoản vi phạm các điều khoản này, với thông báo trước trừ trường hợp khẩn cấp về bảo mật.",
    ],
  },
  {
    h: "7. Tuyên bố từ chối trách nhiệm",
    body: [
      "Dịch vụ được cung cấp \"nguyên trạng\" và \"theo khả năng sẵn có\".",
      "UNIWORK không bảo đảm dịch vụ không gián đoạn hoặc hoàn toàn không có lỗi, dù chúng tôi nỗ lực duy trì SLA đã cam kết.",
    ],
  },
  {
    h: "8. Giới hạn trách nhiệm",
    body: [
      "Trong phạm vi tối đa pháp luật cho phép, trách nhiệm của UNIWORK không vượt quá tổng phí bạn đã thanh toán trong 12 tháng liền trước.",
    ],
  },
  {
    h: "9. Luật áp dụng",
    body: [
      "Điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Mọi tranh chấp được giải quyết tại Toà án có thẩm quyền tại Hà Nội.",
    ],
  },
];

function TermsPage() {
  return (
    <PublicShell>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <FileText className="h-3.5 w-3.5" /> Pháp lý
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Điều khoản dịch vụ</h1>
          <p className="mt-3 text-sm text-muted-foreground">Cập nhật lần cuối: 01/06/2026</p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <article className="prose prose-invert max-w-none">
          <p className="text-base text-muted-foreground">
            Các điều khoản dưới đây ("Điều khoản") áp dụng cho việc sử dụng nền
            tảng UNIWORK của Công ty Cổ phần Unicom ("UNIWORK", "chúng tôi"). Vui
            lòng đọc kỹ trước khi sử dụng dịch vụ.
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
            <h3 className="text-sm font-semibold">Liên hệ pháp lý</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Mọi câu hỏi về Điều khoản xin gửi về{" "}
              <a className="text-primary hover:underline" href="mailto:legal@uniwork.vn">
                legal@uniwork.vn
              </a>
              .
            </p>
          </div>
        </article>
      </section>
    </PublicShell>
  );
}