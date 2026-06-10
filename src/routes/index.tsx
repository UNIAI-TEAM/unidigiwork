import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles, MessageSquare, Video, FileText, BookOpen, Workflow, Bot,
  ShieldCheck, ArrowRight, Check, LogIn, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import shotMeeting from "@/assets/shot-meeting.png.asset.json";
import shotKnowledge from "@/assets/shot-knowledge.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UNIWORK — Digital Workplace Platform cho doanh nghiệp" },
      { name: "description", content: "Họp video, tài liệu, knowledge base và workflow trong một nền tảng duy nhất." },
      { property: "og:title", content: "UNIWORK — Digital Workplace Platform" },
      { property: "og:description", content: "Tất cả trong một nơi làm việc số: meeting, documents, knowledge, AI copilot." },
      { property: "og:url", content: "https://unidigiwork.lovable.app/" },
      { property: "og:image", content: shotKnowledge.url },
    ],
    links: [{ rel: "canonical", href: "https://unidigiwork.lovable.app/" }],
  }),
  component: Landing,
});

const features = [
  { icon: Video, title: "Meetings + AI Copilot", desc: "Họp video chất lượng cao kèm tóm tắt, action items tự động." },
  { icon: FileText, title: "Documents cộng tác", desc: "Tài liệu real-time theo workspace, phân quyền chặt chẽ." },
  { icon: BookOpen, title: "Knowledge Base", desc: "Trung tâm tri thức nội bộ với AI hỏi đáp & gợi ý." },
  { icon: MessageSquare, title: "Chat & kênh dự án", desc: "Trao đổi nhanh, gắn ngữ cảnh với task và tài liệu." },
  { icon: Workflow, title: "Workflows", desc: "Tự động hoá quy trình lặp đi lặp lại trong doanh nghiệp." },
  { icon: Bot, title: "AI Assistant", desc: "Trợ lý AI bảo mật, đặt nền trên dữ liệu doanh nghiệp." },
];

function Landing() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // If already signed in, jump straight to the app
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/documents" });
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Nhập email và mật khẩu"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Đăng nhập thành công");
    navigate({ to: "/documents" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">U</div>
            <div className="leading-tight">
              <div className="text-base font-bold tracking-wide">UNIWORK</div>
              <div className="text-[10px] text-muted-foreground">Digital Workplace Platform</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Tính năng</a>
            <a href="#preview" className="hover:text-foreground">Giao diện</a>
            <a href="#login" className="hover:text-foreground">Đăng nhập</a>
            <Link to="/meeting" className="hover:text-foreground">Demo Meeting</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline">Đăng ký</Link>
            <a href="#login" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <LogIn className="h-4 w-4" /> Đăng nhập
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,theme(colors.primary/20),transparent_60%)]" />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="flex flex-col justify-center">
            <span className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Nền tảng làm việc số cho doanh nghiệp Việt
            </span>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Một nơi làm việc số.<br />
              <span className="bg-gradient-to-r from-primary to-violet-400 bg-clip-text text-transparent">Cộng tác trọn vẹn.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              UNIWORK kết hợp meeting, documents, knowledge base, workflows và AI copilot — giúp đội ngũ của bạn vận hành nhanh hơn, minh bạch hơn.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#login" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Bắt đầu ngay <ArrowRight className="h-4 w-4" />
              </a>
              <Link to="/meeting" className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-3 text-sm hover:bg-surface-2">
                <Video className="h-4 w-4" /> Xem demo Meeting
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" /> Bảo mật doanh nghiệp</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" /> Hỗ trợ tiếng Việt</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" /> Triển khai trong ngày</span>
            </div>
          </div>

          {/* Inline login card */}
          <div id="login" className="flex items-center justify-center">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface/80 p-6 shadow-2xl shadow-primary/5 backdrop-blur">
              <h2 className="text-xl font-semibold">Đăng nhập vào UNIWORK</h2>
              <p className="mt-1 text-sm text-muted-foreground">Sử dụng email công ty của bạn.</p>
              <form onSubmit={handleLogin} className="mt-5 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@congty.vn"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Mật khẩu</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
                </div>
                <button type="submit" disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  Đăng nhập
                </button>
              </form>
              <div className="mt-4 text-center text-xs text-muted-foreground">
                Chưa có tài khoản? <Link to="/auth" className="text-primary hover:underline">Tạo tài khoản</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Preview screenshots */}
      <section id="preview" className="border-t border-border/60 bg-surface/30 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Trực quan. Quen thuộc. Mạnh mẽ.</h2>
            <p className="mt-3 text-muted-foreground">Ảnh chụp giao diện thật từ sản phẩm UNIWORK.</p>
          </div>

          <div className="mt-12 space-y-16">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  <Video className="h-3.5 w-3.5" /> Meetings
                </span>
                <h3 className="mt-3 text-2xl font-semibold">Meeting cùng AI Copilot</h3>
                <p className="mt-2 text-muted-foreground">
                  Sprint review, daily standup hay 1-on-1 — AI ghi chú, tóm tắt và sinh action items theo thời gian thực.
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-primary/10">
                <img src={shotMeeting.url} alt="UNIWORK Meeting với AI Copilot" className="w-full" loading="lazy" />
              </div>
            </div>

            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-primary/10 lg:order-first">
                <img src={shotKnowledge.url} alt="UNIWORK Knowledge Base" className="w-full" loading="lazy" />
              </div>
              <div className="lg:order-last">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-300">
                  <BookOpen className="h-3.5 w-3.5" /> Knowledge Base
                </span>
                <h3 className="mt-3 text-2xl font-semibold">Tri thức tập trung, AI trả lời ngay</h3>
                <p className="mt-2 text-muted-foreground">
                  Hỏi bất kỳ điều gì về dự án — UNIWORK tổng hợp từ tài liệu, cuộc họp, chat và con người trong tổ chức.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/60 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Mọi thứ team cần, trong một app</h2>
            <p className="mt-3 text-muted-foreground">Thay thế cho 5-7 công cụ rời rạc bằng một nền tảng duy nhất.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary/40">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/60 bg-gradient-to-br from-primary/15 via-violet-500/10 to-transparent py-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 text-center sm:px-6">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-bold sm:text-4xl">Sẵn sàng cho doanh nghiệp của bạn</h2>
          <p className="max-w-2xl text-muted-foreground">Hạ tầng bảo mật, phân quyền theo workspace, dữ liệu lưu tại Việt Nam.</p>
          <a href="#login" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Đăng nhập & dùng thử <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">U</div>
            <span className="font-semibold text-foreground">UNIWORK</span>
            <span>— Digital Workplace Platform</span>
          </div>
          <div>Unicom @2026</div>
        </div>
      </footer>
    </div>
  );
}