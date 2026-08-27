// WEE-3 — Quality Model V1 (client-safe, thuần hàm, không I/O).
//
// Bất biến:
//  - Điểm chất lượng do SERVER tính từ kết quả từng chiều; điểm model tự chấm KHÔNG có thẩm quyền.
//  - Hard gate ghi đè điểm số: điểm cao vẫn có thể `passed = false`.
//  - Trạng thái chất lượng TÁCH KHỎI trạng thái bước thực thi (SUCCEEDED/FAILED).

export const QUALITY_MODEL_VERSION = "wee3.quality.v1";

/** Ngưỡng đạt — nơi cấu hình DUY NHẤT, có version, không hard-code rải rác UI. */
export const QUALITY_PASS_THRESHOLD = 75;
export const QUALITY_THRESHOLD_VERSION = "threshold.v1";

export const QUALITY_DIMENSIONS = [
  "acceptanceCriteria",
  "evidenceGrounding",
  "completeness",
  "consistency",
  "actionVerification",
] as const;
export type QualityDimensionKey = (typeof QUALITY_DIMENSIONS)[number];

/** Trọng số V1 khi KHÔNG có hành động ghi dữ liệu nào cần kiểm chứng. */
export const QUALITY_WEIGHTS_BASE: Record<Exclude<QualityDimensionKey, "actionVerification">, number> = {
  acceptanceCriteria: 0.35,
  evidenceGrounding: 0.3,
  completeness: 0.2,
  consistency: 0.15,
};

/** Trọng số V1 khi CÓ hành động nghiệp vụ cần kiểm chứng (ACTION_VERIFICATION áp dụng). */
export const QUALITY_WEIGHTS_WITH_ACTION: Record<QualityDimensionKey, number> = {
  acceptanceCriteria: 0.3,
  evidenceGrounding: 0.25,
  completeness: 0.15,
  consistency: 0.15,
  actionVerification: 0.15,
};

export const QUALITY_STATUSES = [
  "NOT_EVALUATED",
  "EVALUATING",
  "PASSED",
  "PASSED_WITH_WARNINGS",
  "FAILED_QUALITY",
  "EVALUATION_ERROR",
] as const;
export type QualityStatus = (typeof QUALITY_STATUSES)[number];

export const QUALITY_STATUS_LABEL: Record<QualityStatus, string> = {
  NOT_EVALUATED: "Chưa chấm",
  EVALUATING: "Đang chấm",
  PASSED: "Đạt",
  PASSED_WITH_WARNINGS: "Đạt kèm cảnh báo",
  FAILED_QUALITY: "Chưa đạt chất lượng",
  EVALUATION_ERROR: "Lỗi cơ chế chấm",
};

/* --------------------------- Acceptance criteria -------------------------- */

export const CRITERION_STATUSES = ["MET", "PARTIAL", "NOT_MET", "NOT_EVALUABLE"] as const;
export type CriterionStatus = (typeof CRITERION_STATUSES)[number];

export const CRITERION_STATUS_LABEL: Record<CriterionStatus, string> = {
  MET: "Đạt",
  PARTIAL: "Đạt một phần",
  NOT_MET: "Chưa đạt",
  NOT_EVALUABLE: "Không thể đánh giá",
};

export interface CriterionResult {
  criterion: string;
  status: CriterionStatus;
  evidenceRefs: string[];
  reason: string;
}

/**
 * Tách chuỗi tiêu chí nghiệm thu của công việc thành danh sách tiêu chí rời rạc.
 * Server-authoritative: chỉ dùng chuỗi lấy từ database, không nhận từ client.
 */
export function parseAcceptanceCriteria(raw: string | null | undefined): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  const byLine = text
    .split(/\r?\n+/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  const parts = byLine.length > 1 ? byLine : text.split(/[;·]|(?<=[.!?])\s+(?=[A-ZĐÀ-Ỹ])/u);
  return parts
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter((p) => p.length >= 3)
    .slice(0, 12);
}

/* ------------------------------ Assessment ------------------------------- */

export interface QualityFinding {
  code: string;
  message: string;
  refs?: string[];
}

export interface QualityDimensionResult {
  score: number;
  passed: boolean;
  findings: QualityFinding[];
}

export const HARD_GATE_CODES = [
  "FABRICATED_CITATION",
  "FOREIGN_TENANT_EVIDENCE",
  "REQUIRED_CRITERION_MISSING",
  "CLAIMED_ACTION_NOT_EXECUTED",
  "CRITICAL_CONTRADICTION",
  "EMPTY_DELIVERABLE",
] as const;
export type HardGateCode = (typeof HARD_GATE_CODES)[number];

export const HARD_GATE_LABEL: Record<HardGateCode, string> = {
  FABRICATED_CITATION: "Có trích dẫn không tồn tại trong ngữ cảnh",
  FOREIGN_TENANT_EVIDENCE: "Có nguồn không thuộc tổ chức của bạn",
  REQUIRED_CRITERION_MISSING: "Thiếu tiêu chí nghiệm thu bắt buộc",
  CLAIMED_ACTION_NOT_EXECUTED: "Hành động được nêu nhưng chưa thực sự xảy ra",
  CRITICAL_CONTRADICTION: "Mâu thuẫn nghiêm trọng trong bản bàn giao",
  EMPTY_DELIVERABLE: "Bản bàn giao rỗng",
};

export interface QualityAssessment {
  version: string;
  thresholdVersion: string;
  threshold: number;
  score: number;
  passed: boolean;
  status: QualityStatus;
  dimensions: Partial<Record<QualityDimensionKey, QualityDimensionResult>>;
  criteria: CriterionResult[];
  blockers: QualityFinding[];
  warnings: QualityFinding[];
  evaluatedAt: string;
  evaluator: {
    generatorModel: string | null;
    evaluatorModel: string | null;
    evaluationRequestId: string | null;
    deterministicOnly: boolean;
    modelCalls: number;
    inputTokens: number;
    outputTokens: number;
    /** Giới hạn trung thực: evaluator dùng chung hạ tầng provider với generator. */
    independenceNote: string;
  };
}

export const EVALUATOR_INDEPENDENCE_NOTE =
  "Evaluator là một lượt gọi riêng với prompt kiểm định riêng, nhưng dùng chung hạ tầng provider với generator — đây không phải độc lập tuyệt đối.";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

/** Điểm chiều ACCEPTANCE_CRITERIA suy ra tất định từ trạng thái từng tiêu chí. */
export function scoreAcceptanceCriteria(results: CriterionResult[]): QualityDimensionResult {
  if (results.length === 0) {
    return {
      score: 0,
      passed: false,
      findings: [{ code: "NO_CRITERIA", message: "Công việc không có tiêu chí nghiệm thu để đối chiếu." }],
    };
  }
  const weightOf = (s: CriterionStatus) => (s === "MET" ? 1 : s === "PARTIAL" ? 0.5 : 0);
  const evaluable = results.filter((r) => r.status !== "NOT_EVALUABLE");
  const base = evaluable.length ? evaluable.reduce((a, r) => a + weightOf(r.status), 0) / evaluable.length : 0;
  const score = clamp(base * 100);
  const findings: QualityFinding[] = results
    .filter((r) => r.status !== "MET")
    .map((r) => ({
      code: `CRITERION_${r.status}`,
      message: `${r.criterion} — ${r.reason || CRITERION_STATUS_LABEL[r.status]}`,
      refs: r.evidenceRefs,
    }));
  return { score, passed: score >= 70 && !results.some((r) => r.status === "NOT_MET"), findings };
}

/** Điểm chiều EVIDENCE_GROUNDING suy ra tất định từ kết quả kiểm trích dẫn. */
export interface GroundingCheck {
  validCitationCount: number;
  invalidCitationCount: number;
  foreignTenantCount: number;
  contextSourceCount: number;
  uncitedClaimsWarning: boolean;
}

export function scoreEvidenceGrounding(g: GroundingCheck): QualityDimensionResult {
  const findings: QualityFinding[] = [];
  const total = g.validCitationCount + g.invalidCitationCount;
  let score = 100;
  if (g.contextSourceCount === 0) {
    score = 40;
    findings.push({ code: "NO_CONTEXT_SOURCE", message: "Không có nguồn ngữ cảnh nào được nạp cho lượt chạy." });
  }
  if (total === 0 && g.contextSourceCount > 0) {
    score = Math.min(score, 50);
    findings.push({ code: "NO_CITATION", message: "Bản bàn giao không trích dẫn nguồn nào dù ngữ cảnh có dữ liệu." });
  }
  if (total > 0) {
    score = Math.min(score, clamp((g.validCitationCount / total) * 100));
  }
  if (g.invalidCitationCount > 0) {
    findings.push({
      code: "INVALID_CITATION",
      message: `${g.invalidCitationCount} trích dẫn không phân giải được về nguồn hợp lệ.`,
    });
  }
  if (g.foreignTenantCount > 0) {
    score = 0;
    findings.push({ code: "FOREIGN_TENANT_SOURCE", message: `${g.foreignTenantCount} nguồn không thuộc tổ chức.` });
  }
  if (g.uncitedClaimsWarning) {
    findings.push({ code: "UNCITED_CLAIMS", message: "Có khẳng định quan trọng chưa kèm trích dẫn." });
  }
  return { score, passed: score >= 80 && g.invalidCitationCount === 0 && g.foreignTenantCount === 0, findings };
}

/* -------------------------------- Hard gates ------------------------------ */

export interface HardGateInput {
  deliverableLength: number;
  invalidCitationCount: number;
  foreignTenantCount: number;
  criteria: CriterionResult[];
  claimedActions: number;
  verifiedActions: number;
  criticalContradiction: boolean;
}

/** Hard gate do SERVER sở hữu; AI không thể ghi đè. */
export function evaluateHardGates(i: HardGateInput): QualityFinding[] {
  const blockers: QualityFinding[] = [];
  const add = (code: HardGateCode, message?: string) =>
    blockers.push({ code, message: message ?? HARD_GATE_LABEL[code] });

  if (i.deliverableLength < 40) add("EMPTY_DELIVERABLE");
  if (i.invalidCitationCount > 0) add("FABRICATED_CITATION", `${HARD_GATE_LABEL.FABRICATED_CITATION} (${i.invalidCitationCount}).`);
  if (i.foreignTenantCount > 0) add("FOREIGN_TENANT_EVIDENCE");
  if (i.criteria.some((c) => c.status === "NOT_MET")) {
    const missing = i.criteria.filter((c) => c.status === "NOT_MET").map((c) => c.criterion);
    add("REQUIRED_CRITERION_MISSING", `${HARD_GATE_LABEL.REQUIRED_CRITERION_MISSING}: ${missing.join(" · ")}`);
  }
  if (i.claimedActions > i.verifiedActions) {
    add(
      "CLAIMED_ACTION_NOT_EXECUTED",
      `${HARD_GATE_LABEL.CLAIMED_ACTION_NOT_EXECUTED} (${i.verifiedActions}/${i.claimedActions} kiểm chứng được).`,
    );
  }
  if (i.criticalContradiction) add("CRITICAL_CONTRADICTION");
  return blockers;
}

/* ------------------------------- Aggregation ------------------------------ */

export interface AggregateInput {
  dimensions: Partial<Record<QualityDimensionKey, QualityDimensionResult>>;
  criteria: CriterionResult[];
  blockers: QualityFinding[];
  warnings: QualityFinding[];
  evaluator: QualityAssessment["evaluator"];
  evaluatedAt?: string;
  /** Cơ chế chấm hỏng (evaluator crash / payload sai) — KHÁC với "chất lượng thấp". */
  evaluationError?: string | null;
}

/** Tổng hợp cuối cùng — nguồn sự thật duy nhất cho điểm & trạng thái chất lượng. */
export function aggregateQuality(i: AggregateInput): QualityAssessment {
  const withAction = Boolean(i.dimensions.actionVerification);
  const weights: Partial<Record<QualityDimensionKey, number>> = withAction
    ? QUALITY_WEIGHTS_WITH_ACTION
    : QUALITY_WEIGHTS_BASE;

  let sum = 0;
  let weightUsed = 0;
  for (const key of QUALITY_DIMENSIONS) {
    const dim = i.dimensions[key];
    const w = weights[key];
    if (!dim || !w) continue;
    sum += dim.score * w;
    weightUsed += w;
  }
  const score = weightUsed > 0 ? clamp(sum / weightUsed) : 0;
  const hasBlockers = i.blockers.length > 0;
  const evaluatedAt = i.evaluatedAt ?? new Date().toISOString();

  if (i.evaluationError) {
    return {
      version: QUALITY_MODEL_VERSION,
      thresholdVersion: QUALITY_THRESHOLD_VERSION,
      threshold: QUALITY_PASS_THRESHOLD,
      score: 0,
      passed: false,
      status: "EVALUATION_ERROR",
      dimensions: i.dimensions,
      criteria: i.criteria,
      blockers: [{ code: "EVALUATION_ERROR", message: i.evaluationError }, ...i.blockers],
      warnings: i.warnings,
      evaluatedAt,
      evaluator: i.evaluator,
    };
  }

  const passed = !hasBlockers && score >= QUALITY_PASS_THRESHOLD;
  const status: QualityStatus = hasBlockers
    ? "FAILED_QUALITY"
    : score < QUALITY_PASS_THRESHOLD
      ? "FAILED_QUALITY"
      : i.warnings.length > 0
        ? "PASSED_WITH_WARNINGS"
        : "PASSED";

  return {
    version: QUALITY_MODEL_VERSION,
    thresholdVersion: QUALITY_THRESHOLD_VERSION,
    threshold: QUALITY_PASS_THRESHOLD,
    score,
    passed,
    status,
    dimensions: i.dimensions,
    criteria: i.criteria,
    blockers: i.blockers,
    warnings: i.warnings,
    evaluatedAt,
    evaluator: i.evaluator,
  };
}

/* -------------------------------- Outcome -------------------------------- */

export const OUTCOME_TYPES = [
  "REPORT_ACCEPTED",
  "TASK_CREATED",
  "FOLLOW_UP_PREPARED",
  "PROJECT_RISK_IDENTIFIED",
  "NO_ACTION_REQUIRED",
] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

export const OUTCOME_STATUSES = ["PROPOSED", "VERIFIED", "ACCEPTED", "REJECTED"] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export const OUTCOME_TYPE_LABEL: Record<OutcomeType, string> = {
  REPORT_ACCEPTED: "Bản báo cáo được chấp nhận",
  TASK_CREATED: "Đã tạo công việc thật",
  FOLLOW_UP_PREPARED: "Đã chuẩn bị việc tiếp nối",
  PROJECT_RISK_IDENTIFIED: "Đã nhận diện rủi ro dự án",
  NO_ACTION_REQUIRED: "Không cần hành động",
};

export interface OutcomeRecord {
  type: OutcomeType;
  status: OutcomeStatus;
  resultRefs: { kind: string; id: string }[];
  summary: string;
  verified: boolean;
  verifiedAt: string | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  acceptedWithWarnings?: boolean;
}

/** Deliverable ≠ Outcome: outcome chỉ VERIFIED khi có tham chiếu đối tượng thật. */
export function deriveOutcome(i: {
  verifiedActionRefs: { kind: string; id: string }[];
  claimedActions: number;
  deliverableType: string | null;
  qualityPassed: boolean;
}): OutcomeRecord {
  const now = new Date().toISOString();
  if (i.verifiedActionRefs.length > 0) {
    return {
      type: "TASK_CREATED",
      status: "VERIFIED",
      resultRefs: i.verifiedActionRefs,
      summary: `${i.verifiedActionRefs.length} đối tượng nghiệp vụ được tạo và kiểm chứng trong hệ thống.`,
      verified: true,
      verifiedAt: now,
      acceptedBy: null,
      acceptedAt: null,
    };
  }
  if (i.claimedActions > 0) {
    return {
      type: "FOLLOW_UP_PREPARED",
      status: "PROPOSED",
      resultRefs: [],
      summary: `${i.claimedActions} hành động được đề xuất nhưng chưa được thực thi.`,
      verified: false,
      verifiedAt: null,
      acceptedBy: null,
      acceptedAt: null,
    };
  }
  return {
    type: i.deliverableType === "ANALYSIS" ? "PROJECT_RISK_IDENTIFIED" : "REPORT_ACCEPTED",
    status: "PROPOSED",
    resultRefs: [],
    summary: i.qualityPassed
      ? "Bản bàn giao đạt kiểm chất lượng, chờ con người nghiệm thu."
      : "Bản bàn giao chưa đạt kiểm chất lượng, chờ con người quyết định.",
    verified: false,
    verifiedAt: null,
    acceptedBy: null,
    acceptedAt: null,
  };
}
