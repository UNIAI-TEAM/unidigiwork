import { withAppShell } from "@/components/page-shell";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { listSchoolDirectives, type DirectiveState } from "@/lib/api/school-directives.functions";
import { DirectiveCard, DIRECTIVE_FILTERS as FILTERS } from "@/components/school/directive-card";

export const Route = createFileRoute("/_authenticated/school-directives")({
  head: () => ({
    meta: [
      { title: "Theo dõi chỉ đạo — UniWork" },
      { name: "description", content: "Theo dõi chỉ đạo của Ban Giám hiệu từ giao việc đến nghiệm thu." },
      { property: "og:title", content: "Theo dõi chỉ đạo — UniWork" },
      { property: "og:description", content: "Theo dõi chỉ đạo của Ban Giám hiệu từ giao việc đến nghiệm thu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: withAppShell(DirectivesPage),
});

function DirectivesPage() {
  const { t } = useI18n();
  const fn = useServerFn(listSchoolDirectives);
  const q = useQuery({ queryKey: ["school-directives"], queryFn: () => fn() });
  const [f, setF] = useState<DirectiveState | "all">("all");
  const items = q.data?.items ?? [];
  const count = (s: DirectiveState | "all") => (s === "all" ? items.length : items.filter((i) => i.state === s).length);
  const shown = f === "all" ? items : items.filter((i) => i.state === f);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <Link to="/school-ops" aria-label={t("smt.close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border hover:bg-accent">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("sdt.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sdt.desc")}</p>
        </div>
      </div>

      {q.data && !q.data.allowed ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("sdt.forbidden")}</p>
      ) : (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {FILTERS.map((s) => (
              <button key={s} onClick={() => setF(s)} aria-pressed={f === s}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm ${f === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                {t(`sdt.f.${s}`)} <span className="tabular-nums opacity-70">{count(s)}</span>
              </button>
            ))}
          </div>
          {q.isLoading && <p className="text-sm text-muted-foreground">…</p>}
          {!q.isLoading && shown.length === 0 && <p className="rounded-lg border p-6 text-sm text-muted-foreground">{t("sdt.empty")}</p>}
          <div className="grid gap-4">{shown.map((d) => <DirectiveCard key={d.id} d={d} />)}</div>
          <p className="text-xs text-muted-foreground">{t("sdt.note")}</p>
        </>
      )}
    </div>
  );
}

