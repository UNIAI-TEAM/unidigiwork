// SWP-2 — Chi tiết pilot thương mại.
// Chỉ hiển thị metadata thương mại + số liệu tổng hợp do server tính.
// KHÔNG hiển thị transcript, tài liệu, email hay nội dung công việc của khách hàng.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BadgeDollarSign, LifeBuoy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getPilotMetrics,
  listPilotCommercialEvents,
  listPilotPricingExperiments,
  listPilotSupport,
  recordPilotSupport,
  recordPricingExperiment,
  setPilotStatus,
  setPilotWtp,
  setPricingResponse,
  upsertPilotProduct,
  verifyPaidPilot,
} from "@/lib/api/sell-work-pilots.functions";
import {
  COMMERCIAL_EVENT_LABEL,
  HEALTH_FACTOR_LABEL,
  PILOT_HEALTH_LABEL,
  PILOT_STATUS_LABEL,
  PILOT_TRANSITIONS,
  PRICING_RESPONSE_LABEL,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABEL,
  WTP_LABEL,
  WTP_SIGNALS,
  msToDays,
  rateWithSample,
  type CommercialEventType,
  type PilotHealth,
  type PilotHealthFactors,
  type PilotStatus,
  type PricingResponse,
  type SupportCategory,
  type WtpSignal,
} from "@/domain/sell-work/pilot";
import { SWP1_FLAGSHIPS } from "@/domain/sell-work/cohort";

export const Route = createFileRoute("/_authenticated/admin/sell-work/pilots/$pilotId")({
  head: () => ({
    meta: [
      { title: "Chi tiết pilot — Quản trị UNIWORK" },
      { name: "description", content: "Chỉ số vận hành, kinh tế đơn vị và bằng chứng thương mại của một pilot." },
      { property: "og:title", content: "Chi tiết pilot — UNIWORK" },
      { property: "og:description", content: "Bằng chứng thương mại theo từng khách hàng thí điểm." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PilotDetailPage,
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

function HealthPill({ health }: { health: PilotHealth }) {
  const tone =
    health === "GREEN"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : health === "YELLOW"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-destructive/10 text-destructive";
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tone}`}>{PILOT_HEALTH_LABEL[health]}</span>;
}

function PilotDetailPage() {
  const { pilotId } = Route.useParams();
  const qc = useQueryClient();

  const metricsFn = useServerFn(getPilotMetrics);
  const eventsFn = useServerFn(listPilotCommercialEvents);
  const pricingFn = useServerFn(listPilotPricingExperiments);
  const supportListFn = useServerFn(listPilotSupport);
  const statusFn = useServerFn(setPilotStatus);
  const wtpFn = useServerFn(setPilotWtp);
  const paidFn = useServerFn(verifyPaidPilot);
  const productFn = useServerFn(upsertPilotProduct);
  const pricingCreateFn = useServerFn(recordPricingExperiment);
  const pricingRespFn = useServerFn(setPricingResponse);
  const supportFn = useServerFn(recordPilotSupport);

  const metrics = useQuery({ queryKey: ["swp2", "pilot", pilotId], queryFn: () => metricsFn({ data: { pilotId } }) });
  const events = useQuery({ queryKey: ["swp2", "events", pilotId], queryFn: () => eventsFn({ data: { pilotId } }) });
  const pricing = useQuery({ queryKey: ["swp2", "pricing", pilotId], queryFn: () => pricingFn({ data: { pilotId } }) });
  const support = useQuery({ queryKey: ["swp2", "support", pilotId], queryFn: () => supportListFn({ data: { pilotId } }) });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["swp2"] });
  const onError = (e: Error) => toast.error(e.message);

  const changeStatus = useMutation({
    mutationFn: (v: { status: PilotStatus; reason?: string }) =>
      statusFn({ data: { pilotId, status: v.status, reason: v.reason ?? null } }),
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái");
      refresh();
    },
    onError,
  });

  const [productCode, setProductCode] = useState(SWP1_FLAGSHIPS[0].code as string);
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "AD_HOC">("WEEKLY");
  const [criteria, setCriteria] = useState("");
  const activateProduct = useMutation({
    mutationFn: () =>
      productFn({
        data: {
          pilotId,
          code: productCode,
          version: 1,
          expectedFrequency: frequency,
          successCriteria: criteria || null,
          activate: true,
        },
      }),
    onSuccess: () => {
      toast.success("Đã kích hoạt sản phẩm công việc");
      setCriteria("");
      refresh();
    },
    onError,
  });

  const [wtp, setWtp] = useState<WtpSignal>("INTERESTED");
  const [wtpAmount, setWtpAmount] = useState("");
  const saveWtp = useMutation({
    mutationFn: () =>
      wtpFn({
        data: {
          pilotId,
          signal: wtp,
          amount: wtpAmount ? Number(wtpAmount) : null,
          currency: wtpAmount ? "USD" : null,
        },
      }),
    onSuccess: () => {
      toast.success("Đã ghi tín hiệu chi trả");
      refresh();
    },
    onError,
  });

  const [evidence, setEvidence] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const verifyPaid = useMutation({
    mutationFn: () =>
      paidFn({
        data: {
          pilotId,
          evidenceReference: evidence,
          amount: Number(paidAmount),
          currency: "USD",
          revenueClass: "PILOT_FEE",
          revenueGroup: "SELL_WORK",
        },
      }),
    onSuccess: () => {
      toast.success("Đã xác minh pilot trả phí");
      setEvidence("");
      setPaidAmount("");
      refresh();
    },
    onError,
  });

  const [price, setPrice] = useState("");
  const [basis, setBasis] = useState<"PER_EXECUTION" | "PER_ACCEPTED_OUTCOME" | "MONTHLY_BUNDLE" | "SUBSCRIPTION_INCLUDED" | "CUSTOM">(
    "PER_ACCEPTED_OUTCOME",
  );
  const addPricing = useMutation({
    mutationFn: () =>
      pricingCreateFn({
        data: { pilotId, code: productCode, version: 1, pricingBasis: basis, price: Number(price), currency: "USD" },
      }),
    onSuccess: () => {
      toast.success("Đã ghi kịch bản giá");
      setPrice("");
      refresh();
    },
    onError,
  });

  const respond = useMutation({
    mutationFn: (v: { experimentId: string; response: PricingResponse }) =>
      pricingRespFn({ data: { experimentId: v.experimentId, response: v.response } }),
    onSuccess: () => {
      toast.success("Đã ghi phản hồi khách hàng");
      refresh();
    },
    onError,
  });

  const [supportCat, setSupportCat] = useState<SupportCategory>("PRODUCT_SUPPORT");
  const [supportMinutes, setSupportMinutes] = useState("");
  const addSupport = useMutation({
    mutationFn: () =>
      supportFn({
        data: { pilotId, category: supportCat, minutes: supportMinutes ? Number(supportMinutes) : null },
      }),
    onSuccess: () => {
      toast.success("Đã ghi công hỗ trợ");
      setSupportMinutes("");
      refresh();
    },
    onError,
  });

  const m = metrics.data;
  if (metrics.isError) {
    return (
      <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Không đọc được pilot này — cần quyền quản trị nền tảng.
      </p>
    );
  }
  if (!m) return <p className="p-4 text-sm text-muted-foreground">Đang tải chỉ số pilot…</p>;

  const e = m.execution;
  const N = e.totalExecutions ?? 0;
  const cur = e.currency ?? "";
  const money = (v: number | null) =>
    v === null || v === undefined ? "Không đủ dữ liệu" : e.currencyMismatch ? "Trộn nhiều loại tiền" : `${v} ${cur}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/sell-work/pilots" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Danh mục pilot
          </Link>
          <h1 className="text-xl font-semibold">
            Pilot · {PILOT_STATUS_LABEL[m.status]} <HealthPill health={m.health} />
          </h1>
          <p className="text-xs text-muted-foreground">
            {[m.industry, m.customerSegment].filter(Boolean).join(" · ") || "Chưa phân loại"} · cửa sổ đo{" "}
            {new Date(m.windowFrom).toLocaleDateString("vi-VN")} → {new Date(m.windowTo).toLocaleDateString("vi-VN")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(PILOT_TRANSITIONS[m.status] ?? []).map((next) => (
            <button
              key={next}
              type="button"
              onClick={() =>
                changeStatus.mutate({
                  status: next,
                  reason: next === "LOST" ? (window.prompt("Lý do mất pilot (mã)?", "NO_REPEAT_USAGE") ?? undefined) : undefined,
                })
              }
              className="h-8 rounded-lg border border-border px-3 text-xs hover:bg-muted"
            >
              → {PILOT_STATUS_LABEL[next]}
            </button>
          ))}
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Sức khoẻ pilot (logic minh bạch)</h2>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(HEALTH_FACTOR_LABEL) as (keyof PilotHealthFactors)[]).map((k) => (
            <li key={k} className="flex items-center gap-2">
              <span className={m.healthFactors?.[k] ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                {m.healthFactors?.[k] ? "✓" : "○"}
              </span>
              {HEALTH_FACTOR_LABEL[k]}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Lượt chạy đủ điều kiện" value={String(N)} hint="cohort_class = REAL" />
        <Stat label="Được nghiệm thu" value={String(e.acceptedExecutions ?? 0)} />
        <Stat label="Duyệt lần đầu" value={rateWithSample(e.firstPassAcceptanceRate, e.completedExecutions ?? 0)} />
        <Stat label="Nghiệm thu cuối" value={rateWithSample(e.finalAcceptanceRate, e.completedExecutions ?? 0)} />
        <Stat label="Chất lượng TB" value={e.averageQualityScore === null ? "Không đủ dữ liệu" : String(e.averageQualityScore)} />
        <Stat label="Số vòng sửa TB" value={e.averageRevisions === null ? "Không đủ dữ liệu" : String(e.averageRevisions)} />
        <Stat
          label="Can thiệp con người TB"
          value={e.averageHumanInterventions === null ? "Không đủ dữ liệu" : String(e.averageHumanInterventions)}
        />
        <Stat label="Đạt SLA" value={rateWithSample(e.slaPassRate, e.slaKnownCount ?? 0)} />
        <Stat label="Kết quả đã xác minh" value={rateWithSample(e.verifiedOutcomeRate, e.verifiedOutcomeKnownCount ?? 0)} />
        <Stat label="Chi phí đã biết / lượt" value={money(e.knownCostPerExecution)} hint={`N=${e.costKnownCount ?? 0}`} />
        <Stat label="Chi phí đã biết / việc nghiệm thu" value={money(e.knownCostPerAcceptedWork)} />
        <Stat label="Thời gian tới giá trị đầu tiên" value={msToDays(m.timeToFirstAcceptedWorkMs)} />
        <Stat label="Tới giá trị lặp lại" value={msToDays(m.timeToSecondAcceptedWorkMs)} />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Sản phẩm công việc trong pilot</h2>
        <div className="mt-3 space-y-2">
          {m.products.map((p) => (
            <div key={`${p.code}-${p.version}`} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs">
                  {p.code} v{p.version} · {p.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.executions} lượt · {p.acceptedExecutions} nghiệm thu · {p.activePeriods} kỳ ·{" "}
                  {p.repeatSignal === "STRONG_REPEAT_SIGNAL"
                    ? "Lặp lại mạnh"
                    : p.repeatSignal === "REPEAT_SIGNAL"
                      ? "Có lặp lại"
                      : "Chưa lặp lại"}
                </span>
              </div>
              {p.successCriteria ? <p className="mt-1 text-xs text-muted-foreground">Tiêu chí: {p.successCriteria}</p> : null}
            </div>
          ))}
          {m.products.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa kích hoạt sản phẩm nào — pilot không thể chuyển sang trạng thái đang chạy.</p>
          ) : null}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <select
            aria-label="Sản phẩm"
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            value={productCode}
            onChange={(ev) => setProductCode(ev.target.value)}
          >
            {SWP1_FLAGSHIPS.map((f) => (
              <option key={f.code} value={f.code}>
                {f.label} ({f.code})
              </option>
            ))}
          </select>
          <select
            aria-label="Tần suất kỳ vọng"
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            value={frequency}
            onChange={(ev) => setFrequency(ev.target.value as typeof frequency)}
          >
            <option value="DAILY">Hằng ngày</option>
            <option value="WEEKLY">Hằng tuần</option>
            <option value="BIWEEKLY">Hai tuần</option>
            <option value="MONTHLY">Hằng tháng</option>
            <option value="AD_HOC">Khi cần</option>
          </select>
          <input
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            placeholder="Tiêu chí thành công"
            value={criteria}
            onChange={(ev) => setCriteria(ev.target.value)}
          />
          <button
            type="button"
            onClick={() => activateProduct.mutate()}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Kích hoạt sản phẩm
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <BadgeDollarSign className="h-4 w-4 text-primary" aria-hidden /> Tín hiệu sẵn sàng chi trả
          </h2>
          <p className="text-xs text-muted-foreground">
            Hiện tại: <strong>{WTP_LABEL[m.wtpSignal]}</strong>. "Quan tâm" KHÔNG phải doanh thu.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              aria-label="Tín hiệu"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              value={wtp}
              onChange={(ev) => setWtp(ev.target.value as WtpSignal)}
            >
              {WTP_SIGNALS.map((w) => (
                <option key={w} value={w}>
                  {WTP_LABEL[w]}
                </option>
              ))}
            </select>
            <input
              className="h-9 w-32 rounded-lg border border-border bg-background px-2 text-sm"
              placeholder="Giá (USD)"
              value={wtpAmount}
              onChange={(ev) => setWtpAmount(ev.target.value)}
            />
            <button type="button" onClick={() => saveWtp.mutate()} className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted">
              Lưu
            </button>
          </div>

          <h3 className="mt-5 flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> Xác minh trả phí
          </h3>
          <p className="text-xs text-muted-foreground">
            {m.paidVerifiedAt
              ? `Đã xác minh ${new Date(m.paidVerifiedAt).toLocaleDateString("vi-VN")} · ${m.paidEvidenceReference}`
              : "Bắt buộc có tham chiếu bằng chứng (đơn hàng/hợp đồng/hoá đơn)."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
              placeholder="Tham chiếu bằng chứng"
              value={evidence}
              onChange={(ev) => setEvidence(ev.target.value)}
            />
            <input
              className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm"
              placeholder="Số tiền"
              value={paidAmount}
              onChange={(ev) => setPaidAmount(ev.target.value)}
            />
            <button
              type="button"
              disabled={evidence.length < 3 || !paidAmount}
              onClick={() => verifyPaid.mutate()}
              className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Xác minh
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Thử nghiệm giá (không phải hoá đơn)</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              aria-label="Cơ sở tính giá"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              value={basis}
              onChange={(ev) => setBasis(ev.target.value as typeof basis)}
            >
              <option value="PER_EXECUTION">Theo lượt chạy</option>
              <option value="PER_ACCEPTED_OUTCOME">Theo kết quả nghiệm thu</option>
              <option value="MONTHLY_BUNDLE">Gói theo tháng</option>
              <option value="SUBSCRIPTION_INCLUDED">Bao gồm trong thuê bao</option>
              <option value="CUSTOM">Thoả thuận riêng</option>
            </select>
            <input
              className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm"
              placeholder="Giá (USD)"
              value={price}
              onChange={(ev) => setPrice(ev.target.value)}
            />
            <button
              type="button"
              disabled={!price}
              onClick={() => addPricing.mutate()}
              className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
            >
              Ghi kịch bản
            </button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {(pricing.data ?? []).map((x) => (
              <li key={x.id} className="rounded-xl border border-border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs">
                    {x.work_unit_code} · {x.pricing_basis} · {x.price} {x.currency}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {PRICING_RESPONSE_LABEL[x.customer_response as PricingResponse]}
                  </span>
                </div>
                <div className="mt-1 flex gap-1">
                  {(["ACCEPTED", "NEGOTIATING", "REJECTED"] as PricingResponse[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => respond.mutate({ experimentId: x.id, response: r })}
                      className="rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
                    >
                      {PRICING_RESPONSE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
            {(pricing.data ?? []).length === 0 ? (
              <li className="text-xs text-muted-foreground">Chưa có kịch bản giá nào được đề xuất.</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Tín hiệu khách hàng tự báo cáo</h2>
          <p className="text-xs text-muted-foreground">Không phải kết quả hệ thống xác minh — luôn tách riêng.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Stat label="Số phản hồi" value={String(m.selfReported?.responses ?? 0)} />
            <Stat label="Sẽ dùng lại (Có)" value={String(m.selfReported?.wouldUseAgainYes ?? 0)} />
            <Stat label="Hữu ích" value={String(m.selfReported?.veryUseful ?? 0)} />
            <Stat
              label="Thời gian tiết kiệm tự báo cáo"
              value={
                m.selfReported?.selfReportedTimeSavedMinutes
                  ? `${m.selfReported.selfReportedTimeSavedMinutes} phút`
                  : "Không có dữ liệu"
              }
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <LifeBuoy className="h-4 w-4 text-primary" aria-hidden /> Công hỗ trợ khách hàng
          </h2>
          <p className="text-xs text-muted-foreground">Tách riêng khỏi can thiệp con người trong lượt chạy AI.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              aria-label="Loại hỗ trợ"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              value={supportCat}
              onChange={(ev) => setSupportCat(ev.target.value as SupportCategory)}
            >
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {SUPPORT_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <input
              className="h-9 w-24 rounded-lg border border-border bg-background px-2 text-sm"
              placeholder="Phút"
              value={supportMinutes}
              onChange={(ev) => setSupportMinutes(ev.target.value)}
            />
            <button type="button" onClick={() => addSupport.mutate()} className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted">
              Ghi nhận
            </button>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {(support.data ?? []).slice(0, 8).map((s) => (
              <li key={s.id}>
                {new Date(s.occurred_at).toLocaleDateString("vi-VN")} · {SUPPORT_CATEGORY_LABEL[s.category as SupportCategory]}
                {s.minutes ? ` · ${s.minutes} phút` : ""}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Sự kiện thương mại</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {(events.data ?? []).map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-center gap-2 border-b border-border/60 py-1 last:border-0">
              <span className="w-40 text-xs text-muted-foreground">{new Date(ev.occurred_at).toLocaleString("vi-VN")}</span>
              <span className="font-medium">{COMMERCIAL_EVENT_LABEL[ev.event_type as CommercialEventType] ?? ev.event_type}</span>
              {ev.work_unit_code ? <span className="font-mono text-[11px] text-muted-foreground">{ev.work_unit_code}</span> : null}
            </li>
          ))}
          {(events.data ?? []).length === 0 ? <li className="text-xs text-muted-foreground">Chưa có sự kiện.</li> : null}
        </ul>
      </section>
    </div>
  );
}
