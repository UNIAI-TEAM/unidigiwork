import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clock,
  Download,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Share2,
  Star,
  Users,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { getDocument, updateDocument } from "@/lib/api/documents.functions";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Tài liệu ${params.id} · UNIWORK` },
      {
        name: "description",
        content: "Chi tiết tài liệu, phiên bản và chia sẻ trong workspace UNIWORK.",
      },
    ],
  }),
  component: DocumentDetailPage,
});

function fmtTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DocumentDetailPage() {
  const { id } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const queryClient = useQueryClient();

  // Dữ liệu thật qua server fn (RLS áp dụng theo phiên đăng nhập).
  const docQuery = useQuery({
    queryKey: ["document", id],
    queryFn: () => getDocument({ data: { documentId: id } }),
    retry: false,
  });
  const doc = docQuery.data?.document;

  const [title, setTitle] = useState("");
  useEffect(() => {
    if (doc?.title) setTitle(doc.title);
  }, [doc?.title]);

  const saveTitle = useMutation({
    mutationFn: () =>
      updateDocument({
        data: {
          documentId: id,
          title: title.trim(),
          expectedRowVersion: doc?.row_version ?? undefined,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document", id] });
      toast.success("Đã lưu tiêu đề");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="documents" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 lg:px-12">
              <Link
                to="/documents"
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Tài liệu
              </Link>

              {docQuery.isLoading ? (
                <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải tài liệu…
                </div>
              ) : docQuery.isError || !doc ? (
                <div className="rounded-xl border border-border bg-surface p-8 text-center">
                  <p className="text-sm font-medium">Không tìm thấy tài liệu</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tài liệu không tồn tại hoặc bạn không có quyền truy cập.
                  </p>
                  <Link
                    to="/documents"
                    className="mt-4 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Quay lại danh sách
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{doc.folder}</span>
                      <span>/</span>
                      <span className="font-mono">{doc.id.slice(0, 8)}</span>
                      <span>·</span>
                      <Clock className="h-3 w-3" />
                      <span>Cập nhật {fmtTime(doc.updated_at)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <IconBtn icon={Star} />
                      <IconBtn icon={Share2} />
                      <IconBtn icon={Download} />
                      <IconBtn icon={MoreHorizontal} />
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      aria-label="Tiêu đề tài liệu"
                      className="w-full bg-transparent text-4xl font-bold tracking-tight focus:outline-none"
                    />
                    {title.trim() && title.trim() !== doc.title ? (
                      <button
                        onClick={() => saveTitle.mutate()}
                        disabled={saveTitle.isPending}
                        className="mt-2 shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {saveTitle.isPending ? "Đang lưu…" : "Lưu"}
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>{docQuery.data?.workspace?.name ?? "Workspace"}</span>
                    <span>·</span>
                    <span>{docQuery.data?.permissions.length ?? 0} chia sẻ</span>
                    <span>·</span>
                    <span>Phiên bản {doc.current_version}</span>
                    {doc.tags?.length ? (
                      <span className="flex flex-wrap gap-1">
                        {doc.tags.map((tg) => (
                          <span key={tg} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px]">
                            {tg}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </div>

                  <article className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {doc.content?.trim() ? doc.content : "Tài liệu này chưa có nội dung."}
                  </article>
                </>
              )}
            </div>
          </main>

          <aside className="hidden w-72 shrink-0 border-l border-border bg-surface/50 p-4 lg:block">
            <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
              Lịch sử phiên bản
            </h3>
            {docQuery.data?.versions.length ? (
              <ul className="space-y-2 text-sm">
                {docQuery.data.versions.map((v) => (
                  <li key={v.id} className="rounded-lg border border-border bg-surface p-2.5">
                    <div className="text-xs font-medium">v{v.version}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtTime(v.created_at)}</div>
                    {v.comment ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">{v.comment}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Chưa có phiên bản nào được tải lên.</p>
            )}

            <h3 className="mb-3 mt-6 text-xs font-semibold uppercase text-muted-foreground">
              Bình luận
            </h3>
            <div className="rounded-lg border border-border bg-surface p-3 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                Chưa có bình luận
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
      <Icon className="h-4 w-4" />
    </button>
  );
}