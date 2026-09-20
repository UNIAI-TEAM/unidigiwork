import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { listWorkDeliverables } from "@/lib/api/work-deliverables.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronRight, FileText, Search, Star } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

const SCOPES = [
  { id: "all", label: "Tất cả" },
  { id: "mine", label: "Của tôi" },
  { id: "team", label: "Nhóm" },
  { id: "ai", label: "AI tạo" },
] as const;

type ScopeId = (typeof SCOPES)[number]["id"];

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bản nháp",
  IN_REVIEW: "Đang duyệt",
  APPROVED: "Đã duyệt",
  PUBLISHED: "Đã phát hành",
  ARCHIVED: "Lưu trữ",
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
    let list = ((data as any[] | undefined) ?? []).slice();
    if (scope === "ai") list = list.filter((p) => p.ai_generated);
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          (p.tags ?? []).some((t: string) => t.toLowerCase().includes(q)),
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
      <header>
        <p className="module-label text-primary">Work products</p>
        <h1 className="mt-1 font-heading text-2xl font-bold">Kết quả công việc</h1>
        <p className="text-sm text-muted-foreground">Mọi thành quả của bạn ở một nơi.</p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên hoặc thẻ…"
          className="pl-9"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            onClick={() => setScope(s.id)}
            className={cn(
              "min-h-10 shrink-0 rounded-xl px-4 text-xs font-semibold transition-colors",
              scope === s.id
                ? "bg-action text-action-foreground"
                : "border border-border bg-background text-muted-foreground shadow-card",
            )}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setNewestFirst((v) => !v)}
          className="min-h-10 shrink-0 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-muted-foreground shadow-card"
        >
          {newestFirst ? "Mới nhất" : "Cũ nhất"}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Chưa có kết quả công việc phù hợp.</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                to="/m/work-products/$id"
                params={{ id: p.id }}
                className="flex min-h-20 items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card active:bg-surface"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.business_type} · v{p.current_version ?? 1}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {format(new Date(p.updated_at ?? p.created_at), "d MMM yyyy", { locale: vi })}
                  </span>
                </span>
                {p.ai_generated && (
                  <Star className="h-4 w-4 shrink-0 text-warning" aria-label="AI tạo" />
                )}
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {STATUS_LABEL[p.status] ?? p.status}
                </Badge>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
