import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, Loader2, Search, Users, Video, XCircle } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listMeetingHistory } from "@/lib/api/meeting-rooms.functions";

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

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(min: number) {
  if (min < 60) return `${min} phút`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}

function MeetingHistoryPage() {
  const [open, setOpen] = useSidebarState();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

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

  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar active="meetings" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="border-b border-border px-6 py-5">
          <Link
            to="/meeting"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại Họp
          </Link>
          <h1 className="text-2xl font-bold">Lịch sử cuộc họp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Các phòng họp đã kết thúc, kèm thời gian diễn ra và số người tham gia.
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 md:w-80">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Tìm theo tên phòng…"
              className="w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 px-6 py-5">
          {history.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải lịch sử…
            </div>
          ) : history.isError ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              Không tải được lịch sử cuộc họp.
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <p className="text-sm text-muted-foreground">
                {q ? "Không tìm thấy cuộc họp phù hợp." : "Chưa có cuộc họp nào kết thúc."}
              </p>
              <Link
                to="/meeting"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Video className="h-4 w-4" /> Tới trang Họp
              </Link>
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {items.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{m.title}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                            m.status === "ended"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {m.status === "ended" ? "Đã kết thúc" : "Đã hủy"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Phòng <span className="font-mono">mtg_{m.id.slice(0, 8)}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
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
                        {m.participantCount} người tham gia
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <div className="mt-5 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Trang {page + 1}/{totalPages} · {total} cuộc họp
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="rounded-lg border border-border bg-surface px-3 py-1.5 disabled:opacity-50"
                    >
                      Trước
                    </button>
                    <button
                      onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                      disabled={page + 1 >= totalPages}
                      className="rounded-lg border border-border bg-surface px-3 py-1.5 disabled:opacity-50"
                    >
                      Sau
                    </button>
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