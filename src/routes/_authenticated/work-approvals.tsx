import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Check, ExternalLink, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelatedWorkPanel } from "@/components/work-graph/related-work-panel";
import { useI18n } from "@/lib/i18n";
import {
  decideWorkDeliverableReview,
  listWorkApprovals,
  type WorkApprovalRow,
} from "@/lib/api/work-deliverables.functions";

export const Route = createFileRoute("/_authenticated/work-approvals")({
  head: () => ({
    meta: [
      { title: "Phê duyệt kết quả công việc — UNIWORK" },
      {
        name: "description",
        content:
          "Phê duyệt chính thức kết quả công việc theo đúng phiên bản và xem các nguồn liên quan trên sơ đồ công việc.",
      },
      { property: "og:title", content: "Phê duyệt kết quả công việc — UNIWORK" },
      {
        property: "og:description",
        content: "Duyệt, yêu cầu chỉnh sửa hoặc huỷ yêu cầu duyệt kết quả công việc trong tổ chức.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkApprovalsPage,
});

const TYPE_LABEL: Record<string, string> = {
  PROPOSAL: "Đề xuất",
  REPORT: "Báo cáo",
  ANALYSIS: "Phân tích",
  CONTRACT: "Hợp đồng",
  PLAN: "Kế hoạch",
  PRESENTATION: "Trình chiếu",
  MEMO: "Ghi nhớ",
  DOCUMENT: "Tài liệu",
  OTHER: "Khác",
};

const PRODUCT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bản nháp",
  IN_REVIEW: "Đang chờ duyệt",
  CHANGES_REQUESTED: "Cần chỉnh sửa",
  APPROVED: "Đã phê duyệt",
  FINAL: "Chốt cuối",
  ARCHIVED: "Lưu trữ",
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã phê duyệt",
  CHANGES_REQUESTED: "Yêu cầu chỉnh sửa",
  CANCELED: "Đã huỷ",
};

function formatWhen(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "APPROVED" || status === "FINAL"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : status === "CHANGES_REQUESTED" || status === "CANCELED"
        ? "bg-destructive/10 text-destructive"
        : status === "IN_REVIEW" || status === "PENDING"
          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "bg-muted text-muted-foreground";
  return (
    <Badge className={`${tone} border-0`}>
      {REVIEW_STATUS_LABEL[status] ?? PRODUCT_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function WorkApprovalsPage() {
  const [open, setOpen] = useSidebarState();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"PENDING" | "MINE" | "DECIDED">("PENDING");
  const [selected, setSelected] = useState<WorkApprovalRow | null>(null);
  const [note, setNote] = useState("");

  const fetchApprovals = useServerFn(listWorkApprovals);
  const decideFn = useServerFn(decideWorkDeliverableReview);

  const { data, isLoading } = useQuery({
    queryKey: ["work-approvals", scope],
    queryFn: () => fetchApprovals({ data: { scope, limit: 50 } }),
  });
  const rows = data ?? [];

  const decide = useMutation({
    mutationFn: (v: {
      reviewId: string;
      decision: "APPROVED" | "CHANGES_REQUESTED" | "CANCELED";
      note?: string;
    }) => decideFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(
        v.decision === "APPROVED"
          ? "Đã phê duyệt chính thức kết quả công việc"
          : v.decision === "CHANGES_REQUESTED"
            ? "Đã yêu cầu chỉnh sửa"
            : "Đã huỷ yêu cầu duyệt",
      );
      setNote("");
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ["work-approvals"] });
    },
    onError: (e: any) =>
      toast.error(
        String(e?.message ?? "").includes("REVIEW_STALE")
          ? "Kết quả công việc đã có phiên bản mới hơn. Hãy yêu cầu duyệt lại phiên bản hiện hành."
          : "Không thực hiện được. Vui lòng thử lại.",
      ),
  });

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 md:p-8">
          <header className="space-y-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <BadgeCheck className="h-5 w-5 text-primary" aria-hidden />
              {t("nav.workApprovals")}
            </h1>
            <p className="text-sm text-muted-foreground">
              Phê duyệt gắn đúng phiên bản đang xét. Sau khi duyệt, kết quả công việc và các nguồn liên quan
              được cập nhật trên sơ đồ công việc.
            </p>
          </header>

          <Tabs value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <TabsList>
              <TabsTrigger value="PENDING" className="min-h-11">
                Chờ duyệt
              </TabsTrigger>
              <TabsTrigger value="MINE" className="min-h-11">
                Tôi phải duyệt
              </TabsTrigger>
              <TabsTrigger value="DECIDED" className="min-h-11">
                Đã xử lý
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải yêu cầu phê duyệt…</p>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Không có yêu cầu phê duyệt nào ở mục này.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <Card key={r.reviewId} className="transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="text-base">{r.productTitle}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span>{TYPE_LABEL[r.businessType] ?? r.businessType}</span>
                          {r.workspaceName ? <span>Dự án: {r.workspaceName}</span> : null}
                          <span>Người duyệt: {r.reviewerName ?? "—"}</span>
                          <span>
                            Phiên bản duyệt: v{r.version ?? 0} / hiện hành v{r.currentVersion}
                          </span>
                          <span>Gửi lúc: {formatWhen(r.createdAt)}</span>
                        </CardDescription>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge status={r.status} />
                        <StatusBadge status={r.productStatus} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {r.stale && r.status === "PENDING" ? (
                      <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                        Đã có phiên bản mới hơn phiên bản được gửi duyệt — cần gửi duyệt lại trước khi phê duyệt.
                      </p>
                    ) : null}
                    {r.note ? <p className="text-sm text-muted-foreground">{r.note}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="min-h-11"
                        disabled={r.status !== "PENDING" || r.stale || decide.isPending}
                        onClick={() => decide.mutate({ reviewId: r.reviewId, decision: "APPROVED" })}
                      >
                        <Check className="mr-1.5 h-4 w-4" aria-hidden /> Phê duyệt chính thức
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={r.status !== "PENDING" || decide.isPending}
                        onClick={() => {
                          setSelected(r);
                          setNote("");
                        }}
                      >
                        <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden /> Yêu cầu chỉnh sửa
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11"
                        disabled={r.status !== "PENDING" || decide.isPending}
                        onClick={() => decide.mutate({ reviewId: r.reviewId, decision: "CANCELED" })}
                      >
                        <X className="mr-1.5 h-4 w-4" aria-hidden /> Huỷ yêu cầu
                      </Button>
                      <Button size="sm" variant="secondary" className="min-h-11" asChild>
                        <Link to="/work-products/$id" params={{ id: r.productId }}>
                          <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden /> Mở kết quả
                        </Link>
                      </Button>
                    </div>

                    <RelatedWorkPanel
                      entityType="WORK_PRODUCT"
                      entityId={r.productId}
                      canLink={false}
                      collapsible
                      className="border-t border-border pt-3"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-left">Yêu cầu chỉnh sửa</SheetTitle>
            <SheetDescription className="text-left">
              {selected?.productTitle} — ghi rõ nội dung cần sửa để người thực hiện xử lý.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={6}
              placeholder="Nội dung cần chỉnh sửa…"
              aria-label="Nội dung cần chỉnh sửa"
            />
            <Button
              className="min-h-11 w-full"
              disabled={!note.trim() || decide.isPending}
              onClick={() =>
                selected &&
                decide.mutate({
                  reviewId: selected.reviewId,
                  decision: "CHANGES_REQUESTED",
                  note: note.trim(),
                })
              }
            >
              Gửi yêu cầu chỉnh sửa
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
