// Định tuyến lĩnh vực công việc → hồ sơ nhân sự AI.
// Dùng khi xác nhận đề xuất task: hệ thống tự chọn agent theo lĩnh vực, người dùng không phải chọn tay.
import { AI_WORKER_PROFILES } from "./profiles";

/** Từ khoá nhận diện lĩnh vực cho từng hồ sơ nhân sự AI (tiếng Việt có/không dấu + tiếng Anh). */
const PROFILE_KEYWORDS: Record<string, readonly string[]> = {
  project: ["dự án", "du an", "tiến độ", "tien do", "sprint", "milestone", "deadline", "kế hoạch", "ke hoach", "project", "release", "bàn giao", "ban giao"],
  research: ["nghiên cứu", "nghien cuu", "phân tích tài liệu", "tổng hợp", "tong hop", "khảo sát", "khao sat", "research", "benchmark", "tra cứu", "tra cuu"],
  sales: ["khách hàng", "khach hang", "báo giá", "bao gia", "hợp đồng bán", "cơ hội", "co hoi", "deal", "sales", "crm", "chốt đơn", "chot don", "lead"],
  data: ["dữ liệu", "du lieu", "báo cáo số", "bao cao so", "dashboard", "thống kê", "thong ke", "metric", "kpi", "phân tích dữ liệu", "data", "bi"],
  hr: ["nhân sự", "nhan su", "tuyển dụng", "tuyen dung", "onboarding", "nghỉ phép", "nghi phep", "hr", "đào tạo", "dao tao", "chấm công", "cham cong"],
  support: ["hỗ trợ", "ho tro", "ticket", "sự cố", "su co", "khiếu nại", "khieu nai", "support", "phản hồi khách", "phan hoi khach", "bug", "lỗi", "loi"],
  legal: ["pháp lý", "phap ly", "hợp đồng", "hop dong", "tuân thủ", "tuan thu", "điều khoản", "dieu khoan", "legal", "compliance", "nda", "rà soát", "ra soat"],
  content: ["nội dung", "noi dung", "bài viết", "bai viet", "truyền thông", "truyen thong", "marketing", "content", "bản tin", "ban tin", "seo", "social"],
};

export interface WorkDomainMatch {
  profileId: string;
  profileName: string;
  score: number;
  matched: string[];
}

const norm = (s: string) => s.toLowerCase();

/** Suy ra hồ sơ nhân sự AI phù hợp nhất với nội dung công việc. Không khớp → null. */
export function inferWorkerProfileForTask(input: {
  title?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
}): WorkDomainMatch | null {
  const text = norm([input.title ?? "", input.description ?? "", ...(input.tags ?? [])].join(" \n "));
  if (!text.trim()) return null;
  let best: WorkDomainMatch | null = null;
  for (const profile of AI_WORKER_PROFILES) {
    const keywords = PROFILE_KEYWORDS[profile.id] ?? [];
    const matched = keywords.filter((k) => text.includes(k));
    if (!matched.length) continue;
    const score = matched.reduce((acc, k) => acc + (k.includes(" ") ? 2 : 1), 0);
    if (!best || score > best.score) {
      best = { profileId: profile.id, profileName: profile.name, score, matched };
    }
  }
  return best;
}
