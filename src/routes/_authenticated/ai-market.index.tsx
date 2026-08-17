// AI MARKET — chợ tuyển dụng nhân sự AI: tìm kiếm ứng viên, xem lương, mở hồ sơ để phỏng vấn.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Search, Star, Store, Briefcase, X } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import { listMarketAgents } from "@/lib/api/ai-market.functions";
import {
  AI_EMPLOYMENT_STATUS_LABELS,
  AI_SENIORITY_LABELS,
  formatMoney,
  type AiEmploymentStatus,
} from "@/domain/ai-market/contracts";
import { AI_SKILL_MAP } from "@/domain/workflow-agents/skills";

export const Route = createFileRoute("/_authenticated/ai-market/")({
  head: () => ({
    meta: [
      { title: "AI Market — Chợ tuyển dụng nhân sự AI · UNIWORK" },
      {
        name: "description",
        content: "Tìm kiếm, phỏng vấn và tuyển dụng nhân sự AI cho công ty của bạn trên UNIWORK.",
      },
      { property: "og:title", content: "AI Market — Chợ tuyển dụng nhân sự AI · UNIWORK" },
      {
        property: "og:description",
        content: "Tìm kiếm, phỏng vấn và tuyển dụng nhân sự AI cho công ty của bạn trên UNIWORK.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiMarketPage,
});

function AiMarketPage() {
  const [open, setOpen] = useSidebarState();
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const activeWorkspaceId = workspaceId ?? workspaces?.[0]?.id ?? "";

  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("all");
  const [sort, setSort] = useState<"rating" | "salary_asc" | "salary_desc" | "tasks">("rating");

  const { data, isLoading } = useQuery({
    queryKey: ["ai-market", activeWorkspaceId, q, domain, sort],
    queryFn: () =>
      listMarketAgents({
        data: { workspaceId: activeWorkspaceId, q, domain: domain === "all" ? "" : domain, skill: "", sort },
      }),
    enabled: !!activeWorkspaceId,
  });

  const agents = useMemo(() => data?.agents ?? [], [data]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ai-market" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <Store className="h-6 w-6 text-primary" /> AI Market
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Chợ tuyển dụng nhân sự AI — tìm ứng viên, phỏng vấn, đàm phán lương rồi cho thử việc.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/ai-market/search"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium transition-colors hover:bg-surface-2"
              >
                <Search className="h-4 w-4" /> Tìm kiếm nâng cao
              </Link>
              <Link
                to="/ai-workforce"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium transition-colors hover:bg-surface-2"
              >
                <Briefcase className="h-4 w-4" /> Nhân sự đã tuyển
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo tên, vị trí hoặc giới thiệu…"
                className="pl-9 pr-9"
              />
              {q && (
                <button
                  type="button"
                  aria-label="Xóa tìm kiếm"
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Lĩnh vực" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả lĩnh vực</SelectItem>
                {(data?.domains ?? []).map((d: string) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">Đánh giá cao nhất</SelectItem>
                <SelectItem value="tasks">Nhiều việc đã hoàn thành</SelectItem>
                <SelectItem value="salary_asc">Lương thấp → cao</SelectItem>
                <SelectItem value="salary_desc">Lương cao → thấp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!activeWorkspaceId ? (
            <p className="mt-8 text-sm text-muted-foreground">Hãy chọn một không gian làm việc để bắt đầu tuyển dụng.</p>
          ) : isLoading ? (
            <p className="mt-8 text-sm text-muted-foreground">Đang tải danh sách ứng viên…</p>
          ) : agents.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">Không tìm thấy ứng viên phù hợp.</p>
          ) : (
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((a: any) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Bot className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{a.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.title}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 fill-warning text-warning" /> {Number(a.rating).toFixed(1)} ·{" "}
                        {a.completed_tasks.toLocaleString("vi-VN")} việc
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{a.domain}</Badge>
                    <Badge variant="secondary">{AI_SENIORITY_LABELS[a.seniority] ?? a.seniority}</Badge>
                    {a.employment && (
                      <Badge className="bg-success/15 text-success">
                        {AI_EMPLOYMENT_STATUS_LABELS[a.employment.status as AiEmploymentStatus]}
                      </Badge>
                    )}
                  </div>

                  <p className="line-clamp-2 text-xs text-muted-foreground">{a.bio}</p>

                  <div className="flex flex-wrap gap-1">
                    {(a.skills ?? []).slice(0, 3).map((s: string) => (
                      <span key={s} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {AI_SKILL_MAP[s]?.name ?? s}
                      </span>
                    ))}
                    {(a.skills ?? []).length > 3 && (
                      <span className="text-[11px] text-muted-foreground">+{a.skills.length - 3}</span>
                    )}
                  </div>

                  <div className="mt-auto flex items-end justify-between gap-2 border-t border-border pt-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lương tháng</p>
                      <p className="text-sm font-semibold">
                        {formatMoney(Number(a.salary_min), a.currency)} – {formatMoney(Number(a.salary_max), a.currency)}
                      </p>
                    </div>
                    <Button asChild size="sm">
                      <Link to="/ai-market/$id" params={{ id: a.id }}>Xem hồ sơ</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
