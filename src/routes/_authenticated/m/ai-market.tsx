// AI Market trên mobile — danh sách ứng viên AI.
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronRight, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import { listMarketAgents } from "@/lib/api/ai-market.functions";
import { formatMoney } from "@/domain/ai-market/contracts";

export const Route = createFileRoute("/_authenticated/m/ai-market")({
  head: () => ({
    meta: [
      { title: "AI Market · UNIWORK" },
      { name: "description", content: "Tìm và tuyển nhân sự AI ngay trên điện thoại." },
      { property: "og:title", content: "AI Market · UNIWORK" },
      { property: "og:description", content: "Tìm và tuyển nhân sự AI ngay trên điện thoại." },
    ],
  }),
  component: MobileAiMarketPage,
});

function MobileAiMarketPage() {
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const activeWorkspaceId = workspaceId ?? workspaces?.[0]?.id ?? "";
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ai-market", activeWorkspaceId, q, "all", "rating"],
    queryFn: () =>
      listMarketAgents({ data: { workspaceId: activeWorkspaceId, q, domain: "", skill: "", sort: "rating" } }),
    enabled: !!activeWorkspaceId,
  });

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 pb-28">
      <header>
        <h1 className="text-lg font-semibold">AI Market</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Chợ tuyển dụng nhân sự AI cho công ty của bạn.</p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm ứng viên AI…" className="pl-9" />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (
        <ul className="grid gap-2">
          {(data?.agents ?? []).map((a: any) => (
            <li key={a.id}>
              <Link
                to="/m/ai-market/$id"
                params={{ id: a.id }}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors active:bg-surface-2"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-warning text-warning" />
                      {Number(a.rating).toFixed(1)}
                    </span>
                    <span>{formatMoney(Number(a.salary_min), a.currency)}+</span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
