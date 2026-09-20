// SWP-1 — Chi tiết sản phẩm công việc chủ lực: hợp đồng, cohort, lượt chạy, khởi chạy.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Gauge, Play, ShieldCheck, Timer } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listWorkProducts } from "@/lib/api/work-products.functions";
import { getWorkProductCohort } from "@/lib/api/sell-work-cohort.functions";
import { listWorkProductRuns } from "@/lib/api/sell-work-runs.functions";
import { listTasks } from "@/lib/api/tasks.functions";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import { getActiveTenant } from "@/lib/api/active-tenant.functions";
import { runAiTask } from "@/lib/api/ai-tasks.functions";
import { SWP1_FLAGSHIP_TEMPLATE } from "@/domain/ai-tasks/contracts";
import {
  COHORT_STATUS_LABEL,
  COMPLETENESS_LABEL,
  SWP1_FLAGSHIPS,
  classifyFailure,
  FAILURE_LABEL,
  type DataCompleteness,
} from "@/domain/sell-work/cohort";
import { formatDurationMs } from "@/domain/work-economics/contracts";

export const Route = createFileRoute("/_authenticated/work-catalog_/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Sản phẩm công việc ${params.code} — UNIWORK` },
      {
        name: "description",
        content: "Hợp đồng, bằng chứng cohort và lịch sử lượt chạy của sản phẩm công việc do nhân sự AI thực hiện.",
      },
      { property: "og:title", content: `Sản phẩm công việc ${params.code} — UNIWORK` },
      { property: "og:description", content: "Xem hợp đồng, chất lượng, chi phí và khởi chạy sản phẩm công việc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkProductDetailPage,
});

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "Không đủ dữ liệu" : `${v}%`);

function WorkProductDetailPage() {
  const { code } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();

  const fetchProducts = useServerFn(listWorkProducts);
  const fetchCohort = useServerFn(getWorkProductCohort);
  const fetchRuns = useServerFn(listWorkProductRuns);
  const fetchTasks = useServerFn(listTasks);
  const fetchTenant = useServerFn(getActiveTenant);
  const startRun = useServerFn(runAiTask);

  const { data: tenant } = useQuery({ queryKey: ["active-tenant"], queryFn: () => fetchTenant() });
  const { data: products } = useQuery({ queryKey: ["work-products"], queryFn: () => fetchProducts() });
  const product = useMemo(() => (products ?? []).find((p) => p.code === code) ?? null, [products, code]);

  const { data: cohort } = useQuery({
    queryKey: ["swp1", "cohort", code, tenant?.tenantId],
    queryFn: () => fetchCohort({ data: { code, version: product?.version ?? null, tenantId: tenant?.tenantId ?? null, days: 90 } }),
    enabled: Boolean(tenant?.tenantId),
  });
  const { data: runs } = useQuery({ queryKey: ["swp1", "runs", code], queryFn: () => fetchRuns({ data: { code } }) });
  // Chỉ liệt kê công việc trong không gian làm việc đang chọn (RLS vẫn là nguồn ủy quyền).
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const effectiveWorkspaceId = workspaceId ?? workspaces?.[0]?.id ?? null;
  const { data: taskRows } = useQuery({
    queryKey: ["swp1", "runnable", effectiveWorkspaceId],
    enabled: Boolean(effectiveWorkspaceId),
    queryFn: () => fetchTasks({ data: { workspaceId: effectiveWorkspaceId!, limit: 100 } }),
  });
  const tasks = useMemo(
    () =>
      ((taskRows ?? []) as Record<string, unknown>[])
        .filter((t) => Boolean(t["ai_worker_id"]))
        .map((t) => ({ id: t["id"] as string, title: (t["title"] as string) ?? "" })),
    [taskRows],
  );

  const [taskId, setTaskId] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const flagship = SWP1_FLAGSHIPS.find((f) => f.code === code);
  const templateCode = SWP1_FLAGSHIP_TEMPLATE[code];

  const launch = useMutation({
    mutationFn: () =>
      startRun({
        data: {
          taskId,
          ...(templateCode ? { templateCode } : {}),
          ...(code === "MTE_V1" && meetingId ? { inputs: { meeting_id: meetingId } } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Đã khởi chạy — theo dõi tiến trình trong chi tiết công việc.");
      qc.invalidateQueries({ queryKey: ["swp1", "runs", code] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Không khởi chạy được"),
  });

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 md:p-8">
          <Link to="/work-catalog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Danh mục sản phẩm công việc
          </Link>

          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{product?.label ?? flagship?.label ?? code}</h1>
            <p className="font-mono text-xs text-muted-foreground">
              {code} · v{product?.version ?? "—"}
              {product?.contractHash ? ` · ${product.contractHash.slice(0, 12)}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">{product?.objective}</p>
          </header>

          {product ? (
            <section className="grid gap-3 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-3">
              <span className="inline-flex items-center gap-1.5 text-sm">
                <Gauge className="h-4 w-4 text-primary" /> Ngưỡng chất lượng {product.quality.minimumQualityScore}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm">
                <Timer className="h-4 w-4 text-primary" /> SLA {formatDurationMs(product.sla.machineDurationMs)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" /> {product.action.maxAutonomy}
              </span>
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-base font-semibold">Bằng chứng vận hành (90 ngày, tổ chức hiện tại)</h2>
            {!cohort ? (
              <p className="text-sm text-muted-foreground">Chưa tính được cohort cho sản phẩm này.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">Trạng thái</p>
                  <p className="font-medium">{COHORT_STATUS_LABEL[cohort.cohortStatus]}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">Lượt chạy</p>
                  <p className="font-medium tabular-nums">{cohort.totalExecutions}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">Duyệt lần đầu</p>
                  <p className="font-medium">{pct(cohort.firstPassAcceptanceRate)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">Dữ liệu</p>
                  <p className="font-medium">{COMPLETENESS_LABEL[cohort.dataCompleteness as DataCompleteness]}</p>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-base font-semibold">Khởi chạy sản phẩm công việc</h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-64 flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">Công việc đã gán nhân sự AI</span>
                <select
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5"
                >
                  <option value="">— Chọn công việc —</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              {code === "MTE_V1" ? (
                <label className="flex min-w-64 flex-col gap-1 text-sm">
                  <span className="text-xs text-muted-foreground">Mã cuộc họp (bắt buộc)</span>
                  <input
                    value={meetingId}
                    onChange={(e) => setMeetingId(e.target.value)}
                    placeholder="UUID cuộc họp"
                    className="rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-xs"
                  />
                </label>
              ) : null}
              <button
                disabled={!taskId || launch.isPending}
                onClick={() => launch.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" /> {launch.isPending ? "Đang chạy…" : "Khởi chạy"}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Nhân sự AI chỉ soạn bản bàn giao và đề xuất hành động. Mọi thay đổi dữ liệu vẫn cần bạn xác nhận.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-base font-semibold">Lượt chạy gần đây</h2>
            {(runs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có lượt chạy nào cho sản phẩm này.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Bản bàn giao</th>
                      <th>Trạng thái</th>
                      <th>Vòng</th>
                      <th>Chất lượng</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(runs ?? []).map((r) => (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="py-2">
                          <Link to="/tasks/$id" params={{ id: r.taskId }} className="hover:underline">
                            {r.deliverableTitle ?? "(chưa có)"}
                          </Link>
                        </td>
                        <td>{r.status}</td>
                        <td className="tabular-nums">{r.revision}</td>
                        <td className="tabular-nums">{r.qualityScore ?? "—"}</td>
                        <td className="text-xs text-muted-foreground">
                          {r.errorCode ? FAILURE_LABEL[classifyFailure(r.errorCode)] : r.cohortClass === "REAL" ? "" : r.cohortClass}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
