// SWP-1 — Bảng điều khiển cohort Sell Work (nội bộ).
// Mọi chỉ số do RPC compute_work_product_cohort tính; UI chỉ hiển thị.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BarChart3, RefreshCw } from "lucide-react";
import { listFlagshipCohorts } from "@/lib/api/sell-work-cohort.functions";
import { getActiveTenant } from "@/lib/api/active-tenant.functions";
import {
  COHORT_STATUS_LABEL,
  COMPLETENESS_LABEL,
  FAILURE_LABEL,
  MISSING_SIGNAL_LABEL,
  type CohortStatus,
  type DataCompleteness,
  type FailureClass,
  type WorkProductCohort,
} from "@/domain/sell-work/cohort";

export const Route = createFileRoute("/_authenticated/admin/cohorts")({
  head: () => ({
    meta: [
      { title: "Cohort sản phẩm công việc — Quản trị UNIWORK" },
      {
        name: "description",
        content: "Chỉ số cohort theo sản phẩm công việc: tỉ lệ duyệt lần đầu, chất lượng, làm lại, SLA và chi phí.",
      },
      { property: "og:title", content: "Cohort sản phẩm công việc — Quản trị UNIWORK" },
      { property: "og:description", content: "Bằng chứng vận hành lặp lại được của ba sản phẩm công việc chủ lực." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCohortsPage,
});

const pct = (v: number | null) => (v === null ? "Không đủ dữ liệu" : `${v}%`);
const num = (v: number | null) => (v === null ? "Không đủ dữ liệu" : String(v));
const money = (v: number | null, cur: string | null) =>
  v === null ? "Không đủ dữ liệu" : `${v.toFixed(4)} ${cur ?? ""}`.trim();
const dur = (ms: number | null) => (ms === null ? "Không đủ dữ liệu" : `${Math.round(ms / 1000)}s`);

function StatusPill({ status }: { status: CohortStatus }) {
  const tone =
    status === "PROVEN"
      ? "bg-primary/10 text-primary"
      : status === "PROVISIONAL"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : status === "EARLY"
          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tone}`}>{COHORT_STATUS_LABEL[status]}</span>;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CohortCard({ label, code, cohort }: { label: string; code: string; cohort: WorkProductCohort | null }) {
  if (!cohort) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">{label}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Không đọc được cohort cho {code} — thiếu quyền hoặc chưa có hợp đồng phiên bản này.
        </p>
      </section>
    );
  }
  const failures = Object.entries(cohort.failureTaxonomy).filter(([, n]) => n > 0);
  const exclusions = Object.entries(cohort.exclusions).filter(([, n]) => n > 0);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{label}</h2>
          <p className="font-mono text-[11px] text-muted-foreground">
            {cohort.code} · v{cohort.version ?? "—"} · {cohort.tenantScope === "PLATFORM" ? "toàn nền tảng" : "một tổ chức"} ·{" "}
            {cohort.tenantCount} tổ chức
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={cohort.cohortStatus} />
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted-foreground">
            Dữ liệu: {COMPLETENESS_LABEL[cohort.dataCompleteness as DataCompleteness]}
          </span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Lượt chạy" value={String(cohort.totalExecutions)} hint={`${cohort.completedExecutions} hoàn tất`} />
        <Stat label="Duyệt ngay lần đầu" value={pct(cohort.firstPassAcceptanceRate)} hint={`${cohort.firstPassAccepted} lượt`} />
        <Stat label="Duyệt sau chỉnh sửa" value={pct(cohort.finalAcceptanceRate)} hint={`${cohort.acceptedExecutions} lượt`} />
        <Stat label="Điểm chất lượng TB" value={num(cohort.averageQualityScore)} hint={`Ngưỡng ${cohort.qualityThreshold}`} />
        <Stat label="Trung vị chất lượng" value={num(cohort.medianQualityScore)} />
        <Stat label="Tỉ lệ phải làm lại" value={pct(cohort.revisionRate)} hint={`TB ${num(cohort.averageRevisions)} vòng`} />
        <Stat label="Can thiệp của người" value={num(cohort.averageHumanInterventions)} hint="trung bình mỗi lượt" />
        <Stat label="Đạt SLA" value={pct(cohort.slaPassRate)} hint={`${cohort.slaKnownCount} lượt đo được`} />
        <Stat label="Thời gian máy TB" value={dur(cohort.averageMachineDurationMs)} />
        <Stat label="Thời gian thực TB" value={dur(cohort.averageWallDurationMs)} />
        <Stat
          label="Chi phí mỗi lượt"
          value={money(cohort.knownCostPerExecution, cohort.currency)}
          hint={`${cohort.costKnownCount} lượt có chi phí`}
        />
        <Stat
          label="Chi phí mỗi kết quả được duyệt"
          value={money(cohort.knownCostPerAcceptedWork, cohort.currency)}
          hint={`Kinh tế: ${COMPLETENESS_LABEL[cohort.economicsCompleteness as DataCompleteness]}`}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phân bố chất lượng</p>
          <ul className="space-y-1 text-sm">
            <li>90–100: <span className="tabular-nums">{cohort.qualityBands.b90_100}</span></li>
            <li>80–89: <span className="tabular-nums">{cohort.qualityBands.b80_89}</span></li>
            <li>70–79: <span className="tabular-nums">{cohort.qualityBands.b70_79}</span></li>
            <li>Dưới ngưỡng: <span className="tabular-nums">{cohort.qualityBands.belowThreshold}</span></li>
            <li className="text-muted-foreground">Chưa chấm: {cohort.qualityBands.missing}</li>
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nguyên nhân thất bại</p>
          {failures.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có lượt thất bại trong cửa sổ này.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {failures.map(([k, n]) => (
                <li key={k}>
                  {FAILURE_LABEL[k as FailureClass] ?? k}: <span className="tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {(cohort.missingSignals.length > 0 || cohort.currencyMismatch || exclusions.length > 0) && (
        <div className="mt-4 flex flex-col gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
          {cohort.missingSignals.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> {MISSING_SIGNAL_LABEL[s] ?? s}
            </span>
          ))}
          {cohort.currencyMismatch ? <span>Có nhiều loại tiền tệ — không cộng gộp chi phí.</span> : null}
          {exclusions.map(([k, n]) => (
            <span key={k}>Đã loại khỏi cohort: {k} ({n})</span>
          ))}
        </div>
      )}
    </section>
  );
}

function AdminCohortsPage() {
  const fetchCohorts = useServerFn(listFlagshipCohorts);
  const fetchTenant = useServerFn(getActiveTenant);
  const [days, setDays] = useState(90);
  const [scopeAll, setScopeAll] = useState(false);
  const [includeSynthetic, setIncludeSynthetic] = useState(false);

  const { data: tenant } = useQuery({ queryKey: ["active-tenant"], queryFn: () => fetchTenant() });
  const tenantId = tenant?.tenantId ?? null;

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["swp1", "cohorts", days, scopeAll, includeSynthetic, tenantId],
    queryFn: () =>
      fetchCohorts({ data: { tenantId: scopeAll ? null : tenantId, days, includeSynthetic } }),
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" /> Cohort sản phẩm công việc
          </h2>
          <p className="text-sm text-muted-foreground">
            Bằng chứng lặp lại được theo phiên bản hợp đồng. Cỡ mẫu nhỏ chỉ là tín hiệu sớm, không phải kết luận.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface px-2 py-1.5"
          >
            <option value={7}>7 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={90}>90 ngày</option>
            <option value={365}>365 ngày</option>
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={scopeAll} onChange={(e) => setScopeAll(e.target.checked)} /> Toàn nền tảng
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeSynthetic}
              onChange={(e) => setIncludeSynthetic(e.target.checked)}
            />{" "}
            Gồm dữ liệu thử nghiệm
          </label>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Làm mới
          </button>
        </div>
      </header>

      {includeSynthetic ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
          Đang gộp dữ liệu thử nghiệm/tổng hợp — số liệu này KHÔNG dùng để công bố ra ngoài.
        </p>
      ) : null}

      {(data ?? []).map((row) => (
        <CohortCard key={row.code} code={row.code} label={row.label} cohort={row.cohort} />
      ))}
      {!data && <p className="text-sm text-muted-foreground">Đang tính cohort…</p>}
    </div>
  );
}
