import { z } from "zod";
// WE-3 — Work Pricing & Unit Economics: contracts + toán tất định (client-safe, không I/O).
//
// Nguyên tắc trung thực (tiếp nối WE-1):
//  - KHÔNG có tín hiệu  !=  chi phí 0. Thiếu đo -> UNKNOWN, không bao giờ điền 0.
//  - Không suy chi phí lao động từ thời gian chờ (wall time). Chỉ dùng cấu hình tường minh.
//  - Chi phí ĐÃ BIẾT không được gọi là "tổng chi phí"; biên lợi nhuận trên chi phí thiếu
//    phải bị hạ cấp thành PROVISIONAL / NOT_RELIABLE.
//  - Giá QUAN SÁT kết quả; giá không bao giờ tác động tới hành vi thực thi công việc.

export const WE3_COST_MODEL_VERSION = "we3.cost.v1";
export const WE3_PRICING_VERSION = "we3.pricing.v1";

/* ----------------------------- Thành phần chi phí ----------------------------- */

export const COST_COMPONENTS = [
  "AI_COMPUTE",
  "HUMAN_REVIEW",
  "PLATFORM",
  "RETRY_REVISION",
  "EXTERNAL_SERVICE",
  "OTHER",
] as const;
export type CostComponent = (typeof COST_COMPONENTS)[number];

export const COST_COMPONENT_LABEL: Record<CostComponent, string> = {
  AI_COMPUTE: "Chi phí tính toán AI",
  HUMAN_REVIEW: "Chi phí con người",
  PLATFORM: "Chi phí nền tảng",
  RETRY_REVISION: "Chi phí làm lại",
  EXTERNAL_SERVICE: "Dịch vụ bên ngoài",
  OTHER: "Khác",
};

export const COST_COMPLETENESS = ["FULL", "PARTIAL", "INSUFFICIENT"] as const;
export type CostCompleteness = (typeof COST_COMPLETENESS)[number];

export const COST_COMPLETENESS_LABEL: Record<CostCompleteness, string> = {
  FULL: "Đầy đủ",
  PARTIAL: "Một phần",
  INSUFFICIENT: "Không đủ dữ liệu",
};

export const SUPPORTED_CURRENCIES = ["USD", "VND", "EUR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(v: string): v is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(v);
}

/* ------------------------------- Bảng giá model ------------------------------- */

export interface AiModelCostRate {
  id: string;
  provider: string;
  model: string;
  rate_version: number;
  input_token_rate: number;
  output_token_rate: number;
  rate_unit: "PER_1M_TOKENS";
  currency: string;
  source: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  effective_from: string;
  effective_to: string | null;
}

/** Chi phí AI cho một lượt chạy — tất định, chỉ từ token thật + đơn giá cấu hình. */
export function aiComputeCost(
  inputTokens: number,
  outputTokens: number,
  rate: Pick<AiModelCostRate, "input_token_rate" | "output_token_rate">,
): number {
  const v = (inputTokens / 1_000_000) * rate.input_token_rate + (outputTokens / 1_000_000) * rate.output_token_rate;
  return Math.round(v * 1e6) / 1e6;
}

/* ------------------------------ Chi phí lượt chạy ----------------------------- */

export interface WorkExecutionCostRow {
  execution_id: string;
  tenant_id: string;
  workspace_id: string | null;
  work_unit_code: string;
  work_unit_version: number;
  currency: string;
  ai_compute_cost: number | null;
  ai_compute_status: "MEASURED" | "UNKNOWN" | "ZERO";
  rate_provider: string | null;
  rate_model: string | null;
  rate_version: number | null;
  rate_effective_at: string | null;
  human_cost: number | null;
  human_cost_status: "CONFIGURED_EVENT_COST" | "UNKNOWN" | "ZERO";
  human_policy_version: number | null;
  platform_cost: number | null;
  platform_cost_status: string;
  external_cost: number | null;
  external_cost_status: string;
  known_cost: number;
  unknown_components: string[];
  completeness: CostCompleteness;
  cost_model_version: string;
  computed_at: string;
}

/* --------------------------- Kinh tế theo sản phẩm --------------------------- */

/** Kết quả thô do RPC `work_product_economics` trả về. */
export interface WorkProductEconomicsRaw {
  workUnitCode: string;
  workUnitVersion: number;
  from?: string;
  to?: string;
  executions: number;
  acceptedExecutions?: number;
  verifiedOutcomes?: number;
  changeRequests?: number;
  firstPassAccepted?: number;
  reviewedExecutions?: number;
  avgRevisions?: number | null;
  avgHumanApprovals?: number | null;
  avgHumanReviews?: number | null;
  avgMachineDurationMs?: number | null;
  avgModelCalls?: number | null;
  avgTokens?: number | null;
  avgQualityScore?: number | null;
  slaEvaluated?: number;
  slaMet?: number;
  knownCostTotal?: number;
  aiComputeCostTotal?: number | null;
  humanCostTotal?: number | null;
  costedExecutions?: number;
  fullCostExecutions?: number;
  currency?: string;
  /** HARDEN-SELLWORK-1: danh sách đơn vị tiền tệ xuất hiện trong cohort. */
  currencies?: string[];
}

export interface WorkProductEconomics {
  workUnitCode: string;
  workUnitVersion: number;
  from: string | null;
  to: string | null;
  executions: number;
  acceptedExecutions: number;
  verifiedOutcomes: number;
  firstPassAcceptanceRate: number | null;
  changeRequestRate: number | null;
  avgRevisions: number | null;
  avgHumanApprovals: number | null;
  avgHumanReviews: number | null;
  avgMachineDurationMs: number | null;
  avgModelCalls: number | null;
  avgTokens: number | null;
  avgQualityScore: number | null;
  slaAchievementRate: number | null;
  verifiedOutcomeRate: number | null;
  humanInterventionsPerAcceptedWork: number | null;
  currency: string;
  knownExecutionCost: number | null;
  knownCostPerExecution: number | null;
  knownCostPerAcceptedWork: number | null;
  completeness: CostCompleteness;
  missingSignals: string[];
  lowSampleSize: boolean;
}

const MIN_COHORT = 3;

function rate(n: number | undefined, d: number | undefined): number | null {
  if (!d) return null;
  return Math.round(((n ?? 0) / d) * 1000) / 10; // %, 1 chữ số thập phân
}

/** Chuẩn hoá tổng hợp thô thành số liệu kinh tế đơn vị, giữ nguyên tính trung thực. */
export function toWorkProductEconomics(raw: WorkProductEconomicsRaw): WorkProductEconomics {
  const executions = raw.executions ?? 0;
  const accepted = raw.acceptedExecutions ?? 0;
  const costed = raw.costedExecutions ?? 0;
  const full = raw.fullCostExecutions ?? 0;

  const missing: string[] = [];
  if (!executions) missing.push("NO_EXECUTIONS");
  if (costed < executions) missing.push("COST_NOT_COMPUTED_FOR_ALL_EXECUTIONS");
  if (raw.aiComputeCostTotal === null || raw.aiComputeCostTotal === undefined) missing.push("AI_COMPUTE");
  if (raw.humanCostTotal === null || raw.humanCostTotal === undefined) missing.push("HUMAN_REVIEW");
  // Nguồn sự thật về độ đầy đủ là database (`work_execution_costs.completeness`).
  // Chỉ khi CHƯA phải mọi lượt chạy đều FULL mới liệt kê hai thành phần chưa đo được.
  const allFull = executions > 0 && full === executions;
  if (!allFull) missing.push("PLATFORM", "EXTERNAL_SERVICE");

  let completeness: CostCompleteness = "INSUFFICIENT";
  if (allFull && missing.length === 0) completeness = "FULL";
  else if (executions > 0 && costed > 0 && (raw.knownCostTotal ?? 0) > 0) completeness = "PARTIAL";

  const knownTotal = costed > 0 ? (raw.knownCostTotal ?? 0) : null;
  const humanEvents = (raw.avgHumanApprovals ?? 0) + (raw.avgHumanReviews ?? 0);

  return {
    workUnitCode: raw.workUnitCode,
    workUnitVersion: raw.workUnitVersion,
    from: raw.from ?? null,
    to: raw.to ?? null,
    executions,
    acceptedExecutions: accepted,
    verifiedOutcomes: raw.verifiedOutcomes ?? 0,
    firstPassAcceptanceRate: rate(raw.firstPassAccepted, raw.reviewedExecutions),
    changeRequestRate: rate(raw.changeRequests, raw.reviewedExecutions),
    avgRevisions: raw.avgRevisions ?? null,
    avgHumanApprovals: raw.avgHumanApprovals ?? null,
    avgHumanReviews: raw.avgHumanReviews ?? null,
    avgMachineDurationMs: raw.avgMachineDurationMs ?? null,
    avgModelCalls: raw.avgModelCalls ?? null,
    avgTokens: raw.avgTokens ?? null,
    avgQualityScore: raw.avgQualityScore ?? null,
    slaAchievementRate: rate(raw.slaMet, raw.slaEvaluated),
    verifiedOutcomeRate: rate(raw.verifiedOutcomes, executions),
    humanInterventionsPerAcceptedWork:
      accepted > 0 ? Math.round((humanEvents * executions * 100) / accepted) / 100 : null,
    currency: raw.currency ?? "USD",
    knownExecutionCost: knownTotal,
    knownCostPerExecution: knownTotal !== null && costed > 0 ? Math.round((knownTotal / costed) * 1e6) / 1e6 : null,
    knownCostPerAcceptedWork:
      knownTotal !== null && accepted > 0 ? Math.round((knownTotal / accepted) * 1e6) / 1e6 : null,
    completeness,
    missingSignals: Array.from(new Set(missing)),
    lowSampleSize: executions > 0 && executions < MIN_COHORT,
  };
}

/* --------------------------------- Chính sách giá --------------------------------- */

export const PRICING_MODELS = [
  "PER_EXECUTION",
  "PER_ACCEPTED_OUTCOME",
  "BUNDLE",
  "SUBSCRIPTION_INCLUDED",
  "CUSTOM",
] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const PRICING_MODEL_LABEL: Record<PricingModel, string> = {
  PER_EXECUTION: "Theo lượt chạy",
  PER_ACCEPTED_OUTCOME: "Theo kết quả được nghiệm thu",
  BUNDLE: "Theo gói số lượng",
  SUBSCRIPTION_INCLUDED: "Bao gồm trong thuê bao",
  CUSTOM: "Thoả thuận riêng",
};

export const COMMERCIAL_UNITS = ["EXECUTION", "ACCEPTED_OUTCOME"] as const;
export type CommercialUnit = (typeof COMMERCIAL_UNITS)[number];

export interface WorkPricingPolicy {
  id: string;
  tenant_id: string | null;
  work_unit_code: string;
  work_unit_version: number;
  pricing_version: number;
  pricing_model: PricingModel;
  commercial_unit: CommercialUnit;
  currency: string;
  unit_price: number | null;
  bundle_quantity: number | null;
  bundle_price: number | null;
  included_quantity: number | null;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}

export type PricingValidationError =
  | "INVALID_PRICE"
  | "INVALID_BUNDLE_QUANTITY"
  | "INVALID_BUNDLE_PRICE"
  | "UNSUPPORTED_CURRENCY"
  | "MISSING_UNIT_PRICE"
  | "INVALID_WORK_UNIT_VERSION";

/** Kiểm tra tất định trước khi ghi chính sách giá (fail-closed). */
export function validatePricingPolicyInput(input: {
  pricingModel: PricingModel;
  currency: string;
  unitPrice?: number | null;
  bundleQuantity?: number | null;
  bundlePrice?: number | null;
  workUnitVersion: number;
}): PricingValidationError[] {
  const errors: PricingValidationError[] = [];
  if (!isSupportedCurrency(input.currency)) errors.push("UNSUPPORTED_CURRENCY");
  if (!Number.isInteger(input.workUnitVersion) || input.workUnitVersion <= 0)
    errors.push("INVALID_WORK_UNIT_VERSION");

  if (input.pricingModel === "PER_EXECUTION" || input.pricingModel === "PER_ACCEPTED_OUTCOME") {
    if (input.unitPrice === null || input.unitPrice === undefined) errors.push("MISSING_UNIT_PRICE");
    else if (!(input.unitPrice > 0)) errors.push("INVALID_PRICE");
  }
  if (input.pricingModel === "BUNDLE") {
    if (!input.bundleQuantity || input.bundleQuantity <= 0) errors.push("INVALID_BUNDLE_QUANTITY");
    if (!input.bundlePrice || input.bundlePrice <= 0) errors.push("INVALID_BUNDLE_PRICE");
  }
  if (input.unitPrice !== null && input.unitPrice !== undefined && input.unitPrice <= 0 && !errors.includes("INVALID_PRICE"))
    errors.push("INVALID_PRICE");
  return errors;
}

/* ------------------------------ Mô phỏng biên lợi nhuận ------------------------------ */

export const MARGIN_CLASSIFICATIONS = ["FULL", "PROVISIONAL", "NOT_RELIABLE"] as const;
export type MarginClassification = (typeof MARGIN_CLASSIFICATIONS)[number];

export interface MarginSimulation {
  pricingModel: PricingModel;
  commercialUnit: CommercialUnit;
  currency: string;
  proposedPrice: number;
  /** Chi phí ĐÃ BIẾT trên một đơn vị bán được — không phải tổng chi phí. */
  knownCostBasis: number | null;
  grossContribution: number | null;
  marginPercent: number | null;
  classification: MarginClassification;
  warnings: string[];
  missingCostComponents: string[];
  /** Sàn chi phí đã biết (không phải giá thị trường). */
  knownCostFloor: number | null;
  simulationVersion: string;
}

/**
 * Mô phỏng biên lợi nhuận. KHÔNG bao giờ trả về biên "thật" khi chi phí chưa đủ:
 * chi phí PARTIAL -> PROVISIONAL_MARGIN_ON_KNOWN_COST; không có chi phí -> NOT_RELIABLE.
 */
export function simulateMargin(params: {
  economics: WorkProductEconomics;
  pricingModel: PricingModel;
  commercialUnit: CommercialUnit;
  proposedPrice: number;
  currency: string;
}): MarginSimulation {
  const { economics: e } = params;
  const warnings: string[] = [];
  const basis =
    params.commercialUnit === "ACCEPTED_OUTCOME" ? e.knownCostPerAcceptedWork : e.knownCostPerExecution;

  if (!(params.proposedPrice > 0)) warnings.push("INVALID_PRICE");
  if (e.lowSampleSize) warnings.push("LOW_SAMPLE_SIZE");
  if (e.completeness !== "FULL") warnings.push("INCOMPLETE_COST_BASE");
  if (basis === null) warnings.push("NO_KNOWN_COST_BASIS");

  let classification: MarginClassification = "NOT_RELIABLE";
  if (basis !== null && params.proposedPrice > 0) {
    classification = e.completeness === "FULL" ? "FULL" : "PROVISIONAL";
  }

  const contribution = basis !== null && params.proposedPrice > 0 ? params.proposedPrice - basis : null;
  const margin =
    contribution !== null && params.proposedPrice > 0
      ? Math.round((contribution / params.proposedPrice) * 1000) / 10
      : null;

  return {
    pricingModel: params.pricingModel,
    commercialUnit: params.commercialUnit,
    currency: params.currency,
    proposedPrice: params.proposedPrice,
    knownCostBasis: basis,
    grossContribution: contribution === null ? null : Math.round(contribution * 1e6) / 1e6,
    marginPercent: classification === "NOT_RELIABLE" ? null : margin,
    classification,
    warnings,
    missingCostComponents: e.missingSignals.filter((s) => COST_COMPONENTS.includes(s as CostComponent)),
    knownCostFloor: basis,
    simulationVersion: WE3_PRICING_VERSION,
  };
}

/**
 * Phân tích giá theo biên mục tiêu. Chỉ khuyến nghị giá khi chi phí ĐẦY ĐỦ;
 * nếu không, chỉ trả về sàn chi phí đã biết (mang tính tham khảo).
 */
export function priceForTargetMargin(
  economics: WorkProductEconomics,
  targetMarginPercent: number,
  unit: CommercialUnit,
): { requiredPrice: number | null; indicativeFloor: number | null; reliable: boolean; warning: string | null } {
  const basis = unit === "ACCEPTED_OUTCOME" ? economics.knownCostPerAcceptedWork : economics.knownCostPerExecution;
  if (basis === null) return { requiredPrice: null, indicativeFloor: null, reliable: false, warning: "NO_KNOWN_COST_BASIS" };
  if (targetMarginPercent <= 0 || targetMarginPercent >= 100)
    return { requiredPrice: null, indicativeFloor: basis, reliable: false, warning: "INVALID_TARGET_MARGIN" };
  if (economics.completeness !== "FULL")
    return { requiredPrice: null, indicativeFloor: basis, reliable: false, warning: "INCOMPLETE_COST_BASE" };
  return {
    requiredPrice: Math.round((basis / (1 - targetMarginPercent / 100)) * 1e6) / 1e6,
    indicativeFloor: basis,
    reliable: true,
    warning: null,
  };
}

/* --------------------- Gợi ý mô hình giá — THUẦN LUẬT, không LLM --------------------- */

export interface PricingModelCandidate {
  candidate: PricingModel;
  reason: string;
  advisoryOnly: true;
}

export function recommendPricingModel(e: WorkProductEconomics): PricingModelCandidate {
  const advisoryOnly = true as const;
  if (e.executions === 0)
    return { candidate: "CUSTOM", reason: "Chưa có lượt chạy thật để phân loại.", advisoryOnly };
  if ((e.firstPassAcceptanceRate ?? 0) < 70 || (e.avgRevisions ?? 0) > 1.5)
    return {
      candidate: "PER_ACCEPTED_OUTCOME",
      reason: "Chất lượng còn dao động (tỉ lệ đạt lần đầu thấp hoặc nhiều vòng sửa) — nên bán theo kết quả nghiệm thu.",
      advisoryOnly,
    };
  if (e.executions >= 50)
    return { candidate: "BUNDLE", reason: "Khối lượng sử dụng lặp lại cao — phù hợp bán theo gói.", advisoryOnly };
  if ((e.slaAchievementRate ?? 0) >= 90 && (e.firstPassAcceptanceRate ?? 0) >= 85)
    return { candidate: "PER_EXECUTION", reason: "Kết quả ổn định, đúng SLA — có thể bán theo lượt chạy.", advisoryOnly };
  return { candidate: "SUBSCRIPTION_INCLUDED", reason: "Chưa đủ đặc trưng để tách bán — cân nhắc gộp vào thuê bao.", advisoryOnly };
}

export function formatMoney(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined) return "—";
  return `${v.toLocaleString("vi-VN", { maximumFractionDigits: 6 })} ${currency}`;
}

/* ------------------------------ Schema dùng chung ------------------------------ */
// Đặt ở domain (không phải file server function) để lớp RPC giữ đúng dạng vỏ mỏng.
export const CURRENCY_SCHEMA = z.enum(["USD", "VND", "EUR"]);
export const PRICING_MODEL_SCHEMA = z.enum([
  "PER_EXECUTION",
  "PER_ACCEPTED_OUTCOME",
  "BUNDLE",
  "SUBSCRIPTION_INCLUDED",
  "CUSTOM",
]);
