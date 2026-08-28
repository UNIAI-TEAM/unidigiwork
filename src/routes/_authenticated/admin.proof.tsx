// SWP-1 — Trang bằng chứng (Investor Proof View).
// Bất biến: chỉ dùng dữ liệu THẬT (cohort_class = REAL). Không được bật dữ liệu
// tổng hợp ở đây. Tuyên bố công bố được suy ra từ cỡ mẫu, không phải từ mong muốn.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { listFlagshipCohorts } from "@/lib/api/sell-work-cohort.functions";
import { getPilotPortfolio } from "@/lib/api/sell-work-pilots.functions";
import { COHORT_STATUS_LABEL, COHORT_THRESHOLDS, type WorkProductCohort } from "@/domain/sell-work/cohort";
import {
  COMMERCIAL_PROOF_LABEL,
  PRODUCT_DECISION_LABEL,
  PROOF_THRESHOLDS,
  classifyCommercialProof,
  suggestProductDecision,
  type PilotPortfolio,
} from "@/domain/sell-work/pilot";

export const Route = createFileRoute("/_authenticated/admin/proof")({
  head: () => ({
    meta: [
      { title: "Bằng chứng Sell Work — Quản trị UNIWORK" },
      {
        name: "description",
        content: "Bằng chứng vận hành thật của sản phẩm công việc: cỡ mẫu, tỉ lệ duyệt, chất lượng và chi phí.",
      },
      { property: "og:title", content: "Bằng chứng Sell Work — Quản trị UNIWORK" },
      { property: "og:description", content: "Chỉ số thật, nêu rõ giới hạn dữ liệu, không phóng đại." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProofPage,
});

/** Tuyên bố được phép công bố — do cỡ mẫu quyết định. */
function claimFor(c: WorkProductCohort | null): { text: string; ok: boolean } {
  if (!c || c.totalExecutions === 0)
    return { text: "Chưa có lượt chạy thật — không được đưa ra tuyên bố nào.", ok: false };
  if (c.cohortStatus === "INSUFFICIENT")
    return { text: `Dưới ${COHORT_THRESHOLDS.EARLY} lượt: chỉ được nói "đang thử nghiệm nội bộ".`, ok: false };
  if (c.cohortStatus === "EARLY")
    return { text: "Tín hiệu sớm: được mô tả định tính, không nêu tỉ lệ như cam kết.", ok: false };
  if (c.cohortStatus === "PROVISIONAL")
    return { text: `Tạm đủ mẫu (≥ ${COHORT_THRESHOLDS.PROVISIONAL}): được nêu tỉ lệ kèm ghi chú "tạm thời".`, ok: true };
  return { text: `Đủ mẫu (≥ ${COHORT_THRESHOLDS.PROVEN}): được nêu tỉ lệ kèm cửa sổ thời gian và phiên bản.`, ok: true };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ProofPage() {
  const fetchCohorts = useServerFn(listFlagshipCohorts);
  const { data } = useQuery({
    queryKey: ["swp1", "proof"],
    // Cố định: dữ liệu thật, toàn nền tảng, 365 ngày.
    queryFn: () => fetchCohorts({ data: { tenantId: null, days: 365, includeSynthetic: false } }),
  });

  const pct = (v: number | null) => (v === null ? "Không đủ dữ liệu" : `${v}%`);

  return (
    <div className="space-y-5">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BadgeCheck className="h-4 w-4 text-primary" /> Bằng chứng Sell Work
        </h2>
        <p className="text-sm text-muted-foreground">
          Chỉ dữ liệu vận hành thật trong 365 ngày. Không có dữ liệu mô phỏng. Thiếu dữ liệu được ghi rõ thay vì làm tròn
          thành 0.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {(data ?? []).map(({ code, label, cohort }) => {
          const claim = claimFor(cohort);
          return (
            <section key={code} className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="text-base font-semibold">{label}</h3>
              <p className="font-mono text-[11px] text-muted-foreground">
                {code} · v{cohort?.version ?? "—"}
              </p>
              <div className="mt-3">
                <Row label="Số lượt chạy thật" value={String(cohort?.totalExecutions ?? 0)} />
                <Row label="Trạng thái cohort" value={cohort ? COHORT_STATUS_LABEL[cohort.cohortStatus] : "—"} />
                <Row label="Duyệt ngay lần đầu" value={pct(cohort?.firstPassAcceptanceRate ?? null)} />
                <Row label="Duyệt sau chỉnh sửa" value={pct(cohort?.finalAcceptanceRate ?? null)} />
                <Row
                  label="Chất lượng trung bình"
                  value={cohort?.averageQualityScore === null || cohort?.averageQualityScore === undefined ? "Không đủ dữ liệu" : String(cohort.averageQualityScore)}
                />
                <Row
                  label="Chi phí / kết quả được duyệt"
                  value={
                    cohort?.knownCostPerAcceptedWork == null
                      ? "Không đủ dữ liệu"
                      : `${cohort.knownCostPerAcceptedWork.toFixed(4)} ${cohort.currency ?? ""}`.trim()
                  }
                />
                <Row label="Số tổ chức" value={String(cohort?.tenantCount ?? 0)} />
              </div>
              <p
                className={`mt-3 inline-flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs ${
                  claim.ok ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                {claim.ok ? <BadgeCheck className="mt-0.5 h-3.5 w-3.5" /> : <ShieldAlert className="mt-0.5 h-3.5 w-3.5" />}
                {claim.text}
              </p>
            </section>
          );
        })}
      </div>
      {!data && <p className="text-sm text-muted-foreground">Đang tổng hợp bằng chứng…</p>}

      <CommercialProof cohorts={data ?? []} />
    </div>
  );
}

/* ------------------------- SWP-2 — Bằng chứng thương mại ------------------------- */

function CommercialProof({ cohorts }: { cohorts: { code: string; label: string; cohort: WorkProductCohort | null }[] }) {
  const fetchPortfolio = useServerFn(getPilotPortfolio);
  const { data: portfolio } = useQuery({
    queryKey: ["swp2", "portfolio", "proof"],
    queryFn: () => fetchPortfolio({ data: { days: 365 } }) as Promise<PilotPortfolio>,
  });

  if (!portfolio) return <p className="text-sm text-muted-foreground">Đang tổng hợp bằng chứng thương mại…</p>;

  const s = portfolio.summary;
  const dep = portfolio.servicesDependency;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Bằng chứng thương mại</h2>
        <p className="text-sm text-muted-foreground">
          Quan tâm KHÔNG phải doanh thu. Chỉ pilot có tham chiếu bằng chứng mới được tính là trả phí. Mọi tỉ lệ đều kèm cỡ mẫu.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Tổng pilot", String(s.totalPilots)],
          ["Đang chạy thật", String(s.activePilots)],
          ["Trả phí đã xác minh", String(s.paidPilots)],
          ["Tín hiệu mở rộng", String(s.expansionSignals)],
          ["Đã dừng / mất", `${s.pausedPilots} / ${s.lostPilots}`],
          ["Có tín hiệu chi trả", String(s.customersWithWtpSignal)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-surface p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-base font-semibold">Mức phụ thuộc dịch vụ (tín hiệu chống ảo tưởng sản phẩm)</h3>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          <Row label="Pilot cần kỹ thuật riêng" value={`${dep.pilotsWithCustomEngineering}/${dep.pilotsTotal}`} />
          <Row label="Pilot cần dựng dữ liệu thủ công" value={`${dep.pilotsWithManualDataSetup}/${dep.pilotsTotal}`} />
          <Row label="Pilot cần hỗ trợ lặp lại" value={`${dep.pilotsWithRepeatedSupport}/${dep.pilotsTotal}`} />
          <Row label="Tổng phút hỗ trợ" value={String(dep.supportMinutesTotal)} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Doanh thu đã xác minh: phần mềm {portfolio.revenue.software} · sell work {portfolio.revenue.sellWork} · dịch vụ{" "}
          {portfolio.revenue.services} {portfolio.revenue.currencies.join("/")}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {cohorts.map(({ code, label, cohort }) => {
          const rows = portfolio.pilots.filter((p) => p.products.includes(code));
          const input = {
            code,
            pilotCount: rows.length,
            paidPilotCount: rows.filter((p) => p.paidVerifiedAt).length,
            customersWithRepeatUsage: rows.filter((p) => p.acceptedExecutions >= 2).length,
            wtpConfirmations: rows.filter((p) => p.wtpSignal === "CONTRACTED" || p.wtpSignal === "PAID_PILOT" || p.wtpSignal === "WILL_PAY_AT_RIGHT_PRICE" || p.paidVerifiedAt).length,
            acceptedExecutions: cohort?.acceptedExecutions ?? 0,
            knownCostPerAcceptedWork: cohort?.knownCostPerAcceptedWork ?? null,
            economicsCompleteness: (cohort?.economicsCompleteness ?? "INSUFFICIENT") as "FULL" | "PARTIAL" | "INSUFFICIENT",
            finalAcceptanceRate: cohort?.finalAcceptanceRate ?? null,
            pilotsWithCustomEngineering: dep.pilotsWithCustomEngineering,
          };
          const proof = classifyCommercialProof(input);
          const decision = suggestProductDecision(input);
          return (
            <div key={code} className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="text-base font-semibold">{label}</h3>
              <p className="font-mono text-[11px] text-muted-foreground">{code}</p>
              <div className="mt-3">
                <Row label="Bằng chứng thương mại" value={COMMERCIAL_PROOF_LABEL[proof]} />
                <Row label="Khách hàng thí điểm" value={String(input.pilotCount)} />
                <Row label="Trả phí đã xác minh" value={String(input.paidPilotCount)} />
                <Row label="Khách dùng lặp lại" value={String(input.customersWithRepeatUsage)} />
                <Row
                  label={`Kết quả nghiệm thu (cần ≥ ${PROOF_THRESHOLDS.ECONOMICS_ACCEPTED_MIN})`}
                  value={String(input.acceptedExecutions)}
                />
                <Row
                  label="Chi phí đã biết / việc nghiệm thu"
                  value={
                    input.knownCostPerAcceptedWork === null
                      ? "Không đủ dữ liệu"
                      : `${input.knownCostPerAcceptedWork.toFixed(4)} ${cohort?.currency ?? ""}`.trim()
                  }
                />
              </div>
              <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs">
                Gợi ý (tham khảo): <strong>{PRODUCT_DECISION_LABEL[decision.decision]}</strong> — {decision.reason}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
