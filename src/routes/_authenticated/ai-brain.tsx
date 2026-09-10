// AI BRAIN — trung tâm điều hành AI: đề xuất chờ duyệt, đội ngũ AI, nhật ký.
// Chỉ đọc + dùng lại lớp hành động AI hiện có; AI không bao giờ tự thực thi.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Check, Loader2, Shield, Sparkles, X } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { useI18n } from "@/lib/i18n";
import { AI_WORKER_PROFILES } from "@/domain/ai-workforce/profiles";
import { getAiBrainOverview } from "@/lib/api/ai-brain.functions";
import {
  cancelAiAction,
  confirmAiAction,
  listAiActionProposals,
} from "@/lib/api/ai-actions.functions";

export const Route = createFileRoute("/_authenticated/ai-brain")({
  head: () => ({
    meta: [
      { title: "Bộ não AI — UNIWORK" },
      {
        name: "description",
        content:
          "Trung tâm điều hành AI của UNIWORK: xem đề xuất chờ duyệt, đội ngũ AI và nhật ký hoạt động.",
      },
      { property: "og:title", content: "Bộ não AI — UNIWORK" },
      {
        property: "og:description",
        content:
          "Trung tâm điều hành AI của UNIWORK: xem đề xuất chờ duyệt, đội ngũ AI và nhật ký hoạt động.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiBrainPage,
});

const PENDING_STATUSES = new Set(["PROPOSED", "PREVIEWED"]);

const STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Chờ duyệt",
  PREVIEWED: "Chờ duyệt",
  EXECUTING: "Đang thực hiện",
  SUCCEEDED: "Đã duyệt",
  FAILED: "Thất bại",
  CANCELLED: "Đã bỏ qua",
  EXPIRED: "Hết hạn",
};

const RISK_LABEL: Record<string, string> = {
  LOW: "Rủi ro thấp",
  MEDIUM: "Rủi ro trung bình",
  HIGH: "Rủi ro cao",
};

/** Ví dụ minh họa khi tổ chức chưa có đề xuất nào — không phải dữ liệu thật. */
const SAMPLE_PROPOSALS = [
  {
    title: "Từ biên bản họp → công việc",
    body: 'Cuộc họp "Kickoff dự án Alpha" nêu 4 việc cần làm. Đề xuất tạo 4 công việc, giao cho Minh và Lan, hạn 15/09.',
    outcome: "Duyệt → tạo công việc thật, tự gắn liên kết về cuộc họp gốc.",
  },
  {
    title: "Từ tài liệu Word vừa nhập → cập nhật kết quả công việc",
    body: "Hợp đồng ABC v3 khác v2 ở 6 đoạn (giá, thời hạn thanh toán). Đề xuất tạo phiên bản mới và gửi duyệt cho Trưởng phòng.",
    outcome: "Duyệt → tạo phiên bản mới, giữ nguyên bản gốc, ghi lại ai duyệt.",
  },
  {
    title: "Từ công việc quá hạn → nhắc và đề xuất xử lý",
    body: "3 công việc quá hạn hơn 5 ngày trong dự án Beta. Đề xuất gia hạn 1 tuần và thông báo người phụ trách.",
    outcome: "Duyệt → cập nhật hạn và gửi thông báo trong ứng dụng.",
  },
];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function AiBrainPage() {
  const { t } = useI18n();
  const [open, setOpen] = useSidebarState();
  const { workspaceId } = useActiveWorkspace();
  const qc = useQueryClient();

  const overviewFn = useServerFn(getAiBrainOverview);
  const listFn = useServerFn(listAiActionProposals);
  const confirmFn = useServerFn(confirmAiAction);
  const cancelFn = useServerFn(cancelAiAction);

  const overview = useQuery({
    queryKey: ["ai-brain", "overview", workspaceId],
    queryFn: () => overviewFn({ data: { workspaceId: workspaceId as string } }),
    enabled: !!workspaceId,
  });

  const proposals = useQuery({
    queryKey: ["ai-brain", "proposals"],
    queryFn: () => listFn({ data: { limit: 20 } }),
  });

  const pending = useMemo(
    () => (proposals.data ?? []).filter((p) => PENDING_STATUSES.has(p.status as string)),
    [proposals.data],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["ai-brain"] });
  };

  const approve = useMutation({
    mutationFn: (actionId: string) => confirmFn({ data: { actionId } }),
    onSuccess: () => {
      toast.success("Đã duyệt và thực hiện đề xuất.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không thể duyệt đề xuất."),
  });

  const dismiss = useMutation({
    mutationFn: (actionId: string) => cancelFn({ data: { actionId } }),
    onSuccess: () => {
      toast.success("Đã bỏ qua đề xuất.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không thể bỏ qua đề xuất."),
  });

  const m = overview.data?.metrics;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ai-brain" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{t("nav.aiBrain")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("aiBrain.subtitle")}</p>
            </div>
            <Link
              to="/ai-brain/skills"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              <Sparkles className="h-4 w-4" /> {t("aiBrain.manageSkills")}
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric label={t("aiBrain.metric.pending")} value={String(m?.pending ?? 0)} />
            <Metric label={t("aiBrain.metric.approved")} value={String(m?.approvedThisWeek ?? 0)} />
            <Metric label={t("aiBrain.metric.rejected")} value={String(m?.rejectedThisWeek ?? 0)} />
            <Metric
              label={t("aiBrain.metric.acceptance")}
              value={`${m?.acceptanceRate ?? 0}%`}
            />
            <Metric
              label={t("aiBrain.metric.tokens")}
              value={(m?.tokensThisWeek ?? 0).toLocaleString("vi-VN")}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {/* Đề xuất đang chờ duyệt */}
            <section className="lg:col-span-2">
              <h2 className="text-sm font-semibold">{t("aiBrain.proposals")}</h2>
              <div className="mt-3 space-y-3">
                {proposals.isLoading && (
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
                  </div>
                )}

                {!proposals.isLoading &&
                  pending.map((p) => (
                    <article key={p.id} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{p.action_type as string}</Badge>
                        <Badge variant="outline">
                          {STATUS_LABEL[p.status as string] ?? (p.status as string)}
                        </Badge>
                      </div>
                      <h3 className="mt-2 text-sm font-medium">{p.title as string}</h3>
                      {p.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {p.description as string}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          className="min-h-11"
                          onClick={() => approve.mutate(p.id as string)}
                          disabled={approve.isPending || dismiss.isPending}
                        >
                          <Check className="mr-1.5 h-4 w-4" /> {t("aiBrain.approve")}
                        </Button>
                        <Button
                          variant="outline"
                          className="min-h-11"
                          onClick={() => dismiss.mutate(p.id as string)}
                          disabled={approve.isPending || dismiss.isPending}
                        >
                          <X className="mr-1.5 h-4 w-4" /> {t("aiBrain.dismiss")}
                        </Button>
                      </div>
                    </article>
                  ))}

                {!proposals.isLoading && pending.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-card p-4">
                    <p className="text-sm font-medium">{t("aiBrain.empty.title")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("aiBrain.empty.desc")}
                    </p>
                    <ul className="mt-3 space-y-3">
                      {SAMPLE_PROPOSALS.map((s) => (
                        <li key={s.title} className="rounded-lg bg-muted/40 p-3">
                          <p className="text-sm font-medium">{s.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{s.outcome}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>

            {/* Đội ngũ AI */}
            <section>
              <h2 className="text-sm font-semibold">{t("aiBrain.team")}</h2>
              <div className="mt-3 space-y-2">
                {AI_WORKER_PROFILES.map((w) => (
                  <Link
                    key={w.id}
                    to="/ai-workforce"
                    className="flex min-h-11 items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent"
                  >
                    <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{w.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{w.domain}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {w.skills.length} kỹ năng
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          {/* Nhật ký */}
          <section className="mt-6">
            <h2 className="text-sm font-semibold">{t("aiBrain.log")}</h2>
            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
              {(overview.data?.log ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{t("aiBrain.log.empty")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {(overview.data?.log ?? []).map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                      <Badge variant="outline">{STATUS_LABEL[e.status] ?? e.status}</Badge>
                      <Badge variant="secondary">{RISK_LABEL[e.risk] ?? e.risk}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString("vi-VN")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("aiBrain.guarantee")}
          </p>
        </div>
      </main>
    </div>
  );
}
