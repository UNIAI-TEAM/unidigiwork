// Hồ sơ ứng viên AI trên chợ tuyển dụng — dùng chung cho desktop và mobile.
// Luồng: phỏng vấn (case chuẩn + chat) → đàm phán lương → thử việc → chính thức.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bot, Briefcase, CheckCircle2, Clock, Handshake, Loader2, MessageSquare,
  Send, ShieldCheck, Star, TrendingUp, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  getMarketAgent, startInterview, sendInterviewMessage, runInterviewCase,
  submitOffer, startTrial, convertToFullTime, endEmployment, listEmploymentEvents,
} from "@/lib/api/ai-market.functions";
import {
  AI_EMPLOYMENT_STATUS_LABELS, AI_SENIORITY_LABELS, TRIAL_DAYS,
  formatMoney, minAcceptableSalary, termDiscountRate,
  type AiEmploymentStatus,
} from "@/domain/ai-market/contracts";
import { AI_SKILL_KIND_LABELS, AI_SKILL_MAP } from "@/domain/workflow-agents/skills";

const TERMS = [0, 6, 12, 24];

export function AiMarketProfile({
  workspaceId,
  marketAgentId,
}: {
  workspaceId: string;
  marketAgentId: string;
}) {
  const qc = useQueryClient();
  const key = ["ai-market-agent", workspaceId, marketAgentId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => getMarketAgent({ data: { workspaceId, marketAgentId } }),
    enabled: !!workspaceId && !!marketAgentId,
  });

  const startInterviewFn = useServerFn(startInterview);
  const sendMessageFn = useServerFn(sendInterviewMessage);
  const runCaseFn = useServerFn(runInterviewCase);
  const submitOfferFn = useServerFn(submitOffer);
  const startTrialFn = useServerFn(startTrial);
  const hireFn = useServerFn(convertToFullTime);
  const endFn = useServerFn(endEmployment);

  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; content: string; score?: number | null }>>([]);
  const [turns, setTurns] = useState({ used: 0, max: 10 });
  const [input, setInput] = useState("");
  const [salary, setSalary] = useState<string>("");
  const [term, setTerm] = useState<number>(0);
  const [terms, setTerms] = useState("");

  const agent = data?.agent;
  const employment = data?.employment as any | null;
  const status = (employment?.status ?? null) as AiEmploymentStatus | null;

  // Điền sẵn mức lương đề nghị theo hợp đồng hiện tại hoặc mức sàn của ứng viên,
  // để nút "Gửi đề nghị" không bị khoá khi vừa mở hồ sơ.
  useEffect(() => {
    if (!agent) return;
    setSalary((prev) => {
      if (prev) return prev;
      const current = Number(employment?.salary_amount ?? 0);
      return String(current > 0 ? current : Number(agent.salary_min));
    });
    setTerm((prev) => (prev ? prev : Number(employment?.term_months ?? 0)));
  }, [agent, employment?.id, employment?.salary_amount, employment?.term_months]);

  const { data: events } = useQuery({
    queryKey: ["ai-employment-events", employment?.id],
    queryFn: () => listEmploymentEvents({ data: { workspaceId, employmentId: employment.id } }),
    enabled: !!employment?.id,
  });

  const floor = useMemo(
    () =>
      agent
        ? minAcceptableSalary({ salaryMin: Number(agent.salary_min), salaryMax: Number(agent.salary_max) }, term)
        : 0,
    [agent, term],
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["ai-market"] });
    void qc.invalidateQueries({ queryKey: ["ai-employments"] });
    void qc.invalidateQueries({ queryKey: ["ai-employment-events"] });
  };

  const beginInterview = useMutation({
    mutationFn: () => startInterviewFn({ data: { workspaceId, marketAgentId } }),
    onSuccess: (res: any) => {
      setInterviewId(res.interview.id);
      setTurns({ used: res.interview.turns_used, max: res.interview.max_turns });
      setMessages((res.messages ?? []).map((m: any) => ({ role: m.role, content: m.content, score: m.score })));
      refresh();
      toast.success("Đã mở phiên phỏng vấn với ứng viên.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Không mở được phiên phỏng vấn."),
  });

  const ask = useMutation({
    mutationFn: (message: string) => sendMessageFn({ data: { workspaceId, interviewId: interviewId!, message } }),
    onMutate: (message: string) => {
      setMessages((m) => [...m, { role: "user", content: message }]);
      setInput("");
    },
    onSuccess: (res: any) => {
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
      setTurns({ used: res.turnsUsed, max: res.maxTurns });
    },
    onError: (e: any) => toast.error(e?.message ?? "Ứng viên chưa phản hồi được."),
  });

  const runCase = useMutation({
    mutationFn: (caseId: string) => runCaseFn({ data: { workspaceId, interviewId: interviewId!, caseId } }),
    onSuccess: (res: any) => {
      setMessages((m) => [...m, { role: "case", content: res.answer, score: res.score }]);
      toast.success(`Điểm câu hỏi tình huống: ${res.score}/${res.maxScore}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Không chấm được câu hỏi tình huống."),
  });

  const offer = useMutation({
    mutationFn: () =>
      submitOfferFn({
        data: { workspaceId, employmentId: employment.id, salary: Number(salary), termMonths: term, terms },
      }),
    onSuccess: () => {
      refresh();
      toast.success("Ứng viên đã chấp nhận mức đề nghị.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Đề nghị chưa được chấp nhận."),
  });

  const trial = useMutation({
    mutationFn: () => startTrialFn({ data: { workspaceId, employmentId: employment.id, note: "" } }),
    onSuccess: () => {
      refresh();
      toast.success(`Bắt đầu thử việc ${TRIAL_DAYS} ngày.`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Không bắt đầu được thử việc."),
  });

  const hire = useMutation({
    mutationFn: () => hireFn({ data: { workspaceId, employmentId: employment.id, note: "" } }),
    onSuccess: () => {
      refresh();
      toast.success("Đã tuyển chính thức nhân sự AI.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Không chuyển chính thức được."),
  });

  const finish = useMutation({
    mutationFn: (to: "REJECTED" | "TERMINATED") =>
      endFn({ data: { workspaceId, employmentId: employment.id, note: "", to } }),
    onSuccess: () => {
      refresh();
      toast.success("Đã cập nhật trạng thái hợp đồng.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Không cập nhật được hợp đồng."),
  });

  if (isLoading || !agent) {
    return <p className="p-6 text-sm text-muted-foreground">Đang tải hồ sơ ứng viên…</p>;
  }

  const skills = (agent.skills ?? []).map((s: string) => AI_SKILL_MAP[s]).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Bot className="h-8 w-8" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{agent.name}</h2>
            <p className="text-sm text-muted-foreground">{agent.title} · {agent.domain}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="secondary">{AI_SENIORITY_LABELS[agent.seniority] ?? agent.seniority}</Badge>
              <Badge variant="outline" className="gap-1">
                <Star className="h-3 w-3 fill-warning text-warning" /> {Number(agent.rating).toFixed(1)}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> {agent.completed_tasks.toLocaleString("vi-VN")} việc đã hoàn thành
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Briefcase className="h-3 w-3" /> {agent.hires_count} công ty đã thuê
              </Badge>
              {status && (
                <Badge className="bg-primary/15 text-primary">{AI_EMPLOYMENT_STATUS_LABELS[status]}</Badge>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lương tháng</p>
            <p className="text-base font-semibold">
              {formatMoney(Number(agent.salary_min), agent.currency)} – {formatMoney(Number(agent.salary_max), agent.currency)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              + {formatMoney(Number(agent.fee_per_action), agent.currency)} / hành động được duyệt
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{agent.bio}</p>
        <p className="mt-1 text-sm text-muted-foreground">{agent.mission}</p>
      </section>

      {/* Kỹ năng + kinh nghiệm */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Kỹ năng AI</h3>
          <ul className="space-y-2">
            {skills.map((s: any) => (
              <li key={s.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{s.name}</span>
                  <Badge variant="outline" className="text-[11px]">{AI_SKILL_KIND_LABELS[s.kind as keyof typeof AI_SKILL_KIND_LABELS]}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Công ty đã làm việc
          </h3>
          <ul className="space-y-2">
            {(data?.experiences ?? []).map((e: any) => (
              <li key={e.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{e.company_label}</span>
                  <Badge variant="outline">{e.industry}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{e.summary}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {e.duration_months} tháng · {e.completed_tasks.toLocaleString("vi-VN")} việc hoàn thành
                </p>
              </li>
            ))}
          </ul>
          {data?.tenantStats && data.tenantStats.proposals > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Tại công ty bạn: {data.tenantStats.proposals} đề xuất ·{" "}
              {data.tenantStats.approved} được duyệt
            </p>
          )}
        </section>
      </div>

      {/* Phỏng vấn */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <MessageSquare className="h-4 w-4 text-primary" /> Phỏng vấn ứng viên
          </h3>
          {interviewId ? (
            <span className="text-xs text-muted-foreground">Đã dùng {turns.used}/{turns.max} lượt</span>
          ) : (
            <Button size="sm" onClick={() => beginInterview.mutate()} disabled={beginInterview.isPending}>
              {beginInterview.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : employment ? (
                "Tiếp tục phỏng vấn"
              ) : (
                "Bắt đầu phỏng vấn"
              )}
            </Button>
          )}
        </div>

        {interviewId && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Câu hỏi tình huống chuẩn
              </p>
              <ul className="space-y-2">
                {(data?.cases ?? []).map((c: any) => (
                  <li key={c.id} className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">{c.prompt}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => runCase.mutate(c.id)}
                      disabled={runCase.isPending}
                    >
                      {runCase.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Hỏi & chấm điểm (${c.max_score}đ)`}
                    </Button>
                  </li>
                ))}
                {(data?.cases ?? []).length === 0 && (
                  <li className="text-xs text-muted-foreground">Chưa có bộ câu hỏi chuẩn cho lĩnh vực này.</li>
                )}
              </ul>
            </div>

            <div className="flex min-h-64 flex-col rounded-lg border border-border">
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {messages.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Hãy hỏi ứng viên về cách làm việc, kinh nghiệm hoặc chạy câu hỏi tình huống bên trái.
                  </p>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "max-w-[90%] rounded-xl bg-surface-2 px-3 py-2 text-sm"
                    }
                  >
                    {m.role === "case" && (
                      <p className="mb-1 text-[11px] font-medium text-primary">
                        Câu hỏi tình huống · {m.score}đ
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
                {ask.isPending && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ứng viên đang trả lời…
                  </p>
                )}
              </div>
              <div className="flex items-end gap-2 border-t border-border p-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Đặt câu hỏi cho ứng viên…"
                  rows={2}
                  className="min-h-11 resize-none"
                />
                <Button
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={() => input.trim() && ask.mutate(input.trim())}
                  disabled={ask.isPending || !input.trim() || turns.used >= turns.max}
                  aria-label="Gửi câu hỏi"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Đàm phán & tuyển dụng */}
      {employment && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Handshake className="h-4 w-4 text-primary" /> Đàm phán & tuyển dụng
          </h3>

          {(status === "INTERVIEW" || status === "OFFER") && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="salary">Mức lương đề nghị (tháng)</Label>
                <Input
                  id="salary"
                  inputMode="numeric"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value.replace(/\D/g, ""))}
                  placeholder={String(agent.salary_min)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tối thiểu chấp nhận: {formatMoney(floor, agent.currency)}
                  {term > 0 && ` (đã giảm ${Math.round(termDiscountRate(term) * 100)}% do cam kết)`}
                </p>
              </div>
              <div>
                <Label>Cam kết thời hạn</Label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {TERMS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTerm(t)}
                      className={
                        t === term
                          ? "rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
                          : "rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-surface-2"
                      }
                    >
                      {t === 0 ? "Không cam kết" : `${t} tháng`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="terms">Điều khoản kèm theo</Label>
                <Textarea
                  id="terms"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={2}
                  placeholder="Ví dụ: chỉ hoạt động trong giờ hành chính…"
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {(status === "INTERVIEW" || status === "OFFER") && (
              <Button onClick={() => offer.mutate()} disabled={offer.isPending || !salary}>
                {offer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gửi đề nghị"}
              </Button>
            )}
            {status === "OFFER" && (
              <>
                <Button variant="outline" onClick={() => trial.mutate()} disabled={trial.isPending}>
                  <Clock className="mr-1.5 h-4 w-4" /> Cho thử việc {TRIAL_DAYS} ngày
                </Button>
                <Button variant="outline" onClick={() => hire.mutate()} disabled={hire.isPending}>
                  <ShieldCheck className="mr-1.5 h-4 w-4" /> Tuyển chính thức
                </Button>
              </>
            )}
            {status === "TRIAL" && (
              <Button onClick={() => hire.mutate()} disabled={hire.isPending}>
                <ShieldCheck className="mr-1.5 h-4 w-4" /> Chuyển thành chính thức
              </Button>
            )}
            {status && status !== "REJECTED" && status !== "TERMINATED" && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => finish.mutate(status === "INTERVIEW" ? "REJECTED" : "TERMINATED")}
                disabled={finish.isPending}
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                {status === "INTERVIEW" ? "Từ chối ứng viên" : "Kết thúc hợp đồng"}
              </Button>
            )}
          </div>

          {status === "TRIAL" && employment.trial_ends_at && (
            <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Đang thử việc đến {new Date(employment.trial_ends_at).toLocaleDateString("vi-VN")}. Trong thời gian
              này mọi hành động của nhân sự AI đều ở dạng đề xuất và cần bạn xác nhận.
            </p>
          )}
          {status === "HIRED" && (
            <p className="mt-3 rounded-lg bg-success/10 p-3 text-xs text-success">
              Đã là nhân sự chính thức · Lương {formatMoney(Number(employment.salary_amount), employment.currency)}/tháng
              + {formatMoney(Number(employment.fee_per_action), employment.currency)} mỗi hành động được duyệt.
            </p>
          )}

          {(events ?? []).length > 0 && (
            <>
              <Separator className="my-4" />
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Lịch sử đàm phán
              </p>
              <ul className="space-y-1.5">
                {(events ?? []).map((e: any) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-foreground">
                      {AI_EMPLOYMENT_STATUS_LABELS[e.to_status as AiEmploymentStatus] ?? e.to_status}
                    </span>
                    {e.salary_amount ? <span>· {formatMoney(Number(e.salary_amount), agent.currency)}</span> : null}
                    <span>· {new Date(e.created_at).toLocaleString("vi-VN")}</span>
                    {e.note && <span>· {e.note}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
