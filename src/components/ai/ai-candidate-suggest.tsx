// Gợi ý nhân sự/ứng viên AI phù hợp cho một công việc (theo hồ sơ + kỹ năng).
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles, Star, Loader2 } from "lucide-react";
import { suggestCandidatesForTask } from "@/lib/api/ai-market.functions";
import { AI_SKILL_MAP } from "@/domain/workflow-agents/skills";

const STATUS_LABEL: Record<string, string> = {
  HIRED: "Nhân sự công ty",
  TRIAL: "Đang thử việc",
  OFFER: "Đã gửi đề nghị",
  INTERVIEW: "Đang phỏng vấn",
};

const money = (v: number | null | undefined) =>
  v == null ? "—" : `${Number(v).toLocaleString("vi-VN")} đ`;

export function AiCandidateSuggest({ taskId, className = "" }: { taskId: string; className?: string }) {
  const q = useQuery({
    queryKey: ["task-ai-candidates", taskId],
    queryFn: () => suggestCandidatesForTask({ data: { taskId, limit: 3 } }),
    staleTime: 60_000,
  });

  return (
    <div className={`rounded-xl border border-border bg-surface p-4 ${className}`}>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Ứng viên AI phù hợp</h3>
      </div>

      {q.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang phân tích công việc…
        </p>
      ) : q.isError ? (
        <p className="text-xs text-muted-foreground">Chưa thể gợi ý lúc này.</p>
      ) : !q.data?.suggestions.length ? (
        <p className="text-xs text-muted-foreground">
          Chưa nhận diện được lĩnh vực của công việc. Hãy bổ sung mô tả hoặc nhãn để hệ thống gợi ý chính xác hơn.
        </p>
      ) : (
        <>
          {q.data.domain ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Lĩnh vực nhận diện: <span className="font-medium text-foreground">{q.data.domain}</span>
            </p>
          ) : null}
          <ul className="space-y-2">
            {q.data.suggestions.map((s) => (
              <li key={s.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.title || s.domain}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]">
                    <Star className="h-3 w-3 text-warning" />
                    {Number(s.rating ?? 0).toFixed(1)}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.employmentStatus ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {STATUS_LABEL[s.employmentStatus] ?? s.employmentStatus}
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Từ {money(s.salaryMin)}
                    </span>
                  )}
                  {s.matchedSkills.slice(0, 3).map((sk) => (
                    <span key={sk} className="rounded-full border border-border px-2 py-0.5 text-[11px]">
                      {AI_SKILL_MAP[sk]?.name ?? sk}
                    </span>
                  ))}
                </div>

                {s.reasons.length ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{s.reasons.join(" · ")}</p>
                ) : null}

                <Link
                  to="/ai-market/$id"
                  params={{ id: s.id }}
                  className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
                >
                  {s.employmentStatus === "HIRED" ? "Xem hồ sơ nhân sự" : "Xem hồ sơ & tuyển dụng"}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
