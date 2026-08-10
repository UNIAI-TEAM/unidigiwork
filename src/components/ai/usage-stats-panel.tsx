import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Clock3, Gauge, Loader2, Zap } from "lucide-react";
import { getAiUsageTimeseries } from "@/lib/api/ai-chat.functions";

type Granularity = "day" | "week";

function formatNumber(n: number) {
  return n.toLocaleString("vi-VN");
}

function formatDuration(ms: number) {
  if (!ms) return "0 giây";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m} phút ${rest} giây` : `${m} phút`;
  const h = Math.floor(m / 60);
  return `${h} giờ ${m % 60} phút`;
}

export function AiUsageStatsPanel({ workspaceId }: { workspaceId?: string }) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const fn = useServerFn(getAiUsageTimeseries);
  const days = granularity === "day" ? 14 : 84;

  const { data, isLoading } = useQuery({
    queryKey: ["ai-usage-timeseries", granularity, days, workspaceId ?? ""],
    queryFn: () => fn({ data: { granularity, days, ...(workspaceId ? { workspaceId } : {}) } }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải thống kê…
      </div>
    );
  }

  const totals = data?.totals ?? {
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    requests: 0,
    durationMs: 0,
  };
  const series = data?.workspaces ?? [];
  const maxBucket = Math.max(1, ...series.flatMap((w) => w.buckets.map((b) => b.tokens)));

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Thống kê sử dụng AI</h2>
          <p className="text-sm text-muted-foreground">
            Tokens và thời lượng xử lý theo{" "}
            {granularity === "day" ? "ngày (14 ngày gần nhất)" : "tuần (12 tuần gần nhất)"}
          </p>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {(["day", "week"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                granularity === g
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {g === "day" ? "Theo ngày" : "Theo tuần"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Zap} label="Tổng tokens" value={formatNumber(totals.tokens)} />
        <StatCard
          icon={Gauge}
          label="Vào / ra"
          value={`${formatNumber(totals.inputTokens)} / ${formatNumber(totals.outputTokens)}`}
        />
        <StatCard icon={Activity} label="Lượt gọi" value={formatNumber(totals.requests)} />
        <StatCard icon={Clock3} label="Thời lượng xử lý" value={formatDuration(totals.durationMs)} />
      </div>

      {series.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          Chưa có dữ liệu sử dụng trong khoảng thời gian này.
        </p>
      ) : (
        <div className="space-y-4">
          {series.map((ws) => (
            <div
              key={ws.workspaceId ?? "none"}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{ws.workspaceName}</h3>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{formatNumber(ws.tokens)} tokens</span>
                  <span>{formatNumber(ws.requests)} lượt</span>
                  <span>{formatDuration(ws.durationMs)}</span>
                </div>
              </div>

              <div className="mt-4 flex h-32 items-end gap-1">
                {ws.buckets.map((b) => (
                  <div
                    key={b.bucket}
                    className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                    title={`${b.label}: ${formatNumber(b.tokens)} tokens · ${formatNumber(b.requests)} lượt · ${formatDuration(b.durationMs)}`}
                  >
                    <div
                      className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                      style={{ height: `${Math.max(2, (b.tokens / maxBucket) * 100)}%` }}
                    />
                    <span className="w-full truncate text-center text-[9px] text-muted-foreground">
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1.5 text-lg font-semibold">{value}</div>
    </div>
  );
}
