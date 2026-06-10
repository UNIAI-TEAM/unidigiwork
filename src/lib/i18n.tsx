import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Globe } from "lucide-react";

export type Lang = "vi" | "en";

const dict = {
  vi: {
    // nav
    "nav.dashboard": "Bảng điều khiển",
    "nav.chat": "Trò chuyện",
    "nav.meetings": "Họp",
    "nav.tasks": "Công việc & Dự án",
    "nav.documents": "Tài liệu",
    "nav.knowledge": "Kho tri thức",
    "nav.workflows": "Quy trình",
    "nav.people": "Nhân sự",
    "nav.reports": "Báo cáo",
    "nav.ai": "Trợ lý AI",
    "nav.workspaces": "Không gian làm việc",
    "nav.more": "Thêm",
    "nav.live": "Trực tiếp",
    "topbar.search.docs": "Tìm tài liệu, tri thức, người dùng… (Ctrl + K)",
    "topbar.search": "Tìm kiếm…",
    "topbar.new": "Mới",
    // landing
    "land.tagline": "Nền tảng làm việc số cho doanh nghiệp Việt",
    "land.h1.a": "Một nơi làm việc số.",
    "land.h1.b": "Cộng tác trọn vẹn.",
    "land.sub": "UNIWORK kết hợp meeting, tài liệu, kho tri thức, quy trình và AI copilot — giúp đội ngũ của bạn vận hành nhanh hơn, minh bạch hơn.",
    "land.cta.start": "Bắt đầu ngay",
    "land.cta.demo": "Xem demo Meeting",
    "land.bullet.security": "Bảo mật doanh nghiệp",
    "land.bullet.vi": "Hỗ trợ tiếng Việt",
    "land.bullet.deploy": "Triển khai trong ngày",
    "land.login.title": "Đăng nhập vào UNIWORK",
    "land.login.sub": "Sử dụng email công ty của bạn.",
    "land.email": "Email",
    "land.password": "Mật khẩu",
    "land.signin": "Đăng nhập",
    "land.no.account": "Chưa có tài khoản?",
    "land.create.account": "Tạo tài khoản",
    "land.nav.features": "Tính năng",
    "land.nav.preview": "Giao diện",
    "land.nav.login": "Đăng nhập",
    "land.nav.demo": "Demo Meeting",
    "land.nav.signup": "Đăng ký",
    "land.preview.title": "Trực quan. Quen thuộc. Mạnh mẽ.",
    "land.preview.sub": "Ảnh chụp giao diện thật từ sản phẩm UNIWORK.",
    "land.preview.meet.tag": "Họp",
    "land.preview.meet.h": "Meeting cùng AI Copilot",
    "land.preview.meet.p": "Sprint review, daily standup hay 1-on-1 — AI ghi chú, tóm tắt và sinh action items theo thời gian thực.",
    "land.preview.kb.tag": "Kho tri thức",
    "land.preview.kb.h": "Tri thức tập trung, AI trả lời ngay",
    "land.preview.kb.p": "Hỏi bất kỳ điều gì về dự án — UNIWORK tổng hợp từ tài liệu, cuộc họp, chat và con người trong tổ chức.",
    "land.feat.title": "Mọi thứ team cần, trong một app",
    "land.feat.sub": "Thay thế cho 5-7 công cụ rời rạc bằng một nền tảng duy nhất.",
    "land.feat.meet.t": "Họp + AI Copilot",
    "land.feat.meet.d": "Họp video chất lượng cao kèm tóm tắt, action items tự động.",
    "land.feat.docs.t": "Tài liệu cộng tác",
    "land.feat.docs.d": "Tài liệu real-time theo workspace, phân quyền chặt chẽ.",
    "land.feat.kb.t": "Kho tri thức",
    "land.feat.kb.d": "Trung tâm tri thức nội bộ với AI hỏi đáp & gợi ý.",
    "land.feat.chat.t": "Chat & kênh dự án",
    "land.feat.chat.d": "Trao đổi nhanh, gắn ngữ cảnh với task và tài liệu.",
    "land.feat.flow.t": "Quy trình",
    "land.feat.flow.d": "Tự động hoá quy trình lặp đi lặp lại trong doanh nghiệp.",
    "land.feat.ai.t": "Trợ lý AI",
    "land.feat.ai.d": "Trợ lý AI bảo mật, đặt nền trên dữ liệu doanh nghiệp.",
    "land.cta2.h": "Sẵn sàng cho doanh nghiệp của bạn",
    "land.cta2.p": "Hạ tầng bảo mật, phân quyền theo workspace, dữ liệu lưu tại Việt Nam.",
    "land.cta2.btn": "Đăng nhập & dùng thử",
  },
  en: {
    "nav.dashboard": "Dashboard",
    "nav.chat": "Chat",
    "nav.meetings": "Meetings",
    "nav.tasks": "Tasks & Projects",
    "nav.documents": "Documents",
    "nav.knowledge": "Knowledge Base",
    "nav.workflows": "Workflows",
    "nav.people": "People",
    "nav.reports": "Reports",
    "nav.ai": "AI Assistant",
    "nav.workspaces": "Workspaces",
    "nav.more": "More",
    "nav.live": "Live",
    "topbar.search.docs": "Search documents, knowledge, people… (Ctrl + K)",
    "topbar.search": "Search…",
    "topbar.new": "New",
    "land.tagline": "Digital workplace platform for modern teams",
    "land.h1.a": "One digital workplace.",
    "land.h1.b": "Complete collaboration.",
    "land.sub": "UNIWORK unifies meetings, documents, knowledge base, workflows and an AI copilot — so your team ships faster, with full transparency.",
    "land.cta.start": "Get started",
    "land.cta.demo": "See Meeting demo",
    "land.bullet.security": "Enterprise security",
    "land.bullet.vi": "Vietnamese support",
    "land.bullet.deploy": "Deploy in a day",
    "land.login.title": "Sign in to UNIWORK",
    "land.login.sub": "Use your company email.",
    "land.email": "Email",
    "land.password": "Password",
    "land.signin": "Sign in",
    "land.no.account": "No account yet?",
    "land.create.account": "Create one",
    "land.nav.features": "Features",
    "land.nav.preview": "Preview",
    "land.nav.login": "Sign in",
    "land.nav.demo": "Meeting demo",
    "land.nav.signup": "Sign up",
    "land.preview.title": "Intuitive. Familiar. Powerful.",
    "land.preview.sub": "Real screenshots from the UNIWORK product.",
    "land.preview.meet.tag": "Meetings",
    "land.preview.meet.h": "Meetings with AI Copilot",
    "land.preview.meet.p": "Sprint review, daily standup or 1-on-1 — AI takes notes, summarizes and generates action items in real time.",
    "land.preview.kb.tag": "Knowledge Base",
    "land.preview.kb.h": "Central knowledge, instant AI answers",
    "land.preview.kb.p": "Ask anything about your project — UNIWORK synthesises from docs, meetings, chats and people in your org.",
    "land.feat.title": "Everything your team needs, in one app",
    "land.feat.sub": "Replace 5–7 disconnected tools with a single platform.",
    "land.feat.meet.t": "Meetings + AI Copilot",
    "land.feat.meet.d": "High-quality video meetings with automatic summaries and action items.",
    "land.feat.docs.t": "Collaborative docs",
    "land.feat.docs.d": "Real-time documents scoped to workspaces with fine-grained permissions.",
    "land.feat.kb.t": "Knowledge Base",
    "land.feat.kb.d": "Internal knowledge hub with AI Q&A and suggestions.",
    "land.feat.chat.t": "Chat & project channels",
    "land.feat.chat.d": "Quick conversations linked to tasks and documents.",
    "land.feat.flow.t": "Workflows",
    "land.feat.flow.d": "Automate repeatable business processes.",
    "land.feat.ai.t": "AI Assistant",
    "land.feat.ai.d": "Secure AI assistant grounded on your company data.",
    "land.cta2.h": "Ready for your enterprise",
    "land.cta2.p": "Secure infrastructure, workspace-scoped permissions, data hosted in Vietnam.",
    "land.cta2.btn": "Sign in & try it",
  },
} as const;

type Key = keyof (typeof dict)["vi"];
const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({
  lang: "vi",
  setLang: () => {},
  t: (k) => k as string,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("vi");

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("uniwork-lang")) as Lang | null;
    if (saved === "vi" || saved === "en") setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("uniwork-lang", l); } catch {}
    if (typeof document !== "undefined") document.documentElement.lang = l;
  };

  const t = (k: Key) => (dict[lang] as Record<string, string>)[k] ?? (dict.vi as Record<string, string>)[k] ?? k;

  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export const useI18n = () => useContext(LangCtx);

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <button
      onClick={() => setLang(lang === "vi" ? "en" : "vi")}
      aria-label="Toggle language"
      title={lang === "vi" ? "Switch to English" : "Chuyển sang Tiếng Việt"}
      className={`flex items-center gap-1 rounded-lg p-2 text-xs font-medium uppercase text-muted-foreground hover:bg-surface-2 hover:text-foreground ${className}`}
    >
      <Globe className="h-4 w-4" />
      {lang === "vi" ? "VI" : "EN"}
    </button>
  );
}