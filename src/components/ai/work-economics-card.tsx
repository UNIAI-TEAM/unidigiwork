// WE-1 — thẻ hiển thị số đo kinh tế của một lượt AI thực thi công việc.
// Chỉ hiển thị số ĐÃ ĐO THẬT; tín hiệu thiếu được nói rõ thay vì hiển thị 0.
import { useQuery } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { getWorkExecutionMetrics } from "@/lib/api/work-economics.functions";
import {
  TOKEN_SOURCE_LABEL,
  describeMissingSignals,
  formatDurationMs,
  type TokenSource,
  type WorkExecutionMetricsRow,
} from "@/domain/work-economics/contracts";

export function WorkEconomicsCard({ executionId }: { executionId: string }) {
  const q = useQuery({
    queryKey: ["work-execution-metrics", executionId],
    queryFn: () => getWorkExecutionMetrics({ data: { executionId } }),
    staleTime: 30_000,
  });

  const m = q.data as WorkExecutionMetricsRow | null | undefined;
  if (!m) return null;

  const missing = describeMissingSignals(m.missing_signals ?? []);

  return (
    <div className="mt-3 rounded-md border border-border bg-surface p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground">Kinh tế công việc</span>
        <span className="text-muted-foreground">
          {m.work_unit_resolved ? `${m.work_unit_code} v${m.work_unit_version}` : "Chưa ánh xạ đơn vị công việc"}
        </span>
        {m.sla_met !== null ? (
          <span className={m.sla_met ? "text-success" : "text-warning"}>
            {m.sla_met ? "Trong ngưỡng thời gian" : "Vượt ngưỡng thời gian"}
          </span>
        ) : null}
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-3">
        <Item label="Thời gian máy" value={formatDurationMs(m.machine_duration_ms)} />
        <Item label="Thời gian thực tế" value={formatDurationMs(m.wall_duration_ms)} />
        <Item label="Chờ xếp hàng" value={formatDurationMs(m.queue_wait_ms)} />
        <Item label="Lần gọi mô hình" value={String(m.model_calls)} />
        <Item
          label="Token"
          value={
            m.token_source === "MISSING"
              ? "—"
              : `${(m.total_tokens ?? 0).toLocaleString("vi-VN")} (${TOKEN_SOURCE_LABEL[m.token_source as TokenSource]})`
          }
        />
        <Item label="Nguồn ngữ cảnh" value={m.context_source_count === null ? "—" : String(m.context_source_count)} />
        <Item label="Bước" value={`${m.step_total} · lỗi ${m.step_failed}`} />
        <Item
          label="Đề xuất hành động"
          value={`${m.proposals_total} · thực thi ${m.proposals_executed}`}
        />
        <Item
          label="Con người can thiệp"
          value={`${m.human_confirmations + m.human_review_events} lần · ${m.revision_count} bản`}
        />
        <Item label="Kết quả" value={m.outcome_type ?? "—"} />
        <Item label="Đã kiểm chứng" value={m.outcome_verified ? "Có" : "Chưa"} />
        <Item label="Đã nghiệm thu" value={m.outcome_accepted ? "Có" : "Chưa"} />
      </dl>

      {missing.length ? (
        <p className="mt-2 text-[11px] text-warning">Chưa đo được: {missing.join("; ")}.</p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Số đo do máy chủ tính lại từ dữ liệu đã ghi ({m.metrics_version}); không có ước lượng.
      </p>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px]">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
