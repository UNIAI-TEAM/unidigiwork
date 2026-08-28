// SWP-2 — Bảng điều khiển chương trình thí điểm thương mại (nội bộ).
// Mọi chỉ số do RPC compute_sell_work_pilot_portfolio tính. UI chỉ hiển thị.
// Không hiển thị nội dung công việc của khách hàng — chỉ metadata thương mại.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  createPilot,
  getPilotPortfolio,
  listPilotEligibleTenants,
} from "@/lib/api/sell-work-pilots.functions";
import {
  PILOT_STATUS_LABEL,
  WTP_LABEL,
  type PilotStatus,
  type WtpSignal,
} from "@/domain/sell-work/pilot";
import { SWP1_FLAGSHIPS } from "@/domain/sell-work/cohort";

export const Route = createFileRoute("/_authenticated/admin/sell-work/pilots")({
  head: () => ({
    meta: [
      { title: "Chương trình thí điểm thương mại — Quản trị UNIWORK" },
      {
        name: "description",
        content:
          "Danh mục pilot Sell Work: kích hoạt sản phẩm công việc, khối lượng chạy, nghiệm thu, tín hiệu chi trả và phụ thuộc dịch vụ.",
      },
      { property: "og:title", content: "Chương trình thí điểm thương mại — UNIWORK" },
      { property: "og:description", content: "Bằng chứng thương mại thật của ba sản phẩm công việc chủ lực." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PilotsPage,
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function StatusPill({ status }: { status: PilotStatus }) {
  const tone =
    status === "PAID_PILOT" || status === "EXPANSION_SIGNAL"
      ? "bg-primary/10 text-primary"
      : status === "ACTIVE_PILOT" || status === "REPEAT_USAGE" || status === "VALUE_PROVEN"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : status === "LOST"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tone}`}>{PILOT_STATUS_LABEL[status]}</span>;
}

function PilotsPage() {
  const qc = useQueryClient();
  const [days, setDays] = useState(90);
  const [creating, setCreating] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [industry, setIndustry] = useState("");
  const [segment, setSegment] = useState("");

  const portfolioFn = useServerFn(getPilotPortfolio);
  const tenantsFn = useServerFn(listPilotEligibleTenants);
  const createFn = useServerFn(createPilot);

  const portfolio = useQuery({
    queryKey: ["swp2", "portfolio", days],
    queryFn: () => portfolioFn({ data: { days } }),
  });
  const tenants = useQuery({ queryKey: ["swp2", "tenants"], queryFn: () => tenantsFn(), enabled: creating });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          tenantId,
          industry: industry || null,
          customerSegment: segment || null,
        },
      }),
    onSuccess: () => {
      toast.success("Đã tạo pilot");
      setCreating(false);
      setTenantId("");
      setIndustry("");
      setSegment("");
      void qc.invalidateQueries({ queryKey: ["swp2"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = portfolio.data;
  const s = p?.summary;
  const sd = p?.servicesDependency;
  const pctPilots = (n: number | undefined) =>
    !sd || !sd.pilotsTotal || n === undefined ? "Không đủ dữ liệu" : `${Math.round((100 * n) / sd.pilotsTotal)}% (N=${sd.pilotsTotal})`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Briefcase className="h-5 w-5 text-primary" aria-hidden />
            Chương trình thí điểm thương mại (SWP-2)
          </h1>
          <p className="text-sm text-muted-foreground">
            Bằng chứng thương mại thật: kích hoạt, nghiệm thu, dùng lặp lại, kinh tế đơn vị và mức sẵn sàng chi trả.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Cửa sổ đo"
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={30}>30 ngày</option>
            <option value={90}>90 ngày</option>
            <option value={180}>180 ngày</option>
            <option value={365}>365 ngày</option>
          </select>
          <button
            type="button"
            onClick={() => void portfolio.refetch()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted"
          >
            <RefreshCw className={`h-4 w-4 ${portfolio.isFetching ? "animate-spin" : ""}`} aria-hidden /> Làm mới
          </button>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden /> Pilot mới
          </button>
        </div>
      </header>

      {portfolio.isError ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Không đọc được danh mục pilot — cần quyền quản trị nền tảng.
        </p>
      ) : null}

      {creating ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Tạo pilot mới</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Pilot luôn gắn với một tổ chức có thật. Không tạo hồ sơ khách hàng giả.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Tổ chức</span>
              <select
                className="h-9 w-full rounded-lg border border-border bg-background px-2"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              >
                <option value="">— Chọn tổ chức —</option>
                {(tenants.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Ngành</span>
              <input
                className="h-9 w-full rounded-lg border border-border bg-background px-2"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Xây dựng, phần mềm…"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Phân khúc</span>
              <input
                className="h-9 w-full rounded-lg border border-border bg-background px-2"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                placeholder="SMB, Enterprise…"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!tenantId || create.isPending}
            onClick={() => create.mutate()}
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Tạo pilot
          </button>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Tổng pilot" value={String(s?.totalPilots ?? 0)} />
        <Stat label="Đang thí điểm" value={String(s?.activePilots ?? 0)} />
        <Stat label="Trả phí (đã xác minh)" value={String(s?.paidPilots ?? 0)} />
        <Stat label="Có tín hiệu chi trả" value={String(s?.customersWithWtpSignal ?? 0)} />
        <Stat label="Tín hiệu mở rộng" value={String(s?.expansionSignals ?? 0)} />
        <Stat label="Đã mất" value={String(s?.lostPilots ?? 0)} />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Phụ thuộc dịch vụ</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Sản phẩm "bán công việc" cần nhiều tư vấn/thiết lập riêng cho từng khách thì chưa mở rộng quy mô được.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Cần phát triển riêng" value={pctPilots(sd?.pilotsWithCustomEngineering)} />
          <Stat label="Cần thiết lập dữ liệu thủ công" value={pctPilots(sd?.pilotsWithManualDataSetup)} />
          <Stat label="Cần hỗ trợ lặp lại" value={pctPilots(sd?.pilotsWithRepeatedSupport)} />
          <Stat label="Tổng phút hỗ trợ" value={String(sd?.supportMinutesTotal ?? 0)} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface">
        <header className="border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">Danh mục pilot</h2>
          <p className="text-xs text-muted-foreground">
            Cửa sổ đo: {days} ngày · Sản phẩm chủ lực: {SWP1_FLAGSHIPS.map((f) => f.code).join(", ")}
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2">Khách hàng</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="px-3 py-2 text-right">Lượt chạy</th>
                <th className="px-3 py-2 text-right">Nghiệm thu</th>
                <th className="px-3 py-2">Chi trả</th>
                <th className="px-3 py-2 text-right">Hỗ trợ</th>
              </tr>
            </thead>
            <tbody>
              {(p?.pilots ?? []).map((row) => (
                <tr key={row.pilotId} className="border-t border-border/60">
                  <td className="px-5 py-2">
                    <Link
                      to="/admin/sell-work/pilots/$pilotId"
                      params={{ pilotId: row.pilotId }}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.tenantName ?? "Tổ chức"}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">
                      {[row.industry, row.customerSegment].filter(Boolean).join(" · ") || "Chưa phân loại"}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {row.products.length ? row.products.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.executions}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.acceptedExecutions}</td>
                  <td className="px-3 py-2 text-[11px]">
                    {WTP_LABEL[row.wtpSignal as WtpSignal]}
                    {row.paidVerifiedAt ? " · đã xác minh" : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.supportInterventions}</td>
                </tr>
              ))}
              {!portfolio.isLoading && (p?.pilots ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Chưa có pilot nào. Số liệu thương mại chỉ xuất hiện khi có khách hàng thật.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
