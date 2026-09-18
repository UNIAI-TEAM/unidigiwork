import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Gavel, Link2, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import {
  createDecision,
  listDecisionLinks,
  listDecisions,
  linkDecisionToTask,
  searchTasksForDecision,
  setDecisionConfirmation,
  setDecisionLinkConfirmation,
  supersedeDecision,
  type DecisionRow,
} from "@/lib/api/decisions.functions";

export const Route = createFileRoute("/_authenticated/decisions")({
  head: () => ({
    meta: [
      { title: "Duyệt quyết định — UNIWORK" },
      {
        name: "description",
        content: "Xác nhận, từ chối hoặc thay thế quyết định và nối quyết định với việc cần làm trên sơ đồ công việc.",
      },
      { property: "og:title", content: "Duyệt quyết định — UNIWORK" },
      {
        property: "og:description",
        content: "Chỉ quyết định và liên kết đã được người dùng xác nhận mới xuất hiện trên sơ đồ công việc.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DecisionsPage,
});

const STATUS_LABEL: Record<string, string> = {
  CANDIDATE: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Đã từ chối",
  SUPERSEDED: "Đã thay thế",
};

const ORIGIN_LABEL: Record<string, string> = {
  MEETING: "Cuộc họp",
  TASK: "Công việc",
  CHAT: "Trò chuyện",
  EMAIL: "Email",
  APPROVAL: "Phê duyệt",
  MANUAL: "Nhập tay",
};

const SOURCE_LABEL: Record<string, string> = {
  MEETING_ARTIFACT: "Kết quả cuộc họp",
  TASK: "Việc cần làm",
  WORK_PRODUCT: "Kết quả công việc",
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "CONFIRMED"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : status === "REJECTED"
        ? "bg-destructive/10 text-destructive"
        : status === "SUPERSEDED"
          ? "bg-muted text-muted-foreground"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return <Badge className={`${tone} border-0`}>{STATUS_LABEL[status] ?? status}</Badge>;
}

function formatWhen(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function DecisionsPage() {
  const [open, setOpen] = useSidebarState();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"CANDIDATE" | "CONFIRMED" | "ALL">("CANDIDATE");
  const [selected, setSelected] = useState<DecisionRow | null>(null);

  const fetchDecisions = useServerFn(listDecisions);
  const { data, isLoading } = useQuery({
    queryKey: ["decisions", status],
    queryFn: () => fetchDecisions({ data: { status, limit: 100 } }),
  });
  const rows = useMemo(() => data ?? [], [data]);

  const confirmFn = useServerFn(setDecisionConfirmation);
  const supersedeFn = useServerFn(supersedeDecision);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["decisions"] });
    void qc.invalidateQueries({ queryKey: ["decision-links"] });
  };

  const confirmMut = useMutation({
    mutationFn: (v: { decisionId: string; confirm: boolean }) => confirmFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.confirm ? "Đã xác nhận quyết định" : "Đã từ chối quyết định");
      invalidate();
      setSelected((s) => (s ? { ...s, status: v.confirm ? "CONFIRMED" : "REJECTED" } : s));
    },
    onError: () => toast.error("Không thực hiện được. Vui lòng thử lại."),
  });

  const supersedeMut = useMutation({
    mutationFn: (decisionId: string) => supersedeFn({ data: { decisionId } }),
    onSuccess: () => {
      toast.success("Đã đánh dấu quyết định bị thay thế");
      invalidate();
      setSelected((s) => (s ? { ...s, status: "SUPERSEDED" } : s));
    },
    onError: () => toast.error("Không thực hiện được. Vui lòng thử lại."),
  });

  const createFn = useServerFn(createDecision);
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const createMut = useMutation({
    mutationFn: () => createFn({ data: { title: newTitle.trim(), detail: newDetail.trim() || null } }),
    onSuccess: () => {
      toast.success("Đã thêm quyết định vào danh sách chờ xác nhận");
      setNewTitle("");
      setNewDetail("");
      setStatus("CANDIDATE");
      invalidate();
    },
    onError: () => toast.error("Không thêm được quyết định. Vui lòng thử lại."),
  });

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 md:p-8">
          <header className="space-y-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Gavel className="h-5 w-5 text-primary" aria-hidden />
              {t("nav.decisions")}
            </h1>
            <p className="text-sm text-muted-foreground">
              Chỉ quyết định và liên kết đã được người dùng xác nhận mới xuất hiện trên sơ đồ công việc. AI chỉ đề xuất.
            </p>
          </header>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Thêm quyết định</CardTitle>
              <CardDescription>Nhập quyết định thật của tổ chức; sau khi xác nhận sẽ lên sơ đồ và tìm kiếm.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                className="min-h-11"
                placeholder="Nội dung quyết định"
                value={newTitle}
                maxLength={200}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <Input
                className="min-h-11"
                placeholder="Diễn giải, bối cảnh (không bắt buộc)"
                value={newDetail}
                maxLength={4000}
                onChange={(e) => setNewDetail(e.target.value)}
              />
              <Button
                className="min-h-11"
                disabled={!newTitle.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Thêm quyết định
              </Button>
            </CardContent>
          </Card>


          <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <TabsList>
              <TabsTrigger value="CANDIDATE" className="min-h-11">
                Chờ xác nhận
              </TabsTrigger>
              <TabsTrigger value="CONFIRMED" className="min-h-11">
                Đã xác nhận
              </TabsTrigger>
              <TabsTrigger value="ALL" className="min-h-11">
                Tất cả
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải quyết định…</p>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Chưa có quyết định nào ở trạng thái này.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rows.map((d) => (
                <Card key={d.id} className="transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="text-base">{d.title}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span>Nguồn: {ORIGIN_LABEL[d.origin] ?? d.origin}</span>
                          {d.workspaceName ? <span>Dự án: {d.workspaceName}</span> : null}
                          <span>Cập nhật: {formatWhen(d.updatedAt)}</span>
                          <span>
                            Liên kết: {d.confirmedLinkCount}/{d.linkCount}
                          </span>
                        </CardDescription>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {d.detail ? (
                      <p className="line-clamp-3 text-sm text-muted-foreground">{d.detail}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="min-h-11"
                        disabled={d.status === "CONFIRMED" || confirmMut.isPending}
                        onClick={() => confirmMut.mutate({ decisionId: d.id, confirm: true })}
                      >
                        <Check className="mr-1.5 h-4 w-4" aria-hidden /> Xác nhận
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={d.status === "REJECTED" || confirmMut.isPending}
                        onClick={() => confirmMut.mutate({ decisionId: d.id, confirm: false })}
                      >
                        <X className="mr-1.5 h-4 w-4" aria-hidden /> Từ chối
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11"
                        disabled={d.status === "SUPERSEDED" || supersedeMut.isPending}
                        onClick={() => supersedeMut.mutate(d.id)}
                      >
                        Đánh dấu đã thay thế
                      </Button>
                      <Button size="sm" variant="secondary" className="min-h-11" onClick={() => setSelected(d)}>
                        <Link2 className="mr-1.5 h-4 w-4" aria-hidden /> Liên kết công việc
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? <DecisionLinksPanel decision={selected} onChanged={invalidate} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DecisionLinksPanel({ decision, onChanged }: { decision: DecisionRow; onChanged: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const fetchLinks = useServerFn(listDecisionLinks);
  const searchTasks = useServerFn(searchTasksForDecision);
  const linkFn = useServerFn(linkDecisionToTask);
  const confirmLinkFn = useServerFn(setDecisionLinkConfirmation);

  const links = useQuery({
    queryKey: ["decision-links", decision.id],
    queryFn: () => fetchLinks({ data: { decisionId: decision.id } }),
  });

  const tasks = useQuery({
    queryKey: ["decision-task-search", q],
    queryFn: () => searchTasks({ data: { query: q } }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["decision-links", decision.id] });
    onChanged();
  };

  const addMut = useMutation({
    mutationFn: (taskId: string) => linkFn({ data: { decisionId: decision.id, taskId, confirm: true } }),
    onSuccess: () => {
      toast.success("Đã nối quyết định với việc cần làm");
      refresh();
    },
    onError: () => toast.error("Không nối được. Vui lòng thử lại."),
  });

  const linkMut = useMutation({
    mutationFn: (v: { linkId: string; confirm: boolean }) => confirmLinkFn({ data: v }),
    onSuccess: () => {
      toast.success("Đã cập nhật liên kết");
      refresh();
    },
    onError: () => toast.error("Không cập nhật được. Vui lòng thử lại."),
  });

  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle className="text-left">{decision.title}</SheetTitle>
        <SheetDescription className="text-left">
          Liên kết đã xác nhận sẽ hiện trên sơ đồ công việc dưới dạng “được hiện thực thành”.
        </SheetDescription>
      </SheetHeader>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Liên kết hiện có</p>
        {links.isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        ) : (links.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có liên kết nào.</p>
        ) : (
          <ul className="space-y-2">
            {(links.data ?? []).map((l) => (
              <li key={l.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {SOURCE_LABEL[l.sourceType] ?? l.sourceType}
                      {l.subtitle ? ` · ${l.subtitle}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={l.status === "CONFIRMED" || linkMut.isPending}
                    onClick={() => linkMut.mutate({ linkId: l.id, confirm: true })}
                  >
                    <Check className="mr-1.5 h-4 w-4" aria-hidden /> Xác nhận
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    disabled={l.status === "REJECTED" || linkMut.isPending}
                    onClick={() => linkMut.mutate({ linkId: l.id, confirm: false })}
                  >
                    <X className="mr-1.5 h-4 w-4" aria-hidden /> Bỏ liên kết
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nối thêm việc cần làm</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm việc cần làm theo tên…"
            className="min-h-11 pl-9"
            aria-label="Tìm việc cần làm"
          />
        </div>
        {tasks.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang tìm…
          </p>
        ) : (tasks.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có việc phù hợp.</p>
        ) : (
          <ul className="space-y-2">
            {(tasks.data ?? []).map((tk) => (
              <li key={tk.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{tk.title}</p>
                  {tk.status ? <p className="text-xs text-muted-foreground">{tk.status}</p> : null}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-11"
                  disabled={addMut.isPending}
                  onClick={() => addMut.mutate(tk.id)}
                >
                  Nối
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
