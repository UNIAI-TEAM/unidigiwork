import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { listAiEmployments } from "@/lib/api/ai-market.functions";
import { formatApproved, formatKpiScore } from "@/domain/ai-market/kpi";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  rank: number;
  domain: string;
  name: string;
  title?: string;
  proposals: number;
  approved: number;
  completed: number;
  score: number;
  approvalRate: number | null;
};

/** Bảng đánh giá hiệu quả nhân sự AI: tỉ lệ duyệt, khối lượng việc và mức phù hợp lĩnh vực. */
export function AiWorkforceEvaluation() {
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const activeWorkspaceId = workspaceId ?? workspaces?.[0]?.id ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["ai-employments", activeWorkspaceId],
    queryFn: () => listAiEmployments({ data: { workspaceId: activeWorkspaceId } }),
    enabled: !!activeWorkspaceId,
  });

  const rows: Row[] = useMemo(
    () =>
      ((data as any[]) ?? []).map((e) => ({
        id: e.id,
        rank: e.rank,
        domain: e.agent?.domain ?? "Khác",
        name: e.agent?.name ?? "Nhân sự AI",
        title: e.agent?.title,
        proposals: e.kpi?.proposals ?? 0,
        approved: e.kpi?.approved ?? 0,
        completed: e.kpi?.completed ?? 0,
        score: e.kpi?.score ?? 1,
        approvalRate: e.kpi?.approvalRate ?? null,
      })),
    [data],
  );

  // Trung bình theo lĩnh vực trong chính không gian làm việc này → đo mức phù hợp lĩnh vực.
  const domainAvg = useMemo(() => {
    const map = new Map<string, { score: number; completed: number; n: number }>();
    for (const r of rows) {
      const cur = map.get(r.domain) ?? { score: 0, completed: 0, n: 0 };
      map.set(r.domain, { score: cur.score + r.score, completed: cur.completed + r.completed, n: cur.n + 1 });
    }
    return map;
  }, [rows]);

  const maxCompleted = Math.max(1, ...rows.map((r) => r.completed));

  if (isLoading) return <p className="mt-6 text-sm text-muted-foreground">Đang tải dữ liệu đánh giá…</p>;
  if (!rows.length)
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-sm text-muted-foreground">
        Chưa có nhân sự AI nào để đánh giá.
      </div>
    );

  return (
    <div className="mt-6 space-y-3">
      <p className="text-xs text-muted-foreground">
        Đánh giá tự động theo dữ liệu thực thi: tỉ lệ đề xuất được duyệt, khối lượng việc hoàn thành và mức phù hợp lĩnh
        vực (so với trung bình cùng lĩnh vực trong không gian làm việc này).
      </p>

      <ul className="grid gap-3">
        {rows.map((r) => {
          const avg = domainAvg.get(r.domain);
          const avgScore = avg && avg.n ? avg.score / avg.n : r.score;
          const delta = r.score - avgScore;
          const fit =
            avg && avg.n > 1
              ? delta > 0.5
                ? { label: "Vượt trội trong lĩnh vực", icon: TrendingUp, tone: "text-success" }
                : delta < -0.5
                  ? { label: "Dưới mức lĩnh vực", icon: TrendingDown, tone: "text-destructive" }
                  : { label: "Ngang mức lĩnh vực", icon: Minus, tone: "text-muted-foreground" }
              : { label: "Chưa đủ dữ liệu so sánh", icon: Minus, tone: "text-muted-foreground" };

          return (
            <li key={r.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  {r.rank}
                </span>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.title ?? r.domain}</span>
                </span>
                <Badge variant="outline" className="font-semibold">
                  KPI {formatKpiScore(r.score)}
                </Badge>
                <span className={cn("inline-flex items-center gap-1 text-xs font-medium", fit.tone)}>
                  <fit.icon className="h-3.5 w-3.5" /> {fit.label}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Tỉ lệ duyệt</dt>
                  <dd className="text-sm font-medium">{formatApproved(r.approved, r.proposals)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Đề xuất đã gửi</dt>
                  <dd className="text-sm font-medium">{r.proposals}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Việc hoàn thành</dt>
                  <dd className="text-sm font-medium">{r.completed}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Lĩnh vực</dt>
                  <dd className="truncate text-sm font-medium">{r.domain}</dd>
                </div>
              </dl>

              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">Khối lượng việc</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((r.completed / maxCompleted) * 100)}%` }}
                    />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">Tỉ lệ duyệt</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-success"
                      style={{ width: `${Math.round(r.approvalRate ?? 0)}%` }}
                    />
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
