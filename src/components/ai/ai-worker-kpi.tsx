import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAiEmployments } from "@/lib/api/ai-market.functions";
import { formatApproved, formatKpiScore } from "@/domain/ai-market/kpi";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import { Badge } from "@/components/ui/badge";

/** Mục "Hiệu suất (KPI)" trên hồ sơ nhân sự AI đã tuyển — điểm tự động, không nhập tay. */
export function AiWorkerKpiSection({ name, domain }: { name: string; domain?: string }) {
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const activeWorkspaceId = workspaceId ?? workspaces?.[0]?.id ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["ai-employments", activeWorkspaceId],
    queryFn: () => listAiEmployments({ data: { workspaceId: activeWorkspaceId } }),
    enabled: !!activeWorkspaceId,
  });

  const record = useMemo(() => {
    const list: any[] = (data as any[]) ?? [];
    const norm = (v?: string) => (v ?? "").trim().toLowerCase();
    return (
      list.find((e) => norm(e.agent?.name) === norm(name)) ??
      (domain ? list.find((e) => norm(e.agent?.domain) === norm(domain)) : undefined) ??
      null
    );
  }, [data, name, domain]);

  const kpi = record?.kpi ?? null;

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Hiệu suất (KPI)</h3>
        <Badge variant="outline" className="font-semibold">
          KPI {formatKpiScore(kpi?.score)}
        </Badge>
      </div>

      {isLoading ? (
        <p className="mt-2 text-xs text-muted-foreground">Đang tải dữ liệu hiệu suất…</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Đề xuất đã gửi</dt>
              <dd className="text-sm font-medium">{kpi?.proposals ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Được duyệt (60%)</dt>
              <dd className="text-sm font-medium">
                {formatApproved(kpi?.approved ?? 0, kpi?.proposals ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Việc hoàn thành (40%)</dt>
              <dd className="text-sm font-medium">{kpi?.completed ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Xếp hạng nội bộ</dt>
              <dd className="text-sm font-medium">{record?.rank ? `#${record.rank}` : "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Điểm tính tự động theo công thức 60% tỉ lệ đề xuất được duyệt + 40% khối lượng việc hoàn thành
            {kpi?.hasEvidence
              ? " — dữ liệu thực thi trong không gian làm việc hiện tại."
              : " — chưa có dữ liệu thực thi trong không gian làm việc này."}
          </p>
        </>
      )}
    </section>
  );
}
