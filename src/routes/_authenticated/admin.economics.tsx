// WE-3 — Kinh tế đơn vị & mô phỏng giá (NỘI BỘ). Không có thanh toán.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Calculator, Coins, RefreshCw, Tag } from "lucide-react";
import { toast } from "sonner";
import { listWorkProducts } from "@/lib/api/work-products.functions";
import { getActiveTenant } from "@/lib/api/active-tenant.functions";
import {
  createModelCostRate,
  createPricingPolicy,
  getWorkProductEconomics,
  listModelCostRates,
  listPricingPolicies,
  recomputeWorkUnitEconomics,
  simulateWorkProductMargin,
} from "@/lib/api/work-pricing.functions";
import {
  COST_COMPLETENESS_LABEL,
  PRICING_MODEL_LABEL,
  formatMoney,
  type PricingModel,
} from "@/domain/work-economics/pricing";
import { formatDurationMs } from "@/domain/work-economics/contracts";

export const Route = createFileRoute("/_authenticated/admin/economics")({
  head: () => ({
    meta: [
      { title: "Kinh tế đơn vị công việc — Quản trị UNIWORK" },
      {
        name: "description",
        content: "Chi phí thật của mỗi lượt chạy, chi phí trên mỗi kết quả được nghiệm thu và mô phỏng biên lợi nhuận.",
      },
      { property: "og:title", content: "Kinh tế đơn vị công việc — Quản trị UNIWORK" },
      { property: "og:description", content: "Đo chi phí thật và mô phỏng giá cho từng sản phẩm công việc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminEconomicsPage,
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

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));

function AdminEconomicsPage() {
  const qc = useQueryClient();
  const fetchProducts = useServerFn(listWorkProducts);
  const fetchTenant = useServerFn(getActiveTenant);
  const fetchEconomics = useServerFn(getWorkProductEconomics);
  const fetchRates = useServerFn(listModelCostRates);
  const fetchPolicies = useServerFn(listPricingPolicies);
  const runSimulate = useServerFn(simulateWorkProductMargin);
  const runRecompute = useServerFn(recomputeWorkUnitEconomics);
  const addRate = useServerFn(createModelCostRate);
  const addPolicy = useServerFn(createPricingPolicy);

  const { data: products } = useQuery({ queryKey: ["work-products"], queryFn: () => fetchProducts() });
  const { data: tenant } = useQuery({ queryKey: ["active-tenant"], queryFn: () => fetchTenant() });
  const { data: rates } = useQuery({ queryKey: ["we3", "rates"], queryFn: () => fetchRates() });
  const { data: policies } = useQuery({ queryKey: ["we3", "policies"], queryFn: () => fetchPolicies() });

  const [selected, setSelected] = useState<string>("");
  const product = useMemo(() => {
    const list = products ?? [];
    return list.find((p) => `${p.code}@${p.version}` === selected) ?? list[0] ?? null;
  }, [products, selected]);

  const tenantId = tenant?.tenantId ?? null;

  const { data: economics, isFetching } = useQuery({
    queryKey: ["we3", "economics", product?.code, product?.version, tenantId],
    enabled: Boolean(product && tenantId),
    queryFn: () =>
      fetchEconomics({
        data: { code: product!.code, version: product!.version, tenantId: tenantId!, days: 90 },
      }),
  });

  const [price, setPrice] = useState("2.00");
  const [model, setModel] = useState<PricingModel>("PER_ACCEPTED_OUTCOME");
  const [sim, setSim] = useState<Awaited<ReturnType<typeof runSimulate>> | null>(null);

  const simulate = useMutation({
    mutationFn: () =>
      runSimulate({
        data: {
          code: product!.code,
          version: product!.version,
          tenantId: tenantId!,
          days: 90,
          pricingModel: model,
          commercialUnit: model === "PER_EXECUTION" ? "EXECUTION" : "ACCEPTED_OUTCOME",
          proposedPrice: Number(price),
          currency: "USD",
        },
      }),
    onSuccess: (r) => setSim(r),
    onError: () => toast.error("Không mô phỏng được — kiểm tra quyền quản trị."),
  });

  const recompute = useMutation({
    mutationFn: () => runRecompute({ data: { code: product!.code, version: product!.version } }),
    onSuccess: (r) => {
      toast.success(`Đã tính lại chi phí cho ${r.recomputed} lượt chạy.`);
      qc.invalidateQueries({ queryKey: ["we3", "economics"] });
    },
  });

  const [rateForm, setRateForm] = useState({ provider: "openai", model: "openai/gpt-5.6-sol", input: "", output: "", source: "" });
  const saveRate = useMutation({
    mutationFn: () =>
      addRate({
        data: {
          provider: rateForm.provider,
          model: rateForm.model,
          inputTokenRate: Number(rateForm.input),
          outputTokenRate: Number(rateForm.output),
          currency: "USD",
          source: rateForm.source || "Cấu hình tài chính nội bộ",
          status: "ACTIVE",
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.error ?? "Không lưu được bảng giá");
      toast.success("Đã tạo phiên bản bảng giá mới");
      qc.invalidateQueries({ queryKey: ["we3", "rates"] });
    },
  });

  const savePolicy = useMutation({
    mutationFn: () =>
      addPolicy({
        data: {
          tenantId,
          code: product!.code,
          version: product!.version,
          pricingModel: model,
          commercialUnit: model === "PER_EXECUTION" ? "EXECUTION" : "ACCEPTED_OUTCOME",
          currency: "USD",
          unitPrice: Number(price),
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error((r.errors ?? [r.error]).join(", "));
      toast.success("Đã tạo chính sách giá ở trạng thái Nháp (không phát sinh thanh toán).");
      qc.invalidateQueries({ queryKey: ["we3", "policies"] });
    },
  });

  const currency = economics?.currency ?? "USD";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          value={product ? `${product.code}@${product.version}` : ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {(products ?? []).map((p) => (
            <option key={`${p.code}@${p.version}`} value={`${p.code}@${p.version}`}>
              {p.label} · v{p.version}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => recompute.mutate()}
          disabled={!product || recompute.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Tính lại chi phí
        </button>
        {economics?.lowSampleSize ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Mẫu nhỏ (LOW_SAMPLE_SIZE)
          </span>
        ) : null}
      </div>

      {/* Kinh tế thực thi */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Kinh tế thực thi</h2>
        {isFetching ? (
          <p className="text-sm text-muted-foreground">Đang tính…</p>
        ) : !economics ? (
          <p className="text-sm text-muted-foreground">Chưa đọc được số liệu (cần quyền quản trị và tổ chức hiện hành).</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Lượt chạy" value={String(economics.executions)} />
            <Stat label="Được nghiệm thu" value={String(economics.acceptedExecutions)} />
            <Stat label="Đạt ngay lần đầu" value={pct(economics.firstPassAcceptanceRate)} />
            <Stat label="Tỉ lệ yêu cầu sửa" value={pct(economics.changeRequestRate)} />
            <Stat label="Chất lượng trung bình" value={num(economics.avgQualityScore)} />
            <Stat label="Thời gian máy TB" value={formatDurationMs(economics.avgMachineDurationMs)} />
            <Stat label="Số vòng sửa TB" value={num(economics.avgRevisions)} />
            <Stat label="Can thiệp người / việc nghiệm thu" value={num(economics.humanInterventionsPerAcceptedWork)} />
            <Stat label="Kết quả kiểm chứng" value={pct(economics.verifiedOutcomeRate)} />
            <Stat label="Đạt SLA" value={pct(economics.slaAchievementRate)} />
            <Stat label="Số lần gọi mô hình TB" value={num(economics.avgModelCalls)} />
            <Stat label="Token TB" value={num(economics.avgTokens)} />
          </div>
        )}
      </section>

      {/* Chi phí */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Coins className="h-4 w-4" /> Chi phí (nội bộ)
        </h2>
        {economics ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Chi phí đã biết / lượt chạy" value={formatMoney(economics.knownCostPerExecution, currency)} />
            <Stat
              label="Chi phí đã biết / việc nghiệm thu"
              value={formatMoney(economics.knownCostPerAcceptedWork, currency)}
            />
            <Stat
              label="Mức đầy đủ chi phí"
              value={COST_COMPLETENESS_LABEL[economics.completeness]}
              hint={economics.missingSignals.length ? `Thiếu: ${economics.missingSignals.join(", ")}` : undefined}
            />
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Đây là <strong>chi phí đã biết</strong>, không phải tổng chi phí. Thành phần chưa đo được luôn hiển thị là chưa
          biết — hệ thống không bao giờ quy đổi thành 0.
        </p>
      </section>

      {/* Bảng giá mô hình */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bảng giá mô hình AI</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted-foreground">
              <tr>
                {["Nhà cung cấp", "Mô hình", "Phiên bản", "Vào /1M", "Ra /1M", "Tiền tệ", "Trạng thái", "Nguồn"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(rates ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">{r.provider}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.model}</td>
                  <td className="px-3 py-2">v{r.rate_version}</td>
                  <td className="px-3 py-2 tabular-nums">{r.input_token_rate}</td>
                  <td className="px-3 py-2 tabular-nums">{r.output_token_rate}</td>
                  <td className="px-3 py-2">{r.currency}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.source}</td>
                </tr>
              ))}
              {(rates ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-sm text-muted-foreground">
                    Chưa cấu hình bảng giá — chi phí AI sẽ là “chưa biết”.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {(
            [
              ["provider", "Nhà cung cấp"],
              ["model", "Mô hình"],
              ["input", "Đơn giá token vào /1M"],
              ["output", "Đơn giá token ra /1M"],
              ["source", "Nguồn số liệu"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1 text-xs text-muted-foreground">
              {label}
              <input
                className="w-44 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                value={rateForm[k]}
                onChange={(e) => setRateForm((f) => ({ ...f, [k]: e.target.value }))}
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => saveRate.mutate()}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Tạo phiên bản giá
          </button>
        </div>
      </section>

      {/* Mô phỏng biên lợi nhuận */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Calculator className="h-4 w-4" /> Mô phỏng giá (chỉ mô phỏng — không thanh toán)
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Mô hình giá
            <select
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
              value={model}
              onChange={(e) => setModel(e.target.value as PricingModel)}
            >
              {(Object.keys(PRICING_MODEL_LABEL) as PricingModel[]).map((m) => (
                <option key={m} value={m}>{PRICING_MODEL_LABEL[m]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Giá đề xuất (USD)
            <input
              className="w-32 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!product || !tenantId}
            onClick={() => simulate.mutate()}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Mô phỏng
          </button>
          <button
            type="button"
            disabled={!product}
            onClick={() => savePolicy.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"
          >
            <Tag className="h-3.5 w-3.5" /> Lưu chính sách giá (Nháp)
          </button>
        </div>

        {sim ? (
          <div className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Cơ sở chi phí đã biết" value={formatMoney(sim.simulation.knownCostBasis, sim.simulation.currency)} />
              <Stat label="Đóng góp gộp" value={formatMoney(sim.simulation.grossContribution, sim.simulation.currency)} />
              <Stat
                label="Biên lợi nhuận"
                value={
                  sim.simulation.classification === "NOT_RELIABLE"
                    ? "KHÔNG ĐÁNG TIN"
                    : `${sim.simulation.marginPercent}%`
                }
                hint={
                  sim.simulation.classification === "PROVISIONAL"
                    ? "Tạm tính trên chi phí đã biết (chi phí chưa đầy đủ)"
                    : sim.simulation.classification === "FULL"
                      ? "Chi phí đầy đủ"
                      : "Thiếu cơ sở chi phí"
                }
              />
            </div>
            {sim.simulation.warnings.length ? (
              <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {sim.simulation.warnings.join(" · ")}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Gợi ý mô hình bán (thuần luật, không do AI đề xuất):{" "}
              <strong>{PRICING_MODEL_LABEL[sim.advisory.candidate]}</strong> — {sim.advisory.reason}
            </p>
          </div>
        ) : null}
      </section>

      {/* Chính sách giá */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Chính sách giá</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted-foreground">
              <tr>
                {["Sản phẩm", "Phiên bản SP", "Phiên bản giá", "Mô hình", "Đơn giá", "Trạng thái"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(policies ?? []).map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{p.work_unit_code}</td>
                  <td className="px-3 py-2">v{p.work_unit_version}</td>
                  <td className="px-3 py-2">v{p.pricing_version}</td>
                  <td className="px-3 py-2">{PRICING_MODEL_LABEL[p.pricing_model]}</td>
                  <td className="px-3 py-2 tabular-nums">{formatMoney(p.unit_price, p.currency)}</td>
                  <td className="px-3 py-2">{p.status}</td>
                </tr>
              ))}
              {(policies ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-sm text-muted-foreground">
                    Chưa có chính sách giá nào. Sản phẩm công việc hiển thị “Liên hệ tư vấn” với khách hàng.
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
