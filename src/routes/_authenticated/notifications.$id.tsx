import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useState } from "react";
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
import { catMeta, findNotif, NOTIFS, removeNotif } from "@/lib/notifications-data";

export const Route = createFileRoute("/_authenticated/notifications/$id")({
  head: ({ params }) => {
    const n = findNotif(params.id);
    const title = n ? `${n.actor ? n.actor + " " : ""}${n.title}` : "Chi tiết thông báo";
    return {
      meta: [
        { title: `${title} — UNIWORK` },
        {
          name: "description",
          content: n?.body ?? "Chi tiết thông báo trong UNIWORK.",
        },
      ],
    };
  },
  loader: ({ params }) => {
    const n = findNotif(params.id);
    if (!n) throw notFound();
    return { notif: n };
  },
  notFoundComponent: NotificationNotFound,
  errorComponent: NotificationError,
  component: NotificationDetailPage,
});

function NotificationDetailPage() {
  const { notif } = Route.useLoaderData();
  const router = useRouter();
  const meta = catMeta(notif.cat);
  const Icon = meta.icon;
  const [unread, setUnread] = useState(!!notif.unread);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Sibling navigation by id (uses module order)
  const idx = NOTIFS.findIndex((n) => n.id === notif.id);
  const prev = idx > 0 ? NOTIFS[idx - 1] : undefined;
  const next = idx >= 0 && idx < NOTIFS.length - 1 ? NOTIFS[idx + 1] : undefined;

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
                  onClick={() => {
                    setUnread(false);
                    notif.unread = false;
                  }}
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
                title="Lưu trữ"
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
          Thông báo này có thể đã bị xóa hoặc không tồn tại.
        </p>
        <Link
          to="/notifications"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Quay lại danh sách
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