import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getWorkDeliverable } from "@/lib/api/work-deliverables.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, FileText, Share2, User } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";

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
      { title: "Chi tiết kết quả công việc · UNIWORK" },
      {
        name: "description",
        content: "Xem nội dung, trạng thái và phiên bản của kết quả công việc.",
      },
      { property: "og:title", content: "Chi tiết kết quả công việc · UNIWORK" },
      {
        property: "og:description",
        content: "Xem nội dung, trạng thái và phiên bản của kết quả công việc.",
      },
    ],
  }),
  component: MobileWorkProductDetail,
});

function MobileWorkProductDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["m-work-product", id],
    queryFn: () => getWorkDeliverable({ data: { id } } as any),
  });

  const product = (data as any)?.product ?? (data as any);
  const versions = (data as any)?.versions ?? [];

  const share = async () => {
    const url = `${window.location.origin}/work-products/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: product?.title, url });
      else {
        await navigator.clipboard.writeText(url);
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
        <p className="text-sm text-muted-foreground">Không mở được tài liệu này.</p>
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
    <div className="flex min-h-full flex-col gap-4 p-4 pb-28">
      <button
        onClick={() => navigate({ to: "/m/work-products" })}
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Kết quả công việc
      </button>

      <header className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight">{product.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {product.business_type} · v{product.current_version ?? 1} ·{" "}
            {format(new Date(product.updated_at ?? product.created_at), "d MMM yyyy", {
              locale: vi,
            })}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {STATUS_LABEL[product.status] ?? product.status}
        </Badge>
      </header>

      {product.description && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-sm font-semibold">Tóm tắt</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Thông tin</h2>
        <dl className="grid gap-2 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <dt className="text-muted-foreground">Người tạo</dt>
            <dd className="ml-auto truncate">{product.ai_generated ? "AI" : "Thành viên"}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">Số phiên bản</dt>
            <dd className="ml-auto">{versions.length || (product.current_version ?? 1)}</dd>
          </div>
          {product.tags?.length ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {product.tags.map((t: string) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
        </dl>
      </section>

      {versions.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">Phiên bản gần đây</h2>
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

      <div className="sticky bottom-24 flex gap-2">
        <Button asChild className="min-h-12 flex-1">
          <Link to="/work-products/$id" params={{ id }}>
            <ExternalLink className="mr-2 h-4 w-4" /> Mở bản đầy đủ
          </Link>
        </Button>
        <Button variant="outline" className="min-h-12 flex-1" onClick={share}>
          <Share2 className="mr-2 h-4 w-4" /> Chia sẻ
        </Button>
      </div>
    </div>
  );
}
