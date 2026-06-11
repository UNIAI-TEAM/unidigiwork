import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Sparkles, Building2, Rocket, ArrowRight } from "lucide-react";
import { PublicShell } from "@/components/public-shell";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Bảng giá — UNIWORK" },
      { name: "description", content: "Bảng giá UNIWORK: Starter, Business và Enterprise. Tính theo số nhân sự, có dùng thử miễn phí 14 ngày." },
      { property: "og:title", content: "Bảng giá — UNIWORK" },
      { property: "og:description", content: "Ba gói linh hoạt cho mọi quy mô. Dùng thử miễn phí 14 ngày." },
      { property: "og:url", content: "https://unidigiwork.lovable.app/pricing" },
    ],
    links: [{ rel: "canonical", href: "https://unidigiwork.lovable.app/pricing" }],
  }),
  component: PricingPage,
});

const plans = [
  {
    name: "Starter",
    icon: Sparkles,
    price: "Miễn phí",
    period: "",
    desc: "Cho đội nhóm dưới 10 người bắt đầu thử nghiệm.",
    cta: "Bắt đầu miễn phí",
    highlight: false,
    features: [
      "Tối đa 10 nhân sự",
      "5 GB lưu trữ",
      "Chat, tài liệu, meeting cơ bản",
      "1 workspace",
      "Hỗ trợ qua email",
    ],
  },
  {
    name: "Business",
    icon: Rocket,
    price: "120.000đ",
    period: "/ người / tháng",
    desc: "Cho doanh nghiệp vận hành toàn diện trên UNIWORK.",
    cta: "Dùng thử 14 ngày",
    highlight: true,
    features: [
      "Không giới hạn nhân sự",
      "1 TB lưu trữ / người",
      "AI Copilot cho Meeting & Document",
      "Workflow tự động hoá",
      "SSO Google / Microsoft",
      "Báo cáo & analytics",
      "Hỗ trợ ưu tiên 8×5",
    ],
  },
  {
    name: "Enterprise",
    icon: Building2,
    price: "Liên hệ",
    period: "",
    desc: "Triển khai riêng, tuỳ chỉnh sâu cho tập đoàn lớn.",
    cta: "Đặt lịch demo",
    highlight: false,
    features: [
      "Tất cả tính năng Business",
      "On-premise hoặc private cloud",
      "SSO SAML / OIDC, AD",
      "SLA 99.95% & 24×7",
      "Audit log & DLP",
      "Customer Success Manager",
    ],
  },
];

function PricingPage() {
  return (
    <PublicShell active="pricing">
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:py-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Bảng giá minh bạch
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            Giá hợp lý cho mọi quy mô đội ngũ
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Bắt đầu miễn phí, nâng cấp khi đội ngũ phát triển. Hợp đồng linh hoạt
            theo tháng hoặc năm, có hoá đơn VAT đầy đủ.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-2xl border p-7 ${p.highlight ? "border-primary bg-gradient-to-b from-primary/10 to-transparent shadow-2xl shadow-primary/10" : "border-border bg-surface"}`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                  Phổ biến nhất
                </span>
              )}
              <div className="flex items-center gap-2">
                <p.icon className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">{p.name}</h3>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">{p.price}</span>
                {p.period && <span className="text-sm text-muted-foreground">{p.period}</span>}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/contact"
                className={`mt-7 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${p.highlight ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border bg-surface-2 hover:bg-surface-3"}`}
              >
                {p.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border/60 bg-surface/30 py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Câu hỏi thường gặp</h2>
          <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-surface">
            {[
              {
                q: "UNIWORK có dùng thử miễn phí không?",
                a: "Có. Mọi gói Business đều có 14 ngày dùng thử đầy đủ tính năng, không cần thẻ thanh toán.",
              },
              {
                q: "Có thể nâng cấp / hạ cấp gói bất cứ lúc nào?",
                a: "Có. Bạn có thể đổi gói trong Settings · Billing, chi phí được tính tỷ lệ theo ngày sử dụng.",
              },
              {
                q: "Dữ liệu của tôi được lưu ở đâu?",
                a: "Mặc định lưu tại trung tâm dữ liệu Tier-3 ở Hà Nội và TP. HCM. Gói Enterprise hỗ trợ on-premise.",
              },
              {
                q: "Có hỗ trợ xuất hoá đơn VAT không?",
                a: "Có. UNIWORK phát hành hoá đơn điện tử theo Thông tư 78 ngay sau khi thanh toán.",
              },
            ].map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="flex cursor-pointer items-center justify-between text-sm font-medium">
                  {f.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}