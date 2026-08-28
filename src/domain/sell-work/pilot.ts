// SWP-2 — Mô hình pilot thương mại (client-safe, không I/O).
//
// Bất biến:
//  - Mọi số liệu pilot do SERVER tính (RPC compute_sell_work_pilot_*). UI chỉ hiển thị.
//  - Tín hiệu KHÁCH HÀNG TỰ BÁO CÁO không bao giờ trộn vào số liệu hệ thống xác minh.
//  - "INTERESTED" không phải doanh thu. PAID chỉ khi có bằng chứng thương mại được xác minh.
//  - Không có tỉ lệ nào được hiển thị mà thiếu cỡ mẫu (N) và cửa sổ đo.

/* ------------------------------ Trạng thái pilot ------------------------------ */

export const PILOT_STATUSES = [
  "PROSPECT",
  "QUALIFIED",
  "ONBOARDING",
  "ACTIVE_PILOT",
  "VALUE_PROVEN",
  "PAID_PILOT",
  "REPEAT_USAGE",
  "EXPANSION_SIGNAL",
  "PAUSED",
  "LOST",
] as const;
export type PilotStatus = (typeof PILOT_STATUSES)[number];

export const PILOT_STATUS_LABEL: Record<PilotStatus, string> = {
  PROSPECT: "Tiềm năng",
  QUALIFIED: "Đã sàng lọc",
  ONBOARDING: "Đang thiết lập",
  ACTIVE_PILOT: "Đang thí điểm",
  VALUE_PROVEN: "Đã chứng minh giá trị",
  PAID_PILOT: "Thí điểm có trả phí",
  REPEAT_USAGE: "Dùng lặp lại",
  EXPANSION_SIGNAL: "Tín hiệu mở rộng",
  PAUSED: "Tạm dừng",
  LOST: "Đã mất",
};

/** Bảng chuyển trạng thái — PHẢI khớp với RPC set_sell_work_pilot_status (nguồn sự thật là server). */
export const PILOT_TRANSITIONS: Record<PilotStatus, PilotStatus[]> = {
  PROSPECT: ["QUALIFIED", "LOST", "PAUSED"],
  QUALIFIED: ["ONBOARDING", "LOST", "PAUSED"],
  ONBOARDING: ["ACTIVE_PILOT", "LOST", "PAUSED"],
  ACTIVE_PILOT: ["VALUE_PROVEN", "PAID_PILOT", "REPEAT_USAGE", "PAUSED", "LOST"],
  VALUE_PROVEN: ["PAID_PILOT", "REPEAT_USAGE", "EXPANSION_SIGNAL", "PAUSED", "LOST"],
  PAID_PILOT: ["REPEAT_USAGE", "EXPANSION_SIGNAL", "PAUSED", "LOST"],
  REPEAT_USAGE: ["EXPANSION_SIGNAL", "PAID_PILOT", "PAUSED", "LOST"],
  EXPANSION_SIGNAL: ["PAID_PILOT", "PAUSED", "LOST"],
  PAUSED: ["ACTIVE_PILOT", "LOST"],
  LOST: [],
};

/* --------------------------- Tín hiệu sẵn sàng chi trả --------------------------- */

export const WTP_SIGNALS = ["NO_SIGNAL", "INTERESTED", "WILL_PAY_AT_RIGHT_PRICE", "PAID_PILOT", "CONTRACTED"] as const;
export type WtpSignal = (typeof WTP_SIGNALS)[number];
export const WTP_LABEL: Record<WtpSignal, string> = {
  NO_SIGNAL: "Chưa có tín hiệu",
  INTERESTED: "Quan tâm",
  WILL_PAY_AT_RIGHT_PRICE: "Sẽ trả nếu đúng giá",
  PAID_PILOT: "Thí điểm có trả phí",
  CONTRACTED: "Đã ký hợp đồng",
};

/* --------------------------------- Mô hình giá --------------------------------- */

export const PILOT_COMMERCIAL_MODELS = [
  "PER_EXECUTION",
  "PER_ACCEPTED_OUTCOME",
  "MONTHLY_BUNDLE",
  "SUBSCRIPTION_INCLUDED",
  "CUSTOM",
] as const;
export type PilotCommercialModel = (typeof PILOT_COMMERCIAL_MODELS)[number];
export const PILOT_COMMERCIAL_MODEL_LABEL: Record<PilotCommercialModel, string> = {
  PER_EXECUTION: "Theo lượt chạy",
  PER_ACCEPTED_OUTCOME: "Theo kết quả nghiệm thu",
  MONTHLY_BUNDLE: "Gói theo tháng",
  SUBSCRIPTION_INCLUDED: "Bao gồm trong thuê bao",
  CUSTOM: "Thoả thuận riêng",
};

export const PRICING_RESPONSES = ["ACCEPTED", "NEGOTIATING", "REJECTED", "NO_RESPONSE"] as const;
export type PricingResponse = (typeof PRICING_RESPONSES)[number];
export const PRICING_RESPONSE_LABEL: Record<PricingResponse, string> = {
  ACCEPTED: "Chấp nhận",
  NEGOTIATING: "Đang đàm phán",
  REJECTED: "Từ chối",
  NO_RESPONSE: "Chưa phản hồi",
};

/* ------------------------------- Doanh thu ------------------------------- */

export const REVENUE_CLASSES = ["PILOT_FEE", "SUBSCRIPTION", "WORK_PRODUCT_FEE", "SERVICES", "OTHER"] as const;
export type RevenueClass = (typeof REVENUE_CLASSES)[number];
export const REVENUE_GROUPS = ["SOFTWARE", "SELL_WORK", "SERVICES"] as const;
export type RevenueGroup = (typeof REVENUE_GROUPS)[number];
export const REVENUE_GROUP_LABEL: Record<RevenueGroup, string> = {
  SOFTWARE: "Doanh thu phần mềm",
  SELL_WORK: "Doanh thu bán công việc",
  SERVICES: "Doanh thu dịch vụ",
};

/* --------------------------- Hỗ trợ / phụ thuộc dịch vụ --------------------------- */

export const SUPPORT_CATEGORIES = [
  "PRODUCT_SUPPORT",
  "DATA_SETUP",
  "TRAINING",
  "BUG",
  "CUSTOM_CONFIG",
  "CUSTOM_ENGINEERING",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, string> = {
  PRODUCT_SUPPORT: "Hỗ trợ sản phẩm",
  DATA_SETUP: "Thiết lập dữ liệu thủ công",
  TRAINING: "Đào tạo",
  BUG: "Lỗi phần mềm",
  CUSTOM_CONFIG: "Cấu hình riêng",
  CUSTOM_ENGINEERING: "Phát triển riêng",
};

/* ---------------------------- Phân loại thất bại pilot ---------------------------- */

export const PILOT_FAILURE_REASONS = [
  "NO_ACTIVATION",
  "INSUFFICIENT_CONTEXT",
  "LOW_QUALITY",
  "TOO_MUCH_HUMAN_WORK",
  "NO_REPEAT_USAGE",
  "NO_VERIFIED_VALUE",
  "PRICE_REJECTION",
  "INTEGRATION_BLOCKER",
  "CUSTOMER_PRIORITY_CHANGED",
  "OTHER",
] as const;
export type PilotFailureReason = (typeof PILOT_FAILURE_REASONS)[number];
export const PILOT_FAILURE_LABEL: Record<PilotFailureReason, string> = {
  NO_ACTIVATION: "Không kích hoạt được",
  INSUFFICIENT_CONTEXT: "Ngữ cảnh dữ liệu không đủ",
  LOW_QUALITY: "Chất lượng thấp",
  TOO_MUCH_HUMAN_WORK: "Tốn quá nhiều công người",
  NO_REPEAT_USAGE: "Không dùng lặp lại",
  NO_VERIFIED_VALUE: "Không xác minh được giá trị",
  PRICE_REJECTION: "Từ chối mức giá",
  INTEGRATION_BLOCKER: "Vướng tích hợp",
  CUSTOMER_PRIORITY_CHANGED: "Khách đổi ưu tiên",
  OTHER: "Khác",
};

/* -------------------------------- Sự kiện thương mại -------------------------------- */

export const COMMERCIAL_EVENTS = [
  "PILOT_CREATED",
  "PILOT_ACTIVATED",
  "WORK_PRODUCT_ACTIVATED",
  "FIRST_EXECUTION",
  "FIRST_ACCEPTED_WORK",
  "REPEAT_EXECUTION",
  "VALUE_CONFIRMED",
  "PRICE_DISCUSSION_STARTED",
  "PAID_PILOT_CONFIRMED",
  "EXPANSION_DISCUSSION",
  "PILOT_LOST",
  "STATUS_CHANGED",
] as const;
export type CommercialEventType = (typeof COMMERCIAL_EVENTS)[number];
export const COMMERCIAL_EVENT_LABEL: Record<CommercialEventType, string> = {
  PILOT_CREATED: "Tạo pilot",
  PILOT_ACTIVATED: "Kích hoạt pilot",
  WORK_PRODUCT_ACTIVATED: "Kích hoạt sản phẩm công việc",
  FIRST_EXECUTION: "Lượt chạy đầu tiên",
  FIRST_ACCEPTED_WORK: "Kết quả được nghiệm thu đầu tiên",
  REPEAT_EXECUTION: "Chạy lặp lại",
  VALUE_CONFIRMED: "Xác nhận giá trị",
  PRICE_DISCUSSION_STARTED: "Bắt đầu trao đổi giá",
  PAID_PILOT_CONFIRMED: "Xác nhận trả phí",
  EXPANSION_DISCUSSION: "Trao đổi mở rộng",
  PILOT_LOST: "Mất pilot",
  STATUS_CHANGED: "Đổi trạng thái",
};

/* ------------------------------- Sức khoẻ pilot ------------------------------- */

export type PilotHealth = "GREEN" | "YELLOW" | "RED";
export const PILOT_HEALTH_LABEL: Record<PilotHealth, string> = {
  GREEN: "Tốt",
  YELLOW: "Cần theo dõi",
  RED: "Rủi ro",
};

export interface PilotHealthFactors {
  activated: boolean;
  recentUsage: boolean;
  acceptanceOk: boolean;
  qualityOk: boolean;
  repeatUsage: boolean;
  commercialSignal: boolean;
}

export const HEALTH_FACTOR_LABEL: Record<keyof PilotHealthFactors, string> = {
  activated: "Đã kích hoạt",
  recentUsage: "Có sử dụng trong 14 ngày",
  acceptanceOk: "Tỉ lệ duyệt lần đầu ≥ 70%",
  qualityOk: "Điểm chất lượng trung bình ≥ 75",
  repeatUsage: "Có dùng lặp lại",
  commercialSignal: "Có tín hiệu thương mại",
};

/* ------------------------------ Kết quả RPC ------------------------------ */

export interface PilotExecutionMetrics {
  totalExecutions: number;
  completedExecutions: number;
  acceptedExecutions: number;
  failedExecutions: number;
  firstPassAccepted: number;
  firstPassAcceptanceRate: number | null;
  finalAcceptanceRate: number | null;
  averageQualityScore: number | null;
  medianQualityScore: number | null;
  averageRevisions: number | null;
  averageHumanInterventions: number | null;
  slaPassRate: number | null;
  slaKnownCount: number;
  verifiedOutcomeRate: number | null;
  verifiedOutcomeKnownCount: number;
  currency: string | null;
  currencyMismatch: boolean;
  knownCostTotal: number | null;
  costKnownCount: number;
  costFullCount: number;
  knownCostPerExecution: number | null;
  knownCostPerAcceptedWork: number | null;
  models: { model: string; executions: number }[] | null;
}

export interface PilotProductMetrics {
  code: string;
  version: number;
  status: "PLANNED" | "ACTIVE" | "PAUSED" | "DROPPED";
  activatedAt: string | null;
  expectedFrequency: string | null;
  expectedUserGroup: string | null;
  targetProblem: string | null;
  expectedDeliverable: string | null;
  successCriteria: string | null;
  measurableOutcome: string | null;
  commercialHypothesis: string | null;
  executions: number;
  acceptedExecutions: number;
  activePeriods: number;
  repeatSignal: "NONE" | "REPEAT_SIGNAL" | "STRONG_REPEAT_SIGNAL";
}

export interface PilotMetrics {
  pilotId: string;
  tenantId: string;
  status: PilotStatus;
  customerSegment: string | null;
  industry: string | null;
  startDate: string;
  targetEndDate: string | null;
  activatedAt: string | null;
  lastActivityAt: string | null;
  commercialModel: PilotCommercialModel | null;
  wtpSignal: WtpSignal;
  wtpAmount: number | null;
  wtpCurrency: string | null;
  paidVerifiedAt: string | null;
  paidEvidenceReference: string | null;
  lostPrimaryReason: PilotFailureReason | null;
  windowFrom: string;
  windowTo: string;
  products: PilotProductMetrics[];
  productCount: number;
  productsWithRepeatUsage: number;
  execution: PilotExecutionMetrics;
  /** Tín hiệu KHÁCH HÀNG TỰ BÁO CÁO — không phải kết quả hệ thống xác minh. */
  selfReported: {
    responses: number;
    veryUseful: number;
    partial: number;
    notUseful: number;
    wouldUseAgainYes: number;
    selfReportedTimeSavedMinutes: number | null;
  };
  support: {
    interventions: number;
    minutes: number;
    customEngineering: number;
    dataSetup: number;
    training: number;
    productSupport: number;
    bug: number;
    customConfig: number;
  };
  revenue: { records: number; software: number; sellWork: number; services: number; currencies: string[] };
  timeToFirstAcceptedWorkMs: number | null;
  timeToSecondAcceptedWorkMs: number | null;
  health: PilotHealth;
  healthFactors: PilotHealthFactors;
  sampleSize: number;
  computedAt: string;
}

export interface PilotPortfolioRow {
  pilotId: string;
  tenantId: string;
  tenantName: string | null;
  status: PilotStatus;
  industry: string | null;
  customerSegment: string | null;
  activatedAt: string | null;
  wtpSignal: WtpSignal;
  paidVerifiedAt: string | null;
  products: string[];
  activeProductCount: number;
  executions: number;
  acceptedExecutions: number;
  supportInterventions: number;
}

export interface PilotPortfolio {
  windowFrom: string;
  windowTo: string;
  summary: {
    totalPilots: number;
    activePilots: number;
    paidPilots: number;
    lostPilots: number;
    pausedPilots: number;
    expansionSignals: number;
    customersWithWtpSignal: number;
    activatedCustomers: number;
    lostReasons: Record<string, number>;
  };
  pilots: PilotPortfolioRow[];
  servicesDependency: {
    pilotsTotal: number;
    pilotsWithCustomEngineering: number;
    pilotsWithManualDataSetup: number;
    pilotsWithRepeatedSupport: number;
    supportMinutesTotal: number;
  };
  pricingResponses: Record<string, number>;
  revenue: { software: number; sellWork: number; services: number; currencies: string[] };
  computedAt: string;
}

/* ---------------------- Trạng thái bằng chứng thương mại ---------------------- */

export const COMMERCIAL_PROOF_STATUSES = [
  "NONE",
  "DESIGN_PARTNER",
  "PAID_PILOT",
  "REPEAT_USAGE",
  "ECONOMICS_PROVEN",
  "COMMERCIAL_SIGNAL",
  "SCALE_SIGNAL",
] as const;
export type CommercialProofStatus = (typeof COMMERCIAL_PROOF_STATUSES)[number];

export const COMMERCIAL_PROOF_LABEL: Record<CommercialProofStatus, string> = {
  NONE: "Chưa có bằng chứng",
  DESIGN_PARTNER: "Có đối tác thiết kế",
  PAID_PILOT: "Có thí điểm trả phí",
  REPEAT_USAGE: "Có dùng lặp lại",
  ECONOMICS_PROVEN: "Kinh tế đơn vị đủ tin cậy",
  COMMERCIAL_SIGNAL: "Tín hiệu thương mại",
  SCALE_SIGNAL: "Tín hiệu mở rộng quy mô",
};

/** Ngưỡng công bố — tài liệu hoá tại docs/sell-work/pilot/SWP2_SUCCESS_CRITERIA.md */
export const PROOF_THRESHOLDS = {
  ECONOMICS_ACCEPTED_MIN: 20,
  REPEAT_CUSTOMERS_MIN: 2,
  SCALE_CUSTOMERS_MIN: 3,
} as const;

export interface ProductProofInput {
  code: string;
  pilotCount: number;
  paidPilotCount: number;
  customersWithRepeatUsage: number;
  wtpConfirmations: number;
  acceptedExecutions: number;
  knownCostPerAcceptedWork: number | null;
  economicsCompleteness: "FULL" | "PARTIAL" | "INSUFFICIENT";
  finalAcceptanceRate: number | null;
  pilotsWithCustomEngineering: number;
}

/**
 * Phân loại bằng chứng thương mại — TẤT ĐỊNH, chỉ từ dữ liệu đã xác minh.
 * Một lời khen tích cực KHÔNG bao giờ tạo ra tín hiệu thương mại.
 */
export function classifyCommercialProof(i: ProductProofInput): CommercialProofStatus {
  const economicsProven =
    i.acceptedExecutions >= PROOF_THRESHOLDS.ECONOMICS_ACCEPTED_MIN &&
    i.knownCostPerAcceptedWork !== null &&
    i.economicsCompleteness !== "INSUFFICIENT";

  const scale =
    i.customersWithRepeatUsage >= PROOF_THRESHOLDS.SCALE_CUSTOMERS_MIN &&
    economicsProven &&
    (i.finalAcceptanceRate ?? 0) >= 80 &&
    i.pilotsWithCustomEngineering === 0;
  if (scale) return "SCALE_SIGNAL";

  const commercial =
    (i.paidPilotCount > 0 || i.wtpConfirmations >= 2) && i.customersWithRepeatUsage >= PROOF_THRESHOLDS.REPEAT_CUSTOMERS_MIN;
  if (commercial) return "COMMERCIAL_SIGNAL";

  if (economicsProven) return "ECONOMICS_PROVEN";
  if (i.customersWithRepeatUsage > 0) return "REPEAT_USAGE";
  if (i.paidPilotCount > 0) return "PAID_PILOT";
  if (i.pilotCount > 0) return "DESIGN_PARTNER";
  return "NONE";
}

/* --------------------------- Khung quyết định sản phẩm --------------------------- */

export const PRODUCT_DECISIONS = ["DOUBLE_DOWN", "IMPROVE", "REPOSITION", "PAUSE"] as const;
export type ProductDecision = (typeof PRODUCT_DECISIONS)[number];
export const PRODUCT_DECISION_LABEL: Record<ProductDecision, string> = {
  DOUBLE_DOWN: "Đầu tư mạnh",
  IMPROVE: "Cải thiện",
  REPOSITION: "Định vị lại",
  PAUSE: "Tạm dừng",
};

/** Gợi ý quyết định — chỉ tham khảo, luôn kèm cỡ mẫu. Không thay thế phán đoán con người. */
export function suggestProductDecision(i: ProductProofInput): { decision: ProductDecision; reason: string } {
  if (i.acceptedExecutions === 0)
    return { decision: "PAUSE", reason: "Chưa có kết quả nào được nghiệm thu — không có bằng chứng nhu cầu." };
  const proof = classifyCommercialProof(i);
  if (proof === "SCALE_SIGNAL" || proof === "COMMERCIAL_SIGNAL")
    return { decision: "DOUBLE_DOWN", reason: "Dùng lặp lại nhiều khách + tín hiệu thương mại xác minh." };
  if (i.customersWithRepeatUsage > 0 && (i.finalAcceptanceRate ?? 0) < 80)
    return { decision: "IMPROVE", reason: "Có nhu cầu thật nhưng tỉ lệ nghiệm thu chưa đạt." };
  if (i.wtpConfirmations === 0 && (i.finalAcceptanceRate ?? 0) >= 80)
    return { decision: "REPOSITION", reason: "Kết quả được dùng nhưng chưa xác định đúng người mua / mức giá." };
  return { decision: "IMPROVE", reason: "Bằng chứng còn mỏng — tiếp tục thu thập trước khi kết luận." };
}

/* ------------------------------ Trình bày an toàn ------------------------------ */

/** Không bao giờ hiển thị tỉ lệ mà thiếu cỡ mẫu. */
export function rateWithSample(rate: number | null | undefined, n: number): string {
  if (rate === null || rate === undefined) return "Không đủ dữ liệu";
  return `${rate}% (N=${n})`;
}

export function msToDays(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "Không đủ dữ liệu";
  const days = ms / 86_400_000;
  return days < 1 ? `${Math.max(1, Math.round(ms / 3_600_000))} giờ` : `${days.toFixed(1)} ngày`;
}
