import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { listWorkDeliverables } from "@/lib/api/work-deliverables.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowDownUp, FileText, Search, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { enUS, vi } from "date-fns/locale";
import { localeTag, useI18n, type Key } from "@/lib/i18n";
import type { WorkDeliverableRow } from "@/lib/api/work-deliverables.functions";

const SCOPES = [
  { id: "all", label: "m.wp.scope.all" },
  { id: "mine", label: "m.wp.scope.mine" },
  { id: "ai", label: "m.wp.scope.ai" },
] as const;

type ScopeId = (typeof SCOPES)[number]["id"];

type MobileWorkProduct = WorkDeliverableRow & {
  workspaceName?: string | null;
  ownerName?: string | null;
};

export const Route = createFileRoute("/_authenticated/m/work-products/")({
  head: () => ({
    meta: [
      { title: "Kết quả công việc · UNIWORK" },
      { name: "description", content: "Toàn bộ kết quả công việc của bạn trên một màn hình." },
      { property: "og:title", content: "Kết quả công việc · UNIWORK" },
      {
        property: "og:description",
        content: "Toàn bộ kết quả công việc của bạn trên một màn hình.",
      },
    ],
  }),
  component: MobileWorkProductsPage,
});

function MobileWorkProductsPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { workspaceId } = useActiveWorkspace();
  const [scope, setScope] = useState<ScopeId>("all");
  const [search, setSearch] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["m-work-products", workspaceId, scope],
    queryFn: () =>
      listWorkDeliverables({
        data: { workspaceId: workspaceId ?? null, mine: scope === "mine", limit: 100 },
      } as any),
  });

  const items = useMemo(() => {
    let list = ((data as MobileWorkProduct[] | undefined) ?? []).slice();
    if (scope === "ai") list = list.filter((p) => p.ai_generated);
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) || p.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    list.sort((a, b) => {
      const da = new Date(a.updated_at ?? a.created_at).getTime();
      const db = new Date(b.updated_at ?? b.created_at).getTime();
      return newestFirst ? db - da : da - db;
    });
    return list;
  }, [data, scope, search, newestFirst]);

  return (
    <div className="flex min-h-full flex-col gap-5 p-4 pb-24">
      <header className="pt-1">
        <h1 className="text-2xl font-semibold">{t("wp.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("m.wp.list.subtitle")}</p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("m.wp.list.search")}
          aria-label={t("m.wp.list.search")}
          className="h-12 rounded-xl pl-10"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {SCOPES.map((s) => (
          <Button
            key={s.id}
            variant={scope === s.id ? "default" : "outline"}
            onClick={() => setScope(s.id)}
            className={cn(
              "min-h-11 shrink-0 rounded-full px-4 text-xs",
              scope !== s.id && "text-muted-foreground",
            )}
          >
            {t(s.label as Key)}
          </Button>
        ))}
        <Button
          variant="ghost"
          onClick={() => setNewestFirst((v) => !v)}
          className="min-h-11 shrink-0 rounded-full px-4 text-xs text-muted-foreground"
        >
          <ArrowDownUp className="h-4 w-4" />
          {newestFirst ? t("m.wp.sort.newest") : t("m.wp.sort.oldest")}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-2" aria-label={t("wp.loading")}>
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">{t("wp.empty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("wp.emptyHint")}</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {items.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void navigate({ to: "/m/work-products/$id", params: { id: p.id } })}
                className="flex min-h-24 w-full min-w-0 items-start gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-card transition-colors active:bg-surface"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-foreground">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-sm font-semibold leading-5">
                    {p.title}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {t(`wp.type.${p.business_type}` as Key)} · v{p.current_version ?? 1}
                    {p.workspaceName ? ` · ${p.workspaceName}` : ""}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {format(new Date(p.updated_at ?? p.created_at), "d MMM yyyy", {
                      locale: lang === "vi" ? vi : enUS,
                    })}
                  </span>
                </span>
                {p.ai_generated && (
                  <Sparkles
                    className="h-4 w-4 shrink-0 text-primary"
                    aria-label={t("m.wp.scope.ai")}
                  />
                )}
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {t(`wp.status.${p.status}` as Key)}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
