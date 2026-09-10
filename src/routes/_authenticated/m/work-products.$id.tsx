import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getWorkDeliverable,
  getWorkDeliverableFollowState,
  listWorkDeliverableLinkedEntities,
  toggleWorkDeliverableFollow,
} from "@/lib/api/work-deliverables.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Bell,
  BellOff,
  CalendarClock,
  CheckSquare,
  ExternalLink,
  FileText,
  Files,
  Link2,
  MoreHorizontal,
  Share2,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import coverImage from "@/assets/work-product-cover.jpg";

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
        content: "Xem nội dung, công việc, tài liệu gắn kèm và lịch họp liên quan.",
      },
      { property: "og:title", content: "Chi tiết kết quả công việc · UNIWORK" },
      {
        property: "og:description",
        content: "Xem nội dung, công việc, tài liệu gắn kèm và lịch họp liên quan.",
      },
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

  const follow = useQuery({
    queryKey: ["m-work-product-follow", id],
    queryFn: () => getWorkDeliverableFollowState({ data: { id } } as any),
  });

  const followMut = useMutation({
    mutationFn: (next: boolean) => toggleWorkDeliverableFollow({ data: { id, follow: next } } as any),
    onSuccess: (res: any) => {
      toast.success(res?.following ? "Đang theo dõi cập nhật." : "Đã tắt theo dõi.");
      void qc.invalidateQueries({ queryKey: ["m-work-product-follow", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không cập nhật được theo dõi."),
  });

  const product = (data as any)?.product ?? (data as any);
  const versions = (data as any)?.versions ?? [];
  const linked = (links.data as any[]) ?? [];
  const tasks = linked.filter((l) => l.entityType === "TASK");
  const documents = linked.filter((l) => l.entityType === "DOCUMENT");
  const meetings = linked.filter((l) => l.entityType === "MEETING");
  const following = Boolean((follow.data as any)?.following);

  const url = typeof window !== "undefined" ? `${window.location.origin}/work-products/${id}` : "";

  const share = async () => {
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

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Đã sao chép liên kết.");
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
    <div className="flex min-h-full flex-col gap-4 pb-28">
      <div className="relative">
        <img
          src={coverImage}
          alt=""
          width={1024}
          height={512}
          className="h-36 w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        <button
          onClick={() => navigate({ to: "/m/work-products" })}
          className="absolute left-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm"
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4 px-4">
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

        <div className="flex gap-2">
          <Button asChild className="min-h-11 flex-1">
            <Link to="/work-products/$id" params={{ id }}>
              <ExternalLink className="mr-2 h-4 w-4" /> Mở
            </Link>
          </Button>
          <Button variant="outline" className="min-h-11 flex-1" onClick={share}>
            <Share2 className="mr-2 h-4 w-4" /> Chia sẻ
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="min-h-11 w-11" aria-label="Thêm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyLink}>
                <Link2 className="mr-2 h-4 w-4" /> Sao chép liên kết
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => followMut.mutate(!following)}>
                {following ? (
                  <BellOff className="mr-2 h-4 w-4" />
                ) : (
                  <Bell className="mr-2 h-4 w-4" />
                )}
                {following ? "Tắt theo dõi" : "Theo dõi cập nhật"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/m/work-products" })}>
                <Files className="mr-2 h-4 w-4" /> Tất cả kết quả công việc
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button
          variant={following ? "secondary" : "outline"}
          className="min-h-11"
          disabled={followMut.isPending}
          onClick={() => followMut.mutate(!following)}
        >
          {following ? <BellOff className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
          {following ? "Đang theo dõi cập nhật" : "Cập nhật theo dõi"}
          {((follow.data as any)?.followerCount ?? 0) > 0 && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              {(follow.data as any).followerCount}
            </Badge>
          )}
        </Button>

        {product.description && (
          <section className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-1 text-sm font-semibold">Tóm tắt</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CheckSquare className="h-4 w-4 text-muted-foreground" /> Công việc liên quan
            <Badge variant="outline" className="ml-auto text-[10px]">
              {tasks.length}
            </Badge>
          </h2>
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa gắn công việc nào.</p>
          ) : (
            <ul className="grid gap-2">
              {tasks.map((t) => (
                <li key={t.entityId}>
                  <Link
                    to="/tasks/$id"
                    params={{ id: t.entityId }}
                    className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {t.status && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {t.status}
                      </Badge>
                    )}
                  </Link>
                  {t.subtitle && (
                    <p className="px-3 pt-0.5 text-[11px] text-muted-foreground">{t.subtitle}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Files className="h-4 w-4 text-muted-foreground" /> Tài liệu gắn kèm
            <Badge variant="outline" className="ml-auto text-[10px]">
              {documents.length}
            </Badge>
          </h2>
          {documents.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa gắn tài liệu nào.</p>
          ) : (
            <ul className="grid gap-2">
              {documents.map((d) => (
                <li
                  key={d.entityId}
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{d.title}</span>
                  {d.subtitle && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{d.subtitle}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-muted-foreground" /> Lịch họp
            <Badge variant="outline" className="ml-auto text-[10px]">
              {meetings.length}
            </Badge>
          </h2>
          {meetings.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có cuộc họp liên quan.</p>
          ) : (
            <ul className="grid gap-2">
              {meetings.map((m) => (
                <li key={m.entityId}>
                  <Link
                    to="/meeting/$id"
                    params={{ id: m.entityId }}
                    className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                    {m.subtitle && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {m.subtitle}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

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
      </div>
    </div>
  );
}
