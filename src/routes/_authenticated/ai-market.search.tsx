// AI MARKET — trang tìm kiếm ứng viên AI nâng cao: lọc theo lĩnh vực, kỹ năng, KPI, lương và trạng thái hợp đồng.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Filter, Search, Star, Store, X } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import { listMarketAgents } from "@/lib/api/ai-market.functions";
import {
  AI_EMPLOYMENT_STATUS_LABELS,
  AI_SENIORITY_LABELS,
  formatMoney,
  type AiEmploymentStatus,
} from "@/domain/ai-market/contracts";
import { AI_SKILLS, AI_SKILL_MAP } from "@/domain/workflow-agents/skills";
import { formatApprovalRate } from "@/domain/ai-market/kpi";

export const Route = createFileRoute("/_authenticated/ai-market/search")({
  head: () => ({
    meta: [
      { title: "Tìm kiếm ứng viên AI · UNIWORK" },
      {
        name: "description",
        content: "Lọc ứng viên AI theo lĩnh vực, kỹ năng, KPI, mức lương và trạng thái hợp đồng.",
      },
      { property: "og:title", content: "Tìm kiếm ứng viên AI · UNIWORK" },
      {
        property: "og:description",
        content: "Lọc ứng viên AI theo lĩnh vực, kỹ năng, KPI, mức lương và trạng thái hợp đồng.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiMarketSearchPage,
});

const CONTRACT_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "none", label: "Chưa tuyển" },
  { value: "INTERVIEW", label: AI_EMPLOYMENT_STATUS_LABELS.INTERVIEW },
  { value: "OFFER", label: AI_EMPLOYMENT_STATUS_LABELS.OFFER },
  { value: "TRIAL", label: AI_EMPLOYMENT_STATUS_LABELS.TRIAL },
  { value: "HIRED", label: AI_EMPLOYMENT_STATUS_LABELS.HIRED },
];

function AiMarketSearchPage() {
  const [open, setOpen] = useSidebarState();
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const activeWorkspaceId = workspaceId ?? workspaces?.[0]?.id ?? "";

  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("all");
  const [skill, setSkill] = useState("all");
  const [contract, setContract] = useState("all");
  const [sort, setSort] = useState<"kpi" | "rating" | "salary_asc" | "salary_desc" | "tasks">("kpi");
  const [minRating, setMinRating] = useState(0);
  const [minTasks, setMinTasks] = useState(0);
  const [minApproval, setMinApproval] = useState(0);
  const [minKpi, setMinKpi] = useState(0);
  const [maxSalary, setMaxSalary] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-market-search", activeWorkspaceId, q, domain, skill, sort],
    queryFn: () =>
      listMarketAgents({
        data: {
          workspaceId: activeWorkspaceId,
          q,
          domain: domain === "all" ? "" : domain,
          skill: skill === "all" ? "" : skill,
          sort,
        },
      }),
    enabled: !!activeWorkspaceId,
  });

  const all = useMemo(() => data?.agents ?? [], [data]);

  const salaryCeiling = useMemo(
    () => Math.max(1_000_000, ...all.map((a: any) => Number(a.salary_max) || 0)),
    [all],
  );

  const agents = useMemo(
    () =>
      all.filter((a: any) => {
        if (Number(a.rating) < minRating) return false;
        if ((a.kpi?.completed ?? Number(a.completed_tasks)) < minTasks) return false;
        if (minKpi > 0 && (a.kpi?.score ?? 0) < minKpi) return false;
        if (minApproval > 0 && (a.kpi?.approvalRate ?? -1) < minApproval) return false;
        if (maxSalary !== null && Number(a.salary_min) > maxSalary) return false;
        const status = a.employment?.status ?? null;
        if (contract === "none" && status) return false;
        if (contract !== "all" && contract !== "none" && status !== contract) return false;
        return true;
      }),
    [all, minRating, minTasks, minApproval, minKpi, maxSalary, contract],
  );

  const activeFilters =
    (domain !== "all" ? 1 : 0) +
    (skill !== "all" ? 1 : 0) +
    (contract !== "all" ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (minTasks > 0 ? 1 : 0) +
    (minApproval > 0 ? 1 : 0) +
    (minKpi > 0 ? 1 : 0) +
    (maxSalary !== null ? 1 : 0);

  // Khi không có kết quả vì ngân sách quá thấp, gợi ý ứng viên rẻ nhất còn lại.
  const cheapestFallback = useMemo(() => {
    if (agents.length > 0 || maxSalary === null) return null;
    const pool = all
      .filter(
        (a: any) =>
          Number(a.rating) >= minRating && (a.kpi?.completed ?? Number(a.completed_tasks)) >= minTasks,
      )
      .sort((a: any, b: any) => Number(a.salary_min) - Number(b.salary_min));
    return pool[0] ?? null;
  }, [agents.length, all, maxSalary, minRating, minTasks]);

  const resetFilters = () => {
    setDomain("all");
    setSkill("all");
    setContract("all");
    setMinRating(0);
    setMinTasks(0);
    setMinApproval(0);
    setMinKpi(0);
    setMaxSalary(null);
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ai-market" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <Search className="h-6 w-6 text-primary" /> Tìm kiếm ứng viên AI
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Lọc theo lĩnh vực, kỹ năng, KPI, mức lương và trạng thái hợp đồng để chọn đúng nhân sự AI.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/ai-market">
                <Store className="h-4 w-4" /> Về chợ AI
              </Link>
            </Button>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="h-fit rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Filter className="h-4 w-4 text-muted-foreground" /> Bộ lọc
                  {activeFilters > 0 && <Badge variant="secondary">{activeFilters}</Badge>}
                </p>
                {activeFilters > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Xóa lọc
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Lĩnh vực</Label>
                  <Select value={domain} onValueChange={setDomain}>
                    <SelectTrigger><SelectValue placeholder="Lĩnh vực" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả lĩnh vực</SelectItem>
                      {(data?.domains ?? []).map((d: string) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Kỹ năng</Label>
                  <Select value={skill} onValueChange={setSkill}>
                    <SelectTrigger><SelectValue placeholder="Kỹ năng" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả kỹ năng</SelectItem>
                      {AI_SKILLS.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Trạng thái hợp đồng</Label>
                  <Select value={contract} onValueChange={setContract}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTRACT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    KPI — đánh giá tối thiểu: {minRating.toFixed(1)}
                  </Label>
                  <Slider
                    value={[minRating]}
                    min={0}
                    max={5}
                    step={0.1}
                    onValueChange={(v) => setMinRating(v[0] ?? 0)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    KPI — việc đã hoàn thành tối thiểu: {minTasks.toLocaleString("vi-VN")}
                  </Label>
                  <Slider
                    value={[minTasks]}
                    min={0}
                    max={2000}
                    step={50}
                    onValueChange={(v) => setMinTasks(v[0] ?? 0)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Ngân sách lương tối đa:{" "}
                    {maxSalary === null ? "Không giới hạn" : formatMoney(maxSalary)}
                  </Label>
                  <Slider
                    value={[maxSalary ?? salaryCeiling]}
                    min={0}
                    max={salaryCeiling}
                    step={100_000}
                    onValueChange={(v) => setMaxSalary(v[0] ?? null)}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      inputMode="numeric"
                      value={maxSalary === null ? "" : Math.round(maxSalary / 1000)}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        setMaxSalary(raw === "" ? null : Math.max(0, Number(raw)) * 1000);
                      }}
                      placeholder="Nhập số tiền"
                      aria-label="Ngân sách lương tối đa (nghìn đồng)"
                      className="h-8 w-32"
                    />
                    <span className="text-xs text-muted-foreground">nghìn đ / tháng</span>
                  </div>
                  {maxSalary !== null && (
                    <button
                      type="button"
                      onClick={() => setMaxSalary(null)}
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Bỏ giới hạn lương
                    </button>
                  )}
                </div>
              </div>
            </aside>

            <section className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
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
                <p className="mt-8 text-sm text-muted-foreground">Hãy chọn một không gian làm việc để tìm ứng viên.</p>
              ) : isLoading ? (
                <p className="mt-8 text-sm text-muted-foreground">Đang tải danh sách ứng viên…</p>
              ) : agents.length === 0 ? (
                <div className="mt-8 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Không có ứng viên nào khớp bộ lọc. Hãy nới điều kiện KPI hoặc ngân sách lương.
                  </p>
                  {cheapestFallback && (
                    <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                      <p>
                        Mức lương thấp nhất trên thị trường hiện là{" "}
                        <span className="font-medium text-foreground">
                          {formatMoney(Number(cheapestFallback.salary_min))}
                        </span>{" "}
                        ({cheapestFallback.name} · {cheapestFallback.domain}).
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => setMaxSalary(Number(cheapestFallback.salary_min))}
                      >
                        Nâng ngân sách lên {formatMoney(Number(cheapestFallback.salary_min))}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {agents.length.toLocaleString("vi-VN")} ứng viên khớp bộ lọc
                  </p>
                  <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {agents.map((a: any) => (
                      <li
                        key={a.id}
                        className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                            <Bot className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{a.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{a.title}</p>
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Star className="h-3 w-3 fill-warning text-warning" /> {Number(a.rating).toFixed(1)} ·{" "}
                              {Number(a.completed_tasks).toLocaleString("vi-VN")} việc
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline">{a.domain}</Badge>
                          <Badge variant="secondary">{AI_SENIORITY_LABELS[a.seniority] ?? a.seniority}</Badge>
                          {a.employment ? (
                            <Badge className="bg-success/15 text-success">
                              {AI_EMPLOYMENT_STATUS_LABELS[a.employment.status as AiEmploymentStatus]}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Chưa tuyển</Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {(a.skills ?? []).slice(0, 4).map((s: string) => (
                            <span key={s} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {AI_SKILL_MAP[s]?.name ?? s}
                            </span>
                          ))}
                        </div>

                        <div className="mt-auto flex items-end justify-between gap-2 border-t border-border pt-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lương tháng</p>
                            <p className="text-sm font-semibold">
                              {formatMoney(Number(a.salary_min), a.currency)} –{" "}
                              {formatMoney(Number(a.salary_max), a.currency)}
                            </p>
                          </div>
                          <Button asChild size="sm">
                            <Link to="/ai-market/$id" params={{ id: a.id }}>Xem hồ sơ</Link>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}