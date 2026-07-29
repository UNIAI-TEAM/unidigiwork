import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, XCircle, RefreshCw, Filter, Bell, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  listQuotaCheckEvents,
  getQuotaCheckMetrics,
  listQuotaAlertRules,
  upsertQuotaAlertRule,
  deleteQuotaAlertRule,
  listQuotaAlertEvents,
  type QuotaAlertRule,
} from "@/lib/api/admin.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/quota")({
  head: () => ({
    meta: [
      { title: "Quota Observability — UNIWORK" },
      { name: "description", content: "Theo dõi check_quota theo tenant, meter và trạng thái PASS/FAIL trong 24h." },
    ],
  }),
  component: AdminQuotaPage,
});

type StatusFilter = "all" | "pass" | "fail";

function AdminQuotaPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tenantId, setTenantId] = useState<string>("");
  const [meterKey, setMeterKey] = useState<string>("");
  const qc = useQueryClient();

  const metricsQ = useQuery({
    queryKey: ["admin", "quota", "metrics"],
    queryFn: () => getQuotaCheckMetrics(),
    refetchInterval: 30_000,
  });

  const eventsQ = useQuery({
    queryKey: ["admin", "quota", "events", status, tenantId, meterKey],
    queryFn: () =>
      listQuotaCheckEvents({
        data: {
          status,
          tenantId: tenantId || undefined,
          meterKey: meterKey || undefined,
          limit: 200,
        },
      }),
    refetchInterval: 30_000,
  });

  const rulesQ = useQuery({
    queryKey: ["admin", "quota", "alert-rules"],
    queryFn: () => listQuotaAlertRules(),
  });
  const alertsQ = useQuery({
    queryKey: ["admin", "quota", "alert-events"],
    queryFn: () => listQuotaAlertEvents(),
    refetchInterval: 15_000,
  });

  // Realtime: refresh alert list when a new alert fires
  useEffect(() => {
    const ch = supabase
      .channel("quota-alert-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quota_alert_events" },
        (payload) => {
          const row = payload.new as { meter_key?: string; exceeded_count?: number };
          toast.warning(`Quota spike: ${row.meter_key ?? "meter"}`, {
            description: `${row.exceeded_count ?? "?"} lần exceeded trong cửa sổ giám sát.`,
          });
          qc.invalidateQueries({ queryKey: ["admin", "quota", "alert-events"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const metrics = metricsQ.data ?? [];
  const events = eventsQ.data ?? [];

  const summary = useMemo(() => {
    let total = 0, pass = 0, fail = 0, exceeded = 0, disabled = 0, noEnt = 0;
    for (const m of metrics) {
      total += m.total_checks;
      pass += m.pass_count;
      fail += m.fail_count;
      exceeded += m.fail_exceeded;
      disabled += m.fail_disabled;
      noEnt += m.fail_no_entitlement;
    }
    return { total, pass, fail, exceeded, disabled, noEnt };
  }, [metrics]);

  const meterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of metrics) set.add(m.meter_key);
    return Array.from(set).sort();
  }, [metrics]);

  const tenantOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of metrics) set.add(m.tenant_id);
    return Array.from(set).sort();
  }, [metrics]);

  const maxTotal = Math.max(1, ...metrics.map((m) => m.total_checks));

  const refresh = () => {
    metricsQ.refetch();
    eventsQ.refetch();
    alertsQ.refetch();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <StatCard label="Tổng checks" value={summary.total} tint="text-foreground" icon={Activity} />
        <StatCard label="PASS" value={summary.pass} tint="text-emerald-400" icon={CheckCircle2} />
        <StatCard label="FAIL" value={summary.fail} tint="text-rose-400" icon={XCircle} />
        <StatCard label="Exceeded" value={summary.exceeded} tint="text-amber-400" />
        <StatCard label="Disabled" value={summary.disabled} tint="text-orange-400" />
        <StatCard label="No entitlement" value={summary.noEnt} tint="text-muted-foreground" />
      </div>

      {/* Chart */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Phân bổ theo tenant × meter (24h)</h2>
            <p className="text-xs text-muted-foreground">Tỉ lệ PASS/FAIL trên tổng số checks.</p>
          </div>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${metricsQ.isFetching ? "animate-spin" : ""}`} /> Làm mới
          </button>
        </div>
        {metricsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Đang tải…</div>
        ) : metrics.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Chưa có check_quota nào trong 24h qua.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {metrics.map((m) => {
              const passPct = (m.pass_count / m.total_checks) * 100;
              const failPct = 100 - passPct;
              const widthPct = (m.total_checks / maxTotal) * 100;
              return (
                <div key={`${m.tenant_id}:${m.meter_key}`} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-foreground">{m.meter_key}</span>
                      <span className="text-muted-foreground">· {m.tenant_id.slice(0, 8)}…</span>
                    </div>
                    <div className="flex items-center gap-3 tabular-nums text-muted-foreground">
                      <span className="text-emerald-400">{m.pass_count} PASS</span>
                      <span className="text-rose-400">{m.fail_count} FAIL</span>
                      <span className="text-foreground">{m.total_checks}</span>
                    </div>
                  </div>
                  <div
                    className="flex h-2 overflow-hidden rounded-full bg-surface-2"
                    style={{ width: `${widthPct}%`, minWidth: "8%" }}
                  >
                    <div className="bg-emerald-500" style={{ width: `${passPct}%` }} />
                    <div className="bg-rose-500" style={{ width: `${failPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <AlertsSection
        rules={rulesQ.data ?? []}
        alerts={alertsQ.data ?? []}
        loadingRules={rulesQ.isLoading}
        loadingAlerts={alertsQ.isLoading}
        meterOptions={meterOptions}
        tenantOptions={tenantOptions}
        onChanged={() => {
          rulesQ.refetch();
        }}
      />

      {/* Events table */}
      <section className="rounded-2xl border border-border bg-surface">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">quota_check_events</h2>
            <p className="text-xs text-muted-foreground">200 sự kiện gần nhất trong 24h.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5"
            >
              <option value="all">Tất cả</option>
              <option value="pass">PASS</option>
              <option value="fail">FAIL</option>
            </select>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 font-mono"
            >
              <option value="">Mọi tenant</option>
              {tenantOptions.map((t) => (
                <option key={t} value={t}>{t.slice(0, 8)}…</option>
              ))}
            </select>
            <select
              value={meterKey}
              onChange={(e) => setMeterKey(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 font-mono"
            >
              <option value="">Mọi meter</option>
              {meterOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Thời điểm</th>
                <th className="px-3 py-2 text-left font-medium">Tenant</th>
                <th className="px-3 py-2 text-left font-medium">Meter</th>
                <th className="px-3 py-2 text-right font-medium">Δ</th>
                <th className="px-3 py-2 text-right font-medium">Usage / Limit</th>
                <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                <th className="px-3 py-2 text-left font-medium">Correlation</th>
              </tr>
            </thead>
            <tbody>
              {eventsQ.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Đang tải…
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Không có sự kiện nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id} className="border-t border-border/60 hover:bg-surface-2/50">
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(ev.occurred_at).toLocaleTimeString("vi-VN")}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {ev.tenant_id.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2 font-mono">{ev.meter_key}</td>
                    <td className="px-3 py-2 text-right tabular-nums">+{ev.requested_delta}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {ev.current_usage} / {ev.quota_limit ?? "∞"}
                    </td>
                    <td className="px-3 py-2">
                      {ev.allowed ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> PASS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-400">
                          <XCircle className="h-3 w-3" /> {ev.reason}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {ev.correlation_id ? ev.correlation_id.slice(0, 16) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tint,
  icon: Icon,
}: {
  label: string;
  value: number;
  tint: string;
  icon?: typeof Activity;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tint}`}>{value.toLocaleString("vi-VN")}</div>
    </div>
  );
}

function AlertsSection({
  rules,
  alerts,
  loadingRules,
  loadingAlerts,
  meterOptions,
  tenantOptions,
  onChanged,
}: {
  rules: QuotaAlertRule[];
  alerts: Awaited<ReturnType<typeof listQuotaAlertEvents>>;
  loadingRules: boolean;
  loadingAlerts: boolean;
  meterOptions: string[];
  tenantOptions: string[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<{
    tenant_id: string;
    meter_key: string;
    window_minutes: number;
    threshold_count: number;
    cooldown_minutes: number;
  }>({ tenant_id: "", meter_key: "", window_minutes: 5, threshold_count: 5, cooldown_minutes: 15 });

  const upsert = useMutation({
    mutationFn: (input: Parameters<typeof upsertQuotaAlertRule>[0]["data"]) =>
      upsertQuotaAlertRule({ data: input }),
    onSuccess: () => {
      toast.success("Đã lưu rule cảnh báo");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteQuotaAlertRule({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xóa rule");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-400" />
          <div>
            <h2 className="text-sm font-semibold">Cảnh báo quota spike (realtime)</h2>
            <p className="text-xs text-muted-foreground">
              Rule khớp cụ thể nhất sẽ áp dụng: (tenant, meter) &gt; (tenant, *) &gt; (*, meter) &gt; (*, *).
            </p>
          </div>
        </div>
      </div>

      {/* Add new rule */}
      <div className="grid grid-cols-2 gap-2 border-b border-border p-4 text-xs sm:grid-cols-6">
        <select
          value={draft.tenant_id}
          onChange={(e) => setDraft({ ...draft, tenant_id: e.target.value })}
          className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 font-mono"
        >
          <option value="">Mọi tenant</option>
          {tenantOptions.map((t) => (
            <option key={t} value={t}>{t.slice(0, 8)}…</option>
          ))}
        </select>
        <select
          value={draft.meter_key}
          onChange={(e) => setDraft({ ...draft, meter_key: e.target.value })}
          className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 font-mono"
        >
          <option value="">Mọi meter</option>
          {meterOptions.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <NumInput label="Window (m)" value={draft.window_minutes} onChange={(v) => setDraft({ ...draft, window_minutes: v })} />
        <NumInput label="Ngưỡng" value={draft.threshold_count} onChange={(v) => setDraft({ ...draft, threshold_count: v })} />
        <NumInput label="Cooldown (m)" value={draft.cooldown_minutes} onChange={(v) => setDraft({ ...draft, cooldown_minutes: v })} />
        <button
          onClick={() =>
            upsert.mutate({
              tenant_id: draft.tenant_id || null,
              meter_key: draft.meter_key || null,
              window_minutes: draft.window_minutes,
              threshold_count: draft.threshold_count,
              cooldown_minutes: draft.cooldown_minutes,
              enabled: true,
            })
          }
          disabled={upsert.isPending}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm rule
        </button>
      </div>

      {/* Rules list */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tenant</th>
              <th className="px-3 py-2 text-left font-medium">Meter</th>
              <th className="px-3 py-2 text-right font-medium">Window (m)</th>
              <th className="px-3 py-2 text-right font-medium">Ngưỡng</th>
              <th className="px-3 py-2 text-right font-medium">Cooldown (m)</th>
              <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loadingRules ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Đang tải…</td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Chưa có rule nào.</td></tr>
            ) : rules.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.tenant_id ? r.tenant_id.slice(0, 8) + "…" : "*"}</td>
                <td className="px-3 py-2 font-mono">{r.meter_key ?? "*"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.window_minutes}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.threshold_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.cooldown_minutes}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => upsert.mutate({ id: r.id, tenant_id: r.tenant_id, meter_key: r.meter_key, window_minutes: r.window_minutes, threshold_count: r.threshold_count, cooldown_minutes: r.cooldown_minutes, enabled: !r.enabled })}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${r.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"}`}
                  >
                    {r.enabled ? "Bật" : "Tắt"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => del.mutate(r.id)}
                    className="inline-flex items-center gap-1 rounded-md p-1 text-muted-foreground hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alert history */}
      <div className="border-t border-border p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" /> Cảnh báo gần đây
        </div>
        {loadingAlerts ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Đang tải…</div>
        ) : alerts.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Chưa có cảnh báo nào.</div>
        ) : (
          <ul className="flex flex-col gap-1.5 text-xs">
            {alerts.slice(0, 20).map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-2 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-amber-400">{a.meter_key}</span>
                  <span className="font-mono text-muted-foreground">· {a.tenant_id.slice(0, 8)}…</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="text-rose-400 tabular-nums">{a.exceeded_count} / {a.threshold_count}</span>
                  <span>{new Date(a.created_at).toLocaleString("vi-VN")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="w-full bg-transparent text-right tabular-nums outline-none"
      />
    </label>
  );
}