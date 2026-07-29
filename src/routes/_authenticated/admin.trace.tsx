import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, Activity, ShieldCheck, Radio, CheckCircle2, XCircle, ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { traceByCorrelationId } from "@/lib/api/admin.functions";

const searchSchema = z.object({ cid: z.string().trim().max(200).optional() });

export const Route = createFileRoute("/_authenticated/admin/trace")({
  head: () => ({
    meta: [
      { title: "Trace theo correlation_id — UNIWORK" },
      { name: "description", content: "Truy vết request end-to-end qua quota_check_events, audit_events, outbox_events." },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AdminTracePage,
});

type TraceResult = Awaited<ReturnType<typeof traceByCorrelationId>>;
type TimelineItem = TraceResult["timeline"][number];

function AdminTracePage() {
  const { cid } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [input, setInput] = useState<string>(cid ?? "");
  const [result, setResult] = useState<TraceResult | null>(null);

  const traceMut = useMutation({
    mutationFn: (correlationId: string) => traceByCorrelationId({ data: { correlationId, limit: 500 } }),
    onSuccess: (data) => {
      setResult(data);
      if (data.counts.total === 0) toast.info("Không tìm thấy event nào với correlation_id này.");
    },
    onError: (e: Error) => toast.error(e.message ?? "Không truy vết được"),
  });

  // Auto-run when arriving with ?cid=
  useEffect(() => {
    if (cid && cid.trim()) {
      setInput(cid);
      traceMut.mutate(cid.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const submit = () => {
    const v = input.trim();
    if (!v) {
      toast.error("Nhập correlation_id trước");
      return;
    }
    navigate({ search: (prev: { cid?: string }) => ({ ...prev, cid: v }) });
    traceMut.mutate(v);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-xs">
        <Link
          to="/_authenticated/admin/quota"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Quota Observability
        </Link>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">Trace theo correlation_id</h1>
            <p className="text-xs text-muted-foreground">
              Truy vết end-to-end: quota_check_events, audit_events, outbox_events cùng correlation_id, xếp theo thời gian.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Ví dụ: 018f9c3a-8b2e-7a3f-b5e0-1c9f8e6b4a2d"
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs outline-none focus:border-primary/60"
            maxLength={200}
          />
          <button
            onClick={submit}
            disabled={traceMut.isPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Search className={`h-3.5 w-3.5 ${traceMut.isPending ? "animate-pulse" : ""}`} />
            {traceMut.isPending ? "Đang truy vết…" : "Truy vết"}
          </button>
        </div>
      </section>

      {result ? (
        <TraceResultView result={result} />
      ) : traceMut.isPending ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          Đang truy vết…
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-10 text-center text-xs text-muted-foreground">
          Nhập correlation_id và bấm Truy vết để xem timeline.
        </div>
      )}
    </div>
  );
}

function TraceResultView({ result }: { result: TraceResult }) {
  const { correlationId, counts, timeline } = result;
  const copyCid = () => {
    navigator.clipboard.writeText(correlationId).then(
      () => toast.success("Đã copy correlation_id"),
      () => toast.error("Copy thất bại"),
    );
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountCard label="Tổng events" value={counts.total} icon={Activity} tint="text-foreground" />
        <CountCard label="Quota checks" value={counts.quota} icon={CheckCircle2} tint="text-emerald-400" />
        <CountCard label="Audit" value={counts.audit} icon={ShieldCheck} tint="text-sky-400" />
        <CountCard label="Outbox" value={counts.outbox} icon={Radio} tint="text-amber-400" />
      </div>

      <section className="rounded-2xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">correlation_id</span>
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-foreground">{correlationId}</code>
            <button
              onClick={copyCid}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <h2 className="text-sm font-semibold">Timeline</h2>
        </div>
        {timeline.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Không có event nào.</div>
        ) : (
          <ol className="divide-y divide-border">
            {timeline.map((item, idx) => (
              <TimelineRow key={`${item.kind}-${idx}`} item={item} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const t = new Date(item.at);
  const time = t.toLocaleTimeString("vi-VN", { hour12: false });
  const date = t.toLocaleDateString("vi-VN");

  return (
    <li className="flex flex-col gap-2 p-4 text-xs sm:flex-row sm:items-start sm:gap-4">
      <div className="flex w-40 shrink-0 flex-col gap-0.5 text-muted-foreground">
        <span className="tabular-nums text-foreground">{time}</span>
        <span>{date}</span>
        <KindBadge kind={item.kind} />
      </div>
      <div className="flex-1 min-w-0">
        {item.kind === "quota_check" ? (
          <QuotaEventRow data={item.data as unknown as QuotaEvent} />
        ) : item.kind === "audit" ? (
          <AuditEventRow data={item.data as unknown as AuditEvent} />
        ) : (
          <OutboxEventRow data={item.data as unknown as OutboxEvent} />
        )}
      </div>
    </li>
  );
}

type QuotaEvent = {
  id: string;
  tenant_id: string;
  meter_key: string;
  quota_limit: number | null;
  current_usage: number;
  requested_delta: number;
  allowed: boolean;
  reason: string;
  actor_id: string | null;
};

function QuotaEventRow({ data }: { data: QuotaEvent }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-foreground">{data.meter_key}</span>
        {data.allowed ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> PASS
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-400">
            <XCircle className="h-3 w-3" /> {data.reason}
          </span>
        )}
        <span className="tabular-nums text-muted-foreground">
          Δ +{data.requested_delta} · {data.current_usage}/{data.quota_limit ?? "∞"}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
        <span>tenant: {data.tenant_id.slice(0, 8)}…</span>
        {data.actor_id && <span>actor: {data.actor_id.slice(0, 8)}…</span>}
      </div>
    </div>
  );
}

type AuditEvent = {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  action: string | null;
  resource_type: string | null;
  resource_id: string | null;
  event_type: string | null;
  aggregate_type: string | null;
  aggregate_id: string | null;
  payload: unknown;
};

function AuditEventRow({ data }: { data: AuditEvent }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-foreground">
          {data.event_type ?? data.action ?? "audit"}
        </span>
        {data.aggregate_type && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted-foreground">
            {data.aggregate_type}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
        {data.tenant_id && <span>tenant: {data.tenant_id.slice(0, 8)}…</span>}
        {data.actor_user_id && <span>actor: {data.actor_user_id.slice(0, 8)}…</span>}
        {data.aggregate_id && <span>id: {String(data.aggregate_id).slice(0, 16)}…</span>}
        {data.resource_type && <span>res: {data.resource_type}</span>}
      </div>
      {data.payload && Object.keys(data.payload as object).length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">payload</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-surface-2 p-2 font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(data.payload, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

type OutboxEvent = {
  id: string;
  tenant_id: string | null;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  processed_at: string | null;
};

function OutboxEventRow({ data }: { data: OutboxEvent }) {
  const statusTint =
    data.status === "succeeded" || data.status === "processed" || data.processed_at
      ? "bg-emerald-500/10 text-emerald-400"
      : data.status === "failed"
      ? "bg-rose-500/10 text-rose-400"
      : data.status === "running"
      ? "bg-amber-500/10 text-amber-400"
      : "bg-surface-2 text-muted-foreground";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-foreground">{data.event_type}</span>
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${statusTint}`}>{data.status}</span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted-foreground">
          {data.aggregate_type}
        </span>
        {data.attempt_count > 0 && (
          <span className="text-muted-foreground">attempts: {data.attempt_count}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
        {data.tenant_id && <span>tenant: {data.tenant_id.slice(0, 8)}…</span>}
        <span>id: {String(data.aggregate_id).slice(0, 16)}…</span>
        {data.processed_at && (
          <span>processed: {new Date(data.processed_at).toLocaleTimeString("vi-VN", { hour12: false })}</span>
        )}
      </div>
      {data.last_error && (
        <p className="mt-0.5 rounded bg-rose-500/5 p-1.5 text-[11px] text-rose-400">
          {data.last_error}
        </p>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: TimelineItem["kind"] }) {
  const map: Record<TimelineItem["kind"], { label: string; className: string }> = {
    quota_check: { label: "quota", className: "bg-emerald-500/10 text-emerald-400" },
    audit: { label: "audit", className: "bg-sky-500/10 text-sky-400" },
    outbox: { label: "outbox", className: "bg-amber-500/10 text-amber-400" },
  };
  const m = map[kind];
  return (
    <span className={`inline-flex w-fit items-center rounded px-1.5 py-0.5 font-mono text-[10px] ${m.className}`}>
      {m.label}
    </span>
  );
}

function CountCard({
  label,
  value,
  icon: Icon,
  tint,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tint}`}>{value.toLocaleString("vi-VN")}</div>
    </div>
  );
}