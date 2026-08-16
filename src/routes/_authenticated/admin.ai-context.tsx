import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Gauge, RefreshCw, Scissors, Timer } from "lucide-react";
import {
  getAiContextBudgetMetrics,
  listAiContextMetrics,
} from "@/lib/api/ai-context.functions";

export const Route = createFileRoute("/_authenticated/admin/ai-context")({
  head: () => ({
    meta: [
      { title: "Context Budget — Quản trị UNIWORK" },
      { name: "description", content: "Theo dõi estimatedTokens, truncated và latency P50/P95/P99 của AI Context Engine." },
      { property: "og:title", content: "Context Budget — Quản trị UNIWORK" },
      { property: "og:description", content: "Telemetry ngân sách ngữ cảnh AI theo từng request." },
    ],
  }),
  component: AdminAiContextPage,
});

const WINDOWS = [
  { hours: 1, label: "1 giờ" },
  { hours: 24, label: "24 giờ" },
  { hours: 168, label: "7 ngày" },
  { hours: 720, label: "30 ngày" },
];

const fmt = (n: number | undefined) => Math.round(Number(n ?? 0)).toLocaleString("vi-VN");
const pct = (n: number | undefined) => `${(Number(n ?? 0) * 100).toFixed(1)}%`;

function StatCard({
  title,
  icon: Icon,
  unit,
  p50,
  p95,
  p99,
  max,
}: {
  title: string;
  icon: typeof Gauge;
  unit: string;
  p50?: number;
  p95?: number;
  p99?: number;
  max?: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ["P50", p50],
          ["P95", p95],
          ["P99", p99],
          ["Max", max],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-surface-2 px-2 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-sm font-semibold tabular-nums">{fmt(value as number)}</div>
            <div className="text-[10px] text-muted-foreground">{unit}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminAiContextPage() {
  const [hours, setHours] = useState(24);
  const metrics = useQuery({
    queryKey: ["admin", "ai-context", "metrics", hours],
    queryFn: () => getAiContextBudgetMetrics({ data: { hours } }),
    refetchInterval: 60_000,
  });
  const rows = useQuery({
    queryKey: ["admin", "ai-context", "rows"],
    queryFn: () => listAiContextMetrics({ data: { limit: 50 } }),
    refetchInterval: 60_000,
  });

  const m = metrics.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Ngân sách ngữ cảnh AI</h2>
          <p className="text-sm text-muted-foreground">
            estimatedTokens, tỉ lệ cắt bớt và độ trễ theo từng request của AI Context Engine.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-border bg-surface p-1 text-xs">
            {WINDOWS.map((w) => (
              <button
                key={w.hours}
                type="button"
                onClick={() => setHours(w.hours)}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  hours === w.hours ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              void metrics.refetch();
              void rows.refetch();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${metrics.isFetching ? "animate-spin" : ""}`} /> Làm mới
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-muted-foreground">Số request</div>
          <div className="text-2xl font-semibold tabular-nums">{fmt(m?.requestCount)}</div>
          <div className="mt-1 text-xs text-muted-foreground">TB {Number(m?.avgSources ?? 0).toFixed(1)} nguồn/request</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Scissors className="h-3.5 w-3.5" /> Bị cắt ngân sách
          </div>
          <div className="text-2xl font-semibold tabular-nums">{pct(m?.truncatedRate)}</div>
          <div className="mt-1 text-xs text-muted-foreground">partial {pct(m?.partialRate)}</div>
        </div>
        <StatCard title="estimatedTokens" icon={Gauge} unit="token" p50={m?.tokens.p50} p95={m?.tokens.p95} p99={m?.tokens.p99} max={m?.tokens.max} />
        <StatCard title="Độ trễ" icon={Timer} unit="ms" p50={m?.latencyMs.p50} p95={m?.latencyMs.p95} p99={m?.latencyMs.p99} max={m?.latencyMs.max} />
      </div>

      {(m?.byOperation?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-2 text-sm font-medium">Theo loại thao tác</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {m!.byOperation.map((op) => (
              <div key={op.operation} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-xs">
                <span className="font-mono">{op.operation}</span>
                <span className="text-muted-foreground">
                  {fmt(op.count)} req · tokens P95 {fmt(op.tokens_p95)} · latency P95 {fmt(op.latency_p95)}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">Request gần đây</div>
        {rows.isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Đang tải…</p>
        ) : (rows.data?.length ?? 0) === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu telemetry trong khoảng này.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Thời điểm</th>
                  <th className="px-3 py-2 font-medium">Op</th>
                  <th className="px-3 py-2 font-medium">Strategy</th>
                  <th className="px-3 py-2 font-medium text-right">Tokens</th>
                  <th className="px-3 py-2 font-medium text-right">Nguồn</th>
                  <th className="px-3 py-2 font-medium text-right">Latency</th>
                  <th className="px-3 py-2 font-medium">Cờ</th>
                </tr>
              </thead>
              <tbody>
                {rows.data!.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-2 font-mono">{r.operation}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.strategy ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(r.estimated_tokens)}
                      <span className="text-muted-foreground">/{fmt(r.max_tokens)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.source_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.latency_ms)}ms</td>
                    <td className="px-3 py-2">
                      <span className="flex gap-1">
                        {r.truncated && (
                          <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning-foreground">truncated</span>
                        )}
                        {r.partial && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">partial</span>
                        )}
                        {!r.truncated && !r.partial && <span className="text-muted-foreground">—</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
