import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, Search, Users, Video, XCircle } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listMeetingHistory } from "@/lib/api/meeting-rooms.functions";
import { localeTag, useI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n-interpolate";

export const Route = createFileRoute("/meeting_/history")({
  head: () => ({
    meta: [
      { title: "Lịch sử cuộc họp · UNIWORK" },
      {
        name: "description",
        content:
          "Xem lại các cuộc họp đã kết thúc: thời gian diễn ra, thời lượng và số người tham gia theo từng phòng.",
      },
      { property: "og:title", content: "Lịch sử cuộc họp · UNIWORK" },
      {
        property: "og:description",
        content: "Danh sách phòng họp đã kết thúc kèm thời lượng và số người tham gia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MeetingHistoryPage,
});

const PAGE_SIZE = 20;

function MeetingHistoryPage() {
  const [open, setOpen] = useSidebarState();
  const { t, lang } = useI18n();
  const locale = localeTag(lang);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  // Chờ người dùng ngừng gõ rồi mới truy vấn, tránh gọi server mỗi phím.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(draft.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const history = useQuery({
    queryKey: ["meeting-history", q, page],
    queryFn: () =>
      listMeetingHistory({
        data: { search: q || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });

  const items = history.data?.items ?? [];
  const total = history.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const fmtDuration = (min: number) => {
    if (min < 60) return fmt(t("mtg.dur.min"), { m: min });
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? fmt(t("mtg.dur.hour"), { h }) : fmt(t("mtg.dur.hourMin"), { h, m });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="meetings" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="border-b border-border px-4 py-5 sm:px-6">
          <Link
            to="/meeting"
            className="mb-3 inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("mtg.h.back")}
          </Link>
          <h1 className="text-2xl font-semibold">{t("mtg.h.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("mtg.h.desc")}</p>

          <div className="relative mt-4 md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("mtg.h.search")}
              aria-label={t("mtg.h.searchLabel")}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 px-4 py-5 sm:px-6">
          {history.isLoading ? (
            <ul className="space-y-3" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <li key={i}>
                  <Skeleton className="h-[72px] rounded-xl" />
                </li>
              ))}
            </ul>
          ) : history.isError ? (
            <div className="rounded-xl border border-border p-8 text-center">
              <p className="text-sm text-foreground">{t("mtg.h.loadError")}</p>
              <Button variant="outline" className="mt-4" onClick={() => void history.refetch()}>
                {t("mtg.retry")}
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <p className="text-sm text-muted-foreground">
                {q ? t("mtg.h.noMatch") : t("mtg.h.empty")}
              </p>
              <Button asChild className="mt-4">
                <Link to="/meeting">
                  <Video className="h-4 w-4" /> {t("mtg.h.goMeetings")}
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {items.map((m) => (
                  <li key={m.id}>
                    <Link
                      to="/meeting/$id"
                      params={{ id: m.id }}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium">{m.title}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            m.status === "ended"
                              ? "bg-surface-2 text-muted-foreground"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {m.status === "ended" ? t("mtg.status.ended") : t("mtg.status.canceled")}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {fmtDateTime(m.startAt)} → {fmtDateTime(m.endAt)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          {m.status === "ended" ? (
                            <Video className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          {fmtDuration(m.durationMinutes)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          {fmt(t("mtg.h.participants"), { n: m.participantCount })}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {fmt(t("mtg.h.page"), { page: page + 1, total: totalPages, count: total })}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0 || history.isFetching}
                    >
                      {t("mtg.prev")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                      disabled={page + 1 >= totalPages || history.isFetching}
                    >
                      {t("mtg.next")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
