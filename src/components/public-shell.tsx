import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-logo";
import { LogIn } from "lucide-react";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { ThemeToggle, ToneToggle } from "@/lib/theme";
import type { ReactNode } from "react";

export function PublicShell({ children, active }: { children: ReactNode; active?: PublicNav }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader active={active} />
      {children}
      <PublicFooter />
    </div>
  );
}

export type PublicNav = "pricing" | "about" | "contact" | "blog";

function PublicHeader({ active }: { active?: PublicNav }) {
  const { t } = useI18n();
  const items: { key: PublicNav; label: string; to: string }[] = [
    { key: "pricing", label: "Bảng giá", to: "/pricing" },
    { key: "about", label: "Giới thiệu", to: "/about" },
    { key: "blog", label: "Blog", to: "/blog" },
    { key: "contact", label: "Liên hệ", to: "/contact" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto grid min-h-16 max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <BrandMark className="h-9 w-9 shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="text-base font-bold tracking-wide">UNIWORK</div>
            <div className="hidden truncate text-[10px] text-muted-foreground min-[390px]:block">Digital Workplace Platform</div>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {items.map((it) => (
            <Link
              key={it.key}
              to={it.to}
              className={active === it.key ? "text-foreground" : "hover:text-foreground"}
            >
              {it.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageToggle />
          <span className="hidden sm:inline-flex"><ToneToggle /></span>
          <ThemeToggle />
          <Link
            to="/auth"
            className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            {t("land.nav.signup")}
          </Link>
          <a
            href="/#login"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <LogIn className="h-4 w-4" /> {t("land.nav.login")}
          </a>
        </div>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-border/60 bg-surface/30 py-12">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <BrandMark className="h-8 w-8" />
            <span className="font-semibold">UNIWORK</span>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            Nền tảng làm việc số toàn diện cho doanh nghiệp Việt Nam.
          </p>
        </div>
        <FooterCol
          title="Sản phẩm"
          items={[
            { label: "Bảng giá", to: "/pricing" },
            { label: "Demo Meeting", to: "/meeting" },
            { label: "Tài liệu", to: "/documents" },
            { label: "Workflow", to: "/workflows" },
          ]}
        />
        <FooterCol
          title="Công ty"
          items={[
            { label: "Giới thiệu", to: "/about" },
            { label: "Blog", to: "/blog" },
            { label: "Liên hệ", to: "/contact" },
          ]}
        />
        <FooterCol
          title="Pháp lý"
          items={[
            { label: "Chính sách bảo mật", to: "/privacy" },
            { label: "Điều khoản dịch vụ", to: "/terms" },
          ]}
        />
      </div>
      <div className="mx-auto mt-10 flex max-w-7xl flex-col items-center justify-between gap-3 border-t border-border/60 px-4 pt-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <div>© 2026 Unicom JSC. All rights reserved.</div>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-foreground">
            Bảo mật
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Điều khoản
          </Link>
          <a href="mailto:hello@uniwork.vn" className="hover:text-foreground">
            hello@uniwork.vn
          </a>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: { label: string; to: string }[] }) {
  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-2 text-sm">
        {items.map((it) => (
          <li key={it.to}>
            <Link to={it.to} className="text-muted-foreground hover:text-foreground">
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
