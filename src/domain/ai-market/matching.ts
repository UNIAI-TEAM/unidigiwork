// Ghép công việc mới với ứng viên/nhân sự AI theo hồ sơ (lĩnh vực) và kỹ năng.
// Thuần logic, không I/O — dùng chung cho server function và test.
import { AI_WORKER_PROFILES } from "@/domain/ai-workforce/profiles";
import { inferDomainForTask } from "@/domain/ai-workforce/routing";

export interface TaskLike {
  title?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
  priority?: string | null;
}

export interface CandidateLike {
  id: string;
  name: string;
  title?: string | null;
  domain: string;
  skills?: readonly string[] | null;
  rating?: number | null;
  completed_tasks?: number | null;
  salary_min?: number | null;
  employmentStatus?: string | null;
}

export interface CandidateSuggestion<T extends CandidateLike = CandidateLike> {
  candidate: T;
  score: number;
  reasons: string[];
  matchedSkills: string[];
}

/** Kỹ năng cần thiết suy ra từ hồ sơ nhân sự AI của lĩnh vực. */
export function requiredSkillsForDomain(domain: string): readonly string[] {
  return AI_WORKER_PROFILES.find((p) => p.domain === domain)?.skills ?? [];
}

const EMPLOYMENT_BONUS: Record<string, number> = {
  HIRED: 30,
  TRIAL: 20,
  OFFER: 8,
  INTERVIEW: 4,
};

/** Xếp hạng ứng viên cho một công việc mới. Trả về danh sách đã sắp xếp giảm dần. */
export function suggestCandidates<T extends CandidateLike>(
  task: TaskLike,
  candidates: readonly T[],
  limit = 3,
): { domain: string | null; matchedKeywords: string[]; suggestions: CandidateSuggestion<T>[] } {
  const inferred = inferDomainForTask(task);
  const domain = inferred?.domain ?? null;
  const required = domain ? requiredSkillsForDomain(domain) : [];

  const scored = candidates.map((c) => {
    const reasons: string[] = [];
    let score = 0;

    if (domain && c.domain === domain) {
      score += 50;
      reasons.push(`Đúng lĩnh vực ${domain}`);
    }

    const skills = c.skills ?? [];
    const matchedSkills = required.filter((s) => skills.includes(s));
    if (matchedSkills.length) {
      score += matchedSkills.length * 8;
      reasons.push(`Khớp ${matchedSkills.length} kỹ năng cần thiết`);
    }

    const rating = Number(c.rating ?? 0);
    score += rating * 4;
    if (rating >= 4.5) reasons.push(`Đánh giá ${rating.toFixed(1)}/5`);

    const done = Number(c.completed_tasks ?? 0);
    score += Math.min(done / 200, 10);
    if (done >= 1000) reasons.push(`${done.toLocaleString("vi-VN")} việc đã hoàn thành`);

    const bonus = EMPLOYMENT_BONUS[c.employmentStatus ?? ""] ?? 0;
    if (bonus) {
      score += bonus;
      reasons.push(c.employmentStatus === "HIRED" ? "Đã là nhân sự của công ty" : "Đang trong quy trình tuyển dụng");
    }

    if (task.priority === "urgent" && rating >= 4.5) score += 5;

    return { candidate: c, score: Math.round(score * 10) / 10, reasons, matchedSkills };
  });

  return {
    domain,
    matchedKeywords: inferred?.matched ?? [],
    suggestions: scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.candidate.rating ?? 0) - Number(a.candidate.rating ?? 0))
      .slice(0, limit),
  };
}
