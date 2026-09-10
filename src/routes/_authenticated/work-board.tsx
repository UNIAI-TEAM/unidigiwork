// Bàn gắn nhanh: kéo tài liệu (Kết quả công việc) thả vào công việc trong bản đồ.
// Trên điện thoại: chạm chọn tài liệu rồi chạm công việc để gắn.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, FileText, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listWorkDeliverables, linkWorkDeliverable } from "@/lib/api/work-deliverables.functions";
import { listWorkGraphTargets } from "@/lib/api/work-graph.functions";
import { rankTasksForWorkProduct } from "@/lib/api/work-products-docx.functions";

export const Route = createFileRoute("/_authenticated/work-board")({
  head: () => ({
    meta: [
      { title: "Gắn nhanh tài liệu vào công việc · UNIWORK" },
      {
        name: "description",
        content: "Kéo tài liệu từ hộp việc thả vào công việc để gắn vào bản đồ công việc.",
      },
      { property: "og:title", content: "Gắn nhanh tài liệu vào công việc · UNIWORK" },
      {
        property: "og:description",
        content: "Kéo tài liệu từ hộp việc thả vào công việc để gắn vào bản đồ công việc.",
      },
    ],
  }),
  component: WorkBoardPage,
});

function WorkBoardPage() {
  const qc = useQueryClient();
  const [docQuery, setDocQuery] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const docs = useQuery({
    queryKey: ["work-board-docs", docQuery],
    queryFn: () =>
      listWorkDeliverables({ data: { search: docQuery, limit: 40 } }) as Promise<any[]>,
  });
  const tasks = useQuery({
    queryKey: ["work-board-tasks", taskQuery],
    queryFn: () =>
      listWorkGraphTargets({ data: { type: "TASK", q: taskQuery, limit: 30 } }) as Promise<any[]>,
  });

  const link = useMutation({
    mutationFn: (input: { docId: string; taskId: string }) =>
      linkWorkDeliverable({
        data: {
          id: input.docId,
          targetType: "TASK",
          targetId: input.taskId,
          relationship: "REFERENCES",
          idempotencyKey: crypto.randomUUID(),
        } as any,
      }),
    onSuccess: (_r, v) => {
      toast.success("Đã gắn tài liệu vào công việc");
      setPicked(null);
      void qc.invalidateQueries({ queryKey: ["work-deliverable-links", v.docId] });
      void qc.invalidateQueries({ queryKey: ["work-graph-overview"] });
    },
    onError: () => toast.error("Không gắn được tài liệu vào công việc"),
  });

  // Xếp hạng theo nội dung thật + trọng số nhận diện của tổ chức.
  const ranking = useQuery({
    enabled: Boolean(picked?.id),
    queryKey: ["work-board-rank", picked?.id, taskQuery],
    queryFn: () =>
      rankTasksForWorkProduct({
        data: { id: picked!.id, q: taskQuery || undefined, limit: 50 },
      }) as Promise<Array<{ taskId: string; score: number; reason: string }>>,
  });
  const rankMap = new Map((ranking.data ?? []).map((r) => [r.taskId, r]));
  const visibleTasks = [...((tasks.data ?? []) as any[])].sort(
    (a, b) => (rankMap.get(b.id)?.score ?? -1) - (rankMap.get(a.id)?.score ?? -1),
  );

  const drop = (taskId: string, docId?: string | null) => {
    const id = docId ?? picked?.id;
    if (!id) {
      toast.info("Chọn một tài liệu trước");
      return;
    }
    link.mutate({ docId: id, taskId });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Gắn nhanh tài liệu vào công việc</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kéo một tài liệu ở cột trái thả vào công việc ở cột phải. Trên điện thoại: chạm chọn tài
          liệu rồi chạm công việc.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-muted-foreground" /> Tài liệu trong hộp việc
          </h2>
          <Input
            value={docQuery}
            onChange={(e) => setDocQuery(e.target.value)}
            placeholder="Tìm tài liệu…"
            className="mb-3"
          />
          {docs.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : !docs.data?.length ? (
            <p className="text-sm text-muted-foreground">Chưa có tài liệu nào.</p>
          ) : (
            <ul className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
              {docs.data.map((d) => {
                const active = picked?.id === d.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/uniwork-work-product", d.id);
                        e.dataTransfer.effectAllowed = "link";
                        setPicked({ id: d.id, title: d.title });
                      }}
                      onClick={() => setPicked(active ? null : { id: d.id, title: d.title })}
                      className={`flex w-full min-h-11 cursor-grab items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        active ? "border-primary bg-primary/10" : "bg-surface hover:bg-muted/60"
                      }`}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{d.title}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {d.business_type}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CheckSquare className="h-4 w-4 text-muted-foreground" /> Công việc trong bản đồ
          </h2>
          <Input
            value={taskQuery}
            onChange={(e) => setTaskQuery(e.target.value)}
            placeholder="Tìm công việc…"
            className="mb-3"
          />
          {picked && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
              <Link2 className="h-3.5 w-3.5" />
              <span className="min-w-0 flex-1 truncate">Đang chọn: {picked.title}</span>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setPicked(null)}>
                Bỏ chọn
              </Button>
            </div>
          )}
          {picked && ranking.isFetching && (
            <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Đang chấm mức phù hợp theo nội dung tài
              liệu…
            </p>
          )}
          {tasks.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : !tasks.data?.length ? (
            <p className="text-sm text-muted-foreground">Chưa có công việc nào.</p>
          ) : (
            <ul className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
              {visibleTasks.map((t) => {
                const rank = rankMap.get(t.id);
                return (
                <li key={t.id}>
                  <button
                    type="button"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "link";
                      setOverId(t.id);
                    }}
                    onDragLeave={() => setOverId((v) => (v === t.id ? null : v))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setOverId(null);
                      drop(t.id, e.dataTransfer.getData("text/uniwork-work-product") || null);
                    }}
                    onClick={() => drop(t.id)}
                    disabled={link.isPending}
                    className={`flex w-full min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      overId === t.id
                        ? "border-primary bg-primary/10"
                        : "bg-surface hover:bg-muted/60"
                    }`}
                  >
                    <CheckSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {link.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t.subtitle && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {t.subtitle}
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
