import { RelatedWorkPanel } from "@/components/work-graph/related-work-panel";
import { AskUniPanel } from "@/components/ai/ask-uni-panel";
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
  RotateCcw,
  Share2,
  Star,
  Upload,
  Users,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import {
  getDocument,
  updateDocument,
  uploadDocumentVersion,
} from "@/lib/api/documents.functions";
import {
  fileNameOf,
  formatBytes,
  getDocumentFileUrl,
  isStorageRef,
  uploadDocumentFile,
} from "@/lib/documents-storage";

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
  return fmtTimeImpl(v);
}

type DocVersion = {
  id: string;
  version: number;
  mime_type: string | null;
  size_bytes: number | null;
  comment: string | null;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
  storage_ref: unknown;
};

function fmtTimeImpl(v: string | null | undefined) {
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
      toast.success(t("doc.99"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [uploading, setUploading] = useState(false);
  const starKey = `documents.starred.${id}`;
  const [starred, setStarred] = useState(false);
  useEffect(() => {
    try {
      setStarred(window.localStorage.getItem(starKey) === "1");
    } catch {
      /* ignore */
    }
  }, [starKey]);
  const toggleStar = () => {
    setStarred((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(starKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      toast.success(next ? t("doc.100") : t("doc.101"));
      return next;
    });
  };

  const openFile = async (ref: unknown, download = false) => {
    try {
      const url = await getDocumentFileUrl(ref, { download });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Tải phiên bản mới: upload lên storage rồi ghi nhận version qua server fn.
  const uploadVersion = async (file: File | undefined) => {
    if (!file || !doc) return;
    setUploading(true);
    try {
      const up = await uploadDocumentFile({
        workspaceId: doc.workspace_id,
        documentKey: doc.id,
        file,
      });
      await uploadDocumentVersion({
        data: {
          documentId: doc.id,
          storageRef: up.storageRef,
          mimeType: up.mimeType,
          sizeBytes: up.sizeBytes,
          comment: file.name,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["document", id] });
      toast.success(t("doc.102"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  // Khôi phục: tạo phiên bản mới từ nội dung của một phiên bản cũ.
  const [restoring, setRestoring] = useState<string | null>(null);
  const restoreVersion = async (v: DocVersion) => {
    if (!doc || !isStorageRef(v.storage_ref)) return;
    if (!confirm(`Khôi phục nội dung phiên bản v${v.version} thành phiên bản mới?`)) return;
    setRestoring(v.id);
    try {
      await uploadDocumentVersion({
        data: {
          documentId: doc.id,
          storageRef: v.storage_ref,
          mimeType: v.mime_type ?? undefined,
          sizeBytes: v.size_bytes ?? 0,
          comment: `Khôi phục từ v${v.version}`,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["document", id] });
      toast.success(`Đã khôi phục từ v${v.version}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(null);
    }
  };

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
                  <p className="text-sm font-medium">{t("doc.103")}</p>
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
                      <IconBtn
                        icon={Star}
                        label={starred ? t("doc.104") : t("doc.105")}
                        active={starred}
                        onClick={toggleStar}
                      />
                      <IconBtn
                        icon={Share2}
                        label={t("doc.106")}
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(window.location.href)
                            .then(() => toast.success(t("doc.107")))
                            .catch(() => toast.error(t("doc.108")));
                        }}
                      />
                      <button
                        type="button"
                        title={t("doc.109")}
                        disabled={!isStorageRef(doc.storage_ref)}
                        onClick={() => void openFile(doc.storage_ref, true)}
                        className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <label
                        title={t("doc.110")}
                        className={`flex cursor-pointer items-center rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground ${uploading ? "pointer-events-none opacity-40" : ""}`}
                      >
                        {uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        <input
                          type="file"
                          className="hidden"
                          aria-label={t("doc.110")}
                          disabled={uploading}
                          onChange={(e) => {
                            void uploadVersion(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <IconBtn icon={MoreHorizontal} label={t("doc.48")} onClick={() => window.print()} />
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      aria-label={t("doc.111")}
                      className="w-full bg-transparent text-4xl font-bold tracking-tight focus:outline-none"
                    />
                    {title.trim() && title.trim() !== doc.title ? (
                      <button
                        onClick={() => saveTitle.mutate()}
                        disabled={saveTitle.isPending}
                        className="mt-2 shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {saveTitle.isPending ? t("doc.78") : t("doc.112")}
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
                    {isStorageRef(doc.storage_ref) ? (
                      <>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => void openFile(doc.storage_ref)}
                          className="underline decoration-dotted hover:text-foreground"
                        >
                          {fileNameOf(doc.storage_ref)} ({formatBytes(doc.size_bytes)})
                        </button>
                      </>
                    ) : null}
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
                    {doc.content?.trim() ? doc.content : t("doc.113")}
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
                {(docQuery.data.versions as DocVersion[]).map((v) => (
                  <li key={v.id} className="rounded-lg border border-border bg-surface p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-medium">
                        v{v.version}
                        {v.version === doc?.current_version ? (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Hiện tại
                          </span>
                        ) : null}
                      </span>
                      {isStorageRef(v.storage_ref) ? (
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            title={t("doc.114")}
                            onClick={() => void openFile(v.storage_ref, true)}
                            className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          {v.version !== doc?.current_version ? (
                            <button
                              type="button"
                              title={t("doc.115")}
                              disabled={restoring === v.id}
                              onClick={() => void restoreVersion(v)}
                              className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
                            >
                              {restoring === v.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {fmtTime(v.created_at)}
                      {v.size_bytes ? ` · ${formatBytes(v.size_bytes)}` : ""}
                    </div>
                    {v.author_name ? (
                      <div className="text-[11px] text-muted-foreground">{v.author_name}</div>
                    ) : null}
                    {v.comment ? (
                      <div className="mt-1 truncate text-[11px] text-muted-foreground" title={v.comment}>
                        {v.comment}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{t("doc.116")}</p>
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

            <div className="mt-6">
              <AskUniPanel
                rootEntity={{ type: "DOCUMENT", id }}
                label={t("doc.117")}
                suggestions={[
                  t("doc.118"),
                  t("doc.119"),
                  t("doc.120"),
                ]}
              />
            </div>

            <RelatedWorkPanel entityType="DOCUMENT" entityId={id} className="mt-6" />
          </aside>
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded-md p-2 hover:bg-surface-2 hover:text-foreground ${active ? "text-primary" : "text-muted-foreground"}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}