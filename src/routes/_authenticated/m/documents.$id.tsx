import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, History } from "lucide-react";
import { getDocument } from "@/lib/api/documents.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/m/documents/$id")({
  head: () => ({
    meta: [
      { title: "Chi tiết tài liệu — UNIWORK" },
      { name: "description", content: "Đọc tài liệu và lịch sử phiên bản trên điện thoại." },
      { property: "og:title", content: "Chi tiết tài liệu — UNIWORK" },
      { property: "og:description", content: "Đọc tài liệu và lịch sử phiên bản trên điện thoại." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileDocumentDetail,
});

function MobileDocumentDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ["m-document", id],
    queryFn: () => getDocument({ data: { documentId: id } }),
    retry: false,
  });
  if (detail.isLoading)
    return (
      <div className="p-4">
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  if (!detail.data)
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">Không thể mở tài liệu này.</p>
    );
  const { document, versions, workspace } = detail.data;
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 overflow-x-hidden p-4 pb-24">
      <header className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          onClick={() => void navigate({ to: "/m/documents" })}
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">Quay lại</span>
        </Button>
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold">{document.title}</h1>
          <p className="text-xs text-muted-foreground">{workspace?.name ?? document.folder}</p>
        </div>
      </header>
      <section className="min-w-0 rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <Badge variant="outline">{document.folder}</Badge>
        </div>
        <div className="whitespace-pre-wrap break-words text-sm leading-7">
          {document.content || "Tài liệu này chưa có nội dung văn bản."}
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" />
          Phiên bản <Badge variant="secondary">{versions.length}</Badge>
        </h2>
        <ul className="mt-3 grid gap-2">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex min-h-11 items-center justify-between rounded-xl bg-surface-2 px-3 text-sm"
            >
              <span>Phiên bản {version.version}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(version.created_at).toLocaleDateString("vi-VN")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
