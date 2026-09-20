import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { listDecisionRevisions, type DecisionRevisionRow } from "@/lib/api/decisions.functions";

export const Route = createFileRoute("/_authenticated/decision-history")({
  head: () => ({
    meta: [
      { title: "Lịch sử quyết định — UNIWORK" },
      {
        name: "description",
        content: "Xem từng phiên bản của quyết định theo tổ chức: thay đổi gì, ai đổi, lúc nào, so với bản hiện tại.",
      },
      { property: "og:title", content: "Lịch sử quyết định — UNIWORK" },
      {
        property: "og:description",
        content: "Nhật ký phiên bản quyết định, chỉ đọc, ghi lại mọi thay đổi trạng thái và nội dung.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DecisionHistoryPage,
});

const STATUS_LABEL: Record<string, string> = {
  CANDIDATE: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Đã từ chối",
  SUPERSEDED: "Đã thay thế",
};

const FIELD_LABEL: Record<string, string> = {
  title: "Tiêu đề",
  detail: "Nội dung",
  status: "Trạng thái",
  workspace_id: "Dự án",
  decided_at: "Thời điểm chốt",
  confirmed_at: "Thời điểm xác nhận",
  confirmed_by: "Người xác nhận",
  superseded_by: "Quyết định thay thế",
  evidence: "Bằng chứng",
};

function formatWhen(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function statusTone(status: string) {
  return status === "CONFIRMED"
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : status === "REJECTED"
      ? "bg-destructive/10 text-destructive"
      : status === "SUPERSEDED"
        ? "bg-muted text-muted-foreground"
        : "bg-amber-500/10 text-amber-600 dark:text-amber-400";
}

function RevisionItem({ rev, current }: { rev: DecisionRevisionRow; current: DecisionRevisionRow | undefined }) {
  const snapshotStatus = (rev.snapshot["status"] as string | null) ?? rev.currentStatus;
  const diffs = useMemo(() => {
    if (!current || current.id === rev.id) return [];
    return Object.keys(FIELD_LABEL).filter((k) => {
      const key = k === "workspace_id" ? "workspaceId" : k === "decided_at" ? "decidedAt" : k === "confirmed_at" ? "confirmedAt" : k === "confirmed_by" ? "confirmedBy" : k === "superseded_by" ? "supersededBy" : k;
      return (rev.snapshot[key] ?? null) !== (current.snapshot[key] ?? null);
    });
  }, [rev, current]);

  return (
    <li className="relative pl-6">
      <span
        className={`absolute left-0 top-2 h-2.5 w-2.5 rounded-full ${rev.isCurrent ? "bg-primary" : "bg-border"}`}
        aria-hidden
      />
      <div className="space-y-1.5 rounded-lg border border-border/60 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Phiên bản {rev.rowVersion}</span>
          {rev.isCurrent ? <Badge className="border-0 bg-primary/10 text-primary">Hiện tại</Badge> : null}
          <Badge className={`border-0 ${statusTone(snapshotStatus)}`}>{STATUS_LABEL[snapshotStatus] ?? snapshotStatus}</Badge>
          <span>{formatWhen(rev.changedAt)}</span>
          {rev.changedByName ? <span>· {rev.changedByName}</span> : null}
        </div>
        <p className="text-sm">
          {rev.changeKind === "CREATED"
            ? "Tạo quyết định"
            : `Thay đổi: ${rev.changedFields.map((f) => FIELD_LABEL[f] ?? f).join(", ") || "—"}`}
        </p>
        {rev.snapshot["title"] ? <p className="text-sm font-medium">{rev.snapshot["title"]}</p> : null}
        {rev.snapshot["detail"] ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">{rev.snapshot["detail"]}</p>
        ) : null}
        {diffs.length ? (
          <p className="text-xs text-muted-foreground">
            Khác bản hiện tại ở: {diffs.map((f) => FIELD_LABEL[f] ?? f).join(", ")}
          </p>
        ) : rev.isCurrent ? null : (
          <p className="text-xs text-muted-foreground">Không khác bản hiện tại.</p>
        )}
      </div>
    </li>
  );
}

function DecisionHistoryPage() {
  const [open, setOpen] = useSidebarState();
  const { t } = useI18n();
  const [q, setQ] = useState("");

  const fetchRevisions = useServerFn(listDecisionRevisions);
  const { data, isLoading } = useQuery({
    queryKey: ["decision-revisions"],
    queryFn: () => fetchRevisions({ data: { limit: 300 } }),
  });

  const groups = useMemo(() => {
    const rows = (data ?? []).filter((r) =>
      q.trim() ? r.decisionTitle.toLowerCase().includes(q.trim().toLowerCase()) : true,
    );
    const map = new Map<string, DecisionRevisionRow[]>();
    for (const r of rows) {
      const arr = map.get(r.decisionId) ?? [];
      arr.push(r);
      map.set(r.decisionId, arr);
    }
    return [...map.values()].map((revs) => {
      const sorted = [...revs].sort((a, b) => b.rowVersion - a.rowVersion);
      return { head: sorted[0]!, current: sorted.find((r) => r.isCurrent), revisions: sorted };
    });
  }, [data, q]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 md:p-8">
          <header className="space-y-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <History className="h-5 w-5 text-primary" aria-hidden />
              {t("nav.decisionHistory")}
            </h1>
            <p className="text-sm text-muted-foreground">
              Mỗi lần quyết định thay đổi, hệ thống ghi lại một phiên bản kèm thời điểm và người thực hiện. Trang này
              chỉ đọc.
            </p>
          </header>

          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tiêu đề quyết định…"
            className="min-h-11 max-w-md"
          />

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải lịch sử…</p>
          ) : groups.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Chưa có thay đổi quyết định nào được ghi lại.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <Card key={g.head.decisionId}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="text-base">{g.head.decisionTitle}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span>{g.revisions.length} phiên bản</span>
                          <span>Thay đổi gần nhất: {formatWhen(g.head.changedAt)}</span>
                        </CardDescription>
                      </div>
                      <Badge className={`border-0 ${statusTone(g.head.currentStatus)}`}>
                        {STATUS_LABEL[g.head.currentStatus] ?? g.head.currentStatus}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ol className="space-y-3 border-l border-border/60 pl-2">
                      {g.revisions.map((rev) => (
                        <RevisionItem key={rev.id} rev={rev} current={g.current} />
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
