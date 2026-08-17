// AI MARKET — hợp đồng nhân sự AI: trạng thái, chuyển trạng thái hợp lệ và quy tắc đàm phán lương.
// Thuần logic, không import Supabase (Blueprint §25).

export const AI_EMPLOYMENT_STATUSES = [
  "INTERVIEW",
  "OFFER",
  "TRIAL",
  "HIRED",
  "REJECTED",
  "TERMINATED",
] as const;
export type AiEmploymentStatus = (typeof AI_EMPLOYMENT_STATUSES)[number];

export const AI_EMPLOYMENT_STATUS_LABELS: Record<AiEmploymentStatus, string> = {
  INTERVIEW: "Đang phỏng vấn",
  OFFER: "Đang đàm phán",
  TRIAL: "Thử việc",
  HIRED: "Chính thức",
  REJECTED: "Đã từ chối",
  TERMINATED: "Đã kết thúc",
};

/** Chuyển trạng thái hợp lệ trong luồng tuyển dụng. */
export const AI_EMPLOYMENT_TRANSITIONS: Record<AiEmploymentStatus, readonly AiEmploymentStatus[]> = {
  INTERVIEW: ["OFFER", "REJECTED"],
  OFFER: ["TRIAL", "HIRED", "REJECTED"],
  TRIAL: ["HIRED", "TERMINATED"],
  HIRED: ["TERMINATED"],
  REJECTED: [],
  TERMINATED: [],
};

export const canTransition = (from: AiEmploymentStatus, to: AiEmploymentStatus): boolean =>
  AI_EMPLOYMENT_TRANSITIONS[from]?.includes(to) ?? false;

/** Trạng thái đang có hiệu lực (agent tồn tại trong AI Workforce). */
export const isActiveEmployment = (s: AiEmploymentStatus): boolean =>
  s === "TRIAL" || s === "HIRED";

export const AI_SENIORITY_LABELS: Record<string, string> = {
  JUNIOR: "Mới vào nghề",
  MID: "Trung cấp",
  SENIOR: "Cao cấp",
  LEAD: "Trưởng nhóm",
};

/** Giảm giá theo cam kết thời hạn: 6 tháng −5%, 12 tháng −10%, 24 tháng −15%. */
export function termDiscountRate(termMonths: number): number {
  if (termMonths >= 24) return 0.15;
  if (termMonths >= 12) return 0.1;
  if (termMonths >= 6) return 0.05;
  return 0;
}

export interface SalaryRange {
  salaryMin: number;
  salaryMax: number;
}

/** Mức lương thấp nhất chấp nhận được sau khi áp giảm giá cam kết thời hạn. */
export const minAcceptableSalary = (range: SalaryRange, termMonths: number): number =>
  Math.round(range.salaryMin * (1 - termDiscountRate(termMonths)));

export interface OfferValidation {
  ok: boolean;
  reason?: string;
  floor: number;
}

/** Kiểm tra đề nghị lương nằm trong khoảng thị trường (có tính giảm giá cam kết). */
export function validateOffer(range: SalaryRange, salary: number, termMonths: number): OfferValidation {
  const floor = minAcceptableSalary(range, termMonths);
  if (!Number.isFinite(salary) || salary <= 0) {
    return { ok: false, reason: "Mức lương không hợp lệ.", floor };
  }
  if (salary > range.salaryMax) {
    return { ok: false, reason: "Mức lương vượt trần thị trường của ứng viên.", floor };
  }
  if (salary < floor) {
    return {
      ok: false,
      reason: `Ứng viên chưa chấp nhận mức này. Tối thiểu ${floor.toLocaleString("vi-VN")} với cam kết ${termMonths} tháng.`,
      floor,
    };
  }
  return { ok: true, floor };
}

export const TRIAL_DAYS = 14;
export const INTERVIEW_MAX_TURNS = 10;

export const formatMoney = (v: number, currency = "VND"): string =>
  `${Math.round(v).toLocaleString("vi-VN")} ${currency === "VND" ? "đ" : currency}`;
