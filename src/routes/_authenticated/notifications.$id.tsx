import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Archive,
  Bell,
  CheckCircle2,
  ChevronRight,
  Circle,
  ExternalLink,
  Trash2,
  X,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import { catMeta, mapNotifRow } from "@/lib/notifications-data";
import {
  deleteNotifications,
  getNotification,
  listNotifications,
  markNotificationsRead,
  setNotificationsArchived,
} from "@/lib/api/notifications.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications/$id")({
  head: () => ({
    meta: [
      { title: "Chi tiết thông báo — UNIWORK" },
      { name: "description", content: "Chi tiết thông báo trong UNIWORK." },
    ],
  }),
  notFoundComponent: NotificationNotFound,
  errorComponent: NotificationError,
  component: NotificationDetailPage,
});

function NotificationDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: row, isLoading, isError, error } = useQuery({
    queryKey: ["notification", id],
    queryFn: () => getNotification({ data: { id } }),
  });
  const { data: listRows = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notification", id] });
  };
  const readMut = useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead({ data: { ids } }),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (ids: string[]) => deleteNotifications({ data: { ids } }),
    onSuccess: invalidate,
  });

  const archived = ((row?.meta ?? {}) as Record<string, unknown>)["archived"] === true;
  const archiveMut = useMutation({
    mutationFn: () => setNotificationsArchived({ data: { ids: [id], archived: !archived } }),
    onSuccess: () => {
      invalidate();
      toast.success(archived ? "Đã bỏ lưu trữ thông báo" : "Đã lưu trữ thông báo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const list = useMemo(() => listRows.map(mapNotifRow), [listRows]);
  const notif = useMemo(() => (row ? mapNotifRow(row) : null), [row]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Đang tải…
      </div>
    );
  }
  if (isError) throw error instanceof Error ? error : new Error(String(error));
  if (!notif) return <NotificationNotFound />;

  const meta = catMeta(notif.cat);
  const Icon = meta.icon;
  const unread = !!notif.unread;

  const idx = list.findIndex((n) => n.id === notif.id);
  const prev = idx > 0 ? list[idx - 1] : undefined;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : undefined;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
          {/* Breadcrumb */}
          <nav className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link to="/notifications" className="hover:text-foreground">
              Thông báo
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className={`${meta.tint}`}>{meta.label}</span>
            <ChevronRight className="h-3 w-3" />
            <span className="truncate text-foreground/70">#{notif.id}</span>
          </nav>

          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              onClick={() => router.history.back()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
            </button>
            <div className="flex items-center gap-1.5">
              {unread ? (
                <button
                  onClick={() => readMut.mutate([notif.id])}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Đánh dấu đã đọc
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Đã đọc
                </span>
              )}
              <button
                onClick={() => archiveMut.mutate()}
                title={archived ? "Bỏ lưu trữ" : "Lưu trữ"}
                className="rounded-lg border border-border bg-surface p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
              <button
                title="Xóa"
                onClick={() => setConfirmOpen(true)}
                className="rounded-lg border border-border bg-surface p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Card */}
          <article className="overflow-hidden rounded-2xl border border-border bg-surface">
            <header className="flex items-start gap-3 border-b border-border p-5">
              <div className="relative shrink-0">
                {notif.actor ? (
                  <img
                    src={avatar(notif.actor)}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 ${meta.tint}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                )}
                {notif.actor && (
                  <span
                    className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background ring-2 ring-background ${meta.tint}`}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.tint}`}
                  >
                    <Icon className="h-3 w-3" /> {meta.label}
                  </span>
                  {notif.important && (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                      <AlertTriangle className="h-3 w-3" /> Quan trọng
                    </span>
                  )}
                  {unread && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                      <Circle className="h-2 w-2 fill-primary text-primary" /> Chưa đọc
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{notif.time}</span>
                </div>
                <h1 className="mt-2 text-lg font-semibold leading-snug">
                  {notif.actor && <span>{notif.actor} </span>}
                  <span className="text-foreground/90">{notif.title}</span>
                </h1>
                {notif.context && (
                  <p className="mt-1 text-xs text-muted-foreground">{notif.context}</p>
                )}
              </div>
            </header>

            <div className="space-y-5 p-5">
              <section>
                <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Nội dung
                </h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {notif.body}
                </p>
                {notif.link && (
                  <Link
                    to={notif.link.to}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    {notif.link.label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </section>

              {notif.details && notif.details.length > 0 && (
                <section>
                  <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Thông tin chi tiết
                  </h2>
                  <dl className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-surface-2/40 p-3 text-sm sm:grid-cols-2">
                    {notif.details.map((d: { label: string; value: string }) => (
                      <div key={d.label} className="flex flex-col">
                        <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {d.label}
                        </dt>
                        <dd className="font-medium text-foreground">{d.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {notif.actions && notif.actions.length > 0 && (
                <section className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  {notif.actions.map((a: { label: string; kind?: "primary" | "ghost" | "danger" }) => {
                    const cls =
                      a.kind === "primary"
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : a.kind === "danger"
                          ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
                          : "border border-border bg-surface hover:bg-surface-2";
                    return (
                      <button
                        key={a.label}
                        onClick={() => {
                          if (notif.link?.to) {
                            void router.navigate({ to: notif.link.to });
                          } else {
                            toast.info(a.label + ": không có liên kết đính kèm.");
                          }
                        }}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${cls}`}
                      >
                        {a.label}
                      </button>
                    );
                  })}
                </section>
              )}
            </div>
          </article>

          {/* Prev / Next */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {prev ? (
              <Link
                to="/notifications/$id"
                params={{ id: prev.id }}
                className="group flex items-center gap-2 rounded-xl border border-border bg-surface p-3 hover:bg-surface-2"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground">Trước đó</div>
                  <div className="truncate text-sm font-medium">{prev.title}</div>
                </div>
              </Link>
            ) : (
              <div />
            )}
            {next ? (
              <Link
                to="/notifications/$id"
                params={{ id: next.id }}
                className="group flex items-center justify-end gap-2 rounded-xl border border-border bg-surface p-3 text-right hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground">Tiếp theo</div>
                  <div className="truncate text-sm font-medium">{next.title}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ) : (
              <div />
            )}
          </div>
        </div>

        {/* Delete confirmation dialog */}
        {confirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-lg">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Xóa thông báo?</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Bạn có chắc muốn xóa thông báo này? Hành động này không thể hoàn tác.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
                >
                  Hủy
                </button>
                <button
                  onClick={() => {
                    deleteMut.mutate([notif.id], {
                      onSuccess: () => {
                        setConfirmOpen(false);
                        router.navigate({ to: "/notifications" });
                      },
                    });
                  }}
                  className="rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90"
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function NotificationNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
          <Bell className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold">Không tìm thấy thông báo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Thông báo này không tồn tại hoặc đã bị xóa
        </p>
        <Link
          to="/notifications"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Về danh sách thông báo
        </Link>
      </div>
    </div>
  );
}

function NotificationError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold">Đã xảy ra lỗi</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            reset();
            router.invalidate();
          }}
          className="mt-4 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}