import { createFileRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  LifeBuoy,
  Search,
  BookOpen,
  Video,
  MessageCircle,
  Mail,
  Phone,
  Sparkles,
  Rocket,
  Users,
  Workflow,
  FileText,
  ShieldCheck,
  Settings as SettingsIcon,
  ChevronRight,
  ArrowRight,
  ExternalLink,
  PlayCircle,
  Star,
  Send,
  Bot,
  ThumbsUp,
  ThumbsDown,
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Hash,
  Keyboard,
  Download,
  Github,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({
    meta: [
      { title: "Trợ giúp & Hỗ trợ — UNIWORK" },
      {
        name: "description",
        content:
          "Trung tâm trợ giúp UNIWORK: hướng dẫn bắt đầu, tài liệu, video, phím tắt, hỗ trợ trực tiếp và trạng thái hệ thống.",
      },
    ],
  }),
  component: HelpPage,
});

type Cat =
  | "all"
  | "start"
  | "chat"
  | "meeting"
  | "tasks"
  | "documents"
  | "workflow"
  | "admin"
  | "security";

const CATS: { key: Cat; label: string; icon: LucideIcon; tint: string }[] = [
  { key: "all", label: "Tất cả chủ đề", icon: BookOpen, tint: "text-foreground" },
  { key: "start", label: "Bắt đầu nhanh", icon: Rocket, tint: "text-primary" },
  { key: "chat", label: "Chat & Cộng tác", icon: MessageCircle, tint: "text-violet-300" },
  { key: "meeting", label: "Họp trực tuyến", icon: Video, tint: "text-rose-300" },
  { key: "tasks", label: "Nhiệm vụ & Dự án", icon: CheckCircle2, tint: "text-emerald-300" },
  { key: "documents", label: "Tài liệu & Kho tri thức", icon: FileText, tint: "text-sky-300" },
  { key: "workflow", label: "Quy trình & Phê duyệt", icon: Workflow, tint: "text-amber-300" },
  { key: "admin", label: "Quản trị workspace", icon: Users, tint: "text-orange-300" },
  { key: "security", label: "Bảo mật & Tài khoản", icon: ShieldCheck, tint: "text-primary" },
];

type Article = {
  id: string;
  slug: string;
  cat: Exclude<Cat, "all">;
  title: string;
  desc: string;
  time: string;
  level: "Cơ bản" | "Nâng cao";
  popular: boolean;
};

const CAT_KEYS: Exclude<Cat, "all">[] = [
  "start",
  "chat",
  "meeting",
  "tasks",
  "documents",
  "workflow",
  "admin",
  "security",
];

function toArticle(a: KnowledgeArticleDTO): Article {
  const tags = a.tags ?? [];
  const cat = (CAT_KEYS as string[]).includes(a.category)
    ? (a.category as Exclude<Cat, "all">)
    : "start";
  const time = tags.find((t) => /phút đọc/i.test(t)) ?? "3 phút đọc";
  const level = tags.includes("Nâng cao") ? "Nâng cao" : "Cơ bản";
  return {
    id: a.id,
    slug: a.slug,
    cat,
    title: a.title,
    desc: a.summary,
    time,
    level,
    popular: tags.includes("popular"),
  };
}

const QUICK_LINKS = [
  {
    icon: Rocket,
    label: "Bắt đầu nhanh",
    desc: "Thiết lập tài khoản trong 5 phút",
    color: "text-primary",
  },
  { icon: Video, label: "Video hướng dẫn", desc: "32 video đa ngôn ngữ", color: "text-rose-300" },
  {
    icon: Keyboard,
    label: "Phím tắt",
    desc: "Tăng tốc thao tác hằng ngày",
    color: "text-amber-300",
  },
  {
    icon: Download,
    label: "Ứng dụng & API",
    desc: "Desktop, Mobile, REST/Webhook",
    color: "text-emerald-300",
  },
];

const STATUS = [
  { name: "Chat & Tin nhắn", state: "ok" as const, latency: "42 ms" },
  { name: "Họp trực tuyến", state: "ok" as const, latency: "118 ms" },
  { name: "Tài liệu & Cộng tác", state: "ok" as const, latency: "65 ms" },
  { name: "Trợ lý AI", state: "warn" as const, latency: "Chậm 1.2s" },
  { name: "Tích hợp Email", state: "ok" as const, latency: "210 ms" },
];

function HelpPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cat, setCat] = useState<Cat>("all");
  const [q, setQ] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const filtered = useMemo(() => {
    return ARTICLES.filter((a) => {
      if (cat !== "all" && a.cat !== cat) return false;
      if (q && !`${a.title} ${a.desc}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [cat, q]);

  const popular = ARTICLES.filter((a) => a.popular);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/15 via-surface to-background">
          <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]">
            <div className="absolute -top-24 left-1/3 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -bottom-16 right-10 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
          </div>
          <div className="relative mx-auto w-full max-w-5xl px-4 py-12 text-center sm:px-6 sm:py-16">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <LifeBuoy className="h-3.5 w-3.5 text-primary" />
              Trung tâm trợ giúp UNIWORK
              <span className="rounded-full bg-success/20 px-1.5 py-0.5 text-[10px] font-medium text-success">
                v2.4
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Chúng tôi có thể giúp gì cho bạn?
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              Hơn 240 bài hướng dẫn, video và mẹo sử dụng. Hỏi trợ lý AI hoặc liên hệ đội ngũ hỗ trợ
              24/7 bằng tiếng Việt và tiếng Anh.
            </p>

            <div className="relative mx-auto mt-6 max-w-2xl">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo chủ đề, lỗi hoặc câu hỏi… (vd: bật 2FA, ghi âm cuộc họp)"
                className="w-full rounded-2xl border border-border bg-surface py-3.5 pl-11 pr-28 text-sm shadow-lg shadow-black/20 placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] text-muted-foreground sm:inline-flex">
                <span>⌘</span>
                <span>K</span>
              </kbd>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>Phổ biến:</span>
              {["Bật 2FA", "Ghi âm họp", "Tạo workflow", "Mời thành viên", "API token"].map((p) => (
                <button
                  key={p}
                  onClick={() => setQ(p)}
                  className="rounded-full border border-border bg-surface/60 px-2.5 py-1 hover:border-primary/40 hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[260px_1fr_300px]">
          {/* Left: categories */}
          <aside className="space-y-4">
            <nav className="rounded-2xl border border-border bg-surface p-2">
              <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Chủ đề
              </div>
              {CATS.map((c) => {
                const count =
                  c.key === "all"
                    ? ARTICLES.length
                    : ARTICLES.filter((a) => a.cat === c.key).length;
                const active = cat === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => setCat(c.key)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
                  >
                    <c.icon className={`h-4 w-4 ${c.tint}`} />
                    <span className="flex-1 text-left">{c.label}</span>
                    <span
                      className={`rounded-full px-1.5 text-[11px] ${active ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-violet-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> UNIWORK Academy
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Khoá học miễn phí 4 tuần, cấp chứng chỉ Digital Workplace Specialist.
              </p>
              <button className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                Đăng ký miễn phí <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </aside>

          {/* Middle: content */}
          <section className="min-w-0 space-y-6">
            {/* Quick links */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {QUICK_LINKS.map((q) => (
                <button
                  key={q.label}
                  className="group rounded-2xl border border-border bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                >
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 ${q.color}`}
                  >
                    <q.icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="mt-2.5 text-sm font-semibold">{q.label}</div>
                  <div className="text-[11px] text-muted-foreground">{q.desc}</div>
                  <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              ))}
            </div>

            {/* Popular */}
            {cat === "all" && !q && (
              <div className="rounded-2xl border border-border bg-surface">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Star className="h-4 w-4 text-amber-300" /> Bài viết phổ biến
                  </div>
                  <button className="text-xs text-primary hover:underline">Xem tất cả</button>
                </div>
                <div className="divide-y divide-border">
                  {popular.map((a) => {
                    const meta = CATS.find((c) => c.key === a.cat)!;
                    return (
                      <button
                        key={a.id}
                        className="group flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/50"
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 ${meta.tint}`}
                        >
                          <meta.icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium group-hover:text-primary">
                            {a.title}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{a.desc}</div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" /> {a.time}
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                            <Hash className="h-3 w-3" /> {meta.label}
                          </div>
                        </div>
                        <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Articles list */}
            <div className="rounded-2xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="text-sm font-semibold">
                  {cat === "all" ? "Tất cả bài viết" : CATS.find((c) => c.key === cat)?.label}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {filtered.length} kết quả
                  </span>
                </div>
                <select className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-muted-foreground focus:outline-none">
                  <option>Liên quan nhất</option>
                  <option>Mới nhất</option>
                  <option>Phổ biến</option>
                </select>
              </div>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
                    <Search className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-medium">Không tìm thấy bài viết</div>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Thử từ khóa khác hoặc hỏi trợ lý AI bên phải
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map((a) => {
                    const meta = CATS.find((c) => c.key === a.cat)!;
                    return (
                      <button
                        key={a.id}
                        className="group flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-2/50"
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 ${meta.tint}`}
                        >
                          <meta.icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-medium group-hover:text-primary">
                              {a.title}
                            </div>
                            {a.popular && (
                              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                                Phổ biến
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {a.desc}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {a.time}
                            </span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                            <span
                              className={`rounded px-1.5 py-0.5 ${a.level === "Cơ bản" ? "bg-emerald-500/15 text-emerald-300" : "bg-violet-500/15 text-violet-300"}`}
                            >
                              {a.level}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Video tutorials */}
            <div className="rounded-2xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Video className="h-4 w-4 text-rose-300" /> Video hướng dẫn
                </div>
                <button className="text-xs text-primary hover:underline">Thư viện đầy đủ</button>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                {[
                  {
                    t: "Tour UNIWORK trong 2 phút",
                    d: "02:14",
                    g: "from-primary/30 to-violet-500/30",
                  },
                  {
                    t: "Thiết lập quy trình phê duyệt",
                    d: "06:48",
                    g: "from-emerald-500/30 to-sky-500/30",
                  },
                  { t: "Trợ lý AI và lệnh tắt", d: "04:32", g: "from-amber-500/30 to-rose-500/30" },
                ].map((v) => (
                  <button
                    key={v.t}
                    className="group overflow-hidden rounded-xl border border-border bg-surface-2 text-left transition-transform hover:-translate-y-0.5"
                  >
                    <div className={`relative aspect-video bg-gradient-to-br ${v.g}`}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-transform group-hover:scale-110">
                          <PlayCircle className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                      <span className="absolute bottom-2 right-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-mono">
                        {v.d}
                      </span>
                    </div>
                    <div className="p-3 text-sm font-medium">{v.t}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* FAQ */}
            <div className="rounded-2xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="text-sm font-semibold">Câu hỏi thường gặp</div>
                <span className="text-xs text-muted-foreground">{FAQS.length} câu hỏi</span>
              </div>
              <div className="divide-y divide-border">
                {FAQS.map((f, i) => {
                  const open = openFaq === i;
                  return (
                    <div key={f.q}>
                      <button
                        onClick={() => setOpenFaq(open ? null : i)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/50"
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${open ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
                        >
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm font-medium">{f.q}</span>
                        <ChevronRight
                          className={`mt-1 h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90 text-primary" : ""}`}
                        />
                      </button>
                      {open && (
                        <div className="px-4 pb-4 pl-12 text-sm text-muted-foreground">
                          <p>{f.a}</p>
                          <div className="mt-3 flex items-center gap-3 text-xs">
                            <span className="text-muted-foreground">
                              Câu trả lời này có hữu ích?
                            </span>
                            <button className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 hover:border-primary/40 hover:text-foreground">
                              <ThumbsUp className="h-3 w-3" /> Có
                            </button>
                            <button className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 hover:border-destructive/40 hover:text-destructive">
                              <ThumbsDown className="h-3 w-3" /> Không
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Contact options */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: MessageCircle,
                  t: "Chat hỗ trợ",
                  d: "Phản hồi trung bình 2 phút",
                  a: "Bắt đầu chat",
                  c: "text-primary",
                },
                {
                  icon: Mail,
                  t: "Email",
                  d: "support@uniwork.vn",
                  a: "Gửi email",
                  c: "text-sky-300",
                },
                {
                  icon: Phone,
                  t: "Hotline 24/7",
                  d: "1900 6996 (Việt Nam)",
                  a: "Gọi ngay",
                  c: "text-emerald-300",
                },
              ].map((x) => (
                <div key={x.t} className="rounded-2xl border border-border bg-surface p-4">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 ${x.c}`}
                  >
                    <x.icon className="h-4 w-4" />
                  </div>
                  <div className="mt-3 text-sm font-semibold">{x.t}</div>
                  <div className="text-xs text-muted-foreground">{x.d}</div>
                  <button className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                    {x.a} <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Right: AI assistant + status */}
          <aside className="space-y-4">
            {/* AI assistant */}
            <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-surface to-background">
              <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Bot className="h-4 w-4" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-surface bg-success" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">Trợ lý UNIWORK</div>
                  <div className="text-[11px] text-success">Trực tuyến · phản hồi tức thì</div>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="rounded-xl rounded-tl-sm bg-surface-2 p-3 text-sm">
                  Xin chào! Mình có thể giúp bạn tìm bài viết, giải thích tính năng hoặc tạo ticket
                  hỗ trợ. Bạn cần gì hôm nay?
                </div>
                <div className="space-y-2">
                  {[
                    "Cách bật xác thực 2 lớp?",
                    "Tạo quy trình phê duyệt nghỉ phép",
                    "Liên hệ chuyên gia triển khai",
                  ].map((s) => (
                    <button
                      key={s}
                      className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs hover:border-primary/40 hover:text-foreground"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> {s}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <input
                    placeholder="Nhập câu hỏi…"
                    className="w-full rounded-xl border border-border bg-surface py-2.5 pl-3 pr-10 text-sm placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* System status */}
            <div className="rounded-2xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="h-4 w-4 text-success" /> Trạng thái hệ thống
                </div>
                <a
                  href="#"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  status.uniwork.vn <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <ul className="divide-y divide-border text-sm">
                {STATUS.map((s) => (
                  <li key={s.name} className="flex items-center justify-between px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      {s.state === "ok" ? (
                        <span className="h-2 w-2 rounded-full bg-success" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-300" />
                      )}
                      <span>{s.name}</span>
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{s.latency}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Specialist card */}
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <img
                  src={avatar("le-thanh-cs")}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/40"
                />
                <div>
                  <div className="text-sm font-semibold">Lê Thanh — CSM</div>
                  <div className="text-[11px] text-muted-foreground">
                    Chuyên gia triển khai của bạn
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Đặt lịch 1:1 để được hướng dẫn cấu hình workspace, đào tạo nhóm hoặc tích hợp hệ
                thống nội bộ.
              </p>
              <button className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs font-medium hover:bg-surface-2/70">
                Đặt lịch tư vấn <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Useful links */}
            <div className="rounded-2xl border border-border bg-surface p-2">
              {[
                { icon: SettingsIcon, label: "Cài đặt tài khoản", to: "/settings" },
                { icon: Github, label: "Changelog & Roadmap" },
                { icon: BookOpen, label: "Tài liệu API" },
              ].map((l) => (
                <a
                  key={l.label}
                  href="#"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
                  <l.icon className="h-4 w-4" /> <span className="flex-1">{l.label}</span>{" "}
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                </a>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
