// Giao diện riêng cho Kết quả công việc trên di động:
// xem nội dung đúng khuôn trình bày, tải xuống, chỉnh sửa / góp ý,
// và lưu phiên bản để chiếu sang Work Graph.
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  commentWorkDeliverable,
  getWorkDeliverable,
  getWorkDeliverableFollowState,
  listWorkDeliverableLinkedEntities,
  listWorkDeliverableLinks,
  resolveWorkDeliverableComment,
  saveWorkDeliverableVersion,
  toggleWorkDeliverableFollow,
  updateWorkDeliverable,
} from "@/lib/api/work-deliverables.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentPreview } from "@/components/work-products/document-preview";
import {
  ArrowLeft,
  Bell,
  BellOff,
  CalendarClock,
  CheckSquare,
  Download,
  ExternalLink,
  FileText,
  Files,
  Loader2,
  Network,
  Pencil,
  Save,
  Share2,
} from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";

const TASK_STATUS_LABEL: Record<string, string> = {
  TODO: "Cần làm",
  IN_PROGRESS: "Đang làm",
  BLOCKED: "Đang vướng",
  IN_REVIEW: "Chờ duyệt",
  DONE: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bản nháp",
  IN_REVIEW: "Đang duyệt",
  APPROVED: "Đã duyệt",
  PUBLISHED: "Đã phát hành",
  ARCHIVED: "Lưu trữ",
};

export const Route = createFileRoute("/_authenticated/m/work-products/$id")({
  head: () => ({
    meta: [
      { title: "Kết quả công việc · UNIWORK" },
      {
        name: "description",
        content: "Xem nội dung, tải xuống, góp ý và lưu kết quả công việc vào Work Graph.",
      },
      { property: "og:title", content: "Kết quả công việc · UNIWORK" },
      {
        property: "og:description",
        content: "Xem nội dung, tải xuống, góp ý và lưu kết quả công việc vào Work Graph.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MobileWorkProductDetail,
});

function MobileWorkProductDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["m-work-product", id],
    queryFn: () => getWorkDeliverable({ data: { id } } as any),
  });
  const links = useQuery({
    queryKey: ["m-work-product-links", id],
    queryFn: () => listWorkDeliverableLinkedEntities({ data: { id } } as any),
  });
  const graph = useQuery({
    queryKey: ["m-work-product-graph", id],
    queryFn: () => listWorkDeliverableLinks({ data: { id } } as any),
  });
  const follow = useQuery({
    queryKey: ["m-work-product-follow", id],
    queryFn: () => getWorkDeliverableFollowState({ data: { id } } as any),
  });

  const product = (data as any)?.product ?? null;
  const versions = (data as any)?.versions ?? [];
  const comments = ((data as any)?.comments ?? []) as any[];
  const canEdit = Boolean((data as any)?.canEdit);
  const linked = (links.data as any[]) ?? [];
  const tasks = linked.filter((l) => l.entityType === "TASK");
  const documents = linked.filter((l) => l.entityType === "DOCUMENT");
  const meetings = linked.filter((l) => l.entityType === "MEETING");
  const graphEdges = (graph.data as any[]) ?? [];
  const following = Boolean((follow.data as any)?.following);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (product && !editing) setDraft(product.content ?? "");
  }, [product?.id, product?.content, editing]);

  const followMut = useMutation({
    mutationFn: (next: boolean) =>
      toggleWorkDeliverableFollow({ data: { id, follow: next } } as any),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["m-work-product-follow", id] }),
  });

  // Lưu nội dung + ghi phiên bản → trigger chiếu bản ghi sang Work Graph.
  const saveMut = useMutation({
    mutationFn: async () => {
      await updateWorkDeliverable({ data: { id, content: draft } } as any);
      await saveWorkDeliverableVersion({
        data: {
          idempotencyKey: crypto.randomUUID(),
          id,
          summary: "Chỉnh sửa trên di động",
          aiGenerated: false,
        },
      } as any);
    },
    onSuccess: async () => {
      setEditing(false);
      toast.success("Đã lưu và ghi vào Work Graph.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["m-work-product", id] }),
        qc.invalidateQueries({ queryKey: ["m-work-product-graph", id] }),
      ]);
    },
    onError: (e: any) => toast.error(e?.message ?? "Chưa lưu được nội dung."),
  });

  const commentMut = useMutation({
    mutationFn: (body: string) =>
      commentWorkDeliverable({ data: { idempotencyKey: crypto.randomUUID(), id, body } } as any),
    onSuccess: async () => {
      setComment("");
      await qc.invalidateQueries({ queryKey: ["m-work-product", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Chưa gửi được góp ý."),
  });

  const resolveMut = useMutation({
    mutationFn: (input: { commentId: string; resolved: boolean }) =>
      resolveWorkDeliverableComment({
        data: { idempotencyKey: crypto.randomUUID(), ...input },
      } as any),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["m-work-product", id] }),
  });

  const download = () => {
    const content = (product?.content ?? "").trim();
    if (!content) {
      toast.error("Kết quả này chưa có nội dung để tải.");
      return;
    }
    const safe = String(product.title ?? "ket-qua-cong-viec")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    const blob = new Blob([`# ${product.title}\n\n${content}\n`], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe || "ket-qua-cong-viec"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/work-products/${id}` : "";
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: product?.title, url: shareUrl });
      else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Đã sao chép liên kết.");
      }
    } catch {
      /* người dùng hủy chia sẻ */
    }
  };

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>;
  if (error || !product)
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Không mở được kết quả công việc này.</p>
        <Button
          className="mt-3 min-h-11"
          variant="outline"
          onClick={() => navigate({ to: "/m/work-products" })}
        >
          Quay lại danh sách
        </Button>
      </div>
    );

  return (
    <div className="flex min-h-full w-full min-w-0 max-w-full flex-col gap-4 overflow-x-hidden px-4 pb-28 pt-4">
      <header className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
        <button
          onClick={() => navigate({ to: "/m/work-products" })}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface"
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold leading-tight">{product.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {product.business_type} · v{product.current_version ?? 1} ·{" "}
            {format(new Date(product.updated_at ?? product.created_at), "d MMM yyyy", {
              locale: vi,
            })}
          </p>
        </div>
        <Badge variant="secondary" className="col-span-2 w-fit">
          {STATUS_LABEL[product.status] ?? product.status}
        </Badge>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="outline" className="min-h-11" onClick={download}>
          <Download className="mr-2 h-4 w-4" /> Tải xuống
        </Button>
        <Button variant="outline" className="min-h-11" onClick={share}>
          <Share2 className="mr-2 h-4 w-4" /> Chia sẻ
        </Button>
        <Button
          variant={following ? "secondary" : "outline"}
          className="min-h-11"
          disabled={followMut.isPending}
          onClick={() => followMut.mutate(!following)}
        >
          {following ? <BellOff className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
          {following ? "Bỏ theo dõi" : "Theo dõi"}
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/work-products/$id" params={{ id }}>
            <ExternalLink className="mr-2 h-4 w-4" /> Bản đầy đủ
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="content" className="min-w-0">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="content" className="min-h-11">
            Nội dung
          </TabsTrigger>
          <TabsTrigger value="comments" className="min-h-11">
            Góp ý {comments.length > 0 ? `(${comments.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="graph" className="min-h-11">
            Work Graph
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="mt-4 space-y-3">
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {editing ? (
                <>
                  <Button
                    className="min-h-11"
                    disabled={saveMut.isPending}
                    onClick={() => saveMut.mutate()}
                  >
                    {saveMut.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Lưu & ghi vào Work Graph
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      setEditing(false);
                      setDraft(product.content ?? "");
                    }}
                  >
                    Hủy
                  </Button>
                </>
              ) : (
                <Button variant="outline" className="min-h-11" onClick={() => setEditing(true)}>
                  <Pencil className="mr-2 h-4 w-4" /> Chỉnh sửa
                </Button>
              )}
            </div>
          )}

          {editing ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[60vh] font-mono text-[13px]"
              aria-label="Nội dung kết quả công việc"
            />
          ) : product.content ? (
            <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-surface p-3">
              <DocumentPreview
                title={product.title}
                content={product.content}
                businessType={product.business_type as string}
                version={product.current_version}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Kết quả này chưa có nội dung.</p>
          )}

          {versions.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-semibold">Phiên bản</h2>
              <ul className="grid gap-2">
                {versions.slice(0, 5).map((v: any) => (
                  <li key={v.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      v{v.version}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {v.summary || v.title || "Cập nhật nội dung"}
                    </span>
                    {v.ai_generated && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        AI
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </TabsContent>

        <TabsContent value="comments" className="mt-4 space-y-3">
          <div className="space-y-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Viết góp ý cho kết quả này…"
              className="min-h-24"
              aria-label="Góp ý"
            />
            <Button
              className="min-h-11 w-full"
              disabled={!comment.trim() || commentMut.isPending}
              onClick={() => commentMut.mutate(comment.trim())}
            >
              Gửi góp ý
            </Button>
          </div>
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có góp ý nào.</p>
          ) : (
            <ul className="grid gap-2">
              {comments.map((c) => (
                <li key={c.id} className="rounded-2xl border border-border bg-surface p-3">
                  <p className="text-[13px] leading-relaxed">{c.body}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {c.authorName ?? "Thành viên"} ·{" "}
                      {format(new Date(c.created_at), "d MMM HH:mm", { locale: vi })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto min-h-11"
                      onClick={() =>
                        resolveMut.mutate({ commentId: c.id, resolved: !c.resolved_at })
                      }
                    >
                      {c.resolved_at ? "Mở lại" : "Đã xử lý"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="graph" className="mt-4 space-y-3">
          <section className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Network className="h-4 w-4 text-muted-foreground" /> Trong Work Graph
            </h2>
            <p className="text-xs text-muted-foreground">
              {graph.isLoading
                ? "Đang kiểm tra…"
                : graphEdges.length > 0
                  ? `Đã chiếu vào Work Graph với ${graphEdges.length} liên kết.`
                  : "Đã chiếu vào Work Graph, chưa có liên kết nào."}
            </p>
            {graphEdges.length > 0 && (
              <ul className="mt-2 grid gap-1.5">
                {graphEdges.slice(0, 20).map((e: any, i: number) => (
                  <li
                    key={e.id ?? `${e.relationshipType ?? e.relationship_type}-${e.entityId ?? i}`}
                    className="flex items-center gap-2 text-[13px]"
                  >
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {e.relationshipType ?? e.relationship_type}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate">
                      {e.title ?? e.entityTitle ?? e.entityType ?? e.entity_type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <GraphSection
            icon={<CheckSquare className="h-4 w-4 text-muted-foreground" />}
            title="Công việc liên quan"
            items={tasks}
            render={(t) => (
              <Link
                to="/tasks/$id"
                params={{ id: t.entityId }}
                className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {t.status && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {TASK_STATUS_LABEL[t.status] ?? t.status}
                  </Badge>
                )}
              </Link>
            )}
          />
          <GraphSection
            icon={<Files className="h-4 w-4 text-muted-foreground" />}
            title="Tài liệu gắn kèm"
            items={documents}
            render={(d) => (
              <Link
                to="/documents/$id"
                params={{ id: d.entityId }}
                className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
              </Link>
            )}
          />
          <GraphSection
            icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
            title="Cuộc họp liên quan"
            items={meetings}
            render={(m) => (
              <Link
                to="/meeting/$id"
                params={{ id: m.entityId }}
                className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{m.title}</span>
              </Link>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GraphSection({
  icon,
  title,
  items,
  render,
}: {
  icon: React.ReactNode;
  title: string;
  items: any[];
  render: (item: any) => React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
        <Badge variant="outline" className="ml-auto text-[10px]">
          {items.length}
        </Badge>
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có liên kết nào.</p>
      ) : (
        <ul className="grid min-w-0 gap-2">
          {items.map((item) => (
            <li key={item.entityId}>{render(item)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
