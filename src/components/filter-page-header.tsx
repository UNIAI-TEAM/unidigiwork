import { Link } from "@tanstack/react-router";
import { ChevronRight, Filter, X } from "lucide-react";

export type Crumb = { label: string; to?: string };

/**
 * Breadcrumb + tiêu đề trang phản ánh bộ lọc đang áp dụng (khi mở từ panel AI Assistant).
 */
export function FilterPageHeader({
  crumbs,
  title,
  description,
  chips,
}: {
  crumbs: Crumb[];
  title: string;
  description?: string;
  chips?: { label: string; onClear?: () => void }[];
}) {
  return (
    <div className="mb-6">
      <nav aria-label="Breadcrumb" className="module-label flex flex-wrap items-center gap-1 text-muted-foreground">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 opacity-60" />}
            {c.to && i < crumbs.length - 1 ? (
              <Link to={c.to} className="hover:text-foreground hover:underline">
                {c.label}
              </Link>
            ) : (
              <span className={i === crumbs.length - 1 ? "font-medium text-foreground" : undefined}>
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>
      <h1 className="mt-2 font-heading text-2xl font-bold sm:text-3xl">{title}</h1>
      {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      {chips && chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {chips.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs text-primary"
            >
              {c.label}
              {c.onClear && (
                <button onClick={c.onClear} aria-label={`Bỏ lọc ${c.label}`} className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
