import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, MapPin, Phone, MessageSquare, Send, Building2, CheckCircle2 } from "lucide-react";
import { PublicShell } from "@/components/public-shell";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Liên hệ UNIWORK — Sẵn sàng hỗ trợ bạn" },
      { name: "description", content: "Liên hệ đội ngũ UNIWORK để được tư vấn triển khai, hỗ trợ kỹ thuật hoặc đặt lịch demo cho doanh nghiệp." },
      { property: "og:title", content: "Liên hệ UNIWORK" },
      { property: "og:description", content: "Đặt lịch demo hoặc gửi yêu cầu hỗ trợ — chúng tôi phản hồi trong 24 giờ." },
      { property: "og:url", content: "https://unidigiwork.lovable.app/contact" },
    ],
    links: [{ rel: "canonical", href: "https://unidigiwork.lovable.app/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [sent, setSent] = useState(false);
  return (
    <PublicShell active="contact">
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:py-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <MessageSquare className="h-3.5 w-3.5" /> Chúng tôi sẵn sàng lắng nghe
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            Liên hệ với UNIWORK
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Để lại lời nhắn và đội ngũ Customer Success sẽ phản hồi trong vòng 24 giờ làm việc.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-5">
            <ContactCard icon={Mail} title="Email" lines={["hello@uniwork.vn", "support@uniwork.vn"]} />
            <ContactCard icon={Phone} title="Điện thoại" lines={["+84 24 7300 1234", "T2–T6, 8:30 – 18:00"]} />
            <ContactCard
              icon={MapPin}
              title="Văn phòng Hà Nội"
              lines={["Tầng 12, toà nhà Unicom", "Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội"]}
            />
            <ContactCard
              icon={Building2}
              title="Văn phòng TP. HCM"
              lines={["Tầng 8, toà nhà Saigon Centre", "65 Lê Lợi, Quận 1, TP. HCM"]}
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-7">
            {sent ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <CheckCircle2 className="h-12 w-12 text-success" />
                <h2 className="text-xl font-semibold">Đã gửi yêu cầu</h2>
                <p className="text-sm text-muted-foreground">
                  Cảm ơn bạn. Chúng tôi sẽ liên hệ lại trong vòng 24 giờ làm việc.
                </p>
                <button onClick={() => setSent(false)} className="mt-2 text-sm text-primary hover:underline">
                  Gửi yêu cầu khác
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSent(true);
                }}
                className="space-y-4"
              >
                <h2 className="text-xl font-semibold">Gửi yêu cầu</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Họ và tên" placeholder="Nguyễn Văn A" />
                  <Input label="Công ty" placeholder="Công ty của bạn" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Email công việc" type="email" placeholder="ban@congty.vn" required />
                  <Input label="Số điện thoại" type="tel" placeholder="+84 ..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Quy mô đội ngũ</label>
                  <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
                    <option>Dưới 10 người</option>
                    <option>10 – 50 người</option>
                    <option>50 – 200 người</option>
                    <option>200 – 1000 người</option>
                    <option>Trên 1000 người</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nội dung</label>
                  <textarea
                    rows={5}
                    placeholder="Hãy cho chúng tôi biết bạn quan tâm điều gì…"
                    className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Send className="h-4 w-4" /> Gửi yêu cầu
                </button>
                <p className="text-center text-xs text-muted-foreground">
                  Bằng việc gửi, bạn đồng ý với Chính sách bảo mật của UNIWORK.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function ContactCard({
  icon: Icon,
  title,
  lines,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  lines: string[];
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {lines.map((l, i) => (
          <div key={i} className="text-sm text-muted-foreground">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function Input({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
      />
    </div>
  );
}